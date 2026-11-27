-- =====================================================================
--  Tirage au sort : une seule grande boucle (A → B → C → … → A)
--  Avant : un mélange au hasard qui pouvait former plusieurs petites boucles, ou des échanges à deux (A ↔ B).
--  Les exclusions sont toujours respectées ; si aucune boucle unique n'est possible, message clair.
-- =====================================================================
create or replace function public.run_one_draw(p_draw uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_ev uuid; v_ord uuid[]; v_excl text[]; v_n int; v_try int := 0; v_ok boolean := false; i int;
  v_event text; v_draw text;
begin
  v_ev := public.draw_check_org(p_draw);
  select count(*) into v_n from draw_participants where draw_id = p_draw;
  if v_n < 2 then raise exception 'Il faut au moins 2 participants au tirage'; end if;
  select coalesce(array_agg(giver::text || '>' || receiver::text), '{}') into v_excl from draw_blocks where draw_id = p_draw;

  -- ordre au hasard ; chacun offre au suivant, le dernier au premier : une seule boucle passant par tout le monde
  while v_try < 20000 and not v_ok loop
    v_try := v_try + 1;
    select array_agg(pid order by random()) into v_ord from draw_participants where draw_id = p_draw;
    v_ok := true;
    for i in 1..v_n loop
      if (v_ord[i]::text || '>' || v_ord[i % v_n + 1]::text) = any (v_excl) then
        v_ok := false; exit;
      end if;
    end loop;
  end loop;
  if not v_ok then raise exception 'Tirage impossible avec ces exclusions : en retirer quelques-unes'; end if;

  delete from draw_results where draw_id = p_draw;
  for i in 1..v_n loop
    insert into draw_results (draw_id, giver, receiver) values (p_draw, v_ord[i], v_ord[i % v_n + 1]);
  end loop;
  update draws set done_at = now(), done_count = v_n, emailed_at = null where id = p_draw;
  perform public.draw_sync_event(v_ev);

  select e.name, d.name into v_event, v_draw from draws d join events e on e.id = d.event_id where d.id = p_draw;
  insert into notifications (user_id, kind, title, body, link)
  select distinct x.uid, 'draw_done',
         left('🎲 Tirage « ' || v_draw || ' » : « ' || v_event || ' »', 200),
         'Le tirage a eu lieu. Découvrez à qui offrir un cadeau.', '/evenements/' || v_ev::text
    from (
      select p.user_id as uid from draw_participants p where p.draw_id = p_draw and p.user_id is not null
      union
      select m from draw_participants p cross join lateral public.list_manager_ids(p.list_id) m
       where p.draw_id = p_draw and p.list_id is not null and public.is_event_member_user(v_ev, m)
    ) x;
end $$;
revoke all on function public.run_one_draw(uuid) from public, anon;
grant execute on function public.run_one_draw(uuid) to authenticated;
