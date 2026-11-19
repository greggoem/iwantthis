-- =====================================================================
--  Plusieurs tirages au sort par événement (« Les parents », « Les enfants »…)
--  - chaque tirage a un nom, ses participants, ses exclusions et ses résultats ;
--  - un participant est un invité (compte) OU une liste d'enfant visible dans l'événement ;
--  - une même personne peut être dans plusieurs tirages ;
--  - chacun ne voit que ses résultats, et ceux des listes d'enfants dont il est le parent.
--  Les anciennes tables (draw_exclusions, draw_assignments, events.draw_*) restent en place, non utilisées.
-- =====================================================================

create table if not exists public.draws (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 60),
  position    int not null default 0,
  done_at     timestamptz,
  done_count  int,
  emailed_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists draws_event_idx on public.draws(event_id);

-- pid = identifiant du participant : l'id du profil (compte) ou l'id de la liste d'enfant
create table if not exists public.draw_participants (
  draw_id  uuid not null references public.draws(id) on delete cascade,
  pid      uuid not null,
  user_id  uuid references public.profiles(id) on delete cascade,
  list_id  uuid references public.wishlists(id) on delete cascade,
  primary key (draw_id, pid),
  check ((user_id is not null and list_id is null and pid = user_id) or (list_id is not null and user_id is null and pid = list_id))
);
create index if not exists draw_participants_user_idx on public.draw_participants(user_id);
create index if not exists draw_participants_list_idx on public.draw_participants(list_id);

create table if not exists public.draw_blocks (            -- exclusions : giver ne doit pas offrir à receiver
  draw_id  uuid not null references public.draws(id) on delete cascade,
  giver    uuid not null,
  receiver uuid not null,
  primary key (draw_id, giver, receiver),
  check (giver <> receiver)
);

create table if not exists public.draw_results (
  draw_id  uuid not null references public.draws(id) on delete cascade,
  giver    uuid not null,
  receiver uuid not null,
  primary key (draw_id, giver)
);

-- Tout passe par les fonctions ci-dessous : aucun accès direct aux tables
alter table public.draws             enable row level security;
alter table public.draw_participants enable row level security;
alter table public.draw_blocks       enable row level security;
alter table public.draw_results      enable row level security;
revoke all on public.draws, public.draw_participants, public.draw_blocks, public.draw_results from anon, authenticated;

-- Une participation disparaît quand la personne quitte l'événement (ou que la liste d'enfant n'y est plus)
create or replace function public.draw_participant_cleanup()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from draw_blocks where draw_id = old.draw_id and old.pid in (giver, receiver);
  return old;
end $$;
drop trigger if exists draw_participants_cleanup on public.draw_participants;
create trigger draw_participants_cleanup before delete on public.draw_participants
  for each row execute function public.draw_participant_cleanup();

create or replace function public.draw_member_left()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from draw_participants dp using draws d
   where d.id = dp.draw_id and d.event_id = old.event_id
     and (dp.user_id = old.user_id
          or dp.list_id in (select id from wishlists where owner_id = old.user_id and child_name is not null));
  return old;
end $$;
drop trigger if exists event_members_left_draws on public.event_members;
create trigger event_members_left_draws after delete on public.event_members
  for each row execute function public.draw_member_left();

-- Participants possibles d'un événement : invités + listes d'enfants visibles dans l'événement
create or replace function public.draw_candidates(p_event uuid)
returns table (pid uuid, user_id uuid, list_id uuid, name text, color text, owner_id uuid)
language sql stable security definer set search_path = public as $$
  select m.user_id, m.user_id, null::uuid, p.display_name, null::text, m.user_id
    from event_members m join profiles p on p.id = m.user_id
   where m.event_id = p_event
  union all
  select w.id, null::uuid, w.id, w.child_name, w.child_color, w.owner_id
    from wishlists w
    join event_members m on m.event_id = p_event and m.user_id = w.owner_id
    left join event_child_lists o on o.event_id = p_event and o.list_id = w.id
   where w.child_name is not null and coalesce(o.shown, w.in_events)
$$;
revoke all on function public.draw_candidates(uuid) from public, anon, authenticated;

