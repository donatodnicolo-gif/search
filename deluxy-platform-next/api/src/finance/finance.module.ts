// ============================================================
// Finanza (sezione riservata agli admin abilitati)
// ------------------------------------------------------------
// Replica la schermata Finanza (/finanza) dell'app reale, §3.8 del manuale
// COME-FUNZIONA-APP-DELUXY.md.
//
// AMBITO (25/08/2026, deciso dall'utente): i CORRISPETTIVI riguardano SOLO i
// servizi di tipo VENDITA. Su un servizio di sola consegna (PREZZO_FISSO,
// A_ORA, MAGAZZINO, CORPORATE) il denaro va nel verso opposto — il partner e'
// il CLIENTE e la consegna gli viene FATTURATA — e le formule di qui sotto non
// significherebbero niente. Sommarle insieme non fa un totale piu' grande, fa
// un totale sbagliato.
//
// ⭐ FORMULE RISCRITTE IL 25/08/2026, e prima erano capovolte: la pagina
// trattava `Delivery.price` come cio' che PAGHIAMO al partner, mentre e' la
// quota che TRATTENIAMO noi — cosi' Deluxy risultava tenersi l'87% di ogni
// vendita. E' la lettura che la Fatturazione aveva gia' («nei servizi di VENDITA
// il denaro va nell'altro verso: il cliente paga Deluxy, Deluxy trattiene la sua
// percentuale e deve il resto al partner», `invoices.module.ts`).
//
// ⭐⭐ CORRETTO ANCORA POCHE ORE DOPO, e stavolta dai numeri dell'utente.
// --------------------------------------------------------------------------
// Il valore dato al partner NON si calcola: **e' scritto**, in
// `Delivery.productValue` (nel legacy la colonna 56 di `delivery`, importata dal
// primo giorno e mai letta da questa pagina). Lo ha fatto notare l'utente:
// «per il 62395 al partner abbiamo dato 70 €» — e `productValue` di #62395 vale
// esattamente 70.
//
// Prova decisiva su 8.850 vendite: `Delivery.price` e' la fee di contratto
// calcolata su **productValue**, non sul prezzo pubblico — combacia con la fee%
// del partner entro un decimo di punto nel **92,6%** dei casi contro il 62,6%
// usando il prezzo delle righe.
//
// E il GUADAGNO e' la differenza, **al netto IVA**: #63013 → pubblico 135, al
// partner 80, differenza 55, e 55/1,22 = **45,08**, cioe' i «45» dell'utente.
// E' la stessa scelta gia' fatta in Deluxy Orders (margine sempre al netto IVA,
// 22% su tutto).
//
//   prezzoPubblico     = somma( DeliveryProduct.price x quantita )
//   datoAlPartner      = Delivery.productValue        <- SCRITTO, non dedotto
//   guadagnoLordo      = prezzoPubblico - datoAlPartner
//   guadagnoNetto      = guadagnoLordo / 1.22         <- il guadagno vero
//   iva                = guadagnoLordo - guadagnoNetto
//   feeContratto       = Delivery.price + additionalPrice  (quota a listino, per confronto)
//   feePercent         = guadagnoNetto / valoreVendite   (netto su netto: l'utente)
//   feePercentContract = Partner.commissionPercent
//   commissioneIncassi = prezzoPubblico x 3%
//   costoConsegna      = paga del valet + plus/minus, ma ZERO se `payable` e' false
//   margineTotale      = guadagnoNetto - costoConsegna - commissioneIncassi
//
// ⚠️ L'IVA **non si sottrae due volte**: il guadagno netto l'ha gia' tolta. La
// colonna IVA c'e' per farla vedere, non per rientrare nel margine.
//
// ⚠️ `Delivery.price` resta a schermo come **quota di contratto**, accanto al
// guadagno vero: sull'archivio valgono 165.739 € contro 188.007 € lordi, e dove
// si scostano c'e' qualcosa da guardare.
//
// ⚠️ Il venduto si legge dalla RIGA DI CONSEGNA (`DeliveryProduct.price`, la
// fotografia di quel giorno), non dal catalogo: il catalogo intanto cambia, e
// un prodotto riprezzato riscriverebbe la storia di consegne gia' fatte. Prima
// si leggeva da li' (`Product.publicPrice ?? Product.price`) e dava 1.220.337 €
// contro 1.297.560 € — il quarto calcolo diverso dello stesso numero dentro lo
// stesso progetto. Ora la fonte e' una sola, la stessa della Fatturazione.
//
// ⚠️ Tre colonne sono sparite perche' erano lo STESSO numero sotto nomi
// diversi: con questa lettura «primo margine» e «fee value» valgono entrambi il
// corrispettivo, e «incasso partner» vale il dovuto al partner. Ripetere un
// numero sotto piu' intestazioni non aggiunge informazione, aggiunge occasioni
// di leggerlo male.
//
// La "consegna prezzo" vale ZERO, ed e' NORMALE (l'utente, 25/08/2026): nel
// valore vendite conta il valore del PRODOTTO. `Delivery.deliveryPrice` e' null
// su tutte le 61.836 consegne perche' nel `delivery` legacy quella colonna non
// esiste — e' un addendo che qui non c'e', non un dato perso.
//
// IVA e commissione incassi sono costanti qui sotto (candidate a diventare
// impostazioni admin).
// ============================================================
import {
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  Module,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtUser } from '../common/decorators';
import { Role } from '../common/enums';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';

/** IVA applicata al corrispettivo (22%). */
const VAT = 0.22;
/**
 * La commissione di incasso quando NON si sa come ha pagato il cliente: ZERO.
 *
 * ⚠️ Era il 3% per tutti, e non voleva dire niente: incassare costa quanto
 * chiede il gestore, e il gestore dipende dal metodo di pagamento e dal piano
 * del negozio. Le tariffe vere stanno in `CommissioneIncasso`, ognuna con la
 * sua fonte e un flag `confermata`.
 *
 * ⭐ E dove il metodo non si conosce si mette ZERO, non il 3% (l'utente,
 * 25/08/2026): «sconosciuto potrebbe essere contanti o bonifico». Gli ordini
 * senza gateway sono per lo piu' vecchi o entrati a mano, cioe' proprio quelli
 * che non passano da un gestore — e attribuire loro una commissione era
 * inventare un costo. Sull'archivio erano 1.893 ordini e 6.554 € di costo che
 * non esiste.
 *
 * ⚠️ Il rischio opposto e' dichiarato: se qualcuno di quei 1.893 fosse stato
 * pagato con carta, il suo costo ora manca. La pagina li conta e lo dice —
 * meglio un buco visibile che un numero inventato.
 */
