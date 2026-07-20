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
}
