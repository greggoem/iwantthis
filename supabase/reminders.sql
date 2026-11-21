-- =====================================================================
--  Relances par e-mail, envoyées automatiquement chaque jour (pg_cron → fonction Edge send-reminders)
--  et aussi possibles à la main depuis l'administration.
--  • activation : 1 jour après l'inscription, compte jamais connecté ou sans liste
--  • first_wish : 3 jours après l'inscription, liste créée mais aucune envie (rappel des extensions / du partage)
--  Chaque personne reçoit chaque relance une seule fois (reminder_log). Une 2e relance viendra plus tard (autre « kind »).
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
     and u.created_at < now() - case p_kind when 'first_wish' then interval '3 days' else interval '1 day' end
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
-- p_admin null = envoi automatique quotidien (seul le serveur peut appeler cette fonction)
create or replace function public.request_reminder_emails(p_kind text, p_admin uuid)
returns table (user_id uuid, email text, display_name text)
language plpgsql security definer set search_path = public as $$
begin
  if p_admin is not null and not exists (select 1 from admins where admins.user_id = p_admin) then raise exception 'Accès refusé'; end if;
  if p_kind not in ('activation', 'first_wish') then raise exception 'Relance inconnue'; end if;
  return query
    with t as (select * from public.reminder_targets(p_kind) limit 300),
         ins as (insert into reminder_log (user_id, kind) select t.user_id, p_kind from t on conflict do nothing returning reminder_log.user_id)
    select t.user_id, t.email, t.display_name from t join ins on ins.user_id = t.user_id;
end $$;
revoke all on function public.request_reminder_emails(text, uuid) from public, anon, authenticated;
grant execute on function public.request_reminder_emails(text, uuid) to service_role;

-- Envoi automatique : au plus une fois par heure, même si l'adresse de la fonction est appelée par quelqu'un d'autre
create table if not exists public.reminder_state (id int primary key default 1 check (id = 1), last_auto timestamptz);
alter table public.reminder_state enable row level security;
revoke all on public.reminder_state from anon, authenticated;
insert into public.reminder_state (id) values (1) on conflict do nothing;

create or replace function public.claim_auto_reminders()
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update reminder_state set last_auto = now() where id = 1 and (last_auto is null or last_auto < now() - interval '1 hour');
  return found;
end $$;
revoke all on function public.claim_auto_reminders() from public, anon, authenticated;
grant execute on function public.claim_auto_reminders() to service_role;

-- Tous les jours à 8h UTC (9h en hiver, 10h en été à Bruxelles)
create extension if not exists pg_net;
create extension if not exists pg_cron;
select cron.unschedule('iwt-reminders') where exists (select 1 from cron.job where jobname = 'iwt-reminders');
select cron.schedule('iwt-reminders', '0 8 * * *', $cron$
  select net.http_post(
    url := 'https://enycxafzvcgprfsfkvvc.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVueWN4YWZ6dmNncHJmc2ZrdnZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM0NjYyNzcsImV4cCI6MjEwOTA0MjI3N30.8xX21a9UEUeF2_S66zes0zZmQ9HLInJZCaCVxzfIzPU'),
    body := '{"auto": true}'::jsonb)
$cron$);
