import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/api/with-admin';
import { createAdminSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { ensureDefaultWorkspace } from '@/lib/workspace';
import {
  createAvailabilitySlot,
  createCalendarEvent,
  listCalendarEvents,
  listSlotsInRange,
} from '@/lib/calendar';
import type { CalendarEventType } from '@/lib/types/database';

export const runtime = 'nodejs';

function weekBounds(anchorIso?: string | null): { fromIso: string; toIso: string } {
  const anchor = anchorIso ? new Date(anchorIso) : new Date();
  const day = anchor.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = new Date(anchor);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + mondayOffset);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { fromIso: start.toISOString(), toIso: end.toISOString() };
}

export const GET = withAdmin(async (request: Request) => {
  if (!isSupabaseConfigured(process.env) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Supabase non configurato' }, { status: 503 });
  }
  const url = new URL(request.url);
  const week = url.searchParams.get('week');
  const type = url.searchParams.get('type');
  const leadId = url.searchParams.get('leadId');
  const { fromIso, toIso } = weekBounds(week);
  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);

  const types: CalendarEventType[] | undefined =
    type === 'APPOINTMENT' || type === 'WORK_DEADLINE' || type === 'REMINDER'
      ? [type]
      : undefined;

  const [events, slots] = await Promise.all([
    listCalendarEvents(admin, workspace.id, {
      fromIso,
      toIso,
      types,
      leadId: leadId || undefined,
      status: 'SCHEDULED',
    }),
    listSlotsInRange(admin, workspace.id, fromIso, toIso),
  ]);

  const leadIds = [...new Set(events.map((e) => e.lead_id).filter(Boolean))] as string[];
  const leadsById = new Map<string, { id: string; name: string }>();
  if (leadIds.length) {
    const { data: leads } = await admin
      .from('leads')
      .select('id, name')
      .eq('workspace_id', workspace.id)
      .in('id', leadIds);
    for (const lead of leads ?? []) {
      leadsById.set(lead.id, { id: lead.id, name: lead.name });
    }
  }

  return NextResponse.json({
    fromIso,
    toIso,
    events: events.map((event) => ({
      ...event,
      lead: event.lead_id ? leadsById.get(event.lead_id) ?? null : null,
    })),
    slots,
  });
});

export const POST = withAdmin(async (request: Request) => {
  if (!isSupabaseConfigured(process.env) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Supabase non configurato' }, { status: 503 });
  }
  const body = (await request.json()) as {
    kind?: 'slot' | 'event';
    startsAt?: string;
    endsAt?: string;
    dueAt?: string;
    timezone?: string;
    note?: string;
    title?: string;
    description?: string;
    eventType?: 'APPOINTMENT' | 'WORK_DEADLINE' | 'REMINDER';
    leadId?: string | null;
    threadId?: string | null;
    reminderAt?: string | null;
  };
  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);

  try {
    if (body.kind === 'slot') {
      if (!body.startsAt || !body.endsAt) {
        return NextResponse.json({ error: 'startsAt e endsAt obbligatori' }, { status: 400 });
      }
      const slot = await createAvailabilitySlot(admin, {
        workspace_id: workspace.id,
        starts_at: body.startsAt,
        ends_at: body.endsAt,
        timezone: body.timezone ?? 'Europe/Rome',
        note: body.note ?? null,
      });
      return NextResponse.json({ slot });
    }

    if (!body.title || !body.eventType) {
      return NextResponse.json({ error: 'title e eventType obbligatori' }, { status: 400 });
    }
    const event = await createCalendarEvent(admin, {
      workspace_id: workspace.id,
      title: body.title,
      description: body.description ?? null,
      event_type: body.eventType,
      starts_at: body.startsAt ?? null,
      ends_at: body.endsAt ?? null,
      due_at: body.dueAt ?? null,
      lead_id: body.leadId ?? null,
      thread_id: body.threadId ?? null,
      reminder_at: body.reminderAt ?? null,
      timezone: body.timezone ?? 'Europe/Rome',
      source: 'HUMAN',
    });
    return NextResponse.json({ event });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Operazione calendario fallita' },
      { status: 400 },
    );
  }
});
