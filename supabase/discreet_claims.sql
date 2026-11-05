-- 1) Achat « discret » : l'envie disparaît tout de suite de la liste des autres invités.
-- 2) Une fois la date de remise passée (révélation au propriétaire), l'envie disparaît aussi pour les autres.
-- Le propriétaire de la liste (qui la voit toujours) et celui qui a acheté gardent l'accès.

alter table public.item_claims add column if not exists discreet boolean not null default false;

-- Vrai si l'envie ne doit plus être vue par les « autres » (ni propriétaire, ni acheteur)
create or replace function public.item_hidden_from_others(p_item uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select
    exists (select 1 from item_claims c where c.item_id = p_item and (c.discreet or c.reveal_on < public.today_be()))
    -- groupe « un seul à choisir » dont une option a déjà été offerte et révélée : les autres options n'ont plus lieu d'être
    or exists (
      select 1 from items i
      join items g on g.id = i.parent_id and g.pick_one
      join items s on s.parent_id = g.id
      join item_claims c on c.item_id = s.id
      where i.id = p_item and c.reveal_on < public.today_be()
    )
$$;
revoke all on function public.item_hidden_from_others(uuid) from public, anon;
grant execute on function public.item_hidden_from_others(uuid) to authenticated;

drop policy if exists items_select on public.items;
create policy items_select on public.items for select to authenticated
  using (
    public.owns_list(list_id)
    or (
      public.can_view_list(list_id)
      and (
        not public.item_hidden_from_others(id)
        or exists (select 1 from item_claims c where c.item_id = items.id and c.claimed_by = auth.uid())
      )
    )
  );

-- les achats cachés ne se lisent pas non plus directement
drop policy if exists claims_select on public.item_claims;
create policy claims_select on public.item_claims for select to authenticated
  using (
    claimed_by = auth.uid()
    or (public.can_view_item(item_id) and public.item_owner(item_id) <> auth.uid() and not public.item_hidden_from_others(item_id))
    or (public.item_owner(item_id) = auth.uid() and reveal_on < public.today_be())
  );

-- claim_item : nouveau paramètre p_discreet
drop function if exists public.claim_item(uuid, uuid, date);
create or replace function public.claim_item(
  p_item uuid, p_event uuid default null, p_reveal date default null, p_discreet boolean default false
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
end $$;
revoke all on function public.claim_item(uuid, uuid, date, boolean) from public, anon;
grant execute on function public.claim_item(uuid, uuid, date, boolean) to authenticated;

-- update_claim : on peut aussi changer le mode discret
drop function if exists public.update_claim(uuid, uuid, date);
create or replace function public.update_claim(p_item uuid, p_event uuid default null, p_reveal date default null, p_discreet boolean default null)
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
  update item_claims
     set event_id = p_event, reveal_on = v_date, discreet = coalesce(p_discreet, discreet)
   where item_id = p_item and claimed_by = v_uid;
end $$;
revoke all on function public.update_claim(uuid, uuid, date, boolean) from public, anon;
grant execute on function public.update_claim(uuid, uuid, date, boolean) to authenticated;
