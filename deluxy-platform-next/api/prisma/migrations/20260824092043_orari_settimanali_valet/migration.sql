-- CreateTable
CREATE TABLE "ValetOpeningHour" (
    "id" TEXT NOT NULL,
    "valetId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "openTime" TEXT,
    "closeTime" TEXT,
    "closed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ValetOpeningHour_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ValetOpeningHour_valetId_dayOfWeek_key" ON "ValetOpeningHour"("valetId", "dayOfWeek");

-- CreateIndex
CREATE UNIQUE INDEX "OpeningHour_partnerId_dayOfWeek_key" ON "OpeningHour"("partnerId", "dayOfWeek");

-- AddForeignKey
ALTER TABLE "ValetOpeningHour" ADD CONSTRAINT "ValetOpeningHour_valetId_fkey" FOREIGN KEY ("valetId") REFERENCES "Valet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
