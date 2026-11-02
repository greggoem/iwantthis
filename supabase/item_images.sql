-- =====================================================================
--  Images de cadeaux envoyées par l'utilisateur (à exécuter après schema.sql)
--  Bucket public « item-images » ; chaque personne n'écrit que dans le dossier
--  portant son identifiant. Le nom des fichiers est aléatoire.
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('item-images', 'item-images', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy item_images_select on storage.objects for select to authenticated
  using (bucket_id = 'item-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy item_images_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'item-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy item_images_update on storage.objects for update to authenticated
  using (bucket_id = 'item-images' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'item-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy item_images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'item-images' and (storage.foldername(name))[1] = auth.uid()::text);
