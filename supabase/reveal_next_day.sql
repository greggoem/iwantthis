-- Les cadeaux offerts deviennent visibles pour le propriétaire de la liste le LENDEMAIN de la date de remise
-- (souvent la fête a lieu le soir), puis sont archivés une fois que la personne les a découverts.

alter table public.item_claims add column if not exists owner_seen_at timestamptz;

drop policy if exists claims_select on public.item_claims;
create policy claims_select on public.item_claims for select to authenticated
  using (
    claimed_by = auth.uid()
    or (public.can_view_item(item_id) and public.item_owner(item_id) <> auth.uid())
    or (public.item_owner(item_id) = auth.uid() and reveal_on < public.today_be())
  );

-- Le propriétaire a découvert ses cadeaux : ils passent aux archives de sa liste
create or replace function public.mark_gifts_seen()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  update item_claims c set owner_seen_at = now()
   where c.owner_seen_at is null
     and c.reveal_on < public.today_be()
     and public.item_owner(c.item_id) = auth.uid();
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.mark_gifts_seen() from public, anon;
grant execute on function public.mark_gifts_seen() to authenticated;
