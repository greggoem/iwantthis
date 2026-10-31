-- =====================================================================
--  Liste de cadeaux partagée — schéma Supabase (PostgreSQL)
--  À exécuter une seule fois dans Supabase > SQL Editor > New query.
--  Toute la confidentialité repose sur la sécurité par ligne (RLS) :
--  même en appelant l'API directement, le propriétaire d'une liste ne
--  peut PAS voir les achats avant la date de remise.
-- =====================================================================

-- ---------- Utilitaire : « aujourd'hui » à l'heure belge -------------
create or replace function public.today_be()
returns date language sql stable as $$
  select (now() at time zone 'Europe/Brussels')::date
$$;

-- ---------- Profils --------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at   timestamptz not null default now()
);

-- Création automatique du profil à l'inscription (email ou Google)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
      nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
      nullif(trim(new.raw_user_meta_data->>'name'), ''),
      split_part(new.email, '@', 1)
    )
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Tables ---------------------------------------------------
-- Une liste par personne
create table public.wishlists (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null unique references public.profiles(id) on delete cascade,
  title       text not null default 'Ma liste de cadeaux',
  share_token uuid not null unique default gen_random_uuid(),
  created_at  timestamptz not null default now()
);

-- Personnes qui ont ouvert le lien de partage d'une liste
create table public.list_access (
  list_id    uuid not null references public.wishlists(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (list_id, user_id)
);

create table public.items (
  id         uuid primary key default gen_random_uuid(),
  list_id    uuid not null references public.wishlists(id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 200),
  url        text check (url is null or char_length(url) <= 2000),
  details    text check (details is null or char_length(details) <= 1000),
  price      numeric(10,2),
  created_at timestamptz not null default now()
);
create index items_list_idx on public.items(list_id);

create table public.events (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(name) between 1 and 120),
  event_date   date not null,
  created_by   uuid not null references public.profiles(id) on delete cascade,
  invite_code  text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
  draw_done_at timestamptz,
  draw_count   int,                       -- nb de participants au moment du tirage
  created_at   timestamptz not null default now()
);