const INCASSI = 0;
/**
 * Gli stati che NON entrano nei corrispettivi.
 *
 * ⭐ 25/08/2026, deciso dall'utente: «metti tutti gli stati a parte quelle
 * cancelled». Prima era una lista di ammessi (`delivered`, `approved`) e
 * teneva fuori tutto il resto — comprese le vendite gia' assegnate, accettate o
 * appena create. Cercando l'ordine 12792 la pagina rispondeva «Nessuna vendita
 * nel periodo» mentre quella vendita aveva tre consegne del 25/08: erano
 * `assigned`, `accepted` e `cancelled`.
 *
 * ⚠️ Una lista di AMMESSI e una di ESCLUSI invecchiano in modo opposto: la
 * prima dimentica gli stati nuovi (e li toglie in silenzio), la seconda li
 * include per difetto. Qui la seconda e' quella giusta — l'unico stato che non
 * porta ricavo e' quello annullato.
 *
 * Effetto misurato: le vendite dell'archivio passano da 12.247 a 12.951 (+704);
 * agosto 2026 da 154 a 372 righe.
 *
 * Storia utile: qui c'era anche `delivered_time_approved`, che in banca dati
 * NON ESISTE — un valore che non combacia con nessuna riga non da' errore,
 * toglie in silenzio, e teneva fuori 550 consegne approvate.
 */
// Annullate, invalidate e rifiutate: fuori dai corrispettivi (deciso
// dall'utente 26/08 — il ddt 4901 aveva 9 copie `invalidated` di una Sacher
// vera che pesavano nei margini con paghe e valori).
const STATI_ESCLUSI = ['cancelled', 'invalidated', 'not_accepted'];

/**
 * Il `pricingModel` dei servizi di VENDITA (`ServiceType.pricingModel`).
 *
 * ⚠️ E' il servizio del PARTNER (`Delivery.serviceType`), non quello del valet
 * (`Delivery.valetServiceId`): sullo stesso record convivono due tassonomie, e
 * leggere l'una per l'altra qui vorrebbe dire filtrare per il lavoro del valet
 * invece che per il tipo di vendita.
 */
const MODELLO_VENDITA = 'VENDITA';

/**
 * Le fasce di margine dei filtri rapidi.
 *
 * ⚠️ Si filtrano gli ORDINI, non le consegne: il margine e' dell'ordine, e una
 * consegna presa da sola non ne ha uno che voglia dire qualcosa. Ed e' il
 * margine in PERCENTUALE, non in euro: un ordine da 2.000 € che ne rende 40 e
 * uno da 40 che ne rende 5 hanno lo stesso problema, e in valore assoluto
 * sembrerebbero due cose diverse.
 *
 * ⚠️ Le fasce si CONTENGONO a vicenda, sottoinsiemi compresi: «minimo» (entro
 * il 5%) comprende anche il margine negativo, «basso» (entro il 15%) comprende
 * minimo e negativo — perche' e' cosi' che si legge la domanda «quali ordini
 * rendono poco». Chi vuole solo la corona esterna filtra due volte.
 */
const FASCE_MARGINE: Record<string, (percentuale: number) => boolean> = {
  negativo: (p) => p < 0,
  minimo: (p) => p <= 5,
  basso: (p) => p <= 15,
};

/**
 * Perche' una riga non e' attendibile.
 *
 * ⚠️ Una riga sbagliata non si nasconde e non si aggiusta da sola: si mostra
 * col motivo. Sono errori di inserimento del prezzo (l'utente, 25/08/2026) e
 * vanno corretti alla fonte — `scripts/estrai-anomalie-prezzo-vendite.mjs` li
 * tira fuori tutti, col confronto contro l'ordine Shopify.
 */
type Anomalia =
  | 'partner_oltre_pubblico'
  | 'venduto_a_zero'
  | 'valore_partner_mancante'
  | null;

interface CorrispettivoRow {
  deliveryId: string;
  deliveryCode: number;
  /**
   * L'ID DELLA VENDITA, che nell'app reale sta accanto a quello della consegna.
   *
   * ⚠️ Non e' un campo solo: la piattaforma tiene il riferimento in tre posti
   * diversi a seconda di da dove arriva l'ordine — `legacySaleId`, il numero
   * d'ordine del vecchio sistema, o il numero del DDT. Mostrarne uno solo
   * significa lasciare vuota la colonna su una parte delle righe.
   */
  saleRef: string | null;
  /** Il numero d'ordine Shopify: aggancia la cache di cio' che ha pagato il cliente. */
  realOrderNumber: string | null;
  /** saleId e DDT della consegna: il ripiego LEGGIBILE quando la cache non ha il numero. */
  legacySaleRef: string | null;
  ddtRef: string | null;
  status: string;
  date: Date;
  product: string;
  category: string | null;
  /** Il servizio del partner: e' cio' per cui la riga e' qui (sempre di VENDITA). */
  service: string;
  partner: string;
  /** Prezzo pubblico: somma dei prezzi scritti sulle righe di consegna. */
  publicPrice: number;
  /**
   * `true` = almeno una riga non aveva il prezzo scritto e si e' usato il
   * pubblico della VARIANTE (listino di oggi, non fotografia di quel giorno).
   * Va detto a schermo: un ripiego silenzioso sembrerebbe un dato misurato.
   */
  vendutoStimato: boolean;
  deliveryFee: number;
  saleValue: number;
  /** Quello che abbiamo dato al partner: `Delivery.productValue`, scritto. */
  partnerPrice: number;
  /** Guadagno lordo: prezzo pubblico - dato al partner. */
  takings: number;
  /** Guadagno al NETTO IVA: e' il guadagno vero. */
  takingsNet: number;
  /** La quota che sarebbe spettata a listino (`Delivery.price` + plus/minus). */
  feeContract: number;
  /** Il guadagno NETTO IVA in percentuale sul valore vendite. */
  feePercent: number;
  /** La fee scritta in anagrafica: se diverge da quella vera, si vede. */
  feePercentContract: number;
  deliveryCost: number;
  vat: number;
  incassiCommission: number;
  totalMargin: number;
  totalMarginPercent: number;
  anomalia: Anomalia;
  /**
   * Le righe prodotto, come impronta: servono a capire se due consegne dello
   * stesso ordine portano LO STESSO prodotto o due prodotti diversi.
   */
  prodotti: { nome: string; quantita: number; prezzo: number }[];
  /** Come ha pagato il cliente (copia di comodo: il dato e' di Orders). */
  paymentGateway: string | null;
  paymentBrand: string | null;
}

/**
 * Il riepilogo di un ORDINE, sopra le sue consegne.
 *
 * ⭐ Deciso dall'utente il 25/08/2026: «valore dell'ordine e spese di consegna
 * sono a monte, quindi vanno messe in un recap sopra le altre consegne
 * correlate» e «il costo consegna dovrebbe essere solo uno, secondo la regola
 * da applicare».
 *
 * Sono tre importi che appartengono all'ORDINE e non alla singola consegna, e
 * sommarli riga per riga li conta due, tre, dieci volte:
 *  - il valore pagato dal cliente;
 *  - le spese di consegna che ha pagato;
 *  - il costo della consegna, che per la regola carnet si paga UNA volta sola
 *    per giro, non una per destinazione.
 */
/** Una tariffa di incasso, come sta in tabella. */
interface TariffaIncasso {
  gateway: string;
  brand: string | null;
  percentuale: number;
  fissa: number;
  confermata: boolean;
}

/** Quello che il cliente ha pagato online, dalla cache di Orders. */
interface ClientePagato {
  prodotti: number;
  consegna: number;
  totale: number;
  ordersId: string | null;
  brand: string | null;
  /** Il numero umano ("#12731"): a schermo si legge lui, non il gid. */
  numero: string | null;
}

