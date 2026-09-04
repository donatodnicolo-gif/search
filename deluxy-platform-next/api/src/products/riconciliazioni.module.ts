// ============================================================
// RICONCILIAZIONI PRODOTTO ↔ PARTNER (04/09/2026, chiesto dall'utente)
// ------------------------------------------------------------
// «Per admin e operation in prodotti fai sezione riconciliazioni dove l'AI
// analizza ogni notte ordini dati a partner e prezzi e comunica se
// riconciliare il prodotto con partner così che tutte le prossime vendite
// vadano a quel partner a quel prezzo.» E poi: «dai possibilità di inviare
// ordini di un intervallo personalizzato e restituire risultati anche con
// lancio manuale».
//
// ⭐ LA REGOLA: l'AI PROPONE, una persona DECIDE. Ogni corsa (di notte o a
// mano) legge le vendite ACCETTATE dai partner in una finestra di date, le
// raggruppa per prodotto, calcola i numeri (quante a chi, a quale prezzo) e
// chiede al modello se conviene «riconciliare»: fissare il prodotto su quel
// partner a quel prezzo. La proposta finisce in tabella con il motivo; solo
// «Riconcilia» dell'ufficio tocca il prodotto (partner proprietario, tipo
// UNICO, prezzo di listino) — e la riga conserva com'era prima.
//
// ⚠️ I numeri li calcola il codice, non il modello: al modello arrivano
// conteggi e prezzi già fatti, e la risposta è vincolata a uno schema con i
// soli partner presenti nei dati. Un partner inventato non può passare.
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
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AiModule, AiService } from '../ai/ai.module';
import { CurrentUser, JwtUser, Public, Roles } from '../common/decorators';
import { Role } from '../common/enums';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';

/** Quanti prodotti al massimo per corsa (i più venduti prima). */
const MAX_PRODOTTI_PER_CORSA = 80;
/** Quanti prodotti per chiamata al modello. */
const PRODOTTI_PER_CHIAMATA = 20;
/** Finestra di default della corsa notturna, in giorni. */
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
  scontoMedio: number;
};

type Riepilogo = {
  productId: string;
  nome: string;
  sku: string | null;
  tipo: string;
  partnerAttualeId: string | null;
  partnerAttuale: string | null;
  prezzoListino: number;
  conVarianti: boolean;
  vendite: number;
  partner: StatPartner[];
};

const SCHEMA_DECISIONI = {
  type: 'object' as const,
  additionalProperties: false,
  properties: {
    decisioni: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        additionalProperties: false,
        properties: {
          productId: { type: 'string' as const },
          riconciliare: { type: 'boolean' as const },
          partnerId: { anyOf: [{ type: 'string' as const }, { type: 'null' as const }] },
          prezzo: { anyOf: [{ type: 'number' as const }, { type: 'null' as const }] },
          motivo: { type: 'string' as const, description: 'Una o due frasi in italiano, coi numeri' },
          confidenza: { type: 'string' as const, enum: ['alta', 'media', 'bassa'] },
        },
        required: ['productId', 'riconciliare', 'partnerId', 'prezzo', 'motivo', 'confidenza'],
      },
    },
  },
  required: ['decisioni'],
};

