-- =====================================================================
--  Cadeaux communs : plusieurs personnes se cotisent pour un cadeau
--  • indépendant des événements (lien facultatif), pour quelqu'un qui n'est pas forcément sur le site
--  • plusieurs organisateurs ; participants avec un compte (lien à partager ou proches invités)
--  • « même part pour tous » ou « chacun ce qu'il veut » ; surplus : réduire les parts, petit cadeau en plus ou bon d'achat
--  • la personne qui reçoit, si elle est sur le site, ne voit jamais rien
--  • le site ne fait pas circuler d'argent : les organisateurs cochent « a payé »
--  Tout passe par des fonctions du serveur : aucun accès direct aux tables.
--  (à exécuter après co_parents.sql)
-- =====================================================================
create table if not exists public.group_gifts (
  id             uuid primary key default gen_random_uuid(),
  created_by     uuid references public.profiles(id) on delete set null,   -- un compte supprimé ne supprime pas le cadeau des autres
  recipient_name text not null check (char_length(recipient_name) between 1 and 80),
  recipient_id   uuid references public.profiles(id) on delete set null,   -- la personne qui reçoit, si elle a un compte
  item_id        uuid references public.items(id) on delete set null,      -- envie de sa liste, si le cadeau en vient
  title          text not null check (char_length(title) between 1 and 200),
  url            text check (url is null or (char_length(url) <= 2000 and url ~* '^https?://')),
  image_url      text check (image_url is null or char_length(image_url) <= 2000),
  price          numeric(10,2) not null check (price > 0 and price < 1000000),   -- objectif
  split          text not null default 'equal' check (split in ('equal', 'free')),
  give_on        date not null,
  respond_by     date,
  event_id       uuid references public.events(id) on delete set null,
  note           text check (note is null or char_length(note) <= 500),        -- mot des organisateurs (virement…)
  share_token    text not null unique default encode(extensions.gen_random_bytes(12), 'hex'),
  status         text not null default 'open' check (status in ('open', 'closed', 'bought', 'cancelled')),
  surplus        text check (surplus in ('reduce', 'extra', 'voucher')),
  extra_text     text check (extra_text is null or char_length(extra_text) <= 200),
  extra_item_id  uuid references public.items(id) on delete set null,
  closed_at      timestamptz,
  bought_at      timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists group_gifts_item_idx on public.group_gifts(item_id);

create table if not exists public.group_gift_members (
  gift_id      uuid not null references public.group_gifts(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  organizer    boolean not null default false,
  answer       text not null default 'pending' check (answer in ('pending', 'yes', 'no')),
  amount       numeric(10,2) check (amount is null or (amount > 0 and amount < 1000000)),   -- montant promis (« chacun ce qu'il veut »)
  final_amount numeric(10,2),                                                             -- part finale, à la fermeture
  paid         boolean not null default false,
  answered_at  timestamptz,
  created_at   timestamptz not null default now(),
  primary key (gift_id, user_id)
);
create index if not exists group_gift_members_user_idx on public.group_gift_members(user_id);

alter table public.group_gifts enable row level security;
alter table public.group_gift_members enable row level security;
revoke all on public.group_gifts, public.group_gift_members from anon, authenticated;

-- Réservation d'une envie par un cadeau commun : liée au cadeau commun (masquée de « Mes achats »)
alter table public.item_claims add column if not exists group_gift_id uuid references public.group_gifts(id) on delete cascade;

-- ---------------------------------------------------------------------
--  Outils
-- ---------------------------------------------------------------------
create or replace function public.gg_is_org(p_gift uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from group_gift_members where gift_id = p_gift and user_id = auth.uid() and organizer)
$$;
revoke all on function public.gg_is_org(uuid) from public, anon;

-- Le cadeau commun tel qu'on peut le voir (null si on n'y a pas accès ou si on est la personne qui reçoit)
create or replace function public.gg_visible(p_gift uuid)
returns public.group_gifts language sql stable security definer set search_path = public as $$
  select g.* from group_gifts g
   where g.id = p_gift
     and g.recipient_id is distinct from auth.uid()
     and exists (select 1 from group_gift_members m where m.gift_id = g.id and m.user_id = auth.uid())
$$;
revoke all on function public.gg_visible(uuid) from public, anon;

-- Part de chacun : même part = objectif ÷ participants ; chacun ce qu'il veut = montant promis
create or replace function public.gg_share(p_gift uuid, p_user uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select case
    when m.final_amount is not null then m.final_amount
    when m.answer <> 'yes' then null
    when g.split = 'equal' then round(g.price / greatest(1, (select count(*) from group_gift_members x where x.gift_id = g.id and x.answer = 'yes')), 2)
    else m.amount end
  from group_gifts g join group_gift_members m on m.gift_id = g.id and m.user_id = p_user
  where g.id = p_gift
$$;
revoke all on function public.gg_share(uuid, uuid) from public, anon;

-- Notifie un ensemble de personnes (sauf moi)
create or replace function public.gg_notify(p_users uuid[], p_gift uuid, p_title text, p_body text)
returns void language sql security definer set search_path = public as $$
  insert into notifications (user_id, kind, title, body, link)
  select u, 'group_gift', left(p_title, 200), left(p_body, 500), '/commun/' || p_gift
    from unnest(p_users) u where u is distinct from auth.uid()
$$;
revoke all on function public.gg_notify(uuid[], uuid, text, text) from public, anon;

-- Les personnes que je peux inviter ou nommer organisatrices : mes proches sur le site
create or replace function public.gg_known(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_user = auth.uid() or exists (select 1 from public.my_people() p where p.user_id = p_user)
$$;
revoke all on function public.gg_known(uuid) from public, anon;

-- ---------------------------------------------------------------------
--  Créer
-- ---------------------------------------------------------------------
-- p : { recipient_name, recipient_id?, item_id?, title, url?, image_url?, price, split, give_on, respond_by?, event_id?, note?,
--       organizers: [uuid], invitees: [uuid] }
create or replace function public.create_group_gift(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_id uuid; v_item uuid := nullif(p->>'item_id', '')::uuid; v_list uuid; v_rec uuid := nullif(p->>'recipient_id', '')::uuid;
  v_rname text := trim(coalesce(p->>'recipient_name', '')); v_title text := trim(coalesce(p->>'title', ''));
  v_give date := (p->>'give_on')::date; v_resp date := nullif(p->>'respond_by', '')::date; v_ev uuid := nullif(p->>'event_id', '')::uuid;
  v_me text; v_orgs uuid[]; v_inv uuid[]; v_u uuid; v_child text; v_owner uuid;
begin
  if v_uid is null then raise exception 'Non connecté'; end if;
  if (select count(*) from group_gifts where created_by = v_uid and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Trop de cadeaux communs créés aujourd''hui';
  end if;
  if v_give is null then raise exception 'Indiquez la date de remise'; end if;
  if v_give < current_date then raise exception 'La date de remise est déjà passée'; end if;
  if v_resp is not null and v_resp > v_give then raise exception 'La date de réponse doit précéder la remise'; end if;

  -- envie d'une liste : je dois la voir, ne pas la gérer, et elle doit être libre
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

  insert into group_gifts (created_by, recipient_name, recipient_id, item_id, title, url, image_url, price, split, give_on, respond_by, event_id, note)
  values (v_uid, v_rname, v_rec, v_item, v_title, nullif(trim(p->>'url'), ''), nullif(trim(p->>'image_url'), ''),
          (p->>'price')::numeric, coalesce(nullif(p->>'split', ''), 'equal'), v_give, v_resp, v_ev, nullif(trim(p->>'note'), ''))
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

  -- l'envie est réservée pour les autres invités de la liste
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

-- ---------------------------------------------------------------------
--  Lire
-- ---------------------------------------------------------------------
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
    'id', g.id, 'title', g.title, 'url', g.url, 'image_url', g.image_url, 'price', g.price, 'split', g.split,
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
    -- petites envies de sa liste qui tiennent dans le surplus (pour les organisateurs)
    'extras', case when v_org and g.item_id is not null then coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'title', i.title, 'price', i.price, 'image_url', i.image_url) order by i.price desc)
        from items i where i.list_id = (select list_id from items where id = g.item_id) and i.id <> g.item_id and i.price is not null and i.price > 0
         and i.price <= greatest(v_total - g.price, 0) and not exists (select 1 from item_claims c where c.item_id = i.id)), '[]'::jsonb) else '[]'::jsonb end
  );
end $$;
revoke all on function public.group_gift(uuid) from public, anon;
grant execute on function public.group_gift(uuid) to authenticated;

-- Mes cadeaux communs (cartes de « À offrir »)
create or replace function public.my_group_gifts()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by (x->>'give_on')), '[]'::jsonb) from (
    select jsonb_build_object('id', g.id, 'title', g.title, 'image_url', g.image_url, 'url', g.url, 'price', g.price,
      'recipient_name', g.recipient_name, 'give_on', g.give_on, 'status', g.status, 'is_organizer', m.organizer,
      'answer', m.answer, 'share', public.gg_share(g.id, m.user_id), 'paid', m.paid,
      'total', (select coalesce(sum(public.gg_share(g.id, y.user_id)), 0) from group_gift_members y where y.gift_id = g.id and y.answer = 'yes'),
      'yes', (select count(*) from group_gift_members y where y.gift_id = g.id and y.answer = 'yes'),
      'with', (select coalesce(jsonb_agg(p.display_name order by lower(p.display_name)), '[]'::jsonb) from group_gift_members y join profiles p on p.id = y.user_id
                where y.gift_id = g.id and y.answer = 'yes' and y.user_id <> m.user_id),
      'organizers', (select coalesce(jsonb_agg(p.display_name order by o.created_at), '[]'::jsonb) from group_gift_members o join profiles p on p.id = o.user_id
                where o.gift_id = g.id and o.organizer)) x
      from group_gift_members m join group_gifts g on g.id = m.gift_id
     where m.user_id = auth.uid() and g.recipient_id is distinct from auth.uid()
       and g.status <> 'cancelled' and not (m.answer = 'no' and g.status <> 'open')
  ) s
