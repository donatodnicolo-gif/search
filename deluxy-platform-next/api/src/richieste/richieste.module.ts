// ============================================================
// RICHIESTE DI CONSEGNA dalle altre app, in forma TESTUALE (28/08/2026)
// ------------------------------------------------------------
// Chiesto dall'utente: «una sezione RICHIESTE per admin, operation e cs dove
// arrivano da altre app richieste di inserimento di servizi di consegna in modo
// testuale».
//
// ⚠️ IL PUNTO È CHE IL TESTO ARRIVA COSÌ COM'È SCRITTO. Chi manda — il Customer
// Service da una chat, Scout da una visita, un fornitore al telefono — non deve
// compilare un modulo di venti campi che non ha sotto mano: scrive quello che
// sa, e qui una persona lo legge e decide.
//
// ⚠️ UNA RICHIESTA NON È UNA CONSEGNA: è una domanda. Nasce «nuova» e diventa
// una consegna solo quando qualcuno la accetta. Farla diventare consegna da
// sola vorrebbe dire far entrare nel giro dei valet un testo che nessuno ha
// letto — e il giro dei valet costa denaro vero.
//
// Chi la vede: ADMIN e OPERATION. Il **Customer Service è un OPERATION** con
// `operationRole = 'customer_service'` (vedi `Operation` nello schema), quindi
// è già dentro senza un ruolo nuovo.
// ============================================================
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentUser, JwtUser, Roles } from '../common/decorators';
import { Role } from '../common/enums';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';

/** Gli stati che una richiesta può avere. Un elenco chiuso, non testo libero. */
export const STATI_RICHIESTA = ['nuova', 'in_lavorazione', 'accettata', 'rifiutata'] as const;

export class CreaRichiestaDto {
  /**
   * Il testo della richiesta, come lo scrive chi la manda.
   *
   * ⚠️ Un minimo c'è: «ok» o «asd» non sono una richiesta, sono una chiamata
   * partita per sbaglio — e finirebbero in una lista che qualcuno deve leggere.
   */
  @IsString()
  @MinLength(10, { message: 'Il testo della richiesta è troppo corto per capirci qualcosa (almeno 10 caratteri).' })
  @MaxLength(4000)
  testo!: string;

  /** Il riferimento di CHI MANDA (numero ordine, id conversazione…). */
  @IsOptional() @IsString() @MaxLength(120) riferimento?: string;

  /** A chi rispondere se serve un chiarimento (email o telefono). */
  @IsOptional() @IsString() @MaxLength(160) contatto?: string;
}

export class DecidiRichiestaDto {
  @IsIn(STATI_RICHIESTA, { message: `stato deve essere uno fra: ${STATI_RICHIESTA.join(', ')}` })
  stato!: string;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
  /** La consegna nata da questa richiesta, quando la si accetta. */
  @IsOptional() @IsString() deliveryId?: string;
}

@Injectable()
export class RichiesteService {
  constructor(private readonly prisma: PrismaService) {}

  private static readonly VISIBILE = {
    id: true, testo: true, origine: true, riferimento: true, contatto: true,
    stato: true, deliveryId: true, note: true, decisaDa: true, decisaIl: true,
    createdAt: true, updatedAt: true,
    delivery: { select: { id: true, code: true, status: true, date: true } },
  } as const;

  /**
   * Registra una richiesta arrivata da un'altra app.
   *
   * ⚠️ È **idempotente sul riferimento**: la stessa app che riprova lo stesso
   * ordine non deve creare due richieste. Chi manda spesso ritenta (un timeout,
   * un cron che ripassa), e due richieste identiche in lista sono due persone
   * che lavorano la stessa cosa.
   */
  async crea(dto: CreaRichiestaDto, origine: string) {
    const riferimento = dto.riferimento?.trim() || null;
    if (riferimento) {
      const gia = await this.prisma.richiestaConsegna.findFirst({
        where: { origine, riferimento },
        select: RichiesteService.VISIBILE,
      });
      // Si torna quella che c'è già, non un errore: per chi chiama è la stessa
      // cosa («la richiesta esiste, eccola»), e un 409 lo farebbe ritentare.
      if (gia) return { ...gia, giaEsistente: true };
    }
    const creata = await this.prisma.richiestaConsegna.create({
      data: {
        testo: dto.testo.trim(),
        origine,
        riferimento,
        contatto: dto.contatto?.trim() || null,
      },
      select: RichiesteService.VISIBILE,
    });
    return { ...creata, giaEsistente: false };
  }

