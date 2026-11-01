-- =====================================================================
--  Groupes de cadeaux (à exécuter après schema.sql)
--  Une « envie groupe » contient plusieurs éléments (un par objet) :
--   - pick_one = false : collection, chaque élément s'achète séparément (livres, vinyles…)
--   - pick_one = true  : un seul à choisir (dès qu'un élément est acheté, les autres sont inutiles)
--  Le groupe lui-même ne s'achète pas : on achète un élément.
-- =====================================================================
alter table public.items
  add column if not exists parent_id uuid references public.items(id) on delete cascade,
  add column if not exists is_group  boolean not null default false,
  add column if not exists pick_one  boolean not null default false;
create index if not exists items_parent_idx on public.items(parent_id);

create or replace function public.items_check_parent()
returns trigger language plpgsql security definer set search_path = public as $$
declare p record;
begin
  if tg_op = 'UPDATE' and old.is_group is distinct from new.is_group then
    raise exception 'Un cadeau ne peut pas devenir un groupe (ni l''inverse)';
  end if;
  if tg_op = 'UPDATE' and old.list_id is distinct from new.list_id then
    raise exception 'Un cadeau ne peut pas changer de liste';
  end if;
  if new.is_group then
    if new.parent_id is not null then raise exception 'Un groupe ne peut pas être dans un autre groupe'; end if;
    new.url := null; new.price := null;           -- un groupe n'a ni lien ni prix propre
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

drop trigger if exists items_check_parent on public.items;
create trigger items_check_parent before insert or update on public.items
  for each row execute function public.items_check_parent();

revoke all on function public.items_check_parent() from public, anon, authenticated;

-- Achat : un groupe ne s'achète pas ; dans un groupe « un seul à choisir », une seule option
create or replace function public.claim_item(
  p_item uuid, p_event uuid default null, p_reveal date default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_list uuid; v_owner uuid; v_date date; v_name text; v_group boolean; v_parent uuid; v_pick boolean := false;
begin
  if v_uid is null then raise exception 'Non connecté'; end if;

  select i.list_id, w.owner_id, i.is_group, i.parent_id into v_list, v_owner, v_group, v_parent
    from items i join wishlists w on w.id = i.list_id where i.id = p_item;
  if v_list is null then raise exception 'Cadeau introuvable'; end if;
  if v_owner = v_uid then raise exception 'Vous ne pouvez pas réserver un cadeau de votre propre liste'; end if;
  if not public.can_view_list(v_list) then raise exception 'Accès refusé'; end if;
  if v_group then raise exception 'Un groupe ne s''achète pas : choisissez un élément à l''intérieur'; end if;

  if v_parent is not null then
    -- verrou sur le groupe : deux achats simultanés ne peuvent pas passer tous les deux
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
