import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class AcceptInviteDto {
  @ApiProperty({ description: 'Token monouso ricevuto nel link di invito' })
  @IsString()
  token: string;

  @ApiProperty({ minLength: 8, description: 'Password scelta dalla persona' })
  @IsString()
  @MinLength(8)
  password: string;
}
