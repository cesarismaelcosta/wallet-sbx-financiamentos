alter table public.entity
  alter column identity set default gen_random_uuid()::text;

-- Permite o upsert anônimo do proponente (auto-login via URL).
-- ⚠️ Temporário: enquanto o handshake assinado não existe, o front insere
-- diretamente. Isso será substituído por edge function antes de produção.
drop policy if exists "entity anon upsert" on public.entity;
create policy "entity anon insert"
  on public.entity for insert
  to anon, authenticated
  with check (true);

drop policy if exists "entity public read by document" on public.entity;
create policy "entity public read by document"
  on public.entity for select
  to anon, authenticated
  using (true);