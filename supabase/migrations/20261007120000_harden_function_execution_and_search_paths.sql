begin;

-- Pin name resolution for functions flagged by the Supabase security advisor.
alter function public.get_story_reaction_aggregates(bigint[])
  set search_path = public, pg_temp;
alter function public.extract_youtube_video_id(text)
  set search_path = public, pg_temp;
alter function public.notify_indexnow_on_approval()
  set search_path = public, pg_temp;
alter function public.enforce_verified_youtube_attribution_on_approval()
  set search_path = public, pg_temp;

-- admin_users already grants authenticated SELECT behind an own-row RLS
-- policy, so this helper does not need owner privileges to answer the question.
alter function public.is_admin() security invoker;

-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default. These
-- functions are trigger helpers or privileged worker RPCs and must not be
-- reachable through PostgREST by anonymous or ordinary authenticated users.
revoke execute on function public.claim_youtube_pipeline_job()
  from public, anon, authenticated;
revoke execute on function public.enqueue_youtube_pipeline_job(text, text, text, text, timestamptz, boolean)
  from public, anon, authenticated;
revoke execute on function public.finish_youtube_pipeline_job(uuid, text, jsonb, text, integer)
  from public, anon, authenticated;

grant execute on function public.claim_youtube_pipeline_job() to service_role;
grant execute on function public.enqueue_youtube_pipeline_job(text, text, text, text, timestamptz, boolean) to service_role;
grant execute on function public.finish_youtube_pipeline_job(uuid, text, jsonb, text, integer) to service_role;

revoke execute on function public.handle_new_user()
  from public, anon, authenticated;
revoke execute on function public.notify_indexnow_on_approval()
  from public, anon, authenticated;
revoke execute on function public.refresh_episode_publication(integer)
  from public, anon, authenticated;
revoke execute on function public.rls_auto_enable()
  from public, anon, authenticated;
revoke execute on function public.sync_episode_publication_from_story()
  from public, anon, authenticated;
revoke execute on function public.enforce_verified_youtube_attribution_on_approval()
  from public, anon, authenticated;

-- is_admin() is used by signed-in editorial RLS policies, but has no logged-out
-- use. Keep only the authenticated role's deliberate access.
revoke execute on function public.is_admin()
  from public, anon;
grant execute on function public.is_admin() to authenticated;

-- These two read-only aggregate RPCs power public reaction totals. Remove the
-- broad PUBLIC grant while preserving their explicit website roles.
revoke execute on function public.get_story_reaction_aggregates(bigint[])
  from public;
grant execute on function public.get_story_reaction_aggregates(bigint[])
  to anon, authenticated;

revoke execute on function public.get_story_reactions(bigint)
  from public;
grant execute on function public.get_story_reactions(bigint)
  to anon, authenticated;

commit;
