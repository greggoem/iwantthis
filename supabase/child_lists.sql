-- Listes d'enfants : un parent tient la liste d'envies d'un enfant qui n'a pas de compte (ni d'e-mail).
-- La liste appartient au parent (owner_id) et porte le prénom de l'enfant (child_name).
-- • Les proches la voient comme une liste à part entière.
-- • Le parent voit tout de suite ce qui est acheté (c'est lui qui coordonne) ; sur SA propre liste la surprise reste protégée.
-- • Dans les événements du parent : visible par défaut (in_events), réglable événement par événement (event_child_lists).
-- • Les enfants ne participent pas au tirage au sort (il reste entre comptes).

alter table public.wishlists
  add column if not exists child_name  text,
  add column if not exists child_age   text,
  add column if not exists child_color text,
  add column if not exists in_events   boolean not null default true;

alter table public.wishlists drop constraint if exists wishlists_child_name_len;
alter table public.wishlists add constraint wishlists_child_name_len check (child_name is null or length(btrim(child_name)) between 1 and 40);
alter table public.wishlists drop constraint if exists wishlists_child_age_len;
alter table public.wishlists add constraint wishlists_child_age_len check (child_age is null or length(child_age) <= 20);
alter table public.wishlists drop constraint if exists wishlists_child_color_ok;
alter table public.wishlists add constraint wishlists_child_color_ok check (child_color is null or child_color in ('corail','bleu','vert','jaune','violet'));

-- une seule liste « à soi » par compte ; les listes d'enfants s'y ajoutent
alter table public.wishlists drop constraint if exists wishlists_owner_id_key;
create unique index if not exists wishlists_owner_self_key on public.wishlists (owner_id) where child_name is null;
create index if not exists wishlists_owner_idx on public.wishlists (owner_id);

create or replace function public.ensure_my_list()
returns wishlists language plpgsql security definer set search_path = public as $$
declare v_list wishlists;
begin
  if auth.uid() is null then raise exception 'Non connecté'; end if;
  insert into wishlists (owner_id) values (auth.uid()) on conflict (owner_id) where child_name is null do nothing;
  select * into v_list from wishlists where owner_id = auth.uid() and child_name is null;
  return v_list;
end $$;

-- visibilité par événement : sans ligne ici, c'est in_events qui décide
create table if not exists public.event_child_lists (
  event_id uuid not null references public.events(id) on delete cascade,
  list_id  uuid not null references public.wishlists(id) on delete cascade,
  shown    boolean not null,
  primary key (event_id, list_id)
);
alter table public.event_child_lists enable row level security;
create index if not exists event_child_lists_list_idx on public.event_child_lists (list_id);

drop policy if exists ecl_select on public.event_child_lists;
create policy ecl_select on public.event_child_lists for select
  using (public.owns_list(list_id) or public.is_event_member(event_id));
drop policy if exists ecl_write on public.event_child_lists;
create policy ecl_write on public.event_child_lists for all
  using (public.owns_list(list_id))
  with check (public.owns_list(list_id) and public.is_event_member(event_id)
              and exists (select 1 from public.wishlists w where w.id = list_id and w.child_name is not null));

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
            and (w.child_name is null
                 or coalesce((select c.shown from event_child_lists c where c.event_id = m1.event_id and c.list_id = w.id), w.in_events))
        )
      )
  )
$$;

create or replace function public.item_on_child_list(p_item uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from items i join wishlists w on w.id = i.list_id where i.id = p_item and w.child_name is not null)
$$;

-- le parent voit les achats faits pour ses enfants
drop policy if exists claims_select on public.item_claims;
create policy claims_select on public.item_claims for select using (
  (claimed_by = (select auth.uid()))
  or (public.can_view_item(item_id) and public.item_owner(item_id) <> (select auth.uid()) and not public.item_hidden_from_others(item_id))
  or (public.item_owner(item_id) = (select auth.uid()) and (reveal_on < public.today_be() or public.item_on_child_list(item_id)))
);

-- création et suppression d'une liste d'enfant (10 au plus par compte)
create or replace function public.create_child_list(p_name text, p_age text default null, p_color text default null, p_in_events boolean default true)
returns wishlists language plpgsql security definer set search_path = public as $$
declare v wishlists;
begin
  if auth.uid() is null then raise exception 'Non connecté'; end if;
  if (select count(*) from wishlists where owner_id = auth.uid() and child_name is not null) >= 10 then
    raise exception 'Vous avez déjà 10 listes d''enfants';
  end if;
  insert into wishlists (owner_id, title, child_name, child_age, child_color, in_events)
  values (auth.uid(), 'Ma liste d''envies', btrim(p_name), nullif(btrim(coalesce(p_age, '')), ''), p_color, coalesce(p_in_events, true))
  returning * into v;
  return v;
end $$;

create or replace function public.delete_child_list(p_list uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from wishlists where id = p_list and owner_id = auth.uid() and child_name is not null;
  if not found then raise exception 'Liste introuvable'; end if;
end $$;

revoke all on function public.create_child_list(text, text, text, boolean) from public;
revoke all on function public.delete_child_list(uuid) from public;
grant execute on function public.create_child_list(text, text, text, boolean) to authenticated;
grant execute on function public.delete_child_list(uuid) to authenticated;
grant select, insert, update, delete on public.event_child_lists to authenticated;

-- aperçu des liens partagés (WhatsApp…) : « La liste d'envies de Léo »
create or replace function public.share_preview(p_kind text, p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if p_code is null or length(p_code) > 100 then return null; end if;
  if p_kind = 'e' then
    select jsonb_build_object('name', e.name, 'date', e.event_date, 'time', to_char(e.event_time, 'HH24:MI'), 'image', e.image_url)
      into r from events e where e.invite_code = p_code;
  elsif p_kind = 'l' then
    select jsonb_build_object('owner', coalesce(w.child_name, p.display_name))
      into r from wishlists w left join profiles p on p.id = w.owner_id where w.share_token::text = p_code;
  end if;
  return r;
end $$;

-- ces fonctions demandent un compte : pas d'accès anonyme
revoke execute on function public.create_child_list(text, text, text, boolean) from anon;
revoke execute on function public.delete_child_list(uuid) from anon;
revoke execute on function public.item_on_child_list(uuid) from anon;
revoke execute on function public.event_invite_info(text) from anon;
