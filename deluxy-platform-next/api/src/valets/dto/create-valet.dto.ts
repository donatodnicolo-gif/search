import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
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

  @ApiPropertyOptional({ description: 'Salario a pezzo (servizi magazzino)' })
  @IsOptional()
  @IsNumber()
  salaryPerItem?: number;

  @ApiPropertyOptional({ description: 'Extra KM/€' })
  @IsOptional()
  @IsNumber()
  extraKmPrice?: number;
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

  @ApiPropertyOptional({ type: [String], description: 'Province in cui il team leader può assegnare' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  teamLeaderProvinceIds?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Partner associati al team leader' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  teamLeaderPartnerIds?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Partner esclusi dallo scope del team leader' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  teamLeaderExcludedPartnerIds?: string[];

  @ApiPropertyOptional({ description: 'Mezzo (Auto, Bicicletta, Furgone, Moto/Scooter)' })
  @IsOptional()
  @IsString()
  vehicle?: string;

  @ApiPropertyOptional({ default: 0, description: '% ritenuta rimborso' })
  @IsOptional()
  @IsNumber()
  withholdingPercent?: number;

  @ApiPropertyOptional({ enum: ['monthly', 'weekly'], default: 'monthly', description: 'Frequenza stipendio' })
  @IsOptional()
  @IsIn(['monthly', 'weekly'])
  salaryFrequency?: string;

  @ApiPropertyOptional({ description: 'Limite di deposito settimanale' })
  @IsOptional()
  @IsNumber()
  weeklyDepositLimit?: number;

  @ApiPropertyOptional({ description: 'Minimum KM Included (entro il comune)' })
  @IsOptional()
  @IsNumber()
  minimumKmIncluded?: number;

  @ApiPropertyOptional({ description: 'Extra fuori città (rimborso fuori dal comune)' })
  @IsOptional()
  @IsNumber()
  extraOutOfCityPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

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
