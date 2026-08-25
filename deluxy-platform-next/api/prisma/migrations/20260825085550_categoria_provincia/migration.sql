-- CreateTable
CREATE TABLE "CategoryProvince" (
    "id" TEXT NOT NULL,
    "legacyId" INTEGER,
    "categoryId" TEXT NOT NULL,
    "provinceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CategoryProvince_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CategoryProvince_legacyId_key" ON "CategoryProvince"("legacyId");

-- CreateIndex
CREATE INDEX "CategoryProvince_provinceId_idx" ON "CategoryProvince"("provinceId");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryProvince_categoryId_provinceId_key" ON "CategoryProvince"("categoryId", "provinceId");

-- AddForeignKey
ALTER TABLE "CategoryProvince" ADD CONSTRAINT "CategoryProvince_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryProvince" ADD CONSTRAINT "CategoryProvince_provinceId_fkey" FOREIGN KEY ("provinceId") REFERENCES "Province"("id") ON DELETE CASCADE ON UPDATE CASCADE;
