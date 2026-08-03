begin;

update public.stories
set youtube_video_id = public.extract_youtube_video_id(source_url)
where episode_id is null
  and youtube_video_id is null
  and source_url is not null
  and public.extract_youtube_video_id(source_url) is not null;

with unresolved as (
  select s.*,
         row_number() over (
           partition by s.youtube_video_id
           order by
             case s.status
               when 'approved' then 1
               when 'preapproved' then 2
               when 'pending' then 3
               when 'rejected' then 4
               else 5
             end,
             s.updated_at desc nulls last,
             s.id desc
         ) as representative_rank
  from public.stories s
  where s.episode_id is null
    and s.youtube_video_id is not null
), representatives as (
  select *
  from unresolved
  where representative_rank = 1
), job_meta as (
  select youtube_video_id,
         max(published_at) as published_at,
         max(youtube_url) as youtube_url
  from public.youtube_pipeline_jobs
  where youtube_video_id is not null
  group by youtube_video_id
), episode_rows as (
  select
    r.youtube_video_id,
    sh.id as show_id,
    r.show_name,
    coalesce(nullif(r.episode, ''), r.show_name || ' episode') as title,
    jm.published_at,
    coalesce(jm.youtube_url, r.source_url, 'https://www.youtube.com/watch?v=' || r.youtube_video_id) as canonical_source_url,
    nullif((
      select max(s2.video_duration_seconds)
      from public.stories s2
      where s2.youtube_video_id = r.youtube_video_id
    ), 0) as duration_seconds,
    r.episode_summary as summary,
    r.episode_key_points as key_points,
    sh.artwork_url,
    regexp_replace(
      regexp_replace(
        lower(coalesce(nullif(r.episode, ''), r.show_name || ' episode')),
        '[^a-z0-9]+', '-', 'g'
      ),
      '(^-|-$)', '', 'g'
    ) as slug,
    r.id as source_story_id
  from representatives r
  left join public.shows sh on sh.name = r.show_name
  left join job_meta jm on jm.youtube_video_id = r.youtube_video_id
)
insert into public.episodes (
  show_id, show_name, title, published_at, youtube_url, duration_seconds,
  youtube_video_id, source_url, slug, summary, key_points, artwork_url,
  updated_at, status, summary_source_story_id, metadata_conflict_count, migration_tag
)
select
  show_id, show_name, title, published_at, canonical_source_url, duration_seconds,
  youtube_video_id, canonical_source_url, slug, summary, key_points, artwork_url,
  now(), 'draft', source_story_id, 0, 'episode_hubs_v1_pending_backfill'
from episode_rows
on conflict (youtube_video_id) where youtube_video_id is not null
do nothing;

update public.stories s
set episode_id = e.id
from public.episodes e
where s.episode_id is null
  and s.youtube_video_id = e.youtube_video_id;

commit;
