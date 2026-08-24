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
