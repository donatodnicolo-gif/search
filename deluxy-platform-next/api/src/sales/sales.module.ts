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
        amount: variante?.price ?? product.price ?? 0,
        discountPercent: sconto?.discountPercent ?? 0,
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
      productVariantId: variantId ?? undefined,
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

    const variante = vendita.productVariantId
      ? await this.prisma.productVariant.findUnique({ where: { id: vendita.productVariantId } })
      : null;
    const consegna = await this.creaConsegna(vendita, variante);
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
        deliveryId: consegnaId,
        partnerId: vendita.partnerId,
        assignmentReason: [vendita.assignmentReason, 'portata in consegna da Customer Service (31/08)']
          .filter(Boolean).join(' · '),
      },
    });
    return { portataInConsegna: true, venditaId: vendita.id, deliveryId: consegnaId };
  }

  /** Dettaglio di una vendita: serve al prefill del form consegna (ufficio). */
  async findOne(id: string) {
    const vendita = await this.prisma.sale.findUnique({
      where: { id },
      include: {
        product: { select: { id: true, name: true, price: true, type: true } },
        partner: { select: { id: true, insegna: true } },
        province: true,
      },
    });
    if (!vendita) throw new NotFoundException('Vendita non trovata');
    return vendita;
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
    prodotti?: { productId: string | null; productVariantId: string | null; nome: string | null; quantita: number; sku: string | null }[];
  }> {
    const sale = await this.prisma.sale.findUnique({
      where: { id }, select: { externalOrderId: true },
    });
    if (!sale?.externalOrderId) return { disponibile: false };

    const cfg = await this.prisma.appSetting.findMany({ where: { key: { in: ['ordersUrl', 'ordersApiKey'] } } });
    const map = Object.fromEntries(cfg.map((r) => [r.key, r.value]));
    const url = (map['ordersUrl'] || process.env.ORDERS_URL || '').replace(/\/+$/, '');
    const chiave = map['ordersApiKey'] || process.env.ORDERS_API_KEY || '';
    if (!url || !chiave) return { disponibile: false };

    let ordine: any;
    try {
      const res = await fetch(
        `${url}/api/v1/ordini/${encodeURIComponent(sale.externalOrderId)}?annullati=inclusi`,
        { headers: { 'x-api-key': chiave } },
      );
      if (!res.ok) return { disponibile: false };
      ordine = await res.json();
    } catch {
      return { disponibile: false };
    }

    // Mittente = chi ha ORDINATO (il committente del regalo), non il destinatario.
    // Si divide sull'ULTIMO spazio: «Maria Teresa Rossi» = nome «Maria Teresa».
    const nome = String(ordine?.mittente?.nome ?? ordine?.cliente?.nome ?? '').trim();
    const taglio = nome.lastIndexOf(' ');
    const mittenteFirstName = taglio > 0 ? nome.slice(0, taglio) : nome || undefined;
    const mittenteLastName = taglio > 0 ? nome.slice(taglio + 1) : undefined;

    // Contrassegno (pagamento alla consegna): categoria «contrassegno» di Orders.
    const contrassegno =
      String(ordine?.categoriaPagamento ?? ordine?.pagamento?.categoria ?? '').toLowerCase() === 'contrassegno';

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

    return { disponibile: true, mittenteFirstName, mittenteLastName, contrassegno, prodotti };
  }

  /**
   * L'ufficio PRENDE IN MANO la vendita (bottone «Inserisci», 31/08/2026):
   * ferma il giro automatico — se era proposta a un partner, la proposta
   * decade (accetta/rifiuta valgono solo su PROPOSTA) — e la consegna si
   * inserisce a mano dal form. La vendita resta «da gestire» finché la
   * consegna non nasce: chiuderla PRIMA direbbe il falso, e chi abbandona il
   * form a metà la ritroverebbe dove deve stare.
   */
  async prendiInMano(id: string) {
    const vendita = await this.prisma.sale.findUnique({ where: { id } });
    if (!vendita) throw new NotFoundException('Vendita non trovata');
    if (![SaleStatus.PROPOSTA, SaleStatus.DA_GESTIRE].includes(vendita.status as SaleStatus)) {
      throw new BadRequestException(`La vendita non è aperta (stato: ${vendita.status}).`);
    }
    return this.prisma.sale.update({
      where: { id },
      data: {
        status: SaleStatus.DA_GESTIRE,
        // Idempotente: il secondo click non deve accodare il motivo un'altra
        // volta (visto in pagina il 31/08: «presa in mano · presa in mano»).
        assignmentReason: vendita.assignmentReason?.includes('inserimento manuale')
          ? vendita.assignmentReason
          : [vendita.assignmentReason, "presa in mano dall'ufficio: inserimento manuale"]
              .filter(Boolean).join(' · '),
      },
      include: { product: { select: { id: true, name: true } }, province: true },
    });
  }

  /**
   * Chiude il giro dell'inserimento manuale: la consegna è nata dal form,
   * la vendita la aggancia e passa in storico (accettata). Il partner della
   * vendita diventa quello della CONSEGNA: è lì che l'ufficio ha deciso.
   */
  async collegaConsegna(id: string, deliveryId: string) {
    const vendita = await this.prisma.sale.findUnique({ where: { id } });
    if (!vendita) throw new NotFoundException('Vendita non trovata');
    if (!deliveryId) throw new BadRequestException('deliveryId obbligatorio');
    const consegna = await this.prisma.delivery.findUnique({
      where: { id: deliveryId }, select: { id: true, partnerId: true },
    });
    if (!consegna) throw new BadRequestException('Consegna inesistente');
    if (vendita.deliveryId && vendita.deliveryId !== deliveryId) {
      throw new BadRequestException('La vendita è già collegata a un\'altra consegna');
    }
    return this.prisma.sale.update({
      where: { id },
      data: {
        status: SaleStatus.ACCETTATA,
        deliveryId,
        partnerId: consegna.partnerId ?? vendita.partnerId,
      },
    });
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

    // ⭐ L'ECONOMIA DELLA VENDITA, che prima non veniva scritta affatto.
    //
    // Su una vendita il cliente paga il pubblico, e col partner vale:
    //   quotaNostra   = amount x discountPercent%   -> `Delivery.price`
    //   valoreProdotti = amount                     -> `Delivery.productValue`
    //   al partner spetta valoreProdotti − quota (cosi' lo calcola la
    //   Fatturazione: «dovuto = valore prodotti − trattenuto»).
    //
    // ⚠️ E' la STESSA convenzione delle consegne importate (62637: productValue
    // 215, quota 43): fino al 26/08 qui si scriveva `productValue = amount −
    // quota`, che sembrava giusto ma contava la quota DUE volte adesso che il
    // margine della Finanza somma anche la fee registrata.
    const quotaNostra = arrotonda((vendita.amount * (vendita.discountPercent ?? 0)) / 100);
    const valoreProdotti = arrotonda(vendita.amount);

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
        productValue: valoreProdotti,
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
                // Il prezzo di riga e' il PUBBLICO (cosi' lo legge la Finanza):
                // della variante se c'e', del prodotto altrimenti. Se nessuno
                // dei due lo dichiara resta vuoto — non si inventa.
                price: variante?.publicPrice ?? vendita.product?.publicPrice ?? null,
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
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Dettaglio vendita (per il prefill del form consegna)' })
  findOne(@Param('id') id: string) {
    return this.salesService.findOne(id);
  }

  @Get(':id/ordine')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Dettaglio ordine dietro la vendita (mittente, righe, contrassegno) per il prefill' })
  dettaglioOrdine(@Param('id') id: string) {
    return this.salesService.dettaglioOrdine(id);
  }

  @Post()
  @ApiOperation({ summary: 'Crea vendita con smistamento automatico al partner' })
  create(
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
  inserisci(@Param('id') id: string) {
    return this.salesService.prendiInMano(id);
  }

  @Post(':id/collega-consegna')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Collega la consegna inserita a mano e chiude la vendita (accettata)' })
  collegaConsegna(@Param('id') id: string, @Body() body: { deliveryId?: string }) {
    return this.salesService.collegaConsegna(id, body?.deliveryId ?? '');
  }
}

@Module({
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
