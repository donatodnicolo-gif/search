-- 0093 — UNA TRATTATIVA SI PUÒ PASSARE A UN COLLEGA (27/08/2026).
--
-- Bug in produzione, visto dall'utente: assegnando la trattativa a Eleonora il
-- salvataggio rispondeva
--   «new row violates row-level security policy for table "deals"»
--
-- Il motivo: `deals_write` aveva `with check (owner = auth.uid() or owner is
-- null)`. La riga NUOVA — quella dopo la modifica — ha l'owner del collega,
-- quindi il controllo la rifiutava. In pratica il campo «chi la porta avanti»
-- poteva scrivere solo il proprio nome: cioè non serviva a niente.
--
-- ⚠️ NON è un allentamento della sicurezza, è l'allineamento al modello che
-- l'app dichiara da sempre (0002_rls.sql:3-6): Scout è a SQUADRA UNICA, e
-- `places`, `contacts`, `leads` e `ordini` sono già scrivibili da chiunque sia
-- autenticato. `deals` era l'unica tabella con la regola del proprietario, e
-- quella regola non proteggeva un confine reale — impediva solo di passare il
-- lavoro, che è una cosa che in una squadra succede tutti i giorni.
--
-- ⚠️ Chi tocca questa policy pensando di «rimettere la sicurezza» rilegga qui:
-- il confine di Scout è l'AUTENTICAZIONE, non la proprietà della riga. Se un
-- giorno servirà un confine vero (venditori che non si vedono fra loro), non
-- basterà questa policy: andrà cambiata anche `deals_select`, che oggi è
-- `using (true)` — e allora sarà una decisione di prodotto, non una toppa.
drop policy if exists deals_write on deals;
create policy deals_write on deals
  for all to authenticated
  using (true)
  with check (true);

comment on table deals is
  'Trattative. Squadra unica: chi è autenticato legge e scrive tutto, comprese quelle dei colleghi — passarsi il lavoro è la norma (migr. 0093).';
