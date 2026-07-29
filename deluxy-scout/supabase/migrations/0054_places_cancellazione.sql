-- Deluxy Scout — 0054: un negozio lo può cancellare SOLO chi l'ha creato.
-- Idempotente. Applicare con scripts/allinea-supabase.mjs (o mgmt-query.mjs).
--
-- Fino a qui `places` aveva **una sola policy**, `places_auth_all`, cioè
-- `for all to authenticated using (true)`: chiunque fosse loggato poteva
-- cancellare qualunque negozio, comprese le schede altrui con dentro visite e
-- trattative. Mettere il controllo solo nel bottone dell'app sarebbe stato un
-- lucchetto disegnato sulla porta: il database avrebbe detto sì lo stesso.
--
-- Il modello resta quello del repo (il territorio è condiviso dal team): tutti
-- leggono, inseriscono e modificano. Cambia **solo** la cancellazione.
--
-- ⚠️ `creato_da is null` = i record storici (import da terminale, scoperta
-- Google, migrazioni precedenti alla 0035): non hanno un creatore ricostruibile
-- e **nessuno li può cancellare dall'app**. È voluto: senza un proprietario,
-- «solo il creatore» non è una regola, è un'ipotesi.
--
-- ⚠️ TRAPPOLA per chi chiama: con la RLS, una DELETE che non trova righe **non
-- è un errore** — torna semplicemente zero righe. Un client che non guarda cosa
-- ha cancellato dirà «eliminato» anche quando non ha eliminato niente. Per
-- questo `eliminaPlace()` in lib/db.ts fa `.delete().select('id')` e controlla
-- che sia tornata una riga.
--
-- ⚠️ Cosa si porta via una cancellazione (FK `on delete cascade`, migr. 0001 e
-- successive): contatti, visite, trattative, chiamate, contatti/aziende
-- scartati, coppie di duplicati, contatti avviati, bozze di visita e iscrizioni
-- alle sequenze. Restano invece — perdendo solo il collegamento (`on delete set
-- null`) — task, richieste di pagamento, ordini e lead. Il registro Anagrafiche
-- **non viene toccato**: è un'altra app, ed è lei la fonte di verità.

drop policy if exists places_auth_all on places;

drop policy if exists places_select on places;
create policy places_select on places
  for select to authenticated using (true);

drop policy if exists places_insert on places;
create policy places_insert on places
  for insert to authenticated with check (true);

drop policy if exists places_update on places;
create policy places_update on places
  for update to authenticated using (true) with check (true);

drop policy if exists places_delete on places;
create policy places_delete on places
  for delete to authenticated using (creato_da is not null and creato_da = auth.uid());
