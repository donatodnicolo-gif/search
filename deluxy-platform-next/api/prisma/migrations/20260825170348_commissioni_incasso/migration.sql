-- AlterTable
ALTER TABLE "Delivery" ADD COLUMN     "paymentCategory" TEXT,
ADD COLUMN     "paymentGateway" TEXT;

-- CreateTable
CREATE TABLE "CommissioneIncasso" (
    "id" TEXT NOT NULL,
    "gateway" TEXT NOT NULL,
    "categoria" TEXT,
    "percentuale" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fissa" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "validoDa" TIMESTAMP(3),
    "validoA" TIMESTAMP(3),
    "fonte" TEXT,
    "confermata" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "attiva" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissioneIncasso_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommissioneIncasso_gateway_validoDa_idx" ON "CommissioneIncasso"("gateway", "validoDa");

-- CreateIndex
CREATE UNIQUE INDEX "CommissioneIncasso_gateway_validoDa_key" ON "CommissioneIncasso"("gateway", "validoDa");
