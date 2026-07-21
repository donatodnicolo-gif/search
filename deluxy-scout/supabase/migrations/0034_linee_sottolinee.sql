-- Linee di interesse gestibili dall'admin, con SOTTOLINEE (gerarchia).
-- Scout è il MASTER: le altre app leggono le linee dalla Edge Function `linee`.
--
-- Estende la tabella esistente `lines`:
--   parent_id  → se valorizzato la riga è una SOTTOLINEA della linea padre
--   ordine     → ordinamento manuale
--   archiviata → soft-delete (non si elimina fisicamente per non perdere storico)
--   icona      → nome icona Ionicons (facoltativo)
alter table lines add column if not exists parent_id uuid references lines (id) on delete cascade;
alter table lines add column if not exists ordine int not null default 0;
alter table lines add column if not exists archiviata boolean not null default false;
alter table lines add column if not exists icona text;
create index if not exists lines_parent_idx on lines (parent_id);

-- RLS: lettura a tutti gli autenticati; SCRITTURA solo all'admin della rete.
drop policy if exists lines_auth_all on lines;
drop policy if exists lines_read on lines;
create policy lines_read on lines for select to authenticated using (true);
drop policy if exists lines_admin_ins on lines;
create policy lines_admin_ins on lines for insert to authenticated
  with check (auth.jwt() ->> 'email' = 'nicolo.donato@deluxy.it');
drop policy if exists lines_admin_upd on lines;
create policy lines_admin_upd on lines for update to authenticated
  using (auth.jwt() ->> 'email' = 'nicolo.donato@deluxy.it');
drop policy if exists lines_admin_del on lines;
create policy lines_admin_del on lines for delete to authenticated
  using (auth.jwt() ->> 'email' = 'nicolo.donato@deluxy.it');
