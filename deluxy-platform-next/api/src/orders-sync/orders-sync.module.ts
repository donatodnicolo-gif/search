import {
  Body,
  Controller,
  Get,
  Injectable,
  Logger,
  Module,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators';
import { Role, SaleStatus } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';
import { SalesModule, SalesService } from '../sales/sales.module';
import { SettingsModule, SettingsService } from '../settings/settings.module';

/** Un ordine come lo espone Deluxy Orders (solo i campi che servono qui). */
type OrdineOrders = {
  id: string;
  brand?: string | null;
  numero?: string | null;
  data?: string | null;
  spedizione?: {
    nome?: string | null;
    indirizzo?: string | null;
    citta?: string | null;
    cap?: string | null;
    provincia?: string | null;
  } | null;
  cliente?: { nome?: string | null; telefono?: string | null; email?: string | null } | null;
  consegna?: { data?: string | null; fascia?: string | null } | null;
  righe?: { sku?: string | null; titolo?: string | null; quantita?: number | null }[];
  classificazione?: { stato?: { chiave?: string; terminale?: boolean } | null } | null;
};

type Esito =
  | 'creata'
  | 'gia-presente'
  | 'senza-provincia'
  | 'provincia-sconosciuta'
  | 'senza-sku'
  | 'prodotto-sconosciuto'
  | 'errore';

@Injectable()
export class OrdersSyncService {
  private readonly logger = new Logger(OrdersSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly sales: SalesService,
  ) {}

  private async config() {
    const url = (await this.settings.get('ordersUrl')) ?? process.env.ORDERS_URL ?? '';
    const chiave = (await this.settings.get('ordersApiKey')) ?? process.env.ORDERS_API_KEY ?? '';
    return { url: url.replace(/\/+$/, ''), chiave };
  }

  /**
   * Legge gli ordini da Deluxy Orders e li smista.
   *
   * ⚠️ Di default NON scrive: risponde con il conto di che cosa succederebbe.
   * Serve perche' un ordine su quattro non e' smistabile (vedi sotto) e
   * scoprirlo dopo aver creato 3.000 vendite «da gestire» sarebbe tardi.
   *
   * Che cosa puo' andare storto, e perche' e' un esito e non un errore:
   *  - `senza-provincia`: l'ordine non dice dove va. Lo smistamento sceglie per
   *    provincia, quindi non puo' scegliere. Sono ~25% degli ordini.
   *  - `provincia-sconosciuta`: c'e' scritto qualcosa che non e' una provincia
   *    italiana (es. `ENG`, gli ordini esteri).
   *  - `senza-sku` / `prodotto-sconosciuto`: la riga non ha SKU, o lo SKU non
   *    corrisponde a nessun prodotto qui. Sono ~28% delle righe.
   *
   * Nessuno di questi e' un guasto: e' un dato che manca alla sorgente, e
   * dirlo con un conto e' piu' utile che fallire.
   */
  async sincronizza(opzioni: {
    da?: string;
    limite?: number;
    applica?: boolean;
    brand?: string;
  }) {
    const { url, chiave } = await this.config();
    if (!url || !chiave) {
      return { ok: false, messaggio: 'Indirizzo o chiave di Orders non impostati (Configurazione → Impostazioni).' };
    }

    const limite = Math.min(1000, Math.max(1, opzioni.limite ?? 200));
    const perPagina = Math.min(200, limite);
    const ordini: OrdineOrders[] = [];
    let pagina = 1;

    while (ordini.length < limite) {
      const q = new URLSearchParams({ page: String(pagina), limit: String(perPagina) });
      if (opzioni.da) q.set('da', opzioni.da);
      if (opzioni.brand) q.set('brand', opzioni.brand);
      const res = await fetch(`${url}/api/v1/ordini?${q}`, { headers: { 'x-api-key': chiave } });
      if (!res.ok) {
        return { ok: false, messaggio: `Orders risponde HTTP ${res.status} alla pagina ${pagina}.` };
      }
      const body = (await res.json()) as { ordini?: OrdineOrders[]; totale?: number; pagine?: number };
      const lotto = body.ordini ?? [];
      ordini.push(...lotto);
      if (!lotto.length || pagina >= (body.pagine ?? 1)) break;
      pagina++;
    }

    // Indici locali: una lettura sola invece di due query per ordine.
    const province = new Map(
      (await this.prisma.province.findMany({ select: { id: true, code: true } }))
        .map((p) => [p.code.toUpperCase(), p.id]),
    );
    const prodotti = new Map(
      (await this.prisma.product.findMany({ where: { NOT: { sku: null } }, select: { id: true, sku: true } }))
        .map((p) => [p.sku!.trim().toUpperCase(), p.id]),
    );

    const conteggio: Record<Esito, number> = {
      creata: 0, 'gia-presente': 0, 'senza-provincia': 0, 'provincia-sconosciuta': 0,
      'senza-sku': 0, 'prodotto-sconosciuto': 0, errore: 0,
    };
    const esempi: { ordine: string; esito: Esito; dettaglio?: string }[] = [];
    const daGestire: string[] = [];

    for (const o of ordini) {
      const etichetta = `${o.brand ?? ''} ${o.numero ?? o.id}`.trim();
      const codice = o.spedizione?.provincia?.trim().toUpperCase() ?? '';
      const sku = o.righe?.find((r) => r.sku)?.sku?.trim().toUpperCase() ?? '';

      let esito: Esito;
      let dettaglio: string | undefined;
      if (!codice) { esito = 'senza-provincia'; }
      else if (!province.has(codice)) { esito = 'provincia-sconosciuta'; dettaglio = codice; }
      else if (!sku) { esito = 'senza-sku'; }
      else if (!prodotti.has(sku)) { esito = 'prodotto-sconosciuto'; dettaglio = sku; }
      else if (!opzioni.applica) {
        // In simulazione si controlla comunque se la vendita c'e' gia', se no
        // il conto direbbe «creata» per ordini gia' entrati e sarebbe falso.
        const gia = await this.prisma.sale.findFirst({
          where: { source: 'deluxy-orders', externalOrderId: o.id },
          select: { id: true },
        });
        esito = gia ? 'gia-presente' : 'creata';
      } else {
        try {
          const r = await this.sales.ingest({
            source: 'deluxy-orders',
            externalOrderId: o.id,
            provinceId: province.get(codice)!,
            productId: prodotti.get(sku)!,
            brand: o.brand ?? undefined,
            ...this.destinatario(o),
            deliveryDate: o.consegna?.data ? `${o.consegna.data}T00:00:00.000Z` : undefined,
          });
          esito = r.creata ? 'creata' : 'gia-presente';
          if (r.creata && (r as any).vendita?.status === SaleStatus.DA_GESTIRE) daGestire.push(etichetta);
        } catch (err) {
          esito = 'errore';
          dettaglio = (err as Error).message;
          this.logger.warn(`Ordine ${o.id}: ${dettaglio}`);
        }
      }
      conteggio[esito]++;
      if (esito !== 'creata' && esito !== 'gia-presente' && esempi.length < 12) {
        esempi.push({ ordine: etichetta, esito, dettaglio });
      }
    }

    return {
      ok: true,
      applicato: !!opzioni.applica,
      lettiDaOrders: ordini.length,
      conteggio,
      // Chi entra ma non trova nessun partner: e' l'esito corretto, ma va visto.
      senzaPartner: daGestire.length,
      esempiDiCosaNonEntra: esempi,
    };
  }

  /**
   * Il destinatario, come lo scrive Shopify: un solo campo «nome».
   *
   * Si divide sull'ULTIMO spazio, non sul primo: «Maria Teresa Rossi» ha due
   * nomi e un cognome, non uno e due. Se il nome e' una parola sola il cognome
   * resta vuoto e la consegna non si crea — meglio che inventarlo.
   */
  private destinatario(o: OrdineOrders) {
    const intero = (o.spedizione?.nome ?? '').trim();
    const taglio = intero.lastIndexOf(' ');
    const indirizzo = [o.spedizione?.indirizzo, o.spedizione?.cap, o.spedizione?.citta, o.spedizione?.provincia]
      .map((x) => (x ?? '').trim()).filter(Boolean).join(', ');
    return {
      recipientFirstName: taglio > 0 ? intero.slice(0, taglio) : intero || undefined,
      recipientLastName: taglio > 0 ? intero.slice(taglio + 1) : undefined,
      recipientAddress: indirizzo || undefined,
      recipientPhone: o.cliente?.telefono ?? undefined,
    };
  }

  /**
   * Ritira le vendite degli ordini ANNULLATI in Orders.
   *
   * Orders non restituisce gli annullati nell'elenco normale: sparirebbero e
   * basta, e la nostra vendita resterebbe valida per sempre. Per questo espone
   * `annullatiDa`, che e' il canale pensato per chi ne tiene una copia — noi.
   *
   * Le vendite gia' ACCETTATE non si toccano in automatico: dietro c'e' una
   * consegna, magari gia' fatta. Si segnalano e decide una persona.
   */
  async ritiraAnnullati(da: string, applica = false) {
    const { url, chiave } = await this.config();
    if (!url || !chiave) return { ok: false, messaggio: 'Orders non configurato.' };

    const res = await fetch(`${url}/api/v1/ordini?annullatiDa=${encodeURIComponent(da)}&limit=200`, {
      headers: { 'x-api-key': chiave },
    });
    if (!res.ok) return { ok: false, messaggio: `Orders risponde HTTP ${res.status}.` };
    const body = (await res.json()) as { ordini?: OrdineOrders[] };
    const annullati = body.ordini ?? [];

    const nostre = await this.prisma.sale.findMany({
      where: { source: 'deluxy-orders', externalOrderId: { in: annullati.map((o) => o.id) } },
      select: { id: true, externalOrderId: true, status: true },
    });
    const daAnnullare = nostre.filter((s) => s.status !== SaleStatus.ACCETTATA);
    const daGuardare = nostre.filter((s) => s.status === SaleStatus.ACCETTATA);

    if (applica && daAnnullare.length) {
      await this.prisma.sale.updateMany({
        where: { id: { in: daAnnullare.map((s) => s.id) } },
        data: { status: SaleStatus.ANNULLATA, partnerId: null },
      });
    }
    return {
      ok: true, applicato: applica,
      annullatiInOrders: annullati.length,
      vendiediteNostre: nostre.length,
      annullate: daAnnullare.length,
      // Queste NON si toccano da sole: dietro c'e' una consegna.
      accettateDaVerificareAMano: daGuardare.map((s) => s.externalOrderId),
    };
  }
}

@ApiTags('orders-sync')
@ApiBearerAuth()
@Controller('orders-sync')
export class OrdersSyncController {
  constructor(private readonly service: OrdersSyncService) {}

  @Post('esegui')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({
    summary: 'Legge gli ordini da Deluxy Orders e li smista (senza «applica» simula e basta)',
  })
  esegui(@Body() body: { da?: string; limite?: number; applica?: boolean; brand?: string }) {
    return this.service.sincronizza(body ?? {});
  }

  @Get('prova')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Simula lo smistamento sugli ultimi ordini, senza scrivere nulla' })
  prova() {
    return this.service.sincronizza({ limite: 200, applica: false });
  }

  @Post('annullati')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Ritira le vendite degli ordini annullati in Orders da una certa data' })
  annullati(@Body() body: { da: string; applica?: boolean }) {
    return this.service.ritiraAnnullati(body.da, body.applica);
  }
}

@Module({
  imports: [SalesModule, SettingsModule],
  controllers: [OrdersSyncController],
  providers: [OrdersSyncService],
  exports: [OrdersSyncService],
})
export class OrdersSyncModule {}
