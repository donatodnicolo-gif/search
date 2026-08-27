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
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtUser, Roles } from '../common/decorators';
import { NotificationType, Role } from '../common/enums';
import { NotificationsModule, NotificationsService } from '../notifications/notifications.module';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsModule, SettingsService } from '../settings/settings.module';

/**
 * Richieste di PREVENTIVO dei partner (es. «torta come in foto per 30
 * persone, Cernobbio, 30 agosto»): il partner le apre dal suo accesso con un
 * form dedicato (descrizione, foto, persone, città, data), l'ufficio le vede
 * in lista, cambia stato e risponde. La risposta arriva al partner come
 * notifica e resta scritta sulla richiesta.
 *
 * La foto è un data URL compresso DAL CLIENT (max ~1 MB di testo): niente
 * upload su disco — su serverless i file spariscono al redeploy (problema
 * già noto delle ricevute).
 */
const STATI = ['aperta', 'in_lavorazione', 'risposta'] as const;
const MAX_FOTO_CHARS = 1_100_000; // ~800 KB di immagine: oltre, va compressa

/** Una linea commerciale come la pubblica Scout (master). */
export interface LineaCommerciale {
  id: string;
  nome: string;
  icona: string | null;
  pitch: string | null;
  sottolinee: { id: string; nome: string; icona: string | null; pitch: string | null }[];
}

/**
 * Ripiego quando Scout non è collegato: le 9 linee master, gli stessi nomi
 * canonici del fallback di Anagrafiche (`src/lib/interessi.ts`). Serve a non
 * lasciare il partner davanti a una vetrina vuota — ma la risposta porta
 * `fonte: 'riserva'` e la pagina LO DICHIARA: un catalogo di riserva mostrato
 * come fosse quello vivo farebbe chiedere servizi che magari non offriamo più.
 */
const LINEE_RISERVA: LineaCommerciale[] = [
  'Affiliazioni',
  'Clientelling',
  'Concierge',
  'Consegne',
  'Eventi & Catering',
  'Food Supplier',
  'Gifting',
  'Magazzino',
  'Re-seller',
].map((nome) => ({ id: `riserva-${nome}`, nome, icona: null, pitch: null, sottolinee: [] }));

