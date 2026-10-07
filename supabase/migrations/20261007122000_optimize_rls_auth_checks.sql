begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Cache auth lookups once per statement instead of re-evaluating them for
-- every candidate row. Existing overlapping admin policies are retained but
-- moved to service_role after their checks are folded into the user policy.
-- service_role bypasses RLS, so this preserves application access while
-- leaving only one effective authenticated policy per action.

alter policy "users can read their own admin_users row"
  on public.admin_users
  to authenticated
  using ((select auth.uid()) = user_id);

alter policy profiles_insert_own
  on public.profiles
  to authenticated
  with check ((select auth.uid()) = id);

alter policy profiles_select_own
  on public.profiles
  to authenticated
  using (
    (select auth.uid()) = id
    or (select public.is_admin())
  );

alter policy profiles_admin_read_all
  on public.profiles
  to service_role
  using (true);

alter policy profiles_update_own
  on public.profiles
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

alter policy profile_update_own
  on public.profiles
  to service_role
  using (true)
  with check (true);

alter policy push_devices_delete_own
  on public.push_devices
  to authenticated
  using ((select auth.uid()) = user_id);

alter policy push_devices_insert_own
  on public.push_devices
  to authenticated
  with check ((select auth.uid()) = user_id);

alter policy push_devices_select_own
  on public.push_devices
  to authenticated
  using ((select auth.uid()) = user_id);

alter policy push_devices_update_own
  on public.push_devices
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "Users delete own follows"
  on public.show_followers
  to authenticated
  using (
    (select auth.uid()) = user_id
    or email = ((select auth.jwt()) ->> 'email')
  );

alter policy "Users see own follows"
  on public.show_followers
  to authenticated
  using (
    (select auth.uid()) = user_id
    or email = ((select auth.jwt()) ->> 'email')
  );

alter policy "Authorized editorial update of stories"
  on public.stories
  to authenticated
  using (
    exists (
      select 1
      from public.admin_users au
      where au.user_id = (select auth.uid())
        and au.active = true
        and (
          au.role = 'admin'
          or (
            au.role = 'approver'
            and stories.status = any (array['pending'::text, 'preapproved'::text])
          )
        )
    )
  )
  with check (
    exists (
      select 1
      from public.admin_users au
      where au.user_id = (select auth.uid())
        and au.active = true
        and (
          au.role = 'admin'
          or (
            au.role = 'approver'
            and stories.status = any (
              array['pending'::text, 'preapproved'::text, 'rejected'::text]
            )
          )
        )
    )
  );

alter policy "users delete own reactions only"
  on public.story_reactions
  to authenticated
  using ((select auth.uid()) = user_id);

alter policy "users insert own reactions only"
  on public.story_reactions
  to authenticated
  with check ((select auth.uid()) = user_id);

alter policy "users read own reactions only"
  on public.story_reactions
  to authenticated
  using (
    (select auth.uid()) = user_id
    or (select public.is_admin())
  );

alter policy story_reactions_admin_read_all
  on public.story_reactions
  to service_role
  using (true);

alter policy "users update own reactions only"
  on public.story_reactions
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy user_follows_delete_own
  on public.user_follows
  to authenticated
  using ((select auth.uid()) = user_id);

alter policy user_follows_insert_own
  on public.user_follows
  to authenticated
  with check ((select auth.uid()) = user_id);

alter policy user_follows_select_own
  on public.user_follows
  to authenticated
  using ((select auth.uid()) = user_id);

alter policy notification_preferences_delete_own
  on public.user_notification_preferences
  to authenticated
  using ((select auth.uid()) = user_id);

alter policy notification_preferences_insert_own
  on public.user_notification_preferences
  to authenticated
  with check ((select auth.uid()) = user_id);

alter policy notification_preferences_select_own
  on public.user_notification_preferences
  to authenticated
  using ((select auth.uid()) = user_id);

alter policy notification_preferences_update_own
  on public.user_notification_preferences
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy saved_delete_own
  on public.user_saved_stories
  to authenticated
  using ((select auth.uid()) = user_id);

alter policy saved_insert_own
  on public.user_saved_stories
  to authenticated
  with check ((select auth.uid()) = user_id);

alter policy saved_select_own
  on public.user_saved_stories
  to authenticated
  using (
    (select auth.uid()) = user_id
    or (select public.is_admin())
  );

alter policy saved_admin_read_all
  on public.user_saved_stories
  to service_role
  using (true);

commit;
