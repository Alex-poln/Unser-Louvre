-- Supabase Auth inserts a user before applying app_metadata and email_confirm.
-- Check the final row at transaction end, keeping both requirements mandatory.
create or replace function public.activate_museum_invitation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  account auth.users%rowtype;
  invited_role text;
begin
  select * into account from auth.users where id = new.id;
  if not found then return new; end if;

  if TG_OP = 'INSERT' then
    if account.email_confirmed_at is null
       or (account.raw_app_meta_data->>'museum_provisioned') is distinct from 'true' then
      raise exception 'Public registration is disabled. An administrator must create museum accounts.';
    end if;
    if not exists (
      select 1 from public.museum_invitations where email = lower(account.email)
    ) then
      raise exception 'Registration is restricted to invited museum accounts';
    end if;
  end if;

  if account.email_confirmed_at is not null then
    delete from public.museum_invitations
      where email = lower(account.email)
      returning role into invited_role;
    if invited_role is not null then
      insert into public.museum_members(user_id, role)
        values(account.id, invited_role)
        on conflict(user_id) do update set role = excluded.role;
    end if;
  end if;
  return new;
end;
$function$;

-- Trigger-only function: retain the existing restriction on direct RPC calls.
revoke all on function public.activate_museum_invitation() from public, anon, authenticated, service_role;

drop trigger if exists activate_invited_museum_account on auth.users;
create constraint trigger activate_invited_museum_account
after insert or update of email_confirmed_at, email on auth.users
deferrable initially deferred
for each row execute function public.activate_museum_invitation();
