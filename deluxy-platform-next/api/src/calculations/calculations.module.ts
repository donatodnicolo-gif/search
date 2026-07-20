import { Body, Controller, Injectable, Module, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators';

/**
 * ============================================================
 *  CALCOLI — logica di prezzo centralizzata dei servizi Deluxy
 * ------------------------------------------------------------
 *  Tutte le formule di calcolo del valore dei servizi vivono QUI,
 *  così sono in un unico punto (documentate anche in
 *  docs/COME-FUNZIONA-APP-DELUXY.md, sezione "Calcoli / Servizi").
 *
 *  Tipi di servizio partner:
 *   - VENDITA:      totale = somma( prezzo_prodotto * qta )   (prezzo = flessibile se impostato)
 *   - PREZZO_FISSO: in citta  -> valoreServizio + extraKmPrice * max(0, distanza - kmInclusi)
 *                   fuori citta -> extraFuoriCitta * distanza
 *   - A_ORA:        max(1, ore) * prezzoOrario
 *   - MAGAZZINO:    prezzoFisso + prezzoAPezzo * qta + prezzoConsegna
 *   - CORPORATE:    replica la consegna a un altro partner trasformando
 *                   il servizio da PREZZO_FISSO a VENDITA (workflow, vedi note)
 * ============================================================
 */

export interface SaleLine {
  price: number; // prezzo unitario (flessibile se impostato)
  quantity: number;
}

@Injectable()
export class CalculationsService {
  /** VENDITA: somma dei (prezzo unitario * quantita). Include i prezzi flessibili. */
  saleTotal(lines: SaleLine[]): number {
    return this.round(
      (lines ?? []).reduce((sum, l) => sum + (l.price ?? 0) * (l.quantity ?? 1), 0),
    );
  }

  /**
   * PREZZO_FISSO. La distanza (km) è calcolata via Google Maps tra ritiro e consegna.
   *  - inCity  -> valoreServizio + extraKmPrice * max(0, distanza - kmInclusi)
   *  - !inCity -> extraFuoriCitta * distanza
   */
  fixedPrice(params: {
    inCity: boolean;
    serviceValue: number;
    kmIncluded: number;
    extraKmPrice: number;
    extraOutOfCityPrice: number;
    distanceKm: number;
  }): number {
    const { inCity, serviceValue, kmIncluded, extraKmPrice, extraOutOfCityPrice, distanceKm } =
      params;
    if (inCity) {
      const extraKm = Math.max(0, (distanceKm ?? 0) - (kmIncluded ?? 0));
      return this.round((serviceValue ?? 0) + (extraKmPrice ?? 0) * extraKm);
    }
    return this.round((extraOutOfCityPrice ?? 0) * (distanceKm ?? 0));
  }

  /** A_ORA: minimo 1 ora. */
  hourly(hours: number, hourlyPrice: number): number {
    return this.round(Math.max(1, hours ?? 1) * (hourlyPrice ?? 0));
  }

  /** MAGAZZINO: prezzo fisso + prezzo a pezzo * quantita + prezzo consegna. */
  warehouse(params: {
    fixedPrice: number;
    perPiecePrice: number;
    quantity: number;
    deliveryPrice: number;
  }): number {
    const { fixedPrice, perPiecePrice, quantity, deliveryPrice } = params;
    return this.round(
      (fixedPrice ?? 0) + (perPiecePrice ?? 0) * (quantity ?? 0) + (deliveryPrice ?? 0),
    );
  }

  private round(n: number): number {
    return Math.round(n * 100) / 100;
  }
}

interface PreviewDto {
  type: 'VENDITA' | 'PREZZO_FISSO' | 'A_ORA' | 'MAGAZZINO';
  // VENDITA
  lines?: SaleLine[];
  // PREZZO_FISSO
  inCity?: boolean;
  serviceValue?: number;
  kmIncluded?: number;
  extraKmPrice?: number;
  extraOutOfCityPrice?: number;
  distanceKm?: number;
  // A_ORA
  hours?: number;
  hourlyPrice?: number;
  // MAGAZZINO
  fixedPrice?: number;
  perPiecePrice?: number;
  quantity?: number;
  deliveryPrice?: number;
}

@ApiTags('calculations')
@ApiBearerAuth()
@Controller('calculations')
export class CalculationsController {
  constructor(private readonly calc: CalculationsService) {}

  @Public()
  @Post('preview')
  @ApiOperation({ summary: 'Anteprima del valore di un servizio secondo la sua formula' })
  preview(@Body() dto: PreviewDto): { value: number } {
    switch (dto.type) {
      case 'VENDITA':
        return { value: this.calc.saleTotal(dto.lines ?? []) };
      case 'PREZZO_FISSO':
        return {
          value: this.calc.fixedPrice({
            inCity: dto.inCity ?? true,
            serviceValue: dto.serviceValue ?? 0,
            kmIncluded: dto.kmIncluded ?? 0,
            extraKmPrice: dto.extraKmPrice ?? 0,
            extraOutOfCityPrice: dto.extraOutOfCityPrice ?? 0,
            distanceKm: dto.distanceKm ?? 0,
          }),
        };
      case 'A_ORA':
        return { value: this.calc.hourly(dto.hours ?? 1, dto.hourlyPrice ?? 0) };
      case 'MAGAZZINO':
        return {
          value: this.calc.warehouse({
            fixedPrice: dto.fixedPrice ?? 0,
            perPiecePrice: dto.perPiecePrice ?? 0,
            quantity: dto.quantity ?? 0,
            deliveryPrice: dto.deliveryPrice ?? 0,
          }),
        };
      default:
        return { value: 0 };
    }
  }
}

@Module({
  controllers: [CalculationsController],
  providers: [CalculationsService],
  exports: [CalculationsService],
})
export class CalculationsModule {}
