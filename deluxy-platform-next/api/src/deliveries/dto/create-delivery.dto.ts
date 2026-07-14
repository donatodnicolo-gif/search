import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class DeliveryProductDto {
  @ApiProperty()
  @IsString()
  productId: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @ApiPropertyOptional({ description: 'JSON {nomeCampo: valore} per i campi prodotto' })
  @IsOptional()
  @IsString()
  fieldValues?: string;
}

export class DeliveryPickupDto {
  @ApiProperty()
  @IsString()
  address: string;

  @ApiPropertyOptional({ example: '10:00' })
  @IsOptional()
  @IsString()
  timeFrom?: string;

  @ApiPropertyOptional({ example: '12:00' })
  @IsOptional()
  @IsString()
  timeTo?: string;

  @ApiPropertyOptional({ description: 'Stesso DDT su piu ritiri = una consegna' })
  @IsOptional()
  @IsString()
  ddtNumber?: string;
}

export class CreateDeliveryDto {
  @ApiProperty({ example: '2026-07-20' })
  @IsDateString()
  date: string;

  @ApiProperty()
  @IsString()
  serviceTypeId: string;

  @ApiPropertyOptional({ description: 'Obbligatorio per admin/operation; ignorato per ruolo partner (usa il proprio)' })
  @IsOptional()
  @IsString()
  partnerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  valetId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerId?: string;

  // Ritiro
  @ApiPropertyOptional({ example: '10:00' })
  @IsOptional()
  @IsString()
  pickupTimeFrom?: string;

  @ApiPropertyOptional({ example: '12:00' })
  @IsOptional()
  @IsString()
  pickupTimeTo?: string;

  @ApiPropertyOptional({ default: false, description: 'Orario di ritiro flessibile' })
  @IsOptional()
  @IsBoolean()
  pickupFlexible?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  pickupAddress?: string;

  // Destinatario
  @ApiProperty()
  @IsString()
  recipientFirstName: string;

  @ApiProperty()
  @IsString()
  recipientLastName: string;

  @ApiProperty()
  @IsString()
  recipientAddress: string;

  @ApiPropertyOptional({ description: 'Citofono' })
  @IsOptional()
  @IsString()
  recipientIntercom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  recipientPhone?: string;

  // Pagamento alla consegna
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  paymentOnDelivery?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  paymentAmount?: number;

  // Note
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Visibili solo ad admin/operation/valet' })
  @IsOptional()
  @IsString()
  internalNotes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ddtNumber?: string;

  @ApiPropertyOptional({ description: 'Distanza ritiro->consegna in km (in prod: calcolo automatico via API mappe)' })
  @IsOptional()
  @IsNumber()
  distanceKm?: number;

  @ApiPropertyOptional({ description: 'Ore, per servizi a ora (min 1)' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  hours?: number;

  // SMS trigger
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  smsOnCreated?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  smsOnDeparted?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  smsOnArrived?: boolean;

  @ApiPropertyOptional({ type: [DeliveryProductDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DeliveryProductDto)
  products?: DeliveryProductDto[];

  @ApiPropertyOptional({ type: [DeliveryPickupDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DeliveryPickupDto)
  pickups?: DeliveryPickupDto[];
}
