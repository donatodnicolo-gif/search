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
  ForbiddenException,
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
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { CurrentUser, JwtUser, Roles } from '../common/decorators';
import { Role } from '../common/enums';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { DeliveriesModule } from '../deliveries/deliveries.module';
import { DeliveriesService } from '../deliveries/deliveries.service';

/**
 * ECCEZIONE PER GIORNO: «sabato e domenica 8-9», dentro un servizio che per il
 * resto va 7-8. Si dichiara solo cio' che CAMBIA.
 */
export class VarianteDto {
  @Matches(/^[01]{7}$/, { message: 'giorni deve essere una maschera di 7 bit lun..dom' })
  giorni!: string;
  @Matches(/^\d{2}:\d{2}$/) timeFrom!: string;
  @Matches(/^\d{2}:\d{2}$/) timeTo!: string;
  @IsOptional() @IsString() valetId?: string;
}

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
  /**
   * Le eccezioni per giorno. ⚠️ `undefined` = non toccare quelle che ci sono
   * (e' la trappola del form parziale); `[]` = toglierle tutte, detto apposta.
   */
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => VarianteDto)
  varianti?: VarianteDto[];
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

/**
 * QUANTI GIORNI IN AVANTI si generano, quando il servizio NON dichiara una
 * data di fine. Due settimane: la corsa notturna fa scorrere la finestra.
 *
 * ⚠️ Se il servizio ha una DATA DI FINE, l'orizzonte è quella: chi scrive «fino
 * al 31/12» ha già detto fin dove vuole vedere le consegne, e fermarsi a due
 * settimane vorrebbe dire ignorare quello che ha dichiarato.
 */
const ORIZZONTE_GIORNI = 14;

/**
 * Il tetto assoluto, per non far nascere anni di consegne in una richiesta
 * sola: una data di fine nel 2099 non deve poter generare 27.000 righe.
 * Quello che resta fuori si DICE, non si taglia in silenzio.
 */
const ORIZZONTE_MASSIMO_GIORNI = 400;

/**
 * Quante consegne al massimo si creano in una chiamata. Serve a non arrivare
 * al tetto dei 300 s della funzione a metà lavoro — e «a metà» vuol dire con
 * una parte già scritta e nessuno che sa quale. Chi si ferma qui lo dichiara e
 * la corsa successiva riprende da dove era.
 */
const MASSIMO_PER_CORSA = 600;

/**
 * QUANTO SI GENERA SUBITO, quando si crea o si modifica un ricorrente.
 *
 * ⚠️ **Misurato il 28/08/2026**: una consegna generata costa **93 ms** (365 in
 * 33,8 s). Un ricorrente giornaliero fino a fine anno sono ~126 consegne = 12 s
 * di attesa sul tasto Salva; uno da 1.000 sarebbero **93 secondi**. Dentro i
 * 300 s della funzione ci starebbe — ma un salvataggio che gira un minuto e
 * mezzo non è accettabile, e la corsa notturna fa TUTTI i ricorrenti in una
 * invocazione sola: tre servizi lunghi e il tetto lo sfondi davvero.
 *
 * Quindi alla creazione si generano solo le prime due settimane (~1,3 s: il
 * tasto risponde subito e il presidio si vede sul calendario), e il resto lo
 * riempie la corsa periodica, a lotti.
 */
const SUBITO_GIORNI = 14;

/**
 * Il lotto della corsa periodica di RIEMPIMENTO.
 *
 * ⚠️ Va tenuto piccolo di proposito: gira ogni 15 minuti insieme allo
 * smistamento, e deve lasciare tempo a quello. A 93 ms l'una, 150 consegne
 * sono ~14 s — e 150 ogni quarto d'ora fanno 14.400 al giorno, molto più di
 * quanto qualunque ricorrente possa chiedere.
 */
const LOTTO_RIEMPIMENTO = 150;

/** I nomi dei giorni, per messaggi che si leggono senza decodificare una maschera. */
const NOMI_GIORNI = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];

type Variante = { giorni: string; timeFrom: string; timeTo: string; valetId?: string | null };

/**
 * LA FASCIA DI QUEL GIORNO: l'eccezione se c'è, altrimenti quella normale.
 *
 * ⚠️ Una sola funzione, richiamata da tutti: la generazione, la scelta della
 * regola carnet e il riallineamento delle consegne future. Se la generazione
 * usasse l'eccezione e la regola carnet la fascia normale, si sceglierebbe la
 * regola sull'orario sbagliato — e nessuno se ne accorgerebbe guardando la
 * consegna, che mostra l'orario giusto.
 */
