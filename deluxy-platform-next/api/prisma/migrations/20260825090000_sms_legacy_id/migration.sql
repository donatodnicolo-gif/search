-- AlterTable
ALTER TABLE "SmsTemplate" ADD COLUMN     "legacyId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "SmsTemplate_legacyId_key" ON "SmsTemplate"("legacyId");

