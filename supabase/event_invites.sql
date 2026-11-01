-- =====================================================================
--  Invitations par nom + e-mail (à exécuter après schema.sql)
--  L'organisateur ajoute un invité (nom, e-mail). Quand cette personne se
--  connecte avec cet e-mail, l'événement lui apparaît dans « Invitations »
--  et elle choisit de le rejoindre (ou de refuser) : rien n'est automatique.
-- =====================================================================
create table public.event_invites (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 80),
  email      text not null check (email = lower(email) and char_length(email) <= 200 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  created_at timestamptz not null default now(),
  unique (event_id, email)
);
create index event_invites_email_idx on public.event_invites(email);

alter table public.event_invites enable row level security;
create policy invites_select on public.event_invites for select to authenticated using (public.is_event_creator(event_id));
create policy invites_delete on public.event_invites for delete to authenticated using (public.is_event_creator(event_id));
revoke insert, update on public.event_invites from authenticated, anon;
revoke all on public.event_invites from anon;

-- Ajout d'un invité (organisateur uniquement)
create or replace function public.add_event_invite(p_event uuid, p_name text, p_email text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_email text := lower(trim(coalesce(p_email, ''))); v_name text := trim(coalesce(p_name, '')); v_id uuid; v_n int;
begin
  if not public.is_event_creator(p_event) then raise exception 'Seul l''organisateur peut inviter des personnes'; end if;
  if v_name = '' then raise exception 'Indiquez le nom de la personne'; end if;
  if char_length(v_name) > 80 then raise exception 'Nom trop long (80 caractères maximum)'; end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or char_length(v_email) > 200 then raise exception 'Adresse e-mail invalide'; end if;
  if exists (select 1 from event_members m join auth.users u on u.id = m.user_id where m.event_id = p_event and lower(u.email) = v_email) then
    raise exception 'Cette personne participe déjà à l''événement';
  end if;
  select count(*) into v_n from event_invites where event_id = p_event;
  if v_n >= 100 then raise exception 'Maximum 100 invitations en attente par événement'; end if;
  insert into event_invites (event_id, name, email) values (p_event, v_name, v_email)
  on conflict (event_id, email) do update set name = excluded.name
  returning id into v_id;
  return v_id;
end $$;

-- Invitations qui m'attendent (selon l'e-mail de mon compte)
create or replace function public.my_pending_invites()
returns table (invite_id uuid, event_id uuid, event_name text, event_date date, organizer text, invited_name text)
language sql stable security definer set search_path = public as $$
  select i.id, e.id, e.name, e.event_date, p.display_name, i.name
    from event_invites i
    join events e on e.id = i.event_id
    join profiles p on p.id = e.created_by
    join auth.users u on lower(u.email) = i.email
   where u.id = auth.uid()
     and not exists (select 1 from event_members m where m.event_id = e.id and m.user_id = auth.uid())
   order by e.event_date
$$;

create or replace function public.accept_invite(p_invite uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_event uuid;
begin
  if auth.uid() is null then raise exception 'Non connecté'; end if;
  select i.event_id into v_event from event_invites i join auth.users u on lower(u.email) = i.email
   where i.id = p_invite and u.id = auth.uid();
  if v_event is null then raise exception 'Invitation introuvable'; end if;
  insert into event_members (event_id, user_id) values (v_event, auth.uid()) on conflict do nothing;
  delete from event_invites where id = p_invite;
  return v_event;
end $$;

create or replace function public.decline_invite(p_invite uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Non connecté'; end if;
  delete from event_invites i using auth.users u
   where i.id = p_invite and lower(u.email) = i.email and u.id = auth.uid();
end $$;

-- Une personne qui rejoint (par lien ou invitation) n'est plus « en attente »
create or replace function public.clear_invite_on_join()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from event_invites i using auth.users u
   where u.id = new.user_id and i.event_id = new.event_id and i.email = lower(u.email);
  return new;
end $$;

create trigger event_members_clear_invite
  after insert on public.event_members
  for each row execute function public.clear_invite_on_join();

revoke all on function public.add_event_invite(uuid, text, text) from public, anon;
revoke all on function public.my_pending_invites()               from public, anon;
revoke all on function public.accept_invite(uuid)                from public, anon;
revoke all on function public.decline_invite(uuid)               from public, anon;
revoke all on function public.clear_invite_on_join()             from public, anon, authenticated;
grant execute on function public.add_event_invite(uuid, text, text) to authenticated;
grant execute on function public.my_pending_invites()               to authenticated;
grant execute on function public.accept_invite(uuid)                to authenticated;
grant execute on function public.decline_invite(uuid)               to authenticated;
