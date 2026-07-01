-- Run this in your Supabase SQL Editor (BYO project)
-- Allows signed-in users to upload/replace their own files; public buckets are world-readable.

create policy "authenticated upload avatars"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "authenticated update avatars"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "authenticated delete avatars"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- vendor-assets: only the owning vendor can write to their vendor-id folder
create policy "vendor upload assets"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'vendor-assets'
    and exists (
      select 1 from public.vendors v
      where v.id::text = (storage.foldername(name))[1]
        and v.owner_id = auth.uid()
    )
  );

create policy "vendor update assets"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'vendor-assets'
    and exists (
      select 1 from public.vendors v
      where v.id::text = (storage.foldername(name))[1]
        and v.owner_id = auth.uid()
    )
  );

create policy "vendor delete assets"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'vendor-assets'
    and exists (
      select 1 from public.vendors v
      where v.id::text = (storage.foldername(name))[1]
        and v.owner_id = auth.uid()
    )
  );

-- reload PostgREST schema cache so /admin/setup checks see the changes immediately
NOTIFY pgrst, 'reload schema';