const ISTRUZIONI = [
  'Sei il responsabile operativo di Deluxy, consegne di lusso. Decidi se RICONCILIARE un prodotto con un partner: cioè fissare che tutte le prossime vendite di quel prodotto vadano a quel partner a quel prezzo.',
  'Ricevi, per ogni prodotto, i numeri già calcolati: quante vendite accettate nel periodo, a quali partner, con quale quota percentuale, a quali prezzi (min, max, moda), e com\'è impostato oggi il prodotto (tipo UNICO/NON_UNICO, partner proprietario, prezzo di listino).',
  '',
  'REGOLE, in ordine di importanza:',
  '1. Proponi di riconciliare SOLO se un partner domina chiaramente: almeno 3 vendite e almeno il 70% delle vendite del prodotto. Con meno dati la risposta è riconciliare=false e lo dici nel motivo.',
  '2. partnerId deve essere uno dei partnerId elencati per QUEL prodotto. Mai altri. Se il partner dominante non è attivo, riconciliare=false.',
  '3. prezzo: la moda dei prezzi di quel partner, se i prezzi sono stabili (min e max vicini). Se i prezzi ballano molto, lascia prezzo=null e spiegalo. Se il prodotto ha varianti, prezzo=null sempre (il prezzo sta sulle varianti).',
  '4. Se il prodotto è GIÀ UNICO di quel partner e il prezzo di listino coincide con la moda, riconciliare=false con motivo «già impostato così».',
  '5. Nel motivo scrivi i numeri (es. «12 vendite su 13 a Flor, sempre a 45 €»): chi legge deve poterti smentire a colpo d\'occhio.',
  '6. confidenza: alta con molte vendite e prezzi stabili; media con pochi dati o prezzi variabili; bassa se il quadro è ambiguo.',
  '7. Rispondi per OGNI prodotto ricevuto, con il suo productId esatto.',
].join('\n');

const arrotonda = (n: number) => Math.round(n * 100) / 100;

