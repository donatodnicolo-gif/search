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
      where: { deletedAt: null, NOT: { sku: null } },
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
      where: { deletedAt: null, NOT: { sku: null } },
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
  }): void {
    if (product.createdFrom === DA_MERCHANDISING) return;
    void this.inviaOra(product).catch((err) =>
      this.logger.warn(`Prodotto ${product.id} non inviato a Merchandising: ${(err as Error).message}`),
    );
  }

  /** Come `spingi`, ma attende l'esito: serve a chi vuole saperlo. */
  async inviaOra(product: {
    id: string; sku?: string | null; name: string; description?: string | null;
    price?: number | null; publicPrice?: number | null; imageUrl?: string | null;
    category?: { name?: string | null } | null;
  }) {
    const { url, chiave } = await this.config();
    if (!url || !chiave) return { ok: false, messaggio: 'Merchandising non configurato.' };
    if (!product.sku) return { ok: false, messaggio: 'Il prodotto non ha SKU: Merchandising lo riconosce da quello.' };

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
        origine: 'platform',
        idEsterno: product.id,
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

@Module({
  imports: [SettingsModule],
  controllers: [MerchandisingSyncController],
  providers: [MerchandisingSyncService],
  exports: [MerchandisingSyncService],
})
export class MerchandisingSyncModule {}
