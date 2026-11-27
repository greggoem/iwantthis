-- Aperçu des liens partagés : + cadeau commun (?g=TOKEN) — pour qui, le cadeau, son image, la date.
-- Seulement pour qui détient le lien secret, et jamais pour un cadeau commun annulé.
create or replace function public.share_preview(p_kind text, p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if p_code is null or length(p_code) > 100 then return null; end if;
  if p_kind = 'e' then
    select jsonb_build_object('name', e.name, 'date', e.event_date, 'time', to_char(e.event_time, 'HH24:MI'), 'image', e.image_url)
      into r from events e where e.invite_code = p_code;
  elsif p_kind = 'l' then
    select jsonb_build_object('owner', coalesce(w.child_name, p.display_name))
      into r from wishlists w left join profiles p on p.id = w.owner_id where w.share_token::text = p_code;
  elsif p_kind = 'g' then
    select jsonb_build_object('recipient', g.recipient_name, 'title', g.title, 'image', g.image_url, 'date', g.give_on,
                              'by', (select display_name from profiles where id = g.created_by))
      into r from group_gifts g where g.share_token = p_code and g.status <> 'cancelled';
  end if;
  return r;
end $$;
revoke all on function public.share_preview(text, text) from public;
grant execute on function public.share_preview(text, text) to anon, authenticated;