  /**
   * L'elenco per l'ufficio. Le NUOVE per prime, poi le più recenti: chi apre la
   * pagina deve trovare in cima quello che nessuno ha ancora guardato.
   */
  async elenco(stato?: string) {
    const righe = await this.prisma.richiestaConsegna.findMany({
      where: stato && stato !== 'tutte' ? { stato } : {},
      select: RichiesteService.VISIBILE,
      orderBy: [{ createdAt: 'desc' }],
      take: 300,
    });
    const ordine: Record<string, number> = { nuova: 0, in_lavorazione: 1, accettata: 2, rifiutata: 3 };
    righe.sort((a, b) => (ordine[a.stato] ?? 9) - (ordine[b.stato] ?? 9)
      || b.createdAt.getTime() - a.createdAt.getTime());
    // Il contatore delle NUOVE serve al pallino nel menu: chi non apre la
    // pagina deve comunque sapere che c'è qualcosa da leggere.
    const daLeggere = await this.prisma.richiestaConsegna.count({ where: { stato: 'nuova' } });
    return { richieste: righe, daLeggere };
  }

  async una(id: string) {
    const r = await this.prisma.richiestaConsegna.findUnique({
      where: { id }, select: RichiesteService.VISIBILE,
    });
    if (!r) throw new NotFoundException('Richiesta non trovata');
    return r;
  }

  /** L'esito, per l'app che l'ha mandata: cercato per il SUO riferimento. */
  async perRiferimento(origine: string, riferimento: string) {
    const r = await this.prisma.richiestaConsegna.findFirst({
      where: { origine, riferimento },
      select: RichiesteService.VISIBILE,
      orderBy: { createdAt: 'desc' },
    });
    if (!r) throw new NotFoundException('Nessuna richiesta con questo riferimento.');
    return r;
  }

  /**
   * Decide una richiesta.
   *
   * ⚠️ Rifiutare SENZA MOTIVO si rifiuta: chi ha mandato la richiesta legge
   * l'esito, e un «no» muto si trasforma in una seconda richiesta identica.
   *
   * ⚠️ Accettare senza dire QUALE consegna è nata lascia la richiesta senza
   * risposta utile: chi ha chiesto vuole il numero, non un'etichetta verde.
   */
  async decidi(id: string, dto: DecidiRichiestaDto, user: JwtUser) {
    const r = await this.prisma.richiestaConsegna.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Richiesta non trovata');
    if (dto.stato === 'rifiutata' && !dto.note?.trim() && !r.note?.trim()) {
      throw new BadRequestException('Scrivi perché la rifiuti: chi l\'ha mandata legge questa nota.');
    }
    if (dto.deliveryId) {
      const c = await this.prisma.delivery.findUnique({ where: { id: dto.deliveryId }, select: { id: true } });
      if (!c) throw new BadRequestException('La consegna indicata non esiste.');
    }
    const decisa = dto.stato === 'accettata' || dto.stato === 'rifiutata';
    return this.prisma.richiestaConsegna.update({
      where: { id },
      data: {
        stato: dto.stato,
        ...(dto.note !== undefined ? { note: dto.note?.trim() || null } : {}),
        ...(dto.deliveryId !== undefined ? { deliveryId: dto.deliveryId || null } : {}),
        ...(decisa ? { decisaDa: user.email ?? null, decisaIl: new Date() } : {}),
      },
      select: RichiesteService.VISIBILE,
    });
  }
}

@ApiTags('richieste')
@ApiBearerAuth()
// ADMIN e OPERATION: il Customer Service è un OPERATION con
// `operationRole = 'customer_service'`, quindi è già compreso.
@Roles(Role.ADMIN, Role.OPERATION)
@Controller('richieste')
export class RichiesteController {
  constructor(private readonly service: RichiesteService) {}

  @Get()
  @ApiOperation({ summary: 'Le richieste di consegna arrivate dalle altre app' })
  @ApiQuery({ name: 'stato', required: false, description: 'nuova | in_lavorazione | accettata | rifiutata | tutte' })
  elenco(@Query('stato') stato?: string) {
    return this.service.elenco(stato);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Una richiesta' })
  una(@Param('id') id: string) {
    return this.service.una(id);
  }

  @Post()
  @ApiOperation({ summary: "Registra una richiesta a mano (es. arrivata al telefono)" })
  creaAMano(@Body() dto: CreaRichiestaDto, @CurrentUser() user: JwtUser) {
    // L'origine dice CHI l'ha portata dentro: «manuale» da solo, fra un mese,
    // non fa capire con chi parlare.
    return this.service.crea(dto, `manuale · ${user.email ?? 'ufficio'}`);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Prendi in carico, accetta (collegando la consegna) o rifiuta con un motivo' })
  decidi(@Param('id') id: string, @Body() dto: DecidiRichiestaDto, @CurrentUser() user: JwtUser) {
    return this.service.decidi(id, dto, user);
  }
}

@Module({
  imports: [PrismaModule],
  controllers: [RichiesteController],
  providers: [RichiesteService],
  exports: [RichiesteService],
})
export class RichiesteModule {}
