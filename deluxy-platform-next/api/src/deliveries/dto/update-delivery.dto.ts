import { PartialType } from '@nestjs/swagger';
import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { DeliveryStatus } from '../../common/enums';
import { CreateDeliveryDto } from './create-delivery.dto';

export class UpdateDeliveryDto extends PartialType(CreateDeliveryDto) {}

export class UpdateDeliveryStatusDto {
  @ApiProperty({ enum: DeliveryStatus })
  @IsEnum(DeliveryStatus)
  status: DeliveryStatus;

  // ---- Dettagli della CHIUSURA (31/08/2026, flusso valet) -------------------
  // Su «consegnata»: a chi (tipo + nome), firma raccolta dall'app, DDT firmato.
  // Su «non consegnata»: il motivo. Tutti facoltativi: il service li scrive
  // solo con lo stato giusto, così un client non riempie campi fuori contesto.
  /** Chi ha ritirato: gli stessi valori del legacy (5.994 «concierge» reali). */
  @ApiProperty({ required: false, enum: ['recipient', 'concierge', 'other'] })
  @IsOptional()
  @IsIn(['recipient', 'concierge', 'other'])
  receiverType?: string;

  @ApiProperty({ required: false, description: 'Nome di chi ha ritirato' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  receivedBy?: string;

  /** Firma dal telefono: data URL immagine (come le foto dei preventivi). */
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Matches(/^data:image\//)
  @MaxLength(400_000)
  receiverSign?: string;

  /** DDT firmato fotografato: data URL compresso dal client (max ~800 KB). */
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Matches(/^data:image\//)
  @MaxLength(1_100_000)
  ddtFile?: string;

  @ApiProperty({ required: false, description: 'Motivo della mancata consegna' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notDeliveredReason?: string;
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
