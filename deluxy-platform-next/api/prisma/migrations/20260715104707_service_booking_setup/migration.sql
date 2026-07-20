-- AlterTable
ALTER TABLE "ServiceType" ADD COLUMN "maxOrderTime" TEXT;
ALTER TABLE "ServiceType" ADD COLUMN "minOrderTime" TEXT;
ALTER TABLE "ServiceType" ADD COLUMN "noticeDays" INTEGER;
ALTER TABLE "ServiceType" ADD COLUMN "slotHours" INTEGER;
