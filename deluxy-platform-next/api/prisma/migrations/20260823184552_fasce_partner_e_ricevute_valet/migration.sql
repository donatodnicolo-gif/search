-- AlterTable
ALTER TABLE "Receipt" ADD COLUMN     "amount" DOUBLE PRECISION,
ADD COLUMN     "fileUrlFrom" TEXT,
ADD COLUMN     "status" TEXT,
ADD COLUMN     "valetId" TEXT,
ALTER COLUMN "salaryId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "PartnerDaySlot" (
    "id" TEXT NOT NULL,
    "legacyId" INTEGER,
    "partnerId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "timeFrom" TEXT,
    "timeTo" TEXT,
    "available" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PartnerDaySlot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PartnerDaySlot_legacyId_key" ON "PartnerDaySlot"("legacyId");

-- CreateIndex
CREATE INDEX "PartnerDaySlot_partnerId_date_idx" ON "PartnerDaySlot"("partnerId", "date");

-- AddForeignKey
ALTER TABLE "PartnerDaySlot" ADD CONSTRAINT "PartnerDaySlot_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_valetId_fkey" FOREIGN KEY ("valetId") REFERENCES "Valet"("id") ON DELETE SET NULL ON UPDATE CASCADE;
