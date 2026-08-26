import {
  Body,
  Controller,
  Get,
  Headers,
  Injectable,
  Logger,
  Module,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public, Roles } from '../common/decorators';
import { Role, SaleStatus } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';
import { SalesModule, SalesService } from '../sales/sales.module';
import { SettingsModule, SettingsService } from '../settings/settings.module';
import { ValetsModule } from '../valets/valets.module';
import { ValetsService } from '../valets/valets.service';
import { FinanceModule, FinanceService } from '../finance/finance.module';
import { RecurringModule, RecurringService_ } from '../recurring/recurring.module';

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
  /** "manuale" = il Customer Service se lo tiene: NON va smistato. */
  smistamento?: string | null;
  /** Già evaso per un'altra strada (es. "fornitore_diretto"): NON va smistato. */
  evasione?: string | null;
};

type Esito =
  | 'creata'
  | 'gia-presente'
  | 'riservato-al-cs'
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
    private readonly finance: FinanceService,
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
  /**
   * Il numero Shopify nudo, dalle due grafie che girano.
   *
   * ⚠️ Orders tiene l'id in forma lunga — `gid://shopify/Order/11039527862595`
   * — e la piattaforma il numero e basta, `11039527862595`. Confrontandoli
   * cosi' come sono, l'appaiamento usciva ZERO su 2.000 ordini letti e 11.054
   * consegne che il numero ce l'hanno: sembrava che non ci fosse niente da
   * mandare, e invece era solo un prefisso.
   */
  private static numeroShopify(v?: string | null): string | null {
    const t = (v ?? '').trim();
    if (!t) return null;
    const coda = t.split('/').pop() ?? '';
    return /^\d+$/.test(coda) ? coda : null;
  }

  /**
   * Aggiorna la cache `OrdineCliente` (prodotti/consegna/totale pagati dal
   * cliente) in blocchi: 14.000 upsert a uno a uno attraverso il pooler non
   * finirebbero dentro i 300 s della corsa notturna.
   */
  private async aggiornaOrdineCliente(
    economia: { orderId: string; ordersId: string | null; brand: string | null; numero: string | null; prodotti: number; consegna: number; totale: number; commissioneIncassi: number | null; commissioneDa: string | null }[],
  ): Promise<number> {
    let scritti = 0;
    for (let i = 0; i < economia.length; i += 500) {
      const blocco = economia.slice(i, i + 500);
      // I cast servono: i parametri arrivano senza tipo e le colonne sono float8.
      const valori = blocco
        .map((_, j) => "(" + ["text","text","text","text","float8","float8","float8","float8","text"].map((tipo, k) => "$" + (j * 9 + k + 1) + "::" + tipo).join(", ") + ")")
        .join(',');
      const parametri = blocco.flatMap((e) => [e.orderId, e.ordersId, e.brand, e.numero, e.prodotti, e.consegna, e.totale, e.commissioneIncassi, e.commissioneDa ?? '']);
      // ⚠️ Schema QUALIFICATO: sul pooler (transaction mode) la search_path
      // non e' garantita e `"OrdineCliente"` nudo dava 42P01 in produzione.
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO platform."OrdineCliente" ("id", "orderId", "ordersId", "brand", "numero", "prodotti", "consegna", "totale", "commissioneIncassi", "commissioneDa", "aggiornatoIl")
         SELECT gen_random_uuid(), v.o, v.oi, v.b, v.n, v.p, v.c, v.t, v.ci, v.cd, now()
         FROM (VALUES ${valori}) AS v(o, oi, b, n, p, c, t, ci, cd)
         ON CONFLICT ("orderId") DO UPDATE
         SET "ordersId" = EXCLUDED."ordersId", "brand" = EXCLUDED."brand",
             "numero" = EXCLUDED."numero", "prodotti" = EXCLUDED."prodotti",
             "consegna" = EXCLUDED."consegna", "totale" = EXCLUDED."totale",
             "commissioneIncassi" = EXCLUDED."commissioneIncassi",
             "commissioneDa" = EXCLUDED."commissioneDa",
             "aggiornatoIl" = now()`,
        ...parametri,
      );
      scritti += blocco.length;
    }
    return scritti;
  }

  /**
   * Manda a Orders gli INGREDIENTI del margine sulla consegna nostra.
   *
   * Orders sa gia' fare il conto — `totale − costoFornitore − costoConsegna +
   * feeConsegna` — ma finora dichiarava il margine PARZIALE con la nota «la
   * piattaforma non lo espone ancora». Questa e' l'esposizione.
   *
   * ⚠️ Si mandano gli ingredienti, NON il margine gia' fatto. Il margine si
   * calcola in un posto solo (Standard Deluxy §7): il totale dell'ordine e il
   * costo del fornitore vivono in Orders e qui non si conoscono, e se ogni app
   * spedisse il proprio numero due schermate direbbero due cifre diverse.
   *
   * I due numeri, con le formule del manuale (§3.8, verificate su
   * app.deluxy.it il 21/07):
   *   costoConsegna = paga del valet         = valetSalary + valetAdditionalPrice
   *   feeConsegna   = Fee% x Prezzo partner  = commissionPercent/100 x (price + additionalPrice)
   *
   * ⚠️ Il legame ordine↔consegna passa da `Delivery.realOrderNumber`, che e'
   * l'id Shopify dell'ordine — lo stesso `orderId` con cui Orders identifica il
   * suo. NON da `Sale.externalOrderId`: quel legame nasce solo quando un
   * partner accetta un incarico, e oggi nessuno ha ancora accettato (0 su 66).
   * Cercandolo li' il conto uscirebbe zero su tutto.
   *
   * Un ordine puo' avere PIU' consegne: gli ingredienti si sommano, o un ordine
   * con due consegne risulterebbe costato la meta'.
   *
   * ⚠️ Di default NON scrive: risponde con il conto di cosa manderebbe.
   */
  async spingiMargini(
    opzioni: {
      applica?: boolean;
      da?: string;
      limite?: number;
      /** Scorre TUTTI gli ordini di Orders, senza tetto: è la corsa notturna. */
      tutti?: boolean;
      /**
       * Solo questi ordini (numero Shopify, la coda del gid). Serve quando si
       * corregge un pugno di consegne e non ha senso riscrivere gli ingredienti
       * di novemila ordini: ogni PATCH lascia una riga nella storia dell'ordine,
       * e novemila righe identiche rendono illeggibile proprio la cronologia che
       * dovrebbe spiegare le correzioni. La lettura resta completa (le pagine si
       * scorrono lo stesso), mirata è solo la SCRITTURA.
       */
      soloOrdiniShopify?: string[];
    } = {},
  ) {
    const { url, chiave } = await this.config();
    if (!url || !chiave) {
      return { ok: false, messaggio: 'Indirizzo o chiave di Orders non impostati (Configurazione → Impostazioni).' };
    }

    // 1) Gli ordini che Orders conosce, per poter tradurre il numero Shopify
    //    nel suo id interno. Senza questa traduzione non si potrebbe scrivere.
    //    `gia` è quello che Orders ha già in pancia: se combacia, non si
    //    rimanda — la storia dell'ordine non va riempita di righe identiche.
    const perOrderId = new Map<string, {
      id: string;
      numero?: string | null;
      gia: {
        costoConsegna: number | null; feeConsegna: number | null;
        primoMargine: number | null; feeVendita: number | null; margineFinale: number | null;
        metodoIncasso: string | null; commissioneIncassi: number | null;
      };
    }>();
    const soloQuesti = opzioni.soloOrdiniShopify?.length ? new Set(opzioni.soloOrdiniShopify) : null;
    const economia: { orderId: string; ordersId: string | null; brand: string | null; numero: string | null; prodotti: number; consegna: number; totale: number; commissioneIncassi: number | null; commissioneDa: string | null }[] = [];
    let pagina = 1;
    // Col filtro mirato (o con `tutti`) il tetto non c'entra: si scorre finché
    // non si trovano tutti quelli chiesti, o finiscono le pagine.
    const limite = soloQuesti || opzioni.tutti
      ? Number.MAX_SAFE_INTEGER
      : Math.min(5000, Math.max(1, opzioni.limite ?? 2000));
    while (perOrderId.size < limite) {
      const q = new URLSearchParams({ page: String(pagina), limit: '200' });
      if (opzioni.da) q.set('da', opzioni.da);
      const res = await fetch(`${url}/api/v1/ordini?${q}`, { headers: { 'x-api-key': chiave } });
      if (!res.ok) return { ok: false, messaggio: `Orders risponde HTTP ${res.status} leggendo la pagina ${pagina}.` };
      const body = (await res.json()) as {
        ordini?: {
          id: string; orderId?: string | null; numero?: string | null;
          brand?: string | null;
          totale?: number | null;
          righe?: { prezzo?: number | null; quantita?: number | null }[] | null;
          controllo?: {
            costoConsegna?: number | null; feeConsegna?: number | null;
            primoMargine?: number | null; feeVendita?: number | null; margineFinale?: number | null;
            metodoIncasso?: string | null; commissioneIncassi?: number | null;
          } | null;
        }[];
        pagine?: number;
      };
      for (const o of body.ordini ?? []) {
        const k = OrdersSyncService.numeroShopify(o.orderId);
        if (!k) continue;
        // La CACHE di quello che il cliente ha pagato (prodotti + consegna) si
        // aggiorna per TUTTI gli ordini letti, anche fuori dal filtro mirato:
        // i margini della Finanza contano il prezzo del cliente, e questa
        // passata e' l'unica che gli ordini li scorre comunque.
        if (o.totale != null && o.righe?.length) {
          const prodotti = Math.round(o.righe.reduce((s, r) => s + (r.prezzo ?? 0) * (r.quantita ?? 1), 0) * 100) / 100;
          economia.push({
            orderId: k,
            ordersId: o.id ?? null,
            brand: o.brand ?? null,
            numero: o.numero ?? null,
            prodotti,
            consegna: Math.max(0, Math.round((o.totale - prodotti) * 100) / 100),
            totale: o.totale,
            // La commissione d'incasso del PROPRIETARIO (Orders): fee reale
            // ('shopify') o suo listino ('tariffa'). La Finanza la preferisce
            // alla propria stima — il reale batte il listino batte la stima.
            commissioneIncassi: o.controllo?.commissioneIncassi ?? null,
            commissioneDa: (o.controllo as { commissioneDa?: string | null } | null | undefined)?.commissioneDa ?? null,
          });
        }
        if (soloQuesti && !soloQuesti.has(k)) continue;
        perOrderId.set(k, {
          id: o.id,
          numero: o.numero,
          gia: {
            costoConsegna: o.controllo?.costoConsegna ?? null,
            feeConsegna: o.controllo?.feeConsegna ?? null,
            primoMargine: o.controllo?.primoMargine ?? null,
            feeVendita: o.controllo?.feeVendita ?? null,
            margineFinale: o.controllo?.margineFinale ?? null,
            metodoIncasso: o.controllo?.metodoIncasso ?? null,
            commissioneIncassi: o.controllo?.commissioneIncassi ?? null,
          },
        });
      }
      if (soloQuesti && perOrderId.size >= soloQuesti.size) break;
      if (!body.ordini?.length || pagina >= (body.pagine ?? 1)) break;
      pagina++;
    }
    const ordiniClienteAggiornati = await this.aggiornaOrdineCliente(economia);

    // 2) Le consegne che portano un numero d'ordine conosciuto.
    const deliveries = await this.prisma.delivery.findMany({
      where: {
        deletedAt: null,
        realOrderNumber: { in: [...perOrderId.keys()] },
      },
      select: {
        code: true, realOrderNumber: true, status: true,
        valetSalary: true, valetAdditionalPrice: true,
        price: true, additionalPrice: true,
        partner: { select: { commissionPercent: true } },
        valet: { select: { hasVat: true, withholdingPercent: true } },
      },
    });

    // 3) Somma per ordine.
    type Conto = { costoConsegna: number; feeConsegna: number; consegne: number; senzaFee: number };
    const per = new Map<string, Conto>();
    for (const d of deliveries) {
      const k = d.realOrderNumber!;
      const c = per.get(k) ?? { costoConsegna: 0, feeConsegna: 0, consegne: 0, senzaFee: 0 };
      c.consegne++;
      // ⭐ 27/08 (deciso dall'utente): la paga di un valet SENZA P.IVA e' il
      // suo NETTO — sopra, Deluxy versa la ritenuta d'acconto: costo vero
      // della consegna, che a Orders va COMPRESO. Formula dalla ricevuta:
      // ritenuta = paga × (1 − % rimborso) × 25%. Con P.IVA niente da aggiungere.
      const paga = Math.max(0, (d.valetSalary ?? 0) + (d.valetAdditionalPrice ?? 0));
      const ritenuta = paga > 0 && d.valet && d.valet.hasVat === false
        ? paga * (1 - ((d.valet.withholdingPercent ?? 0) / 100)) * 0.25
        : 0;
      c.costoConsegna += paga + ritenuta;
      const prezzoPartner = (d.price ?? 0) + (d.additionalPrice ?? 0);
      const feePercent = d.partner?.commissionPercent ?? 0;
      if (feePercent > 0) c.feeConsegna += (feePercent / 100) * prezzoPartner;
      else c.senzaFee++;
      per.set(k, c);
    }

    // ⚠️ Mai sotto zero: su alcune consegne il minus della rettifica supera la
    // paga e il conto esce negativo. Orders lo rifiuta — giustamente: un costo
    // negativo direbbe che il valet paga noi. Stesso pavimento degli stipendi.
    const maiSottoZero = (n: number) => Math.max(0, Math.round(n * 100) / 100);

    // L'ECONOMIA DELLA VENDITA, con le stesse formule della pagina Finanza
    // (guadagno netto IVA, quota registrata, margine finale): si manda gia'
    // fatta, su decisione dell'utente del 26/08. Null dove l'ordine non e' una
    // vendita nostra: null in PATCH azzera, e un ordine uscito dall'ambito
    // (annullato, diventato corporate) non resta con numeri vecchi addosso.
    const economiaVendite = await this.finance.economiaVendite();
    const tondo = (n: number) => Math.round(n * 100) / 100;

    const voci = [...per.entries()].map(([orderId, c]) => {
      const eco = economiaVendite.get(orderId) ?? null;
      return {
        orderId,
        ordersId: perOrderId.get(orderId)!.id,
        numero: perOrderId.get(orderId)!.numero ?? null,
        consegne: c.consegne,
        costoConsegna: maiSottoZero(c.costoConsegna),
        feeConsegna: maiSottoZero(c.feeConsegna),
        primoMargine: eco ? tondo(eco.primoMargine) : null,
        feeVendita: eco ? maiSottoZero(eco.feeVendita) : null,
        margineFinale: eco ? tondo(eco.margineFinale) : null,
        metodoIncasso: eco ? (eco.metodoIncasso ?? null) : null,
        commissioneIncassi: eco ? maiSottoZero(eco.commissioneIncassi) : null,
        /// Quante consegne dell'ordine hanno un partner senza Fee% impostata: la
        /// fee di quelle vale 0, e dirlo evita di leggere un totale come completo.
        senzaFee: c.senzaFee,
        giaScritto: perOrderId.get(orderId)!.gia,
      };
    });

    const totali = {
      ordiniConosciutiDaOrders: perOrderId.size,
      ordiniConIngredienti: voci.length,
      consegneCollegate: deliveries.length,
      costoConsegna: Math.round(voci.reduce((s, v) => s + v.costoConsegna, 0) * 100) / 100,
      feeConsegna: Math.round(voci.reduce((s, v) => s + v.feeConsegna, 0) * 100) / 100,
      conFeeAZero: voci.filter((v) => v.feeConsegna === 0).length,
    };

    if (!opzioni.applica) {
      return { ok: true, simulazione: true, totali, ordiniClienteAggiornati, esempi: voci.slice(0, 10) };
    }

    let scritti = 0;
    let saltati = 0;
    const errori: { numero: string | null; messaggio: string }[] = [];
    for (const v of voci) {
      // Orders ha già questi numeri: rimandarli aggiungerebbe solo una riga
      // identica alla storia dell'ordine, ogni notte. Si scrive quel che cambia.
      if (
        v.giaScritto.costoConsegna === v.costoConsegna
        && v.giaScritto.feeConsegna === v.feeConsegna
        && v.giaScritto.primoMargine === v.primoMargine
        && v.giaScritto.feeVendita === v.feeVendita
        && v.giaScritto.margineFinale === v.margineFinale
        && (v.giaScritto.metodoIncasso ?? null) === (v.metodoIncasso ?? null)
        && v.giaScritto.commissioneIncassi === v.commissioneIncassi
      ) {
        saltati++;
        continue;
      }
      try {
        const res = await fetch(`${url}/api/v1/ordini/${v.ordersId}`, {
          method: 'PATCH',
          headers: { 'x-api-key': chiave, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            costoConsegna: v.costoConsegna,
            feeConsegna: v.feeConsegna,
            primoMargine: v.primoMargine,
            feeVendita: v.feeVendita,
            margineFinale: v.margineFinale,
            metodoIncasso: v.metodoIncasso,
            commissioneIncassi: v.commissioneIncassi,
          }),
        });
        if (!res.ok) {
          const t = await res.text().catch(() => '');
          errori.push({ numero: v.numero, messaggio: `HTTP ${res.status} ${t.slice(0, 120)}` });
          // ⚠️ 401/403 non e' un caso isolato: e' la chiave sbagliata, e
          // insistere per centinaia di ordini non la fa diventare giusta.
          if (res.status === 401 || res.status === 403) break;
          continue;
        }
        scritti++;
      } catch (err) {
        errori.push({ numero: v.numero, messaggio: (err as Error).message });
      }
    }
    this.logger.log(`Margini: ingredienti mandati a Orders per ${scritti} ordini (${saltati} già a posto)`);

    const esito = { ok: errori.length === 0, totali, scritti, saltati, ordiniClienteAggiornati, errori: errori.slice(0, 10) };
    // L'esito di una corsa notturna non deve vivere solo nel JSON che nessuno
    // apre: si deposita in AppSetting, dove un occhio (o un'altra query) lo
    // ritrova con data e conteggi.
    await this.prisma.appSetting.upsert({
      where: { key: 'marginiUltimaCorsa' },
      update: { value: JSON.stringify({ quando: new Date().toISOString(), ...esito }) },
      create: { key: 'marginiUltimaCorsa', value: JSON.stringify({ quando: new Date().toISOString(), ...esito }) },
    });
    return esito;
  }

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
    // ⚠️ Lo SKU che arriva da Shopify e' quasi sempre quello della VARIANTE, non
    // del prodotto. Cercandolo solo fra i prodotti, su 200 ordini veri ne
    // entravano 16: 129 finivano in «prodotto sconosciuto» pur essendo tutti
    // in catalogo. Le varianti con SKU sono 18.375, i prodotti 20.287: si
    // guardano entrambi, prima il prodotto e poi la variante.
    // L'indice porta ANCHE la variante: riconoscere «MQLSWA-2» come Cappelliera
    // e poi buttare via la taglia M faceva nascere vendite col prodotto base e
    // i prezzi sbagliati a valle (base 110, la M vale 215).
    const prodotti = new Map<string, { productId: string; variantId: string | null }>(
      (await this.prisma.product.findMany({ where: { NOT: { sku: null } }, select: { id: true, sku: true } }))
        .map((p) => [p.sku!.trim().toUpperCase(), { productId: p.id, variantId: null }]),
    );
    for (const v of await this.prisma.productVariant.findMany({
      where: { NOT: { sku: null } }, select: { id: true, sku: true, productId: true },
    })) {
      const k = v.sku!.trim().toUpperCase();
      if (!prodotti.has(k)) prodotti.set(k, { productId: v.productId, variantId: v.id });
    }

    const conteggio: Record<Esito, number> = {
      creata: 0, 'gia-presente': 0, 'riservato-al-cs': 0, 'senza-provincia': 0,
      'provincia-sconosciuta': 0, 'senza-sku': 0, 'prodotto-sconosciuto': 0, errore: 0,
    };
    const esempi: { ordine: string; esito: Esito; dettaglio?: string }[] = [];
    const daGestire: string[] = [];

    for (const o of ordini) {
      const etichetta = `${o.brand ?? ''} ${o.numero ?? o.id}`.trim();
      const codice = o.spedizione?.provincia?.trim().toUpperCase() ?? '';
      const sku = o.righe?.find((r) => r.sku)?.sku?.trim().toUpperCase() ?? '';

      let esito: Esito;
      let dettaglio: string | undefined;
      // IL GOVERNO DEL DECISORE (Standard §7.4, deciso dall'utente il 24/08):
      // l'automatico non scavalca mai il Customer Service. `smistamento =
      // "manuale"` = se lo tiene lui; `evasione = "fornitore_diretto"` = già
      // evaso per un'altra strada (assegnato in chat) — in entrambi i casi
      // questo ordine NON entra nello smistamento, e l'esito lo dice.
      if (o.smistamento === 'manuale' || o.evasione === 'fornitore_diretto') {
        esito = 'riservato-al-cs';
        dettaglio = o.smistamento === 'manuale' ? 'gestione manuale' : 'già assegnato in chat';
      }
      else if (!codice) { esito = 'senza-provincia'; }
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
            productId: prodotti.get(sku)!.productId,
            productVariantId: prodotti.get(sku)!.variantId ?? undefined,
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

  @Post('margini')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Manda a Orders costo consegna e fee: gli ingredienti del margine. Simula, salvo applica=true' })
  margini(@Body() body: { applica?: boolean; da?: string; limite?: number }) {
    return this.service.spingiMargini(body ?? {});
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

/**
 * La corsa NOTTURNA dei margini, invocata dal cron di Vercel (vercel.json).
 *
 * Vercel chiama questa rotta con `Authorization: Bearer <CRON_SECRET>` (lo fa
 * da solo, se la variabile d'ambiente esiste). ⚠️ Il controllo del segreto è la
 * PRIMA cosa che succede: nessun ramo può rispondere prima dell'identità
 * (trappola già pagata: «l'auth dopo lo smistamento»). Senza CRON_SECRET
 * configurato la rotta è chiusa per tutti, non aperta per tutti.
 */
@ApiTags('cron')
@Controller('cron')
export class CronMarginiController {
  constructor(
    private readonly service: OrdersSyncService,
    private readonly valets: ValetsService,
    private readonly ricorrenti: RecurringService_,
  ) {}

  @Get('margini')
  @Public() // fuori dal JWT utente: l'identità è il segreto del cron, verificato qui sotto
  @ApiOperation({ summary: 'Corsa notturna: margini a Orders, cache ordini, valet fermi da 90 giorni' })
  async margini(@Headers('authorization') authorization?: string) {
    const segreto = process.env.CRON_SECRET ?? '';
    if (!segreto || authorization !== `Bearer ${segreto}`) throw new UnauthorizedException();
    const margini = await this.service.spingiMargini({ applica: true, tutti: true });
    // La regola dei 90 giorni: un valet che non si collega passa inattivo.
    const valetFermi = await this.valets.disattivaFermi();
    // ⭐ 27/08: la corsa notturna genera anche le consegne dei SERVIZI
    // RICORRENTI di oggi (idempotente: la coppia servizio+data non si rigenera).
    const ricorrenti = await this.ricorrenti.genera().catch((e) => ({ ok: false, errore: (e as Error).message }));
    return { ...margini, valetFermi, ricorrenti };
  }
}

@Module({
  imports: [SalesModule, SettingsModule, ValetsModule, FinanceModule, RecurringModule],
  controllers: [OrdersSyncController, CronMarginiController],
  providers: [OrdersSyncService],
  exports: [OrdersSyncService],
})
export class OrdersSyncModule {}
