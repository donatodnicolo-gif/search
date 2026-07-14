import { Module } from '@nestjs/common';
import { ValetsController } from './valets.controller';
import { ValetsService } from './valets.service';

@Module({
  controllers: [ValetsController],
  providers: [ValetsService],
  exports: [ValetsService],
})
export class ValetsModule {}
