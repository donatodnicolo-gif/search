-- CreateTable
CREATE TABLE "PriorityList" (
    "id" TEXT NOT NULL,
    "legacyId" INTEGER,
    "provinceId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriorityList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriorityEntry" (
    "id" TEXT NOT NULL,
    "legacyId" INTEGER,
    "listId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "PriorityEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PriorityList_legacyId_key" ON "PriorityList"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "PriorityList_provinceId_categoryId_key" ON "PriorityList"("provinceId", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "PriorityEntry_legacyId_key" ON "PriorityEntry"("legacyId");

-- CreateIndex
CREATE INDEX "PriorityEntry_listId_position_idx" ON "PriorityEntry"("listId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "PriorityEntry_listId_partnerId_key" ON "PriorityEntry"("listId", "partnerId");

-- AddForeignKey
ALTER TABLE "PriorityList" ADD CONSTRAINT "PriorityList_provinceId_fkey" FOREIGN KEY ("provinceId") REFERENCES "Province"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriorityList" ADD CONSTRAINT "PriorityList_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriorityEntry" ADD CONSTRAINT "PriorityEntry_listId_fkey" FOREIGN KEY ("listId") REFERENCES "PriorityList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriorityEntry" ADD CONSTRAINT "PriorityEntry_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
