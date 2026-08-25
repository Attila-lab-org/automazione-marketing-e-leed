import type { AppSupabaseClient } from '@/lib/types/supabase-database';
import type { InboundClassification } from '@/lib/ai/commercial/schemas';
import type { Json } from '@/lib/types/database';
import {
  bookFirstCompatibleSlot,
  cancelAppointment,
  getActiveAppointmentForLead,
  rescheduleAppointment,
  type BookAppointmentResult,
} from './service';
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
      action: 'NO_SLOT';
      message: string;
    }
  | {
      action: 'NONE';
    };

export function wantsImmediateBooking(c: InboundClassification): boolean {
  if (c.cancelAppointment || c.rescheduleAppointment) return false;
  // Prenota solo su consenso chiaro: non basta chiedere info su una chiamata.
  if (c.bookingAccepted && c.bookingConfidence >= 0.6) return true;
  return false;
}

export async function applyConversationBooking(args: {
  admin: AppSupabaseClient;
  workspaceId: string;
  leadId: string;
  threadId: string;
  classification: InboundClassification;
  leadName?: string | null;
}): Promise<ConversationBookingOutcome> {
  const c = args.classification;
  const existing = await getActiveAppointmentForLead(args.admin, args.workspaceId, args.leadId);
  const title = `Chiamata · ${args.leadName?.trim() || 'Cliente'}`;

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

  if (c.rescheduleAppointment) {
    if (existing) {
      const result = await rescheduleAppointment(args.admin, {
        workspaceId: args.workspaceId,
        eventId: existing.id,
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
          message: 'Attila: riprogrammazione fallita — nessuno slot disponibile',
        });
        return {
          action: 'NO_SLOT',
          message:
            'Al momento non ho altri orari liberi in agenda. Ti ricontatto appena si libera uno slot.',
        };
      }
      await markThreadBooked(args.admin, args.workspaceId, args.threadId, result);
      return {
        action: 'RESCHEDULED',
        result,
        confirmationText: `Ho riprogrammato la chiamata per ${result.label}. A presto.`,
      };
    }
  }

  if (!wantsImmediateBooking(c)) {
    return { action: 'NONE' };
  }

  if (existing) {
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
        'Perfetto, sono d’accordo a fissare. Al momento non ho slot liberi in agenda: ti propongo un orario appena se ne libera uno.',
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
