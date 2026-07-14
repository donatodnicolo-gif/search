import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class ValetServiceDto {
  @ApiProperty()
  @IsString()
  serviceTypeId: string;

  @ApiProperty({ description: 'Salario per il servizio (matching con il servizio partner dello stesso modello di prezzo)' })
  @IsNumber()
  salary: number;
}

export class CreateValetDto {
  @ApiProperty()
  @IsString()
  firstName: string;

  @ApiProperty()
  @IsString()
  lastName: string;

  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ default: false, description: 'Flag P.IVA (richiede P.IVA, CF, luogo/data nascita, IBAN)' })
  @IsOptional()
  @IsBoolean()
  hasVat?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  vatNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fiscalCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  birthPlace?: string;

  @ApiPropertyOptional({ example: '1995-04-12' })
  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  iban?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isTeamLeader?: boolean;

  @ApiPropertyOptional({ description: 'Mezzo (auto, scooter, furgone...)' })
  @IsOptional()
  @IsString()
  vehicle?: string;

  @ApiPropertyOptional({ default: 0, description: '% ritenuta rimborso' })
  @IsOptional()
  @IsNumber()
  withholdingPercent?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  notifyByEmail?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  notifyByWhatsapp?: boolean;

  @ApiPropertyOptional({ type: [String], description: 'Province di competenza' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  provinceIds?: string[];

  @ApiPropertyOptional({ type: [ValetServiceDto], description: 'Servizi con salario' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ValetServiceDto)
  services?: ValetServiceDto[];
}

export class UpdateValetDto extends PartialType(CreateValetDto) {}
