// ============================================================
// LE CHIAVI DELLE ALTRE APP, gestite dall'app (27/08/2026)
// ------------------------------------------------------------
// Chiesto dall'utente: «poter generare chiavi per altre app in modo che ti
// possano chiamare in lettura e/o scrittura». Prima si creavano solo da riga
// di comando (`scripts/crea-chiave-app.mjs`), quindi in pratica le creava chi
// aveva il repo aperto.
//
// ⚠️ LA REGOLA DI QUESTO MODULO: **la chiave in chiaro esiste per un istante**.
// Si genera, si restituisce UNA VOLTA nella risposta della creazione, e in
// archivio resta solo il suo SHA-256. Non c'è nessuna rotta che la rilegga —
// non perché ce la siamo dimenticata, ma perché una chiave rileggibile è una
// chiave che vive nei log, nelle cache del browser e nelle schermate.
// Chi la perde ne rigenera un'altra: è un'operazione da dieci secondi.
//
// ⚠️ Solo ADMIN. Una chiave app scavalca i ruoli: chi la crea decide che cosa
// un'altra applicazione può leggere e scrivere qui dentro.
// ============================================================
import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { CurrentUser, JwtUser, Roles } from '../common/decorators';
import { Role } from '../common/enums';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Il prefisso serve a RICONOSCERLA a occhio in un file di configurazione, e a
 * far scattare i cercatori di segreti se finisce dove non deve.
 */
const PREFISSO = 'dxp_';

/** 32 byte casuali: 256 bit. Non si indovina e non si enumera. */
const BYTE_CASUALI = 32;

export class CreaChiaveDto {
  /**
   * Chi la usa. È l'etichetta che si legge nell'elenco e nei log: un nome
   * generico («prova», «temp») fra sei mesi non dice a nessuno se si può
   * spegnere.
   */
  @IsString()
  @MinLength(3, { message: 'Il nome deve avere almeno 3 caratteri.' })
  @MaxLength(60)
  @Matches(/^[a-z0-9][a-z0-9._-]*$/, {
    message: 'Il nome ammette lettere minuscole, numeri, punto, trattino e underscore (es. deluxy-orders).',
  })
  nome!: string;

  /** Con `false` la chiave legge e basta. È il valore prudente, ed è il default. */
  @IsOptional() @IsBoolean() scrittura?: boolean;

  /** A che serve. Facoltativo, ma è quello che si rilegge fra un anno. */
  @IsOptional() @IsString() @MaxLength(300) note?: string;

  /** Scadenza AAAA-MM-GG. Vuota = non scade. */
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La scadenza va scritta AAAA-MM-GG.' })
  scadeIl?: string;
}

export class AggiornaChiaveDto {
  @IsOptional() @IsBoolean() attiva?: boolean;
  @IsOptional() @IsBoolean() scrittura?: boolean;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
  /** Stringa vuota = togli la scadenza. */
  @IsOptional() @IsString() scadeIl?: string;
}

