-- Egleze privacy-safe first-party analytics foundation.
-- Raw IP addresses and full user-agent strings are deliberately not stored.
-- Browser roles have no direct access; writes must pass through the validated
-- same-origin /api/pulse server boundary.

create table if not exists public.analytics_events (
  event_id uuid primary key,
  event_name text not null
    check (event_name in (
      'page_view',
      'source_open',
      'video_started',
      'engaged_30s',
      'scroll_depth',
      'share_completed',
      'signup_completed',
      'search_submitted',
      'save_completed',
      'unsave_completed',
      'follow_completed',
      'unfollow_completed',
      'reaction_completed'
    )),
  occurred_at timestamptz not null default now(),
  path text not null
    check (path like '/%' and char_length(path) <= 500),
  content_kind text not null default 'page'
    check (content_kind in ('story', 'episode', 'show', 'topic', 'page')),
  content_id bigint,
  referrer_host text
    check (referrer_host is null or char_length(referrer_host) <= 255),
  utm_source text
    check (utm_source is null or char_length(utm_source) <= 120),
  utm_medium text
    check (utm_medium is null or char_length(utm_medium) <= 120),
  utm_campaign text
    check (utm_campaign is null or char_length(utm_campaign) <= 160),
  utm_content text
    check (utm_content is null or char_length(utm_content) <= 160),
  utm_term text
    check (utm_term is null or char_length(utm_term) <= 160),
  country_code text
    check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  device_type text not null default 'desktop'
    check (device_type in ('desktop', 'mobile', 'tablet')),
  consent_state text not null default 'unknown'
    check (consent_state in ('accepted', 'rejected', 'unknown')),
  session_id uuid,
  properties jsonb not null default '{}'::jsonb
    check (
      jsonb_typeof(properties) = 'object'
      and octet_length(properties::text) <= 512
    ),
  inserted_at timestamptz not null default now(),
  check (session_id is null or consent_state = 'accepted')
);

comment on table public.analytics_events is
  'Privacy-minimised aggregate page and product events. No raw IP, full user-agent, email, or cross-site identifier.';
comment on column public.analytics_events.session_id is
  'Optional per-tab session UUID created only after explicit analytics consent.';
comment on column public.analytics_events.referrer_host is
  'Hostname only; paths, query strings, and fragments are discarded.';

create index if not exists analytics_events_occurred_at_idx
  on public.analytics_events (occurred_at desc);
create index if not exists analytics_events_event_time_idx
  on public.analytics_events (event_name, occurred_at desc);
create index if not exists analytics_events_path_time_idx
  on public.analytics_events (path, occurred_at desc);
create index if not exists analytics_events_content_time_idx
  on public.analytics_events (content_kind, content_id, occurred_at desc)
  where content_id is not null;
create index if not exists analytics_events_campaign_time_idx
  on public.analytics_events (utm_source, utm_campaign, occurred_at desc)
  where utm_source is not null;
create index if not exists analytics_events_session_time_idx
  on public.analytics_events (session_id, occurred_at desc)
  where session_id is not null;

alter table public.analytics_events enable row level security;

revoke all on table public.analytics_events from anon, authenticated;
grant select, insert, delete on table public.analytics_events to service_role;

-- story_views was never wired and its unrestricted anonymous insert policy
-- would permit unvalidated writes if a browser client started using it.
drop policy if exists story_views_insert_anon on public.story_views;
revoke insert on table public.story_views from anon, authenticated;

-- Enforce the published 180-day event retention automatically.
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

do $retention$
begin
  if not exists (
    select 1 from cron.job where jobname = 'egleze-analytics-retention'
  ) then
    perform cron.schedule(
      'egleze-analytics-retention',
      '17 3 * * *',
      $job$delete from public.analytics_events where occurred_at < now() - interval '180 days'$job$
    );
  end if;
end
$retention$;
