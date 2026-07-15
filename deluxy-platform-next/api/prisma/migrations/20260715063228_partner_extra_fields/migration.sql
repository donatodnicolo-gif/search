-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Partner" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "insegna" TEXT NOT NULL,
    "businessName" TEXT,
    "email" TEXT NOT NULL,
    "vatNumber" TEXT,
    "fiscalCode" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "contactName" TEXT,
    "invoicingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "invoiceEmail" TEXT,
    "smsTemplatesEnabled" BOOLEAN NOT NULL DEFAULT false,
    "notificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "documentation" TEXT,
    "notes" TEXT,
    "woocommerceApiKey" TEXT,
    "paymentStatus" TEXT NOT NULL DEFAULT 'active',
    "paymentMethod" TEXT,
    "contactSurname" TEXT,
    "whatsappNotifications" BOOLEAN NOT NULL DEFAULT false,
    "mailNotifications" BOOLEAN NOT NULL DEFAULT false,
    "bankAccount" TEXT,
    "bankAccountName" TEXT,
    "sdiCode" TEXT,
    "certifiedEmail" TEXT,
    "contractStart" DATETIME,
    "contractEnd" DATETIME,
    "activityReminder" BOOLEAN NOT NULL DEFAULT false,
    "kmIncluded" REAL,
    "extraOutOfCityPrice" REAL,
    "deliveryCodeCheckType" TEXT NOT NULL DEFAULT 'UNIQUE_PER_DELIVERY',
    "isMultiPickup" BOOLEAN NOT NULL DEFAULT false,
    "pickupAddresses" TEXT,
    "storeUrl" TEXT,
    "imageUrl" TEXT,
    "valetIdentityCheck" BOOLEAN NOT NULL DEFAULT false,
    "deliveryCodeRequired" BOOLEAN NOT NULL DEFAULT false,
    "isWarehouse" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Partner" ("active", "address", "bankAccount", "bankAccountName", "businessName", "contactName", "contactSurname", "contractEnd", "contractStart", "createdAt", "deliveryCodeRequired", "documentation", "email", "fiscalCode", "id", "imageUrl", "insegna", "invoiceEmail", "invoicingEnabled", "isMultiPickup", "isWarehouse", "mailNotifications", "notes", "notificationsEnabled", "paymentMethod", "paymentStatus", "phone", "pickupAddresses", "sdiCode", "smsTemplatesEnabled", "storeUrl", "updatedAt", "valetIdentityCheck", "vatNumber", "whatsappNotifications", "woocommerceApiKey") SELECT "active", "address", "bankAccount", "bankAccountName", "businessName", "contactName", "contactSurname", "contractEnd", "contractStart", "createdAt", "deliveryCodeRequired", "documentation", "email", "fiscalCode", "id", "imageUrl", "insegna", "invoiceEmail", "invoicingEnabled", "isMultiPickup", "isWarehouse", "mailNotifications", "notes", "notificationsEnabled", "paymentMethod", "paymentStatus", "phone", "pickupAddresses", "sdiCode", "smsTemplatesEnabled", "storeUrl", "updatedAt", "valetIdentityCheck", "vatNumber", "whatsappNotifications", "woocommerceApiKey" FROM "Partner";
DROP TABLE "Partner";
ALTER TABLE "new_Partner" RENAME TO "Partner";
CREATE UNIQUE INDEX "Partner_email_key" ON "Partner"("email");
CREATE UNIQUE INDEX "Partner_woocommerceApiKey_key" ON "Partner"("woocommerceApiKey");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
