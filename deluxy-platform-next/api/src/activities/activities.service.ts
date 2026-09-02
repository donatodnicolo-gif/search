import { Injectable, NotFoundException } from '@nestjs/common';
import { JwtUser } from '../common/decorators';
import { Role } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';
import { ambitoTeamLeader, filtroDaAmbito } from '../common/team-leader';

@Injectable()
export class ActivitiesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lista attivita' ordinabili per orario ("reorder with time").
   * - Valet: vede le proprie; se team leader vede anche quelle
   *   degli altri valet delle sue province.
   * - Partner: attivita' delle proprie consegne.
   */
  /**
   * Le attivita' di ritiro e consegna.
   *
   * ⚠️ C'e' un TETTO, e serve: in tabella ce ne sono 57.253 e senza un filtro
   * di data uscivano tutte in una risposta sola. Sono quasi tutte storia —
   * oggi ne cadono 9 — quindi il valore normale e' il giorno, e «tutte» e'
   * una vista di comodo che va limitata invece che lasciata esplodere.
   *
   * Il totale vero si restituisce sempre: chi guarda deve sapere che sta
   * vedendo una fetta, non tutto.
   */
  async findAll(user: JwtUser, date?: string, limite = 300) {
    let where: any = {};

    if (user.role === Role.VALET) {
      const valet = await this.prisma.valet.findUnique({
        where: { id: user.valetId ?? '-' },
        select: {
          id: true,
          isTeamLeader: true,
          teamLeaderProvinces: true,
          teamLeaderPartners: true,
          teamLeaderExcludedPartners: true,
          provinces: { select: { provinceId: true } },
        },
      });
      // ⚠️ Prima si guardavano `valet.provinces` — le province in cui LUI
      // lavora — invece di `teamLeaderProvinces`, quelle di cui RISPONDE: due
      // cose diverse, che per alcuni combaciano e per altri no. E i partner (e
      // i partner esclusi) non li leggeva nessuno. La regola sta adesso in un
      // posto solo, condivisa con le consegne.
      const ambito = await ambitoTeamLeader(
        valet as any,
        (provinceIds) =>
          this.prisma.valet.findMany({
            where: { provinces: { some: { provinceId: { in: provinceIds } } } },
            select: { id: true },
          }),
      );
      if (!ambito) {
        where.valetId = user.valetId ?? '-';
      } else {
        // ⚠️ Le attività non hanno una provincia propria: quella sta sulla
        // CONSEGNA. Il pezzo territoriale si traduce in una condizione
        // annidata su `delivery` (02/09: l'ambito è per LUOGO — tutte le
        // attività delle consegne nelle sue province, con o senza valet).
        const f = filtroDaAmbito(ambito) as { AND: Record<string, any>[] };
        where.AND = f.AND.map((pezzo) => {
          if (pezzo['OR']) {
            return {
              OR: pezzo['OR'].map((r: Record<string, any>) =>
                'provinceId' in r
                  ? { delivery: { provinceId: r['provinceId'] } }
                  : r,
              ),
            };
          }
          // I vincoli sul partner vivono sulla consegna, non sull'attività.
          return { delivery: pezzo };
        });
      }
    } else if (user.role === Role.PARTNER) {
      where.delivery = { partnerId: user.partnerId ?? '-' };
    }

    if (date) {
      const day = new Date(date);
      const next = new Date(day);
      next.setDate(next.getDate() + 1);
      where.scheduledAt = { gte: day, lt: next };
    }

    const tetto = Math.min(1000, Math.max(1, limite));
    const [totale, items] = await this.prisma.$transaction([
      this.prisma.activity.count({ where }),
      this.prisma.activity.findMany({
      where,
      include: {
        delivery: {
          select: { id: true, code: true, status: true, recipientAddress: true },
        },
        valet: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: [{ scheduledAt: 'asc' }, { timeFrom: 'asc' }, { sortOrder: 'asc' }],
        take: tetto,
      }),
    ]);
    return { items, totale, mostrate: items.length, tetto };
  }

  /** Riordino manuale delle attivita' (drag & drop nel frontend). */
  async reorder(items: { id: string; sortOrder: number }[]) {
    await this.prisma.$transaction(
      items.map((item) =>
        this.prisma.activity.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder },
        }),
      ),
    );
    return { reordered: items.length };
  }

  /**
   * Cambia lo stato di un'attività — SOLO se è nel perimetro di chi chiede.
   *
   * ⚠️ Prima era un `update` secco sull'id, senza guardare chi chiedeva: un
   * partner cambiava lo stato del giro di un valet qualsiasi. Il perimetro è
   * lo stesso della lista (`findAll`), non una regola nuova: il valet le
   * proprie, il team leader quelle della squadra, l'ufficio tutte.
   */
  async updateStatus(id: string, status: string, user?: JwtUser) {
    if (user?.role === Role.VALET) {
      const valet = await this.prisma.valet.findUnique({
        where: { id: user.valetId ?? '-' },
        select: {
          id: true, isTeamLeader: true,
          teamLeaderProvinces: true, teamLeaderPartners: true, teamLeaderExcludedPartners: true,
          provinces: { select: { provinceId: true } },
        },
      });
      const ambito = await ambitoTeamLeader(valet as any, (provinceIds) =>
        this.prisma.valet.findMany({
          where: { provinces: { some: { provinceId: { in: provinceIds } } } },
          select: { id: true },
        }),
      );
      // 02/09: la visibilità è TERRITORIALE — la sua, o una consegna nelle
      // sue province di responsabilità (la squadra resta per l'assegnazione).
      const sua = await this.prisma.activity.findFirst({
        where: ambito
          ? {
              id,
              OR: [
                { valetId: ambito.mioId },
                ...(ambito.provinceIds.length
                  ? [{ delivery: { provinceId: { in: ambito.provinceIds } } }]
                  : []),
              ],
            }
          : { id, valetId: user.valetId ?? '-' },
        select: { id: true },
      });
      // 404 e non 403: chi non può vederla non deve nemmeno sapere che esiste.
      if (!sua) throw new NotFoundException('Attività non trovata');
    }
    return this.prisma.activity.update({ where: { id }, data: { status } });
  }
}
