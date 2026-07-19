-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ServiceType" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "pricingModel" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'partner',
    "basePrice" REAL,
    "perPiecePrice" REAL,
    "transportPrice" REAL,
    "deliveryPrice" REAL,
    "minHours" INTEGER DEFAULT 1,
    "noticeDays" INTEGER,
    "slotHours" INTEGER,
    "maxOrderTime" TEXT,
    "minOrderTime" TEXT,
    "allowFlexibleTime" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "hideCustomerInfo" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO "new_ServiceType" ("active", "basePrice", "code", "deliveryPrice", "hideCustomerInfo", "id", "maxOrderTime", "minHours", "minOrderTime", "name", "notes", "noticeDays", "perPiecePrice", "pricingModel", "scope", "slotHours", "transportPrice") SELECT "active", "basePrice", "code", "deliveryPrice", "hideCustomerInfo", "id", "maxOrderTime", "minHours", "minOrderTime", "name", "notes", "noticeDays", "perPiecePrice", "pricingModel", "scope", "slotHours", "transportPrice" FROM "ServiceType";
DROP TABLE "ServiceType";
ALTER TABLE "new_ServiceType" RENAME TO "ServiceType";
CREATE UNIQUE INDEX "ServiceType_code_key" ON "ServiceType"("code");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