@Injectable()
export class QuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly settings: SettingsService,
  ) {}

  // Cache in memoria delle linee di Scout (per istanza, TTL breve: le linee
  // cambiano di rado e il master non va martellato a ogni apertura pagina).
  private lineeCache: { linee: LineaCommerciale[]; scadenza: number } | null = null;

  /**
   * La VETRINA dei servizi richiedibili: le linee commerciali lette da Scout,
   * che ne è il master. Se il collegamento non è configurato o non risponde,
   * la risposta LO DICE (`configurato`/`errore`) invece di fingere un
   * catalogo vuoto.
   */
  async linee(): Promise<{
    linee: LineaCommerciale[];
    fonte: 'scout' | 'riserva';
    configurato: boolean;
    errore?: string;
  }> {
    const adesso = Date.now();
    if (this.lineeCache && this.lineeCache.scadenza > adesso) {
      return { linee: this.lineeCache.linee, fonte: 'scout', configurato: true };
    }
    const url = (await this.settings.get('lineeUrl')) ?? process.env.LINEE_URL ?? '';
    const chiave = (await this.settings.get('lineeApiKey')) ?? process.env.LINEE_API_KEY ?? '';
    const riserva = (errore: string) => ({
      linee: LINEE_RISERVA,
      fonte: 'riserva' as const,
      configurato: Boolean(url && chiave),
      errore,
    });
    if (!url || !chiave) {
      return riserva('Collegamento a Deluxy Scout non configurato: elenco di riserva.');
    }
    try {
      // ⭐ 26/08/2026 — `soloVetrina=1`: quali linee compaiono qui lo decide
      // Scout, che ne è il master, con un flag per linea (Linee di interesse →
      // «In vetrina»). Prima si chiedevano tutte le linee ATTIVE, e attivo
      // vuol dire un'altra cosa: «Magazzino» è vivo commercialmente ma è un
      // servizio interno, e finiva fra quelli che un partner può chiedere.
      const sep = url.includes('?') ? '&' : '?';
      const res = await fetch(`${url}${sep}soloAttive=1&soloVetrina=1`, { headers: { 'x-api-key': chiave } });
      if (!res.ok) return riserva(`Scout risponde HTTP ${res.status}: elenco di riserva.`);
      const body = (await res.json()) as { linee?: LineaCommerciale[] };
      const linee = body.linee ?? [];
      if (!linee.length) return riserva('Scout non ha restituito linee: elenco di riserva.');
      this.lineeCache = { linee, scadenza: adesso + 10 * 60 * 1000 };
      return { linee, fonte: 'scout', configurato: true };
    } catch (err) {
      return riserva(`Scout non raggiungibile (${(err as Error).message}): elenco di riserva.`);
    }
  }

  private readonly includePartner = {
    partner: { select: { id: true, insegna: true, phone: true } },
  };

  findAll(user: JwtUser) {
    const where =
      user.role === Role.PARTNER ? { partnerId: user.partnerId ?? '-' } : {};
    return this.prisma.quoteRequest.findMany({
      where,
      include: this.includePartner,
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(
    user: JwtUser,
    body: {
      description?: string;
      people?: number;
      city?: string;
      requestedFor?: string;
      photo?: string;
      partnerId?: string;
    },
  ) {
    // Il partner crea per sé; admin/operation possono indicare il partner
    // (serve anche per provare il giro senza un accesso partner).
    const partnerId =
      user.role === Role.PARTNER ? user.partnerId : body.partnerId;
    if (!partnerId) {
      throw new BadRequestException('Partner non indicato.');
    }
    const description = body.description?.trim();
    if (!description) {
      throw new BadRequestException('La descrizione della richiesta è obbligatoria.');
    }
    if (body.photo && body.photo.length > MAX_FOTO_CHARS) {
      throw new BadRequestException(
        'La foto è troppo grande: riprovare (il form la comprime da solo, questa non è passata dal form).',
      );
    }
    if (body.photo && !body.photo.startsWith('data:image/')) {
      throw new BadRequestException('La foto deve essere un’immagine.');
    }
    const creata = await this.prisma.quoteRequest.create({
      data: {
        partnerId,
        description,
        people: body.people ?? null,
        city: body.city?.trim() || null,
        requestedFor: body.requestedFor ? new Date(body.requestedFor) : null,
        photo: body.photo || null,
      },
      include: this.includePartner,
    });
    // L'ufficio deve accorgersene senza aprire la pagina.
    const destinatari = await this.notifications.adminAndOperationIds(user.sub);
    await this.notifications.notifyUsers(destinatari, {
      type: NotificationType.QUOTE_REQUEST,
      title: 'Nuova richiesta di preventivo',
      body: `${creata.partner.insegna}: ${description.slice(0, 120)}`,
      entityType: 'quoteRequest',
      entityId: creata.id,
    });
    return creata;
  }

  async update(
    user: JwtUser,
    id: string,
    body: { status?: string; reply?: string },
  ) {
    const esistente = await this.prisma.quoteRequest.findUnique({
      where: { id },
      include: this.includePartner,
    });
    if (!esistente) throw new NotFoundException('Richiesta non trovata.');
    if (body.status && !STATI.includes(body.status as (typeof STATI)[number])) {
      throw new BadRequestException(`Stato non valido: ${body.status}`);
    }
    const reply = body.reply?.trim();
    const aggiornata = await this.prisma.quoteRequest.update({
      where: { id },
      data: {
        // Una risposta scritta porta lo stato a «risposta» da sola.
        status: body.status ?? (reply ? 'risposta' : undefined),
        reply: body.reply !== undefined ? reply || null : undefined,
      },
      include: this.includePartner,
    });
    // La risposta (nuova o cambiata) si notifica agli utenti del partner.
    if (reply && reply !== esistente.reply) {
      const utentiPartner = await this.prisma.user.findMany({
        where: { partnerId: esistente.partnerId, status: 'active' },
        select: { id: true },
      });
      await this.notifications.notifyUsers(
        utentiPartner.map((u) => u.id),
        {
          type: NotificationType.QUOTE_REPLY,
          title: 'Risposta al tuo preventivo',
          body: reply.slice(0, 160),
          entityType: 'quoteRequest',
          entityId: id,
        },
      );
    }
    return aggiornata;
  }

  /** Il partner può vedere la singola richiesta solo se è la sua. */
  async findOne(user: JwtUser, id: string) {
    const r = await this.prisma.quoteRequest.findUnique({
      where: { id },
      include: this.includePartner,
    });
    if (!r) throw new NotFoundException('Richiesta non trovata.');
    if (user.role === Role.PARTNER && r.partnerId !== user.partnerId) {
      throw new ForbiddenException();
    }
    return r;
  }
}

@ApiTags('quotes')
@ApiBearerAuth()
@Controller('quotes')
export class QuotesController {
  constructor(private readonly service: QuotesService) {}

  @Get()
  @Roles(Role.ADMIN, Role.OPERATION, Role.PARTNER)
  @ApiOperation({ summary: 'Richieste di preventivo (il partner vede le proprie)' })
  findAll(@CurrentUser() user: JwtUser) {
    return this.service.findAll(user);
  }

  // ⚠️ PRIMA di :id, o «linee» verrebbe letta come un id (stessa trappola
  // già pagata su /delivery-rules/valet).
  @Get('linee')
  @Roles(Role.ADMIN, Role.OPERATION, Role.PARTNER)
  @ApiOperation({ summary: 'Linee commerciali richiedibili (master: Deluxy Scout)' })
  linee() {
    return this.service.linee();
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.OPERATION, Role.PARTNER)
  @ApiOperation({ summary: 'Dettaglio richiesta (il partner solo la sua)' })
  findOne(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.findOne(user, id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.OPERATION, Role.PARTNER)
  @ApiOperation({ summary: 'Nuova richiesta di preventivo (form del partner)' })
  create(
    @CurrentUser() user: JwtUser,
    @Body()
    body: {
      description?: string;
      people?: number;
      city?: string;
      requestedFor?: string;
      photo?: string;
      partnerId?: string;
    },
  ) {
    return this.service.create(user, body);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Stato e risposta dell’ufficio' })
  update(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() body: { status?: string; reply?: string },
  ) {
    return this.service.update(user, id, body);
  }
}

@Module({
  imports: [NotificationsModule, SettingsModule],
  controllers: [QuotesController],
  providers: [QuotesService],
})
export class QuotesModule {}
