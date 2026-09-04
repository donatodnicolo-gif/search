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
import { Role } from '../common/enums';
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
  scontoMedio: number;
  ultimaVendita: string;
};

const arrotonda = (n: number) => Math.round(n * 100) / 100;

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
        productId: { not: null },
        createdAt: { gte: opts.da, lte: opts.a },
        product: { type: 'NON_UNICO' },
      },
      select: {
        id: true, productId: true, provinceId: true, partnerId: true, amount: true, discountPercent: true,
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
          select: { id: true, products: { select: { productId: true, price: true } } },
        })
      : [];
    const righeConsegna = new Map(consegne.map((c) => [c.id, c.products]));
    /** Quanto ha preso il partner per QUEL prodotto in QUELLA vendita. */
    const datoAlPartner = (v: { deliveryId: string | null; productId: string | null; amount: number; discountPercent: number }) => {
      const righe = v.deliveryId ? righeConsegna.get(v.deliveryId) : null;
      const riga = righe?.find((r) => r.productId === v.productId) ?? (righe?.length === 1 ? righe[0] : null);
      if (riga && (riga.price ?? 0) > 0) return { valore: arrotonda(riga.price as number), reale: true };
      return { valore: arrotonda(v.amount * (1 - v.discountPercent / 100)), reale: false };
    };

    type Gruppo = { productId: string; provinceId: string; perPartner: Map<string, typeof vendite>; ultima: (typeof vendite)[number] };
    const gruppi = new Map<string, Gruppo>();
    for (const v of vendite) {
      const chiave = `${v.productId}|${v.provinceId}`;
      const g = gruppi.get(chiave) ?? { productId: v.productId!, provinceId: v.provinceId, perPartner: new Map(), ultima: v };
      g.perPartner.set(v.partnerId!, [...(g.perPartner.get(v.partnerId!) ?? []), v]);
      if (v.createdAt >= g.ultima.createdAt) g.ultima = v;
      gruppi.set(chiave, g);
    }
    if (!gruppi.size) {
      return { venditeLette: 0, coppie: 0, proposteNuove: 0, proposteAggiornate: 0, giaDecise: 0, righe: [] };
    }

    const esistenti = await this.prisma.productReconciliation.findMany({
      where: { productId: { in: [...new Set([...gruppi.values()].map((g) => g.productId))] } },
      select: { id: true, productId: true, provinceId: true, status: true },
    });
    const esistente = new Map(esistenti.map((e) => [`${e.productId}|${e.provinceId}`, e]));

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
          data: { productId: g.productId, provinceId: g.provinceId, status: 'proposta', ...dati },
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
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: filtro.limite ?? 500,
      include: { product: { select: { name: true, sku: true, type: true, price: true, hasVariants: true } } },
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
      this.prisma.partner.findMany({ where: { id: { in: [...partnerIds] } }, select: { id: true, insegna: true, active: true } }),
      this.prisma.province.findMany({ where: { id: { in: [...provinceIds] } }, select: { id: true, name: true, code: true } }),
    ]);
    const nome = new Map(partner.map((p) => [p.id, p]));
    const prov = new Map(province.map((p) => [p.id, p]));
    return righe.map((r) => ({
      id: r.id,
      productId: r.productId,
      prodotto: r.product.name,
      sku: r.product.sku,
      tipoProdotto: r.product.type,
      prezzoListino: r.product.price,
      conVarianti: r.product.hasVariants,
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
      select: { productId: true, provinceId: true, amount: true, discountPercent: true, externalOrderNumber: true },
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
    const gia = await this.prisma.productReconciliation.findUnique({
      where: { productId_provinceId: { productId: vendita.productId, provinceId: vendita.provinceId } },
      select: { id: true, status: true },
    });
    if (gia && gia.status !== 'proposta') {
      throw new BadRequestException(
        gia.status === 'accettata'
          ? 'Per questo prodotto in questa provincia esiste già una regola attiva: modificala in Riconciliazioni.'
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
          data: { productId: vendita.productId, provinceId: vendita.provinceId, ...dati },
          select: { id: true },
        });
    void user;
    return (await this.lista({ ids: [riga.id] }))[0];
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
