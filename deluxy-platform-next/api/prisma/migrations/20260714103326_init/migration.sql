-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "isSupport" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "partnerId" TEXT,
    "valetId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "User_valetId_fkey" FOREIGN KEY ("valetId") REFERENCES "Valet" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Province" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "City" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "provinceId" TEXT NOT NULL,
    CONSTRAINT "City_provinceId_fkey" FOREIGN KEY ("provinceId") REFERENCES "Province" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ServiceType" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "pricingModel" TEXT NOT NULL,
    "basePrice" REAL,
    "perPiecePrice" REAL,
    "transportPrice" REAL,
    "minHours" INTEGER DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "Partner" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "insegna" TEXT NOT NULL,
    "businessName" TEXT,
    "email" TEXT NOT NULL,
    "vatNumber" TEXT,
    "fiscalCode" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "contactName" TEXT,
    "invoicingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "invoiceEmail" TEXT,
    "smsTemplatesEnabled" BOOLEAN NOT NULL DEFAULT false,
    "notificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "documentation" TEXT,
    "notes" TEXT,
    "woocommerceApiKey" TEXT,
    "paymentStatus" TEXT NOT NULL DEFAULT 'active',
    "paymentMethod" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PartnerProvince" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "partnerId" TEXT NOT NULL,
    "provinceId" TEXT NOT NULL,
    CONSTRAINT "PartnerProvince_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PartnerProvince_provinceId_fkey" FOREIGN KEY ("provinceId") REFERENCES "Province" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PartnerService" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "partnerId" TEXT NOT NULL,
    "serviceTypeId" TEXT NOT NULL,
    "price" REAL NOT NULL,
    "includedKm" REAL NOT NULL DEFAULT 0,
    "extraKmPrice" REAL NOT NULL DEFAULT 0,
    "extraOutOfCityPrice" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "PartnerService_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PartnerService_serviceTypeId_fkey" FOREIGN KEY ("serviceTypeId") REFERENCES "ServiceType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PartnerCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "partnerId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "PartnerCategory_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PartnerCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OpeningHour" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "partnerId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "openTime" TEXT,
    "closeTime" TEXT,
    "closed" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "OpeningHour_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Valet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "hasVat" BOOLEAN NOT NULL DEFAULT false,
    "vatNumber" TEXT,
    "fiscalCode" TEXT,
    "birthPlace" TEXT,
    "birthDate" DATETIME,
    "iban" TEXT,
    "isTeamLeader" BOOLEAN NOT NULL DEFAULT false,
    "vehicle" TEXT,
    "withholdingPercent" REAL NOT NULL DEFAULT 0,
    "notifyByEmail" BOOLEAN NOT NULL DEFAULT true,
    "notifyByWhatsapp" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ValetProvince" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "valetId" TEXT NOT NULL,
    "provinceId" TEXT NOT NULL,
    CONSTRAINT "ValetProvince_valetId_fkey" FOREIGN KEY ("valetId") REFERENCES "Valet" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ValetProvince_provinceId_fkey" FOREIGN KEY ("provinceId") REFERENCES "Province" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ValetService" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "valetId" TEXT NOT NULL,
    "serviceTypeId" TEXT NOT NULL,
    "salary" REAL NOT NULL,
    CONSTRAINT "ValetService_valetId_fkey" FOREIGN KEY ("valetId") REFERENCES "Valet" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ValetService_serviceTypeId_fkey" FOREIGN KEY ("serviceTypeId") REFERENCES "ServiceType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ValetAvailability" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "valetId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "timeFrom" TEXT,
    "timeTo" TEXT,
    "available" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "ValetAvailability_valetId_fkey" FOREIGN KEY ("valetId") REFERENCES "Valet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "CategoryDiscount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "categoryId" TEXT NOT NULL,
    "provinceId" TEXT NOT NULL,
    "discountPercent" REAL NOT NULL,
    CONSTRAINT "CategoryDiscount_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CategoryDiscount_provinceId_fkey" FOREIGN KEY ("provinceId") REFERENCES "Province" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" REAL NOT NULL,
    "type" TEXT NOT NULL,
    "partnerId" TEXT,
    "categoryId" TEXT,
    "visibleToOtherPartners" BOOLEAN NOT NULL DEFAULT false,
    "isAutoDiscounted" BOOLEAN NOT NULL DEFAULT false,
    "parentProductId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Product_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Product_parentProductId_fkey" FOREIGN KEY ("parentProductId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductComponent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "superProductId" TEXT NOT NULL,
    "componentProductId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "ProductComponent_superProductId_fkey" FOREIGN KEY ("superProductId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductComponent_componentProductId_fkey" FOREIGN KEY ("componentProductId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductField" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "adminOnly" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "ProductField_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "partnerId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Customer_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Delivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" INTEGER NOT NULL,
    "date" DATETIME NOT NULL,
    "serviceTypeId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "valetId" TEXT,
    "customerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'created',
    "pickupTimeFrom" TEXT,
    "pickupTimeTo" TEXT,
    "pickupFlexible" BOOLEAN NOT NULL DEFAULT false,
    "pickupAddress" TEXT,
    "recipientFirstName" TEXT NOT NULL,
    "recipientLastName" TEXT NOT NULL,
    "recipientAddress" TEXT NOT NULL,
    "recipientIntercom" TEXT,
    "recipientPhone" TEXT,
    "paymentOnDelivery" BOOLEAN NOT NULL DEFAULT false,
    "paymentAmount" REAL,
    "notes" TEXT,
    "internalNotes" TEXT,
    "ddtNumber" TEXT,
    "distanceKm" REAL,
    "extraKm" REAL NOT NULL DEFAULT 0,
    "extraOutOfCity" BOOLEAN NOT NULL DEFAULT false,
    "price" REAL,
    "valetSalary" REAL,
    "hours" REAL,
    "smsOnCreated" BOOLEAN NOT NULL DEFAULT false,
    "smsOnDeparted" BOOLEAN NOT NULL DEFAULT false,
    "smsOnArrived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Delivery_serviceTypeId_fkey" FOREIGN KEY ("serviceTypeId") REFERENCES "ServiceType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Delivery_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Delivery_valetId_fkey" FOREIGN KEY ("valetId") REFERENCES "Valet" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Delivery_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DeliveryProduct" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deliveryId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "fieldValues" TEXT,
    CONSTRAINT "DeliveryProduct_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DeliveryProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DeliveryPickup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deliveryId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "timeFrom" TEXT,
    "timeTo" TEXT,
    "ddtNumber" TEXT,
    CONSTRAINT "DeliveryPickup_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DeliveryLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deliveryId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeliveryLog_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deliveryId" TEXT NOT NULL,
    "valetId" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "scheduledAt" DATETIME,
    "timeFrom" TEXT,
    "timeTo" TEXT,
    "address" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Activity_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Activity_valetId_fkey" FOREIGN KEY ("valetId") REFERENCES "Valet" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SmsTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "brand" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "partnerId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SmsTemplate_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DeliveryRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "deliveryCount" INTEGER NOT NULL,
    "periodStart" DATETIME,
    "periodEnd" DATETIME,
    "partnerBillingAdjustment" REAL NOT NULL DEFAULT 0,
    "valetPayAdjustment" REAL NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "DeliveryRulePartner" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deliveryRuleId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    CONSTRAINT "DeliveryRulePartner_deliveryRuleId_fkey" FOREIGN KEY ("deliveryRuleId") REFERENCES "DeliveryRule" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DeliveryRulePartner_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Salary" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "valetId" TEXT NOT NULL,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "grossAmount" REAL NOT NULL,
    "cashDeductions" REAL NOT NULL DEFAULT 0,
    "netAmount" REAL NOT NULL,
    "documentType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "sentAt" DATETIME,
    "approvedAt" DATETIME,
    "paidAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Salary_valetId_fkey" FOREIGN KEY ("valetId") REFERENCES "Valet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "salaryId" TEXT NOT NULL,
    "number" TEXT,
    "fileUrl" TEXT,
    "signed" BOOLEAN NOT NULL DEFAULT false,
    "signedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Receipt_salaryId_fkey" FOREIGN KEY ("salaryId") REFERENCES "Salary" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "valetId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Payment_valetId_fkey" FOREIGN KEY ("valetId") REFERENCES "Valet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Sale" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "partnerId" TEXT,
    "customerId" TEXT,
    "provinceId" TEXT NOT NULL,
    "brand" TEXT NOT NULL DEFAULT 'DELUXY',
    "amount" REAL NOT NULL,
    "discountPercent" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'created',
    "source" TEXT NOT NULL DEFAULT 'app',
    "externalOrderId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Sale_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Sale_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Sale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Sale_provinceId_fkey" FOREIGN KEY ("provinceId") REFERENCES "Province" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_valetId_key" ON "User"("valetId");

-- CreateIndex
CREATE UNIQUE INDEX "Province_code_key" ON "Province"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceType_code_key" ON "ServiceType"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Partner_email_key" ON "Partner"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Partner_woocommerceApiKey_key" ON "Partner"("woocommerceApiKey");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerProvince_partnerId_provinceId_key" ON "PartnerProvince"("partnerId", "provinceId");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerService_partnerId_serviceTypeId_key" ON "PartnerService"("partnerId", "serviceTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerCategory_partnerId_categoryId_key" ON "PartnerCategory"("partnerId", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Valet_email_key" ON "Valet"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ValetProvince_valetId_provinceId_key" ON "ValetProvince"("valetId", "provinceId");

-- CreateIndex
CREATE UNIQUE INDEX "ValetService_valetId_serviceTypeId_key" ON "ValetService"("valetId", "serviceTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryDiscount_categoryId_provinceId_key" ON "CategoryDiscount"("categoryId", "provinceId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductComponent_superProductId_componentProductId_key" ON "ProductComponent"("superProductId", "componentProductId");

-- CreateIndex
CREATE UNIQUE INDEX "Delivery_code_key" ON "Delivery"("code");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryRulePartner_deliveryRuleId_partnerId_key" ON "DeliveryRulePartner"("deliveryRuleId", "partnerId");
