-- =====================================================================
--  « À offrir » : à choisir, à acheter, acheté (après group_gifts_v3.sql)
--  • une envie prise peut être « à acheter » (bought = false) ou « achetée » ; prix payé facultatif si l'envie n'a pas de prix
--  • les personnes tirées au sort pour moi (ou pour mes enfants), et si j'ai déjà choisi quelque chose
--  • rappels 7 jours puis 2 jours avant la remise s'il reste à choisir, à acheter ou à répondre (notification + e-mail)
-- =====================================================================
alter table public.item_claims add column if not exists bought boolean not null default true;
alter table public.item_claims add column if not exists paid_price numeric(10,2) check (paid_price is null or (paid_price >= 0 and paid_price < 1000000));

-- Passer une envie prise en « acheté » ou « à acheter » (seulement la sienne, pas celles d'un cadeau commun)
create or replace function public.set_claim_bought(p_item uuid, p_bought boolean, p_price numeric default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  update item_claims
     set bought = p_bought,
         paid_price = case when p_price is not null then round(p_price, 2) else paid_price end
   where item_id = p_item and claimed_by = auth.uid() and group_gift_id is null;
  if not found then raise exception 'Achat introuvable'; end if;
end $$;
revoke all on function public.set_claim_bought(uuid, boolean, numeric) from public, anon;
grant execute on function public.set_claim_bought(uuid, boolean, numeric) to authenticated;

-- Tirages d'un événement : pour chaque donneur (compte, ou parent qui tient la liste d'un enfant), qui il a tiré
create or replace function public.draw_todo_for(p_event uuid)
returns table (uid uuid, giver_list uuid, giver_kid text, draw_name text, receiver_name text, receiver_kind text, receiver_color text, receiver_list uuid, receiver_uid uuid)
language sql stable security definer set search_path = public as $$
  select coalesce(g.user_id, g.owner_id), g.list_id, case when g.list_id is not null then g.name end, d.name,
         rc.name, case when rc.list_id is null then 'user' else 'kid' end, rc.color,
         coalesce(rc.list_id, (select w.id from wishlists w where w.owner_id = rc.user_id and w.child_name is null order by w.created_at limit 1)),
         rc.user_id
    from draws d
    join draw_results r on r.draw_id = d.id
    join public.draw_candidates(p_event) g on g.pid = r.giver
    join public.draw_candidates(p_event) rc on rc.pid = r.receiver
   where d.event_id = p_event and d.done_at is not null
$$;
revoke all on function public.draw_todo_for(uuid) from public, anon, authenticated;

-- A-t-on déjà quelque chose pour cette liste ? (une envie prise, ou un cadeau commun auquel on participe)
create or replace function public.has_gift_for_list(p_user uuid, p_list uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from item_claims c join items i on i.id = c.item_id where i.list_id = p_list and c.claimed_by = p_user)
      or exists (select 1 from group_gifts g join group_gift_members m on m.gift_id = g.id join items i on i.id = g.item_id
                  where i.list_id = p_list and m.user_id = p_user and m.answer = 'yes' and g.status <> 'cancelled')
$$;
revoke all on function public.has_gift_for_list(uuid, uuid) from public, anon, authenticated;

-- Mes personnes tirées au sort (événements à venir), y compris pour les enfants dont je tiens la liste
create or replace function public.my_draw_targets()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'event_id', e.id, 'event_name', e.name, 'event_date', e.event_date, 'draw_name', t.draw_name,
      'giver_kid', t.giver_kid, 'receiver_name', t.receiver_name, 'receiver_kind', t.receiver_kind,
      'receiver_color', t.receiver_color, 'receiver_list', t.receiver_list,
      'chosen', t.receiver_list is not null and public.has_gift_for_list(auth.uid(), t.receiver_list))
      order by e.event_date, t.giver_kid nulls first, lower(t.receiver_name)), '[]'::jsonb)
    from events e
    cross join lateral public.draw_todo_for(e.id) t
   where e.event_date >= current_date
     and public.is_event_member_user(e.id, auth.uid())
     and t.receiver_uid is distinct from auth.uid()   -- un enfant qui a tiré son propre parent : rien à faire pour ce parent
     and (t.uid = auth.uid() or (t.giver_kid is not null and public.manages_list_user(t.giver_list, auth.uid())))
$$;
revoke all on function public.my_draw_targets() from public, anon;
grant execute on function public.my_draw_targets() to authenticated;

-- Mes cadeaux communs : + événement et liste de la personne qui reçoit (pour regrouper par personne)
create or replace function public.my_group_gifts()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by (x->>'give_on')), '[]'::jsonb) from (
    select jsonb_build_object('id', g.id, 'title', g.title, 'image_url', g.image_url, 'url', g.url, 'price', g.price,
      'recipient_name', g.recipient_name, 'give_on', g.give_on, 'status', g.status, 'is_organizer', m.organizer,
      'answer', m.answer, 'share', public.gg_share(g.id, m.user_id), 'paid', m.paid,
      'event_id', g.event_id, 'event_name', (select e.name from events e where e.id = g.event_id),
      'recipient_list', coalesce((select i.list_id from items i where i.id = g.item_id),
                                 (select w.id from wishlists w where w.owner_id = g.recipient_id and w.child_name is null order by w.created_at limit 1)),
      'total', (select coalesce(sum(public.gg_share(g.id, y.user_id)), 0) from group_gift_members y where y.gift_id = g.id and y.answer = 'yes'),
      'yes', (select count(*) from group_gift_members y where y.gift_id = g.id and y.answer = 'yes'),
      'with', (select coalesce(jsonb_agg(p.display_name order by lower(p.display_name)), '[]'::jsonb) from group_gift_members y join profiles p on p.id = y.user_id
                where y.gift_id = g.id and y.answer = 'yes' and y.user_id <> m.user_id),
      'organizers', (select coalesce(jsonb_agg(p.display_name order by o.created_at), '[]'::jsonb) from group_gift_members o join profiles p on p.id = o.user_id
                where o.gift_id = g.id and o.organizer)) x
      from group_gift_members m join group_gifts g on g.id = m.gift_id
     where m.user_id = auth.uid() and g.recipient_id is distinct from auth.uid()
       and g.status <> 'cancelled' and not (m.answer = 'no' and g.status <> 'open')
  ) s
