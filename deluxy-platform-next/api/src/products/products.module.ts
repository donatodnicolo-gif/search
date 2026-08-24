import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { MerchandisingSyncModule } from '../merchandising-sync/merchandising-sync.module';
import { ProductsService } from './products.service';

@Module({
  controllers: [ProductsController],
  imports: [MerchandisingSyncModule],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
