import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtUser, Roles } from '../common/decorators';
import { ProductType, Role, SaleStatus } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';

/** Un partner candidato allo smistamento, col motivo per cui e' in lista. */
/** `prezzo`/`sconto` arrivano SOLO da una riconciliazione accettata: la vendita nasce a quel prezzo. */
/**
 * ⭐ 05/09/2026: QUANDO va consegnato — il giorno, e la fascia chiesta dal
 * cliente se c'è. È questo che si confronta con gli orari del partner.
 */
interface FinestraConsegna {
  giorno: Date;
  /** «08:00», dalla fascia dell'ordine. Assente = non si sa l'ora. */
  dalle?: string;
  /** «12:00». Assente = non si sa l'ora. */
  alle?: string;
}

type Candidato = {
  partnerId: string;
  motivo: string;
  /**
   * ⭐ 04/09/2026 (regola utente): quanto deve incassare il PARTNER, quando
   * arriva da una riconciliazione accettata. L'importo al cliente non si
   * tocca: si ricalcola la quota Deluxy perché il partner prenda questa cifra.
   */
  prezzoPartner?: number;
};

/** Quel che serve allo smistamento per decidere: niente di piu'. */
type ProdottoDaSmistare = {
  id: string;
  type: string;
  partnerId: string | null;
  categoryId: string | null;
  visibleToOtherPartners: boolean;
};

/** Lo stato di un ordine come lo dice Orders (letto dal vivo, 04/09). */
type StatoOrdineOrders = {
  /**
   * ⭐ 04/09/2026 (regola utente): la SALUTE dell'ordine in Orders —
   * conforme | a_rischio | non_pagato | cancellato | nullo. Se non è
   * «conforme» la vendita NON si manda avanti: niente accettazione, niente
   * consegna, niente proposta a un partner. Resta in Vendite, e l'unica cosa
   * che si può fare è rifiutarla.
   */
  salute: string | null;
  stato: string | null; terminale: boolean | null;
  smistamento: string | null; evasione: string | null;
  fulfillmentStatus: string | null; consegnataIl: string | null; annullato: unknown;
};

