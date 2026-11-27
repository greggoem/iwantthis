-- =====================================================================
--  Cadeaux communs, v2 (après group_gifts.sql)
--  • « Même part pour tous » avec un montant fixe demandé à chacun (fixed_share), sinon le prix divisé
--  • invitations par adresse e-mail (avec e-mail envoyé par la fonction send-invite-email)
-- =====================================================================
alter table public.group_gifts add column if not exists fixed_share numeric(10,2) check (fixed_share is null or (fixed_share > 0 and fixed_share < 1000000));

create table if not exists public.group_gift_invites (
  id          uuid primary key default gen_random_uuid(),
  gift_id     uuid not null references public.group_gifts(id) on delete cascade,
  email       text not null check (char_length(email) <= 200),
  invited_by  uuid references public.profiles(id) on delete set null,
  emailed_at  timestamptz,
  created_at  timestamptz not null default now(),
  unique (gift_id, email)
);
alter table public.group_gift_invites enable row level security;
revoke all on public.group_gift_invites from anon, authenticated;

-- Part de chacun : montant fixe, ou objectif ÷ participants, ou montant promis (« chacun ce qu'il veut »)
create or replace function public.gg_share(p_gift uuid, p_user uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select case
    when m.final_amount is not null then m.final_amount
    when m.answer <> 'yes' then null
    when g.split = 'equal' then coalesce(g.fixed_share, round(g.price / greatest(1, (select count(*) from group_gift_members x where x.gift_id = g.id and x.answer = 'yes')), 2))
    else m.amount end
  from group_gifts g join group_gift_members m on m.gift_id = g.id and m.user_id = p_user
  where g.id = p_gift
$$;
revoke all on function public.gg_share(uuid, uuid) from public, anon, authenticated;

-- Création : montant fixe facultatif
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
    if public.owns_list(v_list) then raise exception 'Vous ne pouvez pas organiser un cadeau commun sur votre propre liste'; end if;
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

-- Lecture : + montant fixe, + invitations par e-mail en attente (organisateurs)
create or replace function public.group_gift(p_gift uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare g group_gifts%rowtype; v_org boolean; v_total numeric; v_yes int; v_pend int; v_me group_gift_members%rowtype;
begin
  g := public.gg_visible(p_gift);
  if g.id is null then raise exception 'Cadeau commun introuvable'; end if;
  v_org := public.gg_is_org(p_gift);
  select * into v_me from group_gift_members where gift_id = p_gift and user_id = auth.uid();
  select count(*) filter (where answer = 'yes'), count(*) filter (where answer = 'pending') into v_yes, v_pend from group_gift_members where gift_id = p_gift;
  select coalesce(sum(public.gg_share(p_gift, user_id)), 0) into v_total from group_gift_members where gift_id = p_gift and answer = 'yes';
  return jsonb_build_object(
    'id', g.id, 'title', g.title, 'url', g.url, 'image_url', g.image_url, 'price', g.price, 'split', g.split, 'fixed_share', g.fixed_share,
    'recipient_name', g.recipient_name, 'recipient_on_site', g.recipient_id is not null, 'from_list', g.item_id is not null,
    'recipient_list', (select i.list_id from items i where i.id = g.item_id),
    'give_on', g.give_on, 'respond_by', g.respond_by, 'note', g.note, 'status', g.status,
    'surplus', g.surplus, 'extra_text', g.extra_text,
    'event', (select jsonb_build_object('id', e.id, 'name', e.name) from events e where e.id = g.event_id and public.is_event_member_user(e.id, auth.uid())),
    'share_token', case when v_org or g.status = 'open' then g.share_token end,
    'is_organizer', v_org, 'created_by', g.created_by,
    'total', v_total, 'yes', v_yes, 'pending', v_pend,
    'suggested', case when g.split = 'free' and v_pend > 0 then round(greatest(g.price - v_total, 0) / v_pend, 2) end,
    'me', jsonb_build_object('answer', v_me.answer, 'amount', v_me.amount, 'share', public.gg_share(p_gift, auth.uid()), 'paid', v_me.paid),
    'members', coalesce((select jsonb_agg(jsonb_build_object(
        'id', m.user_id, 'name', coalesce(p.display_name, 'Un proche'), 'organizer', m.organizer, 'answer', m.answer, 'me', m.user_id = auth.uid(),
        'amount', case when v_org or m.user_id = auth.uid() then public.gg_share(p_gift, m.user_id) end,
        'paid', case when v_org or m.user_id = auth.uid() then m.paid end)
        order by m.organizer desc, (m.answer = 'yes') desc, (m.answer = 'pending') desc, lower(p.display_name))
      from group_gift_members m left join profiles p on p.id = m.user_id where m.gift_id = p_gift), '[]'::jsonb),
    'invites', case when v_org then coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'email', i.email, 'emailed', i.emailed_at is not null) order by i.created_at)
        from group_gift_invites i where i.gift_id = p_gift
         and not exists (select 1 from group_gift_members m join auth.users u on u.id = m.user_id where m.gift_id = p_gift and lower(u.email) = i.email)), '[]'::jsonb) else '[]'::jsonb end,
    'extras', case when v_org and g.item_id is not null then coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'title', i.title, 'price', i.price, 'image_url', i.image_url) order by i.price desc)
        from items i where i.list_id = (select list_id from items where id = g.item_id) and i.id <> g.item_id and i.price is not null and i.price > 0
         and i.price <= greatest(v_total - g.price, 0) and not exists (select 1 from item_claims c where c.item_id = i.id)), '[]'::jsonb) else '[]'::jsonb end
  );
