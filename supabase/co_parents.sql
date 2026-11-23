-- =====================================================================
--  Listes gérées à plusieurs (deux parents) et liste donnée à l'enfant
--  • list_managers : co-gestionnaires d'une liste d'enfant (ou de proche sans compte), en plus du propriétaire
--    Les droits sont les mêmes (envies, achats faits pour l'enfant, tirages) ; seul le propriétaire
--    supprime la liste, invite ou retire un autre parent. Chacun garde ses événements.
--  • list_manager_invites : propositions de gestion en attente (par e-mail)
--  • list_transfers : « Donner à Léo sa propre liste » → la liste devient la sienne quand il l'accepte
-- =====================================================================

create table if not exists public.list_managers (
  list_id    uuid not null references public.wishlists(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  added_by   uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (list_id, user_id)
);
create index if not exists list_managers_user_idx on public.list_managers(user_id);

create table if not exists public.list_manager_invites (
  id         uuid primary key default gen_random_uuid(),
  list_id    uuid not null references public.wishlists(id) on delete cascade,
  email      text not null,
  name       text,
  invited_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  emailed_at timestamptz,
  unique (list_id, email)
);

create table if not exists public.list_transfers (
  id         uuid primary key default gen_random_uuid(),
  list_id    uuid not null unique references public.wishlists(id) on delete cascade,
  email      text not null,
  events     uuid[] not null default '{}',
  invited_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  emailed_at timestamptz
);

alter table public.list_managers        enable row level security;
alter table public.list_manager_invites enable row level security;
alter table public.list_transfers       enable row level security;
revoke all on public.list_managers, public.list_manager_invites, public.list_transfers from anon, authenticated;

-- ---------- qui gère une liste ----------
create or replace function public.list_manager_ids(p_list uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  select owner_id from wishlists where id = p_list
  union select user_id from list_managers where list_id = p_list
$$;

create or replace function public.manages_list_user(p_list uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from wishlists where id = p_list and owner_id = p_user)
      or exists (select 1 from list_managers where list_id = p_list and user_id = p_user)
$$;

-- owns_list sert aux règles d'accès des envies : un co-parent a les mêmes droits que le propriétaire
create or replace function public.owns_list(p_list uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.manages_list_user(p_list, auth.uid())
$$;

create or replace function public.item_list_id(p_item uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select list_id from items where id = p_item
$$;

-- Un événement « réunit » la liste : son propriétaire y est, ou (liste gérée) l'un de ses gestionnaires
create or replace function public.event_has_list_person(p_event uuid, p_list uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from wishlists w
     where w.id = p_list
       and (public.is_event_member_user(p_event, w.owner_id)
            or (w.child_name is not null and exists (
                  select 1 from list_managers lm where lm.list_id = w.id and public.is_event_member_user(p_event, lm.user_id))))
  )
$$;

create or replace function public.can_view_list(p_list uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from wishlists w
    where w.id = p_list
      and (
        w.owner_id = auth.uid()
        or exists (select 1 from list_managers lm where lm.list_id = w.id and lm.user_id = auth.uid())
        or exists (select 1 from list_access a where a.list_id = w.id and a.user_id = auth.uid())
        or exists (
          select 1 from event_members m1
          join event_members m2 on m2.event_id = m1.event_id
          where m1.user_id = auth.uid()
            and (m2.user_id = w.owner_id
                 or (w.child_name is not null and exists (select 1 from list_managers lm where lm.list_id = w.id and lm.user_id = m2.user_id)))
            and (w.child_name is null
                 or coalesce((select c.shown from event_child_lists c where c.event_id = m1.event_id and c.list_id = w.id), w.in_events))
        )
      )
  )
$$;

-- Modifier une liste (nom, âge, couleur…) : propriétaire ou co-parent ; changer de propriétaire : seulement par « donner la liste »
drop policy if exists wishlists_update on public.wishlists;
create policy wishlists_update on public.wishlists for update to authenticated
  using (public.owns_list(id)) with check (public.owns_list(id));

create or replace function public.wishlists_guard_owner()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.owner_id is distinct from old.owner_id and coalesce(current_setting('iwt.transfer', true), '') <> 'on' then
    raise exception 'Le propriétaire d''une liste ne peut pas être changé ainsi';
  end if;
  return new;
end $$;
drop trigger if exists wishlists_guard_owner on public.wishlists;
create trigger wishlists_guard_owner before update of owner_id on public.wishlists
  for each row execute function public.wishlists_guard_owner();

-- Achats : les co-parents voient aussi les achats faits pour l'enfant
drop policy if exists claims_select on public.item_claims;
create policy claims_select on public.item_claims for select to authenticated using (
  (claimed_by = (select auth.uid()))
  or (public.can_view_item(item_id) and public.item_owner(item_id) <> (select auth.uid()) and not public.item_hidden_from_others(item_id))
  or ((public.item_owner(item_id) = (select auth.uid())) and ((reveal_on < public.today_be()) or public.item_on_child_list(item_id)))
  or (public.item_on_child_list(item_id) and public.owns_list(public.item_list_id(item_id)))
);

create or replace function public.claim_item(p_item uuid, p_event uuid default null, p_reveal date default null, p_discreet boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_list uuid; v_owner uuid; v_date date; v_name text; v_group boolean; v_parent uuid; v_pick boolean := false; v_child boolean;
begin
  if v_uid is null then raise exception 'Non connecté'; end if;

  select i.list_id, w.owner_id, i.is_group, i.parent_id, (w.child_name is not null) into v_list, v_owner, v_group, v_parent, v_child
    from items i join wishlists w on w.id = i.list_id where i.id = p_item;
  if v_list is null then raise exception 'Cadeau introuvable'; end if;
  if v_owner = v_uid and not v_child then raise exception 'Vous ne pouvez pas réserver un cadeau de votre propre liste'; end if;
  if not public.can_view_list(v_list) then raise exception 'Accès refusé'; end if;
  if v_group then raise exception 'Un groupe ne s''achète pas : choisissez un élément à l''intérieur'; end if;

  if v_parent is not null then
    select pick_one into v_pick from items where id = v_parent for update;
    if v_pick and exists (select 1 from item_claims c join items s on s.id = c.item_id
                           where s.parent_id = v_parent and c.item_id <> p_item) then
      raise exception 'Une autre option de ce groupe est déjà prise';
    end if;
  end if;

  if p_event is not null then
    select event_date into v_date from events e
     where e.id = p_event
       and public.is_event_member_user(e.id, v_uid)
       and public.event_has_list_person(e.id, v_list);
    if v_date is null then
      raise exception 'Cet événement ne réunit pas les deux personnes';
    end if;
  else
    v_date := p_reveal;
  end if;
  if v_date is null then raise exception 'Date de remise requise'; end if;

  select display_name into v_name from profiles where id = v_uid;

  begin
    insert into item_claims (item_id, claimed_by, claimed_by_name, event_id, reveal_on, discreet)
    values (p_item, v_uid, v_name, p_event, v_date, coalesce(p_discreet, false));
  exception when unique_violation then
    raise exception 'Ce cadeau est déjà réservé';
  end;
end $$;

create or replace function public.update_claim(p_item uuid, p_event uuid default null, p_reveal date default null, p_discreet boolean default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_list uuid; v_date date;
begin
  if v_uid is null then raise exception 'Non connecté'; end if;
  if not exists (select 1 from item_claims where item_id = p_item and claimed_by = v_uid) then
    raise exception 'Achat introuvable';
  end if;
  select i.list_id into v_list from items i where i.id = p_item;
  if p_event is not null then
    select event_date into v_date from events e
     where e.id = p_event
       and public.is_event_member_user(e.id, v_uid)
       and public.event_has_list_person(e.id, v_list);
    if v_date is null then raise exception 'Cet événement ne réunit pas les deux personnes'; end if;
  else
    v_date := p_reveal;
  end if;
  if v_date is null then raise exception 'Date de remise requise'; end if;
  update item_claims
     set event_id = p_event, reveal_on = v_date, discreet = coalesce(p_discreet, discreet)
   where item_id = p_item and claimed_by = v_uid;
end $$;

-- ---------- événements : listes gérées visibles ----------
-- Participants possibles d'un tirage : les listes gérées dont un gestionnaire est invité
create or replace function public.draw_candidates(p_event uuid)
returns table (pid uuid, user_id uuid, list_id uuid, name text, color text, owner_id uuid)
language sql stable security definer set search_path = public as $$
  select m.user_id, m.user_id, null::uuid, p.display_name, null::text, m.user_id
    from event_members m join profiles p on p.id = m.user_id
   where m.event_id = p_event
  union all
  select w.id, null::uuid, w.id, w.child_name, w.child_color, w.owner_id
    from wishlists w
    left join event_child_lists o on o.event_id = p_event and o.list_id = w.id
   where w.child_name is not null and coalesce(o.shown, w.in_events)
     and public.event_has_list_person(p_event, w.id)
$$;
revoke all on function public.draw_candidates(uuid) from public, anon, authenticated;

-- Listes gérées d'un événement, pour la page de l'événement (owner_id = un gestionnaire présent, moi en priorité)
create or replace function public.event_child_lists_info(p_event uuid)
returns table (id uuid, owner_id uuid, managers uuid[], child_name text, child_age text, child_color text, in_events boolean, managed_kind text, count bigint, mine boolean)
language sql stable security definer set search_path = public as $$
  select w.id,
         coalesce((select x from public.list_manager_ids(w.id) x where x = auth.uid()),
                  (select x from public.list_manager_ids(w.id) x where public.is_event_member_user(p_event, x) order by (x = w.owner_id) desc limit 1)),
         array(select x from public.list_manager_ids(w.id) x where public.is_event_member_user(p_event, x) or x = auth.uid()),
         w.child_name, w.child_age, w.child_color, w.in_events, w.managed_kind,
         (select count(*) from items i where i.list_id = w.id and not coalesce(i.is_group, false)),
         public.manages_list_user(w.id, auth.uid())
    from wishlists w
   where w.child_name is not null
     and (public.is_event_member(p_event) or public.is_event_creator(p_event))
     and public.event_has_list_person(p_event, w.id)
     and (public.manages_list_user(w.id, auth.uid())
          or coalesce((select c.shown from event_child_lists c where c.event_id = p_event and c.list_id = w.id), w.in_events))
$$;
revoke all on function public.event_child_lists_info(uuid) from public, anon;
grant execute on function public.event_child_lists_info(uuid) to authenticated;

create or replace function public.set_event_list_shown(p_event uuid, p_list uuid, p_shown boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from wishlists where id = p_list and child_name is not null) then raise exception 'Liste introuvable'; end if;
  if not (public.owns_list(p_list) or (public.is_event_creator(p_event) and not coalesce(p_shown, false))) then
    raise exception 'Seul un parent ou l''organisateur peut retirer cette liste de l''événement';
  end if;
  if not public.event_has_list_person(p_event, p_list) then
    raise exception 'Cette liste n''appartient pas à un invité de l''événement';
  end if;
  insert into event_child_lists (event_id, list_id, shown) values (p_event, p_list, coalesce(p_shown, false))
  on conflict (event_id, list_id) do update set shown = excluded.shown;
end $$;

-- Tirages : les résultats d'une liste gérée sont visibles par chacun de ses gestionnaires
create or replace function public.event_draws(p_event uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_org boolean;
begin
  if not (public.is_event_member(p_event) or public.is_event_creator(p_event)) then
    raise exception 'Accès refusé';
  end if;
  v_org := public.is_event_creator(p_event);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', d.id, 'name', d.name, 'position', d.position,
      'done_at', d.done_at, 'done_count', d.done_count,
      'participants', coalesce((
          select jsonb_agg(jsonb_build_object('pid', c.pid, 'kind', case when c.list_id is null then 'user' else 'kid' end,
                   'name', c.name, 'color', c.color, 'owner_id', case when c.list_id is not null and public.manages_list_user(c.list_id, v_uid) then v_uid else c.owner_id end) order by lower(c.name))
            from draw_participants dp join public.draw_candidates(p_event) c on c.pid = dp.pid
           where dp.draw_id = d.id), '[]'::jsonb),
      'blocks', case when v_org then coalesce((
          select jsonb_agg(jsonb_build_object('giver', b.giver, 'receiver', b.receiver))
            from draw_blocks b where b.draw_id = d.id), '[]'::jsonb) else '[]'::jsonb end,
      'mine', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'giver', r.giver, 'giver_kind', case when r.giver = v_uid then 'me' else 'kid' end,
                   'giver_name', g.name, 'receiver', r.receiver, 'receiver_name', rc.name,
                   'receiver_kind', case when rc.list_id is null then 'user' else 'kid' end,
                   'receiver_color', rc.color,
                   'receiver_list', coalesce(rc.list_id, (select w.id from wishlists w where w.owner_id = rc.user_id and w.child_name is null limit 1)))
                 order by (r.giver <> v_uid), lower(g.name))
            from draw_results r
            join public.draw_candidates(p_event) g on g.pid = r.giver
            left join public.draw_candidates(p_event) rc on rc.pid = r.receiver
           where r.draw_id = d.id and (r.giver = v_uid or (g.list_id is not null and public.manages_list_user(g.list_id, v_uid)))), '[]'::jsonb)
    ) order by d.position, d.created_at)
    from draws d where d.event_id = p_event), '[]'::jsonb);
