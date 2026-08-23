-- AlterTable
ALTER TABLE "Activity" ADD COLUMN     "legacyId" INTEGER;

-- AlterTable
ALTER TABLE "DeliveryProduct" ADD COLUMN     "legacyId" INTEGER;

-- AlterTable
ALTER TABLE "DeliveryRule" ADD COLUMN     "legacyId" INTEGER;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "legacyId" INTEGER;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "legacyId" INTEGER;

-- AlterTable
ALTER TABLE "Receipt" ADD COLUMN     "legacyId" INTEGER;

-- AlterTable
ALTER TABLE "Salary" ADD COLUMN     "legacyId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Activity_legacyId_key" ON "Activity"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryProduct_legacyId_key" ON "DeliveryProduct"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryRule_legacyId_key" ON "DeliveryRule"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_legacyId_key" ON "Invoice"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_legacyId_key" ON "Payment"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_legacyId_key" ON "Receipt"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "Salary_legacyId_key" ON "Salary"("legacyId");
