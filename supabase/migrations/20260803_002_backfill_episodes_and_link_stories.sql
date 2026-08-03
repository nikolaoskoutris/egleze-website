-- 002_backfill_episodes_and_link_stories.sql
begin;

update public.stories
set youtube_video_id = public.extract_youtube_video_id(source_url)
where youtube_video_id is null
  and source_url is not null
  and public.extract_youtube_video_id(source_url) is not null;

with approved as (
  select
    s.*,
    md5(
      coalesce(s.episode_summary, '') || '|' ||
      coalesce(array_to_string(s.episode_key_points, '||'), '')
    ) as payload_hash
  from public.stories s
  where s.status = 'approved'
    and s.youtube_video_id is not null
),
payload_groups as (
  select
    youtube_video_id,
    payload_hash,
    count(*) as payload_frequency,
    max(updated_at) as payload_latest_update,
    (array_agg(id order by updated_at desc nulls last, id desc))[1] as representative_story_id
  from approved
  group by youtube_video_id, payload_hash
),
ranked_payloads as (
  select
    pg.*,
    row_number() over (
      partition by youtube_video_id
      order by payload_frequency desc,
               payload_latest_update desc nulls last,
               representative_story_id desc
    ) as payload_rank,
    count(*) over (partition by youtube_video_id) - 1 as conflict_count
  from payload_groups pg
),
selected as (
  select
    rp.youtube_video_id,
    rp.conflict_count,
    s.id as source_story_id,
    s.show_name,
    s.episode as title,
    s.episode_summary as summary,
    s.episode_key_points as key_points,
    s.video_duration_seconds as story_duration_seconds
  from ranked_payloads rp
  join public.stories s on s.id = rp.representative_story_id
  where rp.payload_rank = 1
),
job_meta as (
  select
    youtube_video_id,
    max(published_at) as published_at,
    max(youtube_url) as youtube_url
  from public.youtube_pipeline_jobs
  where youtube_video_id is not null
  group by youtube_video_id
),
episode_rows as (
  select
    sel.youtube_video_id,
    sh.id as show_id,
    sel.show_name,
    coalesce(nullif(sel.title, ''), sel.show_name || ' episode') as title,
    jm.published_at,
    coalesce(jm.youtube_url, 'https://www.youtube.com/watch?v=' || sel.youtube_video_id) as canonical_source_url,
    greatest(
      coalesce(sel.story_duration_seconds, 0),
      coalesce((
        select max(s2.video_duration_seconds)
        from public.stories s2
        where s2.youtube_video_id = sel.youtube_video_id
      ), 0)
    ) as duration_seconds,
    sel.summary,
    sel.key_points,
    sh.artwork_url,
    regexp_replace(
      regexp_replace(
        lower(coalesce(nullif(sel.title, ''), sel.show_name || ' episode')),
        '[^a-z0-9]+', '-', 'g'
      ),
      '(^-|-$)', '', 'g'
    ) as slug,
    sel.source_story_id,
    sel.conflict_count
  from selected sel
  left join public.shows sh on sh.name = sel.show_name
  left join job_meta jm on jm.youtube_video_id = sel.youtube_video_id
)
insert into public.episodes (
  show_id, show_name, title, published_at, youtube_url, duration_seconds,
  youtube_video_id, source_url, slug, summary, key_points, artwork_url,
  updated_at, status, summary_source_story_id, metadata_conflict_count, migration_tag
)
select
  show_id, show_name, title, published_at, canonical_source_url,
  nullif(duration_seconds, 0), youtube_video_id, canonical_source_url, slug,
  summary, key_points, artwork_url, now(),
  case when conflict_count > 0 then 'review' else 'published' end,
  source_story_id, conflict_count, 'episode_hubs_v1'
from episode_rows
on conflict (youtube_video_id) where youtube_video_id is not null
do update set
  show_id = excluded.show_id,
  show_name = excluded.show_name,
  title = excluded.title,
  published_at = coalesce(excluded.published_at, public.episodes.published_at),
  youtube_url = excluded.youtube_url,
  duration_seconds = coalesce(excluded.duration_seconds, public.episodes.duration_seconds),
  source_url = excluded.source_url,
  slug = excluded.slug,
  summary = excluded.summary,
  key_points = excluded.key_points,
  artwork_url = coalesce(excluded.artwork_url, public.episodes.artwork_url),
  updated_at = now(),
  status = excluded.status,
  summary_source_story_id = excluded.summary_source_story_id,
  metadata_conflict_count = excluded.metadata_conflict_count,
  migration_tag = coalesce(public.episodes.migration_tag, excluded.migration_tag);

update public.stories s
set episode_id = e.id
from public.episodes e
where s.youtube_video_id = e.youtube_video_id
  and s.episode_id is distinct from e.id;

commit;
