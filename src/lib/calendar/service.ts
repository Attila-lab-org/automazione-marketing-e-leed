import type { AppSupabaseClient } from '@/lib/types/supabase-database';
import type {
  CalendarAvailabilitySlotInsert,
  CalendarAvailabilitySlotRow,
  CalendarEventInsert,
  CalendarEventRow,
  CalendarEventSource,
  CalendarEventType,
  Json,
} from '@/lib/types/database';
import { SupabaseJobQueue } from '@/lib/jobs/supabase-queue';
import {
  addDaysIso,
  formatSlotForHuman,
  enumerateWorkingHoursSlots,
  pickFirstCompatibleSlot,
  slotWindowsOverlap,
  CALENDAR_TIMEZONE,
  WORKING_HOURS_HORIZON_DAYS,
  WORKING_HOURS_SLOT_NOTE,
  type SlotLike,
} from './slots';

export type BookAppointmentResult =
  | {
      ok: true;
      eventId: string;
      slot: SlotLike;
      label: string;
    }
  | {
      ok: false;
      reason: 'NO_SLOT' | 'SLOT_UNAVAILABLE' | 'RPC_ERROR';
      detail?: string;
    };

async function scheduleReminderJob(
  admin: AppSupabaseClient,
  workspaceId: string,
  event: Pick<CalendarEventRow, 'id' | 'reminder_at' | 'lead_id'>,
): Promise<void> {
  if (!event.reminder_at) return;
  const queue = new SupabaseJobQueue(admin);
  await queue.enqueue({
    workspaceId,
    jobType: 'CALENDAR_REMINDER',
    entityType: 'calendar_event',
    entityId: event.id,
    idempotencyKey: `CALENDAR_REMINDER:event:${event.id}`,
    inputSnapshot: {
      eventId: event.id,
      leadId: event.lead_id,
      reminderAt: event.reminder_at,
    },
    priority: 40,
    notBefore: new Date(event.reminder_at),
  });
}

export async function ensureWorkingHoursSlots(
  admin: AppSupabaseClient,
  workspaceId: string,
  opts?: { fromIso?: string; toIso?: string; nowIso?: string },
): Promise<{ inserted: number }> {
  const fromIso = opts?.fromIso ?? new Date().toISOString();
  const toIso = opts?.toIso ?? addDaysIso(fromIso, WORKING_HOURS_HORIZON_DAYS);
  const windows = enumerateWorkingHoursSlots({
    fromIso,
    toIso,
    nowIso: opts?.nowIso ?? new Date().toISOString(),
  });
  if (windows.length === 0) return { inserted: 0 };

  const [{ data: existing, error: existingError }, { data: events, error: eventsError }] =
    await Promise.all([
      admin
        .from('calendar_availability_slots')
        .select('id, starts_at, ends_at, status')
        .eq('workspace_id', workspaceId)
        .gte('starts_at', fromIso)
        .lt('starts_at', toIso),
      admin
        .from('calendar_events')
        .select('id, starts_at, ends_at')
        .eq('workspace_id', workspaceId)
        .eq('event_type', 'APPOINTMENT')
        .eq('status', 'SCHEDULED')
        .gte('starts_at', fromIso)
        .lt('starts_at', toIso),
    ]);
  if (existingError) throw new Error(`Slot orario di lavoro: ${existingError.message}`);
  if (eventsError) throw new Error(`Appuntamenti orario di lavoro: ${eventsError.message}`);

  const taken = new Set(
    (existing ?? []).map((row) => `${row.starts_at}|${row.ends_at}`),
  );
  const appointments = (events ?? []).filter(
    (row): row is { id: string; starts_at: string; ends_at: string } =>
      typeof row.starts_at === 'string' && typeof row.ends_at === 'string',
  );

  const rows = windows
    .filter((window) => !taken.has(`${window.startsAt}|${window.endsAt}`))
    .filter(
      (window) =>
        !appointments.some((event) =>
          slotWindowsOverlap(window.startsAt, window.endsAt, event.starts_at, event.ends_at),
        ),
    )
    .map((window) => ({
      workspace_id: workspaceId,
      starts_at: window.startsAt,
      ends_at: window.endsAt,
      timezone: CALENDAR_TIMEZONE,
      status: 'AVAILABLE' as const,
      note: WORKING_HOURS_SLOT_NOTE,
    }));

  if (rows.length === 0) return { inserted: 0 };

  let inserted = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const { data, error } = await admin
      .from('calendar_availability_slots')
      .upsert(chunk, {
        onConflict: 'workspace_id,starts_at,ends_at',
        ignoreDuplicates: true,
      })
      .select('id');
    if (error) throw new Error(`Apertura orari di lavoro: ${error.message}`);
    inserted += data?.length ?? 0;
  }
  return { inserted };
}

