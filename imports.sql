-- Run this SQL after profiles.sql and events.sql.
-- Tracks Excel import runs per user for Phase 3 import history.

create table if not exists public.imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  total_rows integer not null default 0,
  valid_rows integer not null default 0,
  invalid_rows integer not null default 0,
  status text not null default 'success' check (status in ('success', 'partial_success', 'failed')),
  error_details text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_imports_user_created_at on public.imports(user_id, created_at desc);

alter table public.imports enable row level security;

create policy "Users can view own imports"
  on public.imports
  for select
  using (auth.uid() = user_id);

create policy "Users can insert own imports"
  on public.imports
  for insert
  with check (auth.uid() = user_id);