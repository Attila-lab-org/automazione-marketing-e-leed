import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/api/with-admin';
import { createAdminSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { ensureDefaultWorkspace } from '@/lib/workspace';
import {
  bookSlotAtomic,
  cancelAppointment,
  deleteAvailabilitySlot,
  rescheduleAppointment,
  updateAvailabilitySlot,
  updateCalendarEvent,
} from '@/lib/calendar';

export const runtime = 'nodejs';

type RouteCtx = { params: Promise<{ id: string }> };

export const PATCH = withAdmin(async (request: Request, ctx?: unknown) => {
  if (!isSupabaseConfigured(process.env) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Supabase non configurato' }, { status: 503 });
  }
  const { id } = await (ctx as RouteCtx).params;
  const body = (await request.json()) as {
    target?: 'slot' | 'event';
    action?: 'update' | 'book' | 'cancel' | 'reschedule' | 'complete';
    startsAt?: string;
    endsAt?: string;
    status?: 'AVAILABLE' | 'BOOKED' | 'BLOCKED' | 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
    note?: string | null;
    title?: string;
    description?: string | null;
    dueAt?: string | null;
    reminderAt?: string | null;
    leadId?: string;
    threadId?: string | null;
  };
  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);

  try {
    if (body.target === 'slot') {
      if (body.action === 'book') {
        if (!body.leadId) {
          return NextResponse.json({ error: 'leadId obbligatorio per prenotare' }, { status: 400 });
        }
        const result = await bookSlotAtomic(admin, {
          workspaceId: workspace.id,
          slotId: id,
          leadId: body.leadId,
          threadId: body.threadId ?? null,
          title: body.title ?? 'Appuntamento',
          description: body.description,
          source: 'HUMAN',
        });
        if (!result.ok) {
          return NextResponse.json({ error: result.reason, detail: result.detail }, { status: 409 });
        }
        return NextResponse.json({ result });
      }
      const slot = await updateAvailabilitySlot(admin, workspace.id, id, {
        starts_at: body.startsAt,
        ends_at: body.endsAt,
        status:
          body.status === 'AVAILABLE' || body.status === 'BOOKED' || body.status === 'BLOCKED'
            ? body.status
            : undefined,
        note: body.note,
      });
      return NextResponse.json({ slot });
    }

    if (body.action === 'cancel') {
      const ok = await cancelAppointment(admin, workspace.id, id);
      return NextResponse.json({ cancelled: ok });
    }
    if (body.action === 'reschedule') {
      if (!body.leadId) {
        return NextResponse.json({ error: 'leadId obbligatorio' }, { status: 400 });
      }
      const result = await rescheduleAppointment(admin, {
        workspaceId: workspace.id,
        eventId: id,
        leadId: body.leadId,
        threadId: body.threadId ?? null,
        title: body.title ?? 'Appuntamento',
        description: body.description,
        source: 'HUMAN',
      });
      if (!result.ok) {
        return NextResponse.json({ error: result.reason, detail: result.detail }, { status: 409 });
      }
      return NextResponse.json({ result });
    }
    if (body.action === 'complete') {
      const event = await updateCalendarEvent(admin, workspace.id, id, { status: 'COMPLETED' });
      return NextResponse.json({ event });
    }

    const event = await updateCalendarEvent(admin, workspace.id, id, {
      title: body.title,
      description: body.description,
      starts_at: body.startsAt,
      ends_at: body.endsAt,
      due_at: body.dueAt,
      reminder_at: body.reminderAt,
      status:
        body.status === 'SCHEDULED' || body.status === 'COMPLETED' || body.status === 'CANCELLED'
          ? body.status
          : undefined,
    });
    return NextResponse.json({ event });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Aggiornamento fallito' },
      { status: 400 },
    );
  }
});

export const DELETE = withAdmin(async (_request: Request, ctx?: unknown) => {
  if (!isSupabaseConfigured(process.env) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Supabase non configurato' }, { status: 503 });
  }
  const { id } = await (ctx as RouteCtx).params;
  const admin = createAdminSupabaseClient(process.env);
  const workspace = await ensureDefaultWorkspace(admin);
  try {
    await deleteAvailabilitySlot(admin, workspace.id, id);
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Eliminazione fallita' },
      { status: 400 },
    );
  }
});
