-- DropIndex
DROP INDEX "ValetAvailability_valetId_date_key";

-- CreateIndex
CREATE UNIQUE INDEX "ValetAvailability_valetId_date_timeFrom_timeTo_key" ON "ValetAvailability"("valetId", "date", "timeFrom", "timeTo");

