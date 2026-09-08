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

  /**
   * TIPOLOGIA DI SERVIZIO (05/09/2026, regola utente: «in consegne, anche
   * storico, consenti filtri veloci su tipologie di servizi in alto»).
   *
   * Due livelli, perche' le tipologie sono due cose diverse:
   * - `pricingModel` e' la FAMIGLIA (vendite, prezzo fisso, a ora, corporate,
   *   magazzino): cinque valori, sono le linguette rapide in cima alla pagina;
   * - `serviceTypeId` e' IL SERVIZIO preciso: 48 nomi, e' il menu a tendina.
   * Insieme si restringono (famiglia + servizio di quella famiglia).
   */
  @ApiPropertyOptional({ description: 'Filtra per tipo di servizio: uno o piu id, separati da virgola' })
  @IsOptional()
  @IsString()
  serviceTypeId?: string;

  @ApiPropertyOptional({
    description: 'Filtra per famiglia del servizio',
    enum: ['PREZZO_FISSO', 'VENDITA', 'A_ORA', 'CORPORATE', 'MAGAZZINO'],
  })
  @IsOptional()
  @IsIn(['PREZZO_FISSO', 'VENDITA', 'A_ORA', 'CORPORATE', 'MAGAZZINO'])
  pricingModel?: 'PREZZO_FISSO' | 'VENDITA' | 'A_ORA' | 'CORPORATE' | 'MAGAZZINO';

  @ApiPropertyOptional({ description: 'Filtra per valet (ignorato per il ruolo VALET)' })
  @IsOptional()
  @IsString()
  valetId?: string;

  /**
   * ⭐ 08/09/2026 (regola utente: «consenti di aggiungere filtri di ricerca anche in
   * consegne, con un pop-up che permette di aggiungere varie condizioni»).
   *
   * RICERCA AVANZATA: un elenco JSON di condizioni `[{campo, operatore, valore}]`, che
   * si sommano in AND ai filtri di sopra. Serve per le domande che le linguette non
   * sanno fare — «le consegne senza valet di questa settimana su Milano», «quelle sopra
   * i 100 € con DDT del brand X» — e che oggi si risolvevano scorrendo a mano.
   *
   * ⚠️ NON e' una query libera. Campi e operatori passano da una lista bianca dichiarata
   * nel servizio (`CAMPI_AVANZATI`): un nome fuori elenco fa fallire la richiesta, non
   * la allarga. Il valore non tocca mai SQL — diventa un oggetto Prisma tipizzato.
   *
   * ⚠️ E le condizioni restano SEMPRE in AND con lo scope di ruolo: un partner che
   * scrive `partnerId = altro` continua a non vedere niente.
   */
  @ApiPropertyOptional({
    description:
      'Condizioni avanzate in AND, JSON: [{"campo":"ddtNumber","operatore":"contiene","valore":"12905"}]. ' +
      'Campi e operatori ammessi in GET /deliveries/filtri-avanzati.',
  })
  @IsOptional()
  @IsString()
  cond?: string;
}
