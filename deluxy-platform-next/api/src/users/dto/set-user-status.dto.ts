import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { UserStatus } from '../../common/enums';

/** Stati impostabili dall'admin (l'invito si gestisce con resend-invite). */
const SETTABLE = [UserStatus.ACTIVE, UserStatus.SUSPENDED, UserStatus.ARCHIVED];

export class SetUserStatusDto {
  @ApiProperty({ enum: SETTABLE })
  @IsIn(SETTABLE)
  status: string;
}
