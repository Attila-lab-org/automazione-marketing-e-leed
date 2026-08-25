-- ============================================================================
-- 0025_commercial_calendar.sql
-- Calendario interno: disponibilità manuali, appuntamenti, scadenze e reminder.
-- ============================================================================

alter type public.job_type add value if not exists 'CALENDAR_REMINDER';

create table if not exists public.calendar_availability_slots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'Europe/Rome',
  status text not null default 'AVAILABLE'
    check (status in ('AVAILABLE', 'BOOKED', 'BLOCKED')),
  booked_event_id uuid,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create unique index if not exists calendar_slots_unique_time_idx
  on public.calendar_availability_slots (workspace_id, starts_at, ends_at);
create index if not exists calendar_slots_available_idx
  on public.calendar_availability_slots (workspace_id, status, starts_at);

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  thread_id uuid references public.message_threads(id) on delete set null,
  slot_id uuid references public.calendar_availability_slots(id) on delete set null,
  event_type text not null
    check (event_type in ('APPOINTMENT', 'WORK_DEADLINE', 'REMINDER')),
  title text not null,
  description text,
  starts_at timestamptz,
  ends_at timestamptz,
  due_at timestamptz,
  timezone text not null default 'Europe/Rome',
  status text not null default 'SCHEDULED'
    check (status in ('SCHEDULED', 'COMPLETED', 'CANCELLED')),
  source text not null default 'HUMAN'
    check (source in ('AI', 'HUMAN', 'SYSTEM')),
  reminder_at timestamptz,
  reminder_sent_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    event_type <> 'APPOINTMENT'
    or (starts_at is not null and ends_at is not null and ends_at > starts_at)
  ),
  check (
    event_type = 'APPOINTMENT'
    or due_at is not null
  )
);

alter table public.calendar_availability_slots
  drop constraint if exists calendar_slots_booked_event_fk;
alter table public.calendar_availability_slots
  add constraint calendar_slots_booked_event_fk
  foreign key (booked_event_id) references public.calendar_events(id) on delete set null;

create index if not exists calendar_events_period_idx
  on public.calendar_events (workspace_id, starts_at, due_at);
create index if not exists calendar_events_lead_idx
  on public.calendar_events (lead_id, status, starts_at, due_at);
create index if not exists calendar_events_reminder_idx
  on public.calendar_events (workspace_id, reminder_at)
  where status = 'SCHEDULED' and reminder_sent_at is null;

create or replace function public.book_calendar_slot(
  p_workspace_id uuid,
  p_slot_id uuid,
  p_lead_id uuid,
  p_thread_id uuid,
  p_title text,
  p_description text default null,
  p_source text default 'AI'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slot public.calendar_availability_slots%rowtype;
  v_event_id uuid;
begin
  select *
  into v_slot
  from public.calendar_availability_slots
  where id = p_slot_id and workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception 'calendar_slot_not_found';
  end if;
  if v_slot.status <> 'AVAILABLE' then
    raise exception 'calendar_slot_unavailable';
  end if;

  insert into public.calendar_events (
    workspace_id, lead_id, thread_id, slot_id, event_type, title, description,
    starts_at, ends_at, timezone, status, source
  ) values (
    p_workspace_id, p_lead_id, p_thread_id, p_slot_id, 'APPOINTMENT',
    p_title, p_description, v_slot.starts_at, v_slot.ends_at, v_slot.timezone,
    'SCHEDULED', p_source
  )
  returning id into v_event_id;

  update public.calendar_availability_slots
  set status = 'BOOKED', booked_event_id = v_event_id, updated_at = now()
  where id = p_slot_id;

  return v_event_id;
end;
$$;

create or replace function public.cancel_calendar_appointment(
  p_workspace_id uuid,
  p_event_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slot_id uuid;
begin
  update public.calendar_events
  set status = 'CANCELLED', updated_at = now()
  where id = p_event_id
    and workspace_id = p_workspace_id
    and event_type = 'APPOINTMENT'
    and status = 'SCHEDULED'
  returning slot_id into v_slot_id;

  if not found then return false; end if;

  if v_slot_id is not null then
    update public.calendar_availability_slots
    set status = 'AVAILABLE', booked_event_id = null, updated_at = now()
    where id = v_slot_id and workspace_id = p_workspace_id;
  end if;
  return true;
end;
$$;

alter table public.calendar_availability_slots enable row level security;
alter table public.calendar_availability_slots force row level security;
alter table public.calendar_events enable row level security;
alter table public.calendar_events force row level security;

drop policy if exists calendar_slots_select on public.calendar_availability_slots;
create policy calendar_slots_select on public.calendar_availability_slots
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists calendar_events_select on public.calendar_events;
create policy calendar_events_select on public.calendar_events
  for select to authenticated
  using (public.is_workspace_member(workspace_id));
