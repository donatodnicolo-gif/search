// ============================================================
// RICONCILIAZIONI PRODOTTO × PROVINCIA → PARTNER A UN PREZZO
// (04/09/2026, regola utente — seconda stesura, la prima usava l'AI)
// ------------------------------------------------------------
// «Se un prodotto in una vendita non è unico, o è non-unico ma per quella
// provincia non ha una riconciliazione, mostra prodotto, provincia, partner e
// prezzo dato, con due bottoni: accetta e rifiuta. Se accetta, le prossime
// vendite andranno in automatico; se rifiuta non sarà mai più proposta. Metti
// anche un modifica per modificare la riconciliazione.»
//
// ⭐ LA REGOLA: una riga per coppia (prodotto, provincia). Nasce come PROPOSTA
// dalle vendite accettate — a chi è andata davvero, a che prezzo — e diventa
// REGOLA quando una persona la accetta: da lì lo smistamento propone quel
// prodotto, in quella provincia, SOLO a quel partner e a quel prezzo
// (`SalesService.candidati`, prima della lista di priorità). Rifiutata = non
// si ripropone più. Modificabile in ogni momento (partner, prezzo, sconto).
//
// ⚠️ Niente AI qui: la proposta è un fatto (la vendita c'è stata), non un
// giudizio. I numeri li fa il codice e la decisione la prende l'ufficio.
// L'`AiService.strutturato` resta per chi vorrà un parere in più.
// ============================================================
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtUser, Public, Roles } from '../common/decorators';
import { Role, SaleStatus } from '../common/enums';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';

/** Finestra della corsa notturna, in giorni. */
const GIORNI_NOTTE = 90;

type StatPartner = {
  partnerId: string;
  insegna: string;
  attivo: boolean;
  vendite: number;
  quotaPercento: number;
  prezzoMin: number;
  prezzoMax: number;
  prezzoModa: number;
  /** Quanto è stato DATO al partner, il più delle volte: il prezzo del patto. */
  nettoModa: number;
  /** true = il numero viene dal conto della vendita, non da una consegna. */
  daSuggerimento?: boolean;
  /** ⭐ 08/09/2026: il conto, quando il patto nasce da più pezzi: 8 € × 15. */
  perPezzi?: { unitario: number | null; pezzi: number } | null;
  scontoMedio: number;
  ultimaVendita: string;
};

const arrotonda = (n: number) => Math.round(n * 100) / 100;

/**
 * ⭐ 08/09/2026 — LA RIGA DI RIPIEGO PARLA DELLO STESSO PRODOTTO?
 *
 * Quando la consegna non ha una riga con lo stesso `productId` della vendita, si
 * ripiega sull'unica riga presente. Spesso è giusto — «Torta Chantilly - 6» per
 * «Torta Chantilly» è la stessa cosa — ma non sempre: su un prodotto COMPOSTO la
 * consegna di un fornitore copre solo la SUA parte, e allora quel prezzo non è il
 * patto per l'intero prodotto.
 *
 * Misurato sulle 109 riconciliazioni con un prezzo: col solo `productId` sarebbero
 * finite fra i «suggerimenti» 74 su 109 — cioè il flag non avrebbe più detto niente.
 * Guardando anche il NOME restano 15, e sono i casi veri: «Cofanetto Pregiate Praline»
 * su «Rose Rosse e Praline d'Autore» (30 € su 175: le praline, non le rose), «Wine» su
 * un bouquet di lavanda, «Colazione Malià 50€» su «Bouquet Purezza Eterea», e
 * «Bouquet Beethoven» su una «Red Velvet Rose Cake» — quest'ultimo al 106% del prezzo
 * pubblico, cioè un patto che ci farebbe pagare più di quanto incassiamo.
 *
 * Una riga senza nome non è una conferma: non si può dire di cosa parli.
 */
function parlaDelloStessoProdotto(nomeRiga?: string | null, nomeProdotto?: string | null): boolean {
  const norm = (x?: string | null) =>
    String(x ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, ' ').trim();
  const a = norm(nomeRiga), b = norm(nomeProdotto);
  if (!a || !b) return false;
  if (a.includes(b) || b.includes(a)) return true;
  // Stessa prima parola significativa: «Bouquet Morricone - Medio» e «Bouquet Morricone».
  const prima = (t: string) => t.split(' ').filter((w) => w.length >= 4)[0] ?? '';
  return prima(a) !== '' && prima(a) === prima(b);
}

function moda(valori: number[]): number {
  const conta = new Map<number, number>();
  for (const v of valori) conta.set(arrotonda(v), (conta.get(arrotonda(v)) ?? 0) + 1);
  let migliore = arrotonda(valori[0] ?? 0);
  let max = 0;
  for (const [v, n] of conta) {
    if (n > max || (n === max && v > migliore)) {
      max = n;
      migliore = v;
    }
  }
  return migliore;
}

