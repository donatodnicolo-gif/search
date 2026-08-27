import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * Gli stati che un'attività può avere davvero (`schema.prisma`, modello
 * Activity: «pending | done | skipped»).
 *
 * ⚠️ Prima lo stato arrivava come `string` non validata: ci si poteva scrivere
 * qualunque cosa e corrompere la tassonomia — misurato, una PROVA scritta in
 * colonna. Un enum non è pignoleria: è ciò che tiene leggibile un archivio di
 * 57.253 righe.
 */
export const STATI_ATTIVITA = ['pending', 'done', 'skipped'] as const;

export class StatoAttivitaDto {
  @ApiProperty({ enum: STATI_ATTIVITA })
  @IsIn(STATI_ATTIVITA, {
    message: `status deve essere uno fra: ${STATI_ATTIVITA.join(', ')}`,
  })
  status!: string;
}

class RigaRiordino {
  @ApiProperty()
  @IsString()
  id!: string;

  @ApiProperty()
  @IsInt()
  @Min(0)
  @Max(100_000)
  sortOrder!: number;
}

export class RiordinaAttivitaDto {
  @ApiProperty({ type: [RigaRiordino] })
  @IsArray()
  @ArrayNotEmpty({ message: 'Nessuna attività da riordinare.' })
  // Il riordino è una transazione di update: senza tetto, una lista lunga la
  // fa girare finché la funzione non muore a metà.
  @ArrayMaxSize(500, { message: 'Massimo 500 attività per volta.' })
  @ValidateNested({ each: true })
  @Type(() => RigaRiordino)
  items!: RigaRiordino[];
}
