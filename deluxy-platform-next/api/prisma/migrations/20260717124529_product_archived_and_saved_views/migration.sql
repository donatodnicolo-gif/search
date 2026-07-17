-- CreateTable
CREATE TABLE "SavedView" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "config" TEXT NOT NULL,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SavedView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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
    "images" TEXT,
    "platformDescriptions" TEXT,
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
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Product_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Product_parentProductId_fkey" FOREIGN KEY ("parentProductId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Product" ("active", "alternateName", "approved", "categoryId", "controlStock", "createdAt", "description", "hasVariants", "id", "imageUrl", "images", "isAutoDiscounted", "isSuperProvince", "line", "name", "notEditable", "notPhysical", "optionTitle", "parentProductId", "partnerId", "platformDescriptions", "platforms", "prepDays", "price", "publicPrice", "shortDesc", "sku", "stock", "type", "updatedAt", "useAlternateName", "visibleToOtherPartners") SELECT "active", "alternateName", "approved", "categoryId", "controlStock", "createdAt", "description", "hasVariants", "id", "imageUrl", "images", "isAutoDiscounted", "isSuperProvince", "line", "name", "notEditable", "notPhysical", "optionTitle", "parentProductId", "partnerId", "platformDescriptions", "platforms", "prepDays", "price", "publicPrice", "shortDesc", "sku", "stock", "type", "updatedAt", "useAlternateName", "visibleToOtherPartners" FROM "Product";
DROP TABLE "Product";
ALTER TABLE "new_Product" RENAME TO "Product";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "SavedView_userId_section_idx" ON "SavedView"("userId", "section");
