-- Auth deletion stays in the supported Auth Admin API. This trigger keeps
-- associated data cleanup in that same database transaction.
create schema if not exists private;

create table private.egleze_apple_credentials (
  user_id uuid primary key references auth.users(id) on delete cascade,
  secret_id uuid not null unique references vault.secrets(id),
  client_id text not null,
  updated_at timestamptz not null default now()
);
alter table private.egleze_apple_credentials enable row level security;
revoke all on private.egleze_apple_credentials from public, anon, authenticated;

create function private.egleze_session_active()
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  session_id_text text := auth.jwt()->>'session_id';
begin
  if auth.uid() is null or session_id_text is null or
     session_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return exists (
    select 1 from auth.sessions s
    where s.id = session_id_text::uuid and s.user_id = auth.uid()
      and (s.not_after is null or s.not_after > now())
  );
end;
$$;
revoke all on function private.egleze_session_active() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.egleze_session_active() to authenticated;

create function public.egleze_session_active()
returns boolean language sql stable security invoker set search_path = '' as $$
  select private.egleze_session_active();
$$;
revoke all on function public.egleze_session_active() from public, anon;
grant execute on function public.egleze_session_active() to authenticated;

-- These RPCs are service-only. The Edge Function verifies the caller's live
-- session and validates the Apple subject before sending the verified user ID.
-- No browser role receives permission to read or write provider credentials.
create function private.egleze_store_apple_credential(p_user_id uuid, p_token text, p_client_id text)
returns void language plpgsql security definer set search_path = '' as $$
declare secret_uuid uuid;
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_token is null or length(p_token) not between 1 and 8192 or
     p_client_id is distinct from 'com.egleze.app.signin' then
    raise exception 'invalid credential input' using errcode = '22023';
  end if;
  -- Lock the user to serialize concurrent captures and account deletion.
  perform 1 from auth.users where id = p_user_id for update;
  if not found then raise exception 'user not found' using errcode = '22023'; end if;
  select secret_id into secret_uuid from private.egleze_apple_credentials where user_id = p_user_id;
  if secret_uuid is null then
    secret_uuid := vault.create_secret(p_token, null, 'Egleze Apple account revocation');
    insert into private.egleze_apple_credentials(user_id, secret_id, client_id)
      values(p_user_id, secret_uuid, p_client_id);
  else
    perform vault.update_secret(secret_uuid, p_token);
    update private.egleze_apple_credentials set client_id = p_client_id, updated_at = now()
      where user_id = p_user_id;
  end if;
end;
$$;

create function private.egleze_get_apple_credential(p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object('refresh_token', v.decrypted_secret, 'client_id', c.client_id)
    from private.egleze_apple_credentials c
    join vault.decrypted_secrets v on v.id = c.secret_id
    where c.user_id = p_user_id
  );
end;
$$;

create function public.egleze_store_apple_credential(p_user_id uuid, p_token text, p_client_id text)
returns void language sql security invoker set search_path = '' as $$
  select private.egleze_store_apple_credential(p_user_id, p_token, p_client_id);
$$;
create function public.egleze_get_apple_credential(p_user_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.egleze_get_apple_credential(p_user_id);
$$;
revoke all on function private.egleze_store_apple_credential(uuid,text,text) from public, anon, authenticated;
revoke all on function private.egleze_get_apple_credential(uuid) from public, anon, authenticated;
revoke all on function public.egleze_store_apple_credential(uuid,text,text) from public, anon, authenticated;
revoke all on function public.egleze_get_apple_credential(uuid) from public, anon, authenticated;
grant usage on schema private to service_role;
grant execute on function private.egleze_store_apple_credential(uuid,text,text) to service_role;
grant execute on function private.egleze_get_apple_credential(uuid) to service_role;
grant execute on function public.egleze_store_apple_credential(uuid,text,text) to service_role;
grant execute on function public.egleze_get_apple_credential(uuid) to service_role;

create function private.egleze_cleanup_deleted_account()
returns trigger language plpgsql security definer set search_path = '' as $$
declare secret_uuid uuid;
begin
  -- Trigger-only, never callable by app roles. OLD.id is the actual deleted
  -- Auth row, not a client-supplied target. Failure rolls back Auth deletion.
  delete from public.story_views where user_id = old.id;
  delete from public.share_events where user_id = old.id;
  update public.stories set approved_by = null where approved_by = old.id;
  update public.stories set rejected_by = null where rejected_by = old.id;
  if old.email_confirmed_at is not null and old.email is not null then
    delete from public.subscribers where lower(email) = lower(old.email);
    delete from public.show_followers where user_id is null and lower(email) = lower(old.email);
    delete from public.api_leads where lower(email) = lower(old.email);
    delete from public.partner_requests where lower(email) = lower(old.email);
  end if;
  select secret_id into secret_uuid from private.egleze_apple_credentials where user_id = old.id;
  delete from private.egleze_apple_credentials where user_id = old.id;
  if secret_uuid is not null then delete from vault.secrets where id = secret_uuid; end if;
  -- Existing Auth foreign keys cascade profiles, saved stories, reactions,
  -- follows, notification preferences, devices and queued notifications.
  return old;
end;
$$;
revoke all on function private.egleze_cleanup_deleted_account() from public, anon, authenticated, service_role;
create trigger egleze_cleanup_deleted_account
  before delete on auth.users for each row
  execute function private.egleze_cleanup_deleted_account();
