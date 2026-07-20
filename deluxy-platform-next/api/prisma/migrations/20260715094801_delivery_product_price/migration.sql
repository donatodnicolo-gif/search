-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DeliveryProduct" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deliveryId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "price" REAL,
    "flexiblePrice" BOOLEAN NOT NULL DEFAULT false,
    "fieldValues" TEXT,
    CONSTRAINT "DeliveryProduct_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DeliveryProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_DeliveryProduct" ("deliveryId", "fieldValues", "id", "productId", "quantity") SELECT "deliveryId", "fieldValues", "id", "productId", "quantity" FROM "DeliveryProduct";
DROP TABLE "DeliveryProduct";
ALTER TABLE "new_DeliveryProduct" RENAME TO "DeliveryProduct";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
