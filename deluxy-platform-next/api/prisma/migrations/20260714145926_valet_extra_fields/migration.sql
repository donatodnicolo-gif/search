-- AlterTable
ALTER TABLE "ValetService" ADD COLUMN "extraKmPrice" REAL;
ALTER TABLE "ValetService" ADD COLUMN "salaryPerItem" REAL;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Valet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "hasVat" BOOLEAN NOT NULL DEFAULT false,
    "vatNumber" TEXT,
    "fiscalCode" TEXT,
    "birthPlace" TEXT,
    "birthDate" DATETIME,
    "iban" TEXT,
    "isTeamLeader" BOOLEAN NOT NULL DEFAULT false,
    "teamLeaderProvinces" TEXT,
    "teamLeaderPartners" TEXT,
    "vehicle" TEXT,
    "withholdingPercent" REAL NOT NULL DEFAULT 0,
    "salaryFrequency" TEXT NOT NULL DEFAULT 'monthly',
    "weeklyDepositLimit" REAL,
    "minimumKmIncluded" REAL,
    "extraOutOfCityPrice" REAL,
    "notes" TEXT,
    "notifyByEmail" BOOLEAN NOT NULL DEFAULT true,
    "notifyByWhatsapp" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Valet" ("active", "address", "birthDate", "birthPlace", "createdAt", "email", "firstName", "fiscalCode", "hasVat", "iban", "id", "isTeamLeader", "lastName", "notifyByEmail", "notifyByWhatsapp", "phone", "updatedAt", "vatNumber", "vehicle", "withholdingPercent") SELECT "active", "address", "birthDate", "birthPlace", "createdAt", "email", "firstName", "fiscalCode", "hasVat", "iban", "id", "isTeamLeader", "lastName", "notifyByEmail", "notifyByWhatsapp", "phone", "updatedAt", "vatNumber", "vehicle", "withholdingPercent" FROM "Valet";
DROP TABLE "Valet";
ALTER TABLE "new_Valet" RENAME TO "Valet";
CREATE UNIQUE INDEX "Valet_email_key" ON "Valet"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
