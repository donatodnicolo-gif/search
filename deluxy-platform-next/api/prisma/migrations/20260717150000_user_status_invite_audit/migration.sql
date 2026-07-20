-- CreateTable
CREATE TABLE "UserEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT,
    "actorEmail" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "isSupport" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'invited',
    "inviteToken" TEXT,
    "inviteTokenExpiresAt" DATETIME,
    "activatedAt" DATETIME,
    "partnerId" TEXT,
    "valetId" TEXT,
    "operationId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "User_valetId_fkey" FOREIGN KEY ("valetId") REFERENCES "Valet" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "User_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "Operation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
-- Migrazione dati: gli utenti esistenti (avevano active=true e una password)
-- diventano "active" e considerati già attivati.
INSERT INTO "new_User" ("createdAt", "email", "firstName", "id", "isSupport", "lastName", "partnerId", "passwordHash", "role", "updatedAt", "valetId", "status", "activatedAt")
SELECT "createdAt", "email", "firstName", "id", "isSupport", "lastName", "partnerId", "passwordHash", "role", "updatedAt", "valetId",
       CASE WHEN "active" = true THEN 'active' ELSE 'suspended' END,
       CASE WHEN "active" = true THEN "createdAt" ELSE NULL END
FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_inviteToken_key" ON "User"("inviteToken");
CREATE UNIQUE INDEX "User_valetId_key" ON "User"("valetId");
CREATE UNIQUE INDEX "User_operationId_key" ON "User"("operationId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
