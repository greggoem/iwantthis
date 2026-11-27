-- =====================================================================
--  Cadeaux communs, v3 (après group_gifts_v2.sql)
--  Inviter « un enfant » (une liste d'enfant visible) = inviter le parent qui tient sa liste :
--  il devient invité, reçoit une notification et un e-mail (son adresse n'est jamais renvoyée au site).
--  Un parent peut organiser un cadeau commun sur une envie de la liste de son propre enfant.
-- =====================================================================

create or replace function public.create_group_gift(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_id uuid; v_item uuid := nullif(p->>'item_id', '')::uuid; v_list uuid; v_rec uuid := nullif(p->>'recipient_id', '')::uuid;
  v_rname text := trim(coalesce(p->>'recipient_name', '')); v_title text := trim(coalesce(p->>'title', ''));
  v_give date := (p->>'give_on')::date; v_resp date := nullif(p->>'respond_by', '')::date; v_ev uuid := nullif(p->>'event_id', '')::uuid;
  v_split text := coalesce(nullif(p->>'split', ''), 'equal'); v_fixed numeric := nullif(p->>'fixed_share', '')::numeric;
  v_me text; v_orgs uuid[]; v_inv uuid[]; v_u uuid; v_child text; v_owner uuid;
begin
  if v_uid is null then raise exception 'Non connecté'; end if;
  if (select count(*) from group_gifts where created_by = v_uid and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Trop de cadeaux communs créés aujourd''hui';
  end if;
  if v_give is null then raise exception 'Indiquez la date de remise'; end if;
  if v_give < current_date then raise exception 'La date de remise est déjà passée'; end if;
  if v_resp is not null and v_resp > v_give then raise exception 'La date de réponse doit précéder la remise'; end if;
  if v_split <> 'equal' then v_fixed := null; end if;

  if v_item is not null then
    select i.list_id, w.owner_id, w.child_name into v_list, v_owner, v_child from items i join wishlists w on w.id = i.list_id where i.id = v_item;
    if v_list is null or not public.can_view_list(v_list) then raise exception 'Envie introuvable'; end if;
    -- sa propre liste non ; la liste de son enfant oui (les parents voient déjà ce qui y est acheté)
    if v_child is null and public.owns_list(v_list) then raise exception 'Vous ne pouvez pas organiser un cadeau commun sur votre propre liste'; end if;
    if exists (select 1 from item_claims where item_id = v_item) then raise exception 'Cette envie est déjà réservée'; end if;
    v_rec := case when v_child is null then v_owner end;
    if v_rname = '' then v_rname := coalesce(v_child, (select display_name from profiles where id = v_owner), 'Un proche'); end if;
    if v_title = '' then select title into v_title from items where id = v_item; end if;
  elsif v_rec is not null then
    if not public.gg_known(v_rec) or v_rec = v_uid then raise exception 'Personne inconnue'; end if;
    if v_rname = '' then select display_name into v_rname from profiles where id = v_rec; end if;
  end if;
  if v_rname = '' then raise exception 'Indiquez pour qui est le cadeau'; end if;
  if v_title = '' then raise exception 'Indiquez le cadeau'; end if;
  if v_ev is not null and not public.is_event_member_user(v_ev, v_uid) then raise exception 'Événement introuvable'; end if;

  insert into group_gifts (created_by, recipient_name, recipient_id, item_id, title, url, image_url, price, split, fixed_share, give_on, respond_by, event_id, note)
  values (v_uid, v_rname, v_rec, v_item, v_title, nullif(trim(p->>'url'), ''), nullif(trim(p->>'image_url'), ''),
          (p->>'price')::numeric, v_split, v_fixed, v_give, v_resp, v_ev, nullif(trim(p->>'note'), ''))
  returning id into v_id;

  insert into group_gift_members (gift_id, user_id, organizer) values (v_id, v_uid, true);

  select coalesce(array_agg(distinct x::uuid), '{}') into v_orgs from jsonb_array_elements_text(coalesce(p->'organizers', '[]')) x;
  select coalesce(array_agg(distinct x::uuid), '{}') into v_inv from jsonb_array_elements_text(coalesce(p->'invitees', '[]')) x;
  if cardinality(v_orgs) + cardinality(v_inv) > 100 then raise exception 'Maximum 100 personnes'; end if;
  foreach v_u in array v_orgs || v_inv loop
    if v_u = v_rec then raise exception 'La personne qui reçoit le cadeau ne peut pas y participer'; end if;
    if not public.gg_known(v_u) then raise exception 'Personne inconnue'; end if;
  end loop;
  insert into group_gift_members (gift_id, user_id, organizer)
  select v_id, u, u = any(v_orgs) from unnest(v_orgs || v_inv) u where u <> v_uid
  on conflict (gift_id, user_id) do update set organizer = group_gift_members.organizer or excluded.organizer;

  if v_item is not null then
    select display_name into v_me from profiles where id = v_uid;
    insert into item_claims (item_id, claimed_by, claimed_by_name, event_id, reveal_on, group_gift_id)
    values (v_item, v_uid, 'Cadeau commun (' || coalesce(v_me, 'un proche') || ')', null, v_give, v_id);
  end if;

  select display_name into v_me from profiles where id = v_uid;
  perform gg_notify(v_orgs, v_id, coalesce(v_me, 'Un proche') || ' vous a nommé co-organisateur d''un cadeau commun',
                    '« ' || v_title || ' » pour ' || v_rname || '. Ouvrez-le pour suivre les réponses.');
  perform gg_notify(array(select u from unnest(v_inv) u where not u = any(v_orgs)), v_id,
                    coalesce(v_me, 'Un proche') || ' vous invite à un cadeau commun',
                    '« ' || v_title || ' » pour ' || v_rname || ', à offrir le ' || to_char(v_give, 'DD/MM/YYYY') || '. Dites si vous participez.');
  return v_id;
end $$;
revoke all on function public.create_group_gift(jsonb) from public, anon;
grant execute on function public.create_group_gift(jsonb) to authenticated;

create or replace function public.open_group_gift(p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare g group_gifts%rowtype; v_n int;
begin
  if auth.uid() is null then raise exception 'Non connecté'; end if;
  select * into g from group_gifts where share_token = p_token;
  if g.id is null or g.recipient_id = auth.uid() or g.status = 'cancelled' then raise exception 'Ce lien de cadeau commun n''est plus valable'; end if;
  if exists (select 1 from items i join wishlists w on w.id = i.list_id where i.id = g.item_id and w.child_name is null and public.owns_list(w.id)) then
    raise exception 'Ce lien de cadeau commun n''est plus valable';
  end if;
  if not exists (select 1 from group_gift_members where gift_id = g.id and user_id = auth.uid()) then
    if g.status <> 'open' then raise exception 'Ce cadeau commun est déjà bouclé'; end if;
    select count(*) into v_n from group_gift_members where gift_id = g.id;
    if v_n >= 200 then raise exception 'Ce cadeau commun est complet'; end if;
    insert into group_gift_members (gift_id, user_id) values (g.id, auth.uid());
  end if;
  delete from group_gift_invites where gift_id = g.id and email = (select lower(email) from auth.users where id = auth.uid());
  return g.id;
end $$;
revoke all on function public.open_group_gift(text) from public, anon;
grant execute on function public.open_group_gift(text) to authenticated;

create or replace function public.invite_group_gift_lists(p_gift uuid, p_lists uuid[])
returns setof uuid language plpgsql security definer set search_path = public as $$
declare g group_gifts%rowtype; v_w wishlists%rowtype; v_me text; v_email text; v_inv uuid;
begin
  if not public.gg_is_org(p_gift) then raise exception 'Réservé aux organisateurs'; end if;
  select * into g from group_gifts where id = p_gift;
  if g.status <> 'open' then raise exception 'La cagnotte est fermée'; end if;
  if cardinality(p_lists) > 50 then raise exception 'Maximum 50 listes à la fois'; end if;
  select display_name into v_me from profiles where id = auth.uid();
  for v_w in select * from wishlists w where w.id = any (p_lists) and w.child_name is not null loop
    if not public.can_view_list(v_w.id) then raise exception 'Liste introuvable'; end if;
    continue when v_w.owner_id = auth.uid() or v_w.owner_id is not distinct from g.recipient_id;
    if not exists (select 1 from group_gift_members m where m.gift_id = p_gift and m.user_id = v_w.owner_id) then
      insert into group_gift_members (gift_id, user_id) values (p_gift, v_w.owner_id);
      perform gg_notify(array[v_w.owner_id], p_gift, coalesce(v_me, 'Un proche') || ' vous invite à un cadeau commun (avec ' || v_w.child_name || ')',
        '« ' || g.title || ' » pour ' || g.recipient_name || ', à offrir le ' || to_char(g.give_on, 'DD/MM/YYYY') || '. Dites si vous participez.');
    end if;
    select lower(u.email) into v_email from auth.users u where u.id = v_w.owner_id;
    if v_email is not null then
      insert into group_gift_invites (gift_id, email, invited_by) values (p_gift, v_email, auth.uid())
      on conflict (gift_id, email) do nothing;
      select i.id into v_inv from group_gift_invites i where i.gift_id = p_gift and i.email = v_email and i.emailed_at is null;
      if v_inv is not null then return next v_inv; end if;
    end if;
  end loop;
end $$;
revoke all on function public.invite_group_gift_lists(uuid, uuid[]) from public, anon;
grant execute on function public.invite_group_gift_lists(uuid, uuid[]) to authenticated;
