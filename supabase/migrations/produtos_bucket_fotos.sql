-- AI dev note: Bucket público para fotos de produtos (otimizadas no cliente antes do
-- upload → ~<200KB). Leitura pública (miniaturas na app); escrita só admin/secretaria.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'respira-produtos',
  'respira-produtos',
  true,
  5242880, -- 5MB (imagem já vem comprimida do cliente)
  array['image/jpeg', 'image/webp', 'image/png']
)
on conflict (id) do nothing;

-- leitura pública (bucket público serve via URL pública; policy garante o SELECT)
drop policy if exists "produtos_public_read" on storage.objects;
create policy "produtos_public_read" on storage.objects
  for select to public
  using (bucket_id = 'respira-produtos');

drop policy if exists "produtos_admin_all" on storage.objects;
create policy "produtos_admin_all" on storage.objects
  for all to authenticated
  using (bucket_id = 'respira-produtos' and public.is_admin())
  with check (bucket_id = 'respira-produtos' and public.is_admin());

drop policy if exists "produtos_secretaria_all" on storage.objects;
create policy "produtos_secretaria_all" on storage.objects
  for all to authenticated
  using (bucket_id = 'respira-produtos' and public.is_secretaria())
  with check (bucket_id = 'respira-produtos' and public.is_secretaria());
