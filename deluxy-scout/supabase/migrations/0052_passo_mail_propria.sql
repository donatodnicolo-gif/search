-- Deluxy Scout — 0052: un passo di sequenza può avere la SUA mail, scritta lì.
-- Idempotente. Applicare con scripts/allinea-supabase.mjs (o mgmt-query.mjs).
--
-- Il problema: un passo poteva puntare solo a un testo della libreria Script.
-- Per un sollecito di due righe («ci risentiamo la settimana prossima?») si era
-- costretti a creare un modello in libreria, che poi resta lì a sporcarla — e
-- infatti la sequenza restava senza secondo passo.
--
-- Ora il passo è UNA delle due cose:
--   · script_id  → il testo viene dalla libreria (e se lì lo modifichi, cambia
--                  anche nella sequenza: è il vantaggio del modello condiviso);
--   · oggetto+corpo → la mail è di questo passo e basta, non finisce in libreria.
-- Le variabili tra [ ] funzionano identiche nei due casi: le riempie sempre
-- `invio-email` al momento dell'invio, non c'è un secondo motore.

alter table sequenza_passi add column if not exists oggetto text;
alter table sequenza_passi add column if not exists corpo   text;

comment on column sequenza_passi.corpo is
  'Mail scritta dentro il passo (HTML). Alternativa a script_id: se c''è questa, la libreria non c''entra.';

-- Un passo senza né script né testo non manderebbe niente e bloccherebbe la
-- coda in silenzio: meglio che il database lo rifiuti subito.
--
-- ⚠️ NOT VALID di proposito: `script_id` è `on delete set null`, quindi un passo
-- il cui script è stato cancellato è già oggi a NULL su entrambi i campi. Con la
-- validazione piena la migrazione fallirebbe su quelle righe invece di
-- proteggere le nuove. Il vincolo vale comunque su ogni insert e update.
alter table sequenza_passi drop constraint if exists sequenza_passi_ha_un_testo;
alter table sequenza_passi add  constraint sequenza_passi_ha_un_testo
  check (script_id is not null or nullif(btrim(coalesce(corpo, '')), '') is not null)
  not valid;
