-- Tableau de bord : liens sponsorisés (couverture des liens d'envies par les programmes partenaires)
create or replace function public.admin_links()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.is_admin() then raise exception 'Accès refusé'; end if;
  with it as (
    select i.id, lower(regexp_replace(substring(i.url from '^[A-Za-z][A-Za-z0-9+.-]*://([^/:?#]+)'), '^www\.', '')) host,
           exists (select 1 from item_claims c where c.item_id = i.id) claimed
    from items i where not i.is_group and i.url is not null
  ),
  m as (
    select it.*, p.label, p.status, p.enabled, p.network
    from it left join lateral (
      select * from affiliate_programs p
      where p.domain not in ('*', '?') and (it.host = lower(p.domain) or it.host like '%.' || lower(p.domain))
      order by p.enabled desc limit 1) p on true
    where it.host is not null
  )
  select jsonb_build_object(
    'total', (select count(*) from m),
    'sponsored', (select count(*) from m where enabled),
    'sponsored_claimed', (select count(*) from m where enabled and claimed),
    'pending', (select count(*) from m where not enabled and status = 'pending'),
    'fallback_active', exists (select 1 from affiliate_programs where domain = '*' and enabled),
    'by_partner', (select coalesce(jsonb_agg(x order by x.n desc, x.label), '[]') from (
        select p.label, p.network, p.status, p.enabled,
               (select count(*) from m where m.label = p.label) n,
               (select count(*) from m where m.label = p.label and m.claimed) claimed
        from affiliate_programs p where p.domain not in ('*', '?') and (p.enabled or exists (select 1 from m where m.label = p.label))) x),
    'top_free', (select coalesce(jsonb_agg(x order by x.n desc, x.host), '[]') from (
        select host, count(*) n, count(*) filter (where claimed) claimed from m where label is null group by host order by count(*) desc, host limit 12) x)
  ) into r;
  return r;
end $$;
revoke all on function public.admin_links() from public, anon;
grant execute on function public.admin_links() to authenticated;
