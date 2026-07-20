-- AlterTable: nota facoltativa sulla disponibilità del valet
ALTER TABLE "ValetAvailability" ADD COLUMN "note" TEXT;

-- CreateIndex: una sola riga di disponibilità per (valet, data) — necessaria per l'upsert
CREATE UNIQUE INDEX "ValetAvailability_valetId_date_key" ON "ValetAvailability"("valetId", "date");
