-- =====================================================================
--  Inviter plus facilement dans un événement
--  1. Tous les invités (pas seulement l'organisateur) peuvent inviter par nom + e-mail ;
--     chacun voit et gère les invitations qu'il a faites, l'organisateur les voit toutes.
--  2. « Mes proches » : les personnes déjà rencontrées sur le site (événement commun, liste partagée),
--     à inviter d'un clic, sans connaître ni afficher leur adresse e-mail.
--  3. Liste d'un proche sans compte (grand-parent…) : même mécanisme que les listes d'enfants,
--     avec managed_kind = 'proche'.
-- =====================================================================

alter table public.event_invites add column if not exists invited_by uuid references public.profiles(id) on delete set null;
alter table public.wishlists add column if not exists managed_kind text not null default 'enfant';
do $$ begin
  alter table public.wishlists add constraint wishlists_managed_kind_check check (managed_kind in ('enfant', 'proche'));
exception when duplicate_object then null; end $$;

-- Qui peut gérer une invitation : l'organisateur, ou l'invité qui l'a faite
create or replace function public.can_manage_invite(p_event uuid, p_by uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_event_creator(p_event) or (p_by = auth.uid() and public.is_event_member(p_event))
$$;
revoke all on function public.can_manage_invite(uuid, uuid) from public, anon;
grant execute on function public.can_manage_invite(uuid, uuid) to authenticated;

drop policy if exists invites_select on public.event_invites;
drop policy if exists invites_delete on public.event_invites;
create policy invites_select on public.event_invites for select to authenticated using (public.can_manage_invite(event_id, invited_by));
create policy invites_delete on public.event_invites for delete to authenticated using (public.can_manage_invite(event_id, invited_by));

-- Ajout d'un invité : organisateur OU invité de l'événement
create or replace function public.add_event_invite(p_event uuid, p_name text, p_email text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(coalesce(p_email, ''))); v_name text := trim(coalesce(p_name, ''));
  v_n int; v_user uuid; v_ev events%rowtype; v_org text; v_new boolean;
begin
  if not (public.is_event_creator(p_event) or public.is_event_member(p_event)) then
    raise exception 'Seuls les invités de l''événement peuvent inviter des personnes';
  end if;
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

  insert into event_invites (event_id, name, email, invited_by) values (p_event, v_name, v_email, auth.uid())
  on conflict (event_id, email) do update set name = case when public.can_manage_invite(event_invites.event_id, event_invites.invited_by) then excluded.name else event_invites.name end
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

create or replace function public.update_event_invite(p_invite uuid, p_name text, p_email text)
returns void language plpgsql security definer set search_path = public as $$
declare v_event uuid; v_by uuid; v_email text := lower(trim(coalesce(p_email, ''))); v_name text := trim(coalesce(p_name, ''));
begin
  select event_id, invited_by into v_event, v_by from event_invites where id = p_invite;
  if v_event is null then raise exception 'Invitation introuvable'; end if;
  if not public.can_manage_invite(v_event, v_by) then raise exception 'Seul l''organisateur ou la personne qui a invité peut modifier cette invitation'; end if;
  if v_name = '' then raise exception 'Indiquez le nom de la personne'; end if;
  if char_length(v_name) > 80 then raise exception 'Nom trop long (80 caractères maximum)'; end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or char_length(v_email) > 200 then raise exception 'Adresse e-mail invalide'; end if;
  if exists (select 1 from event_invites where event_id = v_event and email = v_email and id <> p_invite) then
    raise exception 'Cette adresse est déjà invitée à l''événement';
  end if;
  if exists (select 1 from event_members m join auth.users u on u.id = m.user_id where m.event_id = v_event and lower(u.email) = v_email) then
    raise exception 'Cette personne participe déjà à l''événement';
  end if;
  update event_invites set name = v_name, email = v_email where id = p_invite;
end $$;

-- Contenu de l'e-mail d'invitation (fonction Edge send-invite-email) ; « organizer » = la personne qui invite
create or replace function public.request_invite_email(p_event uuid, p_email text)
returns table (invite_name text, invite_email text, event_name text, event_date date, invite_code text, image_url text, organizer text)
language plpgsql security definer set search_path = public as $$
declare v_email text := lower(trim(coalesce(p_email, ''))); v_inv event_invites%rowtype;
begin
  if auth.uid() is null then raise exception 'Non connecté'; end if;
  select * into v_inv from event_invites where event_id = p_event and email = v_email for update;
  if not found then raise exception 'Invitation introuvable'; end if;
  if not public.can_manage_invite(p_event, v_inv.invited_by) then raise exception 'Vous ne pouvez pas envoyer cette invitation'; end if;
  if v_inv.emailed_at is not null and v_inv.emailed_at > now() - interval '2 minutes' then
    raise exception 'Un e-mail vient d''être envoyé à cette adresse : réessayez dans quelques minutes';
  end if;
  update event_invites set emailed_at = now() where id = v_inv.id;
  return query
    select v_inv.name, v_inv.email, e.name, e.event_date, e.invite_code, e.image_url,
           coalesce((select display_name from profiles where id = auth.uid()), p.display_name)
      from events e join profiles p on p.id = e.created_by where e.id = p_event;
end $$;

-- Même chose à partir de l'identifiant de l'invitation (invitation d'un proche : le site ne connaît pas son e-mail)
create or replace function public.request_invite_email_by_id(p_invite uuid)
returns table (invite_name text, invite_email text, event_name text, event_date date, invite_code text, image_url text, organizer text)
language plpgsql security definer set search_path = public as $$
declare v_event uuid; v_email text;
begin
  select event_id, email into v_event, v_email from event_invites where id = p_invite;
  if v_event is null then raise exception 'Invitation introuvable'; end if;
  return query select * from public.request_invite_email(v_event, v_email);
end $$;

-- Mes proches : comptes avec qui je partage un événement ou une liste (jamais leur e-mail)
create or replace function public.my_contacts(p_event uuid)
returns table (user_id uuid, display_name text, status text)
language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as id),
  people as (
    select m2.user_id as id from event_members m1 join event_members m2 on m2.event_id = m1.event_id, me
     where m1.user_id = me.id and m2.user_id <> me.id
    union select e.created_by from events e join event_members m on m.event_id = e.id, me where m.user_id = me.id and e.created_by <> me.id
    union select w.owner_id from list_access a join wishlists w on w.id = a.list_id, me where a.user_id = me.id and w.owner_id <> me.id
    union select a.user_id from list_access a join wishlists w on w.id = a.list_id, me where w.owner_id = me.id and a.user_id <> me.id
  )
  select p.id, pr.display_name,
         case when exists (select 1 from event_members m where m.event_id = p_event and m.user_id = p.id) then 'member'
              when exists (select 1 from event_invites i join auth.users u on lower(u.email) = i.email where i.event_id = p_event and u.id = p.id) then 'invited'
         end
    from people p join profiles pr on pr.id = p.id
   where (public.is_event_member(p_event) or public.is_event_creator(p_event))
     and pr.display_name is not null
   order by lower(pr.display_name)
$$;

-- Invite d'un clic des proches (uniquement parmi « mes proches »). Renvoie les invitations créées.
create or replace function public.invite_contacts(p_event uuid, p_users uuid[])
returns table (invite_id uuid, display_name text)
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if not (public.is_event_creator(p_event) or public.is_event_member(p_event)) then
    raise exception 'Seuls les invités de l''événement peuvent inviter des personnes';
  end if;
  if coalesce(array_length(p_users, 1), 0) > 50 then raise exception 'Cinquante personnes au maximum à la fois'; end if;
  for r in
    select c.user_id, c.display_name, lower(u.email) as email
      from public.my_contacts(p_event) c join auth.users u on u.id = c.user_id
     where c.user_id = any (p_users) and c.status is null
  loop
    perform public.add_event_invite(p_event, r.display_name, r.email);
    return query select i.id, r.display_name from event_invites i where i.event_id = p_event and i.email = r.email;
  end loop;
end $$;

-- Liste gérée (enfant ou proche sans compte)
drop function if exists public.create_child_list(text, text, text, boolean);
create or replace function public.create_child_list(p_name text, p_age text default null, p_color text default null, p_in_events boolean default true, p_kind text default 'enfant')
returns wishlists language plpgsql security definer set search_path = public as $$
declare v wishlists;
begin
  if auth.uid() is null then raise exception 'Non connecté'; end if;
  if (select count(*) from wishlists where owner_id = auth.uid() and child_name is not null) >= 10 then
    raise exception 'Vous gérez déjà 10 listes';
  end if;
  insert into wishlists (owner_id, title, child_name, child_age, child_color, in_events, managed_kind)
  values (auth.uid(), 'Ma liste d''envies', btrim(p_name), nullif(btrim(coalesce(p_age, '')), ''), p_color, coalesce(p_in_events, true),
          case when p_kind = 'proche' then 'proche' else 'enfant' end)
  returning * into v;
  return v;
end $$;

revoke all on function public.add_event_invite(uuid, text, text)                    from public, anon;
revoke all on function public.update_event_invite(uuid, text, text)                 from public, anon;
revoke all on function public.request_invite_email(uuid, text)                      from public, anon;
revoke all on function public.request_invite_email_by_id(uuid)                      from public, anon;
revoke all on function public.my_contacts(uuid)                                     from public, anon;
revoke all on function public.invite_contacts(uuid, uuid[])                         from public, anon;
revoke all on function public.create_child_list(text, text, text, boolean, text)    from public, anon;
grant execute on function public.add_event_invite(uuid, text, text)                 to authenticated;
grant execute on function public.update_event_invite(uuid, text, text)              to authenticated;
grant execute on function public.request_invite_email(uuid, text)                   to authenticated;
grant execute on function public.request_invite_email_by_id(uuid)                   to authenticated;
grant execute on function public.my_contacts(uuid)                                  to authenticated;
grant execute on function public.invite_contacts(uuid, uuid[])                      to authenticated;
grant execute on function public.create_child_list(text, text, text, boolean, text) to authenticated;

-- =====================================================================
--  Retirer une liste gérée (enfant, proche sans compte) d'un événement :
--  son propriétaire OU l'organisateur de l'événement
-- =====================================================================
create or replace function public.set_event_list_shown(p_event uuid, p_list uuid, p_shown boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
  select owner_id into v_owner from wishlists where id = p_list and child_name is not null;
  if v_owner is null then raise exception 'Liste introuvable'; end if;
  if not (v_owner = auth.uid() or (public.is_event_creator(p_event) and not coalesce(p_shown, false))) then
    raise exception 'Seul le parent ou l''organisateur peut retirer cette liste de l''événement';
  end if;
  if not exists (select 1 from event_members where event_id = p_event and user_id = v_owner) then
    raise exception 'Cette liste n''appartient pas à un invité de l''événement';
  end if;
  insert into event_child_lists (event_id, list_id, shown) values (p_event, p_list, coalesce(p_shown, false))
  on conflict (event_id, list_id) do update set shown = excluded.shown;
end $$;
revoke all on function public.set_event_list_shown(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_event_list_shown(uuid, uuid, boolean) to authenticated;

-- =====================================================================
--  Changement de date, d'heure ou de lieu : notification à tous les invités
--  (+ e-mail envoyé par la fonction Edge « send-event-update »)
-- =====================================================================
alter table public.events add column if not exists change_emailed_at timestamptz;

create or replace function public.notify_event_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_body text := '';
begin
  if new.event_date is distinct from old.event_date then
    v_body := v_body || 'Nouvelle date : ' || to_char(new.event_date, 'DD/MM/YYYY') || '. ';
  end if;
  if new.event_time is distinct from old.event_time then
    v_body := v_body || coalesce('Nouvelle heure : ' || replace(to_char(new.event_time, 'HH24:MI'), ':', 'h') || '. ', 'Heure retirée. ');
  end if;
  if new.location is distinct from old.location then
    v_body := v_body || coalesce('Nouveau lieu : ' || new.location || '. ', 'Lieu retiré. ');
  end if;
  if v_body = '' then return new; end if;
  insert into notifications (user_id, kind, title, body, link)
  select m.user_id, 'event_change', left('📅 « ' || new.name || ' » a changé', 200), left(btrim(v_body), 500), '/evenements/' || new.id::text
    from event_members m
   where m.event_id = new.id and m.user_id is distinct from auth.uid();
  return new;
end $$;
drop trigger if exists events_notify_change on public.events;
create trigger events_notify_change after update of event_date, event_time, location on public.events
  for each row execute function public.notify_event_change();
revoke all on function public.notify_event_change() from public, anon, authenticated;

-- Réservé au serveur (fonction Edge) : les invités à prévenir par e-mail, une fois par minute au plus
create or replace function public.request_event_change_emails(p_event uuid, p_user uuid)
returns table (email text, display_name text, event_name text, event_date date, event_time time, location text, organizer text)
language plpgsql security definer set search_path = public as $$
declare v_ev events%rowtype;
begin
  select * into v_ev from events where id = p_event and created_by = p_user for update;
  if not found then raise exception 'Seul l''organisateur peut prévenir les invités'; end if;
  if v_ev.change_emailed_at is not null and v_ev.change_emailed_at > now() - interval '1 minute' then
    raise exception 'Les invités viennent d''être prévenus : réessayez dans une minute';
  end if;
  update events set change_emailed_at = now() where id = p_event;
  return query
    select u.email::text, pr.display_name, v_ev.name, v_ev.event_date, v_ev.event_time, v_ev.location,
           (select pp.display_name from profiles pp where pp.id = p_user)
      from event_members m join auth.users u on u.id = m.user_id join profiles pr on pr.id = m.user_id
     where m.event_id = p_event and m.user_id <> p_user and u.email is not null;
end $$;
revoke all on function public.request_event_change_emails(uuid, uuid) from public, anon, authenticated;
grant execute on function public.request_event_change_emails(uuid, uuid) to service_role;
