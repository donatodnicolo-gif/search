import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { ListQueryDto } from '../../common/list-query';

/** Query della lista prodotti: contratto comune + sezione Archivio. */
export class ProductListQueryDto extends ListQueryDto {
  @ApiPropertyOptional({
    default: false,
    description:
      'true = sezione Archivio (prodotti archiviati); false/assente = lista principale. Stato separato da `active`.',
  })
  @IsOptional()
  // I query param arrivano come stringa: "true"/"1" -> true
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  archived?: boolean;

  /**
   * I filtri Sì/No della lista prodotti dell'app reale (manuale, §3.6):
   * Attivo, Approvato, Prodotto Unico, Super Prodotto, Super Provincia,
   * In Magazzino.
   *
   * ⚠️ Sono a TRE stati, non due: assente = non filtrare, `true` = solo sì,
   * `false` = solo no. Per questo la trasformazione non può ridurre tutto a
   * booleano come fa `archived`: `undefined` e `false` devono restare cose
   * diverse, se no «mostrami i non approvati» diventerebbe «mostrali tutti».
   */
  @ApiPropertyOptional({ description: 'Attivo: true = solo attivi, false = solo disattivati, assente = tutti' })
  @IsOptional()
  @Transform(({ value }) => treStati(value))
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ description: 'Approvato (Shopify): true / false / assente' })
  @IsOptional()
  @Transform(({ value }) => treStati(value))
  @IsBoolean()
  approved?: boolean;

  @ApiPropertyOptional({ description: 'Prodotto unico di un partner: true / false / assente' })
  @IsOptional()
  @Transform(({ value }) => treStati(value))
  @IsBoolean()
  unique?: boolean;

  @ApiPropertyOptional({ description: 'Super prodotto (combinazione): true / false / assente' })
  @IsOptional()
  @Transform(({ value }) => treStati(value))
  @IsBoolean()
  superProduct?: boolean;

  @ApiPropertyOptional({ description: 'Super provincia (sconto per provincia): true / false / assente' })
  @IsOptional()
  @Transform(({ value }) => treStati(value))
  @IsBoolean()
  superProvince?: boolean;

  @ApiPropertyOptional({ description: 'In magazzino (controlla stock): true / false / assente' })
  @IsOptional()
  @Transform(({ value }) => treStati(value))
  @IsBoolean()
  inStock?: boolean;
}

/** '' e assente restano `undefined`; solo 'true'/'1' e 'false'/'0' decidono. */
function treStati(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return undefined;
}
