import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ActivitiesModule } from './activities/activities.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/roles.guard';
import { CategoriesModule } from './categories/categories.module';
import { CustomersModule } from './customers/customers.module';
import { DeliveriesModule } from './deliveries/deliveries.module';
import { DeliveryRulesModule } from './delivery-rules/delivery-rules.module';
import { FinanceModule } from './finance/finance.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PartnersModule } from './partners/partners.module';
import { PaymentsModule } from './payments/payments.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';
import { ProvincesModule } from './provinces/provinces.module';
import { ServiceTypesModule } from './service-types/service-types.module';
import { SettingsModule } from './settings/settings.module';
import { OperationsModule } from './operations/operations.module';
import { SavedViewsModule } from './saved-views/saved-views.module';
import { CalculationsModule } from './calculations/calculations.module';
import { SalariesModule } from './salaries/salaries.module';
import { ReceiptsModule } from './receipts/receipts.module';
import { InvoicesModule } from './invoices/invoices.module';
import { SalesModule } from './sales/sales.module';
import { SmsTemplatesModule } from './sms-templates/sms-templates.module';
import { UsersModule } from './users/users.module';
import { ValetsModule } from './valets/valets.module';
import { WoocommerceModule } from './woocommerce/woocommerce.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    PartnersModule,
    ValetsModule,
    DeliveriesModule,
    ActivitiesModule,
    ProductsModule,
    CategoriesModule,
    CustomersModule,
    SalesModule,
    SalariesModule,
    ReceiptsModule,
    InvoicesModule,
    PaymentsModule,
    DeliveryRulesModule,
    SmsTemplatesModule,
    ProvincesModule,
    ServiceTypesModule,
    SettingsModule,
    OperationsModule,
    SavedViewsModule,
    NotificationsModule,
    CalculationsModule,
    FinanceModule,
    WoocommerceModule,
  ],
  providers: [
    // Guard globali: JWT su tutto (tranne @Public), poi controllo ruoli
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
