// ============================================================
// Regole carnet (delivery rules)
// ------------------------------------------------------------
// Replica la schermata "Consegne Regole" (/partner/delivery/rules)
// dell'app reale: regole per carnet e servizi con numero di consegne
// garantito. Vedi §3 di docs/COME-FUNZIONA-APP-DELUXY.md.
//
// Una regola puo' avere il vincolo giornaliero (dailyRule) e/o quello
// totale nel periodo (totalRule) — i due sono indipendenti come nell'app
// reale. Plus/Minus su fatturazione partner e paga valet, estendibile a
// piu' partner.
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
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags, PartialType } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';
import { CurrentUser, JwtUser, Roles } from '../common/decorators';
import { Role } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateDeliveryRuleDto {
  @ApiProperty({ description: 'Nome della regola' })
  @IsString()
  name: string;

  @ApiProperty({ default: false, description: 'Attiva il vincolo giornaliero' })
  @IsOptional()
  @IsBoolean()
  dailyRule?: boolean;

  @ApiProperty({ default: 0, description: 'Numero giornaliero di consegne garantite' })
  @IsOptional()
  @IsInt()
  @Min(0)
  dailyCount?: number;

  @ApiProperty({ default: false, description: 'Attiva il vincolo totale nel periodo' })
  @IsOptional()
  @IsBoolean()
  totalRule?: boolean;

  @ApiProperty({ default: 0, description: 'Numero totale di consegne garantite nel periodo' })
  @IsOptional()
  @IsInt()
  @Min(0)
  totalCount?: number;

  @ApiProperty({ required: false, description: 'Inizio validita (ISO)' })
  @IsOptional()
  @IsString()
  periodStart?: string;

  @ApiProperty({ required: false, description: 'Fine validita (ISO)' })
  @IsOptional()
  @IsString()
  periodEnd?: string;

  @ApiProperty({ required: false, description: 'Ora inizio fascia "HH:mm"' })
  @IsOptional()
  @Matches(HHMM, { message: 'timeFrom deve essere HH:mm' })
  timeFrom?: string;

  @ApiProperty({ required: false, description: 'Ora fine fascia "HH:mm"' })
  @IsOptional()
  @Matches(HHMM, { message: 'timeTo deve essere HH:mm' })
  timeTo?: string;

  @ApiProperty({ required: false, description: 'Distanza KM entro cui vale la regola' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  kmDistance?: number;

  @ApiProperty({ required: false, description: 'Tipo di servizio collegato' })
  @IsOptional()
  @IsString()
  serviceTypeId?: string;

  @ApiProperty({ default: 0, description: 'Plus/Minus fatturazione partner' })
  @IsOptional()
  @IsNumber()
  partnerBillingAdjustment?: number;

  @ApiProperty({ default: 0, description: 'Plus/Minus paga valet' })
  @IsOptional()
  @IsNumber()
  valetPayAdjustment?: number;

  @ApiProperty({ default: true, description: 'Da fatturare' })
  @IsOptional()
  @IsBoolean()
  toBill?: boolean;

  @ApiProperty({ default: true, description: 'Da pagare' })
  @IsOptional()
  @IsBoolean()
  toPay?: boolean;

  @ApiProperty({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiProperty({ required: false, type: [String], description: 'Partner a cui estendere la regola' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  partnerIds?: string[];
}

export class UpdateDeliveryRuleDto extends PartialType(CreateDeliveryRuleDto) {}

const RULE_INCLUDE = {
  serviceType: { select: { id: true, name: true } },
  partners: { include: { partner: { select: { id: true, insegna: true } } } },
} as const;

@Injectable()
export class DeliveryRulesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.deliveryRule.findMany({
      include: RULE_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const rule = await this.prisma.deliveryRule.findUnique({
      where: { id },
      include: RULE_INCLUDE,
    });
    if (!rule) throw new NotFoundException('Regola carnet non trovata');
    return rule;
  }

  /** Una regola deve garantire almeno un vincolo, altrimenti non ha senso. */
  private validate(dto: CreateDeliveryRuleDto | UpdateDeliveryRuleDto, isCreate: boolean) {
    // In update i campi possono essere assenti: si validano solo se presenti.
    const daily = dto.dailyRule;
    const total = dto.totalRule;
    if (isCreate && !daily && !total) {
      throw new BadRequestException('Attiva almeno una regola tra giornaliera e totale');
    }
    if (daily && (dto.dailyCount ?? 0) <= 0) {
      throw new BadRequestException('La regola giornaliera richiede un numero di consegne > 0');
    }
    if (total && (dto.totalCount ?? 0) <= 0) {
      throw new BadRequestException('La regola totale richiede un numero di consegne > 0');
    }
  }

  /** Solo i campi scalari (niente relazioni): usato sia in create che update. */
  private data(dto: CreateDeliveryRuleDto | UpdateDeliveryRuleDto) {
    return {
      name: dto.name,
      dailyRule: dto.dailyRule,
      dailyCount: dto.dailyCount,
      totalRule: dto.totalRule,
      totalCount: dto.totalCount,
      periodStart: dto.periodStart ? new Date(dto.periodStart) : null,
      periodEnd: dto.periodEnd ? new Date(dto.periodEnd) : null,
      timeFrom: dto.timeFrom ?? null,
      timeTo: dto.timeTo ?? null,
      kmDistance: dto.kmDistance ?? null,
      partnerBillingAdjustment: dto.partnerBillingAdjustment,
      valetPayAdjustment: dto.valetPayAdjustment,
      toBill: dto.toBill,
      toPay: dto.toPay,
      active: dto.active,
    };
  }

  private partnerCreate(partnerIds?: string[]) {
    return partnerIds?.length
      ? { create: [...new Set(partnerIds)].map((partnerId) => ({ partnerId })) }
      : undefined;
  }

  /**
   * ⭐ 06/09/2026 (regola utente «crea registro»): ogni creazione, modifica e
   * cancellazione di una regola lascia una riga con CHI, QUANDO e COSA è cambiato.
   * Best-effort: una riga che non si scrive non ferma la regola.
   */
  private async registra(regola: { id: string; name: string }, type: 'creata' | 'modificata' | 'eliminata', user: JwtUser | undefined, message: string, before?: unknown, after?: unknown) {
    try {
      await this.prisma.deliveryRuleLog.create({ data: {
        deliveryRuleId: regola.id, type, userId: user?.sub ?? null, userEmail: user?.email ?? null, message,
        before: before === undefined ? null : JSON.stringify(before), after: after === undefined ? null : JSON.stringify(after),
      } });
    } catch (e) { console.error('registro regole: riga non scritta', (e as Error).message); }
  }

  /** La fotografia leggibile di una regola, per il registro (solo i campi che contano). */
  private foto(r: any) {
    return {
      name: r.name, dailyRule: r.dailyRule, dailyCount: r.dailyCount, totalRule: r.totalRule, totalCount: r.totalCount,
      periodStart: r.periodStart ? new Date(r.periodStart).toISOString().slice(0, 10) : null, periodEnd: r.periodEnd ? new Date(r.periodEnd).toISOString().slice(0, 10) : null,
      timeFrom: r.timeFrom ?? null, timeTo: r.timeTo ?? null, kmDistance: r.kmDistance ?? null, days: r.days ?? null,
      serviceType: r.serviceType?.name ?? null, partnerBillingAdjustment: r.partnerBillingAdjustment, valetPayAdjustment: r.valetPayAdjustment,
      toBill: r.toBill, toPay: r.toPay, active: r.active,
      partners: (r.partners ?? []).map((p: any) => p.partner?.insegna ?? p.partnerId).sort(),
    };
  }

  private static readonly ETICHETTE: Record<string, string> = {
    name: 'nome', dailyRule: 'regola giornaliera', dailyCount: 'consegne al giorno', totalRule: 'carnet totale', totalCount: 'consegne totali',
    periodStart: 'inizio', periodEnd: 'fine', timeFrom: 'dalle', timeTo: 'alle', kmDistance: 'km', days: 'giorni', serviceType: 'servizio',
    partnerBillingAdjustment: 'plus/minus partner', valetPayAdjustment: 'plus/minus valet', toBill: 'da fatturare', toPay: 'da pagare', active: 'attiva', partners: 'partner',
  };

  /** Il registro di una regola, dal più recente. */
  registro(id: string) {
    return this.prisma.deliveryRuleLog.findMany({ where: { deliveryRuleId: id }, orderBy: { createdAt: 'desc' } });
  }

  async create(dto: CreateDeliveryRuleDto, user?: JwtUser) {
    this.validate(dto, true);
    // ⭐ 06/09/2026 (domanda utente «creare regole dà un numero? es. Regola 40»): sì —
    // la regola nuova prende il numero successivo all'ultimo (legacy o già numerato)
    // e il nome diventa «Regola N · <nome scritto>», così si cita come le importate.
    const tutte = await this.prisma.deliveryRule.findMany({ select: { legacyId: true, name: true } });
    const ultimo = Math.max(0, ...tutte.map((r) => r.legacyId ?? Number((r.name.match(/^Regola\s+(\d+)/i) ?? [])[1] ?? 0)));
    const nome = /^Regola\s+\d+/i.test(dto.name ?? '') ? dto.name : `Regola ${ultimo + 1}${dto.name?.trim() ? ' · ' + dto.name.trim() : ''}`;
    const creata = await this.prisma.deliveryRule.create({
      data: {
        ...this.data(dto),
        name: nome,
        ...(dto.serviceTypeId ? { serviceType: { connect: { id: dto.serviceTypeId } } } : {}),
        partners: this.partnerCreate(dto.partnerIds),
      },
      include: RULE_INCLUDE,
    });
    const f = this.foto(creata);
    await this.registra(creata, 'creata', user, `Regola creata: ${f.name} · partner ${f.partners.join(', ') || '—'} · partner ${f.partnerBillingAdjustment} € · valet ${f.valetPayAdjustment} € · da fatturare ${f.toBill ? 'sì' : 'no'} · da pagare ${f.toPay ? 'sì' : 'no'}`, undefined, f);
    return creata;
  }

  async update(id: string, dto: UpdateDeliveryRuleDto, user?: JwtUser) {
    const prima = this.foto(await this.findOne(id));
    this.validate(dto, false);
    // Se arriva la lista partner, si riscrive per intero l'estensione.
    const rewritePartners = dto.partnerIds !== undefined;
    if (rewritePartners) {
      await this.prisma.deliveryRulePartner.deleteMany({ where: { deliveryRuleId: id } });
    }
    const aggiornata = await this.prisma.deliveryRule.update({
      where: { id },
      data: {
        ...pruneUndefined(this.data(dto)),
        // undefined = campo non inviato (non tocca); stringa vuota = scollega.
        ...(dto.serviceTypeId !== undefined
          ? dto.serviceTypeId
            ? { serviceType: { connect: { id: dto.serviceTypeId } } }
            : { serviceType: { disconnect: true } }
          : {}),
        ...(rewritePartners ? { partners: this.partnerCreate(dto.partnerIds) ?? {} } : {}),
      },
      include: RULE_INCLUDE,
    });
    const dopo = this.foto(aggiornata);
    const cambiati: Record<string, [unknown, unknown]> = {};
    for (const k of Object.keys(dopo)) if (JSON.stringify((prima as any)[k]) !== JSON.stringify((dopo as any)[k])) cambiati[k] = [(prima as any)[k], (dopo as any)[k]];
    const testo = Object.entries(cambiati).map(([k, [a, b]]) => `${DeliveryRulesService.ETICHETTE[k] ?? k}: ${fmt(a)} → ${fmt(b)}`).join(' · ');
    await this.registra(aggiornata, 'modificata', user, testo ? `Regola modificata — ${testo}` : 'Regola salvata senza cambiamenti', Object.fromEntries(Object.entries(cambiati).map(([k, v]) => [k, v[0]])), Object.fromEntries(Object.entries(cambiati).map(([k, v]) => [k, v[1]])));
    return aggiornata;
  }

  async remove(id: string, user?: JwtUser) {
    const regola = await this.findOne(id);
    const f = this.foto(regola);
    await this.prisma.deliveryRule.delete({ where: { id } });
    await this.registra(regola, 'eliminata', user, `Regola eliminata: ${f.name} · partner ${f.partners.join(', ') || '—'}`, f, undefined);
    return { deleted: true };
  }

  /**
   * Regole carnet attive che includono un partner, con il consumo calcolato:
   * quante consegne del partner hanno gia' "usato" il carnet e quante ne
   * restano. Usato nella scheda partner.
   *
   * Cosa consuma una consegna: appartiene al partner, rientra nel periodo
   * della regola (per il totale) o e' di oggi (per il giornaliero), ed e' del
   * tipo servizio della regola se specificato. Le consegne annullate o non
   * accettate NON consumano il carnet.
   */
  /**
   * Le REGOLE VALET: il plus a scaglioni sul numero di RITIRI del giro
   * (`[{operator: equal|moreThan, pickUps, plusSalary}]`), coi valet a cui
   * ciascuna si applica. Importate dal legacy (tabella-34), finora invisibili.
   */
  /**
   * ⭐ 08/09/2026 (regola utente: «mancano visualizzazione, modifica, creazione ed
   * eliminazione», con due paletti: «elimina solo se richiesto» e «non tocca stipendi di
   * consegne già passate, stessa cosa per la modifica»).
   *
   * ⚠️ COME SI TIENE FEDE AL SECONDO PALETTO. Le consegne portano il riferimento alla
   * regola con cui sono state pagate (`Delivery.valetDeliveryRuleId`), e l'anteprima di
   * uno stipendio **ricalcola dalle consegne** ogni volta: se si riscrivessero gli
   * scaglioni di una regola già usata, un ricalcolo di un periodo chiuso darebbe numeri
   * diversi da quelli pagati.
   *
   * Perciò una regola GIÀ USATA non si riscrive mai: modificarla **crea una versione
   * nuova**, sposta lì i valet e lascia la vecchia (disattivata) agganciata alle consegne
   * di prima, che continuano a rispiegarsi con gli scaglioni con cui furono pagate.
   * Una regola che nessuna consegna usa si modifica sul posto: non c'è niente da salvare.
   *
   * Nessuna colonna nuova sul Postgres condiviso: il versionamento si fa per copia.
   */
  private static scaglioniValidi(scaglioni: unknown): string {
    if (!Array.isArray(scaglioni)) throw new BadRequestException('Gli scaglioni devono essere un elenco.');
    const puliti = scaglioni.map((x: any, i: number) => {
      const operator = x?.operatore ?? x?.operator;
      if (operator !== 'equal' && operator !== 'moreThan') {
        throw new BadRequestException(`Scaglione ${i + 1}: l'operatore vale «equal» o «moreThan».`);
      }
      const pickUps = Number(x?.ritiri ?? x?.pickUps);
      const plusSalary = Number(x?.plus ?? x?.plusSalary);
      if (!Number.isFinite(pickUps) || pickUps < 0 || pickUps > 50) {
        throw new BadRequestException(`Scaglione ${i + 1}: i ritiri devono stare fra 0 e 50.`);
      }
      if (!Number.isFinite(plusSalary) || plusSalary < 0 || plusSalary > 500) {
        throw new BadRequestException(`Scaglione ${i + 1}: il plus deve stare fra 0 e 500 €.`);
      }
      return { operator, pickUps: String(pickUps), plusSalary: String(plusSalary) };
    });
    if (!puliti.length) throw new BadRequestException('Serve almeno uno scaglione.');
    return JSON.stringify(puliti);
  }

  /**
   * I BUCHI di una regola: numeri di ritiri che non prendono nessun plus.
   * ⚠️ Non è teoria: la «Regola valet 8» ha `=2` e `>3`, quindi chi fa esattamente
   * **3 ritiri non prende niente** — riguarda 12 valet, e nessuno se n'era accorto
   * perché il difetto si vede solo guardando un giro alla volta.
   */
  private static buchi(tiers: string): number[] {
    let sc: { operator?: string; pickUps?: string | number; plusSalary?: string | number }[] = [];
    try { sc = JSON.parse(tiers) ?? []; } catch { return []; }
    const scoperti: number[] = [];
    for (let n = 2; n <= 8; n++) {
      const copre = sc.some((x) => {
        const k = Number(x.pickUps ?? 0);
        const p = Number(x.plusSalary ?? 0);
        if (!Number.isFinite(k) || !(p > 0)) return false;
        return x.operator === 'moreThan' ? n > k : n === k;
      });
      if (!copre) scoperti.push(n);
    }
    return scoperti;
  }

  /** Quante consegne usano una regola: e' il numero che decide se si puo' cancellare. */
  private async consegneDellaRegola(id: string): Promise<number> {
    return this.prisma.delivery.count({ where: { valetDeliveryRuleId: id, deletedAt: null } });
  }

  async creaRegolaValet(body: { name?: string; scaglioni?: unknown; valetIds?: string[]; active?: boolean }) {
    const name = String(body?.name ?? '').trim();
    if (!name) throw new BadRequestException('Serve il nome della regola.');
    const tiers = DeliveryRulesService.scaglioniValidi(body?.scaglioni);
    const creata = await this.prisma.valetDeliveryRule.create({
      data: {
        name, tiers, active: body?.active ?? true,
        valets: body?.valetIds?.length
          ? { create: body.valetIds.map((valetId) => ({ valetId })) }
          : undefined,
      },
      select: { id: true },
    });
    return (await this.regoleValet()).find((r) => r.id === creata.id) ?? null;
  }

  async modificaRegolaValet(id: string, body: { name?: string; scaglioni?: unknown; valetIds?: string[]; active?: boolean }) {
    const regola = await this.prisma.valetDeliveryRule.findUnique({
      where: { id }, include: { valets: { select: { valetId: true } } },
    });
    if (!regola) throw new NotFoundException('Regola non trovata');
    const usata = await this.consegneDellaRegola(id);
    const tiers = body?.scaglioni !== undefined ? DeliveryRulesService.scaglioniValidi(body.scaglioni) : regola.tiers;
    const name = body?.name !== undefined ? String(body.name).trim() : regola.name;
    if (!name) throw new BadRequestException('Serve il nome della regola.');
    const valetIds = body?.valetIds ?? regola.valets.map((v) => v.valetId);
    const scaglioniCambiati = tiers !== regola.tiers;

    // ⚠️ Gli scaglioni di una regola GIÀ USATA non si riscrivono: nasce una versione
    // nuova. Cambiare solo il nome o i valet assegnati invece non tocca nessun conto.
    if (scaglioniCambiati && usata > 0) {
      const nuova = await this.prisma.valetDeliveryRule.create({
        data: { name, tiers, active: true, valets: { create: valetIds.map((valetId) => ({ valetId })) } },
        select: { id: true },
      });
      await this.prisma.valetDeliveryRule.update({
        where: { id },
        data: { active: false, name: `${regola.name} (fino all'${new Date().toLocaleDateString('it-IT')})`, valets: { deleteMany: {} } },
      });
      const elenco = await this.regoleValet();
      return {
        ...(elenco.find((r) => r.id === nuova.id) ?? {}),
        versionata: true,
        vecchiaRegolaId: id,
        consegneStoriche: usata,
        messaggio: `La regola era su ${usata} consegne già pagate: per non cambiarne i conti è nata una versione nuova, e la precedente resta disattivata a spiegare quelle paghe.`,
      };
    }

    await this.prisma.valetDeliveryRule.update({
      where: { id },
      data: {
        name, tiers,
        ...(body?.active !== undefined ? { active: body.active } : {}),
        ...(body?.valetIds ? { valets: { deleteMany: {}, create: valetIds.map((valetId) => ({ valetId })) } } : {}),
      },
    });
    return (await this.regoleValet()).find((r) => r.id === id) ?? null;
  }

  /**
   * ELIMINA — e solo su richiesta esplicita di chi guarda (regola utente 08/09).
   * Una regola usata da almeno una consegna NON si cancella: si disattiva, così le paghe
   * di quelle consegne restano rispiegabili. Cancellarla lascerebbe righe che dicono
   * «plus 3 €» senza più nessuno che sappia perché.
   */
  async eliminaRegolaValet(id: string, disattivaSeUsata = false) {
    const regola = await this.prisma.valetDeliveryRule.findUnique({ where: { id }, select: { id: true, name: true, active: true } });
    if (!regola) throw new NotFoundException('Regola non trovata');
    const usata = await this.consegneDellaRegola(id);
    if (usata > 0) {
      if (!disattivaSeUsata) {
        return {
          eliminata: false, disattivata: false, consegne: usata,
          messaggio: `Questa regola è su ${usata} consegne: eliminandola quelle paghe non si potrebbero più rispiegare. Si può disattivare: non si applica più, ma resta a spiegare lo storico.`,
        };
      }
      await this.prisma.valetDeliveryRule.update({ where: { id }, data: { active: false, valets: { deleteMany: {} } } });
      return { eliminata: false, disattivata: true, consegne: usata, messaggio: `Regola disattivata: non si applica più, e le ${usata} consegne di prima restano spiegate.` };
    }
    await this.prisma.valetDeliveryRule.delete({ where: { id } });
    return { eliminata: true, disattivata: false, consegne: 0, messaggio: 'Regola eliminata: nessuna consegna la usava.' };
  }

  async regoleValet() {
    const regole = await this.prisma.valetDeliveryRule.findMany({
      include: {
        valets: { include: { valet: { select: { id: true, firstName: true, lastName: true, active: true } } } },
        _count: { select: { deliveries: true } },
      },
      orderBy: { name: 'asc' },
    });
    return regole.map((r) => {
      let scaglioni: { operator?: string; pickUps?: string | number; plusSalary?: string | number }[] = [];
      try { scaglioni = JSON.parse(r.tiers) ?? []; } catch { scaglioni = []; }
      return {
        id: r.id,
        name: r.name,
        active: r.active,
        scaglioni: scaglioni.map((s) => ({
          operatore: s.operator ?? 'equal',
          ritiri: Number(s.pickUps ?? 0),
          plus: Number(s.plusSalary ?? 0),
        })),
        valets: r.valets.map((x) => ({
          id: x.valet.id,
          nome: `${x.valet.firstName} ${x.valet.lastName}`.trim(),
          attivo: x.valet.active,
        })),
        consegneCollegate: r._count.deliveries,
        /**
         * ⭐ 08/09/2026: i numeri di ritiri che NON prendono nessun plus. La «Regola
         * valet 8» ha `=2` e `>3`: chi fa esattamente 3 ritiri non prende niente, e
         * riguarda 12 valet. Un buco così si vede solo guardando un giro alla volta —
         * qui lo dice l'elenco.
         */
        ritiriScoperti: DeliveryRulesService.buchi(r.tiers),
      };
    });
  }

  async forPartner(partnerId: string) {
    const rules = await this.prisma.deliveryRule.findMany({
      where: { active: true, partners: { some: { partnerId } } },
      include: RULE_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfTomorrow = new Date(startOfToday);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

    return Promise.all(
      rules.map(async (rule) => {
        const base = {
          partnerId,
          status: { notIn: [...NON_CONSUMING_STATUSES] },
          ...(rule.serviceTypeId ? { serviceTypeId: rule.serviceTypeId } : {}),
        };

        let totalUsed: number | null = null;
        let totalRemaining: number | null = null;
        if (rule.totalRule) {
          totalUsed = await this.prisma.delivery.count({
            where: {
              ...base,
              ...(rule.periodStart || rule.periodEnd
                ? {
                    date: {
                      ...(rule.periodStart ? { gte: rule.periodStart } : {}),
                      ...(rule.periodEnd ? { lte: rule.periodEnd } : {}),
                    },
                  }
                : {}),
            },
          });
          totalRemaining = Math.max(0, rule.totalCount - totalUsed);
        }

        let dailyUsedToday: number | null = null;
        let dailyRemainingToday: number | null = null;
        if (rule.dailyRule) {
          dailyUsedToday = await this.prisma.delivery.count({
            where: { ...base, date: { gte: startOfToday, lt: startOfTomorrow } },
          });
          dailyRemainingToday = Math.max(0, rule.dailyCount - dailyUsedToday);
        }

        return {
          ...rule,
          usage: { totalUsed, totalRemaining, dailyUsedToday, dailyRemainingToday },
        };
      }),
    );
  }
}

/** Stati che non consumano il carnet (consegna annullata o non accettata). */
const NON_CONSUMING_STATUSES = ['cancelled', 'not_accepted', 'cancellation_requested'] as const;

/** Rimuove le chiavi undefined per non azzerare per errore campi non inviati in update. */
/** Un valore del registro in forma leggibile. */
function fmt(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'sì' : 'no';
  if (Array.isArray(v)) return v.join(', ') || '—';
  return String(v);
}

function pruneUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

@ApiTags('delivery-rules')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.OPERATION, Role.PROJECT_MANAGER)
@Controller('delivery-rules')
export class DeliveryRulesController {
  constructor(private readonly service: DeliveryRulesService) {}

  @Get()
  @ApiOperation({ summary: 'Lista regole carnet' })
  findAll() {
    return this.service.findAll();
  }

  @Get('partner/:partnerId')
  @ApiOperation({ summary: 'Regole carnet di un partner con consegne rimaste' })
  forPartner(@Param('partnerId') partnerId: string) {
    return this.service.forPartner(partnerId);
  }

  // ⚠️ Prima di ':id', o «valet» verrebbe letto come un id di regola.
  @Get('valet')
  @ApiOperation({ summary: 'Le REGOLE VALET (plus a scaglioni sui ritiri del giro), coi valet assegnati' })
  regoleValet() {
    return this.service.regoleValet();
  }

  @Post('valet')
  @ApiOperation({ summary: 'Crea una regola valet (scaglioni sui ritiri del giro)' })
  creaRegolaValet(@Body() body: { name?: string; scaglioni?: unknown; valetIds?: string[]; active?: boolean }) {
    return this.service.creaRegolaValet(body);
  }

  @Put('valet/:id')
  @ApiOperation({
    summary: 'Modifica una regola valet. ⚠️ Se gli scaglioni cambiano e la regola è già su delle consegne, '
      + 'nasce una VERSIONE NUOVA e la vecchia resta disattivata: le paghe già fatte non si toccano.',
  })
  modificaRegolaValet(@Param('id') id: string, @Body() body: { name?: string; scaglioni?: unknown; valetIds?: string[]; active?: boolean }) {
    return this.service.modificaRegolaValet(id, body);
  }

  @Delete('valet/:id')
  @ApiOperation({
    summary: 'Elimina una regola valet SOLO se nessuna consegna la usa. Se è usata non cancella: '
      + 'risponde quante consegne la portano, e con ?disattiva=1 la disattiva lasciando lo storico spiegabile.',
  })
  eliminaRegolaValet(@Param('id') id: string, @Query('disattiva') disattiva?: string) {
    return this.service.eliminaRegolaValet(id, disattiva === '1' || disattiva === 'true');
  }

  @Get(':id/registro')
  @ApiOperation({ summary: 'Registro della regola: chi ha fatto cosa e quando' })
  registro(@Param('id') id: string) {
    return this.service.registro(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Dettaglio regola carnet' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Crea regola carnet' })
  create(@Body() dto: CreateDeliveryRuleDto, @CurrentUser() user: JwtUser) {
    return this.service.create(dto, user);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Aggiorna regola carnet' })
  update(@Param('id') id: string, @Body() dto: UpdateDeliveryRuleDto, @CurrentUser() user: JwtUser) {
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Elimina regola carnet' })
  remove(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.remove(id, user);
  }
}

@Module({
  controllers: [DeliveryRulesController],
  providers: [DeliveryRulesService],
})
export class DeliveryRulesModule {}
