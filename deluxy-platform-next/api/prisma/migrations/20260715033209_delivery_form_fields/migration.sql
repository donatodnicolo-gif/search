-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Delivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" INTEGER NOT NULL,
    "date" DATETIME NOT NULL,
    "serviceTypeId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "valetId" TEXT,
    "customerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'created',
    "paymentStatus" TEXT NOT NULL DEFAULT 'default',
    "deliveryTimeFrom" TEXT,
    "deliveryTimeTo" TEXT,
    "pickupTimeFrom" TEXT,
    "pickupTimeTo" TEXT,
    "pickupFlexible" BOOLEAN NOT NULL DEFAULT false,
    "pickupAddress" TEXT,
    "recipientFirstName" TEXT NOT NULL,
    "recipientLastName" TEXT NOT NULL,
    "recipientAddress" TEXT NOT NULL,
    "recipientIntercom" TEXT,
    "recipientPhone" TEXT,
    "recipientEmail" TEXT,
    "senderFirstName" TEXT,
    "senderLastName" TEXT,
    "senderPhone" TEXT,
    "paymentOnDelivery" BOOLEAN NOT NULL DEFAULT false,
    "paymentAmount" REAL,
    "tryAndReturn" BOOLEAN NOT NULL DEFAULT false,
    "deliveryCodeRequired" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "internalNotes" TEXT,
    "ddtNumber" TEXT,
    "distanceKm" REAL,
    "extraKm" REAL NOT NULL DEFAULT 0,
    "extraOutOfCity" BOOLEAN NOT NULL DEFAULT false,
    "price" REAL,
    "additionalPrice" REAL,
    "valetSalary" REAL,
    "valetAdditionalPrice" REAL,
    "hours" REAL,
    "personalizeSaleNotes" TEXT,
    "smsOnCreated" BOOLEAN NOT NULL DEFAULT false,
    "smsOnDeparted" BOOLEAN NOT NULL DEFAULT false,
    "smsOnArrived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Delivery_serviceTypeId_fkey" FOREIGN KEY ("serviceTypeId") REFERENCES "ServiceType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Delivery_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Delivery_valetId_fkey" FOREIGN KEY ("valetId") REFERENCES "Valet" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Delivery_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Delivery" ("code", "createdAt", "customerId", "date", "ddtNumber", "distanceKm", "extraKm", "extraOutOfCity", "hours", "id", "internalNotes", "notes", "partnerId", "paymentAmount", "paymentOnDelivery", "pickupAddress", "pickupFlexible", "pickupTimeFrom", "pickupTimeTo", "price", "recipientAddress", "recipientFirstName", "recipientIntercom", "recipientLastName", "recipientPhone", "serviceTypeId", "smsOnArrived", "smsOnCreated", "smsOnDeparted", "status", "updatedAt", "valetId", "valetSalary") SELECT "code", "createdAt", "customerId", "date", "ddtNumber", "distanceKm", "extraKm", "extraOutOfCity", "hours", "id", "internalNotes", "notes", "partnerId", "paymentAmount", "paymentOnDelivery", "pickupAddress", "pickupFlexible", "pickupTimeFrom", "pickupTimeTo", "price", "recipientAddress", "recipientFirstName", "recipientIntercom", "recipientLastName", "recipientPhone", "serviceTypeId", "smsOnArrived", "smsOnCreated", "smsOnDeparted", "status", "updatedAt", "valetId", "valetSalary" FROM "Delivery";
DROP TABLE "Delivery";
ALTER TABLE "new_Delivery" RENAME TO "Delivery";
CREATE UNIQUE INDEX "Delivery_code_key" ON "Delivery"("code");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
