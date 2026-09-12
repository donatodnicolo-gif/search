import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JwtUser } from '../common/decorators';
import { ProductType, Role } from '../common/enums';
import { idsMerceDiServizio, perimetroProdottiPartner } from '../common/perimetro-prodotti';
import { prezzoAlPartner } from '../common/prezzo-partner';
import {
  PagedResult,
  buildOrderBy,
  paginate,
  textSearch,
} from '../common/list-query';
import { ProductListQueryDto } from './dto/product-list-query.dto';
import { PrismaService } from '../prisma/prisma.service';
import { StockService } from '../stock/stock.module';
import { MerchandisingSyncService } from '../merchandising-sync/merchandising-sync.module';
import { CreateProductDto, UpdateProductDto } from './dto/create-product.dto';

const PRODUCT_INCLUDE = {
  partner: { select: { id: true, insegna: true } },
  category: true,
  fields: true,
  variants: true,
  partnerLinks: true,
  components: { include: { componentProduct: { select: { id: true, name: true, price: true } } } },
} as const;

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly merchandising: MerchandisingSyncService,
    private readonly stock: StockService,
  ) {}

  /** Campi testuali coperti dalla ricerca globale `q`. */
  private static readonly SEARCH_FIELDS = [
    'name',
    'sku',
    'line',
    'shortDesc',
    'description',
    'alternateName',
    'category.name',
    'partner.insegna',
  ];

  /** Campi ordinabili (whitelist: niente ordinamenti su colonne arbitrarie). */
  private static readonly SORT_FIELDS = [
    'name',
    'sku',
    'price',
    'publicPrice',
    'stock',
    'type',
    'approved',
    'active',
    'createdAt',
    'category.name',
    'partner.insegna',
  ];

  /**
   * Lista prodotti con ricerca globale, ordinamento e paginazione.
   * Il partner vede solo il proprio perimetro (common/perimetro-prodotti.ts:
   * i suoi + senza partner + «visibile ad altri partner» + partnerLinks).
   */
  async findAll(user: JwtUser, query: ProductListQueryDto): Promise<PagedResult<unknown>> {
    // ⚠️ Gli id della merce di servizio si leggono PRIMA e si passano al perimetro: vedi la nota in
    // common/perimetro-prodotti.ts — la relazione nel where dipende dal client Prisma pubblicato, la
    // lista di id no.
    const inDotazione = user.role === Role.PARTNER ? await idsMerceDiServizio(this.prisma, user.partnerId) : [];
    const roleScope =
      user.role === Role.PARTNER ? perimetroProdottiPartner(user, inDotazione) : {};
    // Archivio: sezione separata da `active`. Di default si vedono i NON
    // archiviati (compresi i disattivati, che restano visibili).
    // I filtri Sì/No entrano solo se qualcuno li ha chiesti: un `undefined`
    // messo nel `where` di Prisma non filtra, ma un `false` sì — e sono cose
    // diverse («tutti» contro «solo i no»).
    const siNo: Record<string, boolean> = {};
    for (const [campo, valore] of [
      ['active', query.active],
      ['approved', query.approved],
      ['isSuperProvince', query.superProvince],
      ['controlStock', query.inStock],
      ['isSuperProduct', query.superProduct],
      ['servizio', query.servizio],
    ] as const) {
      if (valore !== undefined) siNo[campo] = valore;
    }
    // ⚠️ «Prodotto unico» e «Super prodotto» sono DUE cose separate, non due
    // valori dello stesso campo: la prima dice CHI lo vende (`type`), la
    // seconda COM'È FATTO (`isSuperProduct`). Un prodotto può essere unico e
    // combinato insieme, e filtrandoli sullo stesso campo quella combinazione
    // sarebbe stata invisibile.
    const perTipo: Record<string, unknown> = {};
    if (query.unique !== undefined) {
      perTipo['type'] = query.unique ? ProductType.UNICO : { not: ProductType.UNICO };
    }
    // ⭐ 06/09 sera (regola utente): il listino di UN partner — serve alla tendina della consegna,
    // che mostra prima i prodotti del partner scelto.
    const perPartner = query.partnerId ? { partnerId: query.partnerId } : {};
    const scope = { ...roleScope, archived: query.archived === true, ...siNo, ...perTipo, ...perPartner };
    const search = textSearch(query.q, ProductsService.SEARCH_FIELDS);
    // scope e ricerca vanno in AND: la ricerca non deve allargare la visibilita'
    const where = search ? { AND: [scope, search] } : scope;
    const { skip, take, page, pageSize } = paginate(query);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        include: PRODUCT_INCLUDE,
        orderBy: buildOrderBy(query, ProductsService.SORT_FIELDS, { name: 'asc' }) as any,
        skip,
        take,
      }),
      this.prisma.product.count({ where }),
    ]);
    return { items: items.map((p) => ProductsService.colNomeDelPartner(p, user)), total, page, pageSize };
  }

  /**
   * Il dettaglio di un prodotto — solo se è nel perimetro di chi chiede.
   * STESSO perimetro della lista (perimetroPartner): un prodotto che compare
   * in lista deve aprirsi, uno che non compare non deve aprirsi per id.
   */
  /**
   * ⭐ 10/09/2026 (regola utente: «il catalogo prodotti dei partner mostra il nome partner»).
   * Al PARTNER il prodotto si presenta col SUO nome — quello scritto in Merchandising come
   * «nome per il partner» (copiato qui in alternateName/useAlternateName) — in catalogo, nel
   * modulo consegna e in ogni lista che passa da qui. Il nome commerciale NON gli arriva
   * (regola utente: «il partner non lo vede»): il server lo sostituisce, non lo affianca. Per
   * l'ufficio non cambia niente. Vale in LETTURA: in scrittura il partner non tocca il nome.
   */
  private static colNomeDelPartner<T extends { name: string; alternateName?: string | null; useAlternateName?: boolean | null }>(p: T, user?: JwtUser): T {
    if (user?.role !== Role.PARTNER) return p;
    const suo = (p.alternateName ?? '').trim();
    if (!p.useAlternateName || !suo || suo === p.name) return p;
    return { ...p, name: suo };
  }

  async findOne(id: string, user?: JwtUser) {
    const dove: any = { id };
    if (user?.role === Role.PARTNER) {
      dove.OR = perimetroProdottiPartner(user, await idsMerceDiServizio(this.prisma, user.partnerId)).OR;
    }
    const product = await this.prisma.product.findFirst({
      where: dove,
      include: PRODUCT_INCLUDE,
    });
    if (!product) throw new NotFoundException('Prodotto non trovato');
    return ProductsService.colNomeDelPartner(product, user);
  }

  async create(dto: CreateProductDto, user: JwtUser) {
    // Il partner crea solo prodotti propri
    const partnerId =
      user.role === Role.PARTNER ? user.partnerId : dto.partnerId;
    if (dto.type === ProductType.UNICO && !partnerId) {
      throw new BadRequestException('Un prodotto UNICO richiede un partner');
    }
    const {
      fields,
      components,
      variants,
      additionalPartnerIds,
      platforms,
      images,
      platformDescriptions,
      partnerId: _p,
      sku: _sku,
      ...scalar
    } = dto;
    // SKU generato automaticamente (progressivo), rigenerato a ogni duplicazione
    const count = await this.prisma.product.count();
    const baseSku = `DXY-${String(count + 1).padStart(5, '0')}`;
    // SKU variante generato automaticamente: <SKU prodotto>-NN progressivo
    const variantCreate = dto.hasVariants && variants?.length
      ? variants.map((v, i) => ({
          name: v.name,
          price: v.price,
          publicPrice: v.publicPrice,
          sku: `${baseSku}-${String(i + 1).padStart(2, '0')}`,
          note: v.note,
          imageUrl: v.imageUrl,
          prepDays: v.prepDays,
          controlStock: v.controlStock ?? false,
          stock: v.stock,
        }))
      : undefined;
    // ⭐ 11/09/2026 (regola utente): il nome che il PARTNER scrive è il «nome partner» — resta suo
    // (alternateName, acceso) anche quando l'ufficio o Merchandising daranno al prodotto il nome
    // commerciale per il pubblico. Vale solo per ciò che crea il partner.
    const nomeDelPartner = user.role === Role.PARTNER
      ? { alternateName: String(scalar.name ?? '').trim() || undefined, useAlternateName: true }
      : {};
    // ⭐ 11/09/2026 (regola utente): il prodotto creato dal PARTNER è UNICO («tipologia di vendita»
    // non gli si mostra), è suo (niente partner aggiuntivi, niente superprodotto) e il prezzo
    // pubblico lo decidiamo noi. Il modulo lo nasconde; qui si impone.
    if (user.role === Role.PARTNER) {
      (scalar as any).type = ProductType.UNICO;
      (scalar as any).tipologiaVendita = 'unico';
      (scalar as any).isSuperProduct = false;
      (scalar as any).isSuperProvince = false;
      (scalar as any).visibleToOtherPartners = false;
      delete (scalar as any).publicPrice;
    }
    const creato = await this.prisma.product.create({
      data: {
        ...scalar,
        ...nomeDelPartner,
        sku: baseSku,
        partnerId,
        platforms: platforms?.length ? JSON.stringify(platforms) : undefined,
        images: images?.length ? JSON.stringify(images) : undefined,
        platformDescriptions:
          platformDescriptions && Object.keys(platformDescriptions).length
            ? JSON.stringify(platformDescriptions)
            : undefined,
        fields: fields?.length ? { create: fields } : undefined,
        variants: variantCreate ? { create: variantCreate } : undefined,
        partnerLinks: additionalPartnerIds?.length
          ? { create: additionalPartnerIds.map((partnerId) => ({ partnerId })) }
          : undefined,
        components:
          dto.isSuperProduct && components?.length
            ? { create: components }
            : undefined,
      },
      include: PRODUCT_INCLUDE,
    });
    // Un prodotto caricato qui da un partner esiste anche per il PLM: e' parte
    // dell'assortimento Deluxy, e chi cura le collezioni deve vederlo. Non
    // blocca mai la creazione: se Merchandising e' giu', il partner non deve
    // vedere un errore per una cosa che non lo riguarda.
    // ⭐ 11/09/2026: nato dal partner → in Merchandising col SUO nome, DA APPROVARE (fase
    // «prototipo»); approvato là, va su Shopify. Nato dall'ufficio → come prima.
    this.merchandising.spingi(creato as any, user.role === Role.PARTNER ? { partner: (creato as any).partner?.insegna ?? null } : undefined);
    return creato;
  }

  async update(id: string, dto: UpdateProductDto, user: JwtUser) {
    const product = await this.findOne(id);
    if (user.role === Role.PARTNER && product.partnerId !== user.partnerId) {
      throw new ForbiddenException('Puoi modificare solo i tuoi prodotti');
    }
    /**
     * ⭐⭐ 11/09/2026 (regola utente): «i prodotti di servizio assegnati ai partner li deve vedere anche
     * nella sua scheda prodotti: sono prodotti NON MODIFICABILI e non posso chiedere una consegna o
     * archiviare». Il materiale di servizio lo governa l ufficio: il partner lo vede perché è roba che
     * ha in casa, ma non ne cambia nome né prezzo e non lo fa sparire dal proprio elenco — sparirebbe
     * anche dall inventario di chi glielo ha dato.
     */
    if (user.role === Role.PARTNER && (product as { servizio?: boolean }).servizio) {
      throw new ForbiddenException('Questo è materiale di servizio: lo gestisce l ufficio.');
    }
    // ⚠️ 02/09 (regola utente): un prodotto col flag «NON MODIFICABILE» il
    // partner non lo tocca — e non può nemmeno TOGLIERSI il flag da solo (il
    // dto lo dichiara: whitelist ≠ difesa). Il flag lo governa l'ufficio.
    if (user.role === Role.PARTNER) {
      if ((product as any).notEditable) {
        throw new ForbiddenException('Questo prodotto non è modificabile: è gestito dall\'ufficio.');
      }
      delete (dto as Record<string, unknown>)['notEditable'];
      // ⭐ 11/09/2026 (regola utente): il partner non tocca tipologia, tipo, partner, prezzo pubblico,
      // superprodotto, visibilità agli altri partner — sono dell'ufficio.
      for (const k of ['type', 'tipologiaVendita', 'partnerId', 'publicPrice', 'isSuperProduct', 'isSuperProvince', 'visibleToOtherPartners', 'additionalPartnerIds', 'approved', 'active', 'prodottoApp']) {
        delete (dto as Record<string, unknown>)[k];
      }
      if (Array.isArray((dto as any).variants)) for (const v of (dto as any).variants) delete v.publicPrice;
    }
    const {
      fields,
      components,
      variants,
      additionalPartnerIds,
      platforms,
      images,
      platformDescriptions,
      ...scalar
    } = dto;

    /**
     * ⭐⭐ 11/09/2026 (regola utente): «un prodotto approvato e modificato torna da approvare».
     *
     * L'approvazione riguarda UN prodotto preciso: quel nome, quel prezzo, quelle foto, quelle varianti.
     * Se la sostanza cambia, l'approvazione di prima non copre più quello che c'è adesso — e un prodotto
     * che va in vendita con l'etichetta «approvato» addosso, ma con dentro un'altra cosa, è il modo più
     * silenzioso di far uscire una scheda che nessuno ha guardato.
     *
     * ⚠️ Solo la SOSTANZA fa decadere l'approvazione. Cambiare la giacenza, archiviare, spegnere il
     * prodotto o toccare una nota interna non cambia che cosa si vende: farlo tornare «da approvare»
     * sarebbe una coda di lavoro finta, e le code finte insegnano a ignorare quelle vere.
     * ⚠️ Se chi scrive dichiara `approved` (è l'ufficio che approva dal modulo, o Merchandising che
     * comunica l'esito) comanda quello: se no approvare sarebbe impossibile, perché l'atto stesso di
     * approvare farebbe scattare la revoca.
     */
    const SOSTANZA = [
      'name', 'description', 'shortDesc', 'note', 'price', 'publicPrice', 'sku',
      'categoryId', 'type', 'tipologiaVendita', 'prepDays', 'notPhysical',
      'alternateName', 'useAlternateName', 'partnerId',
    ] as const;
    const scalarQualsiasi = scalar as Record<string, unknown>;
    const precedente = product as unknown as Record<string, unknown>;
    const cambiaSostanza =
      SOSTANZA.some((k) => k in scalarQualsiasi && scalarQualsiasi[k] !== precedente[k]) ||
      images !== undefined || variants !== undefined || components !== undefined;
    const decadeApprovazione =
      product.approved === true && cambiaSostanza && !('approved' in (dto as Record<string, unknown>));
    if (decadeApprovazione) scalarQualsiasi['approved'] = false;
    // ⭐ 06/09/2026 (regola utente): la GIACENZA corretta a mano lascia una riga
    // di movimento «rettifica»: il saldo si puo' sempre rifare dai movimenti.
    if (scalar.stock !== undefined && scalar.stock !== (product as any).stock) {
      await this.stock.rettifica(id, (product as any).stock, scalar.stock, user.sub, `giacenza ${(product as any).stock ?? 0} → ${scalar.stock ?? 0} (form prodotto)`);
    }
    return this.prisma.product.update({
      where: { id },
      data: {
        ...scalar,
        ...(platforms ? { platforms: JSON.stringify(platforms) } : {}),
        ...(images ? { images: JSON.stringify(images) } : {}),
        ...(platformDescriptions
          ? { platformDescriptions: JSON.stringify(platformDescriptions) }
          : {}),
        ...(fields ? { fields: { deleteMany: {}, create: fields } } : {}),
        ...(variants
          ? {
              variants: {
                deleteMany: {},
                // SKU variante rigenerato progressivamente dallo SKU del prodotto
                create: variants.map((v, i) => ({
                  name: v.name,
                  price: v.price,
                  publicPrice: v.publicPrice,
                  sku: `${product.sku ?? 'DXY'}-${String(i + 1).padStart(2, '0')}`,
                  note: v.note,
          imageUrl: v.imageUrl,
                  prepDays: v.prepDays,
                  controlStock: v.controlStock ?? false,
                  stock: v.stock,
                })),
              },
            }
          : {}),
        ...(additionalPartnerIds
          ? {
              partnerLinks: {
                deleteMany: {},
                create: additionalPartnerIds.map((partnerId) => ({ partnerId })),
              },
            }
          : {}),
        ...(components
          ? { components: { deleteMany: {}, create: components } }
          : {}),
      },
      include: PRODUCT_INCLUDE,
    });
  }

  /**
   * Archivia / ripristina un prodotto. E' uno stato separato da `active`:
   * l'archiviato sparisce dalla lista principale e va nella sezione Archivio.
   */
  async setArchived(id: string, archived: boolean, user: JwtUser) {
    const product = await this.findOne(id);
    if (user.role === Role.PARTNER && product.partnerId !== user.partnerId) {
      throw new ForbiddenException('Puoi archiviare solo i tuoi prodotti');
    }
    /**
     * ⭐⭐ 11/09/2026 (regola utente): «i prodotti di servizio assegnati ai partner li deve vedere anche
     * nella sua scheda prodotti: sono prodotti NON MODIFICABILI e non posso chiedere una consegna o
     * archiviare». Il materiale di servizio lo governa l ufficio: il partner lo vede perché è roba che
     * ha in casa, ma non ne cambia nome né prezzo e non lo fa sparire dal proprio elenco — sparirebbe
     * anche dall inventario di chi glielo ha dato.
     */
    if (user.role === Role.PARTNER && (product as { servizio?: boolean }).servizio) {
      throw new ForbiddenException('Questo è materiale di servizio: lo gestisce l ufficio.');
    }
    return this.prisma.product.update({
      where: { id },
      data: { archived, archivedAt: archived ? new Date() : null },
      include: PRODUCT_INCLUDE,
    });
  }

  /**
   * Azioni su piu' prodotti insieme: archivia, ripristina, elimina.
   *
   * ⚠️ L'ELIMINAZIONE NON E' PER TUTTI, e non fallisce: separa.
   *
   * Un prodotto usato in una consegna o in una vendita non si puo' cancellare —
   * il database stesso lo impedisce (`ON DELETE RESTRICT`), ed e' giusto: quella
   * riga di consegna dice cosa e' stato portato a qualcuno, e senza il prodotto
   * diventa illeggibile. Sono 6.531 su 22.952 prodotti.
   *
   * Un'azione di gruppo che si ferma al primo prodotto protetto sarebbe
   * peggio di inutile: chi ne seleziona cento non sa quale ha bloccato tutto.
   * Qui si cancella quello che si puo', si LASCIANO STARE gli altri, e la
   * risposta dice quanti e perche'.
   *
   * Chi non puo' essere cancellato viene comunque ARCHIVIATO: e' quasi sempre
   * cio' che chi ha chiesto «elimina» voleva davvero — toglierlo di mezzo.
   */
  async azioneMultipla(
    ids: string[],
    azione: 'archivia' | 'ripristina' | 'elimina',
    user: JwtUser,
  ) {
    if (!ids?.length) throw new BadRequestException('Nessun prodotto selezionato.');
    if (ids.length > 500) throw new BadRequestException('Troppi prodotti in un colpo solo: massimo 500.');

    // Il partner tocca solo i propri, e non si limita a vederselo negato: i
    // prodotti altrui vengono esclusi dalla selezione, non fanno fallire tutto.
    const suoi = await this.prisma.product.findMany({
      where: {
        id: { in: ids },
        ...(user.role === Role.PARTNER ? { partnerId: user.partnerId ?? '-' } : {}),
      },
      select: { id: true, name: true, archived: true },
    });
    const nonTuoi = ids.length - suoi.length;

    if (azione === 'archivia' || azione === 'ripristina') {
      const archived = azione === 'archivia';
      const { count } = await this.prisma.product.updateMany({
        where: { id: { in: suoi.map((p) => p.id) } },
        data: {
          archived,
          archivedAt: archived ? new Date() : null,
          // Un ripristino a mano cancella anche il motivo: da qui in poi quel
          // prodotto e' in lista per decisione di una persona, e le regole
          // automatiche non devono poterlo disfare credendolo loro.
          archivedReason: archived ? 'scelta-manuale' : null,
        },
      });
      return { azione, fatti: count, nonTuoi, bloccati: 0, dettaglio: [] };
    }

    // ⚠️ Non c'e' piu' niente da proteggere, ed e' una scelta di modello, non
    // una scorciatoia: dal 24/08/2026 la riga di consegna e' una FOTOGRAFIA
    // (nome, SKU e variante scritti sulla riga), non un puntatore al catalogo.
    //
    // Cancellare un prodotto non tocca la storia: `productId` diventa null e la
    // consegna continua a dire cosa e' stato portato, a chi, quel giorno.
    // Prima il database si opponeva (`ON DELETE RESTRICT`) e 6.531 prodotti
    // erano incancellabili — anche prove e doppioni.
    const esito = await this.prisma.product.deleteMany({
      where: { id: { in: suoi.map((p) => p.id) } },
    });
    return { azione, fatti: esito.count, archiviatiInvece: 0, bloccati: 0, nonTuoi, dettaglio: [] };
  }


  async remove(id: string, user: JwtUser) {
    const product = await this.findOne(id);
    if (user.role === Role.PARTNER && product.partnerId !== user.partnerId) {
      throw new ForbiddenException('Puoi eliminare solo i tuoi prodotti');
    }
    // 02/09 (regola utente): non modificabile = nemmeno eliminabile dal partner.
    if (user.role === Role.PARTNER && (product as any).notEditable) {
      throw new ForbiddenException('Questo prodotto non è modificabile: è gestito dall\'ufficio.');
    }
    await this.prisma.product.update({ where: { id }, data: { active: false } });
    return { deactivated: true };
  }

  /**
   * Genera i prodotti scontati automatici a partire dagli sconti %
   * per categoria/provincia (CategoryDiscount). Prezzo arrotondato a 0/5 (al piu' vicino).
   */
  async generateDiscountedProducts(categoryId: string) {
    const discounts = await this.prisma.categoryDiscount.findMany({
      where: { categoryId },
      include: { province: true },
    });
    const products = await this.prisma.product.findMany({
      where: { categoryId, isAutoDiscounted: false, active: true },
    });
    const created: string[] = [];
    for (const discount of discounts) {
      for (const product of products) {
        // Stessa regola del costoPartner, in un posto solo: arrotonda a 0/5 al
        // piu' vicino, come questo punto faceva gia' da sempre. Prima invece
        // il costoPartner non arrotondava affatto: stesso partner, due prezzi.
        const rounded = prezzoAlPartner(product.price, discount.discountPercent);
        const variant = await this.prisma.product.create({
          data: {
            name: `${product.name} (-${discount.discountPercent}% ${discount.province.code})`,
            description: product.description,
            price: rounded,
            type: product.type,
            partnerId: product.partnerId,
            categoryId: product.categoryId,
            visibleToOtherPartners: product.visibleToOtherPartners,
            isAutoDiscounted: true,
            parentProductId: product.id,
          },
        });
        created.push(variant.id);
      }
    }
    return { created: created.length };
  }
}
