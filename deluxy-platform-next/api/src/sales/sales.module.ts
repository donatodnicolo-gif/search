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
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtUser, Roles } from '../common/decorators';
import { ProductType, Role, SaleStatus } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';

/** Un partner candidato allo smistamento, col motivo per cui e' in lista. */
type Candidato = { partnerId: string; motivo: string };

/** Quel che serve allo smistamento per decidere: niente di piu'. */
type ProdottoDaSmistare = {
  id: string;
  type: string;
  partnerId: string | null;
  categoryId: string | null;
  visibleToOtherPartners: boolean;
};

@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(user: JwtUser) {
    const where =
      user.role === Role.PARTNER ? { partnerId: user.partnerId ?? '-' } : {};
    return this.prisma.sale.findMany({
      where,
      include: {
        product: { select: { id: true, name: true, price: true, type: true } },
        partner: { select: { id: true, insegna: true } },
        province: true,
      },
      orderBy: { createdAt: 'desc' },
    });
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
  }) {
    const product = await this.prisma.product.findUnique({
      where: { id: body.productId },
    });
    if (!product) throw new NotFoundException('Prodotto non trovato');

    const quando = body.deliveryDate ? new Date(body.deliveryDate) : new Date();
    const scelto = await this.scegliPartner(product, body.provinceId, quando, []);

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
        provinceId: body.provinceId,
        partnerId: scelto?.partnerId ?? null,
        assignmentReason: scelto?.motivo ?? null,
        customerId: body.customerId,
        brand: body.brand ?? 'DELUXY',
        amount: product.price ?? 0,
        discountPercent: sconto?.discountPercent ?? 0,
        status: scelto ? SaleStatus.PROPOSTA : SaleStatus.DA_GESTIRE,
        source: body.source ?? 'app',
        externalOrderId: body.externalOrderId,
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
    provinceCode?: string;
    provinceId?: string;
    productId?: string;
    productSku?: string;
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

    const prodotto = body.productId
      ? await this.prisma.product.findUnique({ where: { id: body.productId } })
      : body.productSku
        ? await this.prisma.product.findFirst({ where: { sku: body.productSku } })
        : null;
    if (!prodotto) throw new NotFoundException('Prodotto non trovato (per id o SKU)');

    const provincia = body.provinceId
      ? await this.prisma.province.findUnique({ where: { id: body.provinceId } })
      : body.provinceCode
        ? await this.prisma.province.findFirst({
            where: { code: body.provinceCode.toUpperCase() },
          })
        : null;
    if (!provincia) throw new NotFoundException('Provincia non trovata (per id o codice)');

    const vendita = await this.create({
      ...body,
      productId: prodotto.id,
      provinceId: provincia.id,
    });
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

    const consegna = await this.creaConsegna(vendita);
    const aggiornata = await this.prisma.sale.update({
      where: { id },
      data: { status: SaleStatus.ACCETTATA, deliveryId: consegna?.id ?? null },
      include: { partner: { select: { id: true, insegna: true } } },
    });
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
   * Il partner rifiuta: la vendita passa al prossimo della lista, e chi ha
   * rifiutato non la rivede piu'. Se non resta nessuno torna «da gestire».
   */
  async rifiuta(id: string, user: JwtUser) {
    const vendita = await this.prisma.sale.findUnique({
      where: { id },
      include: { product: true },
    });
    if (!vendita) throw new NotFoundException('Vendita non trovata');
    this.assertPuoRispondere(vendita, user);

    const rifiutati: string[] = vendita.refusedPartnerIds
      ? (JSON.parse(vendita.refusedPartnerIds) as string[])
      : [];
    if (vendita.partnerId && !rifiutati.includes(vendita.partnerId)) {
      rifiutati.push(vendita.partnerId);
    }

    const quando = vendita.deliveryDate ?? new Date();
    // ⚠️ Il prodotto puo' non esserci piu': dal 24/08/2026 la vendita e' un
    // fatto avvenuto e non un puntatore al catalogo, quindi cancellare un
    // prodotto azzera il collegamento ma lascia la vendita. Senza prodotto non
    // si puo' ri-smistare — il tipo e la categoria servono a scegliere — e la
    // vendita torna DA GESTIRE, che e' l'esito onesto.
    const prossimo = vendita.product
      ? await this.scegliPartner(
      vendita.product,
      vendita.provinceId,
      quando,
      rifiutati,
        )
      : null;

    return this.prisma.sale.update({
      where: { id },
      data: {
        partnerId: prossimo?.partnerId ?? null,
        assignmentReason: prossimo?.motivo ?? null,
        status: prossimo ? SaleStatus.PROPOSTA : SaleStatus.DA_GESTIRE,
        refusedPartnerIds: JSON.stringify(rifiutati),
      },
      include: { partner: { select: { id: true, insegna: true } } },
    });
  }

  private assertPuoRispondere(vendita: { partnerId: string | null }, user: JwtUser) {
    if (user.role === Role.PARTNER && user.partnerId !== vendita.partnerId) {
      throw new ForbiddenException("Questa vendita non e' proposta a te.");
    }
  }

  // --- smistamento -------------------------------------------------------

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
    quando: Date,
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
      if (await this.aperto(p.id, p.openingHours, quando)) return c;
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
    quando: Date,
  ): Promise<boolean> {
    const giorno = new Date(
      Date.UTC(quando.getFullYear(), quando.getMonth(), quando.getDate()),
    );
    const hhmm = `${String(quando.getHours()).padStart(2, '0')}:${String(
      quando.getMinutes(),
    ).padStart(2, '0')}`;

    // 1) fasce del giorno specifico
    const fasce = await this.prisma.partnerDaySlot.findMany({
      where: { partnerId, date: giorno },
    });
    if (fasce.length) {
      const utili = fasce.filter((f) => f.available);
      if (!utili.length) return false; // giorno dichiarato chiuso
      return utili.some((f) => this.dentro(hhmm, f.timeFrom, f.timeTo));
    }

    // 2) eccezione del giorno specifico
    const ecc = await this.prisma.partnerDayException.findUnique({
      where: { partnerId_date: { partnerId, date: giorno } },
    });
    if (ecc) return ecc.closed ? false : this.dentro(hhmm, ecc.openTime, ecc.closeTime);

    // 3) orari settimanali
    if (!settimanali.length) return true; // nessun orario configurato: sempre aperto
    const oggi = settimanali.filter((h) => h.dayOfWeek === quando.getDay());
    if (!oggi.length) return false;
    return oggi.some((h) => !h.closed && this.dentro(hhmm, h.openTime, h.closeTime));
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
  private async creaConsegna(vendita: {
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
    source?: string;
  }) {
    if (!vendita.partnerId || !vendita.serviceTypeId || !vendita.deliveryDate) return null;
    if (!vendita.recipientFirstName || !vendita.recipientLastName || !vendita.recipientAddress) {
      return null;
    }

    // ⭐ L'ECONOMIA DELLA VENDITA, che prima non veniva scritta affatto.
    //
    // Su una vendita il cliente paga `amount`, noi tratteniamo la nostra quota e
    // il resto e' del partner:
    //   quotaNostra    = amount x discountPercent%      -> `Delivery.price`
    //   datoAlPartner  = amount - quotaNostra           -> `Delivery.productValue`
    //
    // ⚠️ Prima qui c'era `price: vendita.amount`, cioe' l'INTERO importo della
    // vendita nel campo che invece contiene la sola quota trattenuta — e
    // `productValue` restava vuoto. Una consegna nata cosi' avrebbe detto alla
    // Finanza che ci teniamo tutto e che al partner non spetta niente. E' lo
    // stesso equivoco che il 25/08/2026 ha fatto risultare Deluxy padrona
    // dell'87% del venduto sull'intero archivio.
    const quotaNostra = arrotonda((vendita.amount * (vendita.discountPercent ?? 0)) / 100);
    const datoAlPartner = arrotonda(Math.max(0, vendita.amount - quotaNostra));

    // ⭐ LA REGOLA DEL DDT. Su una vendita la consegna viaggia col documento di
    // trasporto, e il suo numero e' il riferimento della vendita: nei dati veri
    // e' cosi' su 10.515 consegne su 12.967 con un DDT (l'81%), e il 96% delle
    // vendite ne ha uno. Qui non veniva scritto: ogni consegna nata da una
    // vendita partiva senza documento.
    const numeroDdt = vendita.externalOrderId?.trim() || null;

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
        price: quotaNostra,
        productValue: datoAlPartner,
        ddtNumber: numeroDdt,
        legacySaleId: vendita.externalOrderId ?? null,
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
@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Get()
  @ApiOperation({ summary: 'Lista vendite (il partner vede le proprie)' })
  findAll(@CurrentUser() user: JwtUser) {
    return this.salesService.findAll(user);
  }

  @Post()
  @ApiOperation({ summary: 'Crea vendita con smistamento automatico al partner' })
  create(
    @Body()
    body: {
      productId: string;
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
  ) {
    return this.salesService.create(body);
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
}

@Module({
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
