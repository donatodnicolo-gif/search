-- 0016 — Collegamento col registro centralizzato Deluxy Anagrafiche.
--
-- Le anagrafiche (deluxy-anagrafiche.vercel.app) sono la fonte di verità dei partner/
-- prospect B2B. Qui le importiamo come `places` di Scout, tenendo il legame per poter
-- ri-sincronizzare senza duplicare, e conservando i campi che Scout non modella:
--   - account       = commerciale che segue l'anagrafica (ELEONORA, GAIA, ...)
--   - stato         = stato originale del registro (7 valori) — quello di Scout ne ha 4
--                     e perderebbe le sfumature (in_attesa, in_contatto, da_ricontattare)
--   - ultima_visita = ultima visita registrata nel tracker
alter table places add column if not exists anagrafiche_id text;
alter table places add column if not exists anagrafiche_account text;
alter table places add column if not exists anagrafiche_stato text;
alter table places add column if not exists anagrafiche_ultima_visita timestamptz;

-- Un'anagrafica → al più un place (rende l'import ri-eseguibile: upsert su questo id).
create unique index if not exists places_anagrafiche_id_uix
  on places (anagrafiche_id)
  where anagrafiche_id is not null;

-- Serve al match anti-doppioni per nome (similarity) contro i negozi già scoperti.
create index if not exists places_nome_trgm_ix on places using gin (lower(nome) gin_trgm_ops);

comment on column places.anagrafiche_id is 'id del Partner su deluxy-anagrafiche (fonte di verità); null = non collegato';