end $$;
revoke all on function public.group_gift(uuid) from public, anon;
grant execute on function public.group_gift(uuid) to authenticated;

-- Ouvrir le lien : l'invitation par e-mail correspondante est consommée
create or replace function public.open_group_gift(p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare g group_gifts%rowtype; v_n int;
begin
  if auth.uid() is null then raise exception 'Non connecté'; end if;
  select * into g from group_gifts where share_token = p_token;
  if g.id is null or g.recipient_id = auth.uid() or g.status = 'cancelled' then raise exception 'Ce lien de cadeau commun n''est plus valable'; end if;
  if exists (select 1 from items i join wishlists w on w.id = i.list_id where i.id = g.item_id and public.owns_list(w.id)) then
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

-- Réponse : « objectif atteint » quand le total franchit l'objectif (montant fixe ou libre)
create or replace function public.answer_group_gift(p_gift uuid, p_answer text, p_amount numeric default null)
returns void language plpgsql security definer set search_path = public as $$
declare g group_gifts%rowtype; v_old text; v_me text; v_before numeric; v_total numeric; v_orgs uuid[];
begin
  g := public.gg_visible(p_gift);
  if g.id is null then raise exception 'Cadeau commun introuvable'; end if;
  if g.status <> 'open' then raise exception 'La cagnotte est fermée : demandez aux organisateurs'; end if;
  if p_answer not in ('yes', 'no', 'pending') then raise exception 'Réponse invalide'; end if;
  if p_answer = 'yes' and g.split = 'free' and (p_amount is null or p_amount <= 0) then raise exception 'Indiquez votre montant'; end if;
  if p_amount is not null and p_amount >= 1000000 then raise exception 'Montant trop élevé'; end if;
  select answer into v_old from group_gift_members where gift_id = p_gift and user_id = auth.uid();
  select coalesce(sum(public.gg_share(p_gift, user_id)), 0) into v_before from group_gift_members where gift_id = p_gift and answer = 'yes';
  update group_gift_members set answer = p_answer, answered_at = now(),
         amount = case when p_answer = 'yes' and g.split = 'free' then round(p_amount, 2) end,
         paid = case when p_answer = 'yes' then paid else false end
   where gift_id = p_gift and user_id = auth.uid();
  if p_answer = 'yes' and v_old is distinct from 'yes' then
    select display_name into v_me from profiles where id = auth.uid();
    select array_agg(user_id) into v_orgs from group_gift_members where gift_id = p_gift and organizer;
    select coalesce(sum(public.gg_share(p_gift, user_id)), 0) into v_total from group_gift_members where gift_id = p_gift and answer = 'yes';
    if (g.split = 'free' or g.fixed_share is not null) and v_total >= g.price and v_before < g.price then
      perform gg_notify(v_orgs, p_gift, 'Objectif atteint pour « ' || left(g.title, 120) || ' »',
                        to_char(v_total, 'FM999999990.00') || ' € réunis sur ' || to_char(g.price, 'FM999999990.00') || ' €. Vous pouvez fermer la cagnotte.');
    else
      perform gg_notify(v_orgs, p_gift, coalesce(v_me, 'Un proche') || ' participe à « ' || left(g.title, 120) || ' »', null);
    end if;
  end if;
end $$;
revoke all on function public.answer_group_gift(uuid, text, numeric) from public, anon;
grant execute on function public.answer_group_gift(uuid, text, numeric) to authenticated;

-- Organisateurs : le montant fixe se change tant que la cagnotte est ouverte
create or replace function public.update_group_gift(p_gift uuid, p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare g group_gifts%rowtype;
begin
  if not public.gg_is_org(p_gift) then raise exception 'Réservé aux organisateurs'; end if;
  select * into g from group_gifts where id = p_gift for update;
  if g.status in ('bought', 'cancelled') then raise exception 'Ce cadeau commun est terminé'; end if;
  if (p ? 'price' or p ? 'fixed_share') and g.status <> 'open' then raise exception 'La cagnotte est fermée : le montant ne change plus'; end if;
  update group_gifts set
    note = case when p ? 'note' then nullif(trim(p->>'note'), '') else note end,
    respond_by = case when p ? 'respond_by' then nullif(p->>'respond_by', '')::date else respond_by end,
    give_on = case when p ? 'give_on' then (p->>'give_on')::date else give_on end,
    title = case when p ? 'title' and trim(p->>'title') <> '' then trim(p->>'title') else title end,
    price = case when p ? 'price' then (p->>'price')::numeric else price end,
    fixed_share = case when p ? 'fixed_share' and split = 'equal' then nullif(p->>'fixed_share', '')::numeric else fixed_share end,
    url = case when p ? 'url' then nullif(trim(p->>'url'), '') else url end,
    image_url = case when p ? 'image_url' then nullif(trim(p->>'image_url'), '') else image_url end
   where id = p_gift;
  if p ? 'give_on' then update item_claims set reveal_on = (p->>'give_on')::date where group_gift_id = p_gift; end if;
end $$;
revoke all on function public.update_group_gift(uuid, jsonb) from public, anon;
grant execute on function public.update_group_gift(uuid, jsonb) to authenticated;

-- Fermeture : surplus possible aussi en « même part » avec montant fixe
create or replace function public.close_group_gift(p_gift uuid, p_surplus text default null, p_extra_text text default null, p_extra_item uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare g group_gifts%rowtype; v_total numeric; v_yes int; v_names text; v_r record; v_me text; v_over boolean;
begin
  if not public.gg_is_org(p_gift) then raise exception 'Réservé aux organisateurs'; end if;
  select * into g from group_gifts where id = p_gift for update;
  if g.status <> 'open' then raise exception 'La cagnotte est déjà fermée'; end if;
  select count(*) into v_yes from group_gift_members where gift_id = p_gift and answer = 'yes';
  if v_yes = 0 then raise exception 'Personne ne participe encore'; end if;
  select coalesce(sum(public.gg_share(p_gift, user_id)), 0) into v_total from group_gift_members where gift_id = p_gift and answer = 'yes';
  v_over := v_total > g.price and (g.split = 'free' or g.fixed_share is not null);
  if p_surplus is not null and p_surplus not in ('reduce', 'extra', 'voucher') then raise exception 'Choix invalide'; end if;
  if p_surplus in ('extra', 'voucher') and p_extra_item is null and coalesce(trim(p_extra_text), '') = '' then raise exception 'Décrivez ce que vous ajoutez'; end if;

  if v_over and coalesce(p_surplus, 'reduce') = 'reduce' then
    update group_gift_members m set final_amount = round(public.gg_share(p_gift, m.user_id) * g.price / v_total, 2) where m.gift_id = p_gift and m.answer = 'yes';
  else
    update group_gift_members m set final_amount = public.gg_share(p_gift, m.user_id) where m.gift_id = p_gift and m.answer = 'yes';
  end if;
  update group_gift_members set final_amount = null where gift_id = p_gift and answer <> 'yes';
  if (g.split = 'equal' and g.fixed_share is null) or (v_over and coalesce(p_surplus, 'reduce') = 'reduce') then
    update group_gift_members set final_amount = final_amount + (g.price - (select sum(final_amount) from group_gift_members where gift_id = p_gift and answer = 'yes'))
     where gift_id = p_gift and user_id = (select user_id from group_gift_members where gift_id = p_gift and answer = 'yes' order by final_amount desc, user_id limit 1);
  end if;

  if p_surplus = 'extra' and p_extra_item is not null then
    if not exists (select 1 from items i where i.id = p_extra_item and i.list_id = (select list_id from items where id = g.item_id)) then raise exception 'Envie introuvable'; end if;
    if exists (select 1 from item_claims where item_id = p_extra_item) then raise exception 'Cette envie est déjà réservée'; end if;
    insert into item_claims (item_id, claimed_by, claimed_by_name, reveal_on, group_gift_id)
    values (p_extra_item, coalesce(g.created_by, auth.uid()), 'Cadeau commun', g.give_on, p_gift);
  end if;

  update group_gifts set status = 'closed', closed_at = now(),
         surplus = case when v_over then coalesce(p_surplus, 'reduce') end,
         extra_text = case when p_surplus in ('extra', 'voucher') then coalesce(nullif(trim(p_extra_text), ''), (select title from items where id = p_extra_item)) end,
         extra_item_id = case when p_surplus = 'extra' then p_extra_item end
   where id = p_gift;

  select string_agg(p.display_name, ', ' order by lower(p.display_name)) into v_names
    from group_gift_members m join profiles p on p.id = m.user_id where m.gift_id = p_gift and m.answer = 'yes';
  update item_claims set claimed_by_name = left(coalesce(v_names, 'Cadeau commun'), 200) where group_gift_id = p_gift;

  select display_name into v_me from profiles where id = auth.uid();
  for v_r in select user_id, final_amount from group_gift_members where gift_id = p_gift and answer = 'yes' loop
    perform gg_notify(array[v_r.user_id], p_gift, 'Cagnotte fermée : « ' || left(g.title, 120) || ' »',
      'Votre part : ' || to_char(v_r.final_amount, 'FM999999990.00') || ' €.' || coalesce(' ' || g.note, ''));
  end loop;
end $$;
revoke all on function public.close_group_gift(uuid, text, text, uuid) from public, anon;
grant execute on function public.close_group_gift(uuid, text, text, uuid) to authenticated;

-- Inviter par adresse e-mail (organisateurs). Une adresse qui a déjà un compte devient tout de suite invitée (et notifiée).
-- Renvoie les invitations à envoyer par e-mail.
create or replace function public.invite_group_gift_emails(p_gift uuid, p_emails text[])
returns table (id uuid, email text) language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare g group_gifts%rowtype; v_e text; v_user uuid; v_me text; v_n int;
begin
  if not public.gg_is_org(p_gift) then raise exception 'Réservé aux organisateurs'; end if;
  select * into g from group_gifts where group_gifts.id = p_gift;
  if g.status <> 'open' then raise exception 'La cagnotte est fermée'; end if;
  if cardinality(p_emails) > 50 then raise exception 'Maximum 50 adresses à la fois'; end if;
  select count(*) into v_n from group_gift_invites i where i.gift_id = p_gift;
  if v_n + cardinality(p_emails) > 200 then raise exception 'Trop d''invitations pour ce cadeau commun'; end if;
  select display_name into v_me from profiles where profiles.id = auth.uid();
  foreach v_e in array p_emails loop
    v_e := lower(trim(v_e));
    if v_e = '' then continue; end if;
    if v_e !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or char_length(v_e) > 200 then raise exception 'Adresse e-mail invalide : %', v_e; end if;
    select u.id into v_user from auth.users u where lower(u.email) = v_e limit 1;
    if v_user is not null and v_user = g.recipient_id then raise exception 'Cette adresse est celle de la personne qui reçoit le cadeau'; end if;
    insert into group_gift_invites (gift_id, email, invited_by) values (p_gift, v_e, auth.uid()) on conflict (gift_id, email) do nothing;
    if v_user is not null and exists (select 1 from profiles where profiles.id = v_user)
       and not exists (select 1 from group_gift_members m where m.gift_id = p_gift and m.user_id = v_user) then
      insert into group_gift_members (gift_id, user_id) values (p_gift, v_user);
      perform gg_notify(array[v_user], p_gift, coalesce(v_me, 'Un proche') || ' vous invite à un cadeau commun',
        '« ' || g.title || ' » pour ' || g.recipient_name || ', à offrir le ' || to_char(g.give_on, 'DD/MM/YYYY') || '. Dites si vous participez.');
    end if;
  end loop;
  return query select i.id, i.email from group_gift_invites i
    where i.gift_id = p_gift and i.email = any(array(select lower(trim(x)) from unnest(p_emails) x)) and i.emailed_at is null;
end $$;
revoke all on function public.invite_group_gift_emails(uuid, text[]) from public, anon;
grant execute on function public.invite_group_gift_emails(uuid, text[]) to authenticated;

create or replace function public.remove_group_gift_invite(p_invite uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_gift uuid;
begin
  select gift_id into v_gift from group_gift_invites where id = p_invite;
  if v_gift is null or not public.gg_is_org(v_gift) then raise exception 'Invitation introuvable'; end if;
  delete from group_gift_invites where id = p_invite;
end $$;
revoke all on function public.remove_group_gift_invite(uuid) from public, anon;
grant execute on function public.remove_group_gift_invite(uuid) to authenticated;

-- Contenu de l'e-mail d'invitation (organisateurs, un envoi toutes les 2 minutes par adresse)
create or replace function public.request_group_gift_email(p_invite uuid)
returns table (to_email text, from_name text, recipient_name text, title text, give_on date, image_url text, share_token text,
               price numeric, split text, fixed_share numeric, respond_by date)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare v_i group_gift_invites%rowtype;
begin
  select * into v_i from group_gift_invites where id = p_invite for update;
  if v_i.id is null or not public.gg_is_org(v_i.gift_id) then raise exception 'Invitation introuvable'; end if;
  if v_i.emailed_at is not null and v_i.emailed_at > now() - interval '2 minutes' then raise exception 'Un e-mail vient d''être envoyé : réessayez dans quelques minutes'; end if;
  if (select status from group_gifts where id = v_i.gift_id) <> 'open' then raise exception 'La cagnotte est fermée'; end if;
  update group_gift_invites set emailed_at = now() where id = p_invite;
  return query select v_i.email, (select display_name from profiles where id = auth.uid()), g.recipient_name, g.title, g.give_on, g.image_url, g.share_token,
                      g.price, g.split, g.fixed_share, g.respond_by
    from group_gifts g where g.id = v_i.gift_id;
end $$;
revoke all on function public.request_group_gift_email(uuid) from public, anon;
grant execute on function public.request_group_gift_email(uuid) to authenticated;