export function fasciaDelGiorno(
  r: { timeFrom: string; timeTo: string; valetId?: string | null; varianti?: Variante[] },
  iso: string,
): { timeFrom: string; timeTo: string; valetId: string | null; daEccezione: boolean } {
  const dow = giornoSettimana(iso);
  const v = (r.varianti ?? []).find((x) => x.giorni[dow] === '1');
  return {
    timeFrom: v?.timeFrom ?? r.timeFrom,
    timeTo: v?.timeTo ?? r.timeTo,
    // ⚠️ `??` e non `||`: un'eccezione senza valet NON azzera il valet del
    // servizio, lo lascia com'è. L'eccezione sovrascrive solo ciò che dichiara.
    valetId: v?.valetId ?? r.valetId ?? null,
    daEccezione: Boolean(v),
  };
}

@Injectable()
export class RecurringService_ {
  constructor(
    private readonly prisma: PrismaService,
    // ⚠️ Serve per la GEOCODIFICA: la generazione scriveva in banca dati
    // saltando il passaggio del form, e le consegne nascevano senza provincia
    // né coordinate — 91 su 91, misurate. Una consegna senza provincia sparisce
    // dalla mappa, dai filtri per zona e dall'ambito dei team leader.
    private readonly deliveries: DeliveriesService,
  ) {}

  /**
   * Il partner vede SOLO i propri: la lista e' la stessa pagina per tutti, ma
   * lo scope no. Il `'-'` di ripiego non combacia con nessun id, quindi un
   * partner senza `partnerId` sul token vede zero righe invece di vederle
   * tutte — un ripiego che sbaglia in sicurezza.
   */
  private scope(user?: JwtUser) {
    return user?.role === Role.PARTNER ? { partnerId: user.partnerId ?? '-' } : {};
  }

