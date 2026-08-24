import { Injectable } from '@nestjs/common';
import { JwtUser } from '../common/decorators';
import { Role } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';

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
        include: { provinces: true },
      });
      if (valet?.isTeamLeader && valet.provinces.length) {
        const provinceIds = valet.provinces.map((p) => p.provinceId);
        const teamValets = await this.prisma.valet.findMany({
          where: { provinces: { some: { provinceId: { in: provinceIds } } } },
          select: { id: true },
        });
        where.valetId = { in: teamValets.map((v) => v.id) };
      } else {
        where.valetId = user.valetId ?? '-';
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

  updateStatus(id: string, status: string) {
    return this.prisma.activity.update({ where: { id }, data: { status } });
  }
}
  /**
   * Le attivita' di ritiro e consegna.
   *
   * ⚠️ C'e' un TETTO, e serve: in tabella ce ne sono 57.253 e senza filtro di
   * data uscivano tutte in una risposta sola. Sono quasi tutte storia — oggi
   * ne cadono 9 — quindi il valore normale e' il giorno, e «tutte» e' una
   * vista di comodo da limitare, non da lasciar esplodere.
   *
   * Il totale vero si restituisce sempre: chi guarda deve sapere che sta
   * vedendo una fetta, non tutto.
   */
