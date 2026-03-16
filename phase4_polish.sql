-- Phase 4 schema updates for usability polish.
-- Run after profiles.sql, events.sql, imports.sql.

alter table public.events
  add column if not exists end_date timestamptz,
  add column if not exists attachment_url text,
  add column if not exists attachment_name text,
  add column if not exists attachment_path text;

alter table public.imports
  add column if not exists duplicate_rows integer not null default 0;

-- Optional helpful index for reminders.
create index if not exists idx_events_user_reminder on public.events(user_id, reminder_datetime);

-- Storage setup (run in Supabase SQL editor for policies):
-- 1) Create bucket manually in Storage UI: event-attachments (private preferred).
-- 2) Apply policies below so users only manage files in their own folder prefix user_id/...
--
-- create policy "Users can upload own event attachments"
-- on storage.objects for insert
-- to authenticated
-- with check (
--   bucket_id = 'event-attachments'
--   and split_part(name, '/', 1) = auth.uid()::text
-- );
--
-- create policy "Users can read own event attachments"
-- on storage.objects for select
-- to authenticated
-- using (
--   bucket_id = 'event-attachments'
--   and split_part(name, '/', 1) = auth.uid()::text
-- );
--
-- create policy "Users can update own event attachments"
-- on storage.objects for update
-- to authenticated
-- using (
--   bucket_id = 'event-attachments'
--   and split_part(name, '/', 1) = auth.uid()::text
-- )
-- with check (
--   bucket_id = 'event-attachments'
--   and split_part(name, '/', 1) = auth.uid()::text
-- );
--
-- create policy "Users can delete own event attachments"
-- on storage.objects for delete
-- to authenticated
-- using (
--   bucket_id = 'event-attachments'
--   and split_part(name, '/', 1) = auth.uid()::text
-- );