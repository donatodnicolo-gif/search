import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { SettingsModule } from '../settings/settings.module';
import { StockModule } from '../stock/stock.module';
import { DeliveriesController } from './deliveries.controller';
import { DeliveriesService } from './deliveries.service';
import { NonConsegnateCronController } from './non-consegnate-cron.controller';

@Module({
  imports: [SettingsModule, NotificationsModule, StockModule],
  controllers: [DeliveriesController, NonConsegnateCronController],
  providers: [DeliveriesService],
  exports: [DeliveriesService],
})
export class DeliveriesModule {}
