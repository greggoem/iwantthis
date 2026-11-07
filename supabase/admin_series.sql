-- Tableau de bord : séries par jour / semaine / mois (chiffres agrégés uniquement)
create or replace function public.admin_series(p_unit text default 'day')
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare
  u text := case when p_unit in ('day','week','month') then p_unit else 'day' end;
  n int := case u when 'day' then 30 when 'week' then 16 else 12 end;
  step interval := case u when 'day' then interval '1 day' when 'week' then interval '1 week' else interval '1 month' end;
  t_end date := date_trunc(u, (now() at time zone 'Europe/Brussels'))::date;
  t_start date := (t_end - step * (n - 1))::date;
  r jsonb;
begin
  if not public.is_admin() then raise exception 'Accès refusé'; end if;
  with b as (select g::date as d from generate_series(t_start, t_end, step) g),
  k as (
    select 'users' s, date_trunc(u, created_at at time zone 'Europe/Brussels')::date d from auth.users
    union all select 'lists', date_trunc(u, created_at at time zone 'Europe/Brussels')::date from wishlists
    union all select 'items', date_trunc(u, created_at at time zone 'Europe/Brussels')::date from items where not is_group
    union all select 'claims', date_trunc(u, created_at at time zone 'Europe/Brussels')::date from item_claims
    union all select 'shares', date_trunc(u, created_at at time zone 'Europe/Brussels')::date from list_access
    union all select 'events', date_trunc(u, created_at at time zone 'Europe/Brussels')::date from events
  ),
  before as (select s, count(*) c from k where d < t_start group by s)
  select jsonb_build_object(
    'unit', u,
    'buckets', (select jsonb_agg(d order by d) from b),
    'series', (select jsonb_object_agg(s.s, jsonb_build_object(
        'new', (select jsonb_agg((select count(*) from k where k.s = s.s and k.d = b.d) order by b.d) from b),
        'before', coalesce((select c from before where before.s = s.s), 0)))
      from (values ('users'),('lists'),('items'),('claims'),('shares'),('events')) s(s)),
    'list_sizes', (select jsonb_agg(jsonb_build_object('label', lbl, 'n', cnt) order by ord) from (
        select ord, lbl, count(w.id) cnt from (values (1,'0',0,0),(2,'1–5',1,5),(3,'6–10',6,10),(4,'11–20',11,20),(5,'21+',21,100000)) r(ord,lbl,lo,hi)
        left join (select w.id, (select count(*) from items i where i.list_id = w.id and not i.is_group) c from wishlists w) w on w.c between r.lo and r.hi
        group by ord, lbl) x),
    'favorites', (select count(*) from items where is_favorite and not is_group)
  ) into r;
  return r;
end $$;
revoke all on function public.admin_series(text) from public, anon;
grant execute on function public.admin_series(text) to authenticated;
