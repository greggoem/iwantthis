-- Aperçu des liens partagés (WhatsApp, etc.) : uniquement ce qui s'affiche dans l'aperçu,
-- et seulement pour qui détient le code secret du lien.
create or replace function public.share_preview(p_kind text, p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if p_code is null or length(p_code) > 100 then return null; end if;
  if p_kind = 'e' then
    select jsonb_build_object('name', e.name, 'date', e.event_date, 'image', e.image_url)
      into r from events e where e.invite_code = p_code;
  elsif p_kind = 'l' then
    select jsonb_build_object('owner', p.display_name)
      into r from wishlists w left join profiles p on p.id = w.owner_id where w.share_token::text = p_code;
  end if;
  return r;
end $$;
revoke all on function public.share_preview(text, text) from public;
grant execute on function public.share_preview(text, text) to anon, authenticated;
