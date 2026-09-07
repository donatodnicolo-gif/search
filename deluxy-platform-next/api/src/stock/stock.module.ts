import { BadRequestException, Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators';
import { Role } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';

/**
 * ⭐ 06/09/2026 (regola utente): «per i prodotti con flag magazzino lo stock
 * deve essere gestito su app delivery».
 *
 * Fino a oggi «Controlla stock» e «Giacenza» erano due campi che nessuno
 * leggeva: la piattaforma registrava MOVIMENTI (consegne) ma non un SALDO.
 * Da qui in poi, per i soli prodotti (o varianti) con `controlStock`:
 *
 *  - `Product.stock` / `ProductVariant.stock` è il SALDO in magazzino;
 *  - ogni consegna che li porta lo SCALA alla creazione (la merce è impegnata
 *    da quando la consegna esiste, non da quando parte) e segna
 *    `Delivery.stockConsumed`;
 *  - una consegna annullata, non accettata, invalidata o NON consegnata lo
 *    RIALZA (la merce torna in magazzino) e segna `Delivery.stockReturned`;
 *  - una modifica delle righe rientra il vecchio e scala il nuovo;
 *  - la correzione a mano della giacenza nel form prodotto lascia una riga
 *    «rettifica»;
 *  - ogni passo scrive in `StockMovement`: il saldo si può sempre rifare dai
 *    movimenti, e si vede chi ha mosso cosa.
 *
 * Il controllo parte quando la giacenza è SCRITTA (un flag senza numero non
 * blocca niente). Con giacenza insufficiente la consegna NON nasce (400 col nome del
 * prodotto e i pezzi disponibili); l'ufficio può forzare con `ignoraStock`
 * (il saldo va sotto zero, e lo si vede). Il partner no.
 *
 * ⚠️ Stock della piattaforma, non di Shopify: Merchandising è la casa dei
 * negozi online e non legge ancora questo saldo (Standard §7: un dato, una casa
 * — questa). Il legacy aveva gli stessi campi e non li usava (0 righe).
 */
export type RigaStock = { productId: string; productVariantId?: string | null; quantity?: number | null };

type Controllato = {
  chiave: string;
  tipo: 'variante' | 'prodotto';
  id: string;
  productId: string;
  nome: string;
  stock: number;
  richiesti: number;
};

@Injectable()
export class StockService {
  constructor(private readonly prisma: PrismaService) {}

  /** Le righe che toccano un prodotto/variante con «Controlla stock», col saldo attuale. */
  private async controllate(righe: RigaStock[]): Promise<Controllato[]> {
    const ids = [...new Set(righe.map((r) => r.productId).filter(Boolean))];
    if (!ids.length) return [];
    const prodotti = new Map(
      (await this.prisma.product.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, controlStock: true, stock: true },
      })).map((p) => [p.id, p]),
    );
    const idVar = [...new Set(righe.map((r) => r.productVariantId).filter(Boolean))] as string[];
    const varianti = idVar.length
      ? new Map((await this.prisma.productVariant.findMany({
          where: { id: { in: idVar } },
          select: { id: true, name: true, controlStock: true, stock: true, productId: true },
        })).map((v) => [v.id, v]))
      : new Map<string, { id: string; name: string; controlStock: boolean; stock: number | null; productId: string }>();
    // Stesso prodotto su due righe: si sommano i pezzi PRIMA di confrontare col saldo.
    const somma = new Map<string, Controllato>();
    for (const r of righe) {
      const q = Math.max(1, Number(r.quantity ?? 1) || 1);
      const v = r.productVariantId ? varianti.get(r.productVariantId) : undefined;
      const p = prodotti.get(r.productId);
      let c: Controllato | null = null;
      // Giacenza MAI caricata (null) = controllo non ancora attivo su quel prodotto:
      // il flag c'è su 99 prodotti dal legacy senza un numero, e non deve
      // bloccare le consegne finché qualcuno non scrive la giacenza nel form.
      if (v?.controlStock && v.stock != null) {
        c = { chiave: 'v:' + v.id, tipo: 'variante', id: v.id, productId: v.productId, nome: `${p?.name ?? '?'} / ${v.name}`, stock: v.stock ?? 0, richiesti: q };
      } else if (p?.controlStock && p.stock != null) {
        c = { chiave: 'p:' + p.id, tipo: 'prodotto', id: p.id, productId: p.id, nome: p.name, stock: p.stock ?? 0, richiesti: q };
      }
      if (!c) continue;
      const prima = somma.get(c.chiave);
      if (prima) prima.richiesti += q; else somma.set(c.chiave, c);
    }
    return [...somma.values()];
  }

  /**
   * Prima di scrivere una consegna: c'è la merce? Se no, 400 con i nomi e i
   * pezzi. `forza` (solo ufficio) lascia passare e il saldo va sotto zero.
   */
  async verifica(righe: RigaStock[], forza = false): Promise<void> {
    if (forza) return;
    const poche = (await this.controllate(righe)).filter((c) => c.stock < c.richiesti);
    if (!poche.length) return;
    throw new BadRequestException(
      'Giacenza insufficiente: ' + poche.map((c) => `«${c.nome}» disponibili ${c.stock}, richiesti ${c.richiesti}`).join('; ')
      + ". La merce si carica dal form prodotto (Giacenza); l'ufficio può forzare la consegna.",
    );
  }

  /** La consegna impegna la merce: saldo giù e riga di movimento per ogni prodotto controllato. */
  async scala(deliveryId: string, righe: RigaStock[], userId?: string | null, motivo = 'consegna'): Promise<number> {
    const voci = await this.controllate(righe);
    if (!voci.length) return 0;
    await this.prisma.$transaction(async (tx) => {
      for (const c of voci) {
        if (c.tipo === 'variante') await tx.productVariant.update({ where: { id: c.id }, data: { stock: { decrement: c.richiesti } } });
        else await tx.product.update({ where: { id: c.id }, data: { stock: { decrement: c.richiesti } } });
        await tx.stockMovement.create({
          data: {
            productId: c.productId,
            productVariantId: c.tipo === 'variante' ? c.id : null,
            deliveryId,
            quantity: -c.richiesti,
            reason: motivo,
            note: `${c.nome}: ${c.stock} → ${c.stock - c.richiesti}`,
            userId: userId ?? null,
          },
        });
      }
      await tx.delivery.update({ where: { id: deliveryId }, data: { stockConsumed: true, stockReturned: false } });
    });
    return voci.length;
  }

  /**
   * La merce torna in magazzino (annullata, non accettata, invalidata, non
   * consegnata, righe cambiate). Solo se la consegna aveva scalato e non ha
   * già reso: due rientri per lo stesso annullamento non esistono.
   */
  async rientra(deliveryId: string, motivo: string, userId?: string | null): Promise<number> {
    const d = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
      select: {
        stockConsumed: true, stockReturned: true,
        products: { select: { productId: true, productVariantId: true, quantity: true } },
      },
    });
    if (!d || !d.stockConsumed || d.stockReturned) return 0;
    const righe = d.products.filter((r) => r.productId) as RigaStock[];
    const voci = await this.controllate(righe);
    await this.prisma.$transaction(async (tx) => {
      for (const c of voci) {
        if (c.tipo === 'variante') await tx.productVariant.update({ where: { id: c.id }, data: { stock: { increment: c.richiesti } } });
        else await tx.product.update({ where: { id: c.id }, data: { stock: { increment: c.richiesti } } });
        await tx.stockMovement.create({
          data: {
            productId: c.productId,
            productVariantId: c.tipo === 'variante' ? c.id : null,
            deliveryId,
            quantity: c.richiesti,
            reason: 'rientro:' + motivo,
            note: `${c.nome}: ${c.stock} → ${c.stock + c.richiesti}`,
            userId: userId ?? null,
          },
        });
      }
      await tx.delivery.update({ where: { id: deliveryId }, data: { stockReturned: true } });
    });
    return voci.length;
  }

  /** Correzione a mano dal form prodotto: il saldo cambia e resta scritto perché. */
  async rettifica(productId: string, prima: number | null | undefined, dopo: number | null | undefined, userId?: string | null, note?: string): Promise<void> {
    const a = prima ?? 0;
    const b = dopo ?? 0;
    if (a === b) return;
    await this.prisma.stockMovement.create({
      data: { productId, quantity: b - a, reason: 'rettifica', note: note ?? `giacenza ${a} → ${b}`, userId: userId ?? null },
    });
  }

  async movimenti(productId: string, limite = 100) {
    return this.prisma.stockMovement.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(500, Math.max(1, limite)),
    });
  }
}

@ApiTags('stock')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.OPERATION, Role.PROJECT_MANAGER)
@Controller('stock')
export class StockController {
  constructor(private readonly service: StockService) {}

  @Get('movimenti')
  @ApiOperation({ summary: 'I movimenti di magazzino di un prodotto (consegne, rientri, rettifiche), dal più recente' })
  movimenti(@Query('productId') productId: string, @Query('limite') limite?: string) {
    if (!productId) throw new BadRequestException('productId obbligatorio');
    return this.service.movimenti(productId, limite ? Number(limite) : undefined);
  }
}

@Module({
  controllers: [StockController],
  providers: [StockService],
  exports: [StockService],
})
export class StockModule {}
