-- Listes d'enfants : le parent peut marquer « Acheté » sur la liste de son enfant (depuis « Listes de mes proches »).
-- Sa propre liste reste interdite à l'achat par lui-même.
create or replace function public.claim_item(p_item uuid, p_event uuid default null, p_reveal date default null, p_discreet boolean default false)
returns void language plpgsql security definer set search_path = public as $function$
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
    insert into item_claims (item_id, claimed_by, claimed_by_name, event_id, reveal_on, discreet)
    values (p_item, v_uid, v_name, p_event, v_date, coalesce(p_discreet, false));
  exception when unique_violation then
    raise exception 'Ce cadeau est déjà réservé';
  end;
end $function$;
