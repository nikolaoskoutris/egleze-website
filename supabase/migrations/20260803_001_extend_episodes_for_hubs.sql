-- 001_extend_episodes_for_hubs.sql
begin;

alter table public.episodes
  add column if not exists youtube_video_id text,
  add column if not exists source_url text,
  add column if not exists slug text,
  add column if not exists summary text,
  add column if not exists key_points text[],
  add column if not exists artwork_url text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists status text not null default 'draft',
  add column if not exists summary_source_story_id integer,
  add column if not exists metadata_conflict_count integer not null default 0,
  add column if not exists migration_tag text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.episodes'::regclass
      and conname = 'episodes_status_check'
  ) then
    alter table public.episodes
      add constraint episodes_status_check
      check (status in ('draft', 'review', 'published'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.episodes'::regclass
      and conname = 'episodes_summary_source_story_id_fkey'
  ) then
    alter table public.episodes
      add constraint episodes_summary_source_story_id_fkey
      foreign key (summary_source_story_id)
      references public.stories(id)
      on delete set null;
  end if;
end $$;

create unique index if not exists episodes_youtube_video_id_uidx
  on public.episodes (youtube_video_id)
  where youtube_video_id is not null;

create index if not exists episodes_status_idx
  on public.episodes (status);

create index if not exists episodes_show_name_published_at_idx
  on public.episodes (show_name, published_at desc);

create index if not exists stories_episode_id_idx
  on public.stories (episode_id);

create or replace function public.extract_youtube_video_id(input_url text)
returns text
language plpgsql
immutable
strict
as $$
declare
  match text[];
begin
  match := regexp_match(
    input_url,
    '(?:youtu\.be/|youtube\.com/(?:watch\?(?:[^#]*&)?v=|embed/|shorts/|live/|v/))([A-Za-z0-9_-]{11})'
  );
  if match is null then
    return null;
  end if;
  return match[1];
end;
$$;

alter table public.episodes enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'episodes'
      and policyname = 'Public can read published episode hubs'
  ) then
    create policy "Public can read published episode hubs"
      on public.episodes
      for select
      to anon, authenticated
      using (status = 'published');
  end if;
end $$;

commit;
