import { Module } from '@nestjs/common';
import { AreeModule } from '../aree/aree.module';
import { UsersModule } from '../users/users.module';
import { ValetsController } from './valets.controller';
import { ValetsService } from './valets.service';

@Module({
  imports: [UsersModule, AreeModule],
  controllers: [ValetsController],
  providers: [ValetsService],
  exports: [ValetsService],
})
export class ValetsModule {}
