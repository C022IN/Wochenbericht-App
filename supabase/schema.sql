-- Wochenbericht App Supabase schema
-- Run in Supabase SQL editor.

create table if not exists public.wochenbericht_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  username text,
  first_name text,
  last_name text,
  display_name text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Add explicit profile columns for existing installations that already have the table.
alter table public.wochenbericht_profiles add column if not exists email text;
alter table public.wochenbericht_profiles add column if not exists username text;
alter table public.wochenbericht_profiles add column if not exists first_name text;
alter table public.wochenbericht_profiles add column if not exists last_name text;
alter table public.wochenbericht_profiles add column if not exists display_name text;
alter table public.wochenbericht_profiles add column if not exists created_at timestamptz not null default now();

create index if not exists wochenbericht_profiles_email_idx
  on public.wochenbericht_profiles (email);

create index if not exists wochenbericht_profiles_username_idx
  on public.wochenbericht_profiles (username);

-- Backfill explicit columns from auth.users and the existing JSON payload.
update public.wochenbericht_profiles as p
set
  email = coalesce(nullif(p.email, ''), u.email),
  username = coalesce(
    nullif(p.username, ''),
    nullif(split_part(coalesce(u.email, ''), '@', 1), '')
  ),
  first_name = coalesce(nullif(p.first_name, ''), nullif(p.payload ->> 'vorname', '')),
  last_name = coalesce(nullif(p.last_name, ''), nullif(p.payload ->> 'name', '')),
  display_name = coalesce(
    nullif(p.display_name, ''),
    nullif(
      trim(
        concat_ws(
          ' ',
          coalesce(nullif(p.first_name, ''), nullif(p.payload ->> 'vorname', '')),
          coalesce(nullif(p.last_name, ''), nullif(p.payload ->> 'name', ''))
        )
      ),
      ''
    )
  )
from auth.users as u
where u.id = p.user_id;

create table if not exists public.wochenbericht_entries (
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

create index if not exists wochenbericht_entries_user_date_idx
  on public.wochenbericht_entries (user_id, date);

-- Row Level Security (recommended if you later access from the client with anon key)
alter table public.wochenbericht_profiles enable row level security;
alter table public.wochenbericht_entries enable row level security;

drop policy if exists "profiles_select_own" on public.wochenbericht_profiles;
create policy "profiles_select_own"
  on public.wochenbericht_profiles
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "profiles_insert_own" on public.wochenbericht_profiles;
create policy "profiles_insert_own"
  on public.wochenbericht_profiles
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "profiles_update_own" on public.wochenbericht_profiles;
create policy "profiles_update_own"
  on public.wochenbericht_profiles
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "entries_select_own" on public.wochenbericht_entries;
create policy "entries_select_own"
  on public.wochenbericht_entries
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "entries_insert_own" on public.wochenbericht_entries;
create policy "entries_insert_own"
  on public.wochenbericht_entries
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "entries_update_own" on public.wochenbericht_entries;
create policy "entries_update_own"
  on public.wochenbericht_entries
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "entries_delete_own" on public.wochenbericht_entries;
create policy "entries_delete_own"
  on public.wochenbericht_entries
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- Storage bucket for generated exports
insert into storage.buckets (id, name, public)
values ('wochenbericht-exports', 'wochenbericht-exports', false)
on conflict (id) do nothing;

-- Optional storage policies if you later want authenticated client access.
-- The current app uploads/signs with service role key on the server, so these are not required.
