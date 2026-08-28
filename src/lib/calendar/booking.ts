import type { AppSupabaseClient } from '@/lib/types/supabase-database';
import type { InboundClassification } from '@/lib/ai/commercial/schemas';
import type { Json } from '@/lib/types/database';
import {
  bookFirstCompatibleSlot,
  cancelAppointment,
  getActiveAppointmentForLead,
  listAvailableSlots,
  rescheduleAppointment,
  type BookAppointmentResult,
} from './service';
import { formatSlotForHuman, listAlternativeSlots, type SlotLike } from './slots';
import { recordOperatorAlert } from '@/lib/sales/reply-persist';
import { validateSalesTransition } from '@/lib/sales/states';

export type ConversationBookingOutcome =
  | {
      action: 'BOOKED' | 'RESCHEDULED';
      result: Extract<BookAppointmentResult, { ok: true }>;
      confirmationText: string;
    }
  | {
      action: 'CANCELLED';
      eventId: string;
    }
  | {
      action: 'NO_SLOT' | 'PROPOSE_ALTERNATIVES';
      message: string;
    }
  | {
      action: 'NONE';
    };

/** Normalizza i flag booking: evita che un cambio giorno finisca come follow_up_later. */
export function normalizeBookingClassification(
  c: InboundClassification,
): InboundClassification {
  const text = `${c.summary} ${c.preferredTimeHint ?? ''}`.toLowerCase();
  const looksReschedule =
    c.rescheduleAppointment ||
    /cambia (giorno|orario|data)|riprogramma|sposta|altro giorno|alternative/.test(text);
  const looksBooking =
    c.bookingAccepted ||
    c.bookingRequest ||
    c.intent === 'call_accept' ||
    looksReschedule;
  if (!looksBooking) return c;
  return {
    ...c,
    followUpLater: false,
    followUpAt: null,
    rescheduleAppointment: looksReschedule ? true : c.rescheduleAppointment,
    recommendedState:
      c.recommendedState === 'FOLLOW_UP_LATER'
        ? looksReschedule
          ? 'CALL_PROPOSED'
          : c.bookingAccepted
            ? 'CALL_BOOKED'
            : 'CALL_PROPOSED'
        : c.recommendedState,
  };
}

export function wantsImmediateBooking(c: InboundClassification): boolean {
  if (c.cancelAppointment || c.rescheduleAppointment) return false;
  if (c.bookingAccepted && c.bookingConfidence >= 0.6) return true;
  return false;
}

/**
 * Interesse esplicito a una chiamata/appuntamento (non basta avere slot liberi).
 * Usato per non proporre né fissare chiamate troppo presto.
 */
export function hasExplicitCallInterest(args: {
  classification: InboundClassification;
  inboundText?: string;
  memoryNextStep?: string | null;
  priorStates?: string[];
}): boolean {
  const c = args.classification;
  if (c.bookingAccepted || c.bookingRequest || c.intent === 'call_accept') return true;
  if (c.rescheduleAppointment || c.cancelAppointment) return true;
  const blob = [
    args.inboundText ?? '',
    c.summary,
    args.memoryNextStep ?? '',
    ...(args.priorStates ?? []),
  ]
    .join(' ')
    .toLowerCase();
  return /(si|sì).{0,20}(chiamata|call|appuntamento|ci sentiamo|fissiamo)|prenot|fissiamo|mi va bene.{0,20}(orario|giorno)|accetto|va bene (domani|luned|marted|mercoled|gioved|venerd)/i.test(
    blob,
  );
}

function hasSpecificTimeHint(hint: string | null): boolean {
  if (!hint?.trim()) return false;
  return /\d{1,2}[:.]\d{2}|\d{1,2}\s*(am|pm)|luned|marted|mercoled|gioved|venerd|sabat|domenic|\d{1,2}\s*\/\s*\d{1,2}/i.test(
    hint,
  );
}

