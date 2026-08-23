-- AlterTable
ALTER TABLE "Delivery" ADD COLUMN     "acceptSale" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "additionalValetPlusMinus" DOUBLE PRECISION,
ADD COLUMN     "approvedTimingStatus" TEXT,
ADD COLUMN     "createdByUserId" TEXT,
ADD COLUMN     "createdFrom" TEXT,
ADD COLUMN     "customSaleDelivery" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "deliveryCode" TEXT,
ADD COLUMN     "deliveryCodeVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "deliveryRuleId" TEXT,
ADD COLUMN     "existingCustomer" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "externalOrderSource" TEXT,
ADD COLUMN     "identifier" TEXT,
ADD COLUMN     "invoicePaymentStatus" TEXT,
ADD COLUMN     "invoiced" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "legacyCorrespondDeliveryId" INTEGER,
ADD COLUMN     "legacyOrderId" INTEGER,
ADD COLUMN     "legacyPrimarySaleId" INTEGER,
ADD COLUMN     "legacySaleId" INTEGER,
ADD COLUMN     "notDeliveredActionTaken" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "paidViaCard" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "parentDeliveryId" TEXT,
ADD COLUMN     "pickupCompleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "productManagement" TEXT,
ADD COLUMN     "productValue" DOUBLE PRECISION,
ADD COLUMN     "provinceId" TEXT,
ADD COLUMN     "readAt" TIMESTAMP(3),
ADD COLUMN     "readAtByPartner" TIMESTAMP(3),
ADD COLUMN     "readAtByValet" TIMESTAMP(3),
ADD COLUMN     "readByPartnerUserId" TEXT,
ADD COLUMN     "readByValetUserId" TEXT,
ADD COLUMN     "readDelivery" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "realOrderNumber" TEXT,
ADD COLUMN     "receipt" TEXT,
ADD COLUMN     "receiverSign" TEXT,
ADD COLUMN     "receiverType" TEXT,
ADD COLUMN     "requestExpert" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "saleType" TEXT,
ADD COLUMN     "sendToExpert" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "serviceEndTime" TEXT,
ADD COLUMN     "serviceStartTime" TEXT,
ADD COLUMN     "shop" TEXT,
ADD COLUMN     "startedAt" TIMESTAMP(3),
ADD COLUMN     "stockConsumed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stockReturned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "valetDeliveryRuleId" TEXT,
ADD COLUMN     "valetEndTime" TEXT,
ADD COLUMN     "valetIdentityCheck" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "valetStartTime" TEXT,
ADD COLUMN     "valetVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "withDailyDeliveryRule" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "withTotalDeliveryRule" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_readByPartnerUserId_fkey" FOREIGN KEY ("readByPartnerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_readByValetUserId_fkey" FOREIGN KEY ("readByValetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_deliveryRuleId_fkey" FOREIGN KEY ("deliveryRuleId") REFERENCES "DeliveryRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_valetDeliveryRuleId_fkey" FOREIGN KEY ("valetDeliveryRuleId") REFERENCES "ValetDeliveryRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_provinceId_fkey" FOREIGN KEY ("provinceId") REFERENCES "Province"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_parentDeliveryId_fkey" FOREIGN KEY ("parentDeliveryId") REFERENCES "Delivery"("id") ON DELETE SET NULL ON UPDATE CASCADE;
