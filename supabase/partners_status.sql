-- Suivi des partenaires d'affiliation : statut (actif / en attente / refusé / en pause), réseau, notes.
-- « enabled » (qui active la réécriture des liens) suit le statut : seul un partenaire « actif » parraine les liens.

alter table public.affiliate_programs
  add column if not exists network text,
  add column if not exists status text not null default 'active' check (status in ('active', 'pending', 'declined', 'paused')),
  add column if not exists notes text,
  add column if not exists status_checked_at timestamptz;

update public.affiliate_programs set network = case
    when template like '%awin1.com%' then 'Awin'
    when domain like 'amazon.%' then 'Amazon Partenaires'
    when domain = 'bol.com' then 'Bol.com Partner'
    when domain = '*' then 'Skimlinks'
    else coalesce(network, 'Autre') end
  where network is null;
update public.affiliate_programs set status = case when enabled then 'active' else 'pending' end;

create or replace function public.admin_partners()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Accès refusé'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'label', label, 'domain', domain, 'network', network, 'status', status, 'enabled', enabled,
      'notes', notes, 'checked_at', status_checked_at,
      'merchant_id', substring(template from 'awinmid=([0-9]+)')
    ) order by case status when 'active' then 0 when 'pending' then 1 when 'paused' then 2 else 3 end, label)
    from affiliate_programs), '[]'::jsonb);
end $$;
revoke all on function public.admin_partners() from public, anon;
grant execute on function public.admin_partners() to authenticated;

create or replace function public.admin_set_partner(p_id uuid, p_status text, p_notes text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Accès refusé'; end if;
  if p_status not in ('active', 'pending', 'declined', 'paused') then raise exception 'Statut inconnu'; end if;
  update affiliate_programs
     set status = p_status, enabled = (p_status = 'active'), notes = nullif(trim(coalesce(p_notes, '')), ''), status_checked_at = now()
   where id = p_id;
end $$;
revoke all on function public.admin_set_partner(uuid, text, text) from public, anon;
grant execute on function public.admin_set_partner(uuid, text, text) to authenticated;
