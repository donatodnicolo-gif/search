-- La vendita fotografa anche la VARIANTE dell'ordine (es. la taglia M):
-- senza, un ordine per la Cappelliera M entrava come «Cappelliera» e basta.
ALTER TABLE "Sale" ADD COLUMN "productVariantId" TEXT;
ALTER TABLE "Sale" ADD COLUMN "variantName" TEXT;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
