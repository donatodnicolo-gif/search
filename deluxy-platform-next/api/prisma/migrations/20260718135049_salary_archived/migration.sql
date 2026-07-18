-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Salary" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "valetId" TEXT NOT NULL,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "grossAmount" REAL NOT NULL,
    "cashDeductions" REAL NOT NULL DEFAULT 0,
    "netAmount" REAL NOT NULL,
    "documentType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" DATETIME,
    "approvedAt" DATETIME,
    "paidAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Salary_valetId_fkey" FOREIGN KEY ("valetId") REFERENCES "Valet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Salary" ("approvedAt", "cashDeductions", "createdAt", "documentType", "grossAmount", "id", "netAmount", "paidAt", "periodEnd", "periodStart", "sentAt", "status", "updatedAt", "valetId") SELECT "approvedAt", "cashDeductions", "createdAt", "documentType", "grossAmount", "id", "netAmount", "paidAt", "periodEnd", "periodStart", "sentAt", "status", "updatedAt", "valetId" FROM "Salary";
DROP TABLE "Salary";
ALTER TABLE "new_Salary" RENAME TO "Salary";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
