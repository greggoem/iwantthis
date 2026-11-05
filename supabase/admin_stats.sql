-- Tableau de bord administrateur : uniquement des chiffres agrégés (jamais de contenu, d'adresse e-mail ni de nom).

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;     -- aucune policy : illisible depuis l'API
revoke all on public.admins from anon, authenticated;

insert into public.admins (user_id)
  select id from auth.users where lower(email) = 'greggoem@gmail.com'
  on conflict do nothing;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid())
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create or replace function public.admin_stats()
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare r jsonb;
begin
  if not public.is_admin() then raise exception 'Accès refusé'; end if;
  select jsonb_build_object(
    'generated_at', now(),
    'users', (select jsonb_build_object(
        'total', count(*),
        'last7',  count(*) filter (where created_at >= now() - interval '7 days'),
        'last30', count(*) filter (where created_at >= now() - interval '30 days'),
        'active7',  count(*) filter (where last_sign_in_at >= now() - interval '7 days'),
        'active30', count(*) filter (where last_sign_in_at >= now() - interval '30 days'),
        'never_signed_in', count(*) filter (where last_sign_in_at is null),
        'google', count(*) filter (where raw_app_meta_data->>'provider' = 'google'),
        'email',  count(*) filter (where raw_app_meta_data->>'provider' = 'email'),
        'apple',  count(*) filter (where raw_app_meta_data->>'provider' = 'apple'))
      from auth.users),
    'themes', (select coalesce(jsonb_object_agg(t, n), '{}'::jsonb) from (
        select coalesce(raw_user_meta_data->>'theme', 'classique') t, count(*) n from auth.users group by 1) x),
    'signups_by_day', (select jsonb_agg(jsonb_build_object('day', d::date, 'n', coalesce(c.n, 0)) order by d)
        from generate_series((now() at time zone 'Europe/Brussels')::date - 29, (now() at time zone 'Europe/Brussels')::date, interval '1 day') d
        left join (select (created_at at time zone 'Europe/Brussels')::date as day, count(*) n from auth.users group by 1) c on c.day = d::date),
    'lists', jsonb_build_object(
        'total', (select count(*) from wishlists),
        'with_items', (select count(distinct list_id) from items),
        'shared_with_someone', (select count(distinct list_id) from list_access)),
    'items', (select jsonb_build_object(
        'total', count(*) filter (where not is_group),
        'groups', count(*) filter (where is_group),
        'last7', count(*) filter (where not is_group and created_at >= now() - interval '7 days'),
        'with_link', count(*) filter (where not is_group and url is not null),
        'with_image', count(*) filter (where not is_group and image_url is not null),
        'with_price', count(*) filter (where not is_group and price is not null)) from items),
    'claims', (select jsonb_build_object(
        'total', count(*),
        'discreet', count(*) filter (where discreet),
        'revealed', count(*) filter (where reveal_on < (now() at time zone 'Europe/Brussels')::date),
        'seen_by_owner', count(*) filter (where owner_seen_at is not null)) from item_claims),
    'events', jsonb_build_object(
        'total', (select count(*) from events),
        'upcoming', (select count(*) from events where event_date >= (now() at time zone 'Europe/Brussels')::date),
        'memberships', (select count(*) from event_members),
        'draws_done', (select count(*) from events where draw_done_at is not null),
        'draw_mails_sent', (select count(*) from events where draw_emailed_at is not null)),
    'invites', jsonb_build_object(
        'total', (select count(*) from event_invites),
        'emailed', (select count(*) from event_invites where emailed_at is not null)),
    'other', jsonb_build_object(
        'api_tokens', (select count(*) from api_tokens),
        'notifications', (select count(*) from notifications))
  ) into r;
  return r;
end $$;
revoke all on function public.admin_stats() from public, anon;
grant execute on function public.admin_stats() to authenticated;
