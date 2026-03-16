-- Run this SQL after profiles.sql in Supabase SQL Editor.
-- Creates events table for Phase 2 calendar CRUD.

create extension if not exists pgcrypto;

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  due_date timestamptz not null,
  description text,
  category text,
  color text,
  recurrence_rule text,
  reminder_type text,
  reminder_datetime timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_events_user_id_due_date on public.events(user_id, due_date);

alter table public.events enable row level security;

-- Users can only see their own events.
create policy "Users can view own events"
  on public.events
  for select
  using (auth.uid() = user_id);

-- Users can only insert events for themselves.
create policy "Users can insert own events"
  on public.events
  for insert
  with check (auth.uid() = user_id);

-- Users can only update their own events.
create policy "Users can update own events"
  on public.events
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Users can only delete their own events.
create policy "Users can delete own events"
  on public.events
  for delete
  using (auth.uid() = user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_events_updated_at on public.events;
create trigger set_events_updated_at
before update on public.events
for each row execute function public.set_updated_at();