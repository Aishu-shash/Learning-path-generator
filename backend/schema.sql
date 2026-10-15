create table if not exists public.learnpath_workspaces (
  id uuid primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.learnpath_workspaces enable row level security;
revoke all on table public.learnpath_workspaces from anon, authenticated;
grant all on table public.learnpath_workspaces to service_role;
