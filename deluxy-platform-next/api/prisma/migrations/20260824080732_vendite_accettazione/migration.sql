-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "deliveryDate" TIMESTAMP(3),
ADD COLUMN     "deliveryId" TEXT,
ADD COLUMN     "recipientAddress" TEXT,
ADD COLUMN     "recipientFirstName" TEXT,
ADD COLUMN     "recipientLastName" TEXT,
ADD COLUMN     "recipientPhone" TEXT,
ADD COLUMN     "refusedPartnerIds" TEXT,
ADD COLUMN     "serviceTypeId" TEXT,
ALTER COLUMN "status" SET DEFAULT 'da_gestire';

-- CreateIndex
CREATE UNIQUE INDEX "Sale_deliveryId_key" ON "Sale"("deliveryId");
