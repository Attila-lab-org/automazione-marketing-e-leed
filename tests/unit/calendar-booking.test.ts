import { describe, expect, it } from 'vitest';
import {
  addWeeksInTimeZone,
  findSlotForPreferredTime,
  formatSlotForHuman,
  listAlternativeSlots,
  listClosestAvailableSlots,
  pickFirstCompatibleSlot,
  resolvePreferredTimeHint,
  slotsForAiPrompt,
  wantsImmediateBooking,
} from '../../src/lib/calendar';
import { mockClassifyInbound, mockDraftReply } from '../../src/lib/ai/commercial/mock-impl';
import { validateSalesTransition } from '../../src/lib/sales/states';

describe('calendar slot selection', () => {
  const base = [
    {
      id: 's1',
      starts_at: '2026-08-26T09:00:00.000Z',
      ends_at: '2026-08-26T09:30:00.000Z',
      timezone: 'Europe/Rome',
      status: 'AVAILABLE' as const,
    },
    {
      id: 's2',
      starts_at: '2026-08-26T11:00:00.000Z',
      ends_at: '2026-08-26T11:30:00.000Z',
      timezone: 'Europe/Rome',
      status: 'BOOKED' as const,
    },
    {
      id: 's3',
      starts_at: '2026-08-27T10:00:00.000Z',
      ends_at: '2026-08-27T10:30:00.000Z',
      timezone: 'Europe/Rome',
      status: 'AVAILABLE' as const,
    },
  ];

  it('sceglie il primo slot AVAILABLE futuro', () => {
    const chosen = pickFirstCompatibleSlot(base, { nowIso: '2026-08-26T08:00:00.000Z' });
    expect(chosen?.id).toBe('s1');
  });

  it('salta gli slot già passati', () => {
    const chosen = pickFirstCompatibleSlot(base, { nowIso: '2026-08-26T10:00:00.000Z' });
    expect(chosen?.id).toBe('s3');
  });

  it('restituisce null senza disponibilità', () => {
    const chosen = pickFirstCompatibleSlot(
      base.map((s) => ({ ...s, status: 'BOOKED' as const })),
      { nowIso: '2026-08-26T08:00:00.000Z' },
    );
    expect(chosen).toBeNull();
  });

  it('formatta lo slot per umani e per GPT senza inventare orari', () => {
    expect(formatSlotForHuman(base[0])).toMatch(/26/);
    expect(slotsForAiPrompt(base, 2)).toHaveLength(2);
    expect(slotsForAiPrompt(base, 2)[0].id).toBe('s1');
  });

  it('interpreta domani alle 12 nel fuso Europe/Rome', () => {
    expect(
      resolvePreferredTimeHint('domani alle 12', {
        nowIso: '2026-08-28T12:07:00.000Z',
      }),
    ).toBe('2026-08-29T10:00:00.000Z');
  });

  it('sceglie soltanto lo slot che coincide con l’orario richiesto', () => {
    const slots = [
      {
        id: 'prima',
        starts_at: '2026-08-29T08:00:00.000Z',
        ends_at: '2026-08-29T08:30:00.000Z',
        timezone: 'Europe/Rome',
        status: 'AVAILABLE' as const,
      },
      {
        id: 'richiesta',
        starts_at: '2026-08-29T10:00:00.000Z',
        ends_at: '2026-08-29T10:30:00.000Z',
        timezone: 'Europe/Rome',
        status: 'AVAILABLE' as const,
      },
    ];
    expect(
      findSlotForPreferredTime(slots, 'domani alle 12', {
        nowIso: '2026-08-28T12:07:00.000Z',
      })?.id,
    ).toBe('richiesta');
  });

  it('propone gli slot reali più vicini quando quello richiesto manca', () => {
    const slots = [
      {
        id: 'lontano',
        starts_at: '2026-08-31T10:00:00.000Z',
        ends_at: '2026-08-31T10:30:00.000Z',
        timezone: 'Europe/Rome',
        status: 'AVAILABLE' as const,
      },
      {
        id: 'vicino',
        starts_at: '2026-08-29T11:00:00.000Z',
        ends_at: '2026-08-29T11:30:00.000Z',
        timezone: 'Europe/Rome',
        status: 'AVAILABLE' as const,
      },
    ];
    expect(
      listClosestAvailableSlots(slots, '2026-08-29T10:00:00.000Z', 2).map(
        (slot) => slot.id,
      ),
    ).toEqual(['vicino', 'lontano']);
  });

  it('mantiene l’ora locale nelle ripetizioni anche al cambio dell’ora', () => {
    expect(addWeeksInTimeZone('2026-10-23T10:00:00.000Z', 1)).toBe(
      '2026-10-30T11:00:00.000Z',
    );
  });
});

