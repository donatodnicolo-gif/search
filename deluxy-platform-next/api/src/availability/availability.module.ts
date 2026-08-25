import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators';
import { Role } from '../common/enums';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';

/** Una fascia di disponibilita' in un giorno. */
type Fascia = { dalle: string | null; alle: string | null };

/** Chi e' disponibile, e da dove lo sappiamo. */
type Riga = {
  id: string;
  nome: string;
  /** `true` = lavora, `false` = chiuso quel giorno. */
  aperto: boolean;
  fasce: Fascia[];
  /**
   * Da dove viene la risposta. Serve a distinguere «ha detto che quel giorno
   * lavora dalle 9 alle 13» da «di solito il martedi' apre alle 9»: sono due
   * gradi di certezza diversi, e una tabella che li mescola fa prendere il
   * secondo per il primo.
   */
  origine: 'giorno' | 'eccezione' | 'settimanale' | 'non-indicata';
  /**
   * La citta' dell'anagrafica (campo `city`, importato dal legacy), per il
   * filtro a schermo. `null` quando l'anagrafica non la dichiara: chi filtra
   * per citta' deve sapere che quelle righe restano fuori.
   */
  citta: string | null;
};

@Injectable()
export class AvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Chi lavora in un dato giorno: partner e valet, insieme.
   *
   * Le fonti sono tre e vanno lette IN ORDINE, dalla piu' specifica alla piu'
   * generica — e la prima che parla vince:
   *
   *  1. le fasce del GIORNO (`PartnerDaySlot`, `ValetAvailability`): «quel
   *     giorno lavoro 10-12 e 16-18». Sono 113.191 righe per i partner.
   *  2. l'ECCEZIONE del giorno (`PartnerDayException`): chiusura o orario
   *     speciale. Solo per i partner.
   *  3. l'orario SETTIMANALE (`OpeningHour`, `ValetOpeningHour`): «il martedi'
   *     di solito apro alle 9».
   *
   * ⚠️ Un partner puo' avere PIU' fasce nello stesso giorno, e cosi' un valet:
   * tenerne una sola era un difetto vero — il vincolo troppo stretto su
   * `ValetAvailability` aveva fatto perdere 325 fasce all'import. Qui si
   * restituiscono tutte.
   */
  async giorno(dataIso: string) {
    // Mezzanotte UTC: e' cosi' che le date sono scritte in tabella.
    const giorno = new Date(`${dataIso}T00:00:00.000Z`);
    const domani = new Date(giorno.getTime() + 86400000);
    // ⚠️ Il giorno della settimana si prende in UTC perche' la data e' a
    // mezzanotte UTC: `getDay()` locale su una data UTC sposta il giorno
    // indietro per tutti quelli a est di Greenwich.
    const dayOfWeek = giorno.getUTCDay();

    const [partners, slots, eccezioni, settimanaliP, valets, dispValet, settimanaliV] =
      await Promise.all([
        this.prisma.partner.findMany({
          where: { active: true },
          select: { id: true, insegna: true, city: true },
          orderBy: { insegna: 'asc' },
        }),
        this.prisma.partnerDaySlot.findMany({
          where: { date: { gte: giorno, lt: domani } },
          select: { partnerId: true, timeFrom: true, timeTo: true, available: true },
        }),
        this.prisma.partnerDayException.findMany({
          where: { date: { gte: giorno, lt: domani } },
          select: { partnerId: true, closed: true, openTime: true, closeTime: true, note: true },
        }),
        this.prisma.openingHour.findMany({
          where: { dayOfWeek },
          select: { partnerId: true, openTime: true, closeTime: true, closed: true },
        }),
        this.prisma.valet.findMany({
          where: { active: true, placeholder: false },
          select: { id: true, firstName: true, lastName: true, city: true },
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        }),
        this.prisma.valetAvailability.findMany({
          where: { date: { gte: giorno, lt: domani } },
          select: { valetId: true, timeFrom: true, timeTo: true, available: true },
        }),
        this.prisma.valetOpeningHour.findMany({
          where: { dayOfWeek },
          select: { valetId: true, openTime: true, closeTime: true, closed: true },
        }),
      ]);

    const raggruppa = <T extends { [k: string]: any }>(righe: T[], chiave: string) => {
      const m = new Map<string, T[]>();
      for (const r of righe) {
        const k = r[chiave];
        const a = m.get(k) ?? [];
        a.push(r);
        m.set(k, a);
      }
      return m;
    };
    const slotPer = raggruppa(slots, 'partnerId');
    const dispPer = raggruppa(dispValet, 'valetId');
    const eccPer = new Map(eccezioni.map((e) => [e.partnerId, e]));
    const settPPer = new Map(settimanaliP.map((o) => [o.partnerId, o]));
    const settVPer = new Map(settimanaliV.map((o) => [o.valetId, o]));

    const daFasce = (righe: { timeFrom: string | null; timeTo: string | null; available: boolean }[]) => {
      const aperte = righe.filter((r) => r.available);
      return {
        aperto: aperte.length > 0,
        // Le fasce si ordinano per ora d'inizio: un elenco disordinato di
        // orari costringe chi legge a rimetterli in fila con gli occhi.
        fasce: aperte
          .map((r) => ({ dalle: r.timeFrom, alle: r.timeTo }))
          .sort((a, b) => (a.dalle ?? '').localeCompare(b.dalle ?? '')),
      };
    };

    const righePartner: Riga[] = partners.map((p) => {
      const base = { id: p.id, nome: p.insegna, citta: p.city ?? null };
      const s = slotPer.get(p.id);
      if (s?.length) {
        const { aperto, fasce } = daFasce(s);
        return { ...base, aperto, fasce, origine: 'giorno' as const };
      }
      const e = eccPer.get(p.id);
      if (e) {
        return {
          ...base,
          aperto: !e.closed,
          fasce: e.closed ? [] : [{ dalle: e.openTime, alle: e.closeTime }],
          origine: 'eccezione' as const,
        };
      }
      const w = settPPer.get(p.id);
      if (w) {
        return {
          ...base,
          aperto: !w.closed,
          fasce: w.closed ? [] : [{ dalle: w.openTime, alle: w.closeTime }],
          origine: 'settimanale' as const,
        };
      }
      // ⚠️ Nessuna fonte parla: NON si scrive «chiuso». Non sapere se lavora e
      // sapere che non lavora sono cose diverse, e confonderle fa scartare un
      // partner che magari era libero.
      return { ...base, aperto: false, fasce: [], origine: 'non-indicata' as const };
    });

    const righeValet: Riga[] = valets.map((v) => {
      const nome = `${v.lastName ?? ''} ${v.firstName ?? ''}`.trim() || '—';
      const base = { id: v.id, nome, citta: v.city ?? null };
      const d = dispPer.get(v.id);
      if (d?.length) {
        const { aperto, fasce } = daFasce(d);
        return { ...base, aperto, fasce, origine: 'giorno' as const };
      }
      const w = settVPer.get(v.id);
      if (w) {
        return {
          ...base,
          aperto: !w.closed,
          fasce: w.closed ? [] : [{ dalle: w.openTime, alle: w.closeTime }],
          origine: 'settimanale' as const,
        };
      }
      return { ...base, aperto: false, fasce: [], origine: 'non-indicata' as const };
    });

    const conta = (r: Riga[]) => ({
      totali: r.length,
      disponibili: r.filter((x) => x.aperto).length,
      chiusi: r.filter((x) => !x.aperto && x.origine !== 'non-indicata').length,
      nonIndicati: r.filter((x) => x.origine === 'non-indicata').length,
      /// Quanti hanno detto qualcosa per QUESTO giorno, invece del solito.
      perQuestoGiorno: r.filter((x) => x.origine === 'giorno' || x.origine === 'eccezione').length,
    });

    return {
      data: dataIso,
      partner: { righe: righePartner, ...conta(righePartner) },
      valet: { righe: righeValet, ...conta(righeValet) },
    };
  }
}

@ApiTags('availability')
@ApiBearerAuth()
@Controller('availability')
export class AvailabilityController {
  constructor(private readonly service: AvailabilityService) {}

  @Get('day')
  @Roles(Role.ADMIN, Role.OPERATION, Role.PROJECT_MANAGER)
  @ApiOperation({ summary: 'Chi lavora in un dato giorno: partner e valet, con le loro fasce' })
  @ApiQuery({ name: 'date', required: false, description: 'AAAA-MM-GG (oggi se assente)' })
  giorno(@Query('date') date?: string) {
    const oggi = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(new Date());
    const d = /^\d{4}-\d{2}-\d{2}$/.test(date ?? '') ? date! : oggi;
    return this.service.giorno(d);
  }
}

@Module({
  imports: [PrismaModule],
  controllers: [AvailabilityController],
  providers: [AvailabilityService],
})
export class AvailabilityModule {}
