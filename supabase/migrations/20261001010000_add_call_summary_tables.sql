-- Sprint 2 additive migration: AI summary records and immutable summary history.
-- Apply after 20261001000000_sprint2_foundation.sql.

create table if not exists public.call_summaries (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null unique references public.calls(id) on delete cascade,
  short_summary text not null default '',
  key_discussion_points jsonb not null default '[]'::jsonb,
  academic_progress text not null default '',
  personal_development text not null default '',
  challenges jsonb not null default '[]'::jsonb,
  achievements jsonb not null default '[]'::jsonb,
  action_items jsonb not null default '[]'::jsonb,
  mentor_commitments jsonb not null default '[]'::jsonb,
  mentee_commitments jsonb not null default '[]'::jsonb,
  follow_up_topics jsonb not null default '[]'::jsonb,
  topics_discussed jsonb not null default '[]'::jsonb,
  status text not null default 'PENDING' check (status in ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
  generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.summary_versions (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references public.calls(id) on delete cascade,
  version integer not null check (version > 0),
  type text not null check (type in ('AI', 'MENTOR_EDIT', 'APPROVED')),
  content jsonb not null,
  author_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (call_id, version)
);

create index if not exists call_summaries_status_idx
  on public.call_summaries (status, updated_at desc);
create index if not exists summary_versions_call_idx
  on public.summary_versions (call_id, version desc);

alter table public.call_summaries enable row level security;
alter table public.summary_versions enable row level security;

drop policy if exists call_summaries_authorized_select on public.call_summaries;
create policy call_summaries_authorized_select on public.call_summaries
  for select to authenticated
  using (
    public.current_app_role() = 'ADMIN'
    or exists (
      select 1 from public.calls c
      where c.id = call_summaries.call_id
        and private.can_access_mentee(c.mentee_id)
    )
  );

drop policy if exists call_summaries_authorized_insert on public.call_summaries;
create policy call_summaries_authorized_insert on public.call_summaries
  for insert to authenticated
  with check (
    public.current_app_role() = 'ADMIN'
    or exists (
      select 1 from public.calls c
      join public.mentors m on m.id = c.mentor_id
      where c.id = call_summaries.call_id and m.user_id = auth.uid()
    )
  );

drop policy if exists call_summaries_authorized_update on public.call_summaries;
create policy call_summaries_authorized_update on public.call_summaries
  for update to authenticated
  using (public.current_app_role() = 'ADMIN')
  with check (public.current_app_role() = 'ADMIN');

drop policy if exists summary_versions_authorized_select on public.summary_versions;
create policy summary_versions_authorized_select on public.summary_versions
  for select to authenticated
  using (
    public.current_app_role() = 'ADMIN'
    or exists (
      select 1 from public.calls c
      where c.id = summary_versions.call_id
        and private.can_access_mentee(c.mentee_id)
    )
  );

drop policy if exists summary_versions_authorized_insert on public.summary_versions;
create policy summary_versions_authorized_insert on public.summary_versions
  for insert to authenticated
  with check (
    public.current_app_role() = 'ADMIN'
    or author_id = auth.uid()
  );

revoke update, delete on public.summary_versions from anon, authenticated;
