-- Deluxy Scout — 0060: chiudere un richiamo dalla coda, con la «×».
-- Idempotente. La applica scripts/allinea-supabase.mjs (o il workflow a ogni push).
--
-- PERCHÉ QUI E NON SU `visits`. Il richiamo nasce dall'ultima visita, quindi il
-- posto «naturale» sarebbe `visits`. Ma la RLS di quella tabella permette
-- l'UPDATE **solo al proprietario della visita** (`visits_update_own`:
-- `owner = auth.uid()`), mentre in Home la coda mostra le visite di TUTTI: chi
-- non ha fatto quella visita non potrebbe chiudere la riga, e la × fallirebbe
-- proprio nel caso per cui serve. Su `places` l'UPDATE è aperto a ogni
-- autenticato (il territorio è del team), quindi la × funziona per chiunque.
--
-- SI RIAPRE DA SOLO. La coda salta il negozio solo se il richiamo è stato
-- chiuso **dopo** l'ultima visita: una visita nuova con esito «interessato» o
-- «da richiamare» lo rimette in coda, senza che nessuno debba azzerare niente.
-- Per questo si salva una DATA e non un booleano.
alter table places add column if not exists richiamo_chiuso_il timestamptz;
alter table places add column if not exists richiamo_chiuso_da uuid references auth.users(id) on delete set null;

comment on column places.richiamo_chiuso_il is
  'Quando il follow-up post-visita è stato chiuso a mano dalla coda richiami. Vale finché non arriva una visita più recente.';
comment on column places.richiamo_chiuso_da is
  'Chi ha chiuso il richiamo. Serve alla vista Team: «chiuso da» è un''informazione, «sparito» no.';
