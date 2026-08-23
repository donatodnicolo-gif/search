-- AlterTable
ALTER TABLE "DeliveryProduct" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "height" DOUBLE PRECISION,
ADD COLUMN     "length" DOUBLE PRECISION,
ADD COLUMN     "productVariantId" TEXT,
ADD COLUMN     "weight" DOUBLE PRECISION,
ADD COLUMN     "width" DOUBLE PRECISION,
ADD COLUMN     "withoutCommission" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "approvalEmailSent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "availability" TEXT,
ADD COLUMN     "categoryMetaFields" TEXT,
ADD COLUMN     "createdFrom" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "legacyProvince" TEXT,
ADD COLUMN     "platformProductIds" TEXT,
ADD COLUMN     "priceHistory" TEXT,
ADD COLUMN     "reference" TEXT;

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN     "legacyId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_legacyId_key" ON "ProductVariant"("legacyId");

-- AddForeignKey
ALTER TABLE "DeliveryProduct" ADD CONSTRAINT "DeliveryProduct_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