-- Tous les tirages d'un événement, vus par l'utilisateur connecté
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
                   'name', c.name, 'color', c.color, 'owner_id', c.owner_id) order by lower(c.name))
            from draw_participants dp join public.draw_candidates(p_event) c on c.pid = dp.pid
           where dp.draw_id = d.id), '[]'::jsonb),
      'blocks', case when v_org then coalesce((
          select jsonb_agg(jsonb_build_object('giver', b.giver, 'receiver', b.receiver))
            from draw_blocks b where b.draw_id = d.id), '[]'::jsonb) else '[]'::jsonb end,
      -- mes résultats : les miens et ceux de mes listes d'enfants
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
           where r.draw_id = d.id and (r.giver = v_uid or g.owner_id = v_uid and g.list_id is not null)), '[]'::jsonb)
    ) order by d.position, d.created_at)
    from draws d where d.event_id = p_event), '[]'::jsonb);
end $$;

-- Garde events.draw_done_at à jour (dernier tirage effectué), utilisé par la liste des événements
create or replace function public.draw_sync_event(p_event uuid)
returns void language sql security definer set search_path = public as $$
  update events set draw_done_at = (select max(done_at) from draws where event_id = p_event) where id = p_event
$$;
revoke all on function public.draw_sync_event(uuid) from public, anon, authenticated;

create or replace function public.draw_check_org(p_draw uuid)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare v_ev uuid;
begin
  select d.event_id into v_ev from draws d join events e on e.id = d.event_id
   where d.id = p_draw and e.created_by = auth.uid();
  if v_ev is null then raise exception 'Seul l''organisateur peut gérer les tirages'; end if;
  return v_ev;
end $$;
revoke all on function public.draw_check_org(uuid) from public, anon, authenticated;