async function occupyOverlappingAvailableSlots(
  admin: AppSupabaseClient,
  workspaceId: string,
  event: Pick<CalendarEventRow, 'id' | 'event_type' | 'starts_at' | 'ends_at' | 'slot_id'>,
): Promise<void> {
  if (event.event_type !== 'APPOINTMENT' || !event.starts_at || !event.ends_at) return;
  const { data: slots, error } = await admin
    .from('calendar_availability_slots')
    .select('id, starts_at, ends_at, status')
    .eq('workspace_id', workspaceId)
    .eq('status', 'AVAILABLE')
    .lt('starts_at', event.ends_at)
    .gt('ends_at', event.starts_at);
  if (error) throw new Error(`Occupazione orari: ${error.message}`);
  const overlapping = slots ?? [];
  if (overlapping.length === 0) return;
  const chosen =
    overlapping.find((row) => row.starts_at === event.starts_at) ?? overlapping[0];
  const { error: updateError } = await admin
    .from('calendar_availability_slots')
    .update({
      status: 'BOOKED',
      booked_event_id: event.id,
      updated_at: new Date().toISOString(),
    })
    .eq('workspace_id', workspaceId)
    .eq('id', chosen.id);
  if (updateError) throw new Error(`Occupazione orari: ${updateError.message}`);
  if (!event.slot_id) {
    await admin
      .from('calendar_events')
      .update({ slot_id: chosen.id, updated_at: new Date().toISOString() })
      .eq('id', event.id)
      .eq('workspace_id', workspaceId);
  }
}

export async function listAvailableSlots(
  admin: AppSupabaseClient,
  workspaceId: string,
  opts?: { fromIso?: string; limit?: number },
): Promise<CalendarAvailabilitySlotRow[]> {
  const fromIso = opts?.fromIso ?? new Date().toISOString();
  const limit = opts?.limit ?? 40;
  await ensureWorkingHoursSlots(admin, workspaceId, { fromIso });
  const { data, error } = await admin
    .from('calendar_availability_slots')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('status', 'AVAILABLE')
    .gte('starts_at', fromIso)
    .order('starts_at', { ascending: true })
    .limit(limit);
  if (error) throw new Error(`Slot disponibili: ${error.message}`);
  return (data ?? []) as CalendarAvailabilitySlotRow[];
}

export async function listSlotsInRange(
  admin: AppSupabaseClient,
  workspaceId: string,
  fromIso: string,
  toIso: string,
): Promise<CalendarAvailabilitySlotRow[]> {
  await ensureWorkingHoursSlots(admin, workspaceId, { fromIso, toIso });
  const { data, error } = await admin
    .from('calendar_availability_slots')
    .select('*')
    .eq('workspace_id', workspaceId)
    .gte('starts_at', fromIso)
    .lte('starts_at', toIso)
    .order('starts_at', { ascending: true });
  if (error) throw new Error(`Slot calendario: ${error.message}`);
  return (data ?? []) as CalendarAvailabilitySlotRow[];
}

