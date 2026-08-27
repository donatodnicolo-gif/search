import { PartialType } from '@nestjs/swagger';
import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsNumber,
  IsString,
} from 'class-validator';
import { DeliveryStatus } from '../../common/enums';
import { CreateDeliveryDto } from './create-delivery.dto';

export class UpdateDeliveryDto extends PartialType(CreateDeliveryDto) {}

export class UpdateDeliveryStatusDto {
  @ApiProperty({ enum: DeliveryStatus })
  @IsEnum(DeliveryStatus)
  status: DeliveryStatus;
}

export class AssignValetDto {
  // Senza decoratore di validazione il ValidationPipe (whitelist) scartava
  // il campo e il service riceveva undefined.
  @ApiProperty()
  @IsString()
  valetId: string;
}

// ============================================================
// AZIONI SU PIÙ CONSEGNE INSIEME (27/08/2026)
// ------------------------------------------------------------
// ⚠️ Il tetto di 200 id per chiamata non è una gentilezza: le azioni si
// eseguono una per una e in sequenza, quindi una lista senza limiti sarebbe
// una richiesta che va in timeout a metà — e a metà vuol dire con una parte
// delle consegne già cambiate e nessuno che lo sa.
// ============================================================
export class AzioneDiMassaDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty({ message: 'Scegli almeno una consegna.' })
  @ArrayMaxSize(200, { message: 'Massimo 200 consegne per volta.' })
  @IsString({ each: true })
  ids: string[];
}

export class AzioneDiMassaStatoDto extends AzioneDiMassaDto {
  @ApiProperty({ enum: DeliveryStatus })
  @IsEnum(DeliveryStatus)
  status: DeliveryStatus;
}

export class AzioneDiMassaValetDto extends AzioneDiMassaDto {
  @ApiProperty()
  @IsString()
  valetId: string;
}

export class AzioneDiMassaImportoDto extends AzioneDiMassaDto {
  @ApiProperty()
  @IsNumber()
  importo: number;
}
