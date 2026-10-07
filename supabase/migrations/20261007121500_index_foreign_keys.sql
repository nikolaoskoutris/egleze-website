begin;

create index if not exists clips_story_id_idx
  on public.clips (story_id);

create index if not exists episodes_show_id_idx
  on public.episodes (show_id);

create index if not exists episodes_summary_source_story_id_idx
  on public.episodes (summary_source_story_id);

create index if not exists notification_outbox_publication_event_id_idx
  on public.notification_outbox (publication_event_id);

create index if not exists notification_outbox_story_id_idx
  on public.notification_outbox (story_id);

create index if not exists push_devices_user_id_idx
  on public.push_devices (user_id);

create index if not exists social_accounts_connected_by_idx
  on public.social_accounts (connected_by);

create index if not exists stories_approved_by_idx
  on public.stories (approved_by);

create index if not exists stories_rejected_by_idx
  on public.stories (rejected_by);

commit;