create table public.event_members (
  event_id  uuid not null references public.events(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  in_draw   boolean not null default true,
  joined_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index event_members_user_idx on public.event_members(user_id);

-- Achat d'un cadeau : visible par tous SAUF le propriétaire de la liste,
-- qui ne le voit qu'à partir de reveal_on.
create table public.item_claims (
  item_id         uuid primary key references public.items(id) on delete cascade,
  claimed_by      uuid not null references public.profiles(id) on delete cascade,
  claimed_by_name text not null,
  event_id        uuid references public.events(id) on delete set null,
  reveal_on       date not null,
  created_at      timestamptz not null default now()
);

create table public.draw_exclusions (
  event_id    uuid not null references public.events(id) on delete cascade,
  giver_id    uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  primary key (event_id, giver_id, receiver_id),
  check (giver_id <> receiver_id)
);

create table public.draw_assignments (
  event_id    uuid not null references public.events(id) on delete cascade,
  giver_id    uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  primary key (event_id, giver_id)
);

-- Programmes de parrainage / affiliation (modifiables dans le Table Editor)
create table public.affiliate_programs (
  id          uuid primary key default gen_random_uuid(),
  label       text not null,
  domain      text not null,                         -- ex. amazon.com.be (sous-domaines inclus)
  kind        text not null check (kind in ('param', 'template')),
  param_name  text,                                  -- kind = 'param'    : ex. tag
  param_value text,                                  -- kind = 'param'    : ex. montag-21
  template    text,                                  -- kind = 'template' : ex. https://www.awin1.com/cread.php?awinmid=123&awinaffid=456&ued={url}
  enabled     boolean not null default false,
  check (
    (kind = 'param'    and param_name is not null and param_value is not null) or
    (kind = 'template' and template   is not null and template like '%{url}%')
  )
);

-- ---------- Fonctions d'aide (SECURITY DEFINER pour éviter la récursion RLS) ----
create or replace function public.is_event_member(p_event uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from event_members where event_id = p_event and user_id = auth.uid())
$$;

create or replace function public.is_event_member_user(p_event uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from event_members where event_id = p_event and user_id = p_user)
$$;

create or replace function public.is_event_creator(p_event uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from events where id = p_event and created_by = auth.uid())
$$;

create or replace function public.can_view_list(p_list uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from wishlists w
    where w.id = p_list
      and (
        w.owner_id = auth.uid()
        or exists (select 1 from list_access a where a.list_id = w.id and a.user_id = auth.uid())
        or exists (
          select 1 from event_members m1
          join event_members m2 on m2.event_id = m1.event_id
          where m1.user_id = auth.uid() and m2.user_id = w.owner_id
        )
      )
  )
$$;

create or replace function public.owns_list(p_list uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from wishlists where id = p_list and owner_id = auth.uid())
$$;

create or replace function public.item_owner(p_item uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select w.owner_id from items i join wishlists w on w.id = i.list_id where i.id = p_item
$$;

create or replace function public.can_view_item(p_item uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from items i where i.id = p_item and public.can_view_list(i.list_id))
$$;

create or replace function public.can_see_profile(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select
    p_user = auth.uid()
    or exists (
      select 1 from event_members m1
      join event_members m2 on m2.event_id = m1.event_id
      where m1.user_id = auth.uid() and m2.user_id = p_user
    )
    or exists (
      select 1 from list_access a
      join wishlists w on w.id = a.list_id
      where a.user_id = auth.uid() and w.owner_id = p_user
    )
$$;

-- ---------- Sécurité par ligne (RLS) ---------------------------------
alter table public.profiles           enable row level security;
alter table public.wishlists          enable row level security;
alter table public.list_access        enable row level security;
alter table public.items              enable row level security;
alter table public.events             enable row level security;
alter table public.event_members      enable row level security;
alter table public.item_claims        enable row level security;
alter table public.draw_exclusions    enable row level security;
alter table public.draw_assignments   enable row level security;
alter table public.affiliate_programs enable row level security;

-- Profils : le sien + ceux des personnes avec qui on partage une liste ou un événement
create policy profiles_select on public.profiles for select to authenticated
  using (public.can_see_profile(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Listes
create policy wishlists_select on public.wishlists for select to authenticated
  using (public.can_view_list(id));
create policy wishlists_insert on public.wishlists for insert to authenticated
  with check (owner_id = auth.uid());
create policy wishlists_update on public.wishlists for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- list_access : on ne voit que ses propres accès (ajout uniquement via open_shared_list)
create policy list_access_select on public.list_access for select to authenticated
  using (user_id = auth.uid());
create policy list_access_delete on public.list_access for delete to authenticated
  using (user_id = auth.uid());

-- Cadeaux
create policy items_select on public.items for select to authenticated
  using (public.can_view_list(list_id));
create policy items_insert on public.items for insert to authenticated
  with check (public.owns_list(list_id));
create policy items_update on public.items for update to authenticated
  using (public.owns_list(list_id)) with check (public.owns_list(list_id));
create policy items_delete on public.items for delete to authenticated
  using (public.owns_list(list_id));

-- Achats : jamais visibles du propriétaire avant reveal_on
create policy claims_select on public.item_claims for select to authenticated
  using (
    claimed_by = auth.uid()
    or (public.can_view_item(item_id) and public.item_owner(item_id) <> auth.uid())
    or (public.item_owner(item_id) = auth.uid() and reveal_on <= public.today_be())
  );
create policy claims_delete on public.item_claims for delete to authenticated
  using (claimed_by = auth.uid());
-- pas de policy INSERT : les achats passent par claim_item()

-- Événements
create policy events_select on public.events for select to authenticated
  using (created_by = auth.uid() or public.is_event_member(id));
create policy events_insert on public.events for insert to authenticated
  with check (created_by = auth.uid());
create policy events_update on public.events for update to authenticated
  using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy events_delete on public.events for delete to authenticated
  using (created_by = auth.uid());

-- Invités : visibles par les membres ; l'organisateur gère, chacun peut quitter
create policy event_members_select on public.event_members for select to authenticated
  using (public.is_event_member(event_id) or public.is_event_creator(event_id));
create policy event_members_update on public.event_members for update to authenticated
  using (public.is_event_creator(event_id)) with check (public.is_event_creator(event_id));
create policy event_members_delete on public.event_members for delete to authenticated
  using (user_id = auth.uid() or public.is_event_creator(event_id));
-- pas de policy INSERT : on rejoint via join_event()

-- Exclusions du tirage : organisateur uniquement
create policy exclusions_all on public.draw_exclusions for all to authenticated
  using (public.is_event_creator(event_id))
  with check (
    public.is_event_creator(event_id)
    and public.is_event_member_user(event_id, giver_id)
    and public.is_event_member_user(event_id, receiver_id)
  );

-- Résultat du tirage : chacun ne voit QUE la personne à qui il offre (même l'organisateur)
create policy assignments_select on public.draw_assignments for select to authenticated
  using (giver_id = auth.uid());

-- Parrainage : lecture seule des programmes actifs
create policy affiliate_select on public.affiliate_programs for select to authenticated
  using (enabled);

-- ---------- Triggers -------------------------------------------------
-- L'organisateur devient automatiquement invité de son événement
create or replace function public.add_creator_as_member()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into event_members (event_id, user_id) values (new.id, new.created_by);
  return new;
end $$;

create trigger events_add_creator
  after insert on public.events
  for each row execute function public.add_creator_as_member();

-- Si la date de l'événement change, la date de révélation des achats suit
create or replace function public.sync_claim_reveal()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.event_date is distinct from old.event_date then
    update item_claims set reveal_on = new.event_date where event_id = new.id;
  end if;
  return new;
end $$;

create trigger events_sync_claims
  after update on public.events
  for each row execute function public.sync_claim_reveal();

-- Quand quelqu'un quitte un événement : nettoyage du tirage et des exclusions
create or replace function public.cleanup_member_leave()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from draw_assignments
   where event_id = old.event_id and (giver_id = old.user_id or receiver_id = old.user_id);
  delete from draw_exclusions
   where event_id = old.event_id and (giver_id = old.user_id or receiver_id = old.user_id);
  return old;
end $$;

create trigger event_members_cleanup
  after delete on public.event_members
  for each row execute function public.cleanup_member_leave();

-- ---------- Fonctions appelables par l'application (RPC) -------------

-- Crée la liste de l'utilisateur si elle n'existe pas encore, et la renvoie
create or replace function public.ensure_my_list()
returns public.wishlists language plpgsql security definer set search_path = public as $$
declare v_list wishlists;
begin
  if auth.uid() is null then raise exception 'Non connecté'; end if;
  select * into v_list from wishlists where owner_id = auth.uid();
  if not found then
    insert into wishlists (owner_id) values (auth.uid()) returning * into v_list;
  end if;
  return v_list;
end $$;

-- Ouvrir un lien de partage : donne accès à la liste, renvoie son id
create or replace function public.open_shared_list(p_token uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_list uuid; v_owner uuid;
begin
  if auth.uid() is null then raise exception 'Non connecté'; end if;
  select id, owner_id into v_list, v_owner from wishlists where share_token = p_token;
  if v_list is null then raise exception 'Lien de partage invalide'; end if;
  if v_owner <> auth.uid() then
    insert into list_access (list_id, user_id) values (v_list, auth.uid())
    on conflict do nothing;
  end if;
  return v_list;
end $$;

-- Rejoindre un événement avec son code d'invitation
create or replace function public.join_event(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_event uuid;
begin
  if auth.uid() is null then raise exception 'Non connecté'; end if;
  select id into v_event from events where invite_code = p_code;
  if v_event is null then raise exception 'Invitation invalide'; end if;
  insert into event_members (event_id, user_id) values (v_event, auth.uid())
  on conflict do nothing;
  return v_event;
end $$;

-- Réserver (« j'ai acheté ») un cadeau d'une autre personne.
-- La date de remise vient de l'événement choisi, ou d'une date libre.
create or replace function public.claim_item(
  p_item uuid, p_event uuid default null, p_reveal date default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_list uuid; v_owner uuid; v_date date; v_name text;
begin
  if v_uid is null then raise exception 'Non connecté'; end if;

  select i.list_id, w.owner_id into v_list, v_owner
    from items i join wishlists w on w.id = i.list_id where i.id = p_item;
  if v_list is null then raise exception 'Cadeau introuvable'; end if;
  if v_owner = v_uid then raise exception 'Vous ne pouvez pas réserver un cadeau de votre propre liste'; end if;
  if not public.can_view_list(v_list) then raise exception 'Accès refusé'; end if;

  if p_event is not null then
    select event_date into v_date from events e
     where e.id = p_event
       and public.is_event_member_user(e.id, v_uid)
       and public.is_event_member_user(e.id, v_owner);
    if v_date is null then
      raise exception 'Cet événement ne réunit pas les deux personnes';
    end if;
  else
    v_date := p_reveal;
  end if;
  if v_date is null then raise exception 'Date de remise requise'; end if;

  select display_name into v_name from profiles where id = v_uid;

  begin
    insert into item_claims (item_id, claimed_by, claimed_by_name, event_id, reveal_on)
    values (p_item, v_uid, v_name, p_event, v_date);
  exception when unique_violation then
    raise exception 'Ce cadeau est déjà réservé';
  end;
end $$;

-- Tirage au sort (organisateur uniquement). Le résultat est calculé côté
-- serveur : personne, pas même l'organisateur, ne voit les autres résultats.
create or replace function public.run_draw(p_event uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_givers   uuid[];
  v_recv     uuid[];
  v_excl     text[];
  v_n        int;
  v_try      int := 0;
  v_ok       boolean := false;
  i          int;
begin
  if not exists (select 1 from events where id = p_event and created_by = auth.uid()) then
    raise exception 'Seul l''organisateur peut lancer le tirage';
  end if;

  select array_agg(user_id order by user_id) into v_givers
    from event_members where event_id = p_event and in_draw;
  v_n := coalesce(array_length(v_givers, 1), 0);
  if v_n < 2 then raise exception 'Il faut au moins 2 participants au tirage'; end if;

  select coalesce(array_agg(giver_id::text || '>' || receiver_id::text), '{}') into v_excl
    from draw_exclusions where event_id = p_event;

  while v_try < 20000 and not v_ok loop
    v_try := v_try + 1;
    select array_agg(u order by random()) into v_recv from unnest(v_givers) u;
    v_ok := true;
    for i in 1..v_n loop
      if v_givers[i] = v_recv[i]
         or (v_givers[i]::text || '>' || v_recv[i]::text) = any (v_excl) then
        v_ok := false;
        exit;
      end if;
    end loop;
  end loop;

  if not v_ok then
    raise exception 'Tirage impossible avec ces exclusions : en retirer quelques-unes';
  end if;

  delete from draw_assignments where event_id = p_event;
  for i in 1..v_n loop
    insert into draw_assignments (event_id, giver_id, receiver_id)
    values (p_event, v_givers[i], v_recv[i]);
  end loop;
  update events set draw_done_at = now(), draw_count = v_n where id = p_event;
end $$;

-- Annuler le tirage (organisateur)
create or replace function public.reset_draw(p_event uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from events where id = p_event and created_by = auth.uid()) then
    raise exception 'Seul l''organisateur peut annuler le tirage';
  end if;
  delete from draw_assignments where event_id = p_event;
  update events set draw_done_at = null, draw_count = null where id = p_event;
end $$;

-- ---------- Droits d'exécution ---------------------------------------
revoke all on function public.ensure_my_list()                       from public, anon;
revoke all on function public.open_shared_list(uuid)                 from public, anon;
revoke all on function public.join_event(text)                       from public, anon;
revoke all on function public.claim_item(uuid, uuid, date)           from public, anon;
revoke all on function public.run_draw(uuid)                         from public, anon;
revoke all on function public.reset_draw(uuid)                       from public, anon;
grant execute on function public.ensure_my_list()                    to authenticated;
grant execute on function public.open_shared_list(uuid)              to authenticated;
grant execute on function public.join_event(text)                    to authenticated;
grant execute on function public.claim_item(uuid, uuid, date)        to authenticated;
grant execute on function public.run_draw(uuid)                      to authenticated;
grant execute on function public.reset_draw(uuid)                    to authenticated;

-- Les résultats du tirage ne s'écrivent que via run_draw()
revoke insert, update, delete on public.draw_assignments from authenticated, anon;
revoke insert, update, delete on public.item_claims      from authenticated, anon;
grant  delete                  on public.item_claims      to authenticated;
revoke all on public.affiliate_programs from anon;
revoke insert, update, delete on public.affiliate_programs from authenticated;

-- ---------- Parrainage : exemples à compléter ------------------------
-- Désactivés tant que vous n'avez pas mis votre identifiant et passé enabled à true
-- (Supabase > Table Editor > affiliate_programs).
insert into public.affiliate_programs (label, domain, kind, param_name, param_value, enabled) values
  ('Amazon Belgique', 'amazon.com.be', 'param', 'tag', 'VOTRE-TAG-21', false),
  ('Amazon France',   'amazon.fr',     'param', 'tag', 'VOTRE-TAG-21', false);

-- ---------- Durcissement des droits (recommandé par le linter Supabase) ----
alter function public.today_be() set search_path = public;

-- Fonctions de déclencheur : jamais appelables via l'API
revoke all on function public.add_creator_as_member() from public, anon, authenticated;
revoke all on function public.cleanup_member_leave()  from public, anon, authenticated;
revoke all on function public.handle_new_user()       from public, anon, authenticated;
revoke all on function public.sync_claim_reveal()     from public, anon, authenticated;

-- Fonctions d'aide des règles de sécurité : réservées aux utilisateurs connectés
revoke all on function public.can_see_profile(uuid)             from public, anon;
revoke all on function public.can_view_item(uuid)               from public, anon;
revoke all on function public.can_view_list(uuid)               from public, anon;
revoke all on function public.is_event_creator(uuid)            from public, anon;
revoke all on function public.is_event_member(uuid)             from public, anon;
revoke all on function public.is_event_member_user(uuid, uuid)  from public, anon;
revoke all on function public.item_owner(uuid)                  from public, anon;
revoke all on function public.owns_list(uuid)                   from public, anon;
grant execute on function public.can_see_profile(uuid)             to authenticated;
grant execute on function public.can_view_item(uuid)               to authenticated;
grant execute on function public.can_view_list(uuid)               to authenticated;
grant execute on function public.is_event_creator(uuid)            to authenticated;
grant execute on function public.is_event_member(uuid)             to authenticated;
grant execute on function public.is_event_member_user(uuid, uuid)  to authenticated;
grant execute on function public.item_owner(uuid)                  to authenticated;
grant execute on function public.owns_list(uuid)                   to authenticated;
grant execute on function public.today_be()                        to authenticated;
