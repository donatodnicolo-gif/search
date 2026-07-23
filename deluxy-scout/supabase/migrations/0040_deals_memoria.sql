-- Deluxy Scout — 0040: la trattativa ricorda da dove viene e perché si è persa.
-- Idempotente. Applicare con scripts/mgmt-query.mjs (Management API).
--
-- Modello (docs/VISIONE-COMMERCIALE.md): 3 canali (territorio, telefono, web)
-- → 1 funnel. La trattativa registra il canale che l'ha generata e, quando si
-- perde, per cosa era, perché è persa e quando riprovarci: le perse sono
-- pipeline differita, non spazzatura.

alter table deals add column if not exists oggetto       text;  -- per cosa è la trattativa
alter table deals add column if not exists canale        text;  -- territorio | telefono | web | altro
alter table deals add column if not exists motivo_perso  text;  -- prezzo | tempistica | concorrente | non_risponde | non_target | altro
alter table deals add column if not exists riprendere_il date;  -- quando ricompare in Home per la ripresa
alter table deals add column if not exists chiusa_il     date;  -- quando è stata vinta/persa

create index if not exists deals_riprendere_ix on deals (riprendere_il) where riprendere_il is not null;

comment on column deals.oggetto is 'Per cosa è la trattativa (es. "consegne weekend"): senza, fra sei mesi nessuno ricorda perché eravamo lì.';
comment on column deals.canale is 'Canale di acquisizione che l''ha generata: territorio | telefono | web | altro.';
comment on column deals.motivo_perso is 'Perché è persa: prezzo | tempistica | concorrente | non_risponde | non_target | altro. Decide la strategia di ripresa.';
comment on column deals.riprendere_il is 'Alla data la trattativa persa ricompare in Home, sezione "Da riprendere".';
