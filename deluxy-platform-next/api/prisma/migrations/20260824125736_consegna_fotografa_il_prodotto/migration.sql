-- DropForeignKey
ALTER TABLE "DeliveryProduct" DROP CONSTRAINT "DeliveryProduct_productId_fkey";

-- DropForeignKey
ALTER TABLE "Sale" DROP CONSTRAINT "Sale_productId_fkey";

-- AlterTable
ALTER TABLE "DeliveryProduct" ADD COLUMN     "productName" TEXT,
ADD COLUMN     "productSku" TEXT,
ADD COLUMN     "variantName" TEXT,
ALTER COLUMN "productId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "productName" TEXT,
ADD COLUMN     "productSku" TEXT,
ALTER COLUMN "productId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "DeliveryProduct" ADD CONSTRAINT "DeliveryProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
