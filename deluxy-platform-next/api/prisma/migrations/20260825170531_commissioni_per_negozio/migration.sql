-- DropIndex
DROP INDEX "CommissioneIncasso_gateway_validoDa_idx";

-- DropIndex
DROP INDEX "CommissioneIncasso_gateway_validoDa_key";

-- AlterTable
ALTER TABLE "CommissioneIncasso" ADD COLUMN     "brand" TEXT;

-- AlterTable
ALTER TABLE "Delivery" ADD COLUMN     "paymentBrand" TEXT;

-- CreateIndex
CREATE INDEX "CommissioneIncasso_gateway_brand_validoDa_idx" ON "CommissioneIncasso"("gateway", "brand", "validoDa");

-- CreateIndex
CREATE UNIQUE INDEX "CommissioneIncasso_gateway_brand_validoDa_key" ON "CommissioneIncasso"("gateway", "brand", "validoDa");