end $$;

create or replace function public.run_one_draw(p_draw uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_ev uuid; v_givers uuid[]; v_recv uuid[]; v_excl text[]; v_n int; v_try int := 0; v_ok boolean := false; i int;
  v_event text; v_draw text;
begin
  v_ev := public.draw_check_org(p_draw);
  select array_agg(pid order by pid) into v_givers from draw_participants where draw_id = p_draw;
  v_n := coalesce(array_length(v_givers, 1), 0);
  if v_n < 2 then raise exception 'Il faut au moins 2 participants au tirage'; end if;
  select coalesce(array_agg(giver::text || '>' || receiver::text), '{}') into v_excl from draw_blocks where draw_id = p_draw;

  while v_try < 20000 and not v_ok loop
    v_try := v_try + 1;
    select array_agg(u order by random()) into v_recv from unnest(v_givers) u;
    v_ok := true;
    for i in 1..v_n loop
      if v_givers[i] = v_recv[i] or (v_givers[i]::text || '>' || v_recv[i]::text) = any (v_excl) then
        v_ok := false; exit;
      end if;
    end loop;
  end loop;
  if not v_ok then raise exception 'Tirage impossible avec ces exclusions : en retirer quelques-unes'; end if;

  delete from draw_results where draw_id = p_draw;
  for i in 1..v_n loop
    insert into draw_results (draw_id, giver, receiver) values (p_draw, v_givers[i], v_recv[i]);
  end loop;
  update draws set done_at = now(), done_count = v_n, emailed_at = null where id = p_draw;
  perform public.draw_sync_event(v_ev);

  select e.name, d.name into v_event, v_draw from draws d join events e on e.id = d.event_id where d.id = p_draw;
  insert into notifications (user_id, kind, title, body, link)
  select distinct x.uid, 'draw_done',
         left('🎲 Tirage « ' || v_draw || ' » : « ' || v_event || ' »', 200),
         'Le tirage a eu lieu. Découvrez à qui offrir un cadeau.', '/evenements/' || v_ev::text
    from (
      select p.user_id as uid from draw_participants p where p.draw_id = p_draw and p.user_id is not null
      union
      select m from draw_participants p cross join lateral public.list_manager_ids(p.list_id) m
       where p.draw_id = p_draw and p.list_id is not null and public.is_event_member_user(v_ev, m)
    ) x;
end $$;

create or replace function public.request_one_draw_emails(p_draw uuid, p_user uuid)
returns table (email text, display_name text, kids text[], self boolean, event_id uuid, event_name text, event_date date, draw_name text, organizer text)
language plpgsql security definer set search_path = public as $$
declare v_d draws%rowtype; v_ev events%rowtype;
begin
  select * into v_d from draws where id = p_draw;
  select * into v_ev from events where id = v_d.event_id and created_by = p_user;
  if not found then raise exception 'Seul l''organisateur peut envoyer ces e-mails'; end if;
  if v_d.done_at is null then raise exception 'Aucun tirage n''a été effectué'; end if;
  if v_d.emailed_at is not null and v_d.emailed_at >= v_d.done_at then
    raise exception 'Les e-mails de ce tirage ont déjà été envoyés';
  end if;
  update draws set emailed_at = now() where id = p_draw;
  return query
    with r as (
      select p.user_id as uid, null::text as kid from draw_participants p where p.draw_id = p_draw and p.user_id is not null
      union all
      select m, w.child_name from draw_participants p join wishlists w on w.id = p.list_id
        cross join lateral public.list_manager_ids(p.list_id) m
       where p.draw_id = p_draw and p.list_id is not null and public.is_event_member_user(v_ev.id, m)
    )
    select u.email::text, pr.display_name,
           coalesce(array_agg(r.kid order by r.kid) filter (where r.kid is not null), '{}'),
           bool_or(r.kid is null),
           v_ev.id, v_ev.name, v_ev.event_date, v_d.name,
           (select pp.display_name from profiles pp where pp.id = p_user)
      from r join auth.users u on u.id = r.uid join profiles pr on pr.id = u.id
     group by u.email, pr.display_name;
end $$;

-- ---------- mes listes gérées ----------
create or replace function public.my_child_lists()
returns setof wishlists language sql stable security definer set search_path = public as $$
  select w.* from wishlists w
   where w.child_name is not null
     and (w.owner_id = auth.uid() or exists (select 1 from list_managers lm where lm.list_id = w.id and lm.user_id = auth.uid()))
   order by (w.owner_id <> auth.uid()), w.created_at
$$;
revoke all on function public.my_child_lists() from public, anon;
grant execute on function public.my_child_lists() to authenticated;

-- Gestionnaires des listes d'enfant que je peux voir (pour afficher « enfant de Greg et Julie » et les événements communs)
create or replace function public.list_keepers(p_lists uuid[])
returns table (list_id uuid, user_id uuid, display_name text)
language sql stable security definer set search_path = public as $$
  select w.id, x, p.display_name
    from wishlists w cross join lateral public.list_manager_ids(w.id) x
    join profiles p on p.id = x
   where w.id = any (p_lists) and w.child_name is not null and public.can_view_list(w.id)
$$;
revoke all on function public.list_keepers(uuid[]) from public, anon;
grant execute on function public.list_keepers(uuid[]) to authenticated;

-- Mes proches, sans lien avec un événement (pour choisir un co-parent)
create or replace function public.my_people()
returns table (user_id uuid, display_name text)
language sql stable security definer set search_path = public as $$
  with people as (
    select m2.user_id as id from event_members m1 join event_members m2 on m2.event_id = m1.event_id
     where m1.user_id = auth.uid() and m2.user_id <> auth.uid()
    union select w.owner_id from list_access a join wishlists w on w.id = a.list_id where a.user_id = auth.uid() and w.owner_id <> auth.uid()
    union select a.user_id from list_access a join wishlists w on w.id = a.list_id where w.owner_id = auth.uid() and a.user_id <> auth.uid()
  )
  select p.id, pr.display_name from people p join profiles pr on pr.id = p.id
   where pr.display_name is not null order by lower(pr.display_name)
$$;
revoke all on function public.my_people() from public, anon;
grant execute on function public.my_people() to authenticated;

-- Qui gère la liste, invitations en attente, liste proposée à l'enfant
create or replace function public.list_managers_info(p_list uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_w wishlists%rowtype;
begin
  select * into v_w from wishlists where id = p_list;
  if v_w.id is null or v_w.child_name is null or not public.owns_list(p_list) then raise exception 'Accès refusé'; end if;
  return jsonb_build_object(
    'owner', jsonb_build_object('id', v_w.owner_id, 'name', (select display_name from profiles where id = v_w.owner_id)),
    'managers', coalesce((select jsonb_agg(jsonb_build_object('id', lm.user_id, 'name', p.display_name) order by lm.created_at)
                            from list_managers lm join profiles p on p.id = lm.user_id where lm.list_id = p_list), '[]'::jsonb),
    'invites', case when v_w.owner_id = auth.uid() then coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'label', coalesce(i.name, i.email)) order by i.created_at)
                            from list_manager_invites i where i.list_id = p_list), '[]'::jsonb) else '[]'::jsonb end,
    'transfer', case when v_w.owner_id = auth.uid() then (select jsonb_build_object('id', t.id, 'email', t.email) from list_transfers t where t.list_id = p_list) end
  );
