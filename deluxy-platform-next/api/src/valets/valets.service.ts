import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JwtUser } from '../common/decorators';
import { Role } from '../common/enums';
import { titleCaseNome } from '../common/nome-proprio';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { CreateValetDto, UpdateValetDto } from './dto/create-valet.dto';

const VALET_INCLUDE = {
  provinces: { include: { province: true } },
  services: { include: { serviceType: true } },
} as const;

@Injectable()
export class ValetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  /**
   * @param soloAssegnabili quando vero (team leader, ruolo VALET) torna una
   * proiezione SICURA: id, nome, province e SOLO gli id-servizio — nessuna
   * PAGA (`ValetService.price`), che è il costo nostro. Serve al team leader per
   * assegnare (anche a se stesso) senza vedere quanto guadagnano i colleghi.
   */
  findAll(soloAssegnabili = false) {
    if (soloAssegnabili) {
      return this.prisma.valet.findMany({
        orderBy: { lastName: 'asc' },
        select: {
          id: true, firstName: true, lastName: true, active: true, placeholder: true,
          provinces: { select: { province: { select: { id: true, code: true, name: true } } } },
          services: { select: { serviceTypeId: true } },
        },
      });
    }
    return this.prisma.valet.findMany({
      include: VALET_INCLUDE,
      orderBy: { lastName: 'asc' },
    });
  }

  /** ELIMINATO (come i partner): sparisce da Stipendi ed elenchi, reversibile. */
  async elimina(id: string) {
    return this.prisma.valet.update({ where: { id }, data: { deleted: true, active: false } });
  }
  async ripristina(id: string) {
    return this.prisma.valet.update({ where: { id }, data: { deleted: false } });
  }

  /**
   * REGOLA DEI 90 GIORNI (decisa dall'utente il 26/08): un valet che non si
   * collega per piu' di 90 giorni passa in stato inattivo. Gira ogni notte
   * dalla corsa del cron.
   *
   * ⚠️ Il conto parte dai PROSSIMI 90 giorni (l'utente): `lastLoginAt` esiste
   * dal 26/08/2026, e un null dice «mai registrato», non «mai entrato». Chi
   * non ha un accesso registrato conta dalla NASCITA del campo: nessuno puo'
   * spegnersi prima del 24/11/2026, e da li' in poi la regola vale per tutti.
   */
  async disattivaFermi(giorni = 90): Promise<{ disattivati: number; nomi: string[] }> {
    const soglia = new Date(Date.now() - giorni * 86_400_000);
    const nascitaCampo = new Date('2026-08-26T00:00:00.000Z');
    const fermi = await this.prisma.valet.findMany({
      where: {
        active: true,
        placeholder: false,
        OR: [
          { user: { is: { lastLoginAt: { not: null, lt: soglia } } } },
          // Mai entrato da quando si registra: fermo dalla nascita del campo.
          ...(nascitaCampo < soglia
            ? [
                { user: { is: { lastLoginAt: null } } },
                { user: null },
              ]
            : []),
        ],
      },
      select: { id: true, firstName: true, lastName: true },
    });
    if (fermi.length) {
      await this.prisma.valet.updateMany({
        where: { id: { in: fermi.map((v) => v.id) } },
        data: { active: false },
      });
    }
    return { disattivati: fermi.length, nomi: fermi.map((v) => `${v.lastName} ${v.firstName}`) };
  }

  async findOne(id: string, user?: JwtUser) {
    if (user?.role === Role.VALET && user.valetId !== id) {
      throw new ForbiddenException('Accesso non consentito');
    }
    const valet = await this.prisma.valet.findUnique({
      where: { id },
      include: VALET_INCLUDE,
    });
    if (!valet) throw new NotFoundException('Valet non trovato');
    return valet;
  }

  async create(dto: CreateValetDto, actor?: JwtUser) {
    const {
      provinceIds, services, birthDate,
      teamLeaderProvinceIds, teamLeaderPartnerIds, teamLeaderExcludedPartnerIds, ...scalar
    } = dto;
    if ((scalar as any).firstName !== undefined) (scalar as any).firstName = titleCaseNome((scalar as any).firstName) ?? (scalar as any).firstName;
    if ((scalar as any).lastName !== undefined) (scalar as any).lastName = titleCaseNome((scalar as any).lastName) ?? (scalar as any).lastName;
    const valet = await this.prisma.valet.create({
      data: {
        ...scalar,
        birthDate: birthDate ? new Date(birthDate) : undefined,
        teamLeaderProvinces: teamLeaderProvinceIds?.length
          ? JSON.stringify(teamLeaderProvinceIds)
          : undefined,
        teamLeaderPartners: teamLeaderPartnerIds?.length
          ? JSON.stringify(teamLeaderPartnerIds)
          : undefined,
        teamLeaderExcludedPartners: teamLeaderExcludedPartnerIds?.length
          ? JSON.stringify(teamLeaderExcludedPartnerIds)
          : undefined,
        provinces: provinceIds?.length
          ? { create: provinceIds.map((provinceId) => ({ provinceId })) }
          : undefined,
        services: services?.length ? { create: services } : undefined,
      },
      include: VALET_INCLUDE,
    });
    // Un gesto solo: crea l'utente VALET collegato (invitato).
    await this.users.provisionForAnagrafica(
      {
        email: valet.email,
        firstName: valet.firstName,
        lastName: valet.lastName,
        role: Role.VALET,
        valetId: valet.id,
      },
      actor,
    );
    return valet;
  }

  async update(id: string, dto: UpdateValetDto) {
    await this.findOne(id);
    const {
      provinceIds, services, birthDate,
      teamLeaderProvinceIds, teamLeaderPartnerIds, teamLeaderExcludedPartnerIds, ...scalar
    } = dto;
    if ((scalar as any).firstName !== undefined) (scalar as any).firstName = titleCaseNome((scalar as any).firstName) ?? (scalar as any).firstName;
    if ((scalar as any).lastName !== undefined) (scalar as any).lastName = titleCaseNome((scalar as any).lastName) ?? (scalar as any).lastName;
    return this.prisma.valet.update({
      where: { id },
      data: {
        ...scalar,
        ...(birthDate ? { birthDate: new Date(birthDate) } : {}),
        ...(teamLeaderProvinceIds
          ? { teamLeaderProvinces: JSON.stringify(teamLeaderProvinceIds) }
          : {}),
        ...(teamLeaderPartnerIds
          ? { teamLeaderPartners: JSON.stringify(teamLeaderPartnerIds) }
          : {}),
        ...(teamLeaderExcludedPartnerIds
          ? { teamLeaderExcludedPartners: JSON.stringify(teamLeaderExcludedPartnerIds) }
          : {}),
        ...(provinceIds
          ? {
              provinces: {
                deleteMany: {},
                create: provinceIds.map((provinceId) => ({ provinceId })),
              },
            }
          : {}),
        ...(services ? { services: { deleteMany: {}, create: services } } : {}),
      },
      include: VALET_INCLUDE,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.valet.update({ where: { id }, data: { active: false } });
    return { deactivated: true };
  }

  // --- Disponibilità per data (impostata dal valet dal calendario) ---

  /** Il valet gestisce solo la propria disponibilità; admin/operation/PM tutte. */
  private assertCanManage(valetId: string, user: JwtUser): void {
    if (user.role === Role.VALET && user.valetId !== valetId) {
      throw new ForbiddenException('Accesso non consentito');
    }
  }

  async getAvailability(valetId: string, user: JwtUser, from?: string, to?: string) {
    this.assertCanManage(valetId, user);
    const where: any = { valetId };
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to) { const t = new Date(to); t.setDate(t.getDate() + 1); where.date.lt = t; }
    }
    const rows = await this.prisma.valetAvailability.findMany({ where, orderBy: { date: 'asc' } });
    return rows.map((r) => ({
      date: r.date.toISOString().slice(0, 10),
      available: r.available,
      timeFrom: r.timeFrom,
      timeTo: r.timeTo,
      note: r.note,
    }));
  }

  /** Crea/aggiorna la disponibilità per una data (upsert su valetId+date). */
  async setAvailability(
    valetId: string,
    user: JwtUser,
    body: { date: string; available?: boolean; timeFrom?: string; timeTo?: string; note?: string },
  ) {
    this.assertCanManage(valetId, user);
    const date = new Date(body.date + 'T00:00:00.000Z');
    const available = body.available ?? true;
    const data = {
      available,
      timeFrom: available ? (body.timeFrom || null) : null,
      timeTo: available ? (body.timeTo || null) : null,
      note: body.note || null,
    };
    // ⚠️ La chiave unica adesso comprende la FASCIA, non solo il giorno: un
    // valet puo' dichiarare piu' finestre nello stesso giorno (nel legacy ne
    // ha fino a sei), e il vincolo stretto ne aveva perse 325 all'import.
    //
    // Ma questo modulo salva UNA disponibilita' per giorno — e' il modo in cui
    // il valet la scrive dalla sua pagina. Quindi si cancella quello che c'era
    // per quel giorno e si scrive la nuova: un upsert su una chiave che
    // comprende l'orario lascerebbe in piedi la fascia vecchia accanto alla
    // nuova, e il valet si ritroverebbe disponibile in un orario che ha appena
    // cambiato.
    await this.prisma.valetAvailability.deleteMany({ where: { valetId, date } });
    const row = await this.prisma.valetAvailability.create({
      data: { valetId, date, ...data },
    });
    return { date: row.date.toISOString().slice(0, 10), ...data };
  }

  async removeAvailability(valetId: string, user: JwtUser, dateStr: string) {
    this.assertCanManage(valetId, user);
    const date = new Date(dateStr + 'T00:00:00.000Z');
    await this.prisma.valetAvailability.deleteMany({ where: { valetId, date } });
    return { deleted: true };
  }
}
