import { Module } from '@nestjs/common';
import { AreeModule } from '../aree/aree.module';
import { UsersModule } from '../users/users.module';
import { SettingsModule } from '../settings/settings.module';
import { AnagraficheSyncService } from './anagrafiche-sync.service';
import { PartnersController } from './partners.controller';
import { PartnersService } from './partners.service';

@Module({
  imports: [UsersModule, SettingsModule, AreeModule],
  controllers: [PartnersController],
  providers: [PartnersService, AnagraficheSyncService],
  exports: [PartnersService],
})
export class PartnersModule {}
