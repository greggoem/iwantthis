-- =====================================================================
--  Cadeaux communs, v3 (après group_gifts_v2.sql)
--  Inviter « un enfant » (une liste d'enfant visible) = inviter le parent qui tient sa liste :
--  il devient invité, reçoit une notification et un e-mail (son adresse n'est jamais renvoyée au site).
-- =====================================================================
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
