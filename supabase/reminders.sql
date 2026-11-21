-- =====================================================================
--  Relances par e-mail (déclenchées depuis l'administration)
--  • activation : compte créé mais jamais connecté, ou sans liste
--  • first_wish : liste créée mais aucune envie (rappel de l'extension / du bouton de partage)
--  Chaque personne reçoit chaque relance une seule fois (reminder_log), au plus tôt 1 jour après l'inscription.
-- =====================================================================

create table if not exists public.reminder_log (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind    text not null check (kind in ('activation', 'first_wish')),
  sent_at timestamptz not null default now(),
  primary key (user_id, kind)
);
alter table public.reminder_log enable row level security;
revoke all on public.reminder_log from anon, authenticated;

-- Personnes concernées par une relance (pas encore relancées)
create or replace function public.reminder_targets(p_kind text)
returns table (user_id uuid, email text, display_name text)
language sql stable security definer set search_path = public, auth as $$
  select u.id, u.email::text, coalesce(p.display_name, u.raw_user_meta_data->>'display_name', u.raw_user_meta_data->>'full_name')
    from auth.users u
    left join profiles p on p.id = u.id
   where u.email is not null
     and u.created_at < now() - interval '1 day'
     and not exists (select 1 from reminder_log r where r.user_id = u.id and r.kind = p_kind)
     and case p_kind
       when 'activation' then
            u.last_sign_in_at is null
         or not exists (select 1 from wishlists w where w.owner_id = u.id)
       when 'first_wish' then
            u.last_sign_in_at is not null
        and exists (select 1 from wishlists w where w.owner_id = u.id and w.child_name is null)
        and not exists (select 1 from items i join wishlists w on w.id = i.list_id
                         where w.owner_id = u.id and not coalesce(i.is_group, false))
       else false
     end
$$;
revoke all on function public.reminder_targets(text) from public, anon, authenticated;

-- Administration : combien de personnes à relancer, et combien déjà relancées
create or replace function public.admin_reminders()
returns table (kind text, pending bigint, sent bigint, last_sent timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Accès refusé'; end if;
  return query
    select k.kind,
           (select count(*) from public.reminder_targets(k.kind)),
           (select count(*) from reminder_log r where r.kind = k.kind),
           (select max(sent_at) from reminder_log r where r.kind = k.kind)
      from (values ('activation'), ('first_wish')) as k(kind);
end $$;
revoke all on function public.admin_reminders() from public, anon;
grant execute on function public.admin_reminders() to authenticated;

-- Réservé au serveur (fonction Edge « send-reminders ») : réserve jusqu'à 300 destinataires et les note comme relancés
create or replace function public.request_reminder_emails(p_kind text, p_admin uuid)
returns table (user_id uuid, email text, display_name text)
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from admins where admins.user_id = p_admin) then raise exception 'Accès refusé'; end if;
  if p_kind not in ('activation', 'first_wish') then raise exception 'Relance inconnue'; end if;
  return query
    with t as (select * from public.reminder_targets(p_kind) limit 300),
         ins as (insert into reminder_log (user_id, kind) select t.user_id, p_kind from t on conflict do nothing returning reminder_log.user_id)
    select t.user_id, t.email, t.display_name from t join ins on ins.user_id = t.user_id;
end $$;
revoke all on function public.request_reminder_emails(text, uuid) from public, anon, authenticated;
grant execute on function public.request_reminder_emails(text, uuid) to service_role;
