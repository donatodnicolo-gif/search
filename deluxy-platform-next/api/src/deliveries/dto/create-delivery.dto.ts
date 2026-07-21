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

  @ApiPropertyOptional({ description: 'Prezzo del prodotto in questa consegna (se flessibile)' })
  @IsOptional()
  @IsNumber()
  price?: number;

  @ApiPropertyOptional({ default: false, description: 'Prezzo flessibile (modifica del prezzo prodotto)' })
  @IsOptional()
  @IsBoolean()
  flexiblePrice?: boolean;

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

  @ApiPropertyOptional({ description: 'Stato consegna iniziale (admin/operation)' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Stato pagamento: default | paid | toBePaid' })
  @IsOptional()
  @IsString()
  paymentStatus?: string;

  // Fascia oraria consegna
  @ApiPropertyOptional({ example: '09:00' })
  @IsOptional()
  @IsString()
  deliveryTimeFrom?: string;

  @ApiPropertyOptional({ example: '13:00' })
  @IsOptional()
  @IsString()
  deliveryTimeTo?: string;

  // Ritiro
  @ApiPropertyOptional({ example: '10:00' })
  @IsOptional()
  @IsString()
  pickupTimeFrom?: string;

  @ApiPropertyOptional({ example: '12:00' })
  @IsOptional()
  @IsString()
  pickupTimeTo?: string;

  @ApiPropertyOptional({ default: false, description: 'Orario di ritiro flessibile (altrimenti fascia di 1 ora)' })
  @IsOptional()
  @IsBoolean()
  pickupFlexible?: boolean;

  @ApiPropertyOptional({ default: false, description: 'Orario di consegna flessibile (altrimenti fascia di 1 ora)' })
  @IsOptional()
  @IsBoolean()
  deliveryFlexible?: boolean;

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  recipientEmail?: string;

  // Mittente
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  senderFirstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  senderLastName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  senderPhone?: string;

  // Pagamento alla consegna
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  paymentOnDelivery?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  paymentAmount?: number;

  @ApiPropertyOptional({ default: false, description: 'Prova e reso del prodotto' })
  @IsOptional()
  @IsBoolean()
  tryAndReturn?: boolean;

  @ApiPropertyOptional({ default: false, description: 'Codice di consegna richiesto' })
  @IsOptional()
  @IsBoolean()
  deliveryCodeRequired?: boolean;

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

  // LISTINO
  @ApiPropertyOptional({ description: 'Prezzo per il partner (da fatturare)' })
  @IsOptional()
  @IsNumber()
  price?: number;

  @ApiPropertyOptional({ description: 'Plus/minus prezzo partner' })
  @IsOptional()
  @IsNumber()
  additionalPrice?: number;

  @ApiPropertyOptional({ description: 'Consegna prezzo: tariffa consegna al cliente (Finanza)' })
  @IsOptional()
  @IsNumber()
  deliveryPrice?: number;

  @ApiPropertyOptional({ description: 'Paga del valet (da pagare)' })
  @IsOptional()
  @IsNumber()
  valetSalary?: number;

  @ApiPropertyOptional({ description: 'Plus/minus paga valet' })
  @IsOptional()
  @IsNumber()
  valetAdditionalPrice?: number;

  @ApiPropertyOptional({ description: 'Personalizzazione' })
  @IsOptional()
  @IsString()
  personalizeSaleNotes?: string;

  @ApiPropertyOptional({ default: false, description: 'Vendita Deluxy' })
  @IsOptional()
  @IsBoolean()
  deluxyDelivery?: boolean;

  @ApiPropertyOptional({ description: 'Valet Servizio (id)' })
  @IsOptional()
  @IsString()
  valetServiceId?: string;

  @ApiPropertyOptional({ default: true, description: 'Da fatturare' })
  @IsOptional()
  @IsBoolean()
  billable?: boolean;

  @ApiPropertyOptional({ default: true, description: 'Da pagare' })
  @IsOptional()
  @IsBoolean()
  payable?: boolean;

  @ApiPropertyOptional({ default: false, description: 'Prezzo flessibile' })
  @IsOptional()
  @IsBoolean()
  isFlexiblePrice?: boolean;

  @ApiPropertyOptional({ description: 'Prezzo flessibile (testo)' })
  @IsOptional()
  @IsString()
  flexiblePrice?: string;

  @ApiPropertyOptional({ description: 'Numero telefonico per SMS' })
  @IsOptional()
  @IsString()
  smsPhoneNo?: string;

  @ApiPropertyOptional({ description: 'File/URL del DDT' })
  @IsOptional()
  @IsString()
  ddtFile?: string;

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
