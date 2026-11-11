-- Page « Rejoindre l'événement » : ce que voit la personne qui ouvre le lien d'invitation, avant d'accepter.
create or replace function public.event_invite_info(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if auth.uid() is null or p_code is null or length(p_code) > 100 then return null; end if;
  select jsonb_build_object(
      'id', case when exists (select 1 from event_members m where m.event_id = e.id and m.user_id = auth.uid()) or e.created_by = auth.uid() then e.id end,
      'name', e.name, 'date', e.event_date, 'time', e.event_time, 'location', e.location, 'image', e.image_url,
      'by', p.display_name,
      'members', (select count(*) from event_members m where m.event_id = e.id))
    into r
    from events e left join profiles p on p.id = e.created_by
   where e.invite_code = p_code;
  return r;
end $$;
revoke all on function public.event_invite_info(text) from public;
grant execute on function public.event_invite_info(text) to authenticated;