@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * ⭐ 04/09/2026 (regola utente): IL REGISTRO DELLA VENDITA — ogni creazione,
   * cambio di stato, modifica o assegnazione lascia una riga con CHI l'ha
   * fatto (utente e ruolo). Best-effort: una riga che non si scrive non ferma
   * la vendita, ma finisce nel log del server.
   */
  async registra(
    saleId: string, type: string, message: string,
    user?: Pick<JwtUser, 'sub' | 'email' | 'role'> | null,
  ): Promise<void> {
    try {
      await this.prisma.saleLog.create({ data: {
        saleId, type, message,
        userId: user?.sub ?? null, userEmail: user?.email ?? null, userRole: (user?.role as string) ?? null,
      } });
    } catch (e) { console.error('registro-vendita:', (e as Error).message); }
  }

  async findAll(user: JwtUser) {
    const where =
      user.role === Role.PARTNER ? { partnerId: user.partnerId ?? '-' } : {};
    const vendite = await this.prisma.sale.findMany({
      where,
      include: {
        product: { select: { id: true, name: true, price: true, type: true } },
        partner: { select: { id: true, insegna: true } },
        province: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    // ⭐ 04/09 (regola utente): in tabella si vede anche lo STATO DELL'ORDINE
    // IN ORDERS (classificazione, evasione, smistamento, consegnato). Letto
    // dal vivo da Orders — nessuna copia (Standard §7) — con una cache di 2′
    // in memoria: la lista si aggiorna da sola ogni 30″ e Orders non va
    // interrogato a ogni giro. Best-effort: senza Orders la colonna resta vuota.
    const stati = await this.statiDaOrders(vendite);
    return vendite.map((v) => {
      const trovato = SalesService.chiaviOrdine(v.externalOrderId).map((k) => stati.get(k)).find(Boolean) ?? null;
      const conStato = { ...v, ordine: trovato };
      return user.role === Role.PARTNER ? SalesService.perPartner(conStato) : conStato;
    });
  }

  /**
   * ⭐ 04/09 (regola utente): al PARTNER niente dati personali (destinatario,
   * cliente) e niente prezzi pubblici. Vede SOLO il suo prezzo:
   * importo × (1 − sconto%) — lo sconto e' la quota Deluxy sulla categoria in
   * quella provincia, fotografata sulla vendita. Il registro gli arriva senza
   * le righe «modifica», che elencano campi con nomi e importi.
   * Si applica in findAll e findOne: un solo punto, cosi' la lista e il
   * dettaglio non possono raccontare due cose diverse.
   */
  private static perPartner<T extends { amount: number; discountPercent: number }>(v: T) {
    const {
      recipientFirstName: _n, recipientLastName: _c, recipientAddress: _i, recipientPhone: _t, customerId: _k,
      amount, discountPercent, ...resto
    } = v as T & Record<string, unknown>;
    const prodotto = (resto as { product?: Record<string, unknown> | null }).product;
    const logs = (resto as { logs?: Array<{ type: string }> }).logs;
    return {
      ...resto,
      amount: null,
      discountPercent: null,
      prezzoPartner: Math.round(amount * (1 - (discountPercent ?? 0) / 100) * 100) / 100,
      // ⚠️ Al partner niente listino E niente PRODUTTORE: il produttore è un
      // altro partner, e sapere chi fa il prodotto è la stessa informazione
      // che «Chi abbiamo usato?» tiene riservata all'ufficio.
      product: prodotto ? { ...prodotto, price: null, partner: null } : prodotto,
      ...(logs ? { logs: logs.filter((l) => l.type !== 'modifica') } : {}),
    };
  }

  /**
   * ⭐ 04/09 (regola utente): il LINK all'ordine su Shopify, per il dettaglio.
   * La base è configurabile in Impostazioni (`shopifyAdminUrl`) perché i
   * negozi sono più d'uno; di default il negozio storico. Lo costruisce il
   * SERVER e non finisce mai nella risposta del partner: da lì si vedrebbero
   * i dati del cliente che la maschera-partner toglie.
   */
  /** La salute dell'ordine, o null se Orders non risponde / non c'è ordine. */
  private async saluteOrdine(externalOrderId: string | null | undefined): Promise<string | null> {
    const ordine = await this.ordineDaOrders(externalOrderId);
    return typeof ordine?.salute === 'string' ? ordine.salute : (ordine?.salute?.chiave ?? null);
  }

  private async linkShopify(externalOrderId: string | null, brand?: string | null): Promise<string | null> {
    // ⚠️ Sull'ordine D2C `externalOrderId` è l'id di **Deluxy Orders** (un
    // cuid), NON quello di Shopify: verificato su tutte le 489 vendite con
    // riferimento, nessuna ha un `gid://`. Il numero vero ce l'ha Orders, nel
    // campo `orderId` (`gid://shopify/Order/N`). Prima si prova la strada
    // corta (se un domani l'id arrivasse già buono), poi si chiede a Orders.
    let id = SalesService.numeroShopify(externalOrderId);
    let marchio = (brand ?? '').trim();
    if (!id) {
      const ordine = await this.ordineDaOrders(externalOrderId);
      id = SalesService.numeroShopify(ordine?.orderId ?? null);
      marchio = marchio || String(ordine?.brand ?? '').trim();
    }
    if (!id) return null; // meglio nessun bottone che un link che non apre niente
    const s = await this.prisma.appSetting.findUnique({ where: { key: 'shopifyAdminUrl' } });
    const base = SalesService.baseShopify(s?.value, marchio);
    return base ? `${base}/orders/${id}` : null;
  }

  /**
   * ⭐ 04/09/2026 (regola utente): «se lo stato non è conforme l'ordine non
   * può essere mandato avanti». Qui si ferma: accettazione, consegna e
   * proposta a un partner. La vendita resta dov'è — anche quella di un
   * prodotto UNICO, che altrimenti sarebbe passata liscia.
   *
   * ⚠️ Se Orders non risponde NON si blocca: un servizio giù fermerebbe tutto
   * l'ufficio, e il rischio di un ordine non conforme accettato è lo stesso
   * che si correva prima di questa regola. Il silenzio si distingue dal «no».
   */
  private async assertOrdineConforme(externalOrderId: string | null | undefined) {
    const ordine = await this.ordineDaOrders(externalOrderId);
    const salute = typeof ordine?.salute === 'string' ? ordine.salute : (ordine?.salute?.chiave ?? null);
    if (salute && salute !== 'conforme') {
      throw new BadRequestException(
        `L'ordine in Orders non è conforme (${String(salute).replace(/_/g, ' ')}): non si può mandare avanti. Si può solo rifiutare.`,
      );
    }
  }

  /**
   * La base dell'admin per quel marchio. L'impostazione `shopifyAdminUrl`
   * accetta due forme: **un indirizzo solo** (vale per tutti) o un **JSON per
   * marchio** — es. {"deluxy.it": ".../store/deluxygifts", "*": ".../store/altro"}.
   * I negozi sono più d'uno e un link al negozio sbagliato apre una pagina
   * vuota: se il marchio non è in mappa e non c'è la voce "*", niente bottone.
   */
  private static baseShopify(valore: string | null | undefined, brand: string): string {
    const grezzo = (valore ?? '').trim() || process.env.SHOPIFY_ADMIN_URL || '';
    const pulisci = (v: string) => (v ?? '').trim().replace(/\/+$/, '');
    if (grezzo.startsWith('{')) {
      try {
        const mappa = JSON.parse(grezzo) as Record<string, string>;
        const chiave = Object.keys(mappa).find((k) => k.toLowerCase() === brand.toLowerCase());
        return pulisci(mappa[chiave ?? ''] ?? mappa['*'] ?? '');
      } catch {
        return '';
      }
    }
    return pulisci(grezzo) || 'https://admin.shopify.com/store/deluxygifts';
  }

  /**
   * La quota Deluxy che lascia al partner esattamente `daDare` su un importo
   * cliente `importo`.
   *
   * ⚠️ Se il patto col partner è più alto dell'importo che incassiamo, la
   * quota non può essere negativa: si mette a zero e il partner prende tutto
   * l'importo. Il caso esiste (un prodotto svenduto) e va visto, non nascosto:
   * la riconciliazione resta scritta col suo prezzo, e il conto lo fa la
   * Fatturazione sui numeri veri.
   */
  private static quotaPerDare(importo: number, daDare: number): number {
    if (!(importo > 0)) return 0;
    const quota = (1 - daDare / importo) * 100;
    if (!isFinite(quota) || quota <= 0) return 0;
    return Math.round(Math.min(quota, 100) * 100) / 100;
  }

  /** La coda numerica di «gid://shopify/Order/N» (o «N»): la chiave con cui Orders si trova. */
  private static numeroShopify(v?: string | null): string | null {
    const t = (v ?? '').trim();
    if (!t) return null;
    const coda = t.split('/').pop() ?? '';
    return /^\d+$/.test(coda) ? coda : null;
  }

  private statiOrdersCache: { quando: number; da: string; mappa: Map<string, StatoOrdineOrders> } | null = null;

  /**
   * Gli stati degli ordini in Orders, per numero Shopify, a pagine di 200 dal
   * primo giorno utile (la vendita più vecchia della lista, al massimo 120
   * giorni fa). Cache per istanza, 2 minuti.
   */
  /**
   * Le CHIAVI con cui una vendita si ritrova in Orders: l'id salvato sulla
   * vendita (che è l'id di **Deluxy Orders**) e, se mai fosse un gid Shopify,
   * la sua coda numerica.
   *
   * ⚠️ Difetto trovato il 04/09/2026 e riparato: la mappa era costruita SOLO
   * sul numero Shopify preso da `o.orderId`, mentre la vendita porta l'id di
   * Orders. Nessuna chiave combaciava e la colonna «Stato in Orders» era
   * vuota per TUTTI — sembrava che Orders non rispondesse, mentre rispondeva
   * benissimo ([[trappola-numero-non-e-identita]]).
   */
  private static chiaviOrdine(externalOrderId: string | null | undefined): string[] {
    const grezzo = (externalOrderId ?? '').trim();
    const numero = SalesService.numeroShopify(externalOrderId);
    return [grezzo, numero ?? ''].filter(Boolean);
  }

  private async statiDaOrders(vendite: { externalOrderId: string | null; createdAt: Date }[]): Promise<Map<string, StatoOrdineOrders>> {
    const conOrdine = vendite.filter((v) => SalesService.chiaviOrdine(v.externalOrderId).length);
    if (!conOrdine.length) return new Map();
    const limite = new Date(); limite.setDate(limite.getDate() - 120);
    const piuVecchia = conOrdine.reduce((m, v) => (v.createdAt < m ? v.createdAt : m), new Date());
    const da = (piuVecchia < limite ? limite : piuVecchia).toISOString().slice(0, 10);
    const adesso = Date.now();
    if (this.statiOrdersCache && this.statiOrdersCache.da <= da && adesso - this.statiOrdersCache.quando < 120_000) {
      return this.statiOrdersCache.mappa;
    }
    const cfg = await this.prisma.appSetting.findMany({ where: { key: { in: ['ordersUrl', 'ordersApiKey'] } } });
    const map = Object.fromEntries(cfg.map((r) => [r.key, r.value]));
    const url = (map['ordersUrl'] || process.env.ORDERS_URL || '').replace(/\/+$/, '');
    const chiave = map['ordersApiKey'] || process.env.ORDERS_API_KEY || '';
    const mappa = new Map<string, StatoOrdineOrders>();
    if (!url || !chiave) return mappa;
    try {
      for (let pagina = 1; pagina <= 25; pagina++) {
        const q = new URLSearchParams({ page: String(pagina), limit: '200', da, annullati: 'inclusi' });
        const res = await fetch(`${url}/api/v1/ordini?${q}`, { headers: { 'x-api-key': chiave } });
        if (!res.ok) break;
        const body = (await res.json()) as { ordini?: any[]; pagine?: number };
        for (const o of body.ordini ?? []) {
          const k = SalesService.numeroShopify(o.orderId);
          const idOrders = typeof o.id === 'string' ? o.id : null;
          if (!k && !idOrders) continue;
          const dati = {
            salute: typeof o.salute === 'string' ? o.salute : (o.salute?.chiave ?? null),
            stato: o.classificazione?.stato?.chiave ?? null,
            terminale: o.classificazione?.stato?.terminale ?? null,
            smistamento: o.smistamento ?? null,
            evasione: o.evasione ?? null,
            fulfillmentStatus: o.fulfillmentStatus ?? null,
            consegnataIl: o.consegnata?.il ?? null,
            annullato: o.annullato ?? o.cancelledAt ?? null,
          };
          // Due chiavi per lo stesso ordine: l'id di Orders (quello che la
          // vendita ha davvero) e il numero Shopify, per chi arrivasse col gid.
          if (idOrders) mappa.set(idOrders, dati);
          if (k) mappa.set(k, dati);
        }
        if (!(body.ordini ?? []).length || pagina >= (body.pagine ?? 1)) break;
      }
      this.statiOrdersCache = { quando: adesso, da, mappa };
    } catch (e) {
      console.error('stati-da-orders:', (e as Error).message);
    }
    return mappa;
  }

  /**
   * Crea una vendita e la smista, con le due regole dell'app reale
   * (manuale COME-FUNZIONA-APP-DELUXY.md, sezione 3.7):
   *
   *  - prodotto UNICO: al partner proprietario, se opera nella provincia ed e'
   *    aperto. Se il prodotto e' «visibile ad altri partner» valgono anche i
   *    partner collegati: e' il Corporate Service.
   *  - prodotto NON UNICO: primo partner APERTO della lista priorita' per
   *    provincia e categoria.
   *
   * Se non c'e' nessuno di aperto la vendita resta DA GESTIRE, e non si assegna
   * a un partner chiuso. Fino al 24/08/2026 il codice faceva
   * `open?.partner.id ?? candidates[0]?.partner.id`: mandava la vendita al primo
   * della lista anche a serranda abbassata, e il partner si trovava un ordine
   * che non poteva prendere.
   */
  async create(body: {
    productId: string;
    productVariantId?: string;
    provinceId: string;
    brand?: string;
    customerId?: string;
    source?: string;
    externalOrderId?: string;
    externalOrderNumber?: string;
    recipientFirstName?: string;
    recipientLastName?: string;
    recipientAddress?: string;
    recipientPhone?: string;
    deliveryDate?: string;
    serviceTypeId?: string;
  }) {
    const product = await this.prisma.product.findUnique({
      where: { id: body.productId },
    });
    if (!product) throw new NotFoundException('Prodotto non trovato');

    // La VARIANTE dell'ordine (es. la taglia M). Deve appartenere al prodotto:
    // una variante di un altro prodotto e' un errore del chiamante, non un
    // dettaglio da ignorare in silenzio.
    const variante = body.productVariantId
      ? await this.prisma.productVariant.findFirst({
          where: { id: body.productVariantId, productId: product.id },
        })
      : null;
    if (body.productVariantId && !variante) {
      throw new NotFoundException('Variante non trovata per questo prodotto');
    }

    // ⭐ 05/09/2026 (regola utente): la finestra è quella della CONSEGNA, non
    // l'istante in cui la vendita arriva. Il giorno è quello chiesto
    // dall'ordine; l'ora è la FASCIA che il cliente ha scelto al checkout
    // (8–12, 12–16, 16–20), che si chiede a Orders — la stessa che finirà su
    // `deliveryTimeFrom/To` della consegna.
    // ⚠️ Se l'ordine non ha una data si guarda OGGI come giorno, ma senza
    // nessuna ora: «adesso» è quando è arrivata la vendita, non quando si
    // consegna, e usarlo come orario è esattamente il difetto che si corregge.
    const ordineChiamante = await this.ordineDaOrders(body.externalOrderId);
    const fasciaOrdine = SalesService.fasciaInOrari(ordineChiamante?.consegna?.fascia);
    const finestra: FinestraConsegna = {
      giorno: body.deliveryDate ? new Date(body.deliveryDate) : new Date(),
      dalle: fasciaOrdine.dalle,
      alle: fasciaOrdine.alle,
    };
    const scelto = await this.scegliPartner(product, body.provinceId, finestra, []);
    // L'importo del cliente resta quello di listino (variante compresa).
    const importoCliente = variante?.price ?? product.price ?? 0;

    // Lo SCONTO si cristallizza QUI, alla nascita della vendita: e' la regola
    // CategoryDiscount (categoria del prodotto × provincia), gestita
    // dall'admin. Scriverlo sulla vendita — e non ricalcolarlo dopo — fa si'
    // che un cambio di listino non riscriva la storia: le vendite passate
    // restano ai patti del loro giorno. 0 = nessuna regola per quella coppia.
    const sconto = product.categoryId
      ? await this.prisma.categoryDiscount.findUnique({
          where: {
            categoryId_provinceId: {
              categoryId: product.categoryId,
              provinceId: body.provinceId,
            },
          },
          select: { discountPercent: true },
        })
      : null;

    return this.prisma.sale.create({
      data: {
        productId: product.id,
        // Fotografia della variante: id + nome, come per il prodotto.
        productVariantId: variante?.id ?? null,
        variantName: variante?.name ?? null,
        provinceId: body.provinceId,
        partnerId: scelto?.partnerId ?? null,
        assignmentReason: scelto?.motivo ?? null,
        customerId: body.customerId,
        brand: body.brand ?? 'DELUXY',
        // La Cappelliera base fa 110 ma la M ne fa 215: se c'e' la variante,
        // il valore della vendita e' il SUO listino, non quello del base.
        amount: importoCliente,
        // ⭐ 04/09 (regola utente): con una riconciliazione accettata la quota
        // si piega al patto col partner; senza, vale la regola di categoria.
        discountPercent: scelto?.prezzoPartner !== undefined
          ? SalesService.quotaPerDare(importoCliente, scelto.prezzoPartner)
          : sconto?.discountPercent ?? 0,
        status: scelto ? SaleStatus.PROPOSTA : SaleStatus.DA_GESTIRE,
        source: body.source ?? 'app',
        externalOrderId: body.externalOrderId,
        // Il numero Shopify (es. 2824): quello che un umano riconosce in pagina.
        externalOrderNumber: body.externalOrderNumber ?? null,
        recipientFirstName: body.recipientFirstName,
        recipientLastName: body.recipientLastName,
        recipientAddress: body.recipientAddress,
        recipientPhone: body.recipientPhone,
        deliveryDate: body.deliveryDate ? new Date(body.deliveryDate) : null,
        serviceTypeId: body.serviceTypeId,
      },
      include: {
        product: { select: { id: true, name: true } },
        partner: { select: { id: true, insegna: true } },
      },
    });
  }

  /**
   * Riceve un ordine da un sistema esterno (Deluxy Orders, Shopify) e lo smista.
   *
   * E' idempotente sulla coppia (sorgente, id ordine esterno): lo stesso ordine
   * rimandato due volte non genera due vendite. Un webhook che ritenta e' la
   * norma, non l'eccezione.
   */
  async ingest(body: {
    source: string;
    externalOrderId: string;
    externalOrderNumber?: string;
    provinceCode?: string;
    provinceId?: string;
    productId?: string;
    productVariantId?: string;
    productSku?: string;
    /** Titolo della riga d'ordine: per la vendita SENZA prodotto a catalogo. */
    productName?: string;
    /** Prezzo pagato dal cliente (riga d'ordine): senza prodotto non c'è un listino da cui prenderlo. */
    amount?: number;
    /** ⭐ 03/09 (ordini ESTERI): DA GESTIRE senza proposta automatica anche
     *  col prodotto a catalogo — all'estero non abbiamo partner. */
    senzaProposta?: boolean;
    brand?: string;
    customerId?: string;
    recipientFirstName?: string;
    recipientLastName?: string;
    recipientAddress?: string;
    recipientPhone?: string;
    deliveryDate?: string;
    serviceTypeId?: string;
  }) {
    if (!body?.source || !body?.externalOrderId) {
      throw new BadRequestException('Servono «source» e «externalOrderId».');
    }
    const gia = await this.prisma.sale.findFirst({
      where: { source: body.source, externalOrderId: body.externalOrderId },
      include: { partner: { select: { id: true, insegna: true } } },
    });
    if (gia) return { creata: false, motivo: 'ordine gia ricevuto', vendita: gia };

    // ⚠️ Lo SKU di un ordine e' quasi sempre quello della VARIANTE (es.
    // MQLSWA-2 = Cappelliera taglia M): se fra i prodotti non c'e', si cerca
    // fra le varianti e si tiene ANCHE la variante — perdere quale taglia e'
    // stata ordinata fa sbagliare tutti i prezzi a valle.
    let variantId = body.productVariantId ?? null;
    let prodotto = body.productId
      ? await this.prisma.product.findUnique({ where: { id: body.productId } })
      : body.productSku
        ? await this.prisma.product.findFirst({ where: { sku: body.productSku } })
        : null;
    if (!prodotto && body.productSku) {
      const variante = await this.prisma.productVariant.findFirst({
        where: { sku: body.productSku },
        include: { product: true },
      });
      if (variante) {
        prodotto = variante.product;
        variantId = variante.id;
      }
    }
    if (!prodotto) {
      // ⭐ 01/09 (regola utente «fai nascere la vendita»): un prodotto
      // personalizzato o uno SKU fuori catalogo NON buttano più l'ordine — la
      // vendita nasce SENZA aggancio a catalogo, DA GESTIRE, col titolo in
      // chiaro e lo SKU grezzo. Niente smistamento automatico: senza prodotto
      // non si conosce il mestiere, decide una persona. Prima il 18% degli
      // ordini (76 su 425 in 30 giorni) non entrava affatto.
      if (!body.productName && !body.productSku) {
        throw new NotFoundException('Prodotto non trovato (per id o SKU)');
      }
      const prov = body.provinceId
        ? await this.prisma.province.findUnique({ where: { id: body.provinceId } })
        : body.provinceCode
          ? await this.prisma.province.findFirst({ where: { code: body.provinceCode.toUpperCase() } })
          : null;
      if (!prov) throw new NotFoundException('Provincia non trovata (per id o codice)');
      const vendita = await this.prisma.sale.create({
        data: {
          productId: null,
          productName: body.productName ?? null,
          productSku: body.productSku ?? null,
          provinceId: prov.id,
          partnerId: null,
          assignmentReason: 'Senza prodotto a catalogo (SKU assente o sconosciuto): da gestire a mano.',
          customerId: body.customerId,
          brand: body.brand ?? 'DELUXY',
          amount: body.amount ?? 0,
          discountPercent: 0,
          status: SaleStatus.DA_GESTIRE,
          source: body.source ?? 'app',
          externalOrderId: body.externalOrderId,
          externalOrderNumber: body.externalOrderNumber ?? null,
          recipientFirstName: body.recipientFirstName,
          recipientLastName: body.recipientLastName,
          recipientAddress: body.recipientAddress,
          recipientPhone: body.recipientPhone,
          deliveryDate: body.deliveryDate ? new Date(body.deliveryDate) : null,
          serviceTypeId: body.serviceTypeId,
        },
        include: {
          product: { select: { id: true, name: true } },
          partner: { select: { id: true, insegna: true } },
        },
      });
      await this.registra(vendita.id, 'creata', `Vendita creata da ${body.source ?? 'app'}${body.externalOrderNumber ? ' (ordine #' + body.externalOrderNumber + ')' : ''} · stato ${vendita.status}${(vendita as any).partner?.insegna ? ' · proposta a ' + (vendita as any).partner.insegna : ''}`);
      return { creata: true, vendita };
    }

    const provincia = body.provinceId
      ? await this.prisma.province.findUnique({ where: { id: body.provinceId } })
      : body.provinceCode
        ? await this.prisma.province.findFirst({
            where: { code: body.provinceCode.toUpperCase() },
          })
        : null;
    if (!provincia) throw new NotFoundException('Provincia non trovata (per id o codice)');

    // ⭐ ESTERO (03/09, regola utente): prodotto agganciato ma NIENTE
    // smistamento automatico — la vendita nasce DA GESTIRE e decide una
    // persona (all'estero non abbiamo partner né liste di priorità).
    if (body.senzaProposta) {
      const vendita = await this.prisma.sale.create({
        data: {
          productId: prodotto.id,
          productVariantId: variantId,
          productName: prodotto.name ?? null,
          productSku: body.productSku ?? prodotto.sku ?? null,
          provinceId: provincia.id,
          partnerId: null,
          assignmentReason: 'Ordine estero: nessuno smistamento automatico, si gestisce a mano.',
          customerId: body.customerId,
          brand: body.brand ?? 'DELUXY',
          amount: body.amount ?? prodotto.price ?? 0,
          discountPercent: 0,
          status: SaleStatus.DA_GESTIRE,
          source: body.source ?? 'app',
          externalOrderId: body.externalOrderId,
          externalOrderNumber: body.externalOrderNumber ?? null,
          recipientFirstName: body.recipientFirstName,
          recipientLastName: body.recipientLastName,
          recipientAddress: body.recipientAddress,
          recipientPhone: body.recipientPhone,
          deliveryDate: body.deliveryDate ? new Date(body.deliveryDate) : null,
          serviceTypeId: body.serviceTypeId,
        },
        include: {
          product: { select: { id: true, name: true } },
          partner: { select: { id: true, insegna: true } },
        },
      });
      await this.registra(vendita.id, 'creata', `Vendita creata da ${body.source ?? 'app'}${body.externalOrderNumber ? ' (ordine #' + body.externalOrderNumber + ')' : ''} · stato ${vendita.status}${(vendita as any).partner?.insegna ? ' · proposta a ' + (vendita as any).partner.insegna : ''}`);
      return { creata: true, vendita };
    }

    const vendita = await this.create({
      ...body,
      productId: prodotto.id,
      productVariantId: variantId ?? undefined,
      provinceId: provincia.id,
    });
    await this.registra(vendita.id, 'creata', `Vendita creata da ${body.source ?? 'app'}${body.externalOrderNumber ? ' (ordine #' + body.externalOrderNumber + ')' : ''} · stato ${vendita.status}${(vendita as any).partner?.insegna ? ' · proposta a ' + (vendita as any).partner.insegna : ''}`);
    return { creata: true, vendita };
  }

  /** Il partner accetta: la vendita diventa sua e nasce la consegna. */
  async accetta(id: string, user: JwtUser) {
    const vendita = await this.prisma.sale.findUnique({
      where: { id },
      include: { product: true },
    });
    if (!vendita) throw new NotFoundException('Vendita non trovata');
    this.assertPuoRispondere(vendita, user);
    if (vendita.status !== SaleStatus.PROPOSTA) {
      throw new BadRequestException(
        `La vendita non e' in attesa di risposta (stato: ${vendita.status}).`,
      );
    }
    // ⭐ 04/09 (regola utente): un ordine non conforme non va avanti.
    await this.assertOrdineConforme(vendita.externalOrderId);
    // ⭐ 04/09 (regola utente): si accetta solo una vendita davvero andata a un
    // partner. Senza partner la consegna non saprebbe da chi ritirare.
    if (!vendita.partnerId) {
      throw new BadRequestException("La vendita non è andata a nessun partner: si inserisce dall'ufficio.");
    }

    const variante = vendita.productVariantId
      ? await this.prisma.productVariant.findUnique({ where: { id: vendita.productVariantId } })
      : null;
    const consegna = await this.creaConsegna(vendita, variante);
    const aggiornata = await this.prisma.sale.update({
      where: { id },
      data: { status: SaleStatus.ACCETTATA, deliveryId: consegna?.id ?? null, historyAt: new Date() },
      include: { partner: { select: { id: true, insegna: true } } },
    });
    await this.registra(id, 'stato', `Accettata ${user.role === Role.PARTNER ? 'dal partner ' + (aggiornata.partner?.insegna ?? '') : "dall'ufficio"}${consegna ? ' → nasce la consegna #' + (consegna as any).code : ' — consegna NON creata (dati mancanti)'}`, user);
    return {
      vendita: aggiornata,
      consegna,
      // Meglio dire che la consegna non e' nata, che lasciarla credere creata.
      avviso: consegna
        ? null
        : "Vendita accettata, ma la consegna non e' stata creata: mancano destinatario, indirizzo, data o servizio. Va inserita a mano.",
    };
  }

  /**
   * PORTA IN CONSEGNA DA UN'ALTRA APP (31/08/2026, canale app-to-app):
   * il Customer Service decide di portare la vendita in consegna, e la
   * piattaforma la porta in STORICO (accettata). Due modi:
   *  - senza deliveryId: si CREA la consegna dalla vendita (come l'accettazione
   *    del partner), se ci sono i dati (destinatario, indirizzo, data, servizio);
   *  - con deliveryId: la consegna esiste già (creata altrove) e si AGGANCIA.
   * Idempotente: se la vendita è già accettata con una consegna, non fa nulla.
   */
  async portaInConsegnaDaApp(source: string, externalOrderId: string, deliveryId?: string) {
    const vendita = await this.prisma.sale.findFirst({
      where: { source, externalOrderId }, include: { product: true },
    });
    if (!vendita) throw new NotFoundException(`Nessuna vendita ${source}/${externalOrderId}.`);
    if (vendita.status === SaleStatus.ACCETTATA && vendita.deliveryId) {
      return { giaInConsegna: true, venditaId: vendita.id, deliveryId: vendita.deliveryId };
    }
    let consegnaId = deliveryId ?? null;
    if (deliveryId) {
      const d = await this.prisma.delivery.findUnique({ where: { id: deliveryId }, select: { id: true } });
      if (!d) throw new BadRequestException('Consegna inesistente');
    } else {
      const variante = vendita.productVariantId
        ? await this.prisma.productVariant.findUnique({ where: { id: vendita.productVariantId } })
        : null;
      const consegna = await this.creaConsegna(vendita, variante);
      consegnaId = consegna?.id ?? null;
      if (!consegnaId) {
        throw new BadRequestException(
          'Non si è potuta creare la consegna: mancano destinatario, indirizzo, data o servizio. Passare un deliveryId di una consegna già creata.',
        );
      }
    }
    await this.prisma.sale.update({
      where: { id: vendita.id },
      data: {
        status: SaleStatus.ACCETTATA,
        historyAt: new Date(),
        deliveryId: consegnaId,
        partnerId: vendita.partnerId,
        assignmentReason: [vendita.assignmentReason, 'portata in consegna da Customer Service (31/08)']
          .filter(Boolean).join(' · '),
      },
    });
    await this.registra(vendita.id, 'stato', `Portata in consegna dal Customer Service (${source})${deliveryId ? ' · agganciata alla consegna esistente' : ' · consegna creata dalla vendita'}`);
    return { portataInConsegna: true, venditaId: vendita.id, deliveryId: consegnaId };
  }

  /** Dettaglio di una vendita: serve al prefill del form consegna (ufficio). */
  async findOne(id: string, user?: JwtUser) {
    const vendita = await this.prisma.sale.findUnique({
      where: { id },
      include: {
        // ⭐ 05/09/2026 (regola utente): nel pop-up si vede il PRODUTTORE del
        // prodotto (il partner che lo fa: è lui il produttore, non chi lo
        // vende) e si aprono le FOTO cliccando il nome.
        product: {
          select: {
            id: true, name: true, price: true, type: true, sku: true,
            imageUrl: true, images: true, line: true,
            partner: { select: { id: true, insegna: true } },
          },
        },
        partner: { select: { id: true, insegna: true } },
        province: true,
        // ⭐ 04/09: il pop-up di dettaglio mostra consegna collegata, servizio e REGISTRO.
        logs: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!vendita) throw new NotFoundException('Vendita non trovata');
    // La consegna collegata (Sale ha solo deliveryId, senza relazione Prisma).
    const delivery = vendita.deliveryId
      ? await this.prisma.delivery.findUnique({ where: { id: vendita.deliveryId }, select: { id: true, code: true, status: true, date: true } })
      : null;
    // Il PARTNER vede solo le vendite proposte a lui (o che ha rifiutato lui).
    if (user?.role === Role.PARTNER) {
      let rifiutati: string[] = [];
      try { rifiutati = JSON.parse(vendita.refusedPartnerIds ?? '[]'); } catch { rifiutati = []; }
      if (vendita.partnerId !== user.partnerId && !rifiutati.includes(user.partnerId ?? '-')) {
        throw new ForbiddenException("Questa vendita non e' proposta a te.");
      }
      // Al partner l'ufficio è «Ufficio Deluxy», non un'email di persona.
      const logs = vendita.logs.map((l) => ({
        ...l,
        userEmail: l.userRole && l.userRole !== Role.PARTNER ? 'Ufficio Deluxy' : l.userEmail,
        userId: null,
      }));
      const serviceType = vendita.serviceTypeId
        ? await this.prisma.serviceType.findUnique({ where: { id: vendita.serviceTypeId }, select: { id: true, name: true } })
        : null;
      // Anche al partner la SALUTE: se l'ordine non è conforme deve vedere
      // l'allarme e non un bottone «Accetta» che darebbe errore.
      const saluteP = await this.saluteOrdine(vendita.externalOrderId);
      return SalesService.perPartner({
        ...vendita, logs, serviceType, delivery, refusedPartnerIds: null, assignmentReason: null,
        ordine: saluteP ? { salute: saluteP } : null,
      });
    }
    const serviceType = vendita.serviceTypeId
      ? await this.prisma.serviceType.findUnique({ where: { id: vendita.serviceTypeId }, select: { id: true, name: true } })
      : null;
    // Una sola lettura di Orders per il pop-up: da lì escono sia il link
    // all'ordine sia la salute (che decide i bottoni).
    const ordineOrders = await this.ordineDaOrders(vendita.externalOrderId);
    const salute = typeof ordineOrders?.salute === 'string' ? ordineOrders.salute : (ordineOrders?.salute?.chiave ?? null);
    const idShopify = SalesService.numeroShopify(vendita.externalOrderId) ?? SalesService.numeroShopify(ordineOrders?.orderId ?? null);
    const baseAdmin = idShopify
      ? SalesService.baseShopify(
          (await this.prisma.appSetting.findUnique({ where: { key: 'shopifyAdminUrl' } }))?.value,
          vendita.brand || String(ordineOrders?.brand ?? ''),
        )
      : '';
    return {
      ...vendita, serviceType, delivery,
      shopifyUrl: baseAdmin && idShopify ? `${baseAdmin}/orders/${idShopify}` : null,
      ordine: salute ? { salute } : null,
    };
  }

  /**
   * DETTAGLIO ORDINE dietro la vendita (per precompilare la consegna, 31/08).
   *
   * La vendita salva l'essenziale per lo smistamento; il RESTO (mittente, TUTTE
   * le righe, il pagamento in contrassegno) vive nell'ordine originale di Deluxy
   * Orders. Qui lo si legge al volo — nessuna copia in casa (Standard §7) — e si
   * risolvono le righe agli id di piattaforma, pronte per il form.
   *
   * Best-effort: se Orders non è configurato o non risponde, `disponibile:false`
   * e il form usa solo quel che la vendita ha già.
   */
  async dettaglioOrdine(id: string): Promise<{
    disponibile: boolean;
    mittenteFirstName?: string; mittenteLastName?: string;
    contrassegno?: boolean;
    /** Fascia oraria chiesta dal cliente (attributo Shopify, es. «16-20»), già
     *  spezzata negli orari del form: dalle «16:00» alle «20:00». */
    consegnaDalle?: string; consegnaAlle?: string;
    /** Dedica/biglietto dell'ordine: va nella personalizzazione. */
    biglietto?: string;
    /** Note Shopify dell'ordine (testo libero del cliente). */
    note?: string;
    prodotti?: { productId: string | null; productVariantId: string | null; nome: string | null; quantita: number; sku: string | null }[];
  }> {
    const sale = await this.prisma.sale.findUnique({
      where: { id }, select: { externalOrderId: true },
    });
    if (!sale?.externalOrderId) return { disponibile: false };

    const ordine = await this.ordineDaOrders(sale.externalOrderId);
    if (!ordine) return { disponibile: false };

    // Mittente = chi ha ORDINATO (il committente del regalo), non il destinatario.
    // Si divide sull'ULTIMO spazio: «Maria Teresa Rossi» = nome «Maria Teresa».
    const nome = String(ordine?.mittente?.nome ?? ordine?.cliente?.nome ?? '').trim();
    const taglio = nome.lastIndexOf(' ');
    const mittenteFirstName = taglio > 0 ? nome.slice(0, taglio) : nome || undefined;
    const mittenteLastName = taglio > 0 ? nome.slice(taglio + 1) : undefined;

    // Contrassegno (pagamento alla consegna): la categoria di pagamento di
    // Orders sta in `classificazione.categoriaPagamento` (bonifico | carta |
    // contrassegno | altro); come rete, anche il nome del gateway.
    const categoria = String(ordine?.classificazione?.categoriaPagamento ?? '').toLowerCase();
    const gateway = String(ordine?.pagamento?.gateway ?? '').toLowerCase();
    const contrassegno = categoria === 'contrassegno' || /contrassegno|cash on delivery|\bcod\b/.test(gateway);

    // Tutte le righe dell'ordine, risolte a prodotto/variante di piattaforma via SKU.
    const righe: any[] = Array.isArray(ordine?.righe) ? ordine.righe : [];
    const prodotti: { productId: string | null; productVariantId: string | null; nome: string | null; quantita: number; sku: string | null }[] = [];
    for (const r of righe) {
      const sku = String(r?.sku ?? '').trim();
      let productId: string | null = null;
      let productVariantId: string | null = null;
      if (sku) {
        const v = await this.prisma.productVariant.findFirst({ where: { sku }, select: { id: true, productId: true } });
        if (v) { productId = v.productId; productVariantId = v.id; }
        else {
          const p = await this.prisma.product.findFirst({ where: { sku }, select: { id: true } });
          if (p) productId = p.id;
        }
      }
      prodotti.push({ productId, productVariantId, nome: r?.titolo ?? null, quantita: Number(r?.quantita) || 1, sku: sku || null });
    }

    // ⭐ FASCIA ORARIA DEL CLIENTE (regola utente 01/09: «la fascia oraria la
    // hai già nell'ordine»). Su Shopify è un attributo tipo «16-20» o «08/12»:
    // si spezza in dalle/alle per il form. Un formato non riconosciuto si
    // scarta — una fascia inventata è peggio di una mancante.
    const { dalle: consegnaDalle, alle: consegnaAlle } = SalesService.fasciaInOrari(ordine?.consegna?.fascia);
    // Biglietto e note del cliente: esistono già sull'ordine, il form non deve
    // farli riscrivere a mano (regola utente 01/09).
    // ⚠️ La nota Shopify NON sta al primo livello: sta in `shopify.note`
    // (misurato sull'ordine 12851: il biglietto del cliente era lì, e
    // `ordine.note` tornava sempre undefined — il form usciva senza nota).
    const biglietto = String(ordine?.biglietto ?? '').trim() || undefined;
    const note = String(ordine?.shopify?.note ?? ordine?.note ?? '').trim() || undefined;

    return {
      disponibile: true, mittenteFirstName, mittenteLastName, contrassegno,
      consegnaDalle, consegnaAlle, biglietto, note, prodotti,
    };
  }

  /** L'ordine dietro una vendita, letto da Deluxy Orders. Best-effort: `null`
   *  quando non c'è o Orders non risponde — chi chiama non inventa. */
  private async ordineDaOrders(externalOrderId: string | null | undefined): Promise<any | null> {
    const rif = (externalOrderId ?? '').trim();
    if (!rif) return null;
    const cfg = await this.prisma.appSetting.findMany({ where: { key: { in: ['ordersUrl', 'ordersApiKey'] } } });
    const map = Object.fromEntries(cfg.map((r) => [r.key, r.value]));
    const url = (map['ordersUrl'] || process.env.ORDERS_URL || '').replace(/\/+$/, '');
    const chiave = map['ordersApiKey'] || process.env.ORDERS_API_KEY || '';
    if (!url || !chiave) return null;
    try {
      const res = await fetch(`${url}/api/v1/ordini/${encodeURIComponent(rif)}?annullati=inclusi`, {
        headers: { 'x-api-key': chiave },
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  /** «16-20», «08/12», «16:30-20» → orari del form. Formato ignoto = niente:
   *  una fascia inventata è peggio di una mancante. */
  /**
   * ⭐ 05/09/2026 (regola utente): «devi confrontare l'ORARIO DI CONSEGNA del
   * prodotto con l'orario di apertura del partner, non con l'orario di arrivo
   * della vendita».
   *
   * La finestra in cui la consegna deve avvenire: il giorno, e la fascia
   * chiesta dal cliente sull'ordine (8–12, 12–16, 16–20). Senza fascia resta
   * il solo giorno, e allora la domanda giusta è «quel giorno è aperto?».
   */
  private static fasciaInOrari(fascia: unknown): { dalle?: string; alle?: string } {
    const raw = String(fascia ?? '').trim();
    const m = raw.match(/^(\d{1,2})(?:[:.](\d{2}))?\s*[-\/–]\s*(\d{1,2})(?:[:.](\d{2}))?$/);
    if (!m) return {};
    const ora = (h?: string, min?: string) => {
      if (!h) return undefined;
      const hh = Number(h);
      if (!Number.isFinite(hh) || hh > 24) return undefined;
      return `${String(hh === 24 ? 0 : hh).padStart(2, '0')}:${min ?? '00'}`;
    };
    return { dalle: ora(m[1], m[2]), alle: ora(m[3], m[4]) };
  }

  /**
   * L'ufficio PRENDE IN MANO la vendita (bottone «Inserisci», 31/08/2026):
   * ferma il giro automatico — se era proposta a un partner, la proposta
   * decade (accetta/rifiuta valgono solo su PROPOSTA) — e la consegna si
   * inserisce a mano dal form. La vendita resta «da gestire» finché la
   * consegna non nasce: chiuderla PRIMA direbbe il falso, e chi abbandona il
   * form a metà la ritroverebbe dove deve stare.
   */
  /**
   * ⭐ 04/09/2026 (regola utente): «CHI ABBIAMO USATO, E A QUANTO».
   *
   * Per una vendita ferma, lo storico REALE di quel prodotto in quella
   * provincia: le vendite ACCETTATE, raggruppate per partner, con quante
   * volte, i prezzi e l'ultima volta.
   *
   * ⚠️ Tre scelte che contano:
   *  - **niente finestra che taglia**: si legge TUTTO lo storico e le righe
   *    più vecchie di 12 mesi si marcano `vecchia` — un taglio silenzioso
   *    farebbe sparire l'unico precedente di un prodotto che gira poco
   *    ([[trappola-censimento-troncato]]);
   *  - **l'allargamento si dichiara**: se per quella coppia non c'è niente si
   *    guarda lo stesso prodotto nelle ALTRE province, poi la stessa categoria
   *    in QUELLA provincia, e la risposta dice quale dei tre sta leggendo
   *    ([[trappola-cercare-non-e-affermare]]);
   *  - **è roba d'ufficio**: nomi e prezzi di altri partner. Il controller la
   *    apre solo ad ADMIN e OPERATION, mai al partner.
   */
  async storicoPartner(id: string) {
    const vendita = await this.prisma.sale.findUnique({
      where: { id },
      select: {
        productId: true, provinceId: true, productName: true,
        product: { select: { name: true, categoryId: true, type: true } },
        province: { select: { code: true, name: true } },
      },
    });
    if (!vendita) throw new NotFoundException('Vendita non trovata');
    if (!vendita.productId) {
      return { base: 'nessuna' as const, regola: null, righe: [], prodotto: vendita.productName, provincia: vendita.province?.code ?? null };
    }

    const comune = { status: SaleStatus.ACCETTATA, partnerId: { not: null } };
    const select = {
      partnerId: true, amount: true, discountPercent: true, createdAt: true,
      externalOrderNumber: true, provinceId: true,
    };
    // 1) la coppia esatta; 2) lo stesso prodotto altrove; 3) la categoria qui.
    let base: 'coppia' | 'altre-province' | 'categoria' | 'nessuna' = 'coppia';
    let vendite = await this.prisma.sale.findMany({
      where: { ...comune, productId: vendita.productId, provinceId: vendita.provinceId },
      select, orderBy: { createdAt: 'desc' },
    });
    if (!vendite.length) {
      base = 'altre-province';
      vendite = await this.prisma.sale.findMany({
        where: { ...comune, productId: vendita.productId, provinceId: { not: vendita.provinceId } },
        select, orderBy: { createdAt: 'desc' },
      });
    }
    if (!vendite.length && vendita.product?.categoryId) {
      base = 'categoria';
      vendite = await this.prisma.sale.findMany({
        where: { ...comune, provinceId: vendita.provinceId, product: { categoryId: vendita.product.categoryId } },
        select, orderBy: { createdAt: 'desc' },
      });
    }
    if (!vendite.length) base = 'nessuna';

    const perPartner = new Map<string, typeof vendite>();
    for (const v of vendite) perPartner.set(v.partnerId!, [...(perPartner.get(v.partnerId!) ?? []), v]);

    const [partner, province, regola, esclusi] = await Promise.all([
      this.prisma.partner.findMany({
        where: { id: { in: [...perPartner.keys()] } },
        select: { id: true, insegna: true, active: true, provinces: { select: { provinceId: true } } },
      }),
      this.prisma.province.findMany({
        where: { id: { in: [...new Set(vendite.map((v) => v.provinceId))] } },
        select: { id: true, code: true },
      }),
      this.prisma.productReconciliation.findFirst({
        where: { productId: vendita.productId, provinceId: vendita.provinceId },
        select: { partnerId: true, price: true, discountPercent: true, status: true },
      }),
      this.prisma.appSetting.findUnique({ where: { key: 'riconciliazioniPartnerEsclusi' } }),
    ]);
    const perId = new Map(partner.map((p) => [p.id, p]));
    const sigla = new Map(province.map((p) => [p.id, p.code]));
    const listaEsclusi = (esclusi?.value ?? '').split(',').map((t) => t.trim()).filter(Boolean);
    const dodiciMesiFa = new Date();
    dodiciMesiFa.setMonth(dodiciMesiFa.getMonth() - 12);

    const arrotonda = (n: number) => Math.round(n * 100) / 100;
    const moda = (valori: number[]) => {
      const conta = new Map<number, number>();
      for (const v of valori) conta.set(arrotonda(v), (conta.get(arrotonda(v)) ?? 0) + 1);
      let migliore = arrotonda(valori[0] ?? 0);
      let max = 0;
      for (const [v, n] of conta) if (n > max || (n === max && v > migliore)) { max = n; migliore = v; }
      return migliore;
    };

    const righe = [...perPartner.entries()].map(([partnerId, lista]) => {
      const p = perId.get(partnerId);
      const importi = lista.map((v) => v.amount);
      const prezzoModa = moda(importi);
      const scontoModa = moda(lista.map((v) => v.discountPercent));
      const ultima = lista[0]; // già ordinate dal più recente
      return {
        partnerId,
        insegna: p?.insegna ?? '(partner sconosciuto)',
        attivo: p?.active ?? false,
        operaInProvincia: (p?.provinces ?? []).some((x) => x.provinceId === vendita.provinceId),
        escluso: listaEsclusi.includes(partnerId),
        vendite: lista.length,
        prezzoMin: arrotonda(Math.min(...importi)),
        prezzoMax: arrotonda(Math.max(...importi)),
        prezzoModa,
        scontoModa,
        nettoModa: arrotonda(prezzoModa * (1 - scontoModa / 100)),
        ultimaData: ultima.createdAt,
        ultimoOrdine: ultima.externalOrderNumber,
        ultimaProvincia: sigla.get(ultima.provinceId) ?? null,
        // Più vecchia di un anno: si mostra, ma segnalata. I prezzi invecchiano.
        vecchia: ultima.createdAt < dodiciMesiFa,
      };
    }).sort((x, y) => y.vendite - x.vendite || y.ultimaData.getTime() - x.ultimaData.getTime());

    return {
      base,
      prodotto: vendita.product?.name ?? vendita.productName,
      provincia: vendita.province?.code ?? null,
      tipoProdotto: vendita.product?.type ?? null,
      considerate: vendite.length,
      regola: regola ? { ...regola, insegna: perId.get(regola.partnerId)?.insegna ?? (await this.prisma.partner.findUnique({ where: { id: regola.partnerId }, select: { insegna: true } }))?.insegna ?? null } : null,
      righe,
    };
  }

  /**
   * ⭐ 04/09/2026 (regola utente): «sotto indirizzo, un bottone RICONCILIA che
   * cerca per quell'indirizzo possibili consegne».
   *
   * Le consegne di tipo VENDITA fatte allo stesso indirizzo: sono quelle nate
   * a mano, che con ogni probabilità sono già questa vendita, entrata due
   * volte. Si confronta l'indirizzo NORMALIZZATO (minuscole, senza
   * punteggiatura, senza le parole di via/piazza) e si tengono le consegne in
   * una finestra di ±10 giorni dalla data della vendita quando c'è.
   *
   * ⚠️ Si PROPONE soltanto: nessuna corrispondenza automatica. Due consegne
   * allo stesso indirizzo in giorni diversi sono cose diverse, e il pop-up le
   * mostra tutte perché a decidere sia una persona.
   */
  async consegneAllIndirizzo(id: string) {
    const vendita = await this.prisma.sale.findUnique({
      where: { id },
      select: { recipientAddress: true, deliveryDate: true, provinceId: true, deliveryId: true, externalOrderNumber: true, externalOrderId: true },
    });
    if (!vendita) throw new NotFoundException('Vendita non trovata');
    const chiave = SalesService.chiaveIndirizzo(vendita.recipientAddress);

    // ⭐ 05/09/2026 — PRIMA IL DDT. Sul DDT della consegna si scrive il NUMERO
    // D'ORDINE: e' il legame piu' forte che abbiamo, molto piu' dell'indirizzo,
    // e non dipende da come Shopify ha scritto la via. Nel caso 12847 la
    // ricerca per indirizzo trovava zero e le due consegne gia' fatte
    // (#100788 e #100789, stesso giorno, stesso indirizzo, DDT 12847)
    // restavano invisibili. Si cerca in OGNI stato, storico compreso, e senza
    // vincolo di servizio: un DDT uguale e' gia' una risposta.
    // Il DDT porta il NUMERO d'ordine; per le consegne piu' vecchie puo'
    // portare l'id di Orders. Si cercano tutti e due: costa niente e copre le
    // due popolazioni senza chiedere a chi guarda di sapere quale sia quale.
    const rifDdt = [vendita.externalOrderNumber, vendita.externalOrderId]
      .map((x) => (x ?? '').trim())
      .filter(Boolean);
    const perDdt = rifDdt.length
      ? await this.prisma.delivery.findMany({
          where: { deletedAt: null, ddtNumber: { in: rifDdt } },
          select: {
            id: true, code: true, date: true, status: true, recipientAddress: true,
            ddtNumber: true, price: true,
            partner: { select: { insegna: true } },
            serviceType: { select: { name: true } },
          },
          orderBy: { date: 'desc' },
          take: 50,
        })
      : [];

    if (!chiave && !perDdt.length) {
      return { indirizzo: vendita.recipientAddress, consegne: [], motivo: 'senza-indirizzo' as const };
    }

    const quando = vendita.deliveryDate ?? null;
    const da = quando ? new Date(quando.getTime() - 10 * 86400000) : null;
    const a = quando ? new Date(quando.getTime() + 10 * 86400000) : null;
    const candidate = chiave ? await this.prisma.delivery.findMany({
      where: {
        deletedAt: null,
        provinceId: vendita.provinceId,
        ...(da && a ? { date: { gte: da, lte: a } } : {}),
        // Solo i servizi di VENDITA, come chiesto.
        serviceType: { name: { contains: 'vendita', mode: 'insensitive' } },
      },
      select: {
        id: true, code: true, date: true, status: true, recipientAddress: true,
        ddtNumber: true, price: true,
        partner: { select: { insegna: true } },
        serviceType: { select: { name: true } },
      },
      orderBy: { date: 'desc' },
      take: 200,
    }) : [];
    const perIndirizzo = candidate.filter((d) => SalesService.chiaveIndirizzo(d.recipientAddress) === chiave);

    // Le due strade si uniscono senza doppioni; il DDT viene prima perche' e'
    // il segnale piu' forte, e OGNI riga dice da che cosa e' stata trovata:
    // un elenco che non spiega perche' e' li' non si puo' verificare.
    const visti = new Set<string>();
    const consegne = [
      ...perDdt.map((d) => ({ d, motivo: 'ddt' as const })),
      ...perIndirizzo.map((d) => ({ d, motivo: 'indirizzo' as const })),
    ]
      .filter(({ d }) => (visti.has(d.id) ? false : (visti.add(d.id), true)))
      .map(({ d, motivo }) => ({
        id: d.id, code: d.code, date: d.date, status: d.status,
        indirizzo: d.recipientAddress, ddt: d.ddtNumber, prezzo: d.price,
        partner: d.partner?.insegna ?? null, servizio: d.serviceType?.name ?? null,
        motivo,
      }));
    return { indirizzo: vendita.recipientAddress, giaCollegata: vendita.deliveryId, consegne };
  }

  /**
   * L'indirizzo ridotto all'osso per confrontarlo: minuscole, via/piazza e
   * punteggiatura via, spazi normalizzati. «Via Roberto Rossellini, 51 -
   * 00137 Roma» e «via roberto rossellini 51, 00137, Roma RM» diventano la
   * stessa chiave. Non è geocodifica: è un confronto onesto fra stringhe, e
   * infatti serve a PROPORRE, non a decidere.
   */
  private static chiaveIndirizzo(indirizzo: string | null | undefined): string | null {
    let grezzo = (indirizzo ?? '').trim().toLowerCase();
    if (!grezzo) return null;
    // ⚠️ 05/09/2026 — CASO 12847. Sull'ordine di Shopify il TESTO DEL BIGLIETTO
    // finisce dentro l'indirizzo: «Via Principe Eugenio 12, Testo biglietto:
    // Caro Victor, un brindisi alla nuova vita lavorativa!… , 20155, Milano,
    // MI, IT». Con la dedica dentro, la chiave non somigliava piu' a niente e
    // il confronto con la consegna vera («Via Principe Eugenio, 12, 20155
    // Milano MI») dava ZERO — mentre le consegne c'erano, due, con lo stesso
    // DDT. Il biglietto si taglia via: e' un messaggio, non un indirizzo.
    // ⚠️ Si taglia FINO AL CAP, non fino in fondo: dopo la dedica torna la
    // parte vera dell'indirizzo (CAP, citta', provincia), e buttarla via
    // farebbe fallire il confronto lo stesso, solo per un altro motivo.
    grezzo = grezzo.replace(/(testo\s*)?bigliett[oi]\s*:[\s\S]*?(?=\b\d{5}\b)/, ' ');
    // Se dopo la dedica non c'era nessun CAP, allora la coda e' tutta dedica.
    grezzo = grezzo.replace(/(testo\s*)?bigliett[oi]\s*:[\s\S]*$/, ' ').trim();
    const pulito = grezzo
      .replace(/\b(via|viale|piazza|piazzale|corso|largo|vicolo|strada|localita|località|str\.|v\.le|p\.zza)\b/g, ' ')
      .replace(/\b(italia|italy)\b/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      // La sigla del paese in coda c'e' su una fonte e non sull'altra
      // (Shopify la scrive, la consegna no): non e' una differenza vera.
      .replace(/\s+(it|ita)$/, '');
    return pulito.length >= 6 ? pulito : null;
  }

  /**
   * ⭐ 04/09/2026 (regola utente): la vendita è la stessa cosa di una consegna
   * già fatta. Allora: la vendita va in STORICO (accettata, collegata a quella
   * consegna) e la consegna prende NEL DDT il riferimento della vendita.
   *
   * ⚠️ Non si crea niente e non si tocca il prezzo: si dichiara che le due
   * righe sono lo stesso fatto. Il DDT non si sovrascrive se c'è già: si
   * aggiunge, perché quel numero è la prova di come è viaggiata la merce.
   */
  async riconciliaConConsegna(id: string, deliveryId: string, user: JwtUser) {
    const vendita = await this.prisma.sale.findUnique({
      where: { id },
      select: { id: true, status: true, deliveryId: true, externalOrderNumber: true, externalOrderId: true, brand: true, partnerId: true },
    });
    if (!vendita) throw new NotFoundException('Vendita non trovata');
    if (vendita.deliveryId) throw new BadRequestException('Questa vendita è già collegata a una consegna.');
    const consegna = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
      select: { id: true, code: true, ddtNumber: true, ddtBrand: true, partnerId: true },
    });
    if (!consegna) throw new NotFoundException('Consegna non trovata');
    const giaPresa = await this.prisma.sale.findFirst({ where: { deliveryId, NOT: { id } }, select: { externalOrderNumber: true } });
    if (giaPresa) {
      throw new BadRequestException(`Quella consegna è già di un'altra vendita (#${giaPresa.externalOrderNumber ?? '—'}).`);
    }

    // Il riferimento della vendita nel DDT: il numero d'ordine, che è quello
    // che una persona riconosce; se manca, l'id esterno.
    const riferimento = (vendita.externalOrderNumber ?? vendita.externalOrderId ?? vendita.id).trim();
    const ddt = consegna.ddtNumber?.trim();
    const nuovoDdt = ddt
      ? (ddt.split('/').map((t) => t.trim()).includes(riferimento) ? ddt : `${ddt} / ${riferimento}`)
      : riferimento;

    const [aggiornata] = await this.prisma.$transaction([
      this.prisma.sale.update({
        where: { id },
        data: {
          deliveryId,
          status: SaleStatus.ACCETTATA,
          historyAt: new Date(),
          partnerId: vendita.partnerId ?? consegna.partnerId ?? null,
          assignmentReason: `riconciliata con la consegna #${consegna.code} (stesso indirizzo)`,
        },
        include: { partner: { select: { id: true, insegna: true } }, province: true },
      }),
      this.prisma.delivery.update({
        where: { id: deliveryId },
        data: {
          ddtNumber: nuovoDdt,
          ddtBrand: consegna.ddtBrand ?? vendita.brand ?? null,
          logs: { create: { type: 'note', userId: user.sub ?? null,
            message: `Riconciliata con la vendita ${riferimento}: riferimento aggiunto al DDT` } },
        },
      }),
    ]);
    await this.registra(id, 'stato', `Riconciliata con la consegna #${consegna.code}: vendita in storico, riferimento ${riferimento} nel DDT`, user);
    return aggiornata;
  }

  /**
   * ⭐ 04/09/2026 (regola utente): l'ufficio PROPONE la vendita a un partner
   * scelto a mano (di solito dallo storico qui sopra). Non è un'accettazione:
   * la palla resta al partner, che può rifiutare come sempre.
   */
  async proponiAPartner(id: string, partnerId: string, user: JwtUser) {
    const vendita = await this.prisma.sale.findUnique({ where: { id }, select: { status: true, partnerId: true, externalOrderId: true } });
    if (!vendita) throw new NotFoundException('Vendita non trovata');
    if (![SaleStatus.PROPOSTA, SaleStatus.DA_GESTIRE].includes(vendita.status as SaleStatus)) {
      throw new BadRequestException(`La vendita non è aperta (stato: ${vendita.status}).`);
    }
    await this.assertOrdineConforme(vendita.externalOrderId);
    const partner = await this.prisma.partner.findUnique({ where: { id: partnerId }, select: { insegna: true, active: true } });
    if (!partner) throw new NotFoundException('Partner non trovato');
    if (!partner.active) throw new BadRequestException('Il partner non è attivo.');

    const aggiornata = await this.prisma.sale.update({
      where: { id },
      data: {
        partnerId,
        status: SaleStatus.PROPOSTA,
        historyAt: null,
        assignmentReason: "scelto a mano dall'ufficio sullo storico",
      },
      include: { product: { select: { id: true, name: true } }, partner: { select: { id: true, insegna: true } }, province: true },
    });
    await this.registra(id, 'stato', `Proposta a ${partner.insegna} dall'ufficio (scelta a mano sullo storico)`, user);
    return aggiornata;
  }

  async prendiInMano(id: string, user?: JwtUser) {
    const vendita = await this.prisma.sale.findUnique({ where: { id } });
    if (!vendita) throw new NotFoundException('Vendita non trovata');
    if (![SaleStatus.PROPOSTA, SaleStatus.DA_GESTIRE].includes(vendita.status as SaleStatus)) {
      throw new BadRequestException(`La vendita non è aperta (stato: ${vendita.status}).`);
    }
    const presa = await this.prisma.sale.update({
      where: { id },
      data: {
        status: SaleStatus.DA_GESTIRE,
        historyAt: null,
        // Idempotente: il secondo click non deve accodare il motivo un'altra
        // volta (visto in pagina il 31/08: «presa in mano · presa in mano»).
        assignmentReason: vendita.assignmentReason?.includes('inserimento manuale')
          ? vendita.assignmentReason
          : [vendita.assignmentReason, "presa in mano dall'ufficio: inserimento manuale"]
              .filter(Boolean).join(' · '),
      },
      include: { product: { select: { id: true, name: true } }, province: true },
    });
    await this.registra(id, 'stato', "Presa in mano dall'ufficio: inserimento manuale (da gestire)", user);
    return presa;
  }

  /**
   * Chiude il giro dell'inserimento manuale: la consegna è nata dal form,
   * la vendita la aggancia e passa in storico (accettata). Il partner della
   * vendita diventa quello della CONSEGNA: è lì che l'ufficio ha deciso.
   */
  async collegaConsegna(id: string, deliveryId: string, user?: JwtUser) {
    const vendita = await this.prisma.sale.findUnique({ where: { id } });
    if (!vendita) throw new NotFoundException('Vendita non trovata');
    if (!deliveryId) throw new BadRequestException('deliveryId obbligatorio');
    const consegna = await this.prisma.delivery.findUnique({
      where: { id: deliveryId }, select: { id: true, partnerId: true, code: true },
    });
    if (!consegna) throw new BadRequestException('Consegna inesistente');
    if (vendita.deliveryId && vendita.deliveryId !== deliveryId) {
      throw new BadRequestException('La vendita è già collegata a un\'altra consegna');
    }
    const agg = await this.prisma.sale.update({
      where: { id },
      data: {
        status: SaleStatus.ACCETTATA,
        historyAt: new Date(),
        deliveryId,
        partnerId: consegna.partnerId ?? vendita.partnerId,
      },
    });
    await this.registra(id, 'stato', `Consegna #${consegna.code} inserita dall'ufficio e collegata: vendita accettata (storico)`, user);
    return agg;
  }

  /**
   * ⭐ 03/09 (regola utente): l'ufficio MODIFICA la vendita dal bottone in
   * lista. Campi a lista chiusa — i DATI della vendita, non il suo giro:
   * lo stato ha le sue azioni (accetta/rifiuta/inserisci), l'aggancio alla
   * consegna il suo endpoint.
   */
  async modifica(id: string, body: Record<string, unknown>, user?: JwtUser) {
    const vendita = await this.prisma.sale.findUnique({ where: { id } });
    if (!vendita) throw new NotFoundException('Vendita non trovata');
    const data: Record<string, unknown> = {};
    for (const campo of ['productName', 'variantName', 'brand', 'recipientFirstName', 'recipientLastName', 'recipientAddress', 'recipientPhone'] as const) {
      if (typeof body[campo] === 'string') data[campo] = (body[campo] as string).trim() || null;
    }
    if (body.amount !== undefined) {
      const n = Number(body.amount);
      if (!Number.isFinite(n) || n < 0) throw new BadRequestException('Importo non valido');
      data.amount = Math.round(n * 100) / 100;
    }
    if (body.deliveryDate !== undefined) {
      data.deliveryDate = body.deliveryDate ? new Date(String(body.deliveryDate)) : null;
    }
    if (typeof body.provinceId === 'string' && body.provinceId) {
      const prov = await this.prisma.province.findUnique({ where: { id: body.provinceId }, select: { id: true } });
      if (!prov) throw new BadRequestException('Provincia inesistente');
      data.provinceId = prov.id;
    }
    if (!Object.keys(data).length) throw new BadRequestException('Niente da modificare');
    const agg = await this.prisma.sale.update({ where: { id }, data });
    // Il registro dice COSA è cambiato, prima → dopo, campo per campo.
    const mostra = (v: unknown) => v instanceof Date ? v.toISOString().slice(0, 10) : (v == null || v === '' ? '—' : String(v));
    const cambi = Object.keys(data)
      .filter((k) => mostra((vendita as any)[k]) !== mostra(data[k]))
      .map((k) => `${k}: ${mostra((vendita as any)[k])} → ${mostra(data[k])}`);
    if (cambi.length) await this.registra(id, 'modifica', `Modificata dall'ufficio · ${cambi.join(' · ')}`, user);
    return agg;
  }

  /**
   * Il partner rifiuta: la vendita passa al prossimo della lista, e chi ha
   * rifiutato non la rivede piu'. Se non resta nessuno torna «da gestire».
   */
  /**
   * ⭐ 04/09/2026 (regola utente) — il RIFIUTO ha due esiti diversi:
   *  - il PARTNER rifiuta → la vendita NON gira più al prossimo partner: torna
   *    all'UFFICIO da inserire (da gestire) e resta in Vendite;
   *  - ADMIN/OPERATION rifiutano → la vendita chiude in STORICO (non accettata).
   * In entrambi i casi una riga nel registro dice chi e perché.
   */
  async rifiuta(id: string, user: JwtUser) {
    const vendita = await this.prisma.sale.findUnique({
      where: { id },
      include: { partner: { select: { id: true, insegna: true } } },
    });
    if (!vendita) throw new NotFoundException('Vendita non trovata');
    this.assertPuoRispondere(vendita, user);
    if (![SaleStatus.PROPOSTA, SaleStatus.DA_GESTIRE].includes(vendita.status as SaleStatus)) {
      throw new BadRequestException(`La vendita non è aperta (stato: ${vendita.status}).`);
    }

    let rifiutati: string[] = [];
    try { rifiutati = JSON.parse(vendita.refusedPartnerIds ?? '[]'); } catch { rifiutati = []; }
    if (vendita.partnerId && !rifiutati.includes(vendita.partnerId)) rifiutati.push(vendita.partnerId);

    if (user.role === Role.PARTNER) {
      const nome = vendita.partner?.insegna ?? 'partner';
      const agg = await this.prisma.sale.update({
        where: { id },
        data: {
          partnerId: null,
          status: SaleStatus.DA_GESTIRE,
          historyAt: null,
          refusedPartnerIds: JSON.stringify(rifiutati),
          assignmentReason: `rifiutata da ${nome}: da inserire dall'ufficio`,
        },
        include: { partner: { select: { id: true, insegna: true } } },
      });
      await this.registra(id, 'stato', `Rifiutata dal partner ${nome}: torna all'ufficio da inserire (da gestire)`, user);
      return agg;
    }

    const agg = await this.prisma.sale.update({
      where: { id },
      data: {
        status: SaleStatus.NON_ACCETTATA,
        historyAt: new Date(),
        refusedPartnerIds: JSON.stringify(rifiutati),
        assignmentReason: [vendita.assignmentReason, "rifiutata dall'ufficio"].filter(Boolean).join(' · '),
      },
      include: { partner: { select: { id: true, insegna: true } } },
    });
    await this.registra(id, 'stato', "Rifiutata dall'ufficio: in storico come non accettata", user);
    return agg;
  }

  private assertPuoRispondere(vendita: { partnerId: string | null }, user: JwtUser) {
    if (user.role === Role.PARTNER && user.partnerId !== vendita.partnerId) {
      throw new ForbiddenException("Questa vendita non e' proposta a te.");
    }
  }

  /**
   * RISMISTA LE VENDITE RIMASTE SENZA PARTNER (05/09/2026, regola utente:
   * «sistema allora tu»).
   *
   * Lo smistamento gira UNA VOLTA, alla nascita della vendita. Quando la
   * regola dell'orario era sbagliata — si confrontava l'ora di ARRIVO della
   * vendita invece della FASCIA DI CONSEGNA — le vendite che ne uscivano senza
   * partner restavano ferme per sempre: nessuno le riprovava. Questo metodo le
   * ripassa con la regola giusta, usando **lo stesso codice** dello
   * smistamento normale (`scegliPartner`), non una copia che domani diverge.
   *
   * ⚠️ Si salta chi non deve essere toccato, e si dice perche':
   *  - gli ordini ESTERI (si gestiscono a mano per decisione dell'utente);
   *  - quelle PRESE IN MANO dall'ufficio (qualcuno ci sta gia' lavorando);
   *  - gli ordini NON CONFORMI in Orders (un ordine non conforme non va
   *    avanti: proporlo a un partner e' esattamente «andare avanti»);
   *  - quelle senza prodotto o senza provincia, che non si possono smistare.
   *
   * ⚠️ La QUOTA non si riscrive, tranne quando il partner arriva da una
   * riconciliazione accettata: li' il patto e' il prezzo al partner, come alla
   * nascita della vendita. Negli altri casi lo sconto resta quello fotografato
   * il giorno dell'ordine — non si riscrive la storia.
   */
  async rismistaAperte(applica = false) {
    const aperte = await this.prisma.sale.findMany({
      where: { status: SaleStatus.DA_GESTIRE, partnerId: null, deliveryId: null },
      include: { product: true, province: { select: { code: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const esito: {
      ordine: string | null; brand: string | null; provincia: string | null;
      prodotto: string | null; data: string | null;
      partner: string | null; motivo: string | null; saltata: string | null;
    }[] = [];

    for (const v of aperte) {
      const riga = {
        ordine: v.externalOrderNumber, brand: v.brand,
        provincia: v.province?.code ?? null,
        prodotto: v.product?.name ?? v.productName ?? null,
        data: v.deliveryDate ? v.deliveryDate.toISOString().slice(0, 10) : null,
        partner: null as string | null, motivo: null as string | null, saltata: null as string | null,
      };
      const perche = (v.assignmentReason ?? '').toLowerCase();
      if (!v.product) riga.saltata = 'senza prodotto a catalogo';
      else if (!v.provinceId) riga.saltata = 'senza provincia';
      else if (perche.includes('estero')) riga.saltata = 'ordine estero: si gestisce a mano';
      else if (perche.includes('presa in mano')) riga.saltata = "presa in mano dall'ufficio";
      if (riga.saltata) { esito.push(riga); continue; }

      try {
        await this.assertOrdineConforme(v.externalOrderId);
      } catch {
        riga.saltata = 'ordine non conforme in Orders';
        esito.push(riga);
        continue;
      }

      // La finestra della CONSEGNA: il giorno chiesto e la fascia del cliente.
      const ordine = await this.ordineDaOrders(v.externalOrderId);
      const f = SalesService.fasciaInOrari(ordine?.consegna?.fascia);
      const finestra: FinestraConsegna = {
        giorno: v.deliveryDate ?? new Date(),
        dalle: f.dalle,
        alle: f.alle,
      };
      const scelto = await this.scegliPartner(v.product as ProdottoDaSmistare, v.provinceId, finestra, []);
      if (!scelto) { riga.saltata = 'nessun partner disponibile nemmeno ora'; esito.push(riga); continue; }

      const p = await this.prisma.partner.findUnique({
        where: { id: scelto.partnerId }, select: { insegna: true },
      });
      riga.partner = p?.insegna ?? scelto.partnerId;
      riga.motivo = scelto.motivo;

      if (applica) {
        await this.prisma.sale.update({
          where: { id: v.id },
          data: {
            partnerId: scelto.partnerId,
            assignmentReason: scelto.motivo,
            status: SaleStatus.PROPOSTA,
            ...(scelto.prezzoPartner !== undefined
              ? { discountPercent: SalesService.quotaPerDare(v.amount, scelto.prezzoPartner) }
              : {}),
          },
        });
        await this.registra(v.id, 'stato',
          `Rismistata con la regola nuova degli orari (fascia di consegna, non ora di arrivo): proposta a ${riga.partner} — ${scelto.motivo}`);
      }
      esito.push(riga);
    }
    return {
      applicato: applica,
      guardate: aperte.length,
      proposte: esito.filter((r) => r.partner).length,
      ferme: esito.filter((r) => !r.partner).length,
      righe: esito,
    };
  }

  // --- smistamento -------------------------------------------------------

  /**
   * Esiste un partner che POTREBBE prendere questa vendita in questa provincia?
   *
   * È il filtro d'ingresso dello smistamento automatico (Standard §7.4, regola
   * dell'utente): si smistano SOLO i prodotti UNICI (che hanno un proprietario)
   * e i NON_UNICI **in una provincia dove abbiamo un partner**. Dove non c'è
   * nessuno che potrà mai prenderla, la vendita NON si crea: resta all'ordine
   * originale, e non si accumulano vendite orfane «da gestire» (ce n'erano 43
   * dal primo giro del 24/08).
   *
   * ⚠️ NON guarda gli orari (aperto/chiuso ADESSO): «avere un partner» è un
   * fatto della rete, non del momento. Un partner che esiste ma è chiuso ora
   * prende la vendita quando riapre — qui basta che ESISTA, sia attivo e OPERI
   * nella provincia. Per l'UNICO basta il PROPRIETARIO attivo, a prescindere
   * dalla provincia: quel prodotto lo fa solo lui.
   */
  async esisteCandidato(product: ProdottoDaSmistare, provinceId: string): Promise<boolean> {
    const lista = await this.candidati(product, provinceId);
    if (!lista.length) return false;
    const soloUnico = product.type === ProductType.UNICO;
    const n = await this.prisma.partner.count({
      where: {
        id: { in: lista.map((c) => c.partnerId) },
        active: true,
        // NON_UNICO: deve operare nella provincia. UNICO: basta che sia attivo.
        ...(soloUnico ? {} : { provinces: { some: { provinceId } } }),
      },
    });
    return n > 0;
  }

  /** Chi puo' prendere questa vendita, nell'ordine giusto. */
  private async candidati(product: ProdottoDaSmistare, provinceId: string): Promise<Candidato[]> {
    if (product.type === ProductType.UNICO) {
      const lista: Candidato[] = product.partnerId
        ? [{ partnerId: product.partnerId, motivo: 'proprietario del prodotto unico' }]
        : [];
      // Corporate Service: il prodotto unico di un partner puo' essere venduto
      // anche da altri, se il flag e' acceso e i collegamenti esistono.
      if (product.visibleToOtherPartners) {
        const altri = await this.prisma.productPartnerLink.findMany({
          where: { productId: product.id },
          select: { partnerId: true },
        });
        for (const a of altri) {
          if (!lista.some((c) => c.partnerId === a.partnerId)) {
            lista.push({ partnerId: a.partnerId, motivo: 'partner aggiuntivo del prodotto' });
          }
        }
      }
      return lista;
    }
    // ⭐ 04/09 (regola utente): la RICONCILIAZIONE accettata per (prodotto,
    // provincia) vince su lista di priorita' e ripiego: quel prodotto, li', va
    // SOLO a quel partner, a quel prezzo. Nasce in Prodotti → Riconciliazioni.
    const regola = await this.prisma.productReconciliation.findFirst({
      where: { productId: product.id, provinceId, status: 'accettata' },
      select: { partnerId: true, partnerPrice: true, price: true, discountPercent: true },
    });
    if (regola) {
      return [{
        partnerId: regola.partnerId,
        motivo: 'riconciliazione prodotto/provincia',
        // ⭐ Il patto è QUANTO PRENDE IL PARTNER: l'importo al cliente resta
        // quello di listino, e la quota Deluxy si ricava di conseguenza.
        prezzoPartner: regola.partnerPrice ?? Math.round(regola.price * (1 - regola.discountPercent / 100) * 100) / 100,
      }];
    }
    if (!product.categoryId) return [];

    // ⭐ La LISTA PRIORITA' vera: una per coppia (provincia, categoria), coi
    // partner in un ordine deciso da qualcuno. Importate dal legacy il
    // 24/08/2026: 26 liste, 48 partner.
    //
    // ⚠️ Prima si usava PartnerCategory, che dice solo QUALI categorie tratta
    // un partner — senza provincia, e con `priority` a 0 su tutte e 455 le
    // righe. Ordinare per un campo uguale per tutti non e' ordinare: il
    // partner scelto era il primo che capitava.
    const lista = await this.prisma.priorityList.findUnique({
      where: { provinceId_categoryId: { provinceId, categoryId: product.categoryId } },
      include: {
        entries: { orderBy: { position: 'asc' }, select: { partnerId: true, position: true } },
      },
    });
    if (lista?.entries.length) {
      return lista.entries.map((e) => ({
        partnerId: e.partnerId,
        motivo: `lista priorita' ${e.position}a di ${lista.entries.length}`,
      }));
    }

    // Nessuna lista per questa coppia. Il manuale dice che la vendita resta
    // «da gestire», e in teoria ha ragione — ma le liste coprono 26 coppie su
    // centinaia possibili, e applicarlo alla lettera oggi manderebbe in coda
    // quasi tutto. Si ripiega su chi tratta la categoria, DICENDO che e' un
    // ripiego: cosi' chi guarda una vendita sa se il partner e' stato scelto
    // da una lista o da un'approssimazione.
    const ripiego = await this.prisma.partnerCategory.findMany({
      where: { categoryId: product.categoryId },
      select: { partnerId: true },
    });
    return ripiego.map((x) => ({
      partnerId: x.partnerId,
      motivo: 'nessuna lista per questa provincia: scelto fra chi tratta la categoria',
    }));
  }

  private async scegliPartner(
    product: ProdottoDaSmistare,
    provinceId: string,
    finestra: FinestraConsegna,
    escludi: string[],
  ): Promise<Candidato | null> {
    const lista = (await this.candidati(product, provinceId)).filter(
      (c) => !escludi.includes(c.partnerId),
    );
    if (!lista.length) return null;

    const partners = await this.prisma.partner.findMany({
      where: {
        id: { in: lista.map((c) => c.partnerId) },
        active: true,
        provinces: { some: { provinceId } },
      },
      include: { openingHours: true },
    });
    const perId = new Map(partners.map((p) => [p.id, p]));

    for (const c of lista) {
      const p = perId.get(c.partnerId);
      if (!p) continue; // non attivo, o non opera in quella provincia
      if (await this.aperto(p.id, p.openingHours, finestra)) return c;
    }
    return null; // nessuno aperto: la vendita resta «da gestire»
  }

  /**
   * Il partner e' aperto in quel momento?
   *
   * L'ordine conta: il giorno preciso batte la settimana. Un partner puo'
   * essere «aperto il lunedi'» e chiuso questo lunedi' specifico. Prima del
   * 24/08/2026 si guardavano solo gli orari settimanali, e le 113.191 fasce per
   * giorno importate dal legacy non le leggeva nessuno: un partner chiuso a
   * Ferragosto risultava aperto.
   */
  private async aperto(
    partnerId: string,
    settimanali: {
      dayOfWeek: number;
      openTime: string | null;
      closeTime: string | null;
      closed: boolean;
    }[],
    finestra: FinestraConsegna,
  ): Promise<boolean> {
    const quando = finestra.giorno;
    const giorno = new Date(
      Date.UTC(quando.getFullYear(), quando.getMonth(), quando.getDate()),
    );

    // 1) fasce del giorno specifico
    const fasce = await this.prisma.partnerDaySlot.findMany({
      where: { partnerId, date: giorno },
    });
    if (fasce.length) {
      const utili = fasce.filter((f) => f.available);
      if (!utili.length) return false; // giorno dichiarato chiuso
      return utili.some((f) => this.siSovrappone(finestra, f.timeFrom, f.timeTo));
    }

    // 2) eccezione del giorno specifico
    const ecc = await this.prisma.partnerDayException.findUnique({
      where: { partnerId_date: { partnerId, date: giorno } },
    });
    if (ecc) return ecc.closed ? false : this.siSovrappone(finestra, ecc.openTime, ecc.closeTime);

    // 3) orari settimanali
    if (!settimanali.length) return true; // nessun orario configurato: sempre aperto
    const oggi = settimanali.filter((h) => h.dayOfWeek === giorno.getUTCDay());
    if (!oggi.length) return false;
    return oggi.some((h) => !h.closed && this.siSovrappone(finestra, h.openTime, h.closeTime));
  }

  /**
   * La consegna e l'apertura si INCROCIANO?
   *
   * ⚠️ 05/09/2026 — qui stava il difetto. Prima si confrontava un ISTANTE
   * (`quando`) con l'orario del partner, e quell'istante era l'ora dentro la
   * data della vendita: quando l'ordine non porta un'ora, la data arriva a
   * mezzanotte UTC, cioè le 02:00 italiane, e QUALUNQUE partner con orari
   * scritti risultava chiuso. Misurato sul database: fra le vendite con data a
   * mezzanotte il 46% restava senza partner (79 su 171), fra quelle con un
   * orario vero il 7% (18 su 248) — e le uniche mezzanotte che passavano erano
   * quelle di partner SENZA orari, che il codice tratta come sempre aperti.
   * Il caso che l'ha fatto vedere: ordine 12879, Tiramisù di Clivati 1969
   * (UNICO, quindi c'era un solo partner possibile), consegna di domenica
   * 06/09 — Clivati apre 07:30–19:30 la domenica, ma alle 02:00 no.
   *
   * Ora si confronta la FASCIA DI CONSEGNA con l'apertura, e basta che si
   * tocchino. Senza fascia la domanda diventa «quel giorno è aperto?»: è
   * l'unica cosa che si sa, e fingere di sapere l'ora è peggio che non saperla.
   */
  private siSovrappone(finestra: FinestraConsegna, apre: string | null, chiude: string | null): boolean {
    // Il partner non ha scritto gli orari di quel giorno: è aperto.
    if (!apre || !chiude) return true;
    // Nessuna fascia sull'ordine: basta che il giorno sia aperto.
    if (!finestra.dalle || !finestra.alle) return true;
    // Si toccano davvero: un negozio che chiude alle 16 non serve la 16–20.
    return finestra.dalle < chiude && apre < finestra.alle;
  }

  /** Una fascia senza orari vale tutto il giorno, non zero minuti. */
  private dentro(hhmm: string, da: string | null, a: string | null): boolean {
    if (!da || !a) return true;
    return da <= hhmm && hhmm <= a;
  }

  /**
   * Crea la consegna che nasce da una vendita accettata.
   *
   * Restituisce null se manca qualcosa di obbligatorio: meglio una vendita
   * accettata senza consegna, e detto, che una consegna con un destinatario
   * inventato.
   */
  private async creaConsegna(
    vendita: {
      id: string;
      partnerId: string | null;
      customerId: string | null;
      recipientFirstName: string | null;
      recipientLastName: string | null;
      recipientAddress: string | null;
      recipientPhone: string | null;
      deliveryDate: Date | null;
      serviceTypeId: string | null;
      amount: number;
      discountPercent?: number;
      externalOrderId?: string | null;
      /** Il numero dell'ordine come lo leggono le persone: è questo il DDT. */
      externalOrderNumber?: string | null;
      source?: string;
      brand?: string | null;
      productId?: string | null;
      productVariantId?: string | null;
      variantName?: string | null;
      product?: { name: string; sku: string | null; publicPrice: number | null } | null;
    },
    variante?: { id: string; name: string; price: number | null; publicPrice: number | null } | null,
  ) {
    if (!vendita.partnerId || !vendita.serviceTypeId || !vendita.deliveryDate) return null;
    if (!vendita.recipientFirstName || !vendita.recipientLastName || !vendita.recipientAddress) {
      return null;
    }

    // ⭐ RITIRO = INDIRIZZO DEL PARTNER (regola utente 31/08/2026). Una consegna
    // nata dallo smistamento di una vendita partiva senza indirizzo di ritiro:
    // il valet non sapeva DOVE ritirare. Il ritiro di default è la sede del
    // partner della vendita, come nel form manuale.
    const partnerVendita = await this.prisma.partner.findUnique({
      where: { id: vendita.partnerId },
      select: { address: true },
    });
    const indirizzoRitiro = partnerVendita?.address?.trim() || null;

    // ⭐ L'ECONOMIA DELLA VENDITA — dal CANONE 01/09 la quota NON si congela.
    //
    // Fino al 01/09 qui si scriveva `price = amount × discountPercent%`: un
    // numero congelato sul PUBBLICO che vinceva sul canone (lo scritto > 0
    // vince) e smetteva di seguire listino e righe. Ora il campo resta VUOTO e
    // la Fatturazione calcola fee% × valore prodotti a ogni lettura.
    //
    // `productValue` (= amount, il pagato dal cliente) si scrive SOLO se non
    // nasce la riga prodotto: e' l'ultimo ripiego della cascata di
    // valore-prodotti.ts, non la verita' — dove la riga c'e', parlano le righe.
    const valoreProdotti = arrotonda(vendita.amount);

    // ⭐ LA REGOLA DEL DDT (corretta il 05/09/2026). Su una vendita la consegna
    // viaggia col documento di trasporto, e il suo numero e' il riferimento
    // della vendita: nei dati veri e' cosi' su 10.515 consegne su 12.967 con un
    // DDT (l'81%), e il 96% delle vendite ne ha uno.
    //
    // ⚠️ Qui si scriveva `externalOrderId`, che sulla vendita e' l'id INTERNO
    // di Deluxy Orders — un cuid tipo `cmthk6uht0002jr044m6xlqvm`, non un
    // numero di documento. Nel database i DDT sono 16.357 e sono numeri
    // (15.164 tutti cifre, zero in forma cuid): scriverci un id avrebbe messo
    // in quel campo una cosa che nessuno riconosce, e avrebbe fatto fallire la
    // riconciliazione per DDT — che e' il legame piu' forte fra vendita e
    // consegna (regola utente del 05/09). Vale il NUMERO d'ordine, quello che
    // le persone leggono; l'id resta come ultimo ripiego se il numero manca.
    const numeroDdt = vendita.externalOrderNumber?.trim() || vendita.externalOrderId?.trim() || null;

    // ⭐ 01/09 (regola utente «sistemati anche gli altri ordini»): anche la via
    // AUTOMATICA porta con sé quello che l'ordine sa già — fascia oraria del
    // cliente, biglietto (→ personalizzazione) e nota Shopify (→ note). Prima
    // solo il form li aveva: le consegne nate dallo smistamento uscivano mute.
    // Best-effort: se Orders non risponde, la consegna nasce come prima.
    let fasciaDalle: string | undefined;
    let fasciaAlle: string | undefined;
    let biglietto: string | undefined;
    let notaShopify: string | undefined;
    const ordine = await this.ordineDaOrders(vendita.externalOrderId);
    if (ordine) {
      const f = SalesService.fasciaInOrari(ordine?.consegna?.fascia);
      fasciaDalle = f.dalle;
      fasciaAlle = f.alle;
      biglietto = String(ordine?.biglietto ?? '').trim() || undefined;
      notaShopify = String(ordine?.shopify?.note ?? '').trim() || undefined;
    }

    const ultimo = await this.prisma.delivery.aggregate({ _max: { code: true } });
    return this.prisma.delivery.create({
      data: {
        code: (ultimo._max.code ?? 0) + 1,
        date: vendita.deliveryDate,
        serviceTypeId: vendita.serviceTypeId,
        partnerId: vendita.partnerId,
        customerId: vendita.customerId,
        recipientFirstName: vendita.recipientFirstName,
        recipientLastName: vendita.recipientLastName,
        recipientAddress: vendita.recipientAddress,
        recipientPhone: vendita.recipientPhone,
        pickupAddress: indirizzoRitiro,
        // La finestra chiesta dal cliente sull'ordine (es. «16-20»): aperta
        // come fascia flessibile quando è una finestra vera.
        deliveryTimeFrom: fasciaDalle,
        deliveryTimeTo: fasciaAlle,
        deliveryFlexible: Boolean(fasciaDalle && fasciaAlle && fasciaAlle !== fasciaDalle) || undefined,
        personalizeSaleNotes: biglietto,
        notes: notaShopify,
        productValue: vendita.productId ? null : valoreProdotti,
        ddtNumber: numeroDdt,
        // Con piu' brand lo stesso numero DDT esiste su negozi diversi: il
        // brand della vendita viaggia col documento, o il numero non identifica.
        ddtBrand: numeroDdt ? (vendita.brand ?? null) : null,
        legacySaleId: vendita.externalOrderId ?? null,
        // ⭐ LA RIGA PRODOTTO, che prima non veniva scritta affatto: la consegna
        // nasceva senza dire COSA andava consegnato («Nessun prodotto» a
        // schermo), e la Finanza leggeva un venduto a zero. E' la fotografia
        // del giorno, variante compresa: la Cappelliera M non e' la Cappelliera.
        products: vendita.productId
          ? {
              create: [{
                productId: vendita.productId,
                productName: vendita.product?.name ?? null,
                productSku: vendita.product?.sku ?? null,
                productVariantId: vendita.productVariantId ?? null,
                variantName: vendita.variantName ?? variante?.name ?? null,
                quantity: 1,
                // Il prezzo di riga e' quello del PARTNER (canone 29/08: la fee
                // si calcola sul SUO prezzo — la prova: la quota registrata e'
                // il 20% esatto della variante `price`, non del pubblico). Il
                // pubblico e' il ripiego; se nessuno lo dichiara resta vuoto.
                price: variante?.price ?? variante?.publicPrice ?? vendita.product?.publicPrice ?? null,
              }],
            }
          : undefined,
      },
      select: { id: true, code: true, date: true },
    });
  }
}

/** Due decimali: gli importi si scrivono come si leggono. */
function arrotonda(n: number): number {
  return Math.round(n * 100) / 100;
}

@ApiTags('sales')
@ApiBearerAuth()
// ⚠️ Il guard dei ruoli, SENZA `@Roles`, lascia passare chiunque sia
// autenticato (roles.guard.ts). Questo controller non ne aveva nessuno: un
// VALET leggeva tutto. Provato con un token vero il 27/08/2026. I ruoli qui
// sono gli stessi che il frontend applica alla pagina (app.routes.ts).
@Roles(Role.ADMIN, Role.OPERATION, Role.PROJECT_MANAGER, Role.PARTNER)
@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Get()
  @ApiOperation({ summary: 'Lista vendite (il partner vede le proprie)' })
  findAll(@CurrentUser() user: JwtUser) {
    return this.salesService.findAll(user);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.OPERATION, Role.PARTNER)
  @ApiOperation({ summary: 'Dettaglio vendita col registro (il partner solo le sue)' })
  findOne(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.salesService.findOne(id, user);
  }

  @Get(':id/ordine')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Dettaglio ordine dietro la vendita (mittente, righe, contrassegno) per il prefill' })
  dettaglioOrdine(@Param('id') id: string) {
    return this.salesService.dettaglioOrdine(id);
  }

  @Post()
  @ApiOperation({ summary: 'Crea vendita con smistamento automatico al partner' })
  async create(
    @Body()
    body: {
      productId: string;
      productVariantId?: string;
      provinceId: string;
      brand?: string;
      customerId?: string;
      source?: string;
      externalOrderId?: string;
      recipientFirstName?: string;
      recipientLastName?: string;
      recipientAddress?: string;
      recipientPhone?: string;
      deliveryDate?: string;
      serviceTypeId?: string;
    },
    @CurrentUser() user: JwtUser,
  ) {
    const v = await this.salesService.create(body);
    await this.salesService.registra(v.id, 'creata', `Vendita creata dall'app · stato ${v.status}${(v as any).partner?.insegna ? ' · proposta a ' + (v as any).partner.insegna : ''}`, user);
    return v;
  }

  @Post('ingest')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({
    summary: 'Riceve un ordine da un sistema esterno e lo smista (idempotente)',
  })
  ingest(
    @Body()
    body: {
      source: string;
      externalOrderId: string;
      provinceCode?: string;
      provinceId?: string;
      productId?: string;
      productVariantId?: string;
      productSku?: string;
      brand?: string;
      customerId?: string;
      recipientFirstName?: string;
      recipientLastName?: string;
      recipientAddress?: string;
      recipientPhone?: string;
      deliveryDate?: string;
      serviceTypeId?: string;
    },
  ) {
    return this.salesService.ingest(body);
  }

  @Post(':id/accetta')
  @ApiOperation({ summary: 'Il partner accetta la vendita: nasce la consegna' })
  accetta(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.salesService.accetta(id, user);
  }

  @Post(':id/rifiuta')
  @ApiOperation({
    summary: 'Il partner rifiuta: la vendita passa al prossimo, o torna da gestire',
  })
  rifiuta(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.salesService.rifiuta(id, user);
  }

  @Post(':id/inserisci')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({
    summary: "L'ufficio prende in mano la vendita: ferma il giro automatico, la consegna si inserisce dal form",
  })
  inserisci(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.salesService.prendiInMano(id, user);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Modifica i DATI della vendita (importo, destinatario, date…) — non lo stato' })
  modifica(@Param('id') id: string, @Body() body: Record<string, unknown>, @CurrentUser() user: JwtUser) {
    return this.salesService.modifica(id, body, user);
  }

  @Get(':id/storico-partner')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Chi abbiamo usato in passato per questo prodotto in questa provincia, e a che prezzo' })
  storicoPartner(@Param('id') id: string) {
    return this.salesService.storicoPartner(id);
  }

  @Get(':id/consegne-indirizzo')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Consegne di tipo vendita allo stesso indirizzo di questa vendita' })
  consegneIndirizzo(@Param('id') id: string) {
    return this.salesService.consegneAllIndirizzo(id);
  }

  @Post(':id/riconcilia-consegna')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'La vendita È quella consegna: va in storico e il suo riferimento entra nel DDT' })
  riconciliaConsegna(@Param('id') id: string, @Body() body: { deliveryId?: string }, @CurrentUser() user: JwtUser) {
    if (!body?.deliveryId) throw new BadRequestException('Serve «deliveryId».');
    return this.salesService.riconciliaConConsegna(id, body.deliveryId, user);
  }

  @Post(':id/proponi')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'L\'ufficio propone la vendita a un partner scelto a mano' })
  proponi(@Param('id') id: string, @Body() body: { partnerId?: string }, @CurrentUser() user: JwtUser) {
    if (!body?.partnerId) throw new BadRequestException('Serve «partnerId».');
    return this.salesService.proponiAPartner(id, body.partnerId, user);
  }

  @Post(':id/collega-consegna')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Collega la consegna inserita a mano e chiude la vendita (accettata)' })
  collegaConsegna(@Param('id') id: string, @Body() body: { deliveryId?: string }, @CurrentUser() user: JwtUser) {
    return this.salesService.collegaConsegna(id, body?.deliveryId ?? '', user);
  }
}

@Module({
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
