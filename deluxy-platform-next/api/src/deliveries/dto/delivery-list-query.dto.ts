import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
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

  @ApiPropertyOptional({ description: 'Filtra per partner (ignorato per il ruolo PARTNER)' })
  @IsOptional()
  @IsString()
  partnerId?: string;

  @ApiPropertyOptional({ description: 'Filtra per valet (ignorato per il ruolo VALET)' })
  @IsOptional()
  @IsString()
  valetId?: string;
}
