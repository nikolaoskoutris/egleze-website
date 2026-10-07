begin;

alter table public.stories
  add column if not exists claim_status text not null default 'speaker_claim',
  add column if not exists verification_notes text,
  add column if not exists supporting_sources jsonb not null default '[]'::jsonb,
  add column if not exists correction_note text,
  add column if not exists corrected_at timestamptz,
  add column if not exists claim_reviewed_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.stories'::regclass
      and conname = 'stories_claim_status_check'
  ) then
    alter table public.stories
      add constraint stories_claim_status_check
      check (claim_status in ('speaker_claim', 'independently_verified', 'disputed', 'unresolved'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.stories'::regclass
      and conname = 'stories_supporting_sources_check'
  ) then
    alter table public.stories
      add constraint stories_supporting_sources_check
      check (
        jsonb_typeof(supporting_sources) = 'array'
        and octet_length(supporting_sources::text) <= 20000
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.stories'::regclass
      and conname = 'stories_claim_evidence_check'
  ) then
    alter table public.stories
      add constraint stories_claim_evidence_check
      check (
        claim_status = 'speaker_claim'
        or nullif(btrim(verification_notes), '') is not null
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.stories'::regclass
      and conname = 'stories_correction_timestamp_check'
  ) then
    alter table public.stories
      add constraint stories_correction_timestamp_check
      check (
        nullif(btrim(correction_note), '') is null
        or corrected_at is not null
      );
  end if;
end $$;

create index if not exists stories_claim_status_approved_idx
  on public.stories (claim_status, approved_at desc)
  where status = 'approved';

comment on column public.stories.claim_status is
  'Truth-status of the underlying claim. Separate from attribution_status, which verifies who said it.';
comment on column public.stories.supporting_sources is
  'Editorially reviewed external sources as an array of objects with url and label.';
comment on column public.stories.correction_note is
  'Public correction explanation; corrected_at records when it was added or revised.';

revoke all on table public.stories from anon, authenticated;
grant select on table public.stories to anon, authenticated;
grant update on table public.stories to authenticated;

alter table public.analytics_events
  add column if not exists referrer_kind text;

update public.analytics_events
set referrer_kind = case
  when referrer_host is null and utm_source is null then 'direct'
  when referrer_host in ('egleze.com', 'www.egleze.com') then 'internal'
  when referrer_host ~* '(^|\.)(chatgpt\.com|openai\.com|perplexity\.ai|grok\.com|mistral\.ai)$'
    or coalesce(lower(utm_source), '') ~ '^(chatgpt|openai|perplexity|grok|mistral|ai-assistant)$'
    then 'ai_assistant'
  when referrer_host ~* '(^|\.)(google\.[a-z.]+|bing\.com|duckduckgo\.com|search\.brave\.com|yahoo\.com)$'
    then 'search'
  when referrer_host ~* '(^|\.)(linkedin\.com|facebook\.com|instagram\.com|tiktok\.com|x\.com|twitter\.com|threads\.net|youtube\.com)$'
    then 'social'
  else 'external'
end
where referrer_kind is null;

alter table public.analytics_events
  alter column referrer_kind set default 'external',
  alter column referrer_kind set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.analytics_events'::regclass
      and conname = 'analytics_events_referrer_kind_check'
  ) then
    alter table public.analytics_events
      add constraint analytics_events_referrer_kind_check
      check (referrer_kind in ('direct', 'internal', 'search', 'social', 'ai_assistant', 'external'));
  end if;
end $$;

create index if not exists analytics_events_referrer_kind_time_idx
  on public.analytics_events (referrer_kind, occurred_at desc);

create index if not exists analytics_events_ai_referrer_time_idx
  on public.analytics_events (referrer_host, occurred_at desc)
  where referrer_kind = 'ai_assistant';

comment on column public.analytics_events.referrer_kind is
  'Coarse privacy-safe acquisition class derived from hostname and UTM source.';

commit;
