import { Module } from '@nestjs/common';
import { AnagraficheSyncService } from './anagrafiche-sync.service';
import { PartnersController } from './partners.controller';
import { PartnersService } from './partners.service';

@Module({
  controllers: [PartnersController],
  providers: [PartnersService, AnagraficheSyncService],
  exports: [PartnersService],
})
export class PartnersModule {}
