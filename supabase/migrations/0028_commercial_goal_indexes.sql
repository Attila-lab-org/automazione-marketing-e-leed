-- Cover Outcome Core foreign keys and operator timeline queries.
create index if not exists commercial_goal_plans_workspace_idx
  on public.commercial_goal_plans (workspace_id, created_at desc);
create index if not exists commercial_goal_events_workspace_idx
  on public.commercial_goal_events (workspace_id, created_at desc);
create index if not exists commercial_goal_events_plan_idx
  on public.commercial_goal_events (plan_id) where plan_id is not null;
create index if not exists commercial_goal_events_ai_run_idx
  on public.commercial_goal_events (ai_run_id) where ai_run_id is not null;
create index if not exists commercial_goal_links_workspace_idx
  on public.commercial_goal_links (workspace_id, created_at desc);
create index if not exists message_threads_closed_by_idx
  on public.message_threads (closed_by) where closed_by is not null;
