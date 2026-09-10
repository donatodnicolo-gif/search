import { Controller, Get, Headers, Injectable, Logger, Module, Post, Query, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public, Roles } from '../common/decorators';
import { giornoUtc, statoDelGiorno } from '../common/disponibilita-partner';
import { Role } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsModule, SettingsService } from '../settings/settings.module';

/**
 * IL CALENDARIO DEI PARTNER VA A MERCHANDISING, PER I PRODOTTI UNICI (10/09/2026, regola utente:
 * «i prodotti unici dei partner devono aggiornare i loro giorni di disponibilità e l'orario
 * minimo di consegna secondo il calendario del partner»).
 *
 * Chi sa cosa: QUI si sa chi è il proprietario di un prodotto unico e quando è aperto —
 * orari settimanali, fasce del giorno, eccezioni, con la cascata di
 * `common/disponibilita-partner.ts` (la stessa dello smistamento e del tabellone). La BASE
 * dei giorni («da domani») e i metafield del negozio sono casa di Merchandising. Quindi si
 * MANDA il calendario, e di là si calcola e si scrive sul negozio (`POST
 * /api/v1/prodotti/disponibilita`). Stessa strada e stessa chiave dello stato dei prodotti.
 *
 * Il giro è ogni mezz'ora (vercel.json): una chiusura messa oggi per domani deve arrivare sul
 * sito oggi, non a mezzanotte. Costa una lettura di 62 partner e una POST: niente Google,
 * niente Shopify da qui.
 *
 * Partner senza orari: il calendario dice `senzaOrari: true` e di là vale l'ora 9 (regola
 * utente). Prodotti unici senza SKU (1 al 10/09) non si mandano: Merchandising li riconosce
 * per codice. Prodotti col flag «prodotto app» non si mandano: non esistono per Merchandising.
 */
@Injectable()
export class CalendarioUniciService {
  private readonly logger = new Logger(CalendarioUniciService.name);
  constructor(private readonly prisma: PrismaService, private readonly settings: SettingsService) {}

  private async config() {
    const url = (await this.settings.get('merchandisingUrl')) ?? process.env.MERCHANDISING_URL ?? '';
    const chiave = (await this.settings.get('merchandisingApiKey')) ?? process.env.MERCHANDISING_API_KEY ?? '';
    return { url: url.replace(/\/+$/, ''), chiave };
  }

  /** Il calendario di ogni proprietario di prodotti unici, per i prossimi `giorni` giorni (indice 0 = oggi, ora di Roma). */
  async calendario(giorni = 14) {
    const n = Math.min(60, Math.max(1, Math.round(giorni)));
    const unici = await this.prisma.product.findMany({
      where: { type: 'UNICO', active: true, archived: false, deletedAt: null, partnerId: { not: null }, NOT: { sku: null }, prodottoApp: false },
      select: { sku: true, name: true, partnerId: true },
    });
    const partnerIds = [...new Set(unici.map((p) => p.partnerId!))];
    // Oggi a Roma, come giorno UTC a mezzanotte (così parlano le tabelle dei giorni).
    const oggiRoma = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Rome' }));
    const da = giornoUtc(oggiRoma);
    const a = new Date(da.getTime() + n * 24 * 3600 * 1000);
    const [partner, eccezioni, fasce] = await Promise.all([
      this.prisma.partner.findMany({ where: { id: { in: partnerIds } }, select: { id: true, insegna: true, active: true, openingHours: { select: { dayOfWeek: true, openTime: true, closeTime: true, closed: true } } } }),
      this.prisma.partnerDayException.findMany({ where: { partnerId: { in: partnerIds }, date: { gte: da, lt: a } }, select: { partnerId: true, date: true, closed: true, openTime: true, closeTime: true, note: true } }),
      this.prisma.partnerDaySlot.findMany({ where: { partnerId: { in: partnerIds }, date: { gte: da, lt: a } }, select: { partnerId: true, date: true, timeFrom: true, timeTo: true, available: true } }),
    ]);
    const chiave = (pid: string, d: Date) => `${pid}|${d.toISOString().slice(0, 10)}`;
    const ecc = new Map(eccezioni.map((e) => [chiave(e.partnerId, e.date), e]));
    const fas = new Map<string, typeof fasce>();
    for (const f of fasce) { const k = chiave(f.partnerId, f.date); if (!fas.has(k)) fas.set(k, []); fas.get(k)!.push(f); }
    const perPartner = new Map<string, { insegna: string; senzaOrari: boolean; calendario: { data: string; aperto: boolean; dalle: string | null; origine: string }[] }>();
    for (const p of partner) {
      const cal: { data: string; aperto: boolean; dalle: string | null; origine: string }[] = [];
      let senzaOrari = !p.openingHours.length;
      for (let i = 0; i < n; i++) {
        const g = new Date(da.getTime() + i * 24 * 3600 * 1000);
        const k = chiave(p.id, g);
        const stato = statoDelGiorno(ecc.get(k) ?? null, fas.get(k) ?? null, p.openingHours, g.getUTCDay());
        if (stato.origine !== 'sempre') senzaOrari = false;
        cal.push({ data: g.toISOString().slice(0, 10), aperto: p.active && stato.aperto, dalle: stato.fasce[0]?.dalle ?? null, origine: stato.origine });
      }
      perPartner.set(p.id, { insegna: p.insegna, senzaOrari, calendario: cal });
    }
    const prodotti = unici
      .map((u) => { const c = perPartner.get(u.partnerId!); return c ? { codice: u.sku!.trim(), nome: u.name, partner: c.insegna, senzaOrari: c.senzaOrari, calendario: c.calendario } : null; })
      .filter(Boolean);
    return { giorni: n, generatoIl: new Date().toISOString(), partner: perPartner.size, prodotti };
  }