$$;
revoke all on function public.my_group_gifts() from public, anon;
grant execute on function public.my_group_gifts() to authenticated;

-- ---------------------------------------------------------------------
--  Rappels 7 jours puis 2 jours avant une remise
-- ---------------------------------------------------------------------
create table if not exists public.gift_reminder_log (
  user_id uuid not null references auth.users(id) on delete cascade,
  due     date not null,
  days    int not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, due, days)
);
alter table public.gift_reminder_log enable row level security;
revoke all on public.gift_reminder_log from anon, authenticated;

-- Ce qu'il reste à faire pour chaque personne, pour une date de remise donnée
create or replace function public.gift_todo(p_due date)
returns table (uid uuid, kind text, what text, who text, ev text)
language sql stable security definer set search_path = public as $$
  -- envies prises mais pas encore achetées
  select c.claimed_by, 'buy', i.title, coalesce(w.child_name, p.display_name), e.name
    from item_claims c join items i on i.id = c.item_id join wishlists w on w.id = i.list_id
    left join profiles p on p.id = w.owner_id left join events e on e.id = c.event_id
   where not c.bought and c.group_gift_id is null and c.reveal_on = p_due
  union all
  -- cadeaux communs : répondre, ou acheter (organisateurs, cagnotte fermée)
  select m.user_id, case when g.status = 'open' then 'answer' else 'buy' end, g.title, g.recipient_name, e.name
    from group_gifts g join group_gift_members m on m.gift_id = g.id left join events e on e.id = g.event_id
   where g.give_on = p_due and ((g.status = 'open' and m.answer = 'pending') or (g.status = 'closed' and m.organizer))
  union all
  -- tirages au sort : personne tirée pour qui rien n'est encore choisi
  select t.uid, 'choose', null, t.receiver_name, e.name
    from events e cross join lateral public.draw_todo_for(e.id) t
   where e.event_date = p_due and t.uid is not null and t.receiver_uid is distinct from t.uid
     and not (t.receiver_list is not null and public.has_gift_for_list(t.uid, t.receiver_list))
$$;
revoke all on function public.gift_todo(date) from public, anon, authenticated;

-- Réservé au serveur (send-reminders, envoi automatique quotidien) : notifications + lignes pour les e-mails
create or replace function public.request_gift_reminders()
returns table (user_id uuid, email text, display_name text, title text, body text)
language plpgsql security definer set search_path = public as $$
declare v_days int; v_due date; r record; v_title text; v_body text; v_parts text[];
begin
  foreach v_days in array array[7, 2] loop
    v_due := current_date + v_days;
    for r in
      select t.uid,
             (array_agg(t.ev order by t.ev) filter (where t.ev is not null))[1] as ev,
             count(*) filter (where t.kind = 'buy') as n_buy,
             count(*) filter (where t.kind = 'choose') as n_choose,
             count(*) filter (where t.kind = 'answer') as n_answer,
             string_agg(distinct t.who, ', ') filter (where t.kind = 'buy') as who_buy,
             string_agg(distinct t.who, ', ') filter (where t.kind = 'choose') as who_choose,
             string_agg(distinct t.who, ', ') filter (where t.kind = 'answer') as who_answer
        from public.gift_todo(v_due) t
       where t.uid is not null
         and not exists (select 1 from gift_reminder_log l where l.user_id = t.uid and l.due = v_due and l.days = v_days)
       group by t.uid
    loop
      v_parts := array[]::text[];
      if r.n_buy > 0 then v_parts := v_parts || (r.n_buy || ' cadeau' || case when r.n_buy > 1 then 'x' else '' end || ' à acheter pour ' || r.who_buy); end if;
      if r.n_choose > 0 then v_parts := v_parts || (r.n_choose || ' cadeau' || case when r.n_choose > 1 then 'x' else '' end || ' à choisir pour ' || r.who_choose); end if;
      if r.n_answer > 0 then v_parts := v_parts || (r.n_answer || ' cadeau' || case when r.n_answer > 1 then 'x' else '' end || ' commun' || case when r.n_answer > 1 then 's' else '' end || ' qui attend' || case when r.n_answer > 1 then 'ent' else '' end || ' votre réponse (pour ' || r.who_answer || ')'); end if;
      v_title := coalesce(r.ev, 'Remise du ' || to_char(v_due, 'DD/MM')) || ' dans ' || v_days || ' jours';
      v_body := 'Il reste ' || array_to_string(v_parts, ', ') || '.';
      insert into gift_reminder_log (user_id, due, days) values (r.uid, v_due, v_days) on conflict do nothing;
      insert into notifications (user_id, kind, title, body, link) values (r.uid, 'gift_reminder', left(v_title, 200), left(v_body, 500), '/offrir');
      return query select r.uid, u.email::text, p.display_name, v_title, v_body
        from auth.users u left join profiles p on p.id = u.id where u.id = r.uid and u.email is not null;
    end loop;
  end loop;
end $$;
revoke all on function public.request_gift_reminders() from public, anon, authenticated;
grant execute on function public.request_gift_reminders() to service_role;
