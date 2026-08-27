// ============================================================
// SERVIZI RICORRENTI (27/08, chiesto dall'utente)
// ------------------------------------------------------------
// Il presidio che si ripete: «ogni lunedi' 7-8 per un partner», «sabato e
// domenica 13-14». Si imposta come gli orari di Google (giorni della
// settimana + fascia), e un CRON genera la consegna del giorno alla corsa
// notturna. Alle consegne generate SI APPLICANO LE REGOLE CARNET del
// partner (stesse prove dello script applica-regole: periodo, orario,
// modello di servizio, giorno — se piu' regole combaciano, nessuna).
//
// ⚠️ La coppia (servizio ricorrente, data) non si rigenera: se la consegna
// del giorno esiste gia' — anche cancellata a mano — non se ne crea un'altra.
// ============================================================
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { Roles } from '../common/decorators';
import { Role } from '../common/enums';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';

export class CreaRicorrenteDto {
  @IsString() nome!: string;
  @IsString() partnerId!: string;
  @IsString() serviceTypeId!: string;
  @IsOptional() @IsString() valetId?: string;
  /** Maschera lun..dom, es. "1000000" = ogni lunedi'. Serve alla SETTIMANALE. */
  @Matches(/^[01]{7}$/, { message: 'giorni deve essere una maschera di 7 bit lun..dom, es. 1000000' })
  giorni!: string;
  /** SETTIMANALE (default, com'era) | GIORNALIERO | MENSILE. */
  @IsOptional() @IsIn(['SETTIMANALE', 'GIORNALIERO', 'MENSILE']) frequenza?: string;
  /** Ogni quante settimane / giorni / mesi. 1 = tutte. */
  @IsOptional() @IsInt() @Min(1) @Max(52) ogni?: number;
  /** Solo per MENSILE: i giorni del mese, es. "1,15". */
  @IsOptional() @Matches(/^\s*\d{1,2}(\s*,\s*\d{1,2})*\s*$/, { message: 'giorniMese: numeri separati da virgola, es. 1,15' })
  giorniMese?: string;
  @Matches(/^\d{2}:\d{2}$/) timeFrom!: string;
  @Matches(/^\d{2}:\d{2}$/) timeTo!: string;
  @IsOptional() @IsString() pickupAddress?: string;
  @IsOptional() @IsString() recipientFirstName?: string;
  @IsOptional() @IsString() recipientLastName?: string;
  @IsString() recipientAddress!: string;
  @IsOptional() @IsNumber() price?: number;
  @IsOptional() @IsNumber() valetSalary?: number;
  @IsOptional() @IsNumber() hours?: number;
  @IsString() dataInizio!: string; // YYYY-MM-DD
  @IsOptional() @IsString() dataFine?: string;
  @IsOptional() @IsString() note?: string;
}

export class AggiornaRicorrenteDto extends CreaRicorrenteDto {
  @IsOptional() @IsBoolean() attivo?: boolean;
}

/** Il giorno della settimana lun=0..dom=6 di una data YYYY-MM-DD. */
function giornoSettimana(iso: string): number {
  return (new Date(`${iso}T00:00:00.000Z`).getUTCDay() + 6) % 7;
}

/** Il lunedi' della settimana di una data (per contare le settimane intere). */
function lunediDi(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x;
}

/** I giorni del mese dichiarati, da "1,15" a [1, 15]. Scarta il non plausibile. */
export function giorniDelMese(testo: string | null | undefined): number[] {
  return (testo ?? '')
    .split(',')
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 31);
}

/**
 * QUESTO GIORNO TOCCA A QUESTO SERVIZIO?
 *
 * Tre modi di ripetersi, e il conto parte sempre da `dataInizio`:
 *  - SETTIMANALE: i giorni della maschera, ogni `ogni` settimane. Le settimane
 *    si contano fra i LUNEDI', non a intervalli di 7 giorni dalla data
 *    d'inizio: «ogni due settimane il lunedi' e il venerdi'» deve cadere nella
 *    stessa settimana per tutt'e due, non a sette giorni dal proprio inizio.
 *  - GIORNALIERO: ogni `ogni` giorni dal via.
 *  - MENSILE: i giorni del mese dichiarati, ogni `ogni` mesi.
 *    ⚠️ Il 31 nei mesi che non ce l'hanno NON si arrotonda: quel giorno non
 *    esiste e la consegna non nasce. Spostarla al 30 sarebbe inventare una
 *    data che nessuno ha chiesto.
 */
