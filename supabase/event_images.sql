-- =====================================================================
--  Image d'un événement (à exécuter après schema.sql)
--  Les images sont stockées dans le bucket public « event-images »,
--  dans un dossier portant l'identifiant de l'événement : seul son
--  organisateur peut y écrire. Le nom des fichiers est aléatoire.
-- =====================================================================
alter table public.events add column if not exists image_url text
  check (image_url is null or (image_url ~ '^https://' and char_length(image_url) <= 500));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-images', 'event-images', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- true si le premier dossier du chemin est un événement dont je suis l'organisateur
create or replace function public.can_write_event_image(p_name text)
returns boolean language sql stable security definer set search_path = public, storage as $$
  select case when (storage.foldername(p_name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then public.is_event_creator(((storage.foldername(p_name))[1])::uuid)
              else false end
$$;
revoke all on function public.can_write_event_image(text) from public, anon;
grant execute on function public.can_write_event_image(text) to authenticated;

create policy event_images_select on storage.objects for select to authenticated
  using (bucket_id = 'event-images' and public.can_write_event_image(name));
create policy event_images_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'event-images' and public.can_write_event_image(name));
create policy event_images_update on storage.objects for update to authenticated
  using (bucket_id = 'event-images' and public.can_write_event_image(name))
  with check (bucket_id = 'event-images' and public.can_write_event_image(name));
create policy event_images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'event-images' and public.can_write_event_image(name));
