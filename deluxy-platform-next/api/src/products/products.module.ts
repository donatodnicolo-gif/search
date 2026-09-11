import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { MerchandisingSyncModule } from '../merchandising-sync/merchandising-sync.module';
import { ProductsService } from './products.service';
import { StockModule } from '../stock/stock.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  controllers: [ProductsController],
  imports: [MerchandisingSyncModule, StockModule, SettingsModule],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