@Injectable()
export class RiconciliazioniService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * ⭐ PARTNER ESCLUSI (04/09/2026, regola utente: «escludi da riconciliazioni
   * l'artista locale»). Una lista di ID in `AppSetting`, non un nome nel
   * codice: i nomi cambiano e due partner possono chiamarsi uguale, l'id no.
   * Le loro vendite non generano proposte e non si possono scegliere nella
   * modifica. ⚠️ Non tocca le regole GIÀ accettate: quelle le ha decise una
   * persona e si cambiano a mano (l'endpoint dice quante ne sono coinvolte).
   */
  private async esclusiIds(): Promise<string[]> {
    const s = await this.prisma.appSetting.findUnique({ where: { key: 'riconciliazioniPartnerEsclusi' } });
    return (s?.value ?? '').split(',').map((t) => t.trim()).filter(Boolean);
  }

  /** Gli esclusi con l'insegna, per la pagina. */
  async esclusi() {
    const ids = await this.esclusiIds();
    if (!ids.length) return { partner: [] as { id: string; insegna: string }[] };
    const partner = await this.prisma.partner.findMany({
      where: { id: { in: ids } },
      select: { id: true, insegna: true },
      orderBy: { insegna: 'asc' },
    });
    return { partner };
  }

  /** Riscrive la lista degli esclusi e dice quante regole attive li riguardano. */
  async impostaEsclusi(partnerIds: string[]) {
    const ids = [...new Set((partnerIds ?? []).map((t) => String(t).trim()).filter(Boolean))];
    if (ids.length) {
      const esistono = await this.prisma.partner.count({ where: { id: { in: ids } } });
      if (esistono !== ids.length) throw new BadRequestException('Uno dei partner indicati non esiste.');
    }
    const value = ids.join(',');
    await this.prisma.appSetting.upsert({
      where: { key: 'riconciliazioniPartnerEsclusi' },
      update: { value },
      create: { key: 'riconciliazioniPartnerEsclusi', value },
    });
    const regoleAttive = ids.length
      ? await this.prisma.productReconciliation.count({ where: { partnerId: { in: ids }, status: 'accettata' } })
      : 0;
    return { ...(await this.esclusi()), regoleAttive };
  }

  /** I partner attivi non esclusi (per aggiungere un escluso dalla pagina). */
  async partnerAttivi() {
    const esclusi = await this.esclusiIds();
    return this.prisma.partner.findMany({
      where: { active: true, ...(esclusi.length ? { id: { notIn: esclusi } } : {}) },
      select: { id: true, insegna: true },
      orderBy: { insegna: 'asc' },
    });
  }

  /**
   * Le PROPOSTE dalle vendite accettate in [da, a]: per ogni coppia
   * (prodotto NON unico, provincia) senza una riga già decisa, si scrive o
   * si aggiorna la proposta col partner più frequente e il suo prezzo più
   * frequente. Ritorna i conteggi e le righe toccate: il lancio manuale
   * mostra subito che cosa ha trovato.
   */
  async genera(opts: { da: Date; a: Date; innesco: 'notte' | 'manuale' }) {
    if (isNaN(opts.da.getTime()) || isNaN(opts.a.getTime())) throw new BadRequestException('Intervallo di date non valido.');
    if (opts.da > opts.a) throw new BadRequestException('La data «da» viene dopo la data «a».');

    // Le vendite andate a un partner ESCLUSO non generano proposte.
    const esclusi = await this.esclusiIds();
    const vendite = await this.prisma.sale.findMany({
      where: {
        status: 'accettata',
        partnerId: { not: null, ...(esclusi.length ? { notIn: esclusi } : {}) },
        // ⭐ 07/09/2026 (segnalazione utente: «perché in riconciliazioni esce El Mourad se non
        // è attivo?»). Le vendite le aveva accettate davvero — 1797 a Monza, 1794 a Brescia,
        // 1808 a Como — ma il partner adesso è spento e cancellato: proporlo come fornitore
        // fisso è una proposta che non può andare a buon fine, perché lo smistamento salta
        // comunque chi non è attivo. Non è «non ha fatto lui l'ordine»: è che non c'è più.
        // Stesso motivo per gli ESCLUSI DALLE PROPOSTE (Artista Locale, Deluxy Flowers,
        // Cakedesignme): lo smistamento non li propone mai, quindi una proposta con il loro
        // nome non può diventare un patto.
        partner: { active: true, deleted: false, esclusoDalleProposte: false },
        productId: { not: null },
        createdAt: { gte: opts.da, lte: opts.a },
        // ⭐ 07/09/2026 (regola utente): le proposte servono SOLO dove il prezzo non ce l'ha
        // già una regola. Un prodotto «mix» prende la percentuale del territorio, uno «a
        // quantità» il prezzo unitario del partner: per quelli un patto prodotto/provincia
        // sarebbe una seconda verità sullo stesso numero. Resta il caso vero: il prodotto
        // «a preventivo», dove il patto È il prezzo concordato.
        product: { type: 'NON_UNICO', tipologiaVendita: 'preventivo' },
      },
      select: {
        id: true, productId: true, productVariantId: true, provinceId: true, partnerId: true, amount: true, discountPercent: true,
        createdAt: true, externalOrderNumber: true, deliveryId: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // ⭐ 04/09/2026 (regola utente): «85 € conta, è il prezzo che alla fine è
    // stato dato al partner; 94,50 € è un suggerimento».
    //
    // Il patto vero sta sulla RIGA DELLA CONSEGNA — la fotografia di quel
    // giorno, quella che va in fattura — non nel conto importo × (1 − quota),
    // che è solo quello che la vendita si aspettava. Qui si legge la riga della
    // consegna nata da ogni vendita; dove non c'è, si ripiega sul conto della
    // vendita e la riga lo dichiara (`daSuggerimento`).
    const consegneIds = vendite.map((v) => v.deliveryId).filter(Boolean) as string[];
    const consegne = consegneIds.length
      ? await this.prisma.delivery.findMany({
          where: { id: { in: consegneIds } },
          select: { id: true, products: { select: { productId: true, price: true, quantity: true, productName: true } } },
        })
      : [];
    const righeConsegna = new Map(consegne.map((c) => [c.id, c.products]));
    // I nomi dei prodotti delle vendite lette: servono a capire se la riga di ripiego
    // parla davvero di quel prodotto. Una lettura sola per tutto il giro.
    const nomeProdotti = new Map<string, string>(
      (await this.prisma.product.findMany({
        where: { id: { in: [...new Set(vendite.map((v) => v.productId).filter(Boolean) as string[])] } },
        select: { id: true, name: true },
      })).map((x) => [x.id, x.name ?? '']),
    );
    /**
     * Quanto ha preso il partner per QUEL prodotto in QUELLA vendita.
     *
     * ⭐ 08/09/2026 (regola utente: «quando è così applica alla riconciliazione la
     * quantità: quindi sarà 8×15») — IL PREZZO DELLA RIGA È PER PEZZO.
     *
     * Il fioraio scrive sulla consegna il suo listino: «rosa rosa maryflor €8» × 15,
     * prezzo 8. Quegli 8 € sono UNA rosa, non le quindici: il patto vale 8 × 15 = 120 €.
     * Letto senza la quantità nasceva una regola da 8 € su una vendita da 180 €, e da lì
     * in avanti ogni ordine di quel prodotto in quella provincia sarebbe andato a quel
     * prezzo. È successo tre volte (Maryflor 15, FAG Torino 12, Lijoi Roma 3) e per
     * fortuna le tre regole erano rimaste «proposta».
     *
     * Misurato sul vero: delle 19 righe di consegna con più di un pezzo e un prezzo,
     * 18 sono unitarie e la diciannovesima è un artefatto del confronto (una consegna
     * con due righe messa a paragone con una sola vendita). Con un pezzo solo — la
     * quasi totalità — moltiplicare per 1 non cambia niente.
     */
    const datoAlPartner = (v: { deliveryId: string | null; productId: string | null; amount: number; discountPercent: number }) => {
      const righe = v.deliveryId ? righeConsegna.get(v.deliveryId) : null;
      // La riga GIUSTA e' quella dello stesso prodotto. Quando non c'e' e la consegna ne ha
      // una sola, si ripiega su quella — ed e' un RIPIEGO, non una prova.
      const suaRiga = righe?.find((r) => r.productId === v.productId) ?? null;
      const riga = suaRiga ?? (righe?.length === 1 ? righe[0] : null);
      if (riga && (riga.price ?? 0) > 0) {
        const pezzi = Math.max(1, Math.round(Number(riga.quantity) || 1));
        return {
          valore: arrotonda((riga.price as number) * pezzi),
          /**
           * ⭐ 08/09/2026 — IL RIPIEGO NON È UNA PROVA.
           *
           * Su un prodotto COMPOSTO la consegna di un fornitore copre solo la SUA parte:
           * la vendita «Rose Rosse e Praline d'Autore» da 175 € aveva una sola riga di
           * consegna, «Cofanetto Pregiate Praline» a 30 € — le praline, non le rose. Preso
           * per buono, quel 30 € diventava il patto per l'intero prodotto: avremmo pagato
           * 30 € una cosa venduta 175 €, mentre l'altra metà va pagata a un altro fornitore.
           * Stesso caso su «Dolci Abbracci — Orsacchiotto e Cappelliera» (35,12 € su 255 €:
           * l'orsacchiotto, non le rose).
           *
           * Il numero si usa lo stesso — spesso è giusto, come il listino a stelo del
           * fioraio — ma solo la riga trovata PER PRODOTTO vale come fatto accertato.
           * Il ripiego vale come suggerimento, e la proposta lo dice (`daSuggerimento`),
           * così chi accetta sa che quel prezzo va guardato prima di confermarlo.
           */
          reale: suaRiga !== null || parlaDelloStessoProdotto(riga.productName, nomeProdotti.get(v.productId ?? '')),
          pezzi,
          unitario: arrotonda(riga.price as number),
        };
      }
      return { valore: arrotonda(v.amount * (1 - v.discountPercent / 100)), reale: false, pezzi: 1, unitario: null as number | null };
    };

    // ⭐ 06/09/2026 (regola utente): la coppia diventa TERNA (prodotto, VARIANTE, provincia): la
    // regola vale «solo se la variante è la stessa». Prodotto senza variante = variante null.
    type Gruppo = { productId: string; productVariantId: string | null; provinceId: string; perPartner: Map<string, typeof vendite>; ultima: (typeof vendite)[number] };
    const gruppi = new Map<string, Gruppo>();
    const chiaveDi = (productId: string, provinceId: string, variantId: string | null) => `${productId}|${provinceId}|${variantId ?? ''}`;
    for (const v of vendite) {
      const chiave = chiaveDi(v.productId!, v.provinceId, v.productVariantId ?? null);
      const g = gruppi.get(chiave) ?? { productId: v.productId!, productVariantId: v.productVariantId ?? null, provinceId: v.provinceId, perPartner: new Map(), ultima: v };
      g.perPartner.set(v.partnerId!, [...(g.perPartner.get(v.partnerId!) ?? []), v]);
      if (v.createdAt >= g.ultima.createdAt) g.ultima = v;
      gruppi.set(chiave, g);
    }
    if (!gruppi.size) {
      return { venditeLette: 0, coppie: 0, proposteNuove: 0, proposteAggiornate: 0, giaDecise: 0, righe: [] };
    }

    const esistenti = await this.prisma.productReconciliation.findMany({
      where: { productId: { in: [...new Set([...gruppi.values()].map((g) => g.productId))] } },
      select: { id: true, productId: true, productVariantId: true, provinceId: true, status: true },
    });
    const esistente = new Map(esistenti.map((e) => [chiaveDi(e.productId, e.provinceId, e.productVariantId ?? null), e]));

    const partnerIds = new Set<string>();
    for (const g of gruppi.values()) for (const id of g.perPartner.keys()) partnerIds.add(id);
    const partner = await this.prisma.partner.findMany({
      where: { id: { in: [...partnerIds] } },
      select: { id: true, insegna: true, active: true },
    });
    const perPartner = new Map(partner.map((p) => [p.id, p]));

    let proposteNuove = 0;
    let proposteAggiornate = 0;
    let giaDecise = 0;
    const toccate: string[] = [];
    for (const [chiave, g] of gruppi) {
      const gia = esistente.get(chiave);
      if (gia && gia.status !== 'proposta') {
        giaDecise++; // accettata o rifiutata: non si ripropone (regola utente)
        continue;
      }
      const totale = [...g.perPartner.values()].reduce((n, l) => n + l.length, 0);
      const stats: StatPartner[] = [...g.perPartner.entries()]
        .map(([partnerId, lista]) => {
          const amounts = lista.map((v) => v.amount);
          const p = perPartner.get(partnerId);
          return {
            partnerId,
            insegna: p?.insegna ?? '(partner sconosciuto)',
            attivo: p?.active ?? false,
            vendite: lista.length,
            quotaPercento: Math.round((lista.length / totale) * 100),
            prezzoMin: arrotonda(Math.min(...amounts)),
            prezzoMax: arrotonda(Math.max(...amounts)),
            prezzoModa: moda(amounts),
            // Il numero del patto: quello DATO, quando la consegna lo dice.
            nettoModa: moda(lista.map((v) => datoAlPartner(v).valore)),
            /** false = nessuna consegna lo conferma: è un suggerimento, non un fatto. */
            daSuggerimento: !lista.some((v) => datoAlPartner(v).reale),
            /**
             * ⭐ 08/09/2026: il CONTO, quando il prezzo del partner nasce da più pezzi
             * («8 € × 15»). Senza, chi guarda la regola vede 120 € e non sa da dove esce
             * — e il primo dubbio è sempre lo stesso: «è per uno o per tutti?».
             */
            perPezzi: (() => {
              const d = datoAlPartner(lista[lista.length - 1]);
              return d.reale && d.pezzi > 1 ? { unitario: d.unitario, pezzi: d.pezzi } : null;
            })(),
            scontoMedio: arrotonda(lista.reduce((n, v) => n + v.discountPercent, 0) / lista.length),
            ultimaVendita: lista[lista.length - 1].createdAt.toISOString(),
          };
        })
        // Il più frequente prima; a parità, chi ha venduto più di recente.
        .sort((x, y) => y.vendite - x.vendite || y.ultimaVendita.localeCompare(x.ultimaVendita));
      const scelto = stats[0];
      const dati = {
        partnerId: scelto.partnerId,
        // ⭐ 04/09/2026 (regola utente): «l'associazione è per prezzo dato al
        // partner». Il patto è `partnerPrice`; importo al cliente e quota
        // restano come riferimento di quello che si è visto.
        partnerPrice: scelto.nettoModa,
        price: scelto.prezzoModa,
        discountPercent: scelto.scontoMedio,
        salesCount: totale,
        stats: JSON.stringify(stats),
        lastSaleId: g.ultima.id,
        lastOrderNumber: g.ultima.externalOrderNumber,
        trigger: opts.innesco,
      };
      if (gia) {
        await this.prisma.productReconciliation.update({ where: { id: gia.id }, data: dati });
        proposteAggiornate++;
        toccate.push(gia.id);
      } else {
        const r = await this.prisma.productReconciliation.create({
          data: { productId: g.productId, productVariantId: g.productVariantId, provinceId: g.provinceId, status: 'proposta', ...dati },
          select: { id: true },
        });
        proposteNuove++;
        toccate.push(r.id);
      }
    }

    return {
      venditeLette: vendite.length,
      coppie: gruppi.size,
      proposteNuove,
      proposteAggiornate,
      giaDecise,
      righe: await this.lista({ ids: toccate }),
    };
  }

  /** Le righe con i nomi: prodotto, provincia, partner (proposto e attuale del prodotto). */
  async lista(filtro: { stato?: string; ids?: string[]; limite?: number }) {
    const righe = await this.prisma.productReconciliation.findMany({
      where: {
        ...(filtro.ids ? { id: { in: filtro.ids } } : {}),
        ...(filtro.stato && filtro.stato !== 'tutte' ? { status: filtro.stato } : {}),
        // ⭐ 07/09/2026 (regola utente): le PROPOSTE si mostrano solo per i prodotti dove
        // servono («bouquet ortensie blu non ci deve essere, 15 rose rosse non ci deve
        // essere»). I patti già ACCETTATI restano visibili comunque: sono accordi presi, e
        // nasconderli perché la regola di oggi è cambiata sarebbe riscrivere la storia.
        ...(filtro.ids
          ? {}
          : {
              OR: [
                { status: { not: 'proposta' } },
                { product: { type: 'NON_UNICO', tipologiaVendita: 'preventivo' } },
              ],
            }),
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: filtro.limite ?? 500,
      include: { product: { select: { name: true, sku: true, type: true, price: true, hasVariants: true } }, variant: { select: { id: true, name: true, sku: true } } },
    });
    const partnerIds = new Set(righe.map((r) => r.partnerId));
    const provinceIds = new Set(righe.map((r) => r.provinceId));
    // ⭐ 04/09/2026 (regola utente): in tabella si vede la CONSEGNA nata da
    // quella vendita. Il collegamento è vendita → deliveryId → consegna.
    const venditeIds = righe.map((r) => r.lastSaleId).filter(Boolean) as string[];
    const vendite = venditeIds.length
      ? await this.prisma.sale.findMany({ where: { id: { in: venditeIds } }, select: { id: true, deliveryId: true } })
      : [];
    const consegneIds = vendite.map((v) => v.deliveryId).filter(Boolean) as string[];
    const consegne = consegneIds.length
      ? await this.prisma.delivery.findMany({ where: { id: { in: consegneIds } }, select: { id: true, code: true } })
      : [];
    const consegnaDiVendita = new Map(vendite.map((v) => [v.id, v.deliveryId]));
    const consegnaPerId = new Map(consegne.map((c) => [c.id, c]));
    const [partner, province] = await Promise.all([
      this.prisma.partner.findMany({ where: { id: { in: [...partnerIds] } }, select: { id: true, insegna: true, active: true, esclusoDalleProposte: true } }),
      this.prisma.province.findMany({ where: { id: { in: [...provinceIds] } }, select: { id: true, name: true, code: true } }),
    ]);
    const nome = new Map(partner.map((p) => [p.id, p]));
    const prov = new Map(province.map((p) => [p.id, p]));
    // ⭐ 07/09/2026: le PROPOSTE di un partner spento o cancellato non si mostrano — nessuno
    // può accettarle e restano lì a fare rumore. Le righe già ACCETTATE si vedono comunque:
    // sono accordi presi, e servono a capire un prezzo scritto ieri.
    const visibili = righe.filter((r) => r.status !== 'proposta' || (nome.get(r.partnerId)?.active && !nome.get(r.partnerId)?.esclusoDalleProposte));
    return visibili.map((r) => ({
      id: r.id,
      productId: r.productId,
      prodotto: r.product.name,
      sku: r.product.sku,
      tipoProdotto: r.product.type,
      prezzoListino: r.product.price,
      conVarianti: r.product.hasVariants,
      productVariantId: r.productVariantId ?? null,
      variante: r.variant?.name ?? null,
      varianteSku: r.variant?.sku ?? null,
      provinceId: r.provinceId,
      provincia: prov.get(r.provinceId)?.name ?? null,
      provinciaCodice: prov.get(r.provinceId)?.code ?? null,
      partnerId: r.partnerId,
      partner: nome.get(r.partnerId)?.insegna ?? null,
      partnerAttivo: nome.get(r.partnerId)?.active ?? false,
      prezzo: r.price,
      sconto: r.discountPercent,
      // Il patto: se la riga è nata prima della colonna, si ricava dai due campi.
      prezzoPartner: r.partnerPrice ?? arrotonda(r.price * (1 - r.discountPercent / 100)),
      consegnaId: r.lastSaleId ? consegnaDiVendita.get(r.lastSaleId) ?? null : null,
      consegnaCodice: r.lastSaleId
        ? consegnaPerId.get(consegnaDiVendita.get(r.lastSaleId) ?? '')?.code ?? null
        : null,
      vendite: r.salesCount,
      stats: JSON.parse(r.stats) as StatPartner[],
      ultimaVenditaId: r.lastSaleId,
      ultimoOrdine: r.lastOrderNumber,
      stato: r.status,
      innesco: r.trigger,
      decisaIl: r.decidedAt,
      decisaDa: r.decidedBy,
      creataIl: r.createdAt,
      aggiornataIl: r.updatedAt,
    }));
  }

  /**
   * ⭐ 04/09/2026: la riconciliazione nata DA UNA VENDITA (bottone «Crea
   * riconciliazione» nello storico del pop-up). Nasce come PROPOSTA: la
   * decisione resta in Riconciliazioni, dove si vede accanto alle altre.
   */
  async daVendita(saleId: string, partnerId: string, user: JwtUser) {
    const vendita = await this.prisma.sale.findUnique({
      where: { id: saleId },
      select: { productId: true, productVariantId: true, provinceId: true, amount: true, discountPercent: true, externalOrderNumber: true },
    });
    if (!vendita?.productId) throw new BadRequestException('La vendita non ha un prodotto a catalogo.');
    const partner = await this.prisma.partner.findUnique({
      where: { id: partnerId },
      select: { active: true, provinces: { where: { provinceId: vendita.provinceId }, select: { provinceId: true } } },
    });
    if (!partner) throw new NotFoundException('Partner non trovato');
    if (!partner.active) throw new BadRequestException('Il partner non è attivo.');
    if ((await this.esclusiIds()).includes(partnerId)) {
      throw new BadRequestException('Il partner è escluso dalle riconciliazioni.');
    }
    const gia = await this.prisma.productReconciliation.findFirst({
      where: { productId: vendita.productId, provinceId: vendita.provinceId, productVariantId: vendita.productVariantId ?? null },
      select: { id: true, status: true },
    });
    if (gia && gia.status !== 'proposta') {
      throw new BadRequestException(
        gia.status === 'accettata'
          ? 'Per questo prodotto (stessa variante) in questa provincia esiste già una regola attiva: modificala in Riconciliazioni.'
          : 'Questa coppia era stata rifiutata: riaprila dalla pagina Riconciliazioni.',
      );
    }
    const dati = {
      partnerId,
      partnerPrice: arrotonda(vendita.amount * (1 - vendita.discountPercent / 100)),
      price: arrotonda(vendita.amount),
      discountPercent: arrotonda(vendita.discountPercent),
      salesCount: 1,
      stats: JSON.stringify([]),
      lastSaleId: saleId,
      lastOrderNumber: vendita.externalOrderNumber,
      trigger: 'manuale',
      status: 'proposta',
      decidedAt: null,
      decidedBy: null,
    };
    const riga = gia
      ? await this.prisma.productReconciliation.update({ where: { id: gia.id }, data: dati, select: { id: true } })
      : await this.prisma.productReconciliation.create({
          data: { productId: vendita.productId, productVariantId: vendita.productVariantId ?? null, provinceId: vendita.provinceId, ...dati },
          select: { id: true },
        });
    void user;
    return (await this.lista({ ids: [riga.id] }))[0];
  }

  /**
   * ⭐ 07/09/2026 (regola utente) — RICONCILIAZIONE A MANO, IN QUATTRO PASSI.
   *
   * «In riconciliazioni permettimi di creare una nuova riconciliazione per vendita,
   * prodotto e provincia presi dalla vendita, prodotto venduto in passato con ricerca
   * fra tutti i prodotti, scelta della variante, e poi chiedi conferma confrontando i
   * prezzi e specificando il margine.»
   *
   * L'idea: «questa torta che mi hanno ordinato è la stessa cosa di quella che il
   * partner X fa già a 47 €». Il prodotto e la provincia della REGOLA vengono dalla
   * vendita da smistare; il partner e il prezzo dal prodotto di RIFERIMENTO, che è già
   * stato venduto e ha quindi un prezzo vero, non stimato.
   */

  /** Le vendite che ha senso riconciliare: ferme, con un prodotto a catalogo. */
  /**
   * Le vendite da cui far nascere un patto.
   *
   * ⭐ 08/09/2026 (regola utente: «consentimi di cercare ordini in vendita anche già
   * inseriti»). Di suo l'elenco mostra chi aspetta una decisione — da gestire e
   * proposte — perché è lì che serve una regola. Ma un patto si scrive spesso
   * GUARDANDO un ordine già andato a buon fine: «quella volta gliel'abbiamo pagata
   * così, da adesso vale sempre». Con `tutte` la ricerca comprende ogni stato,
   * accettate incluse; l'elenco lo dice, così chi sceglie sa cosa sta guardando.
   */
  async venditeDaRiconciliare(q?: string, tutte = false) {
    const testo = (q ?? '').trim();
    const vendite = await this.prisma.sale.findMany({
      where: {
        ...(tutte ? {} : { status: { in: [SaleStatus.DA_GESTIRE, SaleStatus.PROPOSTA] } }),
        productId: { not: null },
        ...(testo
          ? {
              OR: [
                { externalOrderNumber: { contains: testo, mode: 'insensitive' as const } },
                { productName: { contains: testo, mode: 'insensitive' as const } },
                { product: { name: { contains: testo, mode: 'insensitive' as const } } },
                { recipientLastName: { contains: testo, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      select: {
        id: true, externalOrderNumber: true, amount: true, quantity: true, status: true,
        variantName: true, productVariantId: true, createdAt: true, deliveryDate: true,
        recipientLastName: true, recipientAddress: true,
        // Con le accettate in mezzo, sapere A CHI è andata è metà della decisione.
        partner: { select: { id: true, insegna: true } },
        product: { select: { id: true, name: true, sku: true, tipologiaVendita: true } },
        province: { select: { id: true, code: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    // Quali hanno già una regola attiva: si dice, per non rifarla.
    const chiavi = vendite.filter((v) => v.product).map((v) => ({ productId: v.product!.id, provinceId: v.province.id, productVariantId: v.productVariantId ?? null }));
    const esistenti = chiavi.length
      ? await this.prisma.productReconciliation.findMany({
          where: { OR: chiavi },
          select: { productId: true, provinceId: true, productVariantId: true, status: true, partnerId: true },
        })
      : [];
    return vendite.map((v) => {
      const gia = esistenti.find(
        (e) => e.productId === v.product?.id && e.provinceId === v.province.id && (e.productVariantId ?? null) === (v.productVariantId ?? null),
      );
      return { ...v, regolaEsistente: gia ? { stato: gia.status, partnerId: gia.partnerId } : null };
    });
  }

  /**
   * Il prodotto di RIFERIMENTO: chi lo ha fatto in passato e a quanto.
   *
   * Tre fonti, dalla più forte alla più debole, e si dice sempre QUALE:
   *  · le vendite ACCETTATE di quel prodotto (prezzo pattuito davvero, con la data);
   *  · il proprietario, se è un prodotto UNICO (il suo listino);
   *  · i prezzi concordati caricati dai DDT (sku `PP-<codice>-<partner>`).
   * Senza nessuna delle tre non si inventa un prezzo: si dice che non c'è.
   */
  async riferimento(productId: string, productVariantId?: string | null) {
    const prodotto = await this.prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true, name: true, sku: true, price: true, publicPrice: true, type: true,
        partnerId: true, partner: { select: { id: true, insegna: true, active: true } },
        variants: { select: { id: true, name: true, sku: true, price: true, publicPrice: true, active: true } },
      },
    });
    if (!prodotto) throw new NotFoundException('Prodotto non trovato');
    const variante = productVariantId ? prodotto.variants.find((x) => x.id === productVariantId) ?? null : null;

    const righe: { partnerId: string; insegna: string; attivo: boolean; prezzoPartner: number; da: string; quando: Date | null; volte: number }[] = [];

    // 1) le vendite accettate
    const vendite = await this.prisma.sale.findMany({
      where: {
        productId, status: SaleStatus.ACCETTATA, partnerId: { not: null },
        ...(productVariantId ? { productVariantId } : {}),
      },
      select: { partnerId: true, amount: true, discountPercent: true, deliveryDate: true, createdAt: true,
                partner: { select: { insegna: true, active: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    for (const v of vendite) {
      const prezzo = arrotonda(v.amount * (1 - (v.discountPercent ?? 0) / 100));
      const gia = righe.find((r) => r.partnerId === v.partnerId);
      if (gia) { gia.volte += 1; continue; }
      righe.push({
        partnerId: v.partnerId!, insegna: v.partner?.insegna ?? '—', attivo: v.partner?.active ?? false,
        prezzoPartner: prezzo, da: 'vendita accettata', quando: v.deliveryDate ?? v.createdAt, volte: 1,
      });
    }

    // 2) il proprietario di un prodotto unico
    if (prodotto.type === 'UNICO' && prodotto.partnerId && !righe.some((r) => r.partnerId === prodotto.partnerId)) {
      const listino = variante?.price ?? variante?.publicPrice ?? prodotto.price ?? prodotto.publicPrice ?? null;
      if (listino != null && listino > 0) {
        righe.push({
          partnerId: prodotto.partnerId, insegna: prodotto.partner?.insegna ?? '—',
          attivo: prodotto.partner?.active ?? false, prezzoPartner: arrotonda(listino),
          da: 'listino del prodotto unico', quando: null, volte: 0,
        });
      }
    }

    // 3) i prezzi concordati caricati dai DDT: sku «PP-<codice>-<partner>»
    const codice = (variante?.sku ?? prodotto.sku ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 28);
    if (codice) {
      const pp = await this.prisma.product.findMany({
        where: { sku: { startsWith: `PP-${codice}-` }, active: true, deletedAt: null, archived: false },
        select: { price: true, partnerId: true, partner: { select: { insegna: true, active: true } } },
      });
      for (const x of pp) {
        if (!x.partnerId || x.price == null || x.price <= 0) continue;
        if (righe.some((r) => r.partnerId === x.partnerId)) continue;
        righe.push({
          partnerId: x.partnerId, insegna: x.partner?.insegna ?? '—', attivo: x.partner?.active ?? false,
          prezzoPartner: arrotonda(x.price), da: 'prezzo concordato (DDT)', quando: null, volte: 0,
        });
      }
    }

    righe.sort((a, b) => b.volte - a.volte || a.prezzoPartner - b.prezzoPartner);
    return {
      prodotto: { id: prodotto.id, name: prodotto.name, sku: prodotto.sku, type: prodotto.type },
      variante: variante ? { id: variante.id, name: variante.name, sku: variante.sku } : null,
      varianti: prodotto.variants.filter((v) => v.active !== false).map((v) => ({ id: v.id, name: v.name, sku: v.sku, price: v.price ?? v.publicPrice })),
      righe,
    };
  }

  /**
   * L'ANTEPRIMA: il confronto dei prezzi e il margine, prima di scrivere.
   * Il margine è quello che resta a Deluxy: pagato dal cliente − dato al partner.
   */
  /**
   * SU COSA si scrive il patto: prodotto, variante, provincia, e il prezzo al cliente
   * con cui misurare il margine.
   *
   * ⭐ 08/09/2026 (regola utente: «oppure di non inserire nessuna vendita e cercare
   * direttamente per prodotto, partner e provincia»). Fino a ieri il modulo partiva
   * per forza da una vendita: senza un ordine già arrivato non si poteva scrivere un
   * accordo — e un accordo si prende PRIMA che l'ordine arrivi, è il suo mestiere.
   *
   * Due strade, stesso patto:
   *  · da una VENDITA: prodotto, variante, provincia e prezzo pagato vengono da lì;
   *  · SENZA vendita: si scelgono prodotto, variante e provincia, e il prezzo al
   *    cliente lo dà il LISTINO (della variante se c'è, altrimenti del prodotto).
   * Il margine si calcola uguale; cambia da dove arriva il prezzo pubblico, e
   * l'anteprima lo dichiara (`fonte`) perché un listino non è un incasso.
   */
  private async contestoDelPatto(b: { saleId?: string; productId?: string; productVariantId?: string | null; provinceId?: string }) {
    if (b.saleId) {
      const v = await this.prisma.sale.findUnique({
        where: { id: b.saleId },
        select: {
          productId: true, productVariantId: true, provinceId: true, amount: true, quantity: true,
          discountPercent: true, variantName: true, externalOrderNumber: true,
          product: { select: { id: true, name: true, sku: true } },
          province: { select: { id: true, code: true, name: true } },
        },
      });
      if (!v?.productId) throw new BadRequestException('La vendita non ha un prodotto a catalogo.');
      return {
        productId: v.productId, productVariantId: v.productVariantId ?? null, provinceId: v.provinceId,
        alCliente: arrotonda(v.amount), sconto: arrotonda(v.discountPercent ?? 0),
        ordine: v.externalOrderNumber, prodotto: v.product?.name ?? null, sku: v.product?.sku ?? null,
        variante: v.variantName, pezzi: v.quantity,
        provincia: v.province?.code ?? null, provinciaNome: v.province?.name ?? null,
        fonte: 'vendita' as 'vendita' | 'listino', saleId: b.saleId as string | null,
      };
    }
    if (!b.productId || !b.provinceId) {
      throw new BadRequestException('Senza una vendita servono il prodotto e la provincia.');
    }
    const prod = await this.prisma.product.findUnique({
      where: { id: b.productId },
      select: { id: true, name: true, sku: true, price: true, publicPrice: true, categoryId: true,
                variants: { select: { id: true, name: true, price: true, publicPrice: true } } },
    });
    if (!prod) throw new NotFoundException('Prodotto non trovato');
    const prov = await this.prisma.province.findUnique({ where: { id: b.provinceId }, select: { id: true, code: true, name: true } });
    if (!prov) throw new NotFoundException('Provincia non trovata');
    const vr = b.productVariantId ? prod.variants.find((x) => x.id === b.productVariantId) ?? null : null;
    if (b.productVariantId && !vr) throw new NotFoundException('Variante non trovata su questo prodotto');
    const listino = vr?.publicPrice ?? vr?.price ?? prod.publicPrice ?? prod.price ?? 0;
    // Lo sconto del territorio, se la categoria ne ha uno qui: serve solo al confronto.
    const cd = prod.categoryId
      ? await this.prisma.categoryDiscount.findFirst({
          where: { categoryId: prod.categoryId, provinceId: prov.id }, select: { discountPercent: true },
        })
      : null;
    return {
      productId: prod.id, productVariantId: vr?.id ?? null, provinceId: prov.id,
      alCliente: arrotonda(listino), sconto: arrotonda(cd?.discountPercent ?? 0),
      ordine: null as string | null, prodotto: prod.name, sku: prod.sku,
      variante: vr?.name ?? null, pezzi: 1,
      provincia: prov.code, provinciaNome: prov.name,
      fonte: 'listino' as 'vendita' | 'listino', saleId: null as string | null,
    };
  }

  async anteprimaManuale(b: {
    saleId?: string; productId?: string; productVariantId?: string | null; provinceId?: string;
    partnerId: string; prezzoPartner: number;
    /**
     * ⭐ 08/09/2026 (regola utente: «applica riconciliazione anche da singolo prodotto a cui
     * poi impostare la quantità»). Quando il prezzo di riferimento è UNITARIO — il listino a
     * stelo del fioraio, 8 € una rosa — il patto per una variante da 7 rose vale 8 × 7.
     * Prima il modulo proponeva 8 € su una vendita da 100: lo stesso difetto corretto sulle
     * proposte automatiche, che però passa da un'altra strada e non era coperto.
     *
     * La quantità la dichiara chi scrive il patto: non si indovina dal nome della variante,
     * che può essere «Medio-Grande» o «4/6» e non voler dire nessun numero.
     */
    pezzi?: number;
  }) {
    const vendita = await this.contestoDelPatto(b);
    const partnerId = b.partnerId;
    const pezzi = Math.max(1, Math.round(Number(b.pezzi) || 1));
    const prezzoUnitario = b.prezzoPartner;
    const prezzoPartner = Math.round(prezzoUnitario * pezzi * 100) / 100;
    const partner = await this.prisma.partner.findUnique({
      where: { id: partnerId }, select: { id: true, insegna: true, active: true },
    });
    if (!partner) throw new NotFoundException('Partner non trovato');

    const alCliente = arrotonda(vendita.alCliente);
    const alPartner = arrotonda(prezzoPartner);
    const margine = arrotonda(alCliente - alPartner);
    const percentuale = alCliente > 0 ? arrotonda((margine / alCliente) * 100) : 0;
    // Il confronto con la regola del territorio, per capire se il patto conviene.
    const conLaPercentuale = arrotonda(alCliente * (1 - vendita.sconto / 100));

    const gia = await this.prisma.productReconciliation.findFirst({
      where: { productId: vendita.productId, provinceId: vendita.provinceId, productVariantId: vendita.productVariantId ?? null },
      select: { id: true, status: true, partnerId: true, partnerPrice: true },
    });

    return {
      vendita: {
        ordine: vendita.ordine, prodotto: vendita.prodotto, sku: vendita.sku,
        variante: vendita.variante, pezzi: vendita.pezzi, provincia: vendita.provincia, provinciaNome: vendita.provinciaNome,
        // «vendita» = un ordine vero; «listino» = il patto scritto prima che l'ordine arrivi.
        fonte: vendita.fonte,
      },
      partner: { id: partner.id, insegna: partner.insegna, attivo: partner.active },
      prezzi: {
        alCliente, alPartner, margine, percentuale,
        // Il conto in chiaro quando i pezzi sono più d'uno: chi conferma deve vedere
        // da dove esce il numero, non solo il totale.
        pezzi,
        prezzoUnitario: pezzi > 1 ? Math.round(prezzoUnitario * 100) / 100 : null,
        // Quanto prenderebbe il partner con la sola regola del territorio: se il patto
        // costa di più, il margine si stringe — e chi conferma deve vederlo.
        conLaPercentuale, scontoTerritorio: vendita.sconto,
        differenzaSullaRegola: arrotonda(conLaPercentuale - alPartner),
      },
      avvisi: [
        ...(alPartner >= alCliente ? ['Il prezzo del partner è pari o superiore a quello pagato dal cliente: il margine è zero o negativo.'] : []),
        ...(!partner.active ? ['Il partner non è attivo: la regola non verrebbe usata dallo smistamento.'] : []),
        ...(gia && gia.status === 'accettata' ? ['Per questo prodotto, variante e provincia esiste già una regola attiva: confermando la si sostituisce.'] : []),
        // Senza un ordine vero il prezzo al cliente è quello di listino: il margine è
        // una previsione, non un fatto. Chi conferma deve saperlo.
        ...(vendita.fonte === 'listino' ? ['Nessuna vendita a confronto: il prezzo al cliente è quello di listino, quindi il margine è una previsione.'] : []),
        ...(vendita.fonte === 'listino' && alCliente <= 0 ? ['Questo prodotto non ha un prezzo di listino: il margine non è calcolabile.'] : []),
      ],
      regolaEsistente: gia,
    };
  }

  /** Scrive la riconciliazione decisa a mano: nasce già ACCETTATA, perché l'ha decisa una persona. */
  async creaManuale(
    body: {
      saleId?: string;
      /** ⭐ 08/09/2026: la strada SENZA vendita — il patto preso prima dell'ordine. */
      productId?: string; productVariantId?: string | null; provinceId?: string;
      partnerId: string; prezzoPartner: number;
      /** ⭐ 08/09/2026: i pezzi, quando il prezzo di riferimento è unitario (8 € × 7 rose). */
      pezzi?: number;
      riferimentoProductId?: string; riferimentoVariantId?: string;
    },
    user: JwtUser,
  ) {
    const a = await this.anteprimaManuale(body);
    const c = await this.contestoDelPatto(body);
    if ((await this.esclusiIds()).includes(body.partnerId)) {
      throw new BadRequestException('Il partner è escluso dalle riconciliazioni.');
    }
    const dati = {
      partnerId: body.partnerId,
      // ⭐ 08/09: stesso conto dell'anteprima — il prezzo scritto è unitario × pezzi.
      partnerPrice: arrotonda(body.prezzoPartner * Math.max(1, Math.round(Number(body.pezzi) || 1))),
      price: arrotonda(c.alCliente),
      discountPercent: c.sconto,
      salesCount: c.saleId ? 1 : 0,
      stats: JSON.stringify([{
        da: c.saleId ? 'riconciliazione a mano' : 'accordo scritto senza vendita',
        // Il prezzo al pubblico viene da un incasso vero o da un listino: si scrive
        // QUALE, perché fra sei mesi nessuno se lo ricorda.
        prezzoPubblicoDa: c.fonte,
        ...(Number(body.pezzi) > 1 ? { perPezzi: { unitario: arrotonda(body.prezzoPartner), pezzi: Math.round(Number(body.pezzi)) } } : {}),
        riferimento: body.riferimentoProductId ?? null,
        variante: body.riferimentoVariantId ?? null,
      }]),
      lastSaleId: c.saleId,
      lastOrderNumber: c.ordine,
      trigger: 'manuale',
      // Decisa da una persona: nasce attiva, e lo smistamento la usa dal giro dopo.
      status: 'accettata',
      decidedAt: new Date(),
      decidedBy: user?.email ?? user?.sub ?? null,
    };
    const riga = a.regolaEsistente
      ? await this.prisma.productReconciliation.update({ where: { id: a.regolaEsistente.id }, data: dati, select: { id: true } })
      : await this.prisma.productReconciliation.create({
          data: { productId: c.productId, productVariantId: c.productVariantId, provinceId: c.provinceId, ...dati },
          select: { id: true },
        });
    return (await this.lista({ ids: [riga.id] }))[0];
  }

  /**
   * I prodotti fra cui scegliere quando il patto nasce SENZA una vendita.
   *
   * Si cercano per nome o SKU e tornano con le loro varianti: la regola è sulla terna
   * prodotto + variante + provincia, quindi la variante va scelta qui.
   */
  /** Le province attive, per la scelta del territorio quando non c'è una vendita a dirlo. */
  async province() {
    return this.prisma.province.findMany({
      select: { id: true, code: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  async cercaProdotti(q?: string) {
    const testo = (q ?? '').trim();
    if (testo.length < 2) return [];
    const prodotti = await this.prisma.product.findMany({
      where: {
        active: true, deletedAt: null, archived: false,
        OR: [
          { name: { contains: testo, mode: 'insensitive' } },
          { sku: { contains: testo, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true, name: true, sku: true, type: true, tipologiaVendita: true, price: true, publicPrice: true,
        partner: { select: { id: true, insegna: true } },
        variants: { where: { active: true }, select: { id: true, name: true, sku: true, price: true, publicPrice: true }, orderBy: { name: 'asc' } },
      },
      orderBy: { name: 'asc' },
      take: 30,
    });
    return prodotti;
  }

  /** Accetta = regola attiva (lo smistamento la legge da subito). Rifiuta = mai più proposta. */
  async decidi(id: string, azione: 'accetta' | 'rifiuta', user: JwtUser) {
    const r = await this.prisma.productReconciliation.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Riconciliazione non trovata');
    if (r.status !== 'proposta') throw new BadRequestException('Questa proposta è già stata decisa.');
    if (azione === 'accetta') {
      const p = await this.prisma.partner.findUnique({ where: { id: r.partnerId }, select: { active: true } });
      if (!p?.active) throw new BadRequestException('Il partner della proposta non è attivo: modifica la riconciliazione prima di accettarla.');
    }
    await this.prisma.productReconciliation.update({
      where: { id },
      data: { status: azione === 'accetta' ? 'accettata' : 'rifiutata', decidedAt: new Date(), decidedBy: user.email },
    });
    return (await this.lista({ ids: [id] }))[0];
  }

  /**
   * Modifica partner, prezzo e sconto. Su una proposta resta proposta (poi si
   * accetta); su una regola attiva vale da subito. Una rifiutata si può
   * modificare solo tornando proposta (l'ufficio la sta ripensando).
   */
  async modifica(id: string, body: { partnerId?: string; partnerPrice?: number; price?: number; discountPercent?: number }, user: JwtUser) {
    const r = await this.prisma.productReconciliation.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Riconciliazione non trovata');
    const data: { partnerId?: string; partnerPrice?: number; price?: number; discountPercent?: number; status?: string; decidedAt?: Date; decidedBy?: string } = {};
    if (body.partnerId !== undefined) {
      const p = await this.prisma.partner.findUnique({
        where: { id: body.partnerId },
        select: { active: true, provinces: { where: { provinceId: r.provinceId }, select: { provinceId: true } } },
      });
      if (!p) throw new NotFoundException('Partner non trovato');
      if (!p.active) throw new BadRequestException('Il partner scelto non è attivo.');
      if ((await this.esclusiIds()).includes(body.partnerId)) {
        throw new BadRequestException('Il partner scelto è escluso dalle riconciliazioni.');
      }
      if (!p.provinces.length) throw new BadRequestException('Il partner scelto non opera in questa provincia.');
      data.partnerId = body.partnerId;
    }
    if (body.partnerPrice !== undefined) {
      const n = Number(body.partnerPrice);
      if (!isFinite(n) || n < 0) throw new BadRequestException('Prezzo al partner non valido.');
      data.partnerPrice = arrotonda(n);
    }
    if (body.price !== undefined) {
      const n = Number(body.price);
      if (!isFinite(n) || n < 0) throw new BadRequestException('Prezzo non valido.');
      data.price = arrotonda(n);
    }
    if (body.discountPercent !== undefined) {
      const n = Number(body.discountPercent);
      if (!isFinite(n) || n < 0 || n > 100) throw new BadRequestException('Sconto non valido (0–100).');
      data.discountPercent = arrotonda(n);
    }
    if (!Object.keys(data).length) throw new BadRequestException('Niente da modificare.');
    if (r.status === 'rifiutata') data.status = 'proposta';
    if (r.status === 'accettata') {
      data.decidedAt = new Date();
      data.decidedBy = user.email;
    }
    await this.prisma.productReconciliation.update({ where: { id }, data });
    return (await this.lista({ ids: [id] }))[0];
  }

  /** I partner attivi, non esclusi, che operano in una provincia (per la modifica). */
  async partnerInProvincia(provinceId: string) {
    const esclusi = await this.esclusiIds();
    return this.prisma.partner.findMany({
      where: { active: true, provinces: { some: { provinceId } }, ...(esclusi.length ? { id: { notIn: esclusi } } : {}) },
      select: { id: true, insegna: true },
      orderBy: { insegna: 'asc' },
    });
  }

  /** La corsa di notte: ultimi 90 giorni, esito in AppSetting. */
  async corsaNotturna() {
    const a = new Date();
    const da = new Date(a.getTime() - GIORNI_NOTTE * 86400000);
    let esito: Record<string, unknown>;
    try {
      const e = await this.genera({ da, a, innesco: 'notte' });
      esito = { ok: true, venditeLette: e.venditeLette, coppie: e.coppie, proposteNuove: e.proposteNuove, proposteAggiornate: e.proposteAggiornate, giaDecise: e.giaDecise };
    } catch (err) {
      esito = { ok: false, errore: (err as Error).message.slice(0, 300) };
    }
    const value = JSON.stringify({ quando: new Date().toISOString(), da, a, ...esito });
    await this.prisma.appSetting.upsert({
      where: { key: 'riconciliazioniUltimaCorsa' },
      update: { value },
      create: { key: 'riconciliazioniUltimaCorsa', value },
    });
    return esito;
  }

  async ultimaCorsa() {
    const s = await this.prisma.appSetting.findUnique({ where: { key: 'riconciliazioniUltimaCorsa' } });
    return s ? JSON.parse(s.value) : null;
  }
}

@ApiTags('riconciliazioni')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.OPERATION)
@Controller('riconciliazioni')
export class RiconciliazioniController {
  constructor(private readonly service: RiconciliazioniService) {}

  @Get()
  @ApiOperation({ summary: 'Le riconciliazioni (stato=proposta|accettata|rifiutata|tutte)' })
  lista(@Query('stato') stato?: string) {
    return this.service.lista({ stato: stato || 'proposta' });
  }

  @Get('ultima-corsa')
  @ApiOperation({ summary: 'Esito dell\'ultima corsa notturna' })
  ultimaCorsa() {
    return this.service.ultimaCorsa();
  }

  @Get('partner-in-provincia/:provinceId')
  @ApiOperation({ summary: 'Partner attivi che operano nella provincia (per la modifica)' })
  partner(@Param('provinceId') provinceId: string) {
    return this.service.partnerInProvincia(provinceId);
  }

  @Get('esclusi')
  @ApiOperation({ summary: 'I partner esclusi dalle riconciliazioni' })
  esclusi() {
    return this.service.esclusi();
  }

  @Put('esclusi')
  @ApiOperation({ summary: 'Riscrive la lista dei partner esclusi dalle riconciliazioni' })
  impostaEsclusi(@Body() body: { partnerIds?: string[] }) {
    return this.service.impostaEsclusi(body?.partnerIds ?? []);
  }

  @Get('partner-attivi')
  @ApiOperation({ summary: 'Partner attivi non esclusi (per aggiungere un escluso)' })
  partnerAttivi() {
    return this.service.partnerAttivi();
  }

  @Post('analizza')
  @ApiOperation({ summary: 'Lancio manuale su un intervallo: genera le proposte dalle vendite accettate e le restituisce' })
  analizza(@Body() body: { da?: string; a?: string }) {
    if (!body?.da || !body?.a) throw new BadRequestException('Servono le date «da» e «a».');
    return this.service.genera({ da: new Date(`${body.da}T00:00:00.000Z`), a: new Date(`${body.a}T23:59:59.999Z`), innesco: 'manuale' });
  }

  @Get('vendite-da-riconciliare')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Le vendite ferme che si possono riconciliare (passo 1)' })
  venditeDaRiconciliare(@Query('q') q?: string, @Query('tutte') tutte?: string) {
    // `tutte=1`: cerca anche fra le vendite già chiuse (accettate comprese), perché un
    // patto si scrive spesso guardando un ordine già andato bene.
    return this.service.venditeDaRiconciliare(q, tutte === '1' || tutte === 'true');
  }

  @Get('cerca-prodotti')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Cerca prodotti e varianti per scrivere un patto senza partire da una vendita' })
  cercaProdotti(@Query('q') q?: string) {
    return this.service.cercaProdotti(q);
  }

  @Get('riferimento/:productId')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Chi ha gi\u00e0 fatto questo prodotto e a quanto, con le sue varianti (passi 3-4)' })
  riferimento(@Param('productId') productId: string, @Query('variantId') variantId?: string) {
    return this.service.riferimento(productId, variantId || null);
  }

  @Get('province')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Le province fra cui scegliere quando il patto nasce senza una vendita' })
  province() {
    return this.service.province();
  }

  @Post('anteprima')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Il confronto dei prezzi e il margine, prima di confermare (passo 5)' })
  anteprima(@Body() body: { saleId?: string; productId?: string; productVariantId?: string | null; provinceId?: string; partnerId: string; prezzoPartner: number; pezzi?: number }) {
    return this.service.anteprimaManuale({ ...body, prezzoPartner: Number(body.prezzoPartner) });
  }

  @Post('manuale')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Crea la riconciliazione decisa a mano (nasce accettata)' })
  creaManuale(
    @Body() body: {
      saleId?: string;
      productId?: string; productVariantId?: string | null; provinceId?: string;
      partnerId: string; prezzoPartner: number; pezzi?: number;
      riferimentoProductId?: string; riferimentoVariantId?: string;
    },
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.creaManuale({ ...body, prezzoPartner: Number(body.prezzoPartner) }, user);
  }

  @Post('da-vendita')
  @ApiOperation({ summary: 'Crea (o riscrive) la proposta per il prodotto/provincia di una vendita, col partner scelto' })
  daVendita(@Body() body: { saleId?: string; partnerId?: string }, @CurrentUser() user: JwtUser) {
    if (!body?.saleId || !body?.partnerId) throw new BadRequestException('Servono «saleId» e «partnerId».');
    return this.service.daVendita(body.saleId, body.partnerId, user);
  }

  @Post(':id/accetta')
  @ApiOperation({ summary: 'Accetta: da ora le vendite di quel prodotto in quella provincia vanno a quel partner a quel prezzo' })
  accetta(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.decidi(id, 'accetta', user);
  }

  @Post(':id/rifiuta')
  @ApiOperation({ summary: 'Rifiuta: la coppia prodotto/provincia non viene più proposta' })
  rifiuta(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.decidi(id, 'rifiuta', user);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Modifica partner, prezzo o sconto della riconciliazione' })
  modifica(@Param('id') id: string, @Body() body: { partnerId?: string; partnerPrice?: number; price?: number; discountPercent?: number }, @CurrentUser() user: JwtUser) {
    return this.service.modifica(id, body ?? {}, user);
  }
}

/** La corsa NOTTURNA (vercel.json, 03:30). Identità = `CRON_SECRET`, verificata PRIMA di tutto. */
@ApiTags('cron')
@Controller('cron')
export class CronRiconciliazioniController {
  constructor(private readonly service: RiconciliazioniService) {}

  @Get('riconciliazioni')
  @Public()
  @ApiOperation({ summary: 'Corsa notturna: proposte di riconciliazione prodotto × provincia dalle vendite degli ultimi 90 giorni' })
  async corsa(@Headers('authorization') authorization?: string) {
    const segreto = process.env.CRON_SECRET ?? '';
    if (!segreto || authorization !== `Bearer ${segreto}`) throw new UnauthorizedException();
    return this.service.corsaNotturna();
  }
}

@Module({
  imports: [PrismaModule],
  controllers: [RiconciliazioniController, CronRiconciliazioniController],
  providers: [RiconciliazioniService],
})
export class RiconciliazioniModule {}