export async function createAvailabilitySlot(
  admin: AppSupabaseClient,
  input: CalendarAvailabilitySlotInsert,
): Promise<CalendarAvailabilitySlotRow> {
  if (new Date(input.ends_at).getTime() <= new Date(input.starts_at).getTime()) {
    throw new Error('Lo slot deve terminare dopo l’inizio');
  }
  const { data, error } = await admin
    .from('calendar_availability_slots')
    .insert({
      workspace_id: input.workspace_id,
      starts_at: input.starts_at,
      ends_at: input.ends_at,
      timezone: input.timezone ?? 'Europe/Rome',
      status: input.status ?? 'AVAILABLE',
      note: input.note ?? null,
    })
    .select('*')
    .single();
  if (error || !data) {
    const duplicate = error?.code === '23505' || /duplicate|unique/i.test(error?.message ?? '');
    if (duplicate) {
      const { data: existing } = await admin
        .from('calendar_availability_slots')
        .select('*')
        .eq('workspace_id', input.workspace_id)
        .eq('starts_at', input.starts_at)
        .eq('ends_at', input.ends_at)
        .maybeSingle();
      if (existing?.status === 'AVAILABLE') return existing as CalendarAvailabilitySlotRow;
      if (existing?.status === 'BLOCKED') {
        return updateAvailabilitySlot(admin, input.workspace_id, existing.id, {
          status: 'AVAILABLE',
          note: input.note ?? existing.note,
        });
      }
      throw new Error('Quell’orario è già occupato da un appuntamento.');
    }
    throw new Error(`Creazione slot: ${error?.message ?? 'fallita'}`);
  }
  return data as CalendarAvailabilitySlotRow;
}

export async function updateAvailabilitySlot(
  admin: AppSupabaseClient,
  workspaceId: string,
  slotId: string,
  patch: Partial<Pick<CalendarAvailabilitySlotRow, 'starts_at' | 'ends_at' | 'timezone' | 'status' | 'note'>>,
): Promise<CalendarAvailabilitySlotRow> {
  const { data, error } = await admin
    .from('calendar_availability_slots')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('workspace_id', workspaceId)
    .eq('id', slotId)
    .select('*')
    .single();
  if (error || !data) throw new Error(`Aggiornamento slot: ${error?.message ?? 'fallito'}`);
  return data as CalendarAvailabilitySlotRow;
}

export async function deleteAvailabilitySlot(
  admin: AppSupabaseClient,
  workspaceId: string,
  slotId: string,
): Promise<void> {
  const { data, error } = await admin
    .from('calendar_availability_slots')
    .update({
      status: 'BLOCKED',
      note: 'chiuso a mano',
      updated_at: new Date().toISOString(),
    })
    .eq('workspace_id', workspaceId)
    .eq('id', slotId)
    .eq('status', 'AVAILABLE')
    .select('id')
    .maybeSingle();
  if (error) throw new Error(`Chiusura orario: ${error.message}`);
  if (!data) throw new Error('Questo orario non è più libero.');
}

export async function bookSlotAtomic(
  admin: AppSupabaseClient,
  args: {
    workspaceId: string;
    slotId: string;
    leadId: string;
    threadId: string | null;
    title: string;
    description?: string | null;
    source?: CalendarEventSource;
  },
): Promise<BookAppointmentResult> {
  const { data, error } = await admin.rpc('book_calendar_slot', {
    p_workspace_id: args.workspaceId,
    p_slot_id: args.slotId,
    p_lead_id: args.leadId,
    p_thread_id: args.threadId,
    p_title: args.title,
    p_description: args.description ?? null,
    p_source: args.source ?? 'AI',
  });
  if (error) {
    const msg = error.message ?? '';
    if (msg.includes('calendar_slot_unavailable')) {
      return { ok: false, reason: 'SLOT_UNAVAILABLE', detail: msg };
    }
    if (msg.includes('calendar_slot_not_found')) {
      return { ok: false, reason: 'NO_SLOT', detail: msg };
    }
    return { ok: false, reason: 'RPC_ERROR', detail: msg };
  }
  const eventId = typeof data === 'string' ? data : String(data);
  const { data: slot } = await admin
    .from('calendar_availability_slots')
    .select('*')
    .eq('id', args.slotId)
    .maybeSingle();
  if (!slot) return { ok: false, reason: 'RPC_ERROR', detail: 'evento creato ma slot mancante' };
  const typed = slot as CalendarAvailabilitySlotRow;
  return {
    ok: true,
    eventId,
    slot: typed,
    label: formatSlotForHuman(typed),
  };
}

