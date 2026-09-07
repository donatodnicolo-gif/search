import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { MerchandisingSyncModule } from '../merchandising-sync/merchandising-sync.module';
import { ProductsService } from './products.service';
import { StockModule } from '../stock/stock.module';

@Module({
  controllers: [ProductsController],
  imports: [MerchandisingSyncModule, StockModule],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
