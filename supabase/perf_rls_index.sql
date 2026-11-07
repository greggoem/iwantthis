-- Performance (avis Supabase du 07/11/2026) : à appliquer une seule fois.
-- 1) Index sur les clés étrangères non indexées
create index if not exists draw_assignments_giver_id_idx on public.draw_assignments (giver_id);
create index if not exists draw_assignments_receiver_id_idx on public.draw_assignments (receiver_id);
create index if not exists draw_exclusions_giver_id_idx on public.draw_exclusions (giver_id);
create index if not exists draw_exclusions_receiver_id_idx on public.draw_exclusions (receiver_id);
create index if not exists events_created_by_idx on public.events (created_by);
create index if not exists item_claims_claimed_by_idx on public.item_claims (claimed_by);
create index if not exists item_claims_event_id_idx on public.item_claims (event_id);
create index if not exists list_access_user_id_idx on public.list_access (user_id);

-- 2) Règles RLS : auth.uid() évalué une seule fois par requête, et non pour chaque ligne
--    (même logique qu'avant, seule l'écriture change : auth.uid() → (select auth.uid()))
alter policy api_tokens_delete on public.api_tokens
  using (user_id = (select auth.uid()));
alter policy api_tokens_select on public.api_tokens
  using (user_id = (select auth.uid()));
alter policy assignments_select on public.draw_assignments
  using (giver_id = (select auth.uid()));
alter policy event_members_delete on public.event_members
  using ((user_id = (select auth.uid())) OR is_event_creator(event_id));
alter policy events_delete on public.events
  using (created_by = (select auth.uid()));
alter policy events_insert on public.events
  with check (created_by = (select auth.uid()));
alter policy events_select on public.events
  using ((created_by = (select auth.uid())) OR is_event_member(id));
alter policy events_update on public.events
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));
alter policy claims_delete on public.item_claims
  using (claimed_by = (select auth.uid()));
alter policy claims_select on public.item_claims
  using ((claimed_by = (select auth.uid())) OR (can_view_item(item_id) AND (item_owner(item_id) <> (select auth.uid())) AND (NOT item_hidden_from_others(item_id))) OR ((item_owner(item_id) = (select auth.uid())) AND (reveal_on < today_be())));
alter policy items_select on public.items
  using (owns_list(list_id) OR (can_view_list(list_id) AND ((NOT item_hidden_from_others(id)) OR (EXISTS ( SELECT 1 FROM item_claims c WHERE ((c.item_id = items.id) AND (c.claimed_by = (select auth.uid()))))))));
alter policy list_access_delete on public.list_access
  using (user_id = (select auth.uid()));
alter policy list_access_select on public.list_access
  using (user_id = (select auth.uid()));
alter policy notifications_delete on public.notifications
  using (user_id = (select auth.uid()));
alter policy notifications_select on public.notifications
  using (user_id = (select auth.uid()));
alter policy notifications_update on public.notifications
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
alter policy profiles_update on public.profiles
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
alter policy wishlists_insert on public.wishlists
  with check (owner_id = (select auth.uid()));
alter policy wishlists_update on public.wishlists
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
