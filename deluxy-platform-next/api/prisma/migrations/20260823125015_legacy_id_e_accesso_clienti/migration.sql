-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "legacyId" INTEGER;

-- AlterTable
ALTER TABLE "City" ADD COLUMN     "legacyId" INTEGER;

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "legacyId" INTEGER;

-- AlterTable
ALTER TABLE "Delivery" ADD COLUMN     "legacyId" INTEGER;

-- AlterTable
ALTER TABLE "Operation" ADD COLUMN     "legacyId" INTEGER;

-- AlterTable
ALTER TABLE "Partner" ADD COLUMN     "legacyId" INTEGER;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "legacyId" INTEGER;

-- AlterTable
ALTER TABLE "Province" ADD COLUMN     "legacyId" INTEGER;

-- AlterTable
ALTER TABLE "ServiceType" ADD COLUMN     "legacyId" INTEGER;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "customerId" TEXT,
ADD COLUMN     "legacyId" INTEGER;

-- AlterTable
ALTER TABLE "Valet" ADD COLUMN     "legacyId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Category_legacyId_key" ON "Category"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "City_legacyId_key" ON "City"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_legacyId_key" ON "Customer"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "Delivery_legacyId_key" ON "Delivery"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "Operation_legacyId_key" ON "Operation"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "Partner_legacyId_key" ON "Partner"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_legacyId_key" ON "Product"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "Province_legacyId_key" ON "Province"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceType_legacyId_key" ON "ServiceType"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "User_legacyId_key" ON "User"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "User_customerId_key" ON "User"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Valet_legacyId_key" ON "Valet"("legacyId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