export function toccaOggi(
  r: { frequenza?: string | null; ogni?: number | null; giorni: string; giorniMese?: string | null; dataInizio: Date },
  iso: string,
): boolean {
  const giorno = new Date(`${iso}T00:00:00.000Z`);
  const inizio = new Date(Date.UTC(
    r.dataInizio.getUTCFullYear(), r.dataInizio.getUTCMonth(), r.dataInizio.getUTCDate(),
  ));
  if (giorno < inizio) return false;
  const ogni = Math.max(1, r.ogni ?? 1);

  if (r.frequenza === 'GIORNALIERO') {
    const passati = Math.round((giorno.getTime() - inizio.getTime()) / 86_400_000);
    return passati % ogni === 0;
  }

  if (r.frequenza === 'MENSILE') {
    if (!giorniDelMese(r.giorniMese).includes(giorno.getUTCDate())) return false;
    const mesi = (giorno.getUTCFullYear() - inizio.getUTCFullYear()) * 12
      + (giorno.getUTCMonth() - inizio.getUTCMonth());
    return mesi >= 0 && mesi % ogni === 0;
  }

  // SETTIMANALE (anche quando `frequenza` e' vuota: e' com'era prima).
  if (r.giorni[giornoSettimana(iso)] !== '1') return false;
  if (ogni === 1) return true;
  const settimane = Math.round(
    (lunediDi(giorno).getTime() - lunediDi(inizio).getTime()) / (7 * 86_400_000),
  );
  return settimane >= 0 && settimane % ogni === 0;
}

