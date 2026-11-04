-- =====================================================================
--  Tirage au sort : notification dans le site + e-mail à chaque participant
--  (à exécuter après schema.sql et notifications.sql)
--  Le résultat n'est JAMAIS communiqué : on annonce seulement que le tirage a eu lieu.
-- =====================================================================
alter table public.events add column if not exists draw_emailed_at timestamptz;

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
  v_name     text;
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
  update events set draw_done_at = now(), draw_count = v_n, draw_emailed_at = null where id = p_event;

  -- notification dans le site pour chaque participant (sans révéler le résultat)
  select name into v_name from events where id = p_event;
  insert into notifications (user_id, kind, title, body, link)
  select u, 'draw_done', left('🎲 Tirage au sort : « ' || v_name || ' »', 200),
         'Le tirage a eu lieu. Découvrez à qui vous offrez un cadeau.', '/evenements/' || p_event::text
  from unnest(v_givers) u;
end $$;

-- Réservé au serveur (fonction Edge « send-draw-email », clé service) :
-- vérifie que p_user est l'organisateur, que le tirage existe et que les e-mails n'ont pas déjà été envoyés pour CE tirage.
create or replace function public.request_draw_emails(p_event uuid, p_user uuid)
returns table (email text, display_name text, event_name text, event_date date, organizer text)
language plpgsql security definer set search_path = public as $$
declare v_ev events%rowtype;
begin
  select * into v_ev from events where id = p_event and created_by = p_user;
  if not found then raise exception 'Seul l''organisateur peut envoyer ces e-mails'; end if;
  if v_ev.draw_done_at is null then raise exception 'Aucun tirage n''a été effectué'; end if;
  if v_ev.draw_emailed_at is not null and v_ev.draw_emailed_at >= v_ev.draw_done_at then
    raise exception 'Les e-mails de ce tirage ont déjà été envoyés';
  end if;
  update events set draw_emailed_at = now() where id = p_event;
  return query
    select u.email::text, p.display_name, v_ev.name, v_ev.event_date, (select pp.display_name from profiles pp where pp.id = p_user)
    from draw_assignments a
    join auth.users u on u.id = a.giver_id
    join profiles p on p.id = a.giver_id
    where a.event_id = p_event;
end $$;
revoke all on function public.request_draw_emails(uuid, uuid) from public, anon, authenticated;
grant execute on function public.request_draw_emails(uuid, uuid) to service_role;
