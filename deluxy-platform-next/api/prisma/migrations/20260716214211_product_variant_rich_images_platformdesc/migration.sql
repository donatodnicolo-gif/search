-- AlterTable
ALTER TABLE "Product" ADD COLUMN "images" TEXT;
ALTER TABLE "Product" ADD COLUMN "platformDescriptions" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ProductVariant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" REAL,
    "publicPrice" REAL,
    "sku" TEXT,
    "prepDays" INTEGER,
    "controlStock" BOOLEAN NOT NULL DEFAULT false,
    "stock" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ProductVariant" ("active", "id", "name", "price", "productId", "sku") SELECT "active", "id", "name", "price", "productId", "sku" FROM "ProductVariant";
DROP TABLE "ProductVariant";
ALTER TABLE "new_ProductVariant" RENAME TO "ProductVariant";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
