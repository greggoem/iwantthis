-- =====================================================================
--  Notifications dans le site + invitation avec accord de la personne (+ e-mail)
--  (à exécuter après schema.sql et event_invites.sql)
-- =====================================================================
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  kind       text not null default 'info',
  title      text not null check (char_length(title) between 1 and 200),
  body       text check (char_length(body) <= 500),
  link       text check (link is null or link ~ '^/[A-Za-z0-9/_-]*$'),   -- chemin interne du site uniquement
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index if not exists notifications_user_idx on public.notifications(user_id, created_at desc);

alter table public.notifications enable row level security;
create policy notifications_select on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete on public.notifications for delete to authenticated using (user_id = auth.uid());
-- pas d'INSERT : les notifications sont créées par les fonctions du serveur
revoke all on public.notifications from anon;
revoke insert, update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

-- Ajout d'un invité : TOUJOURS une invitation en attente (la personne doit accepter).
-- Si l'adresse correspond à un compte existant, elle reçoit en plus une notification dans le site.
-- Renvoie 'invited_notified' (compte existant, notifié) ou 'invited' (pas encore de compte).
alter table public.event_invites add column if not exists emailed_at timestamptz;

drop function if exists public.add_event_invite(uuid, text, text);
create or replace function public.add_event_invite(p_event uuid, p_name text, p_email text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(coalesce(p_email, ''))); v_name text := trim(coalesce(p_name, ''));
  v_n int; v_user uuid; v_ev events%rowtype; v_org text; v_new boolean;
begin
  if not public.is_event_creator(p_event) then raise exception 'Seul l''organisateur peut inviter des personnes'; end if;
  if v_name = '' then raise exception 'Indiquez le nom de la personne'; end if;
  if char_length(v_name) > 80 then raise exception 'Nom trop long (80 caractères maximum)'; end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or char_length(v_email) > 200 then raise exception 'Adresse e-mail invalide'; end if;
  if exists (select 1 from event_members m join auth.users u on u.id = m.user_id where m.event_id = p_event and lower(u.email) = v_email) then
    raise exception 'Cette personne participe déjà à l''événement';
  end if;
  select count(*) into v_n from event_invites where event_id = p_event;
  if v_n >= 100 and not exists (select 1 from event_invites where event_id = p_event and email = v_email) then
    raise exception 'Maximum 100 invitations en attente par événement';
  end if;

  insert into event_invites (event_id, name, email) values (p_event, v_name, v_email)
  on conflict (event_id, email) do update set name = excluded.name
  returning (xmax = 0) into v_new;

  select u.id into v_user from auth.users u where lower(u.email) = v_email limit 1;
  if v_user is not null and exists (select 1 from profiles where id = v_user) then
    if v_new then
      select * into v_ev from events where id = p_event;
      select display_name into v_org from profiles where id = auth.uid();
      insert into notifications (user_id, kind, title, body, link)
      values (v_user, 'event_invite',
              coalesce(v_org, 'Un proche') || ' vous invite à « ' || v_ev.name || ' »',
              'Événement du ' || to_char(v_ev.event_date, 'DD/MM/YYYY') || '. Ouvrez « Événements » pour rejoindre ou refuser : vos listes ne seront visibles qu''après votre accord.',
              '/evenements');
    end if;
    return 'invited_notified';
  end if;
  return 'invited';
end $$;
revoke all on function public.add_event_invite(uuid, text, text) from public, anon;
grant execute on function public.add_event_invite(uuid, text, text) to authenticated;

-- Autorise l'envoi d'un e-mail d'invitation (organisateur seulement, une fois toutes les 2 minutes par invité) et renvoie son contenu
create or replace function public.request_invite_email(p_event uuid, p_email text)
returns table (invite_name text, invite_email text, event_name text, event_date date, invite_code text, image_url text, organizer text)
language plpgsql security definer set search_path = public as $$
declare v_email text := lower(trim(coalesce(p_email, ''))); v_inv event_invites%rowtype;
begin
  if auth.uid() is null then raise exception 'Non connecté'; end if;
  if not public.is_event_creator(p_event) then raise exception 'Seul l''organisateur peut envoyer des invitations'; end if;
  select * into v_inv from event_invites where event_id = p_event and email = v_email for update;
  if not found then raise exception 'Invitation introuvable'; end if;
  if v_inv.emailed_at is not null and v_inv.emailed_at > now() - interval '2 minutes' then
    raise exception 'Un e-mail vient d''être envoyé à cette adresse : réessayez dans quelques minutes';
  end if;
  update event_invites set emailed_at = now() where id = v_inv.id;
  return query
    select v_inv.name, v_inv.email, e.name, e.event_date, e.invite_code, e.image_url, p.display_name
      from events e join profiles p on p.id = e.created_by where e.id = p_event;
end $$;
revoke all on function public.request_invite_email(uuid, text) from public, anon;
grant execute on function public.request_invite_email(uuid, text) to authenticated;
