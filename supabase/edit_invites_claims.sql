-- =====================================================================
--  Modifier une invitation (nom / e-mail) et la date de remise d'un achat
--  À exécuter après schema.sql, event_invites.sql et item_groups.sql.
-- =====================================================================

-- L'organisateur corrige le nom ou l'e-mail d'une invitation en attente
create or replace function public.update_event_invite(p_invite uuid, p_name text, p_email text)
returns void language plpgsql security definer set search_path = public as $$
declare v_event uuid; v_email text := lower(trim(coalesce(p_email, ''))); v_name text := trim(coalesce(p_name, ''));
begin
  select event_id into v_event from event_invites where id = p_invite;
  if v_event is null then raise exception 'Invitation introuvable'; end if;
  if not public.is_event_creator(v_event) then raise exception 'Seul l''organisateur peut modifier les invitations'; end if;
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

-- Celui qui a acheté change l'occasion ou la date de remise de SON achat
create or replace function public.update_claim(p_item uuid, p_event uuid default null, p_reveal date default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_owner uuid; v_date date;
begin
  if v_uid is null then raise exception 'Non connecté'; end if;
  if not exists (select 1 from item_claims where item_id = p_item and claimed_by = v_uid) then
    raise exception 'Achat introuvable';
  end if;
  select w.owner_id into v_owner from items i join wishlists w on w.id = i.list_id where i.id = p_item;
  if p_event is not null then
    select event_date into v_date from events e
     where e.id = p_event
       and public.is_event_member_user(e.id, v_uid)
       and public.is_event_member_user(e.id, v_owner);
    if v_date is null then raise exception 'Cet événement ne réunit pas les deux personnes'; end if;
  else
    v_date := p_reveal;
  end if;
  if v_date is null then raise exception 'Date de remise requise'; end if;
  update item_claims set event_id = p_event, reveal_on = v_date where item_id = p_item and claimed_by = v_uid;
end $$;

revoke all on function public.update_event_invite(uuid, text, text) from public, anon;
revoke all on function public.update_claim(uuid, uuid, date)         from public, anon;
grant execute on function public.update_event_invite(uuid, text, text) to authenticated;
grant execute on function public.update_claim(uuid, uuid, date)         to authenticated;