describe('booking intent signals', () => {
  it('riconosce accettazione esplicita', () => {
    const c = mockClassifyInbound('Ok fissiamo la chiamata');
    expect(c.bookingAccepted).toBe(true);
    expect(c.intent).toBe('call_accept');
    expect(wantsImmediateBooking(c)).toBe(true);
  });

  it('riconosce una richiesta di telefonata senza prenotare prima dell’orario', () => {
    const c = mockClassifyInbound('Vorrei fissare una telefonata');
    expect(c.bookingRequest).toBe(true);
    expect(c.bookingAccepted).toBe(false);
    expect(c.intent).toBe('call_accept');
  });

  it('riconosce domani alle 12 come accettazione di un orario', () => {
    const c = mockClassifyInbound('domani alle 12');
    expect(c.bookingRequest).toBe(true);
    expect(c.bookingAccepted).toBe(true);
    expect(c.preferredTimeHint).toBe('domani alle 12');
    expect(wantsImmediateBooking(c)).toBe(true);
  });

  it('riconosce cambio giorno come riprogrammazione', () => {
    const c = mockClassifyInbound('si cambia giorno');
    expect(c.rescheduleAppointment).toBe(true);
    expect(c.followUpLater).toBe(false);
    expect(wantsImmediateBooking(c)).toBe(false);
  });

  it('non ripropone lo stesso orario come unica alternativa', () => {
    const same = {
      id: 's1',
      starts_at: '2026-08-26T11:19:00.000Z',
      ends_at: '2026-08-26T11:49:00.000Z',
      timezone: 'Europe/Rome',
      status: 'AVAILABLE' as const,
    };
    const other = {
      id: 's2',
      starts_at: '2026-08-27T09:00:00.000Z',
      ends_at: '2026-08-27T09:30:00.000Z',
      timezone: 'Europe/Rome',
      status: 'AVAILABLE' as const,
    };
    const alts = listAlternativeSlots([same, other], {
      excludeStartsAt: ['2026-08-26T11:19:00.000Z'],
      nowIso: '2026-08-25T10:00:00.000Z',
    });
    expect(alts.map((s) => s.id)).toEqual(['s2']);
  });

  it('propone solo slot reali nella bozza', () => {
    const draft = mockDraftReply({
      classification: mockClassifyInbound('Vorrei una chiamata'),
      playbookName: 'Attila',
      pricingAllowed: false,
      allowedFeatures: [],
      availableSlots: [
        {
          id: 's1',
          label: 'mercoledì 26 agosto, 11:00–11:30',
          startsAt: '2026-08-26T09:00:00.000Z',
          endsAt: '2026-08-26T09:30:00.000Z',
        },
      ],
    });
    expect(draft.text).toContain('mercoledì 26 agosto');
    expect(draft.recommendedState).toBe('CALL_PROPOSED');
  });

  it('non promette orari senza slot', () => {
    const draft = mockDraftReply({
      classification: mockClassifyInbound('Vorrei una chiamata'),
      playbookName: 'Attila',
      pricingAllowed: false,
      allowedFeatures: [],
      availableSlots: [],
    });
    expect(draft.text.toLowerCase()).toContain('non ho slot');
  });

  it('permette INTERESTED → CALL_BOOKED', () => {
    expect(validateSalesTransition('INTERESTED', 'CALL_BOOKED').ok).toBe(true);
  });
});
