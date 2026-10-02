alter table public.products add column if not exists image_url text;

insert into storage.buckets (id,name,public,allowed_mime_types,file_size_limit)
values ('product-images','product-images',true,array['image/jpeg','image/png','image/webp','image/avif'],5242880)
on conflict (id) do update set public=true, allowed_mime_types=excluded.allowed_mime_types, file_size_limit=excluded.file_size_limit;

drop policy if exists "product_images_insert_owner" on storage.objects;
create policy "product_images_insert_owner" on storage.objects for insert to authenticated
with check (bucket_id='product-images' and (storage.foldername(name))[1]=(select auth.uid()::text));

drop policy if exists "product_images_select_owner" on storage.objects;
create policy "product_images_select_owner" on storage.objects for select to authenticated
using (bucket_id='product-images' and (storage.foldername(name))[1]=(select auth.uid()::text));

drop policy if exists "product_images_update_owner" on storage.objects;
create policy "product_images_update_owner" on storage.objects for update to authenticated
using (bucket_id='product-images' and (storage.foldername(name))[1]=(select auth.uid()::text))
with check (bucket_id='product-images' and (storage.foldername(name))[1]=(select auth.uid()::text));

drop policy if exists "product_images_delete_owner" on storage.objects;
create policy "product_images_delete_owner" on storage.objects for delete to authenticated
using (bucket_id='product-images' and (storage.foldername(name))[1]=(select auth.uid()::text));