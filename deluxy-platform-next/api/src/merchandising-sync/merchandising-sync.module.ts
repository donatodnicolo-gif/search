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
import { ProductType, Role } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsModule, SettingsService } from '../settings/settings.module';

/** Un prodotto come lo espone Merchandising. */
type ProdottoMerch = {
  id: string;
  codice: string;
  nome: string;
  fase: string;
  categoria?: string | null;
  descrizione?: string | null;
  costoProduzione?: number | null;
  prezzoVendita?: number | null;
  immagine?: string | null;
  origine?: string | null;
  /** ⭐ 06/09/2026: la TIPOLOGIA DI VENDITA (unico | quantita | mix | preventivo). La casa
   *  è Merchandising — qui si legge e basta, e la colonna locale è uno specchio. */
  tipologiaVendita?: string | null;
  /** ⭐ 07/09/2026: la NOTA DI SPECIFICA, del prodotto e delle sue taglie. */
  note?: string | null;
  /** ⭐ 10/09/2026: il NOME PER IL PARTNER e la spunta che dice se usarlo. La casa è
   *  Merchandising; qui si copia su Product.alternateName / useAlternateName. */
  nomePartner?: string | null;
  nomePartnerAttivo?: boolean | null;
  varianti?: { id: string; nome: string; sku: string | null; note: string | null }[];
};

/** Da dove viene un prodotto in piattaforma. */
const DA_MERCHANDISING = 'merchandising';

@Injectable()
export class MerchandisingSyncService {
  private readonly logger = new Logger(MerchandisingSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  private async config() {
    const url = (await this.settings.get('merchandisingUrl')) ?? process.env.MERCHANDISING_URL ?? '';
    const chiave =
      (await this.settings.get('merchandisingApiKey')) ?? process.env.MERCHANDISING_API_KEY ?? '';
    return { url: url.replace(/\/+$/, ''), chiave };
  }

  /**
   * Tira i prodotti nati in Merchandising che qui non ci sono.
   *
   * ⚠️ Non è una copia del catalogo, ed è la cosa che conta: dei 4.610 prodotti
   * di Merchandising, 3.526 (il 76%) sono già in piattaforma. Si crea solo
   * quello che manca, riconosciuto per SKU, per SKU di variante o per nome.
   *
   * Le fasi non valgono uguale:
   *  - `in_vendita` → entra attivo;
   *  - `archiviato` → entra GIÀ ARCHIVIATO: serve a riconoscere un ordine
   *    vecchio che lo nomina, non a riempire la lista di roba morta;
   *  - concept/prototipo/approvato → NON entra. Sono prodotti in progettazione,
   *    e questa non è l'app dove si progettano.
   *
   * ⚠️ Tutto entra con `approved: false`. In Merchandising il costo è zero su
   * 2.805 prodotti in vendita su 2.807: quello zero non è un prezzo, è un dato
   * che manca, e finché nessuno mette il valore vero questi prodotti non devono
   * finire in una consegna né nei conti della Finanza.
   */
  async tira(opzioni: { da?: string; limite?: number; applica?: boolean } = {}) {
    const { url, chiave } = await this.config();
    if (!url || !chiave) {
      return { ok: false, messaggio: 'Indirizzo o chiave di Merchandising non impostati (Configurazione → Impostazioni).' };
    }

    const limite = Math.min(5000, Math.max(1, opzioni.limite ?? 1000));
    const prodotti: ProdottoMerch[] = [];
    let pagina = 1;
    while (prodotti.length < limite) {
      const q = new URLSearchParams({ page: String(pagina), limit: '200' });
      if (opzioni.da) q.set('da', opzioni.da);
      const res = await fetch(`${url}/api/v1/prodotti?${q}`, { headers: { 'x-api-key': chiave } });
      if (!res.ok) return { ok: false, messaggio: `Merchandising risponde HTTP ${res.status} alla pagina ${pagina}.` };
      const body = (await res.json()) as { prodotti?: ProdottoMerch[]; pagine?: number };
      const lotto = body.prodotti ?? [];
      prodotti.push(...lotto);
      if (!lotto.length || pagina >= (body.pagine ?? 1)) break;
      pagina++;
    }

    // Gli indici di riconoscimento, letti una volta sola.
    const [perSku, perVariante, perNome, categorie] = await Promise.all([
      this.prisma.product.findMany({ where: { NOT: { sku: null } }, select: { sku: true } }),
      this.prisma.productVariant.findMany({ where: { NOT: { sku: null } }, select: { sku: true } }),
      this.prisma.product.findMany({ select: { name: true } }),
      this.prisma.category.findMany({ select: { id: true, name: true } }),
    ]);
    const sku = new Set(perSku.map((x) => x.sku!.trim().toUpperCase()));
    const skuVar = new Set(perVariante.map((x) => x.sku!.trim().toUpperCase()));
    const nomi = new Set(perNome.map((x) => x.name.trim().toLowerCase()));
    const perCategoria = new Map(categorie.map((c) => [c.name.trim().toLowerCase(), c.id]));

    const VENDIBILE = 'in_vendita';
    const ARCHIVIATO = 'archiviato';
    const conta = { gia: 0, inSviluppo: 0, creati: 0, attivi: 0, archiviati: 0 };
    const daCreare: any[] = [];

    for (const p of prodotti) {
      const codice = String(p.codice ?? '').trim();
      if (!codice) continue;
      const chiaveSku = codice.toUpperCase();
      if (sku.has(chiaveSku) || skuVar.has(chiaveSku) || nomi.has(String(p.nome).trim().toLowerCase())) {
        conta.gia++;
        continue;
      }
      const vendibile = p.fase === VENDIBILE;
      if (!vendibile && p.fase !== ARCHIVIATO) { conta.inSviluppo++; continue; }
      vendibile ? conta.attivi++ : conta.archiviati++;
      daCreare.push({
        sku: codice,
        name: String(p.nome).trim(),
        description: p.descrizione ?? null,
        price: Number(p.costoProduzione) || 0,
        publicPrice: Number(p.prezzoVendita) || null,
        imageUrl: p.immagine ?? null,
        // Solo se la categoria esiste già: non se ne inventano di nuove, e
        // meglio senza categoria che in quella sbagliata.
        categoryId: perCategoria.get(String(p.categoria ?? '').trim().toLowerCase()) ?? null,
        type: ProductType.NON_UNICO,
        active: vendibile,
        approved: false,
        archived: !vendibile,
        archivedAt: vendibile ? null : new Date(),
        archivedReason: vendibile ? null : 'archiviato-in-merchandising',
        tipologiaVendita: p.tipologiaVendita ?? null,
        createdFrom: DA_MERCHANDISING,
        reference: p.id,
      });
    }

    if (opzioni.applica) {
      for (const dati of daCreare) {
        await this.prisma.product.create({ data: dati });
        conta.creati++;
      }
      this.logger.log(`Merchandising: creati ${conta.creati} prodotti`);
    }

    return {
      ok: true,
      applicato: !!opzioni.applica,
      lettiDaMerchandising: prodotti.length,
      giaPresenti: conta.gia,
      inProgettazioneNonImportati: conta.inSviluppo,
      daCreare: daCreare.length,
      attivi: conta.attivi,
      archiviati: conta.archiviati,
      creati: conta.creati,
    };
  }

  /**
   * ⭐ 06/09/2026 (decisione dell'utente): la TIPOLOGIA DI VENDITA ha una casa sola, ed è
   * Merchandising. Qui si tiene uno specchio, perché lo smistamento la legge a ogni vendita
   * e non può dipendere da una chiamata di rete; questo metodo lo riallinea.
   *
   * Non è una classificazione: non si decide niente qui dentro. Si copia il valore di là,
   * riconoscendo il prodotto per CODICE (`Product.sku` = `Prodotto.codice`). Chi in
   * Merchandising non ha ancora una tipologia non si tocca — un campo vuoto non cancella
   * quello che c'è.
   */
  async allineaTipologie(applica = false) {
    const { url, chiave } = await this.config();
    if (!url || !chiave) return { ok: false, messaggio: 'Merchandising non configurato.' };

    const daLoro = new Map<string, string>();
    let pagina = 1;
    for (;;) {
      const q = new URLSearchParams({ page: String(pagina), limit: '200' });
      const res = await fetch(`${url}/api/v1/prodotti?${q}`, { headers: { 'x-api-key': chiave } });
      if (!res.ok) return { ok: false, messaggio: `Merchandising risponde HTTP ${res.status} alla pagina ${pagina}.` };
      const body = (await res.json()) as { prodotti?: ProdottoMerch[]; pagine?: number };
      for (const p of body.prodotti ?? []) {
        const codice = String(p.codice ?? '').trim().toUpperCase();
        if (codice && p.tipologiaVendita) daLoro.set(codice, p.tipologiaVendita);
      }
      if (!(body.prodotti ?? []).length || pagina >= (body.pagine ?? 1)) break;
      pagina++;
    }

    const nostri = await this.prisma.product.findMany({
      where: { deletedAt: null, NOT: { sku: null }, prodottoApp: false },
      select: { id: true, sku: true, tipologiaVendita: true },
    });
    const daCambiare = nostri.filter((p) => {
      const t = daLoro.get(p.sku!.trim().toUpperCase());
      return t && t !== p.tipologiaVendita;
    });
    let scritti = 0;
    if (applica) {
      for (const p of daCambiare) {
        await this.prisma.product.update({
          where: { id: p.id },
          data: { tipologiaVendita: daLoro.get(p.sku!.trim().toUpperCase()) },
        });
        scritti++;
      }
      this.logger.log(`Tipologie allineate da Merchandising: ${scritti}`);
    }
    return {
      ok: true,
      applicato: applica,
      classificatiInMerchandising: daLoro.size,
      prodottiQui: nostri.length,
      daCambiare: daCambiare.length,
      scritti,
    };
  }

  /**
   * ⭐ 07/09/2026 (regola utente: «quando la vendita arriva su app delivery, se in
   * merchandising è presente questo campo importalo; lo faremo vedere al fioraio»).
   *
   * Le NOTE DI SPECIFICA — «Medio: 20-25 fiori», «18-20 cm, 650 g - 1 kg», «6/8 porzioni» —
   * vivono in Merchandising, che le ricostruisce dalla descrizione del negozio. Qui si
   * copiano sul prodotto e sulla VARIANTE giusta, riconosciuti per codice: il fioraio deve
   * sapere quanti fiori mettere, e non può aprire un'altra app per scoprirlo.
   *
   * Non si sovrascrive con niente: una nota vuota di là lascia stare quella di qua.
   */
  async allineaNote(applica = false) {
    const { url, chiave } = await this.config();
    if (!url || !chiave) return { ok: false, messaggio: 'Merchandising non configurato.' };

    const noteProdotto = new Map<string, string>();
    const noteVariante = new Map<string, string>();
    // ⭐ 10/09/2026 (regola utente): anche il NOME PER IL PARTNER viaggia con le note.
    const nomePartner = new Map<string, { nome: string | null; attivo: boolean }>();
    let pagina = 1;
    for (;;) {
      const q = new URLSearchParams({ page: String(pagina), limit: '200' });
      const res = await fetch(`${url}/api/v1/prodotti?${q}`, { headers: { 'x-api-key': chiave } });
      if (!res.ok) return { ok: false, messaggio: `Merchandising risponde HTTP ${res.status} alla pagina ${pagina}.` };
      const body = (await res.json()) as { prodotti?: ProdottoMerch[]; pagine?: number };
      for (const p of body.prodotti ?? []) {
        const codice = String(p.codice ?? '').trim().toUpperCase();
        if (codice && p.note) noteProdotto.set(codice, p.note);
        if (codice && (p.nomePartner != null || p.nomePartnerAttivo != null)) nomePartner.set(codice, { nome: (p.nomePartner ?? '').trim() || null, attivo: Boolean(p.nomePartnerAttivo) && !!(p.nomePartner ?? '').trim() });
        for (const v of p.varianti ?? []) {
          const sku = String(v.sku ?? '').trim().toUpperCase();
          if (sku && v.note) noteVariante.set(sku, v.note);
        }
      }
      if (!(body.prodotti ?? []).length || pagina >= (body.pagine ?? 1)) break;
      pagina++;
    }

    const prodotti = await this.prisma.product.findMany({
      where: { deletedAt: null, NOT: { sku: null }, prodottoApp: false },
      select: { id: true, sku: true, note: true, alternateName: true, useAlternateName: true },
    });
    const varianti = await this.prisma.productVariant.findMany({
      where: { NOT: { sku: null } },
      select: { id: true, sku: true, note: true },
    });
    const prodottiDaCambiare = prodotti.filter((x) => {
      const n = noteProdotto.get(x.sku!.trim().toUpperCase());
      return n && n !== x.note;
    });
    const variantiDaCambiare = varianti.filter((x) => {
      const n = noteVariante.get(x.sku!.trim().toUpperCase());
      return n && n !== x.note;
    });
    const nomiDaCambiare = prodotti.filter((x) => {
      const n = nomePartner.get(x.sku!.trim().toUpperCase());
      return n && ((n.nome ?? null) !== (x.alternateName ?? null) || n.attivo !== x.useAlternateName);
    });
    let scritti = 0;
    if (applica) {
      for (const x of nomiDaCambiare) {
        const n = nomePartner.get(x.sku!.trim().toUpperCase())!;
        await this.prisma.product.update({ where: { id: x.id }, data: { alternateName: n.nome, useAlternateName: n.attivo } });
        scritti++;
      }
      for (const x of prodottiDaCambiare) {
        await this.prisma.product.update({ where: { id: x.id }, data: { note: noteProdotto.get(x.sku!.trim().toUpperCase()) } });
        scritti++;
      }
      for (const x of variantiDaCambiare) {
        await this.prisma.productVariant.update({ where: { id: x.id }, data: { note: noteVariante.get(x.sku!.trim().toUpperCase()) } });
        scritti++;
      }
      this.logger.log(`Note allineate da Merchandising: ${scritti}`);
    }
    return {
      ok: true,
      applicato: applica,
      noteInMerchandising: { prodotti: noteProdotto.size, varianti: noteVariante.size },
      nomiPartnerInMerchandising: nomePartner.size,
      nomiPartnerDaCambiare: nomiDaCambiare.length,
      daCambiare: { prodotti: prodottiDaCambiare.length, varianti: variantiDaCambiare.length },
      scritti,
    };
  }

  /**
   * Manda a Merchandising un prodotto nato qui (il partner ha caricato la sua
   * offerta dal proprio account).
   *
   * È **best-effort e non blocca mai** la creazione del prodotto: se
   * Merchandising è giù, il partner non deve vedere un errore per una cosa che
   * non lo riguarda. Lo stesso patto che la sincronizzazione con Anagrafiche ha
   * già con i partner.
   *
   * ⚠️ Si manda solo ciò che è nato QUI. Rimandare indietro un prodotto arrivato
   * da Merchandising sarebbe un'eco: due app che si riscrivono a vicenda lo
   * stesso dato, e nessuna delle due che sa più chi l'ha deciso.
   */
  spingi(product: {
    id: string; sku?: string | null; name: string; description?: string | null;
    price?: number | null; publicPrice?: number | null; imageUrl?: string | null;
    createdFrom?: string | null; category?: { name?: string | null } | null;
    // ⭐ 11/09/2026: la firma si allarga con i campi del contratto §3.1, tutti facoltativi — chi chiama
    // con un prodotto «magro» continua a funzionare, e chi passa l'intero record li manda tutti.
    shortDesc?: string | null; note?: string | null; prepDays?: number | null;
    notPhysical?: boolean | null; alternateName?: string | null; useAlternateName?: boolean | null;
    images?: string | null; tipologiaVendita?: string | null; type?: string | null;
    partnerId?: string | null;
    variants?: { name: string; sku?: string | null; price?: number | null; publicPrice?: number | null; note?: string | null; stock?: number | null }[] | null;
  }, extra?: { partner?: string | null }): void {
    if (product.createdFrom === DA_MERCHANDISING) return;
    void this.inviaOra(product, extra).catch((err) =>
      this.logger.warn(`Prodotto ${product.id} non inviato a Merchandising: ${(err as Error).message}`),
    );
  }

  /** Come `spingi`, ma attende l'esito: serve a chi vuole saperlo. */
  /**
   * ⭐ 11/09/2026 (regola utente): con `extra.partner` il prodotto è NATO DAL PARTNER — in
   * Merchandising arriva col suo nome anche come «nome partner», in fase «prototipo» (da
   * approvare: là chi approva lo manda su Shopify in bozza, chi lo mette «Pubblico» lo pubblica).
   */
  async inviaOra(product: {
    id: string; sku?: string | null; name: string; description?: string | null;
    price?: number | null; publicPrice?: number | null; imageUrl?: string | null;
    category?: { name?: string | null } | null;
    // ⭐ 11/09/2026: i campi che Merchandising accetta già e che non partivano (contratto §3.1).
    shortDesc?: string | null; note?: string | null; prepDays?: number | null;
    notPhysical?: boolean | null; alternateName?: string | null; useAlternateName?: boolean | null;
    images?: string | null; tipologiaVendita?: string | null; type?: string | null;
    partnerId?: string | null;
    variants?: { name: string; sku?: string | null; price?: number | null; publicPrice?: number | null; note?: string | null; stock?: number | null }[] | null;
  }, extra?: { partner?: string | null }) {
    const { url, chiave } = await this.config();
    if (!url || !chiave) return { ok: false, messaggio: 'Merchandising non configurato.' };
    if (!product.sku) return { ok: false, messaggio: 'Il prodotto non ha SKU: Merchandising lo riconosce da quello.' };

    /**
     * ⭐ 11/09/2026 (contratto §2-ter, chiesto da Merchandising) — I DATI DEL PARTNER VIAGGIANO COL
     * PRODOTTO: insegna, id numerico, città e province.
     *
     * Di là quei quattro riempiono i campi del negozio che solo noi conosciamo: `custom.partner_id`,
     * `custom.partner_address` (da dove parte la consegna) e `custom.nations_availability` (dove si può
     * comprare). Senza, restano vuoti finché non passa il cron — e il cron scrive su Shopify, quindi su
     * un prodotto ancora da approvare non scrive affatto.
     *
     * ⚠️ `legacyId` va mandato SOLO se numerico: di là è il metafield `custom.partner_id`, dichiarato
     * `number_integer` su Shopify, e un cuid lì dentro fa rifiutare l'intero prodotto.
     * ⚠️ Si rilegge il partner da qui invece di fidarsi di quello che arriva: `spingi()` viene chiamata
     * da più punti, e non tutti includono le province. Una query in più su una creazione non si sente.
     */
    const partner = product.partnerId
      ? await this.prisma.partner.findUnique({
          where: { id: product.partnerId },
          select: {
            insegna: true, legacyId: true, city: true,
            provinces: { select: { province: { select: { code: true } } } },
          },
        })
      : null;

    const res = await fetch(`${url}/api/v1/prodotti`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': chiave },
      body: JSON.stringify({
        codice: product.sku,
        nome: product.name,
        descrizione: product.description ?? null,
        categoria: product.category?.name ?? null,
        costoProduzione: product.price ?? 0,
        prezzoVendita: product.publicPrice ?? 0,
        immagine: product.imageUrl ?? null,
        origine: extra?.partner ? 'partner' : 'platform',
        idEsterno: product.id,
        shortDesc: product.shortDesc ?? null,
        note: product.note ?? null,
        prepDays: product.prepDays ?? null,
        notPhysical: product.notPhysical ?? null,
        alternateName: product.alternateName ?? null,
        useAlternateName: product.useAlternateName ?? null,
        images: product.images ?? null,
        tipologiaVendita: product.tipologiaVendita ?? null,
        type: product.type ?? null,
        partnerId: product.partnerId ?? null,
        partner: partner
          ? {
              insegna: partner.insegna,
              // Numerico o niente: vedi l'avvertenza qui sopra.
              legacyId: typeof partner.legacyId === 'number' ? partner.legacyId : null,
              city: partner.city ?? null,
              provinces: partner.provinces.map((p) => p.province?.code).filter(Boolean),
            }
          : null,
        variants: (product.variants ?? []).map((v) => ({
          name: v.name, sku: v.sku ?? null, price: v.price ?? null,
          publicPrice: v.publicPrice ?? null, note: v.note ?? null, stock: v.stock ?? null,
        })),
        ...(extra?.partner ? {
          nomePartner: product.name,
          nomePartnerAttivo: true,
          fase: 'prototipo',
          noteSviluppo: `Creato dal partner ${extra.partner} dalla piattaforma il ${new Date().toLocaleDateString('it-IT')}: DA APPROVARE. Approvato → su Shopify in bozza; Pubblico → in vendita.`,
        } : {}),
      }),
    });
    const testo = await res.text();
    if (!res.ok) return { ok: false, stato: res.status, messaggio: `Merchandising risponde HTTP ${res.status}: ${testo.slice(0, 200)}` };
    return { ok: true, messaggio: 'Prodotto inviato a Merchandising.' };
  }
}

@ApiTags('merchandising-sync')
@ApiBearerAuth()
@Controller('merchandising-sync')
export class MerchandisingSyncController {
  constructor(private readonly service: MerchandisingSyncService) {}

  @Get('prova')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Simula il tiraggio dei prodotti da Merchandising, senza scrivere' })
  prova() {
    return this.service.tira({ applica: false });
  }

  @Get('note/prova')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Quante note di specifica cambierebbero, leggendo Merchandising' })
  provaNote() {
    return this.service.allineaNote(false);
  }

  @Post('note')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Importa da Merchandising le note di specifica (prodotto e varianti)' })
  note() {
    return this.service.allineaNote(true);
  }

  @Get('tipologie/prova')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Quante tipologie di vendita cambierebbero, leggendo Merchandising' })
  provaTipologie() {
    return this.service.allineaTipologie(false);
  }

  @Post('tipologie')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Riallinea la tipologia di vendita dei prodotti leggendola da Merchandising' })
  tipologie() {
    return this.service.allineaTipologie(true);
  }

  @Post('tira')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Porta in piattaforma i prodotti nati in Merchandising che qui non ci sono' })
  tira(@Body() body: { da?: string; limite?: number; applica?: boolean }) {
    return this.service.tira(body ?? {});
  }
}

/**
 * ⭐ 10/09/2026 (segnalazione utente sull'ordine 2902: «abbiamo cambiato la tipologia di
 * prodotto, aggiorna i bottoni legati alla vendita») — la tipologia di vendita si cambia in
 * Merchandising, ma i bottoni della vendita (preventivo / inserisci / rifiuta) leggono lo
 * specchio in piattaforma, che finora si riallineava solo a mano da Impostazioni. Ogni ora
 * lo fa l'orologio (vercel.json). Identità = `CRON_SECRET`, come gli altri cron.
 */
@ApiTags('cron')
@Controller('cron')
export class TipologieCronController {
  constructor(private readonly service: MerchandisingSyncService) {}

  @Get('tipologie')
  @Public()
  @ApiOperation({ summary: 'Ogni ora: rispecchia in piattaforma la tipologia di vendita dei prodotti letta da Merchandising' })
  giro(@Headers('authorization') authorization?: string) {
    const segreto = process.env.CRON_SECRET ?? '';
    if (!segreto || authorization !== `Bearer ${segreto}`) throw new UnauthorizedException();
    return this.service.allineaTipologie(true);
  }
}

@Module({
  imports: [SettingsModule],
  controllers: [MerchandisingSyncController, TipologieCronController],
  providers: [MerchandisingSyncService],
  exports: [MerchandisingSyncService],
})
export class MerchandisingSyncModule {}
