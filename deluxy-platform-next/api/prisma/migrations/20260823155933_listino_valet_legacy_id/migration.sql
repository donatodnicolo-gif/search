-- AlterTable
ALTER TABLE "ValetService" ADD COLUMN     "legacyId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "ValetService_legacyId_key" ON "ValetService"("legacyId");
