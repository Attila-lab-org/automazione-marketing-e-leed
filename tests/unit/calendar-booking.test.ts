import { describe, expect, it } from 'vitest';
import {
  formatSlotForHuman,
  pickFirstCompatibleSlot,
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
});

describe('booking intent signals', () => {
  it('riconosce accettazione esplicita', () => {
    const c = mockClassifyInbound('Ok fissiamo la chiamata');
    expect(c.bookingAccepted).toBe(true);
    expect(c.intent).toBe('call_accept');
    expect(wantsImmediateBooking(c)).toBe(true);
  });

  it('non prenota su sola richiesta senza accettazione forte', () => {
    const c = mockClassifyInbound('Vorrei una chiamata');
    expect(c.bookingRequest).toBe(true);
    expect(wantsImmediateBooking(c)).toBe(false);
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
