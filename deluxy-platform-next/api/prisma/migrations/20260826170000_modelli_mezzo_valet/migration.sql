-- Modello del mezzo per ciascun mezzo scelto dal valet (JSON {"Auto":"Fiat Panda",...})
ALTER TABLE "Valet" ADD COLUMN IF NOT EXISTS "vehicleModels" TEXT;
