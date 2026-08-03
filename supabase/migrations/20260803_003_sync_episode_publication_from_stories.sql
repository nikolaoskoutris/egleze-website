create or replace function public.refresh_episode_publication(p_episode_id integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_episode_id is null then
    return;
  end if;

  update public.episodes e
  set status = case
        when exists (
          select 1
          from public.stories s
          where s.episode_id = p_episode_id
            and s.status = 'approved'
        ) then 'published'
        else 'draft'
      end,
      updated_at = now()
  where e.id = p_episode_id
    and coalesce(e.metadata_conflict_count, 0) = 0
    and e.status <> 'review';
end;
$$;

create or replace function public.sync_episode_publication_from_story()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_episode_publication(old.episode_id);
    return old;
  end if;

  if tg_op = 'UPDATE' and old.episode_id is distinct from new.episode_id then
    perform public.refresh_episode_publication(old.episode_id);
  end if;

  perform public.refresh_episode_publication(new.episode_id);
  return new;
end;
$$;

drop trigger if exists stories_sync_episode_publication on public.stories;

create trigger stories_sync_episode_publication
after insert or delete or update of status, episode_id
on public.stories
for each row
execute function public.sync_episode_publication_from_story();
