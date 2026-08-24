-- CreateTable
CREATE TABLE "SalaryLine" (
    "id" TEXT NOT NULL,
    "salaryId" TEXT NOT NULL,
    "deliveryId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "origin" TEXT NOT NULL DEFAULT 'consegna',
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalaryLine_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "SalaryLine" ADD CONSTRAINT "SalaryLine_salaryId_fkey" FOREIGN KEY ("salaryId") REFERENCES "Salary"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryLine" ADD CONSTRAINT "SalaryLine_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE SET NULL ON UPDATE CASCADE;