end $$;
revoke all on function public.list_managers_info(uuid) from public, anon;
grant execute on function public.list_managers_info(uuid) to authenticated;

-- Proposer à quelqu'un de gérer la liste (un proche, ou une adresse e-mail). Renvoie l'invitation.
create or replace function public.invite_list_manager(p_list uuid, p_user uuid default null, p_email text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_w wishlists%rowtype; v_email text; v_name text; v_target uuid; v_id uuid; v_me text;
begin
  select * into v_w from wishlists where id = p_list;
  if v_w.id is null or v_w.owner_id <> auth.uid() or v_w.child_name is null then
    raise exception 'Seul le parent qui a créé la liste peut proposer de la gérer';
  end if;
  if p_user is not null then
    if not exists (select 1 from public.my_people() c where c.user_id = p_user) then raise exception 'Personne introuvable parmi vos proches'; end if;
    select lower(u.email), p.display_name into v_email, v_name from auth.users u join profiles p on p.id = u.id where u.id = p_user;
  else
    v_email := lower(trim(coalesce(p_email, '')));
    if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or char_length(v_email) > 200 then raise exception 'Adresse e-mail invalide'; end if;
  end if;
  select u.id into v_target from auth.users u where lower(u.email) = v_email;
  if v_target = auth.uid() then raise exception 'C''est votre propre adresse'; end if;
  if v_target is not null and public.manages_list_user(p_list, v_target) then raise exception 'Cette personne gère déjà la liste'; end if;
  if (select count(*) from list_manager_invites where list_id = p_list) >= 5 then raise exception 'Trop de propositions en attente pour cette liste'; end if;

  insert into list_manager_invites (list_id, email, name, invited_by) values (p_list, v_email, v_name, auth.uid())
  on conflict (list_id, email) do update set invited_by = excluded.invited_by
  returning id into v_id;

  if v_target is not null then
    select display_name into v_me from profiles where id = auth.uid();
    insert into notifications (user_id, kind, title, body, link)
    values (v_target, 'list_manager_invite',
            left(coalesce(v_me, 'Un proche') || ' vous propose de gérer la liste de ' || v_w.child_name, 200),
            'Ouvrez « Ma liste » pour accepter ou refuser. Vos événements restent les vôtres.', '/');
  end if;
  return v_id;
end $$;

create or replace function public.cancel_list_manager_invite(p_invite uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from list_manager_invites i using wishlists w
   where i.id = p_invite and w.id = i.list_id and w.owner_id = auth.uid();
end $$;

-- Retirer un co-parent (le propriétaire) ou arrêter de gérer (soi-même)
create or replace function public.remove_list_manager(p_list uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (p_user = auth.uid() or exists (select 1 from wishlists where id = p_list and owner_id = auth.uid())) then
    raise exception 'Seul le parent qui a créé la liste peut retirer quelqu''un';
  end if;
  delete from list_managers where list_id = p_list and user_id = p_user;
end $$;

-- Donner la liste à l'enfant (ou au proche) : il la récupère en acceptant avec cette adresse e-mail
create or replace function public.give_list(p_list uuid, p_email text, p_events uuid[] default '{}')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_w wishlists%rowtype; v_email text := lower(trim(coalesce(p_email, ''))); v_target uuid; v_id uuid; v_me text;
begin
  select * into v_w from wishlists where id = p_list;
  if v_w.id is null or v_w.owner_id <> auth.uid() or v_w.child_name is null then
    raise exception 'Seul le parent qui a créé la liste peut la donner';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or char_length(v_email) > 200 then raise exception 'Adresse e-mail invalide'; end if;
  select u.id into v_target from auth.users u where lower(u.email) = v_email;
  if v_target is not null and public.manages_list_user(p_list, v_target) then
    raise exception 'Cette adresse est celle d''un parent qui gère déjà la liste';
  end if;
  insert into list_transfers (list_id, email, events, invited_by)
  values (p_list, v_email,
          coalesce((select array_agg(e) from unnest(coalesce(p_events, '{}')) e where public.is_event_member_user(e, auth.uid())), '{}'),
          auth.uid())
  on conflict (list_id) do update set email = excluded.email, events = excluded.events, invited_by = excluded.invited_by, created_at = now(), emailed_at = null
  returning id into v_id;
  if v_target is not null then
    select display_name into v_me from profiles where id = auth.uid();
    insert into notifications (user_id, kind, title, body, link)
    values (v_target, 'list_transfer',
            left(coalesce(v_me, 'Un proche') || ' vous confie votre liste d''envies', 200),
            'Ouvrez « Ma liste » pour la récupérer.', '/');
  end if;
  return v_id;
end $$;

create or replace function public.cancel_list_transfer(p_list uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from list_transfers t using wishlists w where t.list_id = p_list and w.id = t.list_id and w.owner_id = auth.uid();
end $$;

-- Ce qu'on me propose : gérer une liste, ou récupérer ma liste
create or replace function public.my_list_offers()
returns table (kind text, id uuid, list_id uuid, child_name text, from_name text, wishes bigint)
language sql stable security definer set search_path = public as $$
  select 'manage', i.id, i.list_id, w.child_name, p.display_name,
         (select count(*) from items x where x.list_id = w.id and not coalesce(x.is_group, false))
    from list_manager_invites i join wishlists w on w.id = i.list_id
    left join profiles p on p.id = i.invited_by
    join auth.users u on lower(u.email) = i.email
   where u.id = auth.uid() and not public.manages_list_user(w.id, auth.uid())
  union all
  select 'give', t.id, t.list_id, w.child_name,
         (select string_agg(pp.display_name, ' et ' order by (x = w.owner_id) desc) from public.list_manager_ids(w.id) x join profiles pp on pp.id = x),
         (select count(*) from items x where x.list_id = w.id and not coalesce(x.is_group, false))
    from list_transfers t join wishlists w on w.id = t.list_id
    join auth.users u on lower(u.email) = t.email
   where u.id = auth.uid()
$$;
revoke all on function public.my_list_offers() from public, anon;
grant execute on function public.my_list_offers() to authenticated;

create or replace function public.accept_list_manager_invite(p_invite uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_list uuid; v_by uuid; v_name text; v_child text;
begin
  select i.list_id, i.invited_by into v_list, v_by from list_manager_invites i join auth.users u on lower(u.email) = i.email
   where i.id = p_invite and u.id = auth.uid();
  if v_list is null then raise exception 'Proposition introuvable'; end if;
  insert into list_managers (list_id, user_id, added_by) values (v_list, auth.uid(), v_by) on conflict do nothing;
  delete from list_manager_invites where id = p_invite;
  select display_name into v_name from profiles where id = auth.uid();
  select child_name into v_child from wishlists where id = v_list;
  if v_by is not null then
    insert into notifications (user_id, kind, title, body, link)
    values (v_by, 'list_manager_joined', left(coalesce(v_name, 'Votre proche') || ' gère maintenant la liste de ' || v_child || ' avec vous', 200),
            'Vous voyez tous les deux ses envies et ce qui a été acheté pour lui.', '/');
  end if;
  return v_list;
end $$;

create or replace function public.decline_list_offer(p_kind text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_kind = 'manage' then
    delete from list_manager_invites i using auth.users u where i.id = p_id and lower(u.email) = i.email and u.id = auth.uid();
  else
    delete from list_transfers t using auth.users u where t.id = p_id and lower(u.email) = t.email and u.id = auth.uid();
  end if;
end $$;

-- Les envies suivent la liste quand l'enfant la récupère et qu'il avait déjà la sienne
create or replace function public.items_check_parent()
returns trigger language plpgsql set search_path = public as $$
declare p record;
begin
  if tg_op = 'UPDATE' and old.is_group is distinct from new.is_group then
    raise exception 'Un cadeau ne peut pas devenir un groupe (ni l''inverse)';
  end if;
  if tg_op = 'UPDATE' and old.list_id is distinct from new.list_id then
    if coalesce(current_setting('iwt.transfer', true), '') = 'on' then return new; end if;
    raise exception 'Un cadeau ne peut pas changer de liste';
  end if;
  if new.is_group then
    if new.parent_id is not null then raise exception 'Un groupe ne peut pas être dans un autre groupe'; end if;
    new.url := null; new.price := null;
  else
    new.pick_one := false;
  end if;
  if new.parent_id is not null then
    select id, list_id, is_group into p from items where id = new.parent_id;
    if p.id is null or not p.is_group then raise exception 'Le groupe indiqué n''existe pas'; end if;
    if p.list_id <> new.list_id then raise exception 'Le groupe appartient à une autre liste'; end if;
  end if;
  return new;
end $$;

-- L'enfant récupère sa liste : elle devient la sienne (ou ses envies rejoignent la liste qu'il a déjà)
create or replace function public.accept_list_transfer(p_transfer uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_t list_transfers%rowtype; v_w wishlists%rowtype; v_mine uuid; v_target uuid;
  v_managers uuid[]; v_name text;
begin
  select t.* into v_t from list_transfers t join auth.users u on lower(u.email) = t.email where t.id = p_transfer and u.id = v_uid;
  if v_t.id is null then raise exception 'Proposition introuvable'; end if;
  select * into v_w from wishlists where id = v_t.list_id;
  select array_agg(x) into v_managers from public.list_manager_ids(v_w.id) x;
  perform set_config('iwt.transfer', 'on', true);

  select id into v_mine from wishlists where owner_id = v_uid and child_name is null;
  if v_mine is null then
    update wishlists set owner_id = v_uid, child_name = null, child_age = null, child_color = null, managed_kind = 'enfant', in_events = true
     where id = v_w.id;
    v_target := v_w.id;
  else
    update items set list_id = v_mine where list_id = v_w.id;
    v_target := v_mine;
  end if;

  -- les parents continuent de voir sa liste, comme des proches
  insert into list_access (list_id, user_id) select v_target, m from unnest(v_managers) m where m <> v_uid on conflict do nothing;
  delete from list_managers where list_id = v_w.id;
  delete from list_manager_invites where list_id = v_w.id;
  delete from event_child_lists where list_id = v_w.id;

  -- il rejoint les événements choisis par le parent
  insert into event_members (event_id, user_id)
    select e, v_uid from unnest(v_t.events) e where exists (select 1 from events where id = e)
  on conflict do nothing;

  -- ses tirages passent à son nom
  update draw_participants dp set pid = v_uid, user_id = v_uid, list_id = null
   where dp.list_id = v_w.id and not exists (select 1 from draw_participants x where x.draw_id = dp.draw_id and x.pid = v_uid);
  delete from draw_participants where list_id = v_w.id;
  update draw_results r set giver = v_uid where r.giver = v_w.id and not exists (select 1 from draw_results x where x.draw_id = r.draw_id and x.giver = v_uid);
  update draw_results set receiver = v_uid where receiver = v_w.id;
  update draw_blocks b set giver = v_uid where b.giver = v_w.id and not exists (select 1 from draw_blocks x where x.draw_id = b.draw_id and x.giver = v_uid and x.receiver = b.receiver);
  update draw_blocks b set receiver = v_uid where b.receiver = v_w.id and not exists (select 1 from draw_blocks x where x.draw_id = b.draw_id and x.giver = b.giver and x.receiver = v_uid);
  delete from draw_blocks where giver = v_w.id or receiver = v_w.id or giver = receiver;

  delete from list_transfers where id = v_t.id;
  if v_mine is not null then delete from wishlists where id = v_w.id; end if;

  select display_name into v_name from profiles where id = v_uid;
  insert into notifications (user_id, kind, title, body, link)
  select m, 'list_transfer_done', left(coalesce(v_name, v_w.child_name) || ' a récupéré sa liste d''envies', 200),
         'Vous la retrouvez dans « Listes de mes proches ». Ce que vous achetez pour lui reste une surprise.', '/listes/' || v_target::text
    from unnest(v_managers) m where m <> v_uid;
  return v_target;
end $$;

-- E-mail d'une proposition (fonction Edge send-invite-email), une fois toutes les 2 minutes au plus
create or replace function public.request_list_offer_email(p_kind text, p_id uuid)
returns table (to_email text, to_name text, child_name text, from_name text, kind text)
language plpgsql security definer set search_path = public as $$
declare v_list uuid; v_email text; v_name text; v_sent timestamptz;
begin
  if p_kind = 'manage' then
    select i.list_id, i.email, i.name, i.emailed_at into v_list, v_email, v_name, v_sent from list_manager_invites i where i.id = p_id;
  else
    select t.list_id, t.email, null, t.emailed_at into v_list, v_email, v_name, v_sent from list_transfers t where t.id = p_id;
  end if;
  if v_list is null or not exists (select 1 from wishlists where id = v_list and owner_id = auth.uid()) then raise exception 'Proposition introuvable'; end if;
  if v_sent is not null and v_sent > now() - interval '2 minutes' then raise exception 'Un e-mail vient d''être envoyé : réessayez dans quelques minutes'; end if;
  if p_kind = 'manage' then update list_manager_invites set emailed_at = now() where id = p_id;
  else update list_transfers set emailed_at = now() where id = p_id; end if;
  return query select v_email, v_name, w.child_name, (select display_name from profiles where id = auth.uid()), p_kind from wishlists w where w.id = v_list;
end $$;

revoke all on function public.list_manager_ids(uuid)                        from public, anon;
revoke all on function public.manages_list_user(uuid, uuid)                 from public, anon;
revoke all on function public.event_has_list_person(uuid, uuid)             from public, anon;
revoke all on function public.item_list_id(uuid)                            from public, anon;
revoke all on function public.invite_list_manager(uuid, uuid, text)         from public, anon;
revoke all on function public.cancel_list_manager_invite(uuid)              from public, anon;
revoke all on function public.remove_list_manager(uuid, uuid)               from public, anon;
revoke all on function public.give_list(uuid, text, uuid[])                 from public, anon;
revoke all on function public.cancel_list_transfer(uuid)                    from public, anon;
revoke all on function public.accept_list_manager_invite(uuid)              from public, anon;
revoke all on function public.decline_list_offer(text, uuid)                from public, anon;
revoke all on function public.accept_list_transfer(uuid)                    from public, anon;
revoke all on function public.request_list_offer_email(text, uuid)          from public, anon;
grant execute on function public.list_manager_ids(uuid)                     to authenticated;
grant execute on function public.manages_list_user(uuid, uuid)              to authenticated;
grant execute on function public.event_has_list_person(uuid, uuid)          to authenticated;
grant execute on function public.item_list_id(uuid)                         to authenticated;
grant execute on function public.invite_list_manager(uuid, uuid, text)      to authenticated;
grant execute on function public.cancel_list_manager_invite(uuid)           to authenticated;
grant execute on function public.remove_list_manager(uuid, uuid)            to authenticated;
grant execute on function public.give_list(uuid, text, uuid[])              to authenticated;
grant execute on function public.cancel_list_transfer(uuid)                 to authenticated;
grant execute on function public.accept_list_manager_invite(uuid)           to authenticated;
grant execute on function public.decline_list_offer(text, uuid)             to authenticated;
grant execute on function public.accept_list_transfer(uuid)                 to authenticated;
grant execute on function public.request_list_offer_email(text, uuid)       to authenticated;