function proposeAlternativesMessage(alternatives: SlotLike[]): string {
  const labels = alternatives.map((slot) => formatSlotForHuman(slot));
  if (labels.length === 1) {
    return `Va benissimo spostarla. Ho questo orario libero: ${labels[0]}. Ti va bene o preferisci un altro giorno?`;
  }
  return `Va benissimo spostarla. Orari liberi: ${labels.join('; ')}. Quale preferisci?`;
}

export async function applyConversationBooking(args: {
  admin: AppSupabaseClient;
  workspaceId: string;
  leadId: string;
  threadId: string;
  classification: InboundClassification;
  leadName?: string | null;
  /** Se true, non fissa né propone slot senza interesse/accettazione esplicita. */
  requireExplicitInterest?: boolean;
  inboundText?: string;
  memoryNextStep?: string | null;
}): Promise<ConversationBookingOutcome> {
  const c = normalizeBookingClassification(args.classification);
  const existing = await getActiveAppointmentForLead(args.admin, args.workspaceId, args.leadId);
  const title = `Chiamata · ${args.leadName?.trim() || 'Cliente'}`;
  const interestOk =
    !args.requireExplicitInterest ||
    hasExplicitCallInterest({
      classification: c,
      inboundText: args.inboundText,
      memoryNextStep: args.memoryNextStep,
    });

  if (c.cancelAppointment && existing) {
    await cancelAppointment(args.admin, args.workspaceId, existing.id);
    await args.admin.from('sales_thread_events').insert({
      workspace_id: args.workspaceId,
      thread_id: args.threadId,
      actor: 'SYSTEM',
      event_type: 'APPOINTMENT_CANCELLED',
      payload: { eventId: existing.id } as unknown as Json,
    });
    return { action: 'CANCELLED', eventId: existing.id };
  }

  if (c.rescheduleAppointment && existing) {
    const allSlots = await listAvailableSlots(args.admin, args.workspaceId, { limit: 40 });
    const excludeStartsAt = existing.starts_at ? [existing.starts_at] : [];
    const alternatives = listAlternativeSlots(allSlots, {
      excludeStartsAt,
      excludeSlotIds: existing.slot_id ? [existing.slot_id] : [],
      limit: 5,
    });

    const canAutoMove = hasSpecificTimeHint(c.preferredTimeHint) || c.bookingAccepted;
    if (canAutoMove && alternatives.length > 0) {
      const result = await rescheduleAppointment(args.admin, {
        workspaceId: args.workspaceId,
        eventId: existing.id,
        leadId: args.leadId,
        threadId: args.threadId,
        title,
        description: c.preferredTimeHint,
        source: 'AI',
        excludeStartsAt,
      });
      if (result.ok) {
        await markThreadBooked(args.admin, args.workspaceId, args.threadId, result);
        return {
          action: 'RESCHEDULED',
          result,
          confirmationText: `Ho riprogrammato la chiamata per ${result.label}. A presto.`,
        };
      }
    }

    if (alternatives.length > 0) {
      await args.admin
        .from('message_threads')
        .update({
          commercial_state: 'CALL_PROPOSED',
          next_step: 'Scegliere nuovo orario',
          updated_at: new Date().toISOString(),
        })
        .eq('id', args.threadId);
      return {
        action: 'PROPOSE_ALTERNATIVES',
        message: proposeAlternativesMessage(alternatives),
      };
    }

    await recordOperatorAlert({
      admin: args.admin,
      workspaceId: args.workspaceId,
      leadId: args.leadId,
      threadId: args.threadId,
      kind: 'calendar_no_slot',
      message: 'Attila: cliente vuole cambiare giorno, ma non ci sono slot alternativi',
    });
    await args.admin
      .from('message_threads')
      .update({
        commercial_state: 'CALL_PROPOSED',
        next_step: 'Aggiungere slot e ripropore',
        human_required_reason: null,
        assigned_mode: 'AI',
        updated_at: new Date().toISOString(),
      })
      .eq('id', args.threadId);
    return {
      action: 'NO_SLOT',
      message:
        'Va benissimo spostarla. Dimmi pure che giorni ti sono più comodi e ti propongo subito un orario libero.',
    };
  }

  if (!interestOk) {
    return { action: 'NONE' };
  }

  if (!wantsImmediateBooking(c)) {
    return { action: 'NONE' };
  }

  if (existing) {
    if (c.preferredTimeHint || /cambia|sposta|altro|alternativa/.test(c.summary.toLowerCase())) {
      return applyConversationBooking({
        ...args,
        classification: {
          ...c,
          rescheduleAppointment: true,
          bookingAccepted: Boolean(c.preferredTimeHint) || c.bookingAccepted,
        },
      });
    }
    return {
      action: 'BOOKED',
      result: {
        ok: true,
        eventId: existing.id,
        slot: {
          id: existing.slot_id ?? existing.id,
          starts_at: existing.starts_at ?? existing.due_at ?? new Date().toISOString(),
          ends_at: existing.ends_at ?? existing.starts_at ?? new Date().toISOString(),
          timezone: existing.timezone,
          status: 'BOOKED',
        },
        label: existing.starts_at
          ? new Intl.DateTimeFormat('it-IT', {
              dateStyle: 'full',
              timeStyle: 'short',
              timeZone: existing.timezone || 'Europe/Rome',
            }).format(new Date(existing.starts_at))
          : 'già fissata',
      },
      confirmationText: 'La chiamata risulta già fissata. Se serve, posso riprogrammarla.',
    };
  }

  const result = await bookFirstCompatibleSlot(args.admin, {
    workspaceId: args.workspaceId,
    leadId: args.leadId,
    threadId: args.threadId,
    title,
    description: c.preferredTimeHint,
    source: 'AI',
  });

  if (!result.ok) {
    await recordOperatorAlert({
      admin: args.admin,
      workspaceId: args.workspaceId,
      leadId: args.leadId,
      threadId: args.threadId,
      kind: 'calendar_no_slot',
      message: 'Attila: cliente pronto a fissare, ma nessun slot disponibile',
    });
    return {
      action: 'NO_SLOT',
      message:
        'Perfetto, sono d’accordo a fissare. Al momento non ho slot liberi in agenda: dimmi pure i giorni che preferisci e ti propongo un orario appena disponibile.',
    };
  }

  await markThreadBooked(args.admin, args.workspaceId, args.threadId, result);
  return {
    action: 'BOOKED',
    result,
    confirmationText: `Perfetto, ho fissato la chiamata per ${result.label}. Ti aspetto.`,
  };
}

async function markThreadBooked(
  admin: AppSupabaseClient,
  workspaceId: string,
  threadId: string,
  result: Extract<BookAppointmentResult, { ok: true }>,
): Promise<void> {
  const { data: thread } = await admin
    .from('message_threads')
    .select('commercial_state')
    .eq('id', threadId)
    .maybeSingle();
  const transition = validateSalesTransition(thread?.commercial_state, 'CALL_BOOKED');
  const state = transition.ok ? transition.state : 'CALL_BOOKED';
  await admin
    .from('message_threads')
    .update({
      commercial_state: state,
      next_step: `Appuntamento: ${result.label}`,
      next_step_at: result.slot.starts_at,
      status: 'OPEN',
      updated_at: new Date().toISOString(),
    })
    .eq('id', threadId);

  await admin.from('sales_thread_events').insert({
    workspace_id: workspaceId,
    thread_id: threadId,
    actor: 'SYSTEM',
    event_type: 'APPOINTMENT_BOOKED',
    payload: {
      eventId: result.eventId,
      slotId: result.slot.id,
      startsAt: result.slot.starts_at,
      endsAt: result.slot.ends_at,
      label: result.label,
    } as unknown as Json,
  });
}