@Injectable()
export class RecurringService_ {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.recurringService.findMany({
      include: {
        partner: { select: { id: true, insegna: true } },
        serviceType: { select: { id: true, name: true, pricingModel: true } },
        valet: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { deliveries: true } },
      },
      orderBy: [{ attivo: 'desc' }, { createdAt: 'desc' }],
    });
  }

  /**
   * Quello che serve DAVVERO, secondo come si ripete. Un servizio settimanale
   * senza nessun giorno acceso, o uno mensile senza giorni del mese, non
   * genererebbe mai niente e resterebbe li' a sembrare attivo.
   */
  private controllaRicorrenza(dto: { frequenza?: string; giorni: string; giorniMese?: string }) {
    const f = dto.frequenza ?? 'SETTIMANALE';
    if (f === 'SETTIMANALE' && !/[1]/.test(dto.giorni)) {
      throw new BadRequestException('Scegli almeno un giorno della settimana.');
    }
    if (f === 'MENSILE' && giorniDelMese(dto.giorniMese).length === 0) {
      throw new BadRequestException('Scegli almeno un giorno del mese (es. 1, 15).');
    }
  }

  async create(dto: CreaRicorrenteDto) {
    this.controllaRicorrenza(dto);
    return this.prisma.recurringService.create({
      data: {
        nome: dto.nome.trim(),
        partnerId: dto.partnerId,
        serviceTypeId: dto.serviceTypeId,
        valetId: dto.valetId || null,
        giorni: dto.giorni,
        frequenza: dto.frequenza ?? 'SETTIMANALE',
        ogni: dto.ogni ?? 1,
        giorniMese: giorniDelMese(dto.giorniMese).join(',') || null,
        timeFrom: dto.timeFrom,
        timeTo: dto.timeTo,
        pickupAddress: dto.pickupAddress?.trim() || null,
        recipientFirstName: dto.recipientFirstName?.trim() || null,
        recipientLastName: dto.recipientLastName?.trim() || null,
        recipientAddress: dto.recipientAddress.trim(),
        price: dto.price ?? null,
        valetSalary: dto.valetSalary ?? null,
        hours: dto.hours ?? null,
        dataInizio: new Date(`${dto.dataInizio}T00:00:00.000Z`),
        dataFine: dto.dataFine ? new Date(`${dto.dataFine}T00:00:00.000Z`) : null,
        note: dto.note?.trim() || null,
      },
    });
  }

  async update(id: string, dto: Partial<AggiornaRicorrenteDto>) {
    const c = await this.prisma.recurringService.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Servizio ricorrente non trovato');
    // ⚠️ Si controlla la ricorrenza RISULTANTE, non solo quella mandata: un
    // PATCH che cambia solo la frequenza lascerebbe i giorni vecchi, e un
    // mensile senza giorni del mese non genererebbe mai niente pur sembrando
    // attivo. E' la trappola del form parziale, dal lato della validazione.
    this.controllaRicorrenza({
      frequenza: dto.frequenza ?? c.frequenza,
      giorni: dto.giorni ?? c.giorni,
      giorniMese: dto.giorniMese ?? c.giorniMese ?? undefined,
    });
    return this.prisma.recurringService.update({
      where: { id },
      data: {
        ...(dto.nome !== undefined ? { nome: dto.nome.trim() } : {}),
        ...(dto.partnerId !== undefined ? { partnerId: dto.partnerId } : {}),
        ...(dto.serviceTypeId !== undefined ? { serviceTypeId: dto.serviceTypeId } : {}),
        ...(dto.valetId !== undefined ? { valetId: dto.valetId || null } : {}),
        ...(dto.giorni !== undefined ? { giorni: dto.giorni } : {}),
        ...(dto.frequenza !== undefined ? { frequenza: dto.frequenza } : {}),
        ...(dto.ogni !== undefined ? { ogni: dto.ogni } : {}),
        ...(dto.giorniMese !== undefined ? { giorniMese: giorniDelMese(dto.giorniMese).join(',') || null } : {}),
        ...(dto.timeFrom !== undefined ? { timeFrom: dto.timeFrom } : {}),
        ...(dto.timeTo !== undefined ? { timeTo: dto.timeTo } : {}),
        ...(dto.pickupAddress !== undefined ? { pickupAddress: dto.pickupAddress?.trim() || null } : {}),
        ...(dto.recipientFirstName !== undefined ? { recipientFirstName: dto.recipientFirstName?.trim() || null } : {}),
        ...(dto.recipientLastName !== undefined ? { recipientLastName: dto.recipientLastName?.trim() || null } : {}),
        ...(dto.recipientAddress !== undefined ? { recipientAddress: dto.recipientAddress.trim() } : {}),
        ...(dto.price !== undefined ? { price: dto.price ?? null } : {}),
        ...(dto.valetSalary !== undefined ? { valetSalary: dto.valetSalary ?? null } : {}),
        ...(dto.hours !== undefined ? { hours: dto.hours ?? null } : {}),
        ...(dto.dataInizio !== undefined ? { dataInizio: new Date(`${dto.dataInizio}T00:00:00.000Z`) } : {}),
        ...(dto.dataFine !== undefined ? { dataFine: dto.dataFine ? new Date(`${dto.dataFine}T00:00:00.000Z`) : null } : {}),
        ...(dto.note !== undefined ? { note: dto.note?.trim() || null } : {}),
        ...(dto.attivo !== undefined ? { attivo: dto.attivo } : {}),
      },
    });
  }

  async remove(id: string) {
    const c = await this.prisma.recurringService.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Servizio ricorrente non trovato');
    // Le consegne gia' generate restano (recurringServiceId va a NULL da FK).
    await this.prisma.recurringService.delete({ where: { id } });
    return { ok: true };
  }

  /**
   * Genera le consegne di UNA data (default oggi, ora di Roma) per tutti i
   * servizi ricorrenti attivi che cadono in quel giorno. Idempotente: la
   * coppia (servizio, data) non si rigenera.
   */
  async genera(dataIso?: string) {
    const giorno = dataIso
      ?? new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(new Date());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(giorno)) throw new BadRequestException('Data non valida (YYYY-MM-DD).');
    const dow = giornoSettimana(giorno);
    const dataGiorno = new Date(`${giorno}T00:00:00.000Z`);

    const ricorrenti = await this.prisma.recurringService.findMany({
      where: { attivo: true, dataInizio: { lte: dataGiorno }, OR: [{ dataFine: null }, { dataFine: { gte: dataGiorno } }] },
      include: { serviceType: { select: { pricingModel: true } } },
    });
    // Chi tocca oggi: la regola sta in `toccaOggi`, una sola volta, perche' la
    // decidono in tre (settimanale, giornaliera, mensile) e riscriverla qui
    // dentro vorrebbe dire due implementazioni della stessa cosa.
    const oggiTocca = ricorrenti.filter((r) => toccaOggi(r, giorno));

    // Le regole carnet attive, per applicarle alla nascita (stesse prove
    // dello script applica-regole: qui il giorno e l'orario sono NOSTRI).
    const regole = await this.prisma.deliveryRule.findMany({
      where: { active: true },
      include: { partners: { select: { partnerId: true } } },
    });
    const minuti = (t: string | null) => {
      const m = /^(\d{1,2}):(\d{2})/.exec(t ?? '');
      return m ? Number(m[1]) * 60 + Number(m[2]) : null;
    };
    const MODELLO: Record<string, string> = { fixedprice: 'PREZZO_FISSO', hourlyrate: 'A_ORA' };
    const regolaPer = (r: (typeof ricorrenti)[number]): string | null => {
      const candidate = regole.filter((g) => {
        if (!g.partners.some((p) => p.partnerId === r.partnerId)) return false;
        if (g.periodStart && dataGiorno < g.periodStart) return false;
        if (g.periodEnd && dataGiorno > g.periodEnd) return false;
        const modello = MODELLO[(g.legacyPricingModel ?? '').trim()] ?? null;
        if (modello && r.serviceType?.pricingModel !== modello) return false;
        const da = minuti(g.timeFrom), a = minuti(g.timeTo), ora = minuti(r.timeFrom);
        if (da != null && a != null && !(da === 0 && a >= 1439)) {
          if (ora == null || ora < da || ora > a) return false;
        }
        return true;
      });
      return candidate.length === 1 ? candidate[0].id : null;
    };

    let create = 0, giaEsistenti = 0;
    const esiti: { nome: string; code?: number; esito: string }[] = [];
    for (const r of oggiTocca) {
      const gia = await this.prisma.delivery.findFirst({
        where: { recurringServiceId: r.id, date: dataGiorno },
        select: { id: true },
      });
      if (gia) { giaEsistenti++; esiti.push({ nome: r.nome, esito: 'gia generata' }); continue; }
      const ultimo = await this.prisma.delivery.aggregate({ _max: { code: true } });
      const consegna = await this.prisma.delivery.create({
        data: {
          code: (ultimo._max.code ?? 0) + 1,
          date: dataGiorno,
          partnerId: r.partnerId,
          serviceTypeId: r.serviceTypeId,
          valetId: r.valetId,
          status: r.valetId ? 'assigned' : 'created',
          deliveryTimeFrom: r.timeFrom,
          deliveryTimeTo: r.timeTo,
          pickupAddress: r.pickupAddress,
          recipientFirstName: r.recipientFirstName ?? r.nome,
          recipientLastName: r.recipientLastName ?? '',
          recipientAddress: r.recipientAddress,
          price: r.price ?? 0,
          valetSalary: r.valetSalary ?? 0,
          hours: r.hours,
          payable: true,
          billable: true,
          recurringServiceId: r.id,
          deliveryRuleId: regolaPer(r),
        },
        select: { id: true, code: true },
      });
      await this.prisma.deliveryLog.create({
        data: {
          deliveryId: consegna.id,
          type: 'created',
          message: `Generata dal servizio ricorrente «${r.nome}» per il ${giorno} (${r.timeFrom}–${r.timeTo}).`,
        },
      });
      await this.prisma.recurringService.update({ where: { id: r.id }, data: { ultimaGenerazione: new Date() } });
      create++;
      esiti.push({ nome: r.nome, code: consegna.code, esito: 'creata' });
    }
    return { ok: true, giorno, ricorrentiDelGiorno: oggiTocca.length, create, giaEsistenti, esiti };
  }
}

@ApiTags('recurring-services')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.OPERATION, Role.PROJECT_MANAGER)
@Controller('recurring-services')
export class RecurringController {
  constructor(private readonly service: RecurringService_) {}

  @Get()
  @ApiOperation({ summary: 'I servizi ricorrenti (presìdi che si ripetono)' })
  list() {
    return this.service.list();
  }

  @Post()
  @ApiOperation({ summary: 'Nuovo servizio ricorrente (es. ogni lunedi 7-8 per un partner)' })
  create(@Body() dto: CreaRicorrenteDto) {
    return this.service.create(dto);
  }

  @Post('genera')
  @ApiOperation({ summary: 'Genera le consegne del giorno (default oggi) dai ricorrenti attivi' })
  genera(@Query('data') data?: string) {
    return this.service.genera(data);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Aggiorna (anche solo attivo on/off)' })
  update(@Param('id') id: string, @Body() dto: Partial<AggiornaRicorrenteDto>) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Elimina (le consegne gia generate restano)' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}

@Module({
  imports: [PrismaModule],
  controllers: [RecurringController],
  providers: [RecurringService_],
  exports: [RecurringService_],
})
export class RecurringModule {}