@Injectable()
export class ChiaviAppService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * L'elenco. ⚠️ Senza l'`hash`: non è la chiave, ma è il materiale con cui si
   * verifica una chiave rubata, e in una schermata non serve a niente.
   */
  private static readonly VISIBILE = {
    id: true, nome: true, scrittura: true, attiva: true,
    note: true, scadeIl: true, creataDa: true, ultimoUso: true, creataIl: true,
  } as const;

  async elenco() {
    const righe = await this.prisma.appApiKey.findMany({
      select: ChiaviAppService.VISIBILE,
      orderBy: [{ attiva: 'desc' }, { creataIl: 'desc' }],
    });
    const ora = Date.now();
    return righe.map((r) => ({
      ...r,
      // ⚠️ Lo stato si CALCOLA e si dichiara: una chiave con `attiva: true` e
      // la scadenza passata è spenta di fatto, e mostrarla come attiva
      // farebbe cercare il guasto dalla parte sbagliata.
      scaduta: Boolean(r.scadeIl && r.scadeIl.getTime() <= ora),
      /**
       * Da quanto non la usa nessuno. Serve a decidere che cosa spegnere: una
       * chiave viva che nessuno chiama da mesi è una porta aperta senza motivo.
       */
      giorniDaUltimoUso: r.ultimoUso
        ? Math.floor((ora - r.ultimoUso.getTime()) / 86_400_000)
        : null,
    }));
  }

  /** Genera la chiave e la restituisce UNA volta sola. */
  async crea(dto: CreaChiaveDto, user: JwtUser) {
    const nome = dto.nome.trim().toLowerCase();
    const gia = await this.prisma.appApiKey.findUnique({ where: { nome } });
    if (gia) {
      throw new ConflictException(
        `Esiste già una chiave chiamata «${nome}». Rigenerala, oppure dàlle un altro nome.`,
      );
    }
    const scadenza = ChiaviAppService.leggiScadenza(dto.scadeIl);
    const chiara = `${PREFISSO}${randomBytes(BYTE_CASUALI).toString('base64url')}`;
    const creata = await this.prisma.appApiKey.create({
      data: {
        nome,
        hash: createHash('sha256').update(chiara).digest('hex'),
        scrittura: dto.scrittura ?? false,
        note: dto.note?.trim() || null,
        scadeIl: scadenza,
        creataDa: user.email ?? null,
      },
      select: ChiaviAppService.VISIBILE,
    });
    // ⚠️ È l'UNICA volta che la chiave in chiaro esce da qui. Chi la riceve la
    // incolla subito nell'app che deve usarla: non c'è modo di rileggerla.
    return { ...creata, chiave: chiara, avviso: 'Copiala adesso: non sarà più mostrata.' };
  }

  /**
   * Rigenera: stessa riga, stesso nome, chiave nuova.
   *
   * ⚠️ La vecchia smette di funzionare **all'istante**: l'app che la usa va
   * aggiornata subito, o si ferma. Meglio dirlo qui che scoprirlo dal
   * fornitore che non riceve più gli ordini.
   */
  async rigenera(id: string) {
    const c = await this.prisma.appApiKey.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Chiave non trovata');
    const chiara = `${PREFISSO}${randomBytes(BYTE_CASUALI).toString('base64url')}`;
    const aggiornata = await this.prisma.appApiKey.update({
      where: { id },
      data: { hash: createHash('sha256').update(chiara).digest('hex'), attiva: true },
      select: ChiaviAppService.VISIBILE,
    });
    return {
      ...aggiornata,
      chiave: chiara,
      avviso: `Copiala adesso. La chiave precedente di «${c.nome}» NON funziona più da questo momento.`,
    };
  }

  async aggiorna(id: string, dto: AggiornaChiaveDto) {
    const c = await this.prisma.appApiKey.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Chiave non trovata');
    return this.prisma.appApiKey.update({
      where: { id },
      data: {
        ...(dto.attiva !== undefined ? { attiva: dto.attiva } : {}),
        ...(dto.scrittura !== undefined ? { scrittura: dto.scrittura } : {}),
        ...(dto.note !== undefined ? { note: dto.note?.trim() || null } : {}),
        // ⚠️ Stringa vuota vuol dire «togli la scadenza», `undefined` vuol dire
        // «non l'ho toccata»: confonderli toglierebbe una scadenza per sbaglio.
        ...(dto.scadeIl !== undefined
          ? { scadeIl: dto.scadeIl ? ChiaviAppService.leggiScadenza(dto.scadeIl) : null }
          : {}),
      },
      select: ChiaviAppService.VISIBILE,
    });
  }

  async elimina(id: string) {
    const c = await this.prisma.appApiKey.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Chiave non trovata');
    await this.prisma.appApiKey.delete({ where: { id } });
    return { ok: true, nome: c.nome };
  }

  /**
   * La scadenza a fine giornata, ora di Roma.
   *
   * ⚠️ `new Date('2026-12-31')` è mezzanotte UTC, cioè le 01:00 in Italia: una
   * chiave «valida fino al 31/12» sarebbe morta il 31 alle 01:00. Si prende la
   * fine del giorno dichiarato.
   */
  private static leggiScadenza(iso?: string): Date | null {
    if (!iso) return null;
    const d = new Date(`${iso}T23:59:59.999Z`);
    if (Number.isNaN(d.getTime())) throw new BadRequestException('Scadenza non valida.');
    if (d.getTime() <= Date.now()) {
      throw new BadRequestException('La scadenza è già passata: metti una data futura, o lasciala vuota.');
    }
    return d;
  }
}

@ApiTags('chiavi-app')
@ApiBearerAuth()
// ⚠️ Solo ADMIN: una chiave app scavalca i ruoli dell'applicazione.
@Roles(Role.ADMIN)
@Controller('chiavi-app')
export class ChiaviAppController {
  constructor(private readonly service: ChiaviAppService) {}

  @Get()
  @ApiOperation({ summary: "Le chiavi delle altre app (mai il valore, solo com'è fatta)" })
  elenco() {
    return this.service.elenco();
  }

  @Post()
  @ApiOperation({ summary: 'Genera una chiave nuova: il valore si vede UNA volta sola' })
  crea(@Body() dto: CreaChiaveDto, @CurrentUser() user: JwtUser) {
    return this.service.crea(dto, user);
  }

  @Post(':id/rigenera')
  @ApiOperation({ summary: 'Chiave nuova per la stessa app: la vecchia smette subito di funzionare' })
  rigenera(@Param('id') id: string) {
    return this.service.rigenera(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Accendi/spegni, cambia i permessi, le note o la scadenza' })
  aggiorna(@Param('id') id: string, @Body() dto: AggiornaChiaveDto) {
    return this.service.aggiorna(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Elimina la chiave (non si torna indietro)' })
  elimina(@Param('id') id: string) {
    return this.service.elimina(id);
  }
}

@Module({
  imports: [PrismaModule],
  controllers: [ChiaviAppController],
  providers: [ChiaviAppService],
})
export class ChiaviAppModule {}
