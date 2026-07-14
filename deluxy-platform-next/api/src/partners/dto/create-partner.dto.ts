import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { PartnerPaymentMethod, PartnerPaymentStatus } from '../../common/enums';

export class PartnerServiceDto {
  @ApiProperty()
  @IsString()
  serviceTypeId: string;

  @ApiProperty({ description: 'Prezzo del servizio per questo partner' })
  @IsNumber()
  price: number;

  @ApiPropertyOptional({ default: 0, description: 'KM inclusi' })
  @IsOptional()
  @IsNumber()
  includedKm?: number;

  @ApiPropertyOptional({ default: 0, description: 'Prezzo per KM extra' })
  @IsOptional()
  @IsNumber()
  extraKmPrice?: number;

  @ApiPropertyOptional({ default: 0, description: 'Extra fuori citta' })
  @IsOptional()
  @IsNumber()
  extraOutOfCityPrice?: number;
}

export class OpeningHourDto {
  @ApiProperty({ description: '0=domenica ... 6=sabato' })
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek: number;

  @ApiPropertyOptional({ example: '09:00' })
  @IsOptional()
  @IsString()
  openTime?: string;

  @ApiPropertyOptional({ example: '19:30' })
  @IsOptional()
  @IsString()
  closeTime?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  closed?: boolean;
}

export class CreatePartnerDto {
  @ApiProperty()
  @IsString()
  insegna: string;

  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ description: 'Ragione sociale' })
  @IsOptional()
  @IsString()
  businessName?: string;

  @ApiPropertyOptional({ description: 'P.IVA' })
  @IsOptional()
  @IsString()
  vatNumber?: string;

  @ApiPropertyOptional({ description: 'Codice fiscale' })
  @IsOptional()
  @IsString()
  fiscalCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ description: 'Nome referente' })
  @IsOptional()
  @IsString()
  contactName?: string;

  @ApiPropertyOptional({ description: 'Cognome referente' })
  @IsOptional()
  @IsString()
  contactSurname?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  invoicingEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Email per invio fatture' })
  @IsOptional()
  @IsEmail()
  invoiceEmail?: string;

  @ApiPropertyOptional({ default: false, description: 'Modelli SMS abilitati' })
  @IsOptional()
  @IsBoolean()
  smsTemplatesEnabled?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  notificationsEnabled?: boolean;

  @ApiPropertyOptional({ default: false, description: 'Notifiche WhatsApp' })
  @IsOptional()
  @IsBoolean()
  whatsappNotifications?: boolean;

  @ApiPropertyOptional({ default: false, description: 'Notifiche mail' })
  @IsOptional()
  @IsBoolean()
  mailNotifications?: boolean;

  @ApiPropertyOptional({ description: 'IBAN / conto bancario' })
  @IsOptional()
  @IsString()
  bankAccount?: string;

  @ApiPropertyOptional({ description: 'Intestatario del conto' })
  @IsOptional()
  @IsString()
  bankAccountName?: string;

  @ApiPropertyOptional({ description: 'Codice SDI fatturazione elettronica' })
  @IsOptional()
  @IsString()
  sdiCode?: string;

  @ApiPropertyOptional({ description: 'Inizio validita contratto (ISO)' })
  @IsOptional()
  @IsString()
  contractStart?: string;

  @ApiPropertyOptional({ description: 'Fine validita contratto (ISO)' })
  @IsOptional()
  @IsString()
  contractEnd?: string;

  @ApiPropertyOptional({ default: false, description: 'Indirizzo di ritiro multiplo' })
  @IsOptional()
  @IsBoolean()
  isMultiPickup?: boolean;

  @ApiPropertyOptional({ description: 'URL del negozio' })
  @IsOptional()
  @IsString()
  storeUrl?: string;

  @ApiPropertyOptional({ description: 'URL immagine partner' })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({ default: false, description: 'Verifica identita valet richiesta' })
  @IsOptional()
  @IsBoolean()
  valetIdentityCheck?: boolean;

  @ApiPropertyOptional({ default: false, description: 'Codice di consegna richiesto' })
  @IsOptional()
  @IsBoolean()
  deliveryCodeRequired?: boolean;

  @ApiPropertyOptional({ default: false, description: 'Partner magazzino' })
  @IsOptional()
  @IsBoolean()
  isWarehouse?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  documentation?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'API key per plugin WooCommerce deluxy-send-order' })
  @IsOptional()
  @IsString()
  woocommerceApiKey?: string;

  @ApiPropertyOptional({
    enum: PartnerPaymentMethod,
    description: 'Metodo di pagamento: bankTransfer | creditCard | directDebitMandate',
  })
  @IsOptional()
  @IsEnum(PartnerPaymentMethod)
  paymentMethod?: PartnerPaymentMethod;

  @ApiPropertyOptional({
    enum: PartnerPaymentStatus,
    default: PartnerPaymentStatus.ACTIVE,
    description: 'Stato pagamenti: active | inactive | blocked',
  })
  @IsOptional()
  @IsEnum(PartnerPaymentStatus)
  paymentStatus?: PartnerPaymentStatus;

  @ApiPropertyOptional({ type: [String], description: 'Province abilitate' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  provinceIds?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Categorie prodotto vendute' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categoryIds?: string[];

  @ApiPropertyOptional({ type: [PartnerServiceDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PartnerServiceDto)
  services?: PartnerServiceDto[];

  @ApiPropertyOptional({ type: [OpeningHourDto], description: 'Orari apertura settimanali' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OpeningHourDto)
  openingHours?: OpeningHourDto[];
}

export class UpdatePartnerDto extends PartialType(CreatePartnerDto) {}
