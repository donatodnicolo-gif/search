import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { ListQueryDto } from '../../common/list-query';

/**
 * Query della lista consegne: contratto comune (q / sort / dir / page /
 * pageSize / dateFrom / dateTo) + i filtri specifici della sezione.
 */
export class DeliveryListQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ description: 'Giorno singolo (YYYY-MM-DD). In alternativa usare dateFrom/dateTo.' })
  @IsOptional()
  @IsString()
  date?: string;

  @ApiPropertyOptional({ description: 'Stato consegna' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({
    description:
      'Vista: "attive" = consegne ancora in lavorazione (predefinita nella lista), ' +
      '"storico" = consegnate, non consegnate e chiuse, "tutte" = nessun filtro. ' +
      'L\'elenco degli stati chiusi sta in DELIVERY_CLOSED_STATUSES.',
    enum: ['attive', 'storico', 'tutte'],
  })
  @IsOptional()
  @IsIn(['attive', 'storico', 'tutte'])
  view?: 'attive' | 'storico' | 'tutte';

  @ApiPropertyOptional({ description: 'Filtra per partner (ignorato per il ruolo PARTNER)' })
  @IsOptional()
  @IsString()
  partnerId?: string;

  @ApiPropertyOptional({ description: 'Filtra per valet (ignorato per il ruolo VALET)' })
  @IsOptional()
  @IsString()
  valetId?: string;
}
