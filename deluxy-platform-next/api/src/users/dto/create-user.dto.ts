import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { Role } from '../../common/enums';

export class CreateUserDto {
  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiPropertyOptional({
    minLength: 8,
    description: 'Se omessa, l\'utente viene creato "invitato" e sceglierà la password dal link di invito',
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @ApiProperty()
  @IsString()
  firstName: string;

  @ApiProperty()
  @IsString()
  lastName: string;

  @ApiProperty({ enum: Role })
  @IsEnum(Role)
  role: Role;

  @ApiPropertyOptional({ default: false, description: 'Admin "support": vede Finanza/marginalita' })
  @IsOptional()
  @IsBoolean()
  isSupport?: boolean;

  @ApiPropertyOptional({ description: 'Per ruolo PARTNER' })
  @IsOptional()
  @IsString()
  partnerId?: string;

  @ApiPropertyOptional({ description: 'Per ruolo VALET' })
  @IsOptional()
  @IsString()
  valetId?: string;
}

export class UpdateUserDto extends PartialType(CreateUserDto) {
  @ApiPropertyOptional({ description: 'Collega l\'utente a un operatore (staff ufficio)' })
  @IsOptional()
  @IsString()
  operationId?: string;
}
