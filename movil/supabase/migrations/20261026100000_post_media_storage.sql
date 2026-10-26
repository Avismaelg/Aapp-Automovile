-- Bucket privado para imágenes del feed y políticas por visibilidad del post.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('posts', 'posts', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "post media read" on storage.objects;
create policy "post media read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'posts'
    and name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/'
    and public.can_view_post(auth.uid(), split_part(name, '/', 1)::uuid)
  );

drop policy if exists "post media insert" on storage.objects;
create policy "post media insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'posts'
    and name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/'
    and exists (
      select 1 from public.posts p
      where p.id = split_part(name, '/', 1)::uuid
        and p.user_id = auth.uid()
    )
  );

drop policy if exists "post media delete" on storage.objects;
create policy "post media delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'posts'
    and exists (
      select 1 from public.posts p
      where p.id = split_part(name, '/', 1)::uuid
        and p.user_id = auth.uid()
    )
  );
