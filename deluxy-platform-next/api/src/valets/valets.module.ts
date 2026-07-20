import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { ValetsController } from './valets.controller';
import { ValetsService } from './valets.service';

@Module({
  imports: [UsersModule],
  controllers: [ValetsController],
  providers: [ValetsService],
  exports: [ValetsService],
})
export class ValetsModule {}
