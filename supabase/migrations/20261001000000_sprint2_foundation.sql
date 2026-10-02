-- Sprint 2 foundation migration.
-- Apply only to a staging Supabase project first.
-- Authorization roles are read from auth.jwt() app_metadata, never mutable user metadata.

create extension if not exists pgcrypto;

create type public.account_role as enum ('ADMIN', 'MENTOR', 'MENTEE');
create type public.account_status as enum ('pending', 'active', 'disabled', 'suspended');
create type public.assignment_status as enum ('active', 'archived');
create type public.call_review_status as enum ('Draft', 'Pending Review', 'Approved', 'Rejected');
create type public.processing_status as enum ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  display_name text not null check (char_length(display_name) between 2 and 160),
  role public.account_role not null,
  status public.account_status not null default 'pending',
  mentee_id uuid,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.mentors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete restrict,
  bio text not null default '',
  status public.account_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.mentees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references public.profiles(id) on delete set null,
  name text not null check (char_length(name) between 2 and 160),
  macid text unique,
  standard text not null default '',
  guardian text not null default '',
  phone text not null default '',
  status public.account_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add constraint profiles_mentee_fk foreign key (mentee_id) references public.mentees(id) on delete set null;

create table public.mentorship_assignments (
  id uuid primary key default gen_random_uuid(),
  mentor_id uuid not null references public.mentors(id) on delete restrict,
  mentee_id uuid not null references public.mentees(id) on delete restrict,
  status public.assignment_status not null default 'active',
  assigned_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (mentor_id, mentee_id)
);

create unique index one_active_assignment_per_mentee
  on public.mentorship_assignments (mentee_id)
  where status = 'active';

