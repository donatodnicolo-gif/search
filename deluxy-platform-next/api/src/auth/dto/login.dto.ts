import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@deluxy.it' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Deluxy2026!' })
  @IsString()
  @MinLength(6)
  password: string;
}
