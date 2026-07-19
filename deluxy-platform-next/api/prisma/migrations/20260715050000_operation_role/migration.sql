-- Operation: sostituisce isProjectManager con operationRole
ALTER TABLE "Operation" ADD COLUMN "operationRole" TEXT NOT NULL DEFAULT 'operation';
UPDATE "Operation" SET "operationRole" = 'project_manager' WHERE "isProjectManager" = 1;
ALTER TABLE "Operation" DROP COLUMN "isProjectManager";