  async list(user?: JwtUser) {
    const righe = await this.prisma.recurringService.findMany({
      where: this.scope(user),
      include: {
        partner: { select: { id: true, insegna: true } },
        serviceType: { select: { id: true, name: true, pricingModel: true } },
        valet: { select: { id: true, firstName: true, lastName: true } },
        varianti: {
          include: { valet: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { createdAt: 'asc' },
        },
        _count: { select: { deliveries: true } },
      },
      orderBy: [{ attivo: 'desc' }, { createdAt: 'desc' }],
    });

    // ⭐ 28/08 (chiesto dall'utente): «mostra una rotellina finché non sono
    // create tutte le consegne». Da quando la generazione è a LOTTI, un
    // ricorrente lungo resta a metà per qualche giro di cron — e senza dirlo
    // sembra semplicemente che manchino delle consegne.
    const avanzamenti = await this.avanzamento(righe);
    const conStato = righe.map((r) => ({ ...r, avanzamento: avanzamenti.get(r.id)! }));

    // ⚠️ 27/08/2026 — Qui si usa `include`, quindi escono TUTTI gli scalari,
    // `valetSalary` compreso: la paga che noi diamo al valet, su una pagina
    // che il partner apre. È lo stesso costo nostro che si toglie dalle
    // consegne (`soloIMieiSoldi`) — solo da un'altra porta. Una difesa messa
    // su una pagina sola non è una difesa.
    if (user?.role !== Role.PARTNER) return conStato;
    return conStato.map((r) => {
      const { valetSalary, ...resto } = r;
      return {
        ...resto,
        valet: null,
        varianti: (r.varianti ?? []).map((v) => ({ ...v, valetId: null, valet: null })),
      };
    });
  }

  /**
   * A CHE PUNTO È la generazione di ogni ricorrente.
   *
   * ⚠️ Si contano i giorni **da oggi in avanti** fino all'orizzonte, non
   * dall'inizio del periodo: le consegne del passato non si generano più, e
   * contarle direbbe «mancano 200» su un servizio che sta benissimo.
   *
   * ⚠️ «Fatta» vuol dire che la riga ESISTE, anche se poi è stata cancellata:
   * la generazione è idempotente sulla coppia (servizio, data) e non la
   * rifarebbe comunque. Contare solo le vive direbbe «in corso» per sempre su
   * un servizio a cui qualcuno ha cancellato una consegna a mano.
   *
   * ⚠️ Un servizio SOSPESO non è «in corso»: è fermo. Mostrare una rotellina
   * su qualcosa che non sta lavorando è peggio che non mostrarla.
   */
  private async avanzamento(righe: { id: string; attivo: boolean; frequenza: string; ogni: number; giorni: string; giorniMese: string | null; dataInizio: Date; dataFine: Date | null }[]) {
    const oggi = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(new Date());
    const daOggi = new Date(`${oggi}T00:00:00.000Z`);
    const tetto = new Date(daOggi);
    tetto.setUTCDate(tetto.getUTCDate() + ORIZZONTE_MASSIMO_GIORNI - 1);

    // Un conteggio solo per tutti: una query per riga sarebbe una query per
    // riga anche quando i ricorrenti diventano cinquanta.
    const conteggi = new Map(
      (await this.prisma.delivery.groupBy({
        by: ['recurringServiceId'],
        where: { recurringServiceId: { in: righe.map((r) => r.id) }, date: { gte: daOggi } },
        _count: { _all: true },
      })).map((g) => [g.recurringServiceId, g._count._all]),
    );

    const esito = new Map<string, { attese: number; fatte: number; mancanti: number; inCorso: boolean }>();
    for (const r of righe) {
      const inizio = new Date(Date.UTC(r.dataInizio.getUTCFullYear(), r.dataInizio.getUTCMonth(), r.dataInizio.getUTCDate()));
      const fineDichiarata = r.dataFine
        ? new Date(Date.UTC(r.dataFine.getUTCFullYear(), r.dataFine.getUTCMonth(), r.dataFine.getUTCDate()))
        : null;
      // Senza data di fine l'orizzonte è la finestra mobile: là non «manca»
      // mai niente, perché il domani non è ancora arrivato.
      const finestraMobile = new Date(daOggi);
      finestraMobile.setUTCDate(finestraMobile.getUTCDate() + ORIZZONTE_GIORNI - 1);
      let fine = fineDichiarata ?? finestraMobile;
      if (fine > tetto) fine = tetto;

      let attese = 0;
      const g = new Date(daOggi > inizio ? daOggi : inizio);
      while (g <= fine) {
        if (toccaOggi(r, g.toISOString().slice(0, 10))) attese++;
        g.setUTCDate(g.getUTCDate() + 1);
      }
      const fatte = conteggi.get(r.id) ?? 0;
      const mancanti = Math.max(0, attese - fatte);
      esito.set(r.id, { attese, fatte, mancanti, inCorso: r.attivo && mancanti > 0 });
    }
    return esito;
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

  /**
   * LE ECCEZIONI PER GIORNO, controllate sul serio.
   *
   * ⚠️ Due eccezioni non possono rivendicare lo stesso giorno: si RIFIUTA,
   * invece di far vincere «la prima». Sceglierne una per ordinamento vorrebbe
   * dire che la fascia del sabato cambia da sola aggiungendo una riga altrove.
   *
   * ⚠️ Su un servizio SETTIMANALE un'eccezione su un giorno che il servizio
   * non fa non sbaglierebbe niente: semplicemente non scatterebbe MAI. Una
   * regola che non può scattare si rifiuta, non si accetta in silenzio — è la
   * differenza fra «impostato» e «funzionante».
   */
  private controllaVarianti(
    varianti: VarianteDto[] | undefined,
    contesto: { frequenza: string; giorni: string },
  ): void {
    if (!varianti?.length) return;
    const preso: (number | null)[] = Array(7).fill(null);
    varianti.forEach((v, i) => {
      if (v.timeFrom >= v.timeTo) {
        throw new BadRequestException(
          `Eccezione ${i + 1}: l'orario di fine (${v.timeTo}) deve venire dopo quello d'inizio (${v.timeFrom}).`,
        );
      }
      if (!/1/.test(v.giorni)) {
        throw new BadRequestException(`Eccezione ${i + 1}: scegli almeno un giorno.`);
      }
      for (let g = 0; g < 7; g++) {
        if (v.giorni[g] !== '1') continue;
        if (preso[g] !== null) {
          throw new BadRequestException(
            `${NOMI_GIORNI[g].charAt(0).toUpperCase() + NOMI_GIORNI[g].slice(1)} è in due eccezioni (la ${preso[g]! + 1} e la ${i + 1}): scegline una sola, altrimenti non si sa quale fascia vale.`,
          );
        }
        preso[g] = i;
        if (contesto.frequenza === 'SETTIMANALE' && contesto.giorni[g] !== '1') {
          throw new BadRequestException(
            `Eccezione ${i + 1}: il servizio non lavora di ${NOMI_GIORNI[g]}, quindi quell'eccezione non scatterebbe mai. Accendi il giorno fra quelli del servizio, oppure toglilo dall'eccezione.`,
          );
        }
      }
    });
  }

  /**
   * Quello che un PARTNER non decide: chi va a fare la consegna e quanto costa.
   *
   * ⚠️ Non si "ignorano" i campi lasciandoli passare: si SOVRASCRIVONO qui, che
   * e' l'unico posto che il partner non puo' aggirare. Un client puo' sempre
   * mandare `price` a mano — la difesa sta nel server, non nel form.
   * Senza prezzo scritto vale il LISTINO del partner (`PartnerService`), come
   * per qualunque altra sua consegna; senza valet lo assegna l'ufficio.
   */
  private async normalizzaPerPartner(dto: CreaRicorrenteDto, user?: JwtUser): Promise<CreaRicorrenteDto> {
    if (user?.role !== Role.PARTNER) return dto;
    const partnerId = user.partnerId;
    if (!partnerId) throw new ForbiddenException('Utente partner senza partner collegato.');
    // Il servizio dev'essere UNO DEI SUOI: altrimenti si sceglierebbe il
    // listino di qualcun altro.
    const suo = await this.prisma.partnerService.findFirst({
      where: { partnerId, serviceTypeId: dto.serviceTypeId },
      select: { id: true },
    });
    if (!suo) throw new BadRequestException('Questo servizio non è nel tuo listino.');
    return {
      ...dto,
      partnerId,
      valetId: undefined,
      price: undefined,
      valetSalary: undefined,
      // ⚠️ Anche dentro le eccezioni il valet non lo sceglie lui: si toglie
      // qui, non ci si fida del form che non glielo mostra.
      varianti: dto.varianti?.map((v) => ({ ...v, valetId: undefined })),
    };
  }

  async create(dtoGrezzo: CreaRicorrenteDto, user?: JwtUser) {
    const dto = await this.normalizzaPerPartner(dtoGrezzo, user);
    this.controllaRicorrenza(dto);
    this.controllaVarianti(dto.varianti, {
      frequenza: dto.frequenza ?? 'SETTIMANALE',
      giorni: dto.giorni,
    });
    const creato = await this.prisma.recurringService.create({
      data: {
        varianti: dto.varianti?.length
          ? {
              create: dto.varianti.map((v) => ({
                giorni: v.giorni,
                timeFrom: v.timeFrom,
                timeTo: v.timeTo,
                valetId: v.valetId || null,
              })),
            }
          : undefined,
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
    // ⭐ SI GENERA SUBITO L'ORIZZONTE. Prima la generazione era solo notturna e
    // solo per OGGI: chi impostava un presidio non vedeva nascere niente e
    // l'aveva - giustamente - per rotto. Un presidio che non si vede sul
    // calendario e' indistinguibile da uno che non funziona.
    // ⚠️ Solo le prime due settimane, non tutto l'orizzonte: vedi
    // `SUBITO_GIORNI`. Il resto lo riempie la corsa periodica — così il tasto
    // Salva risponde in un secondo anche per un ricorrente di mille consegne.
    const generate = await this.genera({ soloId: creato.id, giorni: SUBITO_GIORNI });
    return { ...creato, generate };
  }

  async update(id: string, dtoGrezzo: Partial<AggiornaRicorrenteDto>, user?: JwtUser) {
    const c = await this.prisma.recurringService.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Servizio ricorrente non trovato');
    // ⚠️ Il partner tocca solo i suoi, e non puo' spostarli a un altro partner
    // ne' scrivere valet e prezzi.
    let dto = dtoGrezzo;
    if (user?.role === Role.PARTNER) {
      if (c.partnerId !== user.partnerId) throw new ForbiddenException('Non è un tuo servizio ricorrente.');
      dto = { ...dtoGrezzo, partnerId: undefined, valetId: undefined, price: undefined, valetSalary: undefined };
    }
    // ⚠️ Si controlla la ricorrenza RISULTANTE, non solo quella mandata: un
    // PATCH che cambia solo la frequenza lascerebbe i giorni vecchi, e un
    // mensile senza giorni del mese non genererebbe mai niente pur sembrando
    // attivo. E' la trappola del form parziale, dal lato della validazione.
    this.controllaRicorrenza({
      frequenza: dto.frequenza ?? c.frequenza,
      giorni: dto.giorni ?? c.giorni,
      giorniMese: dto.giorniMese ?? c.giorniMese ?? undefined,
    });
    this.controllaVarianti(dto.varianti, {
      frequenza: dto.frequenza ?? c.frequenza,
      giorni: dto.giorni ?? c.giorni,
    });
    // ⚠️ Le eccezioni si sostituiscono in blocco SOLO se il client le manda:
    // `undefined` vuol dire «non le ho toccate», `[]` vuol dire «toglile
    // tutte». Confondere i due casi cancellerebbe in silenzio.
    if (dto.varianti !== undefined) {
      await this.prisma.recurringServiceVariant.deleteMany({ where: { recurringServiceId: id } });
      if (dto.varianti.length) {
        await this.prisma.recurringServiceVariant.createMany({
          data: dto.varianti.map((v) => ({
            recurringServiceId: id,
            giorni: v.giorni,
            timeFrom: v.timeFrom,
            timeTo: v.timeTo,
            valetId: v.valetId || null,
          })),
        });
      }
    }
    await this.prisma.recurringService.update({
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
    // ⭐ Correggere la regola non basta: va corretto anche cio' che la regola
    // ha GIA' scritto. Cambiare la fascia e lasciare le consegne future con
    // quella vecchia sarebbe una modifica che non modifica niente.
    const riallineate = await this.riallineaFuture(id);
    const generate = await this.genera({ soloId: id, giorni: SUBITO_GIORNI });
    return { ...(await this.prisma.recurringService.findUnique({ where: { id }, include: { varianti: true } }))!, riallineate, generate };
  }

  /**
   * Rimette in riga le consegne FUTURE nate da questo servizio.
   *
   * ⚠️ Si toccano solo quelle **non ancora lavorate** — `created`/`assigned`,
   * non cancellate, da domani in poi. Una consegna che il valet ha gia'
   * accettato o consegnato e' un fatto avvenuto: riscriverle l'orario a
   * posteriori vorrebbe dire falsificare la giornata di qualcuno.
   *
   * ⚠️ Nemmeno OGGI si tocca: la giornata e' in corso, il valet potrebbe
   * essersi gia' organizzato anche senza aver premuto niente.
   */
  private async riallineaFuture(id: string) {
    const r = await this.prisma.recurringService.findUnique({
      where: { id },
      include: { varianti: true },
    });
    if (!r) return { toccate: 0, tolte: 0 };
    const oggi = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(new Date());
    const domani = new Date(`${oggi}T00:00:00.000Z`);
    domani.setUTCDate(domani.getUTCDate() + 1);

    const future = await this.prisma.delivery.findMany({
      where: {
        recurringServiceId: id,
        deletedAt: null,
        date: { gte: domani },
        status: { in: ['created', 'assigned'] },
      },
      select: { id: true, date: true },
    });

    let toccate = 0;
    let tolte = 0;
    // Una volta sola per tutto il riallineamento: l'indirizzo del ricorrente è
    // uno, e la memoria di `luogoDaIndirizzo` fa il resto.
    const luogoRiallineo = await this.deliveries.luogoDaIndirizzo(r.recipientAddress);
    for (const d of future) {
      const iso = d.date.toISOString().slice(0, 10);
      // Un giorno che non tocca piu' (giorni cambiati, servizio sospeso,
      // periodo accorciato) non deve restare li' a chiedere un valet.
      const vale = r.attivo
        && d.date >= new Date(Date.UTC(r.dataInizio.getUTCFullYear(), r.dataInizio.getUTCMonth(), r.dataInizio.getUTCDate()))
        && (!r.dataFine || d.date <= r.dataFine)
        && toccaOggi(r, iso);
      if (!vale) {
        await this.prisma.delivery.update({
          where: { id: d.id },
          data: { deletedAt: new Date(), status: 'cancelled' },
        });
        await this.prisma.deliveryLog.create({
          data: {
            deliveryId: d.id,
            type: 'cancelled',
            message: `Annullata: il servizio ricorrente «${r.nome}» non prevede più il ${iso}.`,
          },
        });
        tolte++;
        continue;
      }
      const f = fasciaDelGiorno(r, iso);
      await this.prisma.delivery.update({
        where: { id: d.id },
        data: {
          deliveryTimeFrom: f.timeFrom,
          deliveryTimeTo: f.timeTo,
          valetId: f.valetId,
          status: f.valetId ? 'assigned' : 'created',
          pickupAddress: r.pickupAddress,
          recipientFirstName: r.recipientFirstName ?? r.nome,
          recipientLastName: r.recipientLastName ?? '',
          recipientAddress: r.recipientAddress,
          latitude: luogoRiallineo.lat,
          longitude: luogoRiallineo.lng,
          provinceId: luogoRiallineo.provinceId,
          price: r.price ?? 0,
          valetSalary: r.valetSalary ?? 0,
          hours: r.hours,
          serviceTypeId: r.serviceTypeId,
          partnerId: r.partnerId,
        },
      });
      toccate++;
    }
    return { toccate, tolte };
  }

  /**
   * IL RIEMPIMENTO A LOTTI (28/08/2026, chiesto dall'utente).
   *
   * «Se carico un servizio ricorrente con 1000 consegne rischiamo di bloccare
   * l'app? Magari caricando 15 consegne ogni minuto.»
   *
   * ⚠️ Misurato: **93 ms a consegna** (365 in 33,8 s). Mille consegne in una
   * richiesta sola sarebbero **93 secondi** sul tasto Salva — dentro i 300 s
   * della funzione, ma inaccettabili — e la corsa notturna fa TUTTI i
   * ricorrenti insieme: tre servizi lunghi e il tetto lo sfondi davvero.
   *
   * Quindi il lavoro si spezza: la creazione fa **due settimane** e questa
   * corsa, ogni quarto d'ora, aggiunge un **lotto** fino a coprire l'orizzonte
   * dichiarato da ciascun servizio.
   *
   * ⚠️ È idempotente come la generazione normale (la coppia servizio+data non
   * si rigenera), quindi una corsa che si sovrappone alla precedente non
   * raddoppia niente: al massimo non trova nulla da fare.
   *
   * ⚠️ Il tetto raggiunto si **dichiara**: «create 150» letto come «ho finito»
   * lascerebbe il resto del periodo vuoto senza che nessuno lo sappia. La
   * corsa dopo riprende da dove si è fermata.
   */
  async riempi(lotto = LOTTO_RIEMPIMENTO) {
    const esito = await this.genera({ max: lotto });
    return {
      ...esito,
      lotto,
      // Detto a parole per chi legge l'esito del cron: «ne mancano ancora» è
      // un'informazione, «create 150» da solo non lo è.
      mancanoAncora: esito.fermatoAlTetto,
    };
  }

  async remove(id: string, user?: JwtUser) {
    const c = await this.prisma.recurringService.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Servizio ricorrente non trovato');
    if (user?.role === Role.PARTNER && c.partnerId !== user.partnerId) {
      throw new ForbiddenException('Non è un tuo servizio ricorrente.');
    }
    // Le consegne gia' generate restano (recurringServiceId va a NULL da FK).
    await this.prisma.recurringService.delete({ where: { id } });
    return { ok: true };
  }

  /**
   * Genera le consegne di un ORIZZONTE di giorni (default: da oggi, ora di
   * Roma, per `ORIZZONTE_GIORNI`) per i servizi ricorrenti attivi.
   *
   * ⭐ Prima generava UN SOLO giorno, e solo alla corsa notturna. Chi impostava
   * un presidio non vedeva niente sul calendario dei giorni dopo, e un presidio
   * che non si vede in anticipo e' indistinguibile da uno che non funziona.
   * Adesso la finestra si riempie in avanti e la corsa notturna la fa scorrere.
   *
   * Resta IDEMPOTENTE: la coppia (servizio, data) non si rigenera — nemmeno se
   * quella consegna e' stata cancellata a mano, perche' cancellarla e' una
   * decisione, non un errore da rimediare.
   */
  async genera(opzioni?: { da?: string; giorni?: number; soloId?: string; max?: number } | string) {
    // Compatibilita': `genera('2026-08-27')` continua a voler dire quel giorno.
    const o = typeof opzioni === 'string' ? { da: opzioni, giorni: 1 } : (opzioni ?? {});
    const partenza = o.da
      ?? new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(new Date());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(partenza)) throw new BadRequestException('Data non valida (YYYY-MM-DD).');
    const primo = new Date(`${partenza}T00:00:00.000Z`);
    /** Il tetto assoluto: oltre non si va comunque. */
    const tetto = new Date(primo);
    tetto.setUTCDate(tetto.getUTCDate() + (o.giorni ?? ORIZZONTE_MASSIMO_GIORNI) - 1);

    const ricorrenti = await this.prisma.recurringService.findMany({
      where: {
        ...(o.soloId ? { id: o.soloId } : {}),
        attivo: true,
        dataInizio: { lte: tetto },
        OR: [{ dataFine: null }, { dataFine: { gte: primo } }],
      },
      include: {
        serviceType: { select: { pricingModel: true } },
        varianti: true,
        // Ritiro di default = sede del partner (regola 31/08): un ricorrente
        // senza `pickupAddress` proprio non deve generare consegne senza ritiro.
        partner: { select: { address: true } },
      },
    });

    /**
     * FIN DOVE si genera, per OGNI servizio.
     *
     * ⭐ Chi ha scritto «fino al 31/12» ha gia' detto fin dove vuole vedere le
     * consegne: fermarsi a due settimane vorrebbe dire ignorare quello che ha
     * dichiarato. Senza data di fine («per sempre») vale la finestra mobile,
     * che la corsa notturna fa scorrere di un giorno per volta.
     */
    const finePer = (r: (typeof ricorrenti)[number]): Date => {
      const mobile = new Date(primo);
      mobile.setUTCDate(mobile.getUTCDate() + (o.giorni ?? ORIZZONTE_GIORNI) - 1);
      const dichiarata = r.dataFine
        ? new Date(Date.UTC(r.dataFine.getUTCFullYear(), r.dataFine.getUTCMonth(), r.dataFine.getUTCDate()))
        : null;
      // Con `giorni` chiesto esplicitamente comanda quello; altrimenti la data
      // di fine se c'e'. In ogni caso mai oltre il tetto assoluto.
      const scelta = o.giorni != null ? mobile : (dichiarata ?? mobile);
      return scelta > tetto ? tetto : scelta;
    };

    /**
     * IL PREZZO DAL LISTINO, quando il ricorrente non ne dichiara uno.
     *
     * ⚠️ Prima si scriveva `r.price ?? 0`: senza prezzo scritto a mano la
     * consegna nasceva a **ZERO**, non «da listino». Uno zero non e' un dato
     * mancante — e' un numero, entra nei conti, e nessuno lo vede come sbagliato
     * guardando la consegna. Adesso vale la stessa regola del form: prezzo del
     * partner per quel servizio, o prezzo base del tipo di servizio; per i
     * servizi A ORA moltiplicato per le ore.
     *
     * ⚠️ Gli extra KM restano fuori: dipendono dalla distanza, e la distanza di
     * un presidio ricorrente non e' nota qui. Meglio il listino secco che una
     * distanza inventata.
     */
    const listini = new Map<string, { price: number; pricingModel: string | null }>();
    const prezzoDaListino = async (r: (typeof ricorrenti)[number]): Promise<number> => {
      if (r.price != null) return r.price;
      const chiave = `${r.partnerId}|${r.serviceTypeId}`;
      if (!listini.has(chiave)) {
        const ps = await this.prisma.partnerService.findUnique({
          where: { partnerId_serviceTypeId: { partnerId: r.partnerId, serviceTypeId: r.serviceTypeId } },
          select: { price: true },
        });
        const st = await this.prisma.serviceType.findUnique({
          where: { id: r.serviceTypeId },
          select: { basePrice: true, pricingModel: true },
        });
        listini.set(chiave, {
          price: ps?.price ?? st?.basePrice ?? 0,
          pricingModel: st?.pricingModel ?? null,
        });
      }
      const l = listini.get(chiave)!;
      return l.pricingModel === 'A_ORA' ? l.price * Math.max(r.hours ?? 1, 1) : l.price;
    };

    /**
     * LA PAGA DEL VALET dal suo listino, quando il ricorrente non la dichiara.
     * Stesso ragionamento: senza, il valet risultava pagato zero. Vale solo se
     * un valet c'e' — se lo assegna l'ufficio piu' tardi, la paga la calcola
     * `assignValet`, che e' il posto giusto.
     */
    const paghe = new Map<string, number>();
    const pagaDaListino = async (r: (typeof ricorrenti)[number], valetId: string | null): Promise<number> => {
      if (r.valetSalary != null) return r.valetSalary;
      if (!valetId) return 0;
      const chiave = `${valetId}|${r.serviceTypeId}`;
      if (!paghe.has(chiave)) {
        const vs = await this.prisma.valetService.findFirst({
          where: { valetId, serviceTypeId: r.serviceTypeId },
          select: { salary: true },
        });
        paghe.set(chiave, vs?.salary ?? 0);
      }
      const base = paghe.get(chiave)!;
      const st = listini.get(`${r.partnerId}|${r.serviceTypeId}`);
      return st?.pricingModel === 'A_ORA' ? base * Math.max(r.hours ?? 1, 1) : base;
    };

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
    /**
     * ⚠️ La regola si sceglie sull'orario VERO di quel giorno, non su quello
     * "normale" del servizio: con un'eccezione (sabato 8-9 invece di 7-8) la
     * finestra oraria della regola carnet puo' dare un esito diverso, e la
     * consegna mostrerebbe l'orario giusto con la regola dell'orario sbagliato.
     */
    const regolaPer = (
      r: (typeof ricorrenti)[number],
      dataGiorno: Date,
      oraInizio: string,
    ): string | null => {
      const candidate = regole.filter((g) => {
        if (!g.partners.some((p) => p.partnerId === r.partnerId)) return false;
        if (g.periodStart && dataGiorno < g.periodStart) return false;
        if (g.periodEnd && dataGiorno > g.periodEnd) return false;
        const modello = MODELLO[(g.legacyPricingModel ?? '').trim()] ?? null;
        if (modello && r.serviceType?.pricingModel !== modello) return false;
        const da = minuti(g.timeFrom), a = minuti(g.timeTo), ora = minuti(oraInizio);
        if (da != null && a != null && !(da === 0 && a >= 1439)) {
          if (ora == null || ora < da || ora > a) return false;
        }
        return true;
      });
      return candidate.length === 1 ? candidate[0].id : null;
    };

    let create = 0, giaEsistenti = 0;
    const esiti: { nome: string; giorno: string; code?: number; esito: string }[] = [];
    const toccati = new Set<string>();

    // ⚠️ Il numero della consegna si legge UNA VOLTA e poi si incrementa qui:
    // prima si faceva un `aggregate` per ogni consegna creata — un giro in piu'
    // sul database per riga, che su un orizzonte di mesi si sente. E' anche
    // meno esposto alle corse: il progressivo non si rilegge in mezzo.
    const ultimoCode = await this.prisma.delivery.aggregate({ _max: { code: true } });
    let prossimoCode = (ultimoCode._max.code ?? 0) + 1;

    let ultimoGiornoFatto = partenza;
    let fermatoAlTetto = false;

    for (const r of ricorrenti) {
      const inizio = new Date(Date.UTC(
        r.dataInizio.getUTCFullYear(), r.dataInizio.getUTCMonth(), r.dataInizio.getUTCDate(),
      ));
      const fine = finePer(r);
      const giorno = new Date(primo > inizio ? primo : inizio);
      while (giorno <= fine) {
        const iso = giorno.toISOString().slice(0, 10);
        if (iso > ultimoGiornoFatto) ultimoGiornoFatto = iso;
        if (!toccaOggi(r, iso)) { giorno.setUTCDate(giorno.getUTCDate() + 1); continue; }

        const dataGiorno = new Date(`${iso}T00:00:00.000Z`);
        const gia = await this.prisma.delivery.findFirst({
          where: { recurringServiceId: r.id, date: dataGiorno },
          select: { id: true },
        });
        if (gia) {
          giaEsistenti++;
          giorno.setUTCDate(giorno.getUTCDate() + 1);
          continue;
        }
        if (create >= (o.max ?? MASSIMO_PER_CORSA)) { fermatoAlTetto = true; break; }

        const f = fasciaDelGiorno(r, iso);
        // ⚠️ Una chiamata per INDIRIZZO, non per consegna: un ricorrente fino
        // al 31/12 ne fa novanta allo stesso indirizzo, e sarebbero novanta
        // chiamate a Google per la stessa risposta.
        const luogo = await this.deliveries.luogoDaIndirizzo(r.recipientAddress);
        const consegna = await this.prisma.delivery.create({
          data: {
            code: prossimoCode++,
            date: dataGiorno,
            partnerId: r.partnerId,
            serviceTypeId: r.serviceTypeId,
            // ⚠️⚠️ 02/09 (caso Chakroun/Chanel Roma): la geocodifica qui sopra
            // veniva CHIAMATA E BUTTATA — le figlie nascevano senza provincia
            // né coordinate, e una consegna senza provincia sparisce dai filtri
            // per zona e dall'ambito dei team leader (121 su 129 invisibili al
            // team leader di Roma). È la stessa trappola del 28/08, rientrata
            // dalla porta dei ricorrenti nuovi.
            latitude: luogo.lat,
            longitude: luogo.lng,
            provinceId: luogo.provinceId,
            valetId: f.valetId,
            status: f.valetId ? 'assigned' : 'created',
            deliveryTimeFrom: f.timeFrom,
            deliveryTimeTo: f.timeTo,
            pickupAddress: r.pickupAddress?.trim() || r.partner?.address?.trim() || null,
            recipientFirstName: r.recipientFirstName ?? r.nome,
            recipientLastName: r.recipientLastName ?? '',
            recipientAddress: r.recipientAddress,
            price: await prezzoDaListino(r),
            valetSalary: await pagaDaListino(r, f.valetId),
            hours: r.hours,
            payable: true,
            billable: true,
            recurringServiceId: r.id,
            deliveryRuleId: regolaPer(r, dataGiorno, f.timeFrom),
          },
          select: { id: true, code: true },
        });
        await this.prisma.deliveryLog.create({
          data: {
            deliveryId: consegna.id,
            type: 'created',
            message:
              `Generata dal servizio ricorrente «${r.nome}» per il ${iso} (${f.timeFrom}–${f.timeTo})`
              + (f.daEccezione ? ', fascia da eccezione di giorno.' : '.'),
          },
        });
        toccati.add(r.id);
        create++;
        esiti.push({ nome: r.nome, giorno: iso, code: consegna.code, esito: 'creata' });
        giorno.setUTCDate(giorno.getUTCDate() + 1);
      }
      if (fermatoAlTetto) break;
    }

    if (toccati.size) {
      await this.prisma.recurringService.updateMany({
        where: { id: { in: [...toccati] } },
        data: { ultimaGenerazione: new Date() },
      });
    }
    return {
      ok: true,
      dal: partenza,
      al: ultimoGiornoFatto,
      create,
      giaEsistenti,
      // ⚠️ Un tetto raggiunto si DICE: senza, «create 600» si legge come «ho
      // finito» e il resto del periodo resterebbe vuoto senza che nessuno lo
      // sappia. La corsa successiva riprende da dove si e' fermata.
      fermatoAlTetto,
      esiti,
    };
  }
}

@ApiTags('recurring-services')
@ApiBearerAuth()
// ⭐ ANCHE IL PARTNER (27/08, chiesto dall'utente): puo' impostarsi i propri
// presidi ricorrenti. Non sceglie il valet e non scrive prezzi — si applica il
// LISTINO che ha gia' (`PartnerService`), come per qualunque altra sua
// consegna. Tutto il resto lo decide l'ufficio.
@Roles(Role.ADMIN, Role.OPERATION, Role.PROJECT_MANAGER, Role.PARTNER)
@Controller('recurring-services')
export class RecurringController {
  constructor(private readonly service: RecurringService_) {}

  @Get()
  @ApiOperation({ summary: 'I servizi ricorrenti (presìdi che si ripetono)' })
  list(@CurrentUser() user: JwtUser) {
    return this.service.list(user);
  }

  @Post()
  @ApiOperation({ summary: 'Nuovo servizio ricorrente (es. ogni lunedi 7-8 per un partner)' })
  create(@Body() dto: CreaRicorrenteDto, @CurrentUser() user: JwtUser) {
    return this.service.create(dto, user);
  }

  // ⚠️ La generazione resta dell'ufficio: fa nascere consegne vere, e il cron
  // la fa comunque ogni notte per tutti.
  @Post('genera')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({
    summary: 'Genera le consegne dei prossimi giorni (default: 14 da oggi) dai ricorrenti attivi',
  })
  genera(@Query('data') data?: string, @Query('giorni') giorni?: string) {
    const n = Number(giorni);
    return this.service.genera({ da: data, giorni: Number.isFinite(n) && n > 0 ? n : undefined });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Aggiorna (anche solo attivo on/off)' })
  update(@Param('id') id: string, @Body() dto: Partial<AggiornaRicorrenteDto>, @CurrentUser() user: JwtUser) {
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Elimina (le consegne gia generate restano)' })
  remove(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.remove(id, user);
  }
}

@Module({
  imports: [PrismaModule, DeliveriesModule],
  controllers: [RecurringController],
  providers: [RecurringService_],
  exports: [RecurringService_],
})
export class RecurringModule {}