  /** Manda il calendario a Merchandising. `anteprima`: di là si calcola senza scrivere sul negozio. */
  async manda(giorni = 14, anteprima = false) {
    const { url, chiave } = await this.config();
    if (!url || !chiave) return { ok: false, messaggio: 'Merchandising non configurato (merchandisingUrl / merchandisingApiKey).' };
    const cal = await this.calendario(giorni);
    if (!cal.prodotti.length) return { ok: true, mandati: 0, messaggio: 'Nessun prodotto unico con SKU e proprietario.' };
    const res = await fetch(`${url}/api/v1/prodotti/disponibilita${anteprima ? '?anteprima=1' : ''}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': chiave },
      body: JSON.stringify({ giorni: cal.giorni, generatoIl: cal.generatoIl, prodotti: cal.prodotti.map((p) => ({ codice: p!.codice, partner: p!.partner, senzaOrari: p!.senzaOrari, calendario: p!.calendario })) }),
      signal: AbortSignal.timeout(110_000),
    });
    const corpo = await res.json().catch(() => ({}));
    if (!res.ok) {
      this.logger.warn(`Calendario unici: Merchandising risponde HTTP ${res.status}`);
      return { ok: false, mandati: cal.prodotti.length, http: res.status, risposta: corpo };
    }
    this.logger.log(`Calendario unici mandato: ${cal.prodotti.length} prodotti di ${cal.partner} partner · ${JSON.stringify((corpo as any)?.riepilogo ?? {})}`);
    return { ok: true, mandati: cal.prodotti.length, partner: cal.partner, anteprima, risposta: corpo };
  }
}

@ApiTags('merchandising-sync')
@ApiBearerAuth()
@Controller('merchandising-sync')
export class CalendarioUniciController {
  constructor(private readonly service: CalendarioUniciService) {}

  @Get('calendario/prova')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Il calendario dei proprietari dei prodotti unici che si manderebbe a Merchandising (?giorni=14)' })
  prova(@Query('giorni') giorni?: string) {
    return this.service.calendario(Number(giorni) || 14);
  }

  @Post('calendario/anteprima')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Manda il calendario a Merchandising in ANTEPRIMA: di là si calcola, non si scrive sul negozio' })
  anteprima(@Query('giorni') giorni?: string) {
    return this.service.manda(Number(giorni) || 14, true);
  }

  @Post('calendario')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Manda il calendario a Merchandising: giorni minimi e ora minima dei prodotti unici si aggiornano sul negozio' })
  manda(@Query('giorni') giorni?: string) {
    return this.service.manda(Number(giorni) || 14, false);
  }
}

/** La rotta del cron (vercel.json, ogni mezz'ora). Identità = `CRON_SECRET`, come le altre. */
@ApiTags('cron')
@Controller('cron')
export class CalendarioUniciCronController {
  constructor(private readonly service: CalendarioUniciService) {}

  @Get('calendario-unici')
  @Public()
  @ApiOperation({ summary: 'Ogni mezz’ora: il calendario dei partner dei prodotti unici va a Merchandising, che aggiorna giorni minimi e ora minima sul negozio' })
  giro(@Headers('authorization') authorization?: string, @Query('giorni') giorni?: string) {
    const segreto = process.env.CRON_SECRET ?? '';
    if (!segreto || authorization !== `Bearer ${segreto}`) throw new UnauthorizedException();
    return this.service.manda(Number(giorni) || 14, false);
  }
}

@Module({
  imports: [SettingsModule],
  controllers: [CalendarioUniciController, CalendarioUniciCronController],
  providers: [CalendarioUniciService],
  exports: [CalendarioUniciService],
})
export class CalendarioUniciModule {}
