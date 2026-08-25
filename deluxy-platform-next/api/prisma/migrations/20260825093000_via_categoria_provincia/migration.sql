-- DropForeignKey
ALTER TABLE "CategoryProvince" DROP CONSTRAINT "CategoryProvince_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "CategoryProvince" DROP CONSTRAINT "CategoryProvince_provinceId_fkey";

-- DropTable
DROP TABLE "CategoryProvince";

