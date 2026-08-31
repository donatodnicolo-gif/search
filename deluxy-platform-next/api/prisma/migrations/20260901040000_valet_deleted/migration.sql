ALTER TABLE platform."Valet" ADD COLUMN IF NOT EXISTS "deleted" boolean NOT NULL DEFAULT false;
