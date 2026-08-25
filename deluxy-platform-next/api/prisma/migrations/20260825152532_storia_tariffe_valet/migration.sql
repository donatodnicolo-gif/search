-- DropIndex
DROP INDEX "ValetService_valetId_serviceTypeId_key";

-- AlterTable
ALTER TABLE "ValetService" ADD COLUMN     "origine" TEXT NOT NULL DEFAULT 'listino',
ADD COLUMN     "validFrom" TIMESTAMP(3),
ADD COLUMN     "validTo" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "ValetService_valetId_serviceTypeId_validFrom_idx" ON "ValetService"("valetId", "serviceTypeId", "validFrom");

-- CreateIndex
CREATE UNIQUE INDEX "ValetService_valetId_serviceTypeId_validFrom_key" ON "ValetService"("valetId", "serviceTypeId", "validFrom");
