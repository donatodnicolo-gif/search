-- Rimborsi del valet: importo richiesto sulla segnalazione.
ALTER TABLE platform."Segnalazione"
  ADD COLUMN IF NOT EXISTS "importo" double precision;