$$;
revoke all on function public.my_group_gifts() from public, anon;
grant execute on function public.my_group_gifts() to authenticated;

-- Ouvrir un lien partagé : je rejoins la liste des invités (réponse en attente)
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
  return g.id;
end $$;
revoke all on function public.open_group_gift(text) from public, anon;
grant execute on function public.open_group_gift(text) to authenticated;

-- ---------------------------------------------------------------------
--  Répondre
-- ---------------------------------------------------------------------
create or replace function public.answer_group_gift(p_gift uuid, p_answer text, p_amount numeric default null)
returns void language plpgsql security definer set search_path = public as $$
declare g group_gifts%rowtype; v_old text; v_me text; v_total numeric; v_orgs uuid[];
begin
  g := public.gg_visible(p_gift);
  if g.id is null then raise exception 'Cadeau commun introuvable'; end if;
  if g.status <> 'open' then raise exception 'La cagnotte est fermée : demandez aux organisateurs'; end if;
  if p_answer not in ('yes', 'no', 'pending') then raise exception 'Réponse invalide'; end if;
  if p_answer = 'yes' and g.split = 'free' and (p_amount is null or p_amount <= 0) then raise exception 'Indiquez votre montant'; end if;
  if p_amount is not null and p_amount >= 1000000 then raise exception 'Montant trop élevé'; end if;
  select answer into v_old from group_gift_members where gift_id = p_gift and user_id = auth.uid();
  update group_gift_members set answer = p_answer, answered_at = now(),
         amount = case when p_answer = 'yes' and g.split = 'free' then round(p_amount, 2) end,
         paid = case when p_answer = 'yes' then paid else false end
   where gift_id = p_gift and user_id = auth.uid();
  -- prévenir les organisateurs d'une nouvelle participation, et quand l'objectif est atteint
  if p_answer = 'yes' and v_old is distinct from 'yes' then
    select display_name into v_me from profiles where id = auth.uid();
    select array_agg(user_id) into v_orgs from group_gift_members where gift_id = p_gift and organizer;
    select coalesce(sum(public.gg_share(p_gift, user_id)), 0) into v_total from group_gift_members where gift_id = p_gift and answer = 'yes';
    if g.split = 'free' and v_total >= g.price then
      perform gg_notify(v_orgs, p_gift, 'Objectif atteint pour « ' || left(g.title, 120) || ' »',
                        to_char(v_total, 'FM999999990.00') || ' € réunis sur ' || to_char(g.price, 'FM999999990.00') || ' €. Vous pouvez fermer la cagnotte.');
    else
      perform gg_notify(v_orgs, p_gift, coalesce(v_me, 'Un proche') || ' participe à « ' || left(g.title, 120) || ' »', null);
    end if;
  end if;