-- Crée ou modifie un tirage (nom + participants). p_draw null = nouveau tirage.
create or replace function public.save_draw(p_event uuid, p_draw uuid, p_name text, p_pids uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid := p_draw; v_name text := nullif(btrim(p_name), '');
begin
  if v_name is null then raise exception 'Donnez un nom au tirage'; end if;
  if v_id is null then
    if not public.is_event_creator(p_event) then raise exception 'Seul l''organisateur peut gérer les tirages'; end if;
    if (select count(*) from draws where event_id = p_event) >= 10 then raise exception 'Dix tirages au maximum par événement'; end if;
    insert into draws (event_id, name, position)
      values (p_event, left(v_name, 60), coalesce((select max(position) + 1 from draws where event_id = p_event), 0))
      returning id into v_id;
  else
    if public.draw_check_org(v_id) <> p_event then raise exception 'Tirage introuvable'; end if;
    update draws set name = left(v_name, 60) where id = v_id;
  end if;
  delete from draw_participants where draw_id = v_id and not (pid = any (coalesce(p_pids, '{}')));
  insert into draw_participants (draw_id, pid, user_id, list_id)
    select v_id, c.pid, c.user_id, c.list_id from public.draw_candidates(p_event) c
     where c.pid = any (coalesce(p_pids, '{}'))
    on conflict do nothing;
  return v_id;
end $$;

create or replace function public.delete_draw(p_draw uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_ev uuid;
begin
  v_ev := public.draw_check_org(p_draw);
  delete from draws where id = p_draw;
  perform public.draw_sync_event(v_ev);
end $$;

-- Exclusion entre deux participants (p_both : dans les deux sens)
create or replace function public.set_draw_block(p_draw uuid, p_giver uuid, p_receiver uuid, p_on boolean, p_both boolean default true)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.draw_check_org(p_draw);
  if p_on then
    if p_giver = p_receiver then raise exception 'Choisissez deux personnes différentes'; end if;
    if (select count(*) from draw_participants where draw_id = p_draw and pid in (p_giver, p_receiver)) < 2 then
      raise exception 'Ces deux personnes doivent participer au tirage';
    end if;
    insert into draw_blocks values (p_draw, p_giver, p_receiver) on conflict do nothing;
    if p_both then insert into draw_blocks values (p_draw, p_receiver, p_giver) on conflict do nothing; end if;
  else
    delete from draw_blocks where draw_id = p_draw and ((giver = p_giver and receiver = p_receiver)
      or (p_both and giver = p_receiver and receiver = p_giver));
  end if;
end $$;

-- Lance (ou refait) un tirage. Personne, pas même l'organisateur, ne voit les résultats des autres.
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

  -- notification dans le site (sans le résultat) : chaque compte participant, et le parent de chaque liste d'enfant
  select e.name, d.name into v_event, v_draw from draws d join events e on e.id = d.event_id where d.id = p_draw;
  insert into notifications (user_id, kind, title, body, link)
  select distinct coalesce(p.user_id, w.owner_id), 'draw_done',
         left('🎲 Tirage « ' || v_draw || ' » : « ' || v_event || ' »', 200),
         'Le tirage a eu lieu. Découvrez à qui offrir un cadeau.', '/evenements/' || v_ev::text
    from draw_participants p left join wishlists w on w.id = p.list_id
   where p.draw_id = p_draw;
end $$;

create or replace function public.reset_one_draw(p_draw uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_ev uuid;
begin
  v_ev := public.draw_check_org(p_draw);
  delete from draw_results where draw_id = p_draw;
  update draws set done_at = null, done_count = null, emailed_at = null where id = p_draw;
  perform public.draw_sync_event(v_ev);
end $$;

-- Réservé au serveur (fonction Edge « send-draw-email ») : une ligne par adresse à prévenir,
-- avec le prénom des enfants dont la personne reçoit le résultat. Une seule fois par tirage.
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
    select u.email::text, pr.display_name,
           coalesce(array_agg(w.child_name order by w.child_name) filter (where w.id is not null), '{}'),
           bool_or(p.user_id is not null),
           v_ev.id, v_ev.name, v_ev.event_date, v_d.name,
           (select pp.display_name from profiles pp where pp.id = p_user)
      from draw_participants p
      left join wishlists w on w.id = p.list_id
      join auth.users u on u.id = coalesce(p.user_id, w.owner_id)
      join profiles pr on pr.id = u.id
     where p.draw_id = p_draw
     group by u.email, pr.display_name;
end $$;

revoke all on function public.event_draws(uuid)                                   from public, anon;
revoke all on function public.save_draw(uuid, uuid, text, uuid[])                 from public, anon;
revoke all on function public.delete_draw(uuid)                                   from public, anon;
revoke all on function public.set_draw_block(uuid, uuid, uuid, boolean, boolean)  from public, anon;
revoke all on function public.run_one_draw(uuid)                                  from public, anon;
revoke all on function public.reset_one_draw(uuid)                                from public, anon;
grant execute on function public.event_draws(uuid)                                to authenticated;
grant execute on function public.save_draw(uuid, uuid, text, uuid[])              to authenticated;
grant execute on function public.delete_draw(uuid)                                to authenticated;
grant execute on function public.set_draw_block(uuid, uuid, uuid, boolean, boolean) to authenticated;
grant execute on function public.run_one_draw(uuid)                               to authenticated;
grant execute on function public.reset_one_draw(uuid)                             to authenticated;
revoke all on function public.request_one_draw_emails(uuid, uuid) from public, anon, authenticated;
grant execute on function public.request_one_draw_emails(uuid, uuid) to service_role;

-- ---------- Reprise des tirages existants : un tirage « Tirage au sort » par événement ----------
do $$
declare e record; v_id uuid;
begin
  for e in select * from events ev
            where (ev.draw_enabled or ev.draw_done_at is not null
                   or exists (select 1 from draw_exclusions x where x.event_id = ev.id))
              and not exists (select 1 from draws d where d.event_id = ev.id)
  loop
    insert into draws (event_id, name, done_at, done_count, emailed_at)
      values (e.id, 'Tirage au sort', e.draw_done_at, e.draw_count, e.draw_emailed_at) returning id into v_id;
    insert into draw_participants (draw_id, pid, user_id)
      select v_id, user_id, user_id from event_members where event_id = e.id and in_draw;
    insert into draw_blocks (draw_id, giver, receiver)
      select v_id, giver_id, receiver_id from draw_exclusions x
       where x.event_id = e.id
         and exists (select 1 from draw_participants p where p.draw_id = v_id and p.pid = x.giver_id)
         and exists (select 1 from draw_participants p where p.draw_id = v_id and p.pid = x.receiver_id)
      on conflict do nothing;
    insert into draw_results (draw_id, giver, receiver)
      select v_id, giver_id, receiver_id from draw_assignments where event_id = e.id;
  end loop;
end $$;
