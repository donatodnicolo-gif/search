-- AlterTable
ALTER TABLE "Category" ADD COLUMN "aiPrompt" TEXT;
ALTER TABLE "Category" ADD COLUMN "notes" TEXT;

-- CreateTable
CREATE TABLE "CategoryField" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fieldType" TEXT NOT NULL DEFAULT 'optional',
    CONSTRAINT "CategoryField_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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
    "isAutoDiscounted" BOOLEAN NOT NULL DEFAULT false,
    "parentProductId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Product_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Product_parentProductId_fkey" FOREIGN KEY ("parentProductId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Product" ("active", "categoryId", "createdAt", "description", "id", "isAutoDiscounted", "name", "parentProductId", "partnerId", "price", "type", "updatedAt", "visibleToOtherPartners") SELECT "active", "categoryId", "createdAt", "description", "id", "isAutoDiscounted", "name", "parentProductId", "partnerId", "price", "type", "updatedAt", "visibleToOtherPartners" FROM "Product";
DROP TABLE "Product";
ALTER TABLE "new_Product" RENAME TO "Product";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