end $$;
revoke all on function public.answer_group_gift(uuid, text, numeric) from public, anon;
grant execute on function public.answer_group_gift(uuid, text, numeric) to authenticated;

-- ---------------------------------------------------------------------
--  Organisateurs
-- ---------------------------------------------------------------------
-- p : { note?, respond_by?, give_on?, title?, price?, url?, image_url? } (seules les clés présentes changent)
create or replace function public.update_group_gift(p_gift uuid, p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare g group_gifts%rowtype;
begin
  if not public.gg_is_org(p_gift) then raise exception 'Réservé aux organisateurs'; end if;
  select * into g from group_gifts where id = p_gift for update;
  if g.status in ('bought', 'cancelled') then raise exception 'Ce cadeau commun est terminé'; end if;
  if p ? 'price' and g.status <> 'open' then raise exception 'La cagnotte est fermée : le montant ne change plus'; end if;
  update group_gifts set
    note = case when p ? 'note' then nullif(trim(p->>'note'), '') else note end,
    respond_by = case when p ? 'respond_by' then nullif(p->>'respond_by', '')::date else respond_by end,
    give_on = case when p ? 'give_on' then (p->>'give_on')::date else give_on end,
    title = case when p ? 'title' and trim(p->>'title') <> '' then trim(p->>'title') else title end,
    price = case when p ? 'price' then (p->>'price')::numeric else price end,
    url = case when p ? 'url' then nullif(trim(p->>'url'), '') else url end,
    image_url = case when p ? 'image_url' then nullif(trim(p->>'image_url'), '') else image_url end
   where id = p_gift;
  if p ? 'give_on' then update item_claims set reveal_on = (p->>'give_on')::date where group_gift_id = p_gift; end if;
end $$;
revoke all on function public.update_group_gift(uuid, jsonb) from public, anon;
grant execute on function public.update_group_gift(uuid, jsonb) to authenticated;

-- Inviter des proches, ou nommer des co-organisateurs
create or replace function public.invite_group_gift(p_gift uuid, p_users uuid[], p_organizer boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare g group_gifts%rowtype; v_u uuid; v_me text; v_new uuid[];
begin
  if not public.gg_is_org(p_gift) then raise exception 'Réservé aux organisateurs'; end if;
  select * into g from group_gifts where id = p_gift;
  if g.status <> 'open' and not p_organizer then raise exception 'La cagnotte est fermée'; end if;
  if cardinality(p_users) > 100 then raise exception 'Maximum 100 personnes'; end if;
  foreach v_u in array p_users loop
    if v_u = g.recipient_id then raise exception 'La personne qui reçoit le cadeau ne peut pas y participer'; end if;
    if not public.gg_known(v_u) then raise exception 'Personne inconnue'; end if;
  end loop;
  select array_agg(u) into v_new from unnest(p_users) u
   where not exists (select 1 from group_gift_members m where m.gift_id = p_gift and m.user_id = u and (m.organizer or not p_organizer));
  insert into group_gift_members (gift_id, user_id, organizer) select p_gift, u, p_organizer from unnest(p_users) u
  on conflict (gift_id, user_id) do update set organizer = group_gift_members.organizer or excluded.organizer;
  select display_name into v_me from profiles where id = auth.uid();
  perform gg_notify(coalesce(v_new, '{}'), p_gift,
    case when p_organizer then coalesce(v_me, 'Un proche') || ' vous a nommé co-organisateur d''un cadeau commun'
         else coalesce(v_me, 'Un proche') || ' vous invite à un cadeau commun' end,
    '« ' || g.title || ' » pour ' || g.recipient_name || ', à offrir le ' || to_char(g.give_on, 'DD/MM/YYYY') || '.');
end $$;
revoke all on function public.invite_group_gift(uuid, uuid[], boolean) from public, anon;
grant execute on function public.invite_group_gift(uuid, uuid[], boolean) to authenticated;

-- Retirer quelqu'un (organisateurs ; le créateur reste toujours)
create or replace function public.remove_group_gift_member(p_gift uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.gg_is_org(p_gift) then raise exception 'Réservé aux organisateurs'; end if;
  if p_user = (select created_by from group_gifts where id = p_gift) then raise exception 'La personne qui a lancé le cadeau commun reste organisatrice'; end if;
  delete from group_gift_members where gift_id = p_gift and user_id = p_user;
end $$;
revoke all on function public.remove_group_gift_member(uuid, uuid) from public, anon;
grant execute on function public.remove_group_gift_member(uuid, uuid) to authenticated;

-- Relancer ceux qui n'ont pas répondu (une fois par jour)
create or replace function public.remind_group_gift(p_gift uuid)
returns int language plpgsql security definer set search_path = public as $$
declare g group_gifts%rowtype; v_users uuid[];
begin
  if not public.gg_is_org(p_gift) then raise exception 'Réservé aux organisateurs'; end if;
  select * into g from group_gifts where id = p_gift;
  if g.status <> 'open' then raise exception 'La cagnotte est fermée'; end if;
  select array_agg(user_id) into v_users from group_gift_members m where m.gift_id = p_gift and m.answer = 'pending'
     and not exists (select 1 from notifications n where n.user_id = m.user_id and n.link = '/commun/' || p_gift and n.created_at > now() - interval '20 hours');
  perform gg_notify(coalesce(v_users, '{}'), p_gift, 'Cadeau commun : vous participez ?',
    '« ' || g.title || ' » pour ' || g.recipient_name || case when g.respond_by is not null then '. Réponse attendue avant le ' || to_char(g.respond_by, 'DD/MM/YYYY') else '' end || '.');
  return coalesce(cardinality(v_users), 0);
end $$;
revoke all on function public.remind_group_gift(uuid) from public, anon;
grant execute on function public.remind_group_gift(uuid) to authenticated;

create or replace function public.set_group_gift_paid(p_gift uuid, p_user uuid, p_paid boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.gg_is_org(p_gift) then raise exception 'Réservé aux organisateurs'; end if;
  update group_gift_members set paid = p_paid where gift_id = p_gift and user_id = p_user and answer = 'yes';
end $$;
revoke all on function public.set_group_gift_paid(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_group_gift_paid(uuid, uuid, boolean) to authenticated;

-- Fermer la cagnotte : parts finales, surplus, noms des participants sur la réservation
-- p_surplus : 'reduce' (parts réduites au prorata) | 'extra' (petit cadeau en plus : p_extra_item de sa liste ou p_extra_text) | 'voucher' (bon d'achat : p_extra_text)
create or replace function public.close_group_gift(p_gift uuid, p_surplus text default null, p_extra_text text default null, p_extra_item uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare g group_gifts%rowtype; v_total numeric; v_yes int; v_names text; v_r record; v_me text;
begin
  if not public.gg_is_org(p_gift) then raise exception 'Réservé aux organisateurs'; end if;
  select * into g from group_gifts where id = p_gift for update;
  if g.status <> 'open' then raise exception 'La cagnotte est déjà fermée'; end if;
  select count(*) into v_yes from group_gift_members where gift_id = p_gift and answer = 'yes';
  if v_yes = 0 then raise exception 'Personne ne participe encore'; end if;
  select coalesce(sum(public.gg_share(p_gift, user_id)), 0) into v_total from group_gift_members where gift_id = p_gift and answer = 'yes';
  if p_surplus is not null and p_surplus not in ('reduce', 'extra', 'voucher') then raise exception 'Choix invalide'; end if;
  if p_surplus in ('extra', 'voucher') and p_extra_item is null and coalesce(trim(p_extra_text), '') = '' then raise exception 'Décrivez ce que vous ajoutez'; end if;

  -- parts finales
  if g.split = 'free' and v_total > g.price and coalesce(p_surplus, 'reduce') = 'reduce' then
    update group_gift_members set final_amount = round(amount * g.price / v_total, 2) where gift_id = p_gift and answer = 'yes';
  else
    update group_gift_members m set final_amount = public.gg_share(p_gift, m.user_id) where m.gift_id = p_gift and m.answer = 'yes';
  end if;
  update group_gift_members set final_amount = null where gift_id = p_gift and answer <> 'yes';
  -- arrondis : le total des parts tombe juste sur le prix (l'écart d'un centime va à la plus grosse part)
  if g.split = 'equal' or (v_total > g.price and coalesce(p_surplus, 'reduce') = 'reduce') then
    update group_gift_members set final_amount = final_amount + (g.price - (select sum(final_amount) from group_gift_members where gift_id = p_gift and answer = 'yes'))
     where gift_id = p_gift and user_id = (select user_id from group_gift_members where gift_id = p_gift and answer = 'yes' order by final_amount desc, user_id limit 1);
  end if;

  -- petit cadeau en plus pris dans sa liste : réservé lui aussi
  if p_surplus = 'extra' and p_extra_item is not null then
    if not exists (select 1 from items i where i.id = p_extra_item and i.list_id = (select list_id from items where id = g.item_id)) then raise exception 'Envie introuvable'; end if;
    if exists (select 1 from item_claims where item_id = p_extra_item) then raise exception 'Cette envie est déjà réservée'; end if;
    insert into item_claims (item_id, claimed_by, claimed_by_name, reveal_on, group_gift_id)
    values (p_extra_item, g.created_by, 'Cadeau commun', g.give_on, p_gift);
  end if;

  update group_gifts set status = 'closed', closed_at = now(),
         surplus = case when g.split = 'free' and v_total > g.price then coalesce(p_surplus, 'reduce') end,
         extra_text = case when p_surplus in ('extra', 'voucher') then coalesce(nullif(trim(p_extra_text), ''), (select title from items where id = p_extra_item)) end,
         extra_item_id = case when p_surplus = 'extra' then p_extra_item end
   where id = p_gift;

  -- la réservation porte les noms de tous les participants (révélés à la remise)
  select string_agg(p.display_name, ', ' order by lower(p.display_name)) into v_names
    from group_gift_members m join profiles p on p.id = m.user_id where m.gift_id = p_gift and m.answer = 'yes';
  update item_claims set claimed_by_name = left(coalesce(v_names, 'Cadeau commun'), 200) where group_gift_id = p_gift;

  -- chacun reçoit sa part finale
  select display_name into v_me from profiles where id = auth.uid();
  for v_r in select user_id, final_amount from group_gift_members where gift_id = p_gift and answer = 'yes' loop
    perform gg_notify(array[v_r.user_id], p_gift, 'Cagnotte fermée : « ' || left(g.title, 120) || ' »',
      'Votre part : ' || to_char(v_r.final_amount, 'FM999999990.00') || ' €.' || coalesce(' ' || g.note, ''));
  end loop;
end $$;
revoke all on function public.close_group_gift(uuid, text, text, uuid) from public, anon;
grant execute on function public.close_group_gift(uuid, text, text, uuid) to authenticated;

-- Rouvrir (les parts finales sont effacées)
create or replace function public.reopen_group_gift(p_gift uuid)
returns void language plpgsql security definer set search_path = public as $$
declare g group_gifts%rowtype;
begin
  if not public.gg_is_org(p_gift) then raise exception 'Réservé aux organisateurs'; end if;
  select * into g from group_gifts where id = p_gift for update;
  if g.status <> 'closed' then raise exception 'Seule une cagnotte fermée peut être rouverte'; end if;
  delete from item_claims where group_gift_id = p_gift and item_id is distinct from g.item_id;
  update group_gift_members set final_amount = null where gift_id = p_gift;
  update group_gifts set status = 'open', closed_at = null, surplus = null, extra_text = null, extra_item_id = null where id = p_gift;
end $$;
revoke all on function public.reopen_group_gift(uuid) from public, anon;
grant execute on function public.reopen_group_gift(uuid) to authenticated;

create or replace function public.mark_group_gift_bought(p_gift uuid)
returns void language plpgsql security definer set search_path = public as $$
declare g group_gifts%rowtype; v_users uuid[];
begin
  if not public.gg_is_org(p_gift) then raise exception 'Réservé aux organisateurs'; end if;
  select * into g from group_gifts where id = p_gift for update;
  if g.status = 'open' then raise exception 'Fermez d''abord la cagnotte'; end if;
  if g.status <> 'closed' then raise exception 'Ce cadeau commun est terminé'; end if;
  update group_gifts set status = 'bought', bought_at = now() where id = p_gift;
  select array_agg(user_id) into v_users from group_gift_members where gift_id = p_gift and answer = 'yes';
  perform gg_notify(coalesce(v_users, '{}'), p_gift, 'Le cadeau commun « ' || left(g.title, 120) || ' » est acheté', 'Remise le ' || to_char(g.give_on, 'DD/MM/YYYY') || '.');
end $$;
revoke all on function public.mark_group_gift_bought(uuid) from public, anon;
grant execute on function public.mark_group_gift_bought(uuid) to authenticated;

create or replace function public.cancel_group_gift(p_gift uuid)
returns void language plpgsql security definer set search_path = public as $$
declare g group_gifts%rowtype; v_users uuid[];
begin
  if not public.gg_is_org(p_gift) then raise exception 'Réservé aux organisateurs'; end if;
  select * into g from group_gifts where id = p_gift for update;
  if g.status in ('bought', 'cancelled') then raise exception 'Ce cadeau commun est terminé'; end if;
  delete from item_claims where group_gift_id = p_gift;   -- l'envie redevient libre
  update group_gifts set status = 'cancelled' where id = p_gift;
  select array_agg(user_id) into v_users from group_gift_members where gift_id = p_gift and answer <> 'no';
  perform gg_notify(coalesce(v_users, '{}'), p_gift, 'Cadeau commun annulé : « ' || left(g.title, 120) || ' »', 'Les organisateurs ont annulé ce cadeau commun.');
end $$;
revoke all on function public.cancel_group_gift(uuid) from public, anon;
grant execute on function public.cancel_group_gift(uuid) to authenticated;