export async function bookFirstCompatibleSlot(
  admin: AppSupabaseClient,
  args: {
    workspaceId: string;
    leadId: string;
    threadId: string | null;
    title: string;
    description?: string | null;
    source?: CalendarEventSource;
    afterIso?: string | null;
    excludeStartsAt?: string[];
    excludeSlotIds?: string[];
  },
): Promise<BookAppointmentResult> {
  const slots = await listAvailableSlots(admin, args.workspaceId, { limit: 50 });
  const chosen = pickFirstCompatibleSlot(slots, {
    afterIso: args.afterIso,
    excludeStartsAt: args.excludeStartsAt,
    excludeSlotIds: args.excludeSlotIds,
  });
  if (!chosen) return { ok: false, reason: 'NO_SLOT' };
  return bookSlotAtomic(admin, {
    workspaceId: args.workspaceId,
    slotId: chosen.id,
    leadId: args.leadId,
    threadId: args.threadId,
    title: args.title,
    description: args.description,
    source: args.source,
  });
}

export async function cancelAppointment(
  admin: AppSupabaseClient,
  workspaceId: string,
  eventId: string,
): Promise<boolean> {
  const { data, error } = await admin.rpc('cancel_calendar_appointment', {
    p_workspace_id: workspaceId,
    p_event_id: eventId,
  });
  if (error) throw new Error(`Annullamento appuntamento: ${error.message}`);
  await admin
    .from('calendar_availability_slots')
    .update({
      status: 'AVAILABLE',
      booked_event_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq('workspace_id', workspaceId)
    .eq('booked_event_id', eventId)
    .eq('status', 'BOOKED');
  return Boolean(data);
}

export async function rescheduleAppointment(
  admin: AppSupabaseClient,
  args: {
    workspaceId: string;
    eventId: string;
    leadId: string;
    threadId: string | null;
    title: string;
    description?: string | null;
    source?: CalendarEventSource;
    afterIso?: string | null;
    excludeStartsAt?: string[];
    slotId?: string;
  },
): Promise<BookAppointmentResult> {
  const { data: previous } = await admin
    .from('calendar_events')
    .select('starts_at, slot_id')
    .eq('workspace_id', args.workspaceId)
    .eq('id', args.eventId)
    .maybeSingle();
  const excludeStartsAt = [
    ...(args.excludeStartsAt ?? []),
    ...(previous?.starts_at ? [previous.starts_at] : []),
  ];
  await cancelAppointment(admin, args.workspaceId, args.eventId);
  if (args.slotId) {
    return bookSlotAtomic(admin, {
      workspaceId: args.workspaceId,
      slotId: args.slotId,
      leadId: args.leadId,
      threadId: args.threadId,
      title: args.title,
      description: args.description,
      source: args.source ?? 'HUMAN',
    });
  }
  return bookFirstCompatibleSlot(admin, {
    workspaceId: args.workspaceId,
    leadId: args.leadId,
    threadId: args.threadId,
    title: args.title,
    description: args.description,
    source: args.source ?? 'HUMAN',
    afterIso: args.afterIso,
    excludeStartsAt,
    excludeSlotIds: previous?.slot_id ? [previous.slot_id] : undefined,
  });
}

export async function createCalendarEvent(
  admin: AppSupabaseClient,
  input: CalendarEventInsert,
): Promise<CalendarEventRow> {
  const { data, error } = await admin
    .from('calendar_events')
    .insert({
      ...input,
      timezone: input.timezone ?? 'Europe/Rome',
      status: input.status ?? 'SCHEDULED',
      source: input.source ?? 'HUMAN',
      metadata: (input.metadata ?? {}) as Json,
    })
    .select('*')
    .single();
  if (error || !data) throw new Error(`Creazione evento: ${error?.message ?? 'fallita'}`);
  const event = data as CalendarEventRow;
  await occupyOverlappingAvailableSlots(admin, event.workspace_id, event);
  await scheduleReminderJob(admin, event.workspace_id, event);
  return event;
}

export async function updateCalendarEvent(
  admin: AppSupabaseClient,
  workspaceId: string,
  eventId: string,
  patch: Partial<
    Pick<
      CalendarEventRow,
      | 'title'
      | 'description'
      | 'starts_at'
      | 'ends_at'
      | 'due_at'
      | 'status'
      | 'reminder_at'
      | 'lead_id'
      | 'thread_id'
      | 'timezone'
      | 'metadata'
    >
  >,
): Promise<CalendarEventRow> {
  const { data, error } = await admin
    .from('calendar_events')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('workspace_id', workspaceId)
    .eq('id', eventId)
    .select('*')
    .single();
  if (error || !data) throw new Error(`Aggiornamento evento: ${error?.message ?? 'fallito'}`);
  const event = data as CalendarEventRow;
  if (patch.reminder_at) {
    await scheduleReminderJob(admin, workspaceId, event);
  }
  return event;
}

export async function listCalendarEvents(
  admin: AppSupabaseClient,
  workspaceId: string,
  opts?: {
    fromIso?: string;
    toIso?: string;
    types?: CalendarEventType[];
    leadId?: string;
    status?: CalendarEventRow['status'];
  },
): Promise<CalendarEventRow[]> {
  let query = admin.from('calendar_events').select('*').eq('workspace_id', workspaceId);
  if (opts?.leadId) query = query.eq('lead_id', opts.leadId);
  if (opts?.status) query = query.eq('status', opts.status);
  if (opts?.types?.length) query = query.in('event_type', opts.types);
  if (opts?.fromIso) {
    query = query.or(
      `starts_at.gte.${opts.fromIso},due_at.gte.${opts.fromIso}`,
    );
  }
  if (opts?.toIso) {
    query = query.or(`starts_at.lte.${opts.toIso},due_at.lte.${opts.toIso}`);
  }
  const { data, error } = await query.order('starts_at', { ascending: true, nullsFirst: false });
  if (error) throw new Error(`Eventi calendario: ${error.message}`);
  return (data ?? []) as CalendarEventRow[];
}

export async function getActiveAppointmentForLead(
  admin: AppSupabaseClient,
  workspaceId: string,
  leadId: string,
): Promise<CalendarEventRow | null> {
  const { data, error } = await admin
    .from('calendar_events')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('lead_id', leadId)
    .eq('event_type', 'APPOINTMENT')
    .eq('status', 'SCHEDULED')
    .order('starts_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Appuntamento lead: ${error.message}`);
  return (data as CalendarEventRow | null) ?? null;
}

export async function getNextDeadlineForLead(
  admin: AppSupabaseClient,
  workspaceId: string,
  leadId: string,
): Promise<CalendarEventRow | null> {
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from('calendar_events')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('lead_id', leadId)
    .eq('event_type', 'WORK_DEADLINE')
    .eq('status', 'SCHEDULED')
    .gte('due_at', now)
    .order('due_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Scadenza lead: ${error.message}`);
  return (data as CalendarEventRow | null) ?? null;
}

export async function fireCalendarReminder(
  admin: AppSupabaseClient,
  workspaceId: string,
  eventId: string,
): Promise<{ fired: boolean; reason?: string }> {
  const { data: event, error } = await admin
    .from('calendar_events')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('id', eventId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!event) return { fired: false, reason: 'not_found' };
  const row = event as CalendarEventRow;
  if (row.status !== 'SCHEDULED') return { fired: false, reason: 'not_scheduled' };
  if (row.reminder_sent_at) return { fired: false, reason: 'already_fired' };

  const now = new Date().toISOString();
  const { data: updated, error: updErr } = await admin
    .from('calendar_events')
    .update({ reminder_sent_at: now, updated_at: now })
    .eq('id', eventId)
    .eq('workspace_id', workspaceId)
    .is('reminder_sent_at', null)
    .select('id')
    .maybeSingle();
  if (updErr) throw new Error(updErr.message);
  if (!updated) return { fired: false, reason: 'already_fired' };

  await admin.from('activity_log').insert({
    workspace_id: workspaceId,
    actor_type: 'SYSTEM',
    entity_type: 'calendar_event',
    entity_id: eventId,
    lead_id: row.lead_id,
    category: 'BUSINESS',
    event_type: 'CALENDAR_REMINDER_FIRED',
    message: `Promemoria: ${row.title}`,
    data: {
      eventId,
      eventType: row.event_type,
      startsAt: row.starts_at,
      dueAt: row.due_at,
    } as unknown as Json,
  });

  return { fired: true };
}
