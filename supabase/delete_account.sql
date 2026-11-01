-- =====================================================================
--  Suppression de son propre compte (droit à l'effacement)
--  À exécuter après schema.sql.
--  - la liste, les cadeaux, les achats, les jetons et le profil sont supprimés
--  - un événement organisé est transmis au plus ancien autre invité ;
--    s'il n'y a personne d'autre, il est supprimé avec le compte
--  - les achats faits par cette personne sont annulés (les cadeaux redeviennent disponibles)
-- =====================================================================
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  e record;
  v_heir uuid;
begin
  if v_uid is null then raise exception 'Non connecté'; end if;

  for e in select id from events where created_by = v_uid loop
    select user_id into v_heir from event_members
      where event_id = e.id and user_id <> v_uid order by joined_at limit 1;
    if v_heir is not null then
      update events set created_by = v_heir where id = e.id;
    end if;
  end loop;

  -- profiles, listes, cadeaux, achats, jetons, tirages… suivent en cascade
  delete from auth.users where id = v_uid;
end $$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
