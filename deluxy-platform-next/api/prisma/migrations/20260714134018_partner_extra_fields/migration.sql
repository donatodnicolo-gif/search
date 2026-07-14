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
    "contractStart" DATETIME,
    "contractEnd" DATETIME,
    "isMultiPickup" BOOLEAN NOT NULL DEFAULT false,
    "storeUrl" TEXT,
    "imageUrl" TEXT,
    "valetIdentityCheck" BOOLEAN NOT NULL DEFAULT false,
    "deliveryCodeRequired" BOOLEAN NOT NULL DEFAULT false,
    "isWarehouse" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Partner" ("active", "address", "businessName", "contactName", "createdAt", "documentation", "email", "fiscalCode", "id", "insegna", "invoiceEmail", "invoicingEnabled", "notes", "notificationsEnabled", "paymentMethod", "paymentStatus", "phone", "smsTemplatesEnabled", "updatedAt", "vatNumber", "woocommerceApiKey") SELECT "active", "address", "businessName", "contactName", "createdAt", "documentation", "email", "fiscalCode", "id", "insegna", "invoiceEmail", "invoicingEnabled", "notes", "notificationsEnabled", "paymentMethod", "paymentStatus", "phone", "smsTemplatesEnabled", "updatedAt", "vatNumber", "woocommerceApiKey" FROM "Partner";
DROP TABLE "Partner";
ALTER TABLE "new_Partner" RENAME TO "Partner";
CREATE UNIQUE INDEX "Partner_email_key" ON "Partner"("email");
CREATE UNIQUE INDEX "Partner_woocommerceApiKey_key" ON "Partner"("woocommerceApiKey");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
