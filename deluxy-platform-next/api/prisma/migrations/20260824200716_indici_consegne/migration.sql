-- CreateIndex
CREATE INDEX "Delivery_deletedAt_date_idx" ON "Delivery"("deletedAt", "date");

-- CreateIndex
CREATE INDEX "Delivery_partnerId_date_idx" ON "Delivery"("partnerId", "date");

-- CreateIndex
CREATE INDEX "Delivery_valetId_date_idx" ON "Delivery"("valetId", "date");

-- CreateIndex
CREATE INDEX "Delivery_status_idx" ON "Delivery"("status");

-- CreateIndex
CREATE INDEX "Delivery_invoiced_idx" ON "Delivery"("invoiced");

-- CreateIndex
CREATE INDEX "Delivery_paymentStatus_idx" ON "Delivery"("paymentStatus");

-- CreateIndex
CREATE INDEX "Delivery_realOrderNumber_idx" ON "Delivery"("realOrderNumber");