function moda(valori: number[]): number {
  const conta = new Map<number, number>();
  for (const v of valori) conta.set(arrotonda(v), (conta.get(arrotonda(v)) ?? 0) + 1);
  let migliore = valori[0] ?? 0;
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  /** I numeri per prodotto: chi ha venduto che cosa, a quanto. Solo codice. */
  private async riepiloghi(da: Date, a: Date): Promise<{ riepiloghi: Riepilogo[]; prodottiTotali: number; venditeLette: number }> {
    const vendite = await this.prisma.sale.findMany({
      where: {
        status: 'accettata',
        partnerId: { not: null },
        productId: { not: null },
        createdAt: { gte: da, lte: a },
      },
      select: { productId: true, partnerId: true, amount: true, discountPercent: true },
    });

    const perProdotto = new Map<string, Map<string, { amounts: number[]; sconti: number[] }>>();
    for (const v of vendite) {
      const p = perProdotto.get(v.productId!) ?? new Map();
      const s = p.get(v.partnerId!) ?? { amounts: [], sconti: [] };
      s.amounts.push(v.amount);
      s.sconti.push(v.discountPercent);
      p.set(v.partnerId!, s);
      perProdotto.set(v.productId!, p);
    }

    // I più venduti prima: la corsa ha un tetto e deve guardare dove c'è più da decidere.
    const ordinati = [...perProdotto.entries()]
      .map(([productId, partner]) => ({
        productId,
        partner,
        totale: [...partner.values()].reduce((n, s) => n + s.amounts.length, 0),
      }))
      .sort((x, y) => y.totale - x.totale);
    const scelti = ordinati.slice(0, MAX_PRODOTTI_PER_CORSA);

    const prodotti = await this.prisma.product.findMany({
      where: { id: { in: scelti.map((s) => s.productId) } },
      select: {
        id: true, name: true, sku: true, type: true, partnerId: true, price: true, hasVariants: true,
        partner: { select: { insegna: true } },
      },
    });
    const partnerIds = new Set<string>();
    for (const s of scelti) for (const id of s.partner.keys()) partnerIds.add(id);
    const partner = await this.prisma.partner.findMany({
      where: { id: { in: [...partnerIds] } },
      select: { id: true, insegna: true, active: true },
    });
    const perPartner = new Map(partner.map((p) => [p.id, p]));
    const perId = new Map(prodotti.map((p) => [p.id, p]));

    const riepiloghi: Riepilogo[] = [];
    for (const s of scelti) {
      const p = perId.get(s.productId);
      if (!p) continue; // prodotto cancellato: niente da riconciliare
      const stat: StatPartner[] = [...s.partner.entries()]
        .map(([partnerId, d]) => {
          const pa = perPartner.get(partnerId);
          return {
            partnerId,
            insegna: pa?.insegna ?? '(partner sconosciuto)',
            attivo: pa?.active ?? false,
            vendite: d.amounts.length,
            quotaPercento: Math.round((d.amounts.length / s.totale) * 100),
            prezzoMin: arrotonda(Math.min(...d.amounts)),
            prezzoMax: arrotonda(Math.max(...d.amounts)),
            prezzoModa: moda(d.amounts),
            scontoMedio: arrotonda(d.sconti.reduce((n, x) => n + x, 0) / d.sconti.length),
          };
        })
        .sort((x, y) => y.vendite - x.vendite);
      riepiloghi.push({
        productId: p.id,
        nome: p.name,
        sku: p.sku,
        tipo: p.type,
        partnerAttualeId: p.partnerId,
        partnerAttuale: p.partner?.insegna ?? null,
        prezzoListino: p.price,
        conVarianti: p.hasVariants,
        vendite: s.totale,
        partner: stat,
      });
    }
    return { riepiloghi, prodottiTotali: ordinati.length, venditeLette: vendite.length };
  }

  /**
   * La corsa: legge, chiede al modello, scrive le proposte. Ritorna le righe
   * scritte, così il lancio manuale mostra subito il risultato.
   */
  async analizza(opts: { da: Date; a: Date; innesco: 'notte' | 'manuale' }) {
    if (!(opts.da instanceof Date) || isNaN(opts.da.getTime()) || isNaN(opts.a.getTime())) {
      throw new BadRequestException('Intervallo di date non valido.');
    }
    if (opts.da > opts.a) throw new BadRequestException('La data «da» viene dopo la data «a».');

    const { riepiloghi, prodottiTotali, venditeLette } = await this.riepiloghi(opts.da, opts.a);
    if (!riepiloghi.length) {
      return { analizzati: 0, proposte: 0, venditeLette, prodottiTotali, prodottiOltreIlTetto: 0, modello: null, righe: [] };
    }

    type Decisione = {
      productId: string;
      riconciliare: boolean;
      partnerId: string | null;
      prezzo: number | null;
      motivo: string;
      confidenza: 'alta' | 'media' | 'bassa';
    };
    const decisioni = new Map<string, Decisione>();
    let modello: string | null = null;
    for (let i = 0; i < riepiloghi.length; i += PRODOTTI_PER_CHIAMATA) {
      const lotto = riepiloghi.slice(i, i + PRODOTTI_PER_CHIAMATA);
      const esito = await this.ai.strutturato<{ decisioni: Decisione[] }>({
        istruzioni: ISTRUZIONI,
        testo: `Periodo analizzato: dal ${opts.da.toISOString().slice(0, 10)} al ${opts.a.toISOString().slice(0, 10)}.\n\nPRODOTTI (JSON):\n${JSON.stringify(lotto)}`,
        schema: SCHEMA_DECISIONI,
        nome: 'riconciliazioni',
        maxToken: 12000,
      });
      modello = esito.modello;
      for (const d of esito.dati.decisioni ?? []) decisioni.set(d.productId, d);
    }

    const righe: string[] = [];
    let proposte = 0;
    for (const r of riepiloghi) {
      const d = decisioni.get(r.productId);
      // ⚠️ Vincoli di codice sopra la risposta: partner solo fra quelli visti
      // (e attivo), prezzo mai su prodotti con varianti. Il modello propone,
      // il codice non gli lascia scavalcare i dati.
      const partnerValido = d?.partnerId && r.partner.find((p) => p.partnerId === d.partnerId && p.attivo);
      const riconciliare = Boolean(d?.riconciliare && partnerValido);
      const prezzo = riconciliare && !r.conVarianti && typeof d?.prezzo === 'number' && d.prezzo > 0 ? arrotonda(d.prezzo) : null;
      const motivo = d?.motivo?.trim() || 'Il modello non ha risposto per questo prodotto.';
      const gia = riconciliare && r.tipo === 'UNICO' && r.partnerAttualeId === d!.partnerId && (prezzo === null || prezzo === r.prezzoListino);

      await this.prisma.$transaction(async (tx) => {
        // Una proposta aperta per prodotto: la corsa nuova sostituisce quella
        // vecchia non ancora decisa. Le decise restano, sono storia.
        await tx.productReconciliation.deleteMany({ where: { productId: r.productId, status: { in: ['proposta', 'nessuna'] } } });
        const riga = await tx.productReconciliation.create({
          data: {
            productId: r.productId,
            from: opts.da,
            to: opts.a,
            salesCount: r.vendite,
            stats: JSON.stringify(r.partner),
            recommend: riconciliare && !gia,
            partnerId: riconciliare ? d!.partnerId : null,
            price: prezzo,
            reason: gia ? `Già impostato così. ${motivo}` : motivo,
            confidence: d?.confidenza ?? 'bassa',
            model: modello ?? '',
            previousPartnerId: r.partnerAttualeId,
            previousType: r.tipo,
            previousPrice: r.prezzoListino,
            status: riconciliare && !gia ? 'proposta' : 'nessuna',
            trigger: opts.innesco,
          },
          select: { id: true },
        });
        righe.push(riga.id);
      });
      if (riconciliare && !gia) proposte++;
    }

    return {
      analizzati: riepiloghi.length,
      proposte,
      venditeLette,
      prodottiTotali,
      prodottiOltreIlTetto: Math.max(0, prodottiTotali - riepiloghi.length),
      modello,
      righe: await this.lista({ ids: righe }),
    };
  }

  /** Le righe con i nomi: prodotto, partner proposto, partner di oggi. */
  async lista(filtro: { stato?: string; ids?: string[]; limite?: number }) {
    const righe = await this.prisma.productReconciliation.findMany({
      where: {
        ...(filtro.ids ? { id: { in: filtro.ids } } : {}),
        ...(filtro.stato && filtro.stato !== 'tutte' ? { status: filtro.stato } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { salesCount: 'desc' }],
      take: filtro.limite ?? 500,
      include: { product: { select: { name: true, sku: true, type: true, partnerId: true, price: true, hasVariants: true } } },
    });
    const partnerIds = new Set<string>();
    for (const r of righe) {
      if (r.partnerId) partnerIds.add(r.partnerId);
      if (r.previousPartnerId) partnerIds.add(r.previousPartnerId);
      if (r.product.partnerId) partnerIds.add(r.product.partnerId);
    }
    const partner = await this.prisma.partner.findMany({
      where: { id: { in: [...partnerIds] } },
      select: { id: true, insegna: true },
    });
    const nome = new Map(partner.map((p) => [p.id, p.insegna]));
    return righe.map((r) => ({
      id: r.id,
      productId: r.productId,
      prodotto: r.product.name,
      sku: r.product.sku,
      tipoAttuale: r.product.type,
      partnerAttualeId: r.product.partnerId,
      partnerAttuale: r.product.partnerId ? nome.get(r.product.partnerId) ?? null : null,
      prezzoListino: r.product.price,
      conVarianti: r.product.hasVariants,
      da: r.from,
      a: r.to,
      vendite: r.salesCount,
      stats: JSON.parse(r.stats) as StatPartner[],
      riconciliare: r.recommend,
      partnerId: r.partnerId,
      partner: r.partnerId ? nome.get(r.partnerId) ?? null : null,
      prezzo: r.price,
      motivo: r.reason,
      confidenza: r.confidence,
      modello: r.model,
      primaPartner: r.previousPartnerId ? nome.get(r.previousPartnerId) ?? null : null,
      primaTipo: r.previousType,
      primaPrezzo: r.previousPrice,
      stato: r.status,
      innesco: r.trigger,
      decisaIl: r.decidedAt,
      decisaDa: r.decidedBy,
      creataIl: r.createdAt,
    }));
  }

  /**
   * La decisione di una persona. «accetta» tocca il prodotto: partner
   * proprietario, tipo UNICO, prezzo di listino (solo se proposto). Da quel
   * momento lo smistamento propone il prodotto SOLO a quel partner
   * (`candidati`: UNICO → proprietario).
   */
  async decidi(id: string, azione: 'accetta' | 'rifiuta', user: JwtUser) {
    const r = await this.prisma.productReconciliation.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Riconciliazione non trovata');
    if (r.status !== 'proposta') throw new BadRequestException('Questa proposta è già stata decisa.');
    if (azione === 'accetta' && !r.partnerId) throw new BadRequestException('La proposta non indica un partner.');

    await this.prisma.$transaction(async (tx) => {
      if (azione === 'accetta') {
        await tx.product.update({
          where: { id: r.productId },
          data: {
            partnerId: r.partnerId!,
            type: 'UNICO',
            ...(r.price !== null ? { price: r.price } : {}),
          },
        });
      }
      await tx.productReconciliation.update({
        where: { id },
        data: { status: azione === 'accetta' ? 'accettata' : 'rifiutata', decidedAt: new Date(), decidedBy: user.email },
      });
    });
    return (await this.lista({ ids: [id] }))[0];
  }

  /** La corsa di notte: ultimi 90 giorni, esito in AppSetting. */
  async corsaNotturna() {
    const a = new Date();
    const da = new Date(a.getTime() - GIORNI_NOTTE * 86400000);
    let esito: Record<string, unknown>;
    try {
      const e = await this.analizza({ da, a, innesco: 'notte' });
      esito = { ok: true, analizzati: e.analizzati, proposte: e.proposte, venditeLette: e.venditeLette, prodottiOltreIlTetto: e.prodottiOltreIlTetto, modello: e.modello };
    } catch (err) {
      esito = { ok: false, errore: (err as Error).message.slice(0, 300) };
    }
    await this.prisma.appSetting.upsert({
      where: { key: 'riconciliazioniUltimaCorsa' },
      update: { value: JSON.stringify({ quando: new Date().toISOString(), da, a, ...esito }) },
      create: { key: 'riconciliazioniUltimaCorsa', value: JSON.stringify({ quando: new Date().toISOString(), da, a, ...esito }) },
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
  @ApiOperation({ summary: 'Le proposte di riconciliazione (stato=proposta|nessuna|accettata|rifiutata|tutte)' })
  lista(@Query('stato') stato?: string) {
    return this.service.lista({ stato: stato || 'proposta' });
  }

  @Get('ultima-corsa')
  @ApiOperation({ summary: 'Esito dell\'ultima corsa notturna' })
  ultimaCorsa() {
    return this.service.ultimaCorsa();
  }

  @Post('analizza')
  @ApiOperation({ summary: 'Lancio manuale su un intervallo di date: analizza e restituisce le proposte' })
  analizza(@Body() body: { da?: string; a?: string }) {
    if (!body?.da || !body?.a) throw new BadRequestException('Servono le date «da» e «a».');
    const da = new Date(`${body.da}T00:00:00.000Z`);
    const a = new Date(`${body.a}T23:59:59.999Z`);
    return this.service.analizza({ da, a, innesco: 'manuale' });
  }

  @Post(':id/accetta')
  @ApiOperation({ summary: 'Riconcilia: il prodotto diventa UNICO di quel partner, al prezzo proposto' })
  accetta(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.decidi(id, 'accetta', user);
  }

  @Post(':id/rifiuta')
  @ApiOperation({ summary: 'Ignora la proposta: il prodotto resta com\'è' })
  rifiuta(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.decidi(id, 'rifiuta', user);
  }
}

/**
 * La corsa NOTTURNA (vercel.json, 03:30). Identità = `CRON_SECRET`,
 * verificata PRIMA di tutto, come per `cron/margini`.
 */
@ApiTags('cron')
@Controller('cron')
export class CronRiconciliazioniController {
  constructor(private readonly service: RiconciliazioniService) {}

  @Get('riconciliazioni')
  @Public()
  @ApiOperation({ summary: 'Corsa notturna: proposte di riconciliazione prodotto ↔ partner (ultimi 90 giorni)' })
  async corsa(@Headers('authorization') authorization?: string) {
    const segreto = process.env.CRON_SECRET ?? '';
    if (!segreto || authorization !== `Bearer ${segreto}`) throw new UnauthorizedException();
    return this.service.corsaNotturna();
  }
}

@Module({
  imports: [PrismaModule, AiModule],
  controllers: [RiconciliazioniController, CronRiconciliazioniController],
  providers: [RiconciliazioniService],
})
export class RiconciliazioniModule {}
