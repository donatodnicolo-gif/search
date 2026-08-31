-- CONSEGNE DA FORNITORE (31/08/2026): la consegna la fa il partner, non un valet.
ALTER TABLE platform."Delivery"
  ADD COLUMN IF NOT EXISTS "deliveredByPartner" boolean NOT NULL DEFAULT false;
