-- AlterTable
ALTER TABLE "DeliveryRule" ADD COLUMN     "days" TEXT,
ADD COLUMN     "legacyPricingModel" TEXT;

-- AlterTable
ALTER TABLE "PartnerService" ADD COLUMN     "pricePerItem" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "ValetDeliveryRule" (
    "id" TEXT NOT NULL,
    "legacyId" INTEGER,
    "name" TEXT NOT NULL,
    "tiers" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ValetDeliveryRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValetDeliveryRuleValet" (
    "id" TEXT NOT NULL,
    "valetDeliveryRuleId" TEXT NOT NULL,
    "valetId" TEXT NOT NULL,

    CONSTRAINT "ValetDeliveryRuleValet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ValetDeliveryRule_legacyId_key" ON "ValetDeliveryRule"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "ValetDeliveryRuleValet_valetDeliveryRuleId_valetId_key" ON "ValetDeliveryRuleValet"("valetDeliveryRuleId", "valetId");

-- AddForeignKey
ALTER TABLE "ValetDeliveryRuleValet" ADD CONSTRAINT "ValetDeliveryRuleValet_valetDeliveryRuleId_fkey" FOREIGN KEY ("valetDeliveryRuleId") REFERENCES "ValetDeliveryRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValetDeliveryRuleValet" ADD CONSTRAINT "ValetDeliveryRuleValet_valetId_fkey" FOREIGN KEY ("valetId") REFERENCES "Valet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