create table public.calls (
  id uuid primary key default gen_random_uuid(),
  mentor_id uuid not null references public.mentors(id) on delete restrict,
  mentee_id uuid not null references public.mentees(id) on delete restrict,
  session_date timestamptz not null,
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  mentor_notes text not null default '',
  transcript text not null default '',
  review_status public.call_review_status not null default 'Draft',
  ai_status public.processing_status not null default 'PENDING',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.call_recordings (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null unique references public.calls(id) on delete cascade,
  storage_path text not null unique,
  original_name text not null,
  mime_type text not null,
  byte_size bigint not null check (byte_size > 0),
  sha256 text,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.call_processing_jobs (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references public.calls(id) on delete cascade,
  queue_job_id text unique,
  status public.processing_status not null default 'PENDING',
  stage text not null default 'UPLOAD',
  progress smallint not null default 0 check (progress between 0 and 100),
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.transcript_segments (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references public.calls(id) on delete cascade,
  sequence_number integer not null check (sequence_number >= 0),
  start_seconds numeric(12, 3) not null check (start_seconds >= 0),
  end_seconds numeric(12, 3) not null check (end_seconds >= start_seconds),
  speaker text,
  text text not null,
  unique (call_id, sequence_number)
);

create table public.daily_performance (
  id uuid primary key default gen_random_uuid(),
  mentee_id uuid not null references public.mentees(id) on delete restrict,
  performance_date date not null,
  study_minutes integer not null default 0 check (study_minutes between 0 and 1440),
  reading_minutes integer not null default 0 check (reading_minutes between 0 and 1440),
  day_rating smallint check (day_rating between 1 and 5),
  quran jsonb not null default '{}'::jsonb,
  reflection text not null default '',
  needs_mentor_help boolean not null default false,
  mentor_help_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (mentee_id, performance_date)
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (char_length(action) between 2 and 120),
  target_type text,
  target_id uuid,
  ip_address inet,
  user_agent text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index calls_mentor_date_idx on public.calls (mentor_id, session_date desc);
create index calls_mentee_date_idx on public.calls (mentee_id, session_date desc);
create index calls_review_idx on public.calls (review_status, created_at desc);
create index assignments_mentor_status_idx on public.mentorship_assignments (mentor_id, status);
create index performance_mentee_date_idx on public.daily_performance (mentee_id, performance_date desc);
create index audit_logs_created_idx on public.audit_logs (created_at desc);

create or replace function public.current_app_role()
returns text
language sql
stable
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '');
$$;

-- Cross-table authorization helpers live outside exposed schemas. They are
-- SECURITY DEFINER only to avoid recursive RLS evaluation across assignments,
-- mentors, mentees, and calls. Each function requires an authenticated caller
-- and has a fixed search_path.
create schema if not exists private;

create or replace function private.can_access_mentee(target_mentee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select auth.uid() is not null and (
    public.current_app_role() = 'ADMIN'
    or exists (select 1 from public.mentees e where e.id = target_mentee_id and e.user_id = auth.uid())
    or exists (
      select 1
      from public.mentorship_assignments a
      join public.mentors m on m.id = a.mentor_id
      where a.mentee_id = target_mentee_id and a.status = 'active' and m.user_id = auth.uid()
    )
  );
$$;

revoke all on function private.can_access_mentee(uuid) from public;
grant execute on function private.can_access_mentee(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.mentors enable row level security;
alter table public.mentees enable row level security;
alter table public.mentorship_assignments enable row level security;
alter table public.calls enable row level security;
alter table public.call_recordings enable row level security;
alter table public.call_processing_jobs enable row level security;
alter table public.transcript_segments enable row level security;
alter table public.daily_performance enable row level security;
alter table public.audit_logs enable row level security;

create policy profiles_self_or_admin_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.current_app_role() = 'ADMIN');
create policy profiles_self_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy mentors_admin_select on public.mentors for select to authenticated
  using (public.current_app_role() = 'ADMIN' or user_id = auth.uid());
create policy mentors_admin_manage on public.mentors for all to authenticated
  using (public.current_app_role() = 'ADMIN') with check (public.current_app_role() = 'ADMIN');

create policy mentees_authorized_select on public.mentees for select to authenticated
  using (private.can_access_mentee(id));
create policy mentees_admin_manage on public.mentees for all to authenticated
  using (public.current_app_role() = 'ADMIN') with check (public.current_app_role() = 'ADMIN');

create policy assignments_authorized_select on public.mentorship_assignments for select to authenticated
  using (
    public.current_app_role() = 'ADMIN'
    or exists (select 1 from public.mentors m where m.id = mentor_id and m.user_id = auth.uid())
    or exists (select 1 from public.mentees e where e.id = mentee_id and e.user_id = auth.uid())
  );
create policy assignments_admin_manage on public.mentorship_assignments for all to authenticated
  using (public.current_app_role() = 'ADMIN') with check (public.current_app_role() = 'ADMIN');

create policy calls_authorized_select on public.calls for select to authenticated
  using (private.can_access_mentee(mentee_id));
create policy calls_mentor_insert on public.calls for insert to authenticated
  with check (private.can_access_mentee(mentee_id) and (public.current_app_role() = 'ADMIN' or exists (select 1 from public.mentors m where m.id = mentor_id and m.user_id = auth.uid())));
create policy calls_authorized_update on public.calls for update to authenticated
  using (public.current_app_role() = 'ADMIN' or exists (select 1 from public.mentors m where m.id = mentor_id and m.user_id = auth.uid()))
  with check (private.can_access_mentee(mentee_id));

create policy recording_authorized_access on public.call_recordings for select to authenticated
  using (exists (select 1 from public.calls c where c.id = call_id));
create policy recording_admin_insert on public.call_recordings for insert to authenticated
  with check (public.current_app_role() = 'ADMIN' or exists (select 1 from public.calls c join public.mentors m on m.id = c.mentor_id where c.id = call_id and m.user_id = auth.uid()));

create policy jobs_authorized_select on public.call_processing_jobs for select to authenticated
  using (public.current_app_role() = 'ADMIN' or exists (select 1 from public.calls c where c.id = call_id));
create policy segments_authorized_select on public.transcript_segments for select to authenticated
  using (public.current_app_role() = 'ADMIN' or exists (select 1 from public.calls c where c.id = call_id));

create policy performance_authorized_select on public.daily_performance for select to authenticated
  using (private.can_access_mentee(mentee_id));
create policy performance_mentee_insert on public.daily_performance for insert to authenticated
  with check (exists (select 1 from public.mentees e where e.id = mentee_id and e.user_id = auth.uid()));
create policy performance_mentee_update on public.daily_performance for update to authenticated
  using (exists (select 1 from public.mentees e where e.id = mentee_id and e.user_id = auth.uid()))
  with check (exists (select 1 from public.mentees e where e.id = mentee_id and e.user_id = auth.uid()));

create policy audit_admin_select on public.audit_logs for select to authenticated
  using (public.current_app_role() = 'ADMIN');

revoke all on public.audit_logs from anon, authenticated;
grant select on public.audit_logs to authenticated;