interface RecapOrdine {
  /** L'id della vendita: e' la chiave che tiene insieme le consegne. */
  saleRef: string;
  consegne: number;
  /** Somma dei prezzi pagati dal cliente sulle consegne dell'ordine. */
  saleValue: number;
  /** true = venduto e consegna vengono dall'ordine Shopify (pagato dal cliente). */
  fonteCliente: boolean;
  /** La pagina dell'ordine in Deluxy Orders (che ha anche il bottone Shopify). */
  ordersLink: string | null;
  /** Il brand dell'ordine ("deluxy.it", …), dalla cache. */
  brand: string | null;
  /** Il numero umano dell'ordine ("#12731"), dalla cache. */
  numeroOrdine: string | null;
  /** Almeno una riga senza prezzo scritto, stimata dal listino della variante. */
  vendutoStimato: boolean;
  /** Spese di consegna dell'ordine: contate UNA volta. */
  deliveryFee: number;
  /** Costo della consegna dell'ordine: per la regola, uno solo. */
  deliveryCost: number;
  /** Quanto e' andato ai partner, in tutto. */
  partnerPrice: number;
  /** Il guadagno lordo dell'ordine. */
  takings: number;
  takingsNet: number;
  feeContract: number;
  feePercent: number;
  vat: number;
  incassiCommission: number;
  totalMargin: number;
  totalMarginPercent: number;
  /** Righe non attendibili dentro l'ordine. */
  anomalie: number;
  /** Come ha pagato il cliente: decide quanto costa incassare. */
  gateway: string | null;
  /** `false` quando la tariffa applicata e' una stima, non un dato confermato. */
  commissioneConfermata: boolean;
  /** Le consegne dell'ordine: la riga si apre e le mostra. */
  righe: CorrispettivoRow[];
  /**
   * ⚠️ Quante consegne dell'ordine risultano pagate. Se sono piu' di una la
   * regola carnet non e' stata applicata, e il costo qui sopra e' la somma di
   * cio' che si e' pagato davvero, non di cio' che si sarebbe dovuto pagare.
   */
  consegnePagate: number;
  /// Piu' di una paga valet NELLO STESSO GIORNO: solo allora e' un'anomalia.
  piuPagheStessoGiorno: boolean;
}

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Il periodo, col MESE IN CORSO come predefinito.
   *
   * ⚠️ Senza un periodo la pagina caricava TUTTO: 54.576 consegne con dentro
   * 52.713 righe prodotto, ciascuna col suo prodotto e la sua categoria.
   * `/finance/summary` non rispondeva nemmeno dopo tre minuti e
   * `/finance/corrispettivi` dava 500 dopo 24 secondi. Una pagina di
   * marginalita' si guarda per periodo: «tutto dal 2020» non e' una domanda che
   * qualcuno si fa davvero.
   */
  private dateWhere(from?: string, to?: string) {
    if (!from && !to) {
      const oggi = new Date();
      const primo = new Date(Date.UTC(oggi.getUTCFullYear(), oggi.getUTCMonth(), 1));
      return { date: { gte: primo } };
    }
    return {
      date: {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
      },
    };
  }

  /**
   * I filtri della pagina.
   *
   * `cerca` guarda il NUMERO D'ORDINE in tutte le forme in cui la piattaforma
   * lo tiene — sono quattro, e cercarne una sola vuol dire non trovare:
   *  - `code`: il numero della consegna;
   *  - `legacyOrderId`: il numero d'ordine del vecchio sistema (e' quello che
   *    si legge in Orders, es. 12802);
   *  - `realOrderNumber`: l'id Shopify lungo;
   *  - `legacySaleId`: l'id della vendita.
   * Piu' il nome del destinatario e del partner, che e' come si cerca quando il
   * numero non ce l'hai sotto mano.
   */
  private filtri(opzioni: { partnerId?: string; cerca?: string } = {}) {
    const w: any = {};
    if (opzioni.partnerId) w.partnerId = opzioni.partnerId;
    const t = opzioni.cerca?.trim();
    if (t) {
      const n = Number(t);
      w.OR = [
        ...(Number.isInteger(n) ? [{ code: n }, { legacyOrderId: n }] : []),
        { realOrderNumber: { contains: t, mode: 'insensitive' } },
        { legacySaleId: { contains: t, mode: 'insensitive' } },
        { recipientLastName: { contains: t, mode: 'insensitive' } },
        { partner: { insegna: { contains: t, mode: 'insensitive' } } },
      ];
    }
    return w;
  }

  /**
   * L'ambito: solo i servizi di VENDITA.
   *
   * `soloVendite: false` resta per chi vuole davvero guardare tutte le consegne
   * a buon fine (analisi, controprove). La pagina non lo usa, e chi lo usa deve
   * sapere che su quelle righe le formule dei corrispettivi non significano
   * niente.
   */
  private ambito(soloVendite = true) {
    return soloVendite ? { serviceType: { pricingModel: MODELLO_VENDITA } } : {};
  }

  /**
   * Le vendite che sono la GAMBA D'ACQUISTO di un ordine corporate: la loro
   * consegna corrispondente (`legacyCorrespondDeliveryId`) e' un servizio
   * CORPORATE — es. 62307 «Vendita Deluxy» (brioches da MALI'A) che
   * corrisponde alla 62306 «ORDINE BRIOCHE» per Casati 14. Non sono
   * corrispettivi D2C e l'utente le vuole FUORI (26/08). Misurate: 110
   * consegne per 5.887,37 € di valore prodotti. Il canale Business
   * (`shop = BusinessSales`) invece RESTA dentro, sempre per sua decisione.
   *
   * ⚠️ Il legame e' per legacyId, non una relazione Prisma: gli id si
   * raccolgono con una query e si escludono per elenco.
   */
  private async idVenditeDaCorporate(): Promise<string[]> {
    // ⚠️ Schema qualificato: sul pooler la search_path non e' garantita.
    const righe = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT d."id"
      FROM platform."Delivery" d
      JOIN platform."ServiceType" sv ON sv."id" = d."serviceTypeId" AND sv."pricingModel" = 'VENDITA'
      JOIN platform."Delivery" c ON c."legacyId" = d."legacyCorrespondDeliveryId" AND c."deletedAt" IS NULL
      JOIN platform."ServiceType" sc ON sc."id" = c."serviceTypeId" AND sc."pricingModel" = 'CORPORATE'
      WHERE d."deletedAt" IS NULL`;
    return righe.map((r) => r.id);
  }

  /**
   * Tiene gli ordini di una fascia di margine.
   *
   * Una fascia che non esiste non filtra niente: meglio mostrare tutto che
   * mostrare il vuoto per un parametro scritto male.
   */
  private perFascia(ordini: RecapOrdine[], fascia?: string): RecapOrdine[] {
    const regola = fascia ? FASCE_MARGINE[fascia] : undefined;
    return regola ? ordini.filter((o) => regola(o.totalMarginPercent)) : ordini;
  }

  async corrispettivi(
    from?: string,
    to?: string,
    opzioni: { partnerId?: string; cerca?: string; limite?: number; soloVendite?: boolean; margine?: string; brand?: string } = {},
  ): Promise<CorrispettivoRow[]> {
    // Le gambe d'acquisto degli ordini corporate restano fuori (vedi
    // idVenditeDaCorporate): si escludono per elenco di id.
    const corporate = (opzioni.soloVendite ?? true) ? await this.idVenditeDaCorporate() : [];
    const deliveries = await this.prisma.delivery.findMany({
      where: {
        deletedAt: null,
        status: { notIn: STATI_ESCLUSI },
        ...(corporate.length ? { id: { notIn: corporate } } : {}),
        ...this.dateWhere(from, to),
        ...this.ambito(opzioni.soloVendite ?? true),
        ...this.filtri(opzioni),
      },
      // ⚠️ Un tetto c'e' sempre: senza, un periodo largo rimette la pagina
      // esattamente nella condizione da cui non rispondeva.
      take: Math.min(5000, Math.max(1, opzioni.limite ?? 2000)),
      // `productValue` e' il valore dato al partner: senza di lui questa pagina
      // deduce cio' che e' gia' scritto, ed e' l'errore appena corretto.
      include: {
        partner: { select: { insegna: true, commissionPercent: true } },
        serviceType: { select: { name: true, pricingModel: true } },
        products: {
          include: {
            // `price`/`publicPrice` del prodotto servono al ripiego dichiarato
            // dove il prezzo di riga manca (variante → pubblico → base).
            product: { select: { name: true, price: true, publicPrice: true, category: { select: { name: true } } } },
            productVariant: { select: { name: true, publicPrice: true } },
          },
        },
      },
      orderBy: { date: 'desc' },
    });
    let rows = deliveries.map((d) => this.computeRow(d));
    // Il BRAND sta sull'ordine (cache di Orders), non sulla consegna: si
    // filtra per numero d'ordine. Le consegne senza ordine restano fuori dal
    // filtro — chi filtra per brand cerca ordini di quel brand.
    if (opzioni.brand) {
      const del = new Set(
        (await this.prisma.ordineCliente.findMany({
          where: { brand: opzioni.brand },
          select: { orderId: true },
        })).map((x) => x.orderId),
      );
      rows = rows.filter((r) => r.realOrderNumber && del.has(r.realOrderNumber));
    }
    // ⚠️ Il filtro sul margine si applica agli ORDINI, e le consegne seguono i
    // loro: tenere una consegna il cui ordine e' fuori fascia farebbe un elenco
    // che non corrisponde ne' ai totali ne' alle righe d'ordine.
    if (!opzioni.margine) return rows;
    const tenuti = new Set(this.perFascia(this.recap(rows, await this.tariffe(), await this.clientePagato(rows)), opzioni.margine)
      .map((o) => o.saleRef));
    return rows.filter((r) => tenuti.has(r.saleRef ?? `consegna-${r.deliveryCode}`));
  }

  /**
   * Raggruppa le righe per ordine e ne fa il riepilogo.
   *
   * ⚠️ Le consegne senza un id vendita restano da sole, ognuna nel suo gruppo:
   * metterle insieme sotto una chiave vuota le farebbe sembrare un ordine solo
   * da centinaia di destinazioni — ed e' lo stesso errore del segnaposto
   * `legacyOrderId = 0`, che nel database tiene insieme 10.272 consegne che non
   * hanno niente a che vedere fra loro.
   */
  /**
   * La tariffa di incasso per un ordine.
   *
   * Si cerca prima quella del NEGOZIO — il piano Shopify e' del negozio, e su
   * «gifts» e' diverso dagli altri — e solo se non c'e' quella valida per tutti.
   * Senza gateway non si indovina: si torna `null` e chi chiama usa il ripiego,
   * dichiarandolo.
   */
  private tariffa(tariffe: TariffaIncasso[], gateway: string | null, brand: string | null): TariffaIncasso | null {
    if (!gateway) return null;
    return tariffe.find((t) => t.gateway === gateway && t.brand === brand)
      ?? tariffe.find((t) => t.gateway === gateway && t.brand == null)
      ?? null;
  }

  /**
   * Quello che il CLIENTE ha pagato online, dalla cache di Orders
   * (`OrdineCliente`, riempita dalla corsa notturna dei margini): prodotti e
   * consegna, per numero d'ordine Shopify. E' la fonte dei margini dove c'e'.
   */
  private async clientePagato(rows: CorrispettivoRow[]) {
    const numeri = [...new Set(rows.map((r) => r.realOrderNumber).filter(Boolean))] as string[];
    if (!numeri.length) return new Map<string, ClientePagato>();
    const righe = await this.prisma.ordineCliente.findMany({
      where: { orderId: { in: numeri } },
      select: { orderId: true, ordersId: true, brand: true, numero: true, prodotti: true, consegna: true, totale: true },
    });
    return new Map<string, ClientePagato>(righe.map((r) => [r.orderId, {
      prodotti: r.prodotti, consegna: r.consegna, totale: r.totale,
      ordersId: r.ordersId, brand: r.brand, numero: r.numero,
    }]));
  }

  /** L'indirizzo pubblico di Deluxy Orders (Impostazioni), per i link alle sue pagine. */
  private async ordersBase(): Promise<string | null> {
    const r = await this.prisma.appSetting.findUnique({ where: { key: 'ordersUrl' } });
    const v = r?.value?.trim().replace(/\/+$/, '');
    return v || null;
  }

  /**
   * L'ECONOMIA DELLE VENDITE per ordine Shopify, con LE STESSE formule della
   * pagina Finanza (computeRow + recap: niente doppioni che poi divergono).
   * Serve alla spinta verso Orders (deciso dall'utente il 26/08): per ogni
   * ordine si trasmettono guadagno netto IVA (pagato − valore prodotti ÷
   * 1,22), la quota registrata lorda e il margine finale.
   */
  async economiaVendite(): Promise<Map<string, { venduto: number; primoMargine: number; feeVendita: number; margineFinale: number; metodoIncasso: string | null; commissioneIncassi: number }>> {
    const corporate = await this.idVenditeDaCorporate();
    const deliveries = await this.prisma.delivery.findMany({
      where: {
        deletedAt: null,
        status: { notIn: STATI_ESCLUSI },
        realOrderNumber: { not: null },
        ...(corporate.length ? { id: { notIn: corporate } } : {}),
        ...this.ambito(true),
      },
      include: {
        partner: { select: { insegna: true, commissionPercent: true } },
        serviceType: { select: { name: true, pricingModel: true } },
        products: {
          include: {
            product: { select: { name: true, price: true, publicPrice: true, category: { select: { name: true } } } },
            productVariant: { select: { name: true, publicPrice: true } },
          },
        },
      },
    });
    const rows = deliveries.map((d) => this.computeRow(d));
    const ordini = this.recap(rows, await this.tariffe(), await this.clientePagato(rows));
    const mappa = new Map<string, { venduto: number; primoMargine: number; feeVendita: number; margineFinale: number; metodoIncasso: string | null; commissioneIncassi: number }>();
    for (const o of ordini) {
      const numero = o.righe.map((r) => r.realOrderNumber).find(Boolean);
      if (!numero) continue;
      mappa.set(numero, {
        // Il valore vendite dell'ordine (prodotti + consegna pagati): la base
        // su cui si legge la percentuale del margine.
        venduto: Math.round((o.saleValue + o.deliveryFee) * 100) / 100,
        primoMargine: o.takingsNet,
        feeVendita: o.feeContract,
        margineFinale: o.totalMargin,
        // L'incasso (27/08): il metodo di pagamento del gruppo e la commissione
        // stimata dalla tariffa del gateway (zero per il contante).
        metodoIncasso: o.gateway ?? null,
        commissioneIncassi: o.incassiCommission,
      });
    }
    return mappa;
  }

  private recap(
    rows: CorrispettivoRow[],
    tariffe: TariffaIncasso[] = [],
    cliente: Map<string, ClientePagato> = new Map(),
    ordersBase: string | null = null,
  ): RecapOrdine[] {
    const gruppi = new Map<string, CorrispettivoRow[]>();
    for (const r of rows) {
      const k = r.saleRef ?? `consegna-${r.deliveryCode}`;
      if (!gruppi.has(k)) gruppi.set(k, []);
      gruppi.get(k)!.push(r);
    }
    return [...gruppi.entries()].map(([saleRef, g]) => {
      // ⭐⭐ QUANTO HA PAGATO IL CLIENTE, e non e' la somma delle consegne.
      //
      // Deciso dall'utente il 25/08/2026 sull'ordine 2696: un solo prodotto
      // («Dolci Abbracci», 210 €) a un solo destinatario, spezzato su DUE
      // partner — l'orsacchiotto a Fao Schwarz, la cappelliera a Cannavo'. Il
      // prezzo del prodotto sta scritto su tutte e due le consegne, quindi
      // sommandole la pagina diceva **420 €** dove il cliente ne ha pagati 210.
      //
      // La regola: un prodotto si conta UNA volta per ordine. Due consegne che
      // portano la stessa riga (stesso prodotto, stessa quantita', stesso
      // prezzo) sono due pezzi dello stesso acquisto; due righe diverse sono
      // due acquisti e si sommano.
      //
      // ⚠️ E il guadagno viene di conseguenza: pagato dal cliente meno la somma
      // dei valori dati ai partner — 210 − (35,12 + 100) = 74,88 €, non 284,88.
      const viste = new Set<string>();
      let publicPrice = 0;
      for (const r of g) {
        for (const pr of r.prodotti) {
          const impronta = [pr.nome, pr.quantita, pr.prezzo].join("|");
          if (viste.has(impronta)) continue;
          viste.add(impronta);
          publicPrice += pr.prezzo * pr.quantita;
        }
      }
      publicPrice = round2(publicPrice);
      // ⚠️ UNA volta sola: le spese di consegna sono dell'ordine.
      let deliveryFee = round2(Math.max(0, ...g.map((r) => r.deliveryFee)));
      // ⭐⭐ DOVE L'ORDINE SHOPIFY C'E', comanda LUI (deciso dall'utente il
      // 26/08): nelle consegne sta il prezzo concordato col PARTNER, ma nei
      // margini conta quello che il CLIENTE ha pagato online — prodotti e
      // consegna, dalla cache di Orders. Il 12731 stava a 35 € di venduto
      // (il concordato con Cannavo) dove il cliente ne aveva pagati 45 + 15.
      const pagato = g.map((r) => r.realOrderNumber).map((n) => (n ? cliente.get(n) : undefined)).find(Boolean);
      const fonteCliente = !!pagato;
      if (pagato) {
        publicPrice = round2(pagato.prodotti);
        deliveryFee = round2(pagato.consegna);
      }
      const valore = round2(publicPrice + deliveryFee);
      const partnerPrice = round2(g.reduce((s, r) => s + r.partnerPrice, 0));
      // Il guadagno e' la differenza fra quello che ha pagato il cliente e la
      // somma di quanto e' andato ai partner. Non si sommano i guadagni delle
      // singole consegne: ciascuno era calcolato su un prezzo ripetuto.
      const takings = round2(valore - partnerPrice);
      // ⚠️ Pagato al partner sopra il valore della vendita: niente scorporo
      // IVA (deciso dall'utente 26/08) — la colonna IVA resta a zero e la
      // perdita si legge intera.
      const takingsNet = takings < 0 ? takings : round2(takings / (1 + VAT));
      // Il costo del giro e' la somma dei costi delle singole consegne.
      const deliveryCost = round2(g.reduce((s, r) => s + r.deliveryCost, 0));
      // ⚠️ LA COMMISSIONE E' DI UNA TRANSAZIONE, quindi si conta una volta per
      // ORDINE: la quota fissa moltiplicata per il numero di consegne sarebbe
      // un costo inventato. E la fissa non e' trascurabile — 0,30 € su un
      // ordine da 8 € sono il 3,75%, piu' della percentuale.
      const gateway = g.find((r) => r.paymentGateway)?.paymentGateway ?? null;
      const brand = g.find((r) => r.paymentBrand)?.paymentBrand ?? null;
      const tar = this.tariffa(tariffe, gateway, brand);
      const incassiCommission = tar
        ? round2((valore * tar.percentuale) / 100 + tar.fissa)
        : round2(valore * INCASSI);   // metodo sconosciuto: zero, e si dichiara
      return {
      saleRef,
      consegne: g.length,
      saleValue: publicPrice,
      /// Il venduto viene dall'ordine Shopify (pagato dal cliente), non dalle righe.
      fonteCliente,
      // Il link porta alla pagina dell'ordine in Deluxy Orders: e' lei che
      // conosce il dominio Shopify del brand, e il bottone verso l'admin ce
      // l'ha gia'.
      ordersLink: pagato?.ordersId && ordersBase ? `${ordersBase}/ordini/${pagato.ordersId}` : null,
      brand: pagato?.brand ?? null,
      // Il numero umano dell'ordine ("#12731"): a schermo si legge lui, non
      // il gid Shopify da 14 cifre che ora fa da chiave di gruppo. Dove la
      // cache non ce l'ha (45 ordini di negozi fuori dal registro di Orders,
      // es. BusinessSales) si ripiega sul riferimento CORTO della consegna:
      // 62955 ha legacySaleId 1054, e «1054» si legge — «9037674905864» no.
      numeroOrdine: pagato?.numero ?? etichettaUmana(g),
      // Almeno una consegna del giro ha il venduto stimato dalla variante
      // (listino di oggi, non fotografia): il totale va letto sapendolo.
      // Se la fonte e' il cliente la stima non c'entra piu'.
      vendutoStimato: !fonteCliente && g.some((r) => r.vendutoStimato),
      // Il valore piu' alto fra le consegne del gruppo: nell'import ogni
      // consegna di un ordine riceve lo stesso importo, e dove manca vale zero.
      deliveryFee,
      // ⚠️ Per la regola carnet il giro si paga una volta, non una per
      // destinazione. Qui si somma quello che risulta PAGATO davvero, e
      // `consegnePagate` dice se sono piu' di uno.
      deliveryCost,
      partnerPrice,
      takings,
      takingsNet,
      feeContract: round2(g.reduce((s, r) => s + r.feeContract, 0)),
      feePercent: valore > 0 ? round2((takingsNet / valore) * 100) : 0,
      vat: round2(takings - takingsNet),
      incassiCommission,
      // La fee registrata e' ricavo e nel margine ci va (26/08), LORDA:
      // «per le fee non c'e' da togliere IVA» (l'utente).
      totalMargin: round2(takingsNet + g.reduce((s, r) => s + r.feeContract, 0) - deliveryCost - incassiCommission),
      totalMarginPercent: valore > 0 ? round2(((takingsNet + g.reduce((s, r) => s + r.feeContract, 0) - deliveryCost - incassiCommission) / valore) * 100) : 0,
      anomalie: g.filter((r) => r.anomalia).length,
      gateway,
      commissioneConfermata: tar ? tar.confermata : false,
      consegnePagate: g.filter((r) => r.deliveryCost > 0).length,
      // ⚠️ La regola «il giro si paga una volta» vale solo DENTRO LO STESSO
      // GIORNO (deciso dall'utente 26/08): lo stesso ordine consegnato in due
      // giorni sono due viaggi, e due paghe sono normali — #12649 (17 e 18/08)
      // veniva segnato in anomalia a torto.
      piuPagheStessoGiorno: (() => {
        const perGiorno = new Map<string, number>();
        for (const r of g) {
          if (r.deliveryCost <= 0) continue;
          const giorno = String(r.date ?? '').slice(0, 10);
          perGiorno.set(giorno, (perGiorno.get(giorno) ?? 0) + 1);
        }
        return [...perGiorno.values()].some((n) => n > 1);
      })(),
      righe: g,
    };
    }).sort((a, b) => b.saleValue - a.saleValue);
  }

  /**
   * Totali del periodo (riga «Totale» + tab Margini).
   *
   * ⚠️ Somma le STESSE righe che la tabella mostra, filtri compresi: un totale
   * calcolato su un insieme diverso da quello elencato e' la cosa piu' facile
   * da sbagliare e la piu' difficile da accorgersene — i numeri sono tutti
   * plausibili, solo non si sommano.
   */
  async summary(
    from?: string,
    to?: string,
    opzioni: { partnerId?: string; cerca?: string; soloVendite?: boolean; margine?: string; brand?: string } = {},
  ) {
    const soloVendite = opzioni.soloVendite ?? true;
    const rows = await this.corrispettivi(from, to, { ...opzioni, limite: 5000 });
    // ⚠️ Un filtro che toglie righe va DETTO, come il tetto delle 5.000: se la
    // pagina mostra 154 consegne dove il periodo ne ha 558, chi guarda deve
    // sapere che le altre 404 non sono sparite, sono di un altro mestiere.
    const escluse = soloVendite
      ? await this.prisma.delivery.count({
          where: {
            deletedAt: null,
            status: { notIn: STATI_ESCLUSI },
            ...this.dateWhere(from, to),
            serviceType: { pricingModel: { not: MODELLO_VENDITA } },
            ...this.filtri(opzioni),
          },
        })
      : 0;
    // Le gambe d'acquisto degli ordini corporate tolte dall'ambito: si contano
    // e si dichiarano, o l'esclusione sembrerebbe un buco nei dati.
    const idCorporate = soloVendite ? await this.idVenditeDaCorporate() : [];
    const escluseCorporate = idCorporate.length
      ? await this.prisma.delivery.count({
          where: {
            id: { in: idCorporate },
            status: { notIn: STATI_ESCLUSI },
            ...this.dateWhere(from, to),
            ...this.filtri(opzioni),
          },
        })
      : 0;
    // ⚠️ «Nessuna vendita nel periodo» non e' una risposta quando la vendita
    // ESISTE. Cercando 12792 la pagina diceva cosi', ma quell'ordine ha tre
    // consegne del 25/08, tutte di vendita e tutte nel periodo: erano
    // `assigned`, `accepted` e `cancelled`, cioe' non ancora consegnate. La
    // pagina fa bene a non contarle — il ricavo non e' fermo — e fa male a non
    // dirlo: chi cerca resta a chiedersi se il dato manca o se e' rotto.
    const altrove = opzioni.cerca?.trim() && rows.length === 0
      ? await this.doveSono(from, to, opzioni)
      : null;
    // ⚠️ IL TOTALE SOMMA GLI ORDINI, perche' e' quello che la tabella mostra.
    //
    // Prima sommava le CONSEGNE, e due voci non tornavano: le spese di consegna
    // sono dell'ordine (una riga per destinazione le contava piu' volte) e la
    // commissione incassi si calcola sul valore dell'ordine, non su quello di
    // ciascuna consegna. Il risultato era un piede di tabella che non era la
    // somma di cio' che si leggeva sopra — la cosa piu' facile da sbagliare e la
    // piu' difficile da accorgersene, perche' tutti i numeri restano plausibili.
    const ordini = this.perFascia(
      this.recap(rows, await this.tariffe(), await this.clientePagato(rows), await this.ordersBase()),
      opzioni.margine,
    );
    // I brand fra cui filtrare: quelli visti nella cache degli ordini.
    const brands = (await this.prisma.ordineCliente.groupBy({ by: ['brand'], where: { brand: { not: null } } }))
      .map((b) => b.brand as string).sort();
    const sum = (f: (o: RecapOrdine) => number) => round2(ordini.reduce((s, o) => s + f(o), 0));
    const publicPrice = sum((o) => o.saleValue);
    const deliveryFee = sum((o) => o.deliveryFee);
    const saleValue = round2(publicPrice + deliveryFee);
    const takings = sum((o) => o.takings);
    const totalMargin = sum((o) => o.totalMargin);
    return {
      deliveries: ordini.reduce((s, o) => s + o.consegne, 0),
      /** Consegne a buon fine del periodo che NON sono vendite (fuori ambito). */
      excluded: escluse,
      /** Vendite del canale corporate (Business), fuori dai corrispettivi D2C. */
      escluseCorporate,
      /** Righe non attendibili: si contano, non si nascondono. */
      anomalie: rows.filter((r) => r.anomalia).length,
      /** Se la ricerca non trova niente: dove sta quello che si cercava. */
      altrove,
      publicPrice,
      deliveryFee,
      saleValue,
      /** Gli ordini del periodo, col loro riepilogo: sono le righe della tabella. */
      ordini,
      /** I brand noti (dalla cache degli ordini): le opzioni del filtro Brand. */
      brands,
      /** Quanti ordini: il conteggio delle righe di primo livello. */
      ordiniTotali: ordini.length,
      /** Ordini in cui risulta pagata piu' di una consegna: regola non applicata. */
      // Solo i giri con piu' paghe NELLO STESSO GIORNO: giorni diversi = viaggi diversi.
      ordiniConPiuPaghe: ordini.filter((o) => o.piuPagheStessoGiorno).length,
      /** Ordini la cui commissione di incasso e' una stima, non una tariffa confermata. */
      commissioniStimate: ordini.filter((o) => !o.commissioneConfermata).length,
      partnerPrice: sum((o) => o.partnerPrice),
      takings,
      takingsNet: sum((o) => o.takingsNet),
      feeContract: sum((o) => o.feeContract),
      feePercent: saleValue > 0 ? round2((sum((o) => o.takingsNet) / saleValue) * 100) : 0,
      deliveryCost: sum((o) => o.deliveryCost),
      vat: sum((o) => o.vat),
      incassiCommission: sum((o) => o.incassiCommission),
      totalMargin,
      totalMarginPercent: saleValue > 0 ? round2((totalMargin / saleValue) * 100) : 0,
    };
  }

  /**
   * Quando la ricerca non trova niente, dove sono finite le consegne che
   * corrispondono lo stesso.
   *
   * Tre motivi, in ordine di quanto sono facili da fraintendere:
   *  - ci sono ma sono ANNULLATE (l'unico stato che non porta ricavo);
   *  - ci sono ma sono FUORI dal periodo scelto;
   *  - ci sono ma non sono vendite (fuori dall'ambito della pagina).
   */
  /** Il listino delle commissioni, letto una volta per richiesta. */
  private async tariffe(): Promise<TariffaIncasso[]> {
    return this.prisma.commissioneIncasso.findMany({
      where: { attiva: true },
      select: { gateway: true, brand: true, percentuale: true, fissa: true, confermata: true },
    });
  }

  private async doveSono(
    from: string | undefined,
    to: string | undefined,
    opzioni: { partnerId?: string; cerca?: string },
  ) {
    const testo = this.filtri(opzioni);
    const vivo = { deletedAt: null };
    const [annullate, fuoriPeriodo, nonVendite] = await Promise.all([
      this.prisma.delivery.count({
        where: { ...vivo, ...testo, ...this.dateWhere(from, to),
          serviceType: { pricingModel: MODELLO_VENDITA },
          status: { in: STATI_ESCLUSI } },
      }),
      this.prisma.delivery.count({
        where: { ...vivo, ...testo, serviceType: { pricingModel: MODELLO_VENDITA },
          status: { notIn: STATI_ESCLUSI },
          NOT: this.dateWhere(from, to) },
      }),
      this.prisma.delivery.count({
        where: { ...vivo, ...testo, serviceType: { pricingModel: { not: MODELLO_VENDITA } } },
      }),
    ]);
    const totale = annullate + fuoriPeriodo + nonVendite;
    return totale ? { totale, annullate, fuoriPeriodo, nonVendite } : null;
  }

  private computeRow(d: any): CorrispettivoRow {
    const lines: any[] = d.products ?? [];
    // Il prezzo pubblico e' la fotografia di quel giorno, non il catalogo di oggi.
    // ⚠️ RIPIEGO DICHIARATO (deciso dall'utente il 25-26/08): dove la riga non
    // ha un prezzo scritto si scala di un gradino alla volta — pubblico della
    // VARIANTE, poi pubblico del PRODOTTO, poi il suo prezzo base (che per i
    // fiorai vecchio stile E' il prezzo di vendita: «Bouquet Rose Rosa €70»,
    // base 70). Cosi' si recupera tutto il recuperabile: 201 vendite contavano
    // ZERO venduto pur avendo il prezzo a catalogo. `vendutoStimato` lo dice a
    // schermo: e' il listino di oggi, non la fotografia di quel giorno.
    const prezzoRiga = (l: any): { v: number; stimato: boolean } => {
      if (l.price != null) return { v: l.price, stimato: false };
      const stima = l.productVariant?.publicPrice
        ?? l.product?.publicPrice
        ?? l.product?.price;
      return stima != null ? { v: stima, stimato: true } : { v: 0, stimato: false };
    };
    let vendutoStimato = false;
    const publicPrice = lines.reduce((s, l) => {
      const { v, stimato } = prezzoRiga(l);
      if (stimato) vendutoStimato = true;
      return s + v * (l.quantity ?? 1);
    }, 0);
    const deliveryFee = d.deliveryPrice ?? 0;
    const saleValue = publicPrice + deliveryFee;
    // ⚠️ SI LEGGE, non si calcola. E il vuoto resta vuoto: dove `productValue`
    // manca (418 vendite) non si mette zero, si dichiara — con zero il partner
    // risulterebbe non aver preso niente e il guadagno sarebbe tutto nostro.
    const haValorePartner = (d.productValue ?? 0) > 0;
    const partnerPrice = d.productValue ?? 0;
    const takings = haValorePartner ? saleValue - partnerPrice : 0;
    // ⚠️ Se il pagato al partner SUPERA il valore della vendita non c'e' IVA
    // da scorporare (deciso dall'utente 26/08): la perdita e' tutta perdita,
    // non −10 di cui −1,80 «di IVA».
    const takingsNet = takings < 0 ? takings : takings / (1 + VAT);
    // L'IVA e' quella gia' tolta dal guadagno: si mostra, non si risottrae.
    const vat = takings - takingsNet;
    const feeContractAmount = Math.max(0, (d.price ?? 0) + (d.additionalPrice ?? 0));
    // ⚠️ Netto su lordo darebbe una percentuale piu' bassa del vero e nessuno
    // saprebbe di quale delle due sta guardando: l'utente la vuole sul NETTO.
    const feePercent = saleValue > 0 && haValorePartner ? (takingsNet / saleValue) * 100 : 0;
    // ⚠️ Se la consegna non e' pagabile, il suo costo e' ZERO: l'importo resta
    // scritto sulla riga (serve a sapere quanto sarebbe valsa) ma non si paga.
    // Segnalato dall'utente il 25/08/2026. Misurato: 817 vendite a buon fine
    // hanno `payable = false` e un importo scritto lo stesso, per **10.463,15 €**
    // che la pagina contava come costo — su tutte le consegne sono 1.280 per
    // 16.071,10 €. Sono i giri in cui una sola consegna porta la paga e le altre
    // no, cioe' proprio le regole carnet.
    // ⚠️ MAI SOTTO ZERO (27/08): il legacy registrava il CONTANTE trattenuto
    // dal valet come minus sulla paga (es. #31675: minus −1.237,60 su una paga
    // di 15) — un «costo negativo» che GONFIAVA il margine dell'ordine di
    // quell'importo. Il contante e' cassa, non un ricavo della consegna.
    const deliveryCost = d.payable === false ? 0 : Math.max(0, (d.valetSalary ?? 0) + (d.valetAdditionalPrice ?? 0));
    const incassiCommission = saleValue * INCASSI;
    // ⭐ LA FEE REGISTRATA E' RICAVO, e nel margine ci va (deciso dall'utente
    // il 26/08): il partner non riceve il valore prodotti intero ma quel
    // valore MENO la quota (cosi' la legge anche la Fatturazione: «dovuto =
    // valore prodotti − trattenuto»). LORDA: «per le fee non c'e' da togliere
    // IVA» (l'utente, 26/08 sera).
    const totalMargin = takingsNet + feeContractAmount - deliveryCost - incassiCommission;
    const feeContract = d.partner?.commissionPercent ?? 0;
    // ⚠️ Le tre cose che rendono la riga non attendibile, in ordine di gravita'.
    // Un guadagno a zero NON e' fra queste: con un partner a fee 0% e' una
    // scelta commerciale, non un buco (delle 3.003 vendite senza quota, 2.880
    // erano proprio questo — accusarle tutte avrebbe segnalato righe sane).
    const anomalia: Anomalia =
      saleValue <= 0
        ? 'venduto_a_zero'
        : !haValorePartner
          ? 'valore_partner_mancante'
          : partnerPrice > saleValue
            ? 'partner_oltre_pubblico'
            : null;
    const first = lines[0];
    const productLabel = lines.length
      ? lines.length > 1
        ? `${first?.product?.name ?? first?.productName ?? '—'} +${lines.length - 1}`
        : (first?.product?.name ?? first?.productName ?? '—')
      : '—';
    return {
      deliveryId: d.id,
      deliveryCode: d.code,
      // ⚠️ ZERO NON E' UN RIFERIMENTO. `legacyOrderId = 0` e' il segnaposto di
      // chi un ordine non ce l'ha, e sotto quel valore stanno 10.272 consegne:
      // lasciarlo passare qui faceva comparire nel riepilogo un «ordine 0» con
      // 23 consegne che non hanno niente in comune. Lo stesso vale per una
      // stringa vuota o per uno zero scritto come testo.
      saleRef: riferimentoVendita(d),
      realOrderNumber: d.realOrderNumber ?? null,
      legacySaleRef: buono(d.legacySaleId),
      ddtRef: buono(d.ddtNumber),
      status: d.status,
      date: d.date,
      product: productLabel,
      category: first?.product?.category?.name ?? null,
      service: d.serviceType?.name ?? '—',
      partner: d.partner?.insegna ?? '—',
      publicPrice: round2(publicPrice),
      vendutoStimato,
      deliveryFee: round2(deliveryFee),
      saleValue: round2(saleValue),
      partnerPrice: round2(partnerPrice),
      takings: round2(takings),
      takingsNet: round2(takingsNet),
      feeContract: round2(feeContractAmount),
      feePercent: round2(feePercent),
      feePercentContract: round2(feeContract),
      deliveryCost: round2(deliveryCost),
      vat: round2(vat),
      incassiCommission: round2(incassiCommission),
      totalMargin: round2(totalMargin),
      totalMarginPercent: saleValue > 0 ? round2((totalMargin / saleValue) * 100) : 0,
      anomalia,
      paymentGateway: d.paymentGateway ?? null,
      paymentBrand: d.paymentBrand ?? null,
      prodotti: lines.map((l) => ({
        nome: String(l.product?.name ?? l.productName ?? '?')
          + (l.variantName || l.productVariant?.name ? ` (${l.variantName ?? l.productVariant?.name})` : ''),
        quantita: l.quantity ?? 1,
        prezzo: round2(prezzoRiga(l).v),
      })),
    };
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Il riferimento della vendita, fra i tre campi in cui la piattaforma lo tiene.
 *
 * ⚠️ Scarta lo ZERO e il vuoto: sono segnaposto, non identificatori. Un
 * identificatore che vale zero su meta' tabella non identifica niente, e
 * raggruppare per lui mette insieme consegne estranee.
 */
function riferimentoVendita(d: any): string | null {
  // ⚠️ PRIMA il numero d'ordine Shopify: e' l'identita' vera dell'ordine.
  // Su alcune vendite `legacySaleId` porta un codice di transazione
  // (081000831922…) diverso per ogni consegna DELLO STESSO ordine: mettendolo
  // per primo, l'ordine #12801 usciva spezzato in due righe con id illeggibili.
  return buono(d.realOrderNumber) ?? buono(d.legacySaleId) ?? buono(d.legacyOrderId) ?? buono(d.ddtNumber) ?? null;
}

/** Un valore usabile come riferimento: né vuoto né lo zero segnaposto. */
function buono(v: unknown): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  if (!t || t === '0') return null;
  return t;
}

/**
 * Un riferimento LEGGIBILE per l'ordine quando la cache non ha il numero:
 * il primo fra saleId e DDT delle consegne che sia corto (fino a 8 caratteri).
 * I codici di transazione (081000831922…) e i gid Shopify restano fuori.
 */
function etichettaUmana(g: { legacySaleRef?: string | null; ddtRef?: string | null }[]): string | null {
  for (const r of g) {
    for (const v of [r.legacySaleRef, r.ddtRef]) {
      const t = String(v ?? '').trim();
      if (t && t !== '0' && t.length <= 8) return t;
    }
  }
  return null;
}

@ApiTags('finance')
@ApiBearerAuth()
@Controller('finance')
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  /** Finanza/marginalita': solo admin (compresi gli admin "support"). */
  private assertAdmin(user: JwtUser) {
    if (user.role !== Role.ADMIN) {
      throw new ForbiddenException('Sezione Finanza riservata agli admin');
    }
  }

  /** `soloVendite`: assente o diverso da `false` = solo servizi di VENDITA. */
  private soloVendite(v?: string): boolean {
    return v !== 'false' && v !== '0';
  }

  @Get('corrispettivi')
  @ApiOperation({
    summary: 'Corrispettivi delle consegne a buon fine di tipo VENDITA (solo admin)',
  })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'partnerId', required: false })
  @ApiQuery({ name: 'cerca', required: false, description: 'Numero ordine/consegna, destinatario o partner' })
  @ApiQuery({ name: 'limite', required: false })
  @ApiQuery({
    name: 'soloVendite',
    required: false,
    description: 'Predefinito true: solo i servizi di tipo VENDITA. `false` per tutte le consegne',
  })
  @ApiQuery({
    name: 'margine',
    required: false,
    description: 'Fascia di margine dell ordine: negativo | minimo (entro 5%, negativo compreso) | basso (entro 15%, minimo e negativo compresi)',
  })
  corrispettivi(
    @CurrentUser() user: JwtUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('partnerId') partnerId?: string,
    @Query('cerca') cerca?: string,
    @Query('limite') limite?: string,
    @Query('soloVendite') soloVendite?: string,
    @Query('margine') margine?: string,
    @Query('brand') brand?: string,
  ) {
    this.assertAdmin(user);
    return this.financeService.corrispettivi(from, to, {
      partnerId,
      cerca,
      limite: limite ? Number(limite) : undefined,
      soloVendite: this.soloVendite(soloVendite),
      margine,
      brand,
    });
  }

  @Get('economia-vendite')
  @ApiOperation({
    summary: "L'economia di ogni vendita per ordine Shopify (primo margine, fee, margine finale) — per la spinta verso Orders",
  })
  async economiaVendite(@CurrentUser() user: JwtUser) {
    this.assertAdmin(user);
    const mappa = await this.financeService.economiaVendite();
    return Object.fromEntries(mappa);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Totali del periodo (solo admin)' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'partnerId', required: false })
  @ApiQuery({ name: 'cerca', required: false })
  @ApiQuery({ name: 'soloVendite', required: false, description: 'Predefinito true' })
  @ApiQuery({ name: 'margine', required: false, description: 'negativo | minimo | basso' })
  summary(
    @CurrentUser() user: JwtUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('partnerId') partnerId?: string,
    @Query('cerca') cerca?: string,
    @Query('soloVendite') soloVendite?: string,
    @Query('margine') margine?: string,
    @Query('brand') brand?: string,
  ) {
    this.assertAdmin(user);
    return this.financeService.summary(from, to, {
      partnerId,
      cerca,
      soloVendite: this.soloVendite(soloVendite),
      margine,
      brand,
    });
  }
}

@Module({
  imports: [PrismaModule],
  controllers: [FinanceController],
  providers: [FinanceService],
  exports: [FinanceService],
})
export class FinanceModule {}
