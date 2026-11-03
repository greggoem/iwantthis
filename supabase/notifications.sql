-- =====================================================================
--  Notifications dans le site + ajout direct des personnes qui ont déjà un compte
--  (à exécuter après schema.sql et event_invites.sql)
-- =====================================================================
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  kind       text not null default 'info',
  title      text not null check (char_length(title) between 1 and 200),
  body       text check (char_length(body) <= 500),
  link       text check (link is null or link ~ '^/[A-Za-z0-9/_-]*$'),   -- chemin interne du site uniquement
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index if not exists notifications_user_idx on public.notifications(user_id, created_at desc);

alter table public.notifications enable row level security;
create policy notifications_select on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete on public.notifications for delete to authenticated using (user_id = auth.uid());
-- pas d'INSERT : les notifications sont créées par les fonctions du serveur
revoke all on public.notifications from anon;
revoke insert, update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

-- Ajout d'un invité : si l'adresse correspond à un compte existant, la personne rejoint l'événement tout de suite et est notifiée ;
-- sinon une invitation en attente est créée (comme avant). Renvoie 'added' ou 'invited'.
drop function if exists public.add_event_invite(uuid, text, text);
create or replace function public.add_event_invite(p_event uuid, p_name text, p_email text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(coalesce(p_email, ''))); v_name text := trim(coalesce(p_name, ''));
  v_n int; v_user uuid; v_ev events%rowtype; v_org text;
begin
  if not public.is_event_creator(p_event) then raise exception 'Seul l''organisateur peut inviter des personnes'; end if;
  if v_name = '' then raise exception 'Indiquez le nom de la personne'; end if;
  if char_length(v_name) > 80 then raise exception 'Nom trop long (80 caractères maximum)'; end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or char_length(v_email) > 200 then raise exception 'Adresse e-mail invalide'; end if;
  if exists (select 1 from event_members m join auth.users u on u.id = m.user_id where m.event_id = p_event and lower(u.email) = v_email) then
    raise exception 'Cette personne participe déjà à l''événement';
  end if;

  select u.id into v_user from auth.users u where lower(u.email) = v_email limit 1;
  if v_user is not null and exists (select 1 from profiles where id = v_user) then
    select * into v_ev from events where id = p_event;
    select display_name into v_org from profiles where id = auth.uid();
    insert into event_members (event_id, user_id) values (p_event, v_user) on conflict do nothing;
    insert into notifications (user_id, kind, title, body, link)
    values (v_user, 'event_added',
            'Vous avez été ajouté(e) à « ' || v_ev.name || ' »',
            coalesce(v_org, 'L''organisateur') || ' vous a ajouté(e) à cet événement (' || to_char(v_ev.event_date, 'DD/MM/YYYY') || '). Les listes des invités sont maintenant visibles entre elles.',
            '/evenements/' || p_event::text);
    return 'added';
  end if;

  select count(*) into v_n from event_invites where event_id = p_event;
  if v_n >= 100 then raise exception 'Maximum 100 invitations en attente par événement'; end if;
  insert into event_invites (event_id, name, email) values (p_event, v_name, v_email)
  on conflict (event_id, email) do update set name = excluded.name;
  return 'invited';
end $$;
revoke all on function public.add_event_invite(uuid, text, text) from public, anon;
grant execute on function public.add_event_invite(uuid, text, text) to authenticated;
