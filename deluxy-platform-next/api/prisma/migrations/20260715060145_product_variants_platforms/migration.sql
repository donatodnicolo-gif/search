-- CreateTable
CREATE TABLE "ProductVariant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" REAL,
    "sku" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductPartnerLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    CONSTRAINT "ProductPartnerLink_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "shortDesc" TEXT,
    "price" REAL NOT NULL,
    "publicPrice" REAL,
    "sku" TEXT,
    "prepDays" INTEGER,
    "line" TEXT,
    "imageUrl" TEXT,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "type" TEXT NOT NULL,
    "partnerId" TEXT,
    "categoryId" TEXT,
    "visibleToOtherPartners" BOOLEAN NOT NULL DEFAULT false,
    "notEditable" BOOLEAN NOT NULL DEFAULT false,
    "controlStock" BOOLEAN NOT NULL DEFAULT false,
    "stock" INTEGER,
    "notPhysical" BOOLEAN NOT NULL DEFAULT false,
    "isSuperProvince" BOOLEAN NOT NULL DEFAULT false,
    "useAlternateName" BOOLEAN NOT NULL DEFAULT false,
    "alternateName" TEXT,
    "platforms" TEXT,
    "hasVariants" BOOLEAN NOT NULL DEFAULT false,
    "optionTitle" TEXT,
    "isAutoDiscounted" BOOLEAN NOT NULL DEFAULT false,
    "parentProductId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Product_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Product_parentProductId_fkey" FOREIGN KEY ("parentProductId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Product" ("active", "approved", "categoryId", "createdAt", "description", "id", "imageUrl", "isAutoDiscounted", "line", "name", "parentProductId", "partnerId", "prepDays", "price", "publicPrice", "shortDesc", "sku", "type", "updatedAt", "visibleToOtherPartners") SELECT "active", "approved", "categoryId", "createdAt", "description", "id", "imageUrl", "isAutoDiscounted", "line", "name", "parentProductId", "partnerId", "prepDays", "price", "publicPrice", "shortDesc", "sku", "type", "updatedAt", "visibleToOtherPartners" FROM "Product";
DROP TABLE "Product";
ALTER TABLE "new_Product" RENAME TO "Product";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "ProductPartnerLink_productId_partnerId_key" ON "ProductPartnerLink"("productId", "partnerId");
