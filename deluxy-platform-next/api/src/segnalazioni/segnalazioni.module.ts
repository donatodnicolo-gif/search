import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtUser, Roles } from '../common/decorators';
import { Role } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsModule, SettingsService } from '../settings/settings.module';

/**
 * SEGNALAZIONI (31/08/2026): l'ufficio (admin/operation) apre segnalazioni su
 * un partner o un valet; i partner e i valet aprono reclami (che sono
 * segnalazioni «in entrata»). Tutto in un posto solo. Il partner/valet vede
 * solo le proprie; l'ufficio le vede tutte e le gestisce.
 */
@Injectable()
export class SegnalazioniService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  private async arricchisci(righe: any[]) {
    const partnerIds = [...new Set(righe.map((r) => r.partnerId).filter(Boolean))];
    const valetIds = [...new Set(righe.map((r) => r.valetId).filter(Boolean))];
    const [partner, valet] = await Promise.all([
      partnerIds.length ? this.prisma.partner.findMany({ where: { id: { in: partnerIds } }, select: { id: true, insegna: true } }) : [],
      valetIds.length ? this.prisma.valet.findMany({ where: { id: { in: valetIds } }, select: { id: true, firstName: true, lastName: true } }) : [],
    ]);
    const pMap = new Map<string, string>(partner.map((p) => [p.id, p.insegna] as [string, string]));
    const vMap = new Map<string, string>(valet.map((v) => [v.id, `${v.lastName} ${v.firstName}`] as [string, string]));
    return righe.map((r) => ({
      ...r,
      partnerNome: r.partnerId ? pMap.get(r.partnerId) ?? null : null,
      valetNome: r.valetId ? vMap.get(r.valetId) ?? null : null,
    }));
  }

  async lista(user: JwtUser, stato?: string, tipo?: string, deliveryId?: string) {
    const where: any = {};
    if (stato) where.stato = stato;
    if (tipo) where.tipo = tipo;
    // 02/09 (regola utente): il dettaglio consegna mostra le richieste GIÀ
    // partite su quella consegna — il filtro resta dentro lo scope per ruolo.
    if (deliveryId) where.deliveryId = deliveryId;
    // Partner/valet vedono SOLO le proprie.
    if (user.role === Role.PARTNER) where.partnerId = user.partnerId ?? '-';
    else if (user.role === Role.VALET) where.valetId = user.valetId ?? '-';
    // ⚠️ Con lo storico importato (1.100+ righe) un take basso NASCONDEVA in
    // silenzio le più vecchie. Il tetto resta, ma alto abbastanza da coprire
    // tutto lo storico attuale; se un domani cresce ancora, si pagina.
    const righe = await this.prisma.segnalazione.findMany({ where, orderBy: { createdAt: 'desc' }, take: 3000 });
    return this.arricchisci(righe);
  }

  async crea(user: JwtUser, body: {
    tipo?: string; partnerId?: string; valetId?: string; deliveryId?: string; oggetto?: string; testo?: string; importo?: number; allegatoUrl?: string;
  }) {
    const testo = (body?.testo ?? '').trim();
    if (!testo) throw new BadRequestException('Il testo della segnalazione è obbligatorio.');
    // L'allegato: un data URL (foto/documento) o un link. Cap prudente per non
    // ingoiare file enormi in colonna.
    const allegatoUrl = (body?.allegatoUrl ?? '').trim() || null;
    if (allegatoUrl && allegatoUrl.length > 8_000_000) throw new BadRequestException('Allegato troppo grande.');
    // Partner/valet aprono qualcosa su SE STESSI; l'ufficio una SEGNALAZIONE su
    // chi indica. Il valet può aprire un RECLAMO o una richiesta di RIMBORSO
    // (`tipo: 'rimborso'`, con importo); il partner solo reclami.
    let partnerId = body.partnerId ?? null;
    let valetId = body.valetId ?? null;
    let tipo = body.tipo ?? 'segnalazione';
    let importo: number | null = null;
    if (user.role === Role.PARTNER) { partnerId = user.partnerId ?? null; valetId = null; tipo = 'reclamo'; }
    else if (user.role === Role.VALET) {
      valetId = user.valetId ?? null; partnerId = null;
      tipo = body.tipo === 'rimborso' ? 'rimborso' : 'reclamo';
    }
    // ⭐ 03/09 (regola utente): il denaro che i valet devono ricevere —
    // rimborsi E reclami — vive TUTTO qui. L'importo si accetta su entrambi
    // i tipi quando c'è un valet; sul rimborso resta obbligatorio.
    if (tipo === 'rimborso' || (tipo === 'reclamo' && valetId)) {
      const n = Number(body.importo);
      if (Number.isFinite(n) && n > 0) importo = Math.round(n * 100) / 100;
      else if (tipo === 'rimborso') throw new BadRequestException('Indica un importo valido per il rimborso.');
    }
    return this.prisma.segnalazione.create({
      data: {
        tipo, importo, partnerId, valetId, deliveryId: body.deliveryId ?? null,
        oggetto: body.oggetto?.trim() || null, testo, allegatoUrl,
        apertaDaUserId: user.sub, apertaDaRuolo: user.role,
      },
    });
  }

  /**
   * Ufficio: cambia stato / risponde.
   *
   * ⭐ 03/09 (regola utente): sui tipi con IMPORTO (rimborsi e reclami dei
   * valet) il giro ha il VERDETTO — aperta → in_lavorazione → approvata |
   * respinta → pagata. All'APPROVAZIONE, se c'è una consegna collegata,
   * l'importo si applica alla sua paga (valetAdditionalPrice += importo):
   * così entra da solo nel prossimo stipendio. `importoApplicatoIl` fa da
   * guardia (mai due volte) e il riaprire STORNA.
   */
  async aggiorna(user: JwtUser, id: string, body: { stato?: string; risposta?: string }) {
    const s = await this.prisma.segnalazione.findUnique({ where: { id } });
    if (!s) throw new BadRequestException('Segnalazione non trovata');
    const data: any = {};
    if (body.stato) {
      const nuovo = body.stato;
      const conDenaro = (s.importo ?? 0) > 0;
      // ⭐ 04/09/2026 (regola utente): «bisogna dire se il reclamo è stato
      // approvato o rifiutato, non “chiudi”». Il verdetto vale per RIMBORSI e
      // RECLAMI anche senza importo: chiudere e basta non dice se avevamo
      // torto o ragione, e chi l'ha aperto resta senza risposta.
      // «Pagata» resta solo dove c'è denaro: non si paga un reclamo da 0 €.
      const conVerdetto = conDenaro || s.tipo === 'reclamo' || s.tipo === 'rimborso';
      if (['approvata', 'respinta'].includes(nuovo) && !conVerdetto) {
        throw new BadRequestException('Il verdetto vale per rimborsi e reclami, non per le segnalazioni interne');
      }
      if (nuovo === 'pagata' && !conDenaro) {
        throw new BadRequestException('Si segna pagata solo una richiesta con un importo');
      }
      if (nuovo === 'pagata' && s.stato !== 'approvata') {
        throw new BadRequestException('Si segna pagata solo una richiesta approvata');
      }
      if (nuovo === 'respinta' && s.importoApplicatoIl) {
        throw new BadRequestException('Importo già applicato alla consegna: riaprire prima (lo storna), poi respingere');
      }
      if (nuovo === 'approvata' && !s.importoApplicatoIl && s.deliveryId) {
        // L'importo entra nella paga della consegna, una volta sola.
        const d = await this.prisma.delivery.findUnique({
          where: { id: s.deliveryId }, select: { id: true, valetAdditionalPrice: true },
        });
        if (d) {
          await this.prisma.delivery.update({
            where: { id: d.id },
            data: {
              valetAdditionalPrice: Math.round((((d.valetAdditionalPrice ?? 0) + (s.importo ?? 0))) * 100) / 100,
              logs: { create: { type: 'note', userId: user.sub ?? null,
                message: `Plus/minus valet +${(s.importo ?? 0).toFixed(2)} € da ${s.tipo} approvato (segnalazione ${s.id})` } },
            },
          });
          data.importoApplicatoIl = new Date();
        }
      }
      if (nuovo === 'aperta' && s.importoApplicatoIl && s.deliveryId) {
        // Riaperta dopo l'approvazione: lo storno riporta la paga com'era.
        const d = await this.prisma.delivery.findUnique({
          where: { id: s.deliveryId }, select: { id: true, valetAdditionalPrice: true },
        });
        if (d) {
          await this.prisma.delivery.update({
            where: { id: d.id },
            data: {
              valetAdditionalPrice: Math.round((((d.valetAdditionalPrice ?? 0) - (s.importo ?? 0))) * 100) / 100,
              logs: { create: { type: 'note', userId: user.sub ?? null,
                message: `Storno plus/minus valet −${(s.importo ?? 0).toFixed(2)} € (segnalazione ${s.id} riaperta)` } },
            },
          });
        }
        data.importoApplicatoIl = null;
      }
      data.stato = nuovo;
      if (['chiusa', 'respinta', 'pagata'].includes(nuovo)) data.chiusaIl = new Date();
      if (nuovo === 'aperta' || nuovo === 'in_lavorazione') data.chiusaIl = null;
    }
    if (body.risposta !== undefined) data.risposta = body.risposta?.trim() || null;
    const aggiornata = await this.prisma.segnalazione.update({ where: { id }, data });
    // ⭐ 03/09 (regola utente): a OGNI cambio di stato parte una mail
    // all'interessato. Solo se lo stato è cambiato DAVVERO (doppio click =
    // una mail sola), mai bloccante: l'esito della pratica non dipende
    // dalla posta.
    if (body.stato && body.stato !== s.stato) {
      try { await this.mailCambioStato(aggiornata); } catch { /* best effort */ }
    }
    return aggiornata;
  }

  /**
   * La mail del cambio di stato, via AI Mail (stesso canale del recap paghe).
   * Difese dell'automatismo (trappola nota, 27/08): niente arretrato (parte
   * solo dal click di adesso), una per cambio vero, mai a indirizzi
   * automatici (ripiego per prefisso, dichiarato), mai alla propria casella,
   * tetto strutturale di 1 per azione; il registro degli invii è la posta
   * inviata di AI Mail.
   */
  private async mailCambioStato(s: {
    id: string; tipo: string; stato: string; importo: number | null; oggetto: string | null;
    risposta: string | null; valetId: string | null; partnerId: string | null;
  }) {
    let destinatario = '';
    let nome = '';
    if (s.valetId) {
      const v = await this.prisma.valet.findUnique({ where: { id: s.valetId }, select: { email: true, firstName: true } });
      destinatario = (v?.email ?? '').trim();
      nome = v?.firstName ?? '';
    } else if (s.partnerId) {
      const p = await this.prisma.partner.findUnique({ where: { id: s.partnerId }, select: { email: true, insegna: true } });
      destinatario = (p?.email ?? '').trim();
      nome = p?.insegna ?? '';
    }
    if (!destinatario) return;
    // Ripiego per prefisso: senza intestazioni vere è il meglio che c'è qui.
    if (/^(noreply|no-reply|notifications?|mailer-daemon|postmaster)@/i.test(destinatario)) return;
    const url = ((await this.settings.get('mailUrl')) ?? process.env.MAIL_URL ?? 'https://deluxy-mail.vercel.app').replace(/\/+$/, '');
    const chiave = (await this.settings.get('mailApiKey')) ?? process.env.MAIL_API_KEY ?? '';
    const utente = (await this.settings.get('mailUtente')) ?? process.env.MAIL_UTENTE ?? '';
    if (!chiave || !utente) return; // invio non configurato: niente mail, nessun errore
    if (destinatario.toLowerCase() === utente.toLowerCase()) return; // mai a se stessi

    const TIPI: Record<string, string> = { rimborso: 'Rimborso', reclamo: 'Reclamo', segnalazione: 'Segnalazione' };
    const STATI: Record<string, string> = {
      aperta: 'riaperta', in_lavorazione: 'presa in carico', approvata: 'approvata',
      respinta: 'respinta', pagata: 'pagata', chiusa: 'chiusa',
    };
    const tipo = TIPI[s.tipo] ?? 'Segnalazione';
    const statoParola = STATI[s.stato] ?? s.stato;
    const eur = (n: number) => n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
    const e = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const oggettoMail = `${tipo}${s.importo ? ` da ${eur(s.importo)}` : ''} ${statoParola}` + (s.oggetto ? ` — ${s.oggetto}` : '');
    const corpo = `<p>Ciao${nome ? ' ' + e(nome) : ''},</p>`
      + `<p>la tua richiesta${s.oggetto ? ` «${e(s.oggetto)}»` : ''} (${e(tipo.toLowerCase())}`
      + `${s.importo ? `, ${eur(s.importo)}` : ''}) è stata <strong>${e(statoParola)}</strong>.</p>`
      + (s.risposta ? `<p>Risposta dell'ufficio: ${e(s.risposta)}</p>` : '')
      + (s.stato === 'approvata' && s.importo ? `<p>L'importo entrerà nel conteggio del tuo prossimo stipendio.</p>` : '')
      + `<p>— Deluxy</p>`;
    await fetch(`${url}/api/v1/invia`, {
      method: 'POST',
      headers: { 'x-api-key': chiave, 'x-utente': utente, 'Content-Type': 'application/json' },
      body: JSON.stringify({ a: destinatario, oggetto: oggettoMail, corpo }),
      signal: AbortSignal.timeout(15_000),
    });
  }
}

@ApiTags('segnalazioni')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.OPERATION, Role.PARTNER, Role.VALET)
@Controller('segnalazioni')
export class SegnalazioniController {
  constructor(private readonly service: SegnalazioniService) {}

  @Get()
  @ApiOperation({ summary: 'Elenco segnalazioni (partner/valet solo le proprie)' })
  lista(
    @CurrentUser() user: JwtUser,
    @Query('stato') stato?: string,
    @Query('tipo') tipo?: string,
    @Query('deliveryId') deliveryId?: string,
  ) {
    return this.service.lista(user, stato, tipo, deliveryId);
  }

  @Post()
  @ApiOperation({ summary: 'Apre una segnalazione (ufficio) o un reclamo (partner/valet)' })
  crea(@CurrentUser() user: JwtUser, @Body() body: any) {
    return this.service.crea(user, body);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Aggiorna stato/risposta di una segnalazione (ufficio)' })
  aggiorna(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() body: any) {
    return this.service.aggiorna(user, id, body);
  }
}

@Module({
  imports: [SettingsModule],
  controllers: [SegnalazioniController],
  providers: [SegnalazioniService],
})
export class SegnalazioniModule {}
