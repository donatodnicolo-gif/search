import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { AnagraficheSyncService } from './anagrafiche-sync.service';
import { PartnersController } from './partners.controller';
import { PartnersService } from './partners.service';

@Module({
  imports: [UsersModule],
  controllers: [PartnersController],
  providers: [PartnersService, AnagraficheSyncService],
  exports: [PartnersService],
})
export class PartnersModule {}
