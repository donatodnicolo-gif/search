import { createHash } from 'crypto';
import {
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';

// ─────────────────────────────────────────────────────────────────────────────
// IL CANALE APP-TO-APP della piattaforma (standard Deluxy §4.3 e §7).
//
// Le altre app Deluxy non hanno una sessione utente: si presentano con una
// chiave (`x-api-key`, in alternativa `Authorization: Bearer`) creata con
// `api/scripts/crea-chiave-app.mjs`. Nel database vive SOLO lo SHA-256.
//
// Prima rotta: lo stato di una VENDITA smistata, cercata per riferimento
// esterno (`source` + `externalOrderId`). La legge Deluxy Orders nel suo cron
// per il ritorno del giro dell'ordine: se il partner ha accettato, quanto gli
// va (importo meno lo sconto cristallizzato), se la consegna è nata e com'è
// finita. Senza questa rotta il ciclo proposta→accettazione resterebbe
// invisibile fuori dalla piattaforma, e il margine in Orders senza ingredienti.
//
// Le rotte stanno sotto `/api/v1/app/…`: il prefisso dice il canale, e il
// guard è UNO per tutto il controller — una rotta aggiunta domani non può
// nascere senza chiave per dimenticanza.
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class AppApiKeyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const grezza =
      (req.headers['x-api-key'] as string | undefined)?.trim() ||
      (req.headers['authorization'] as string | undefined)
        ?.replace(/^Bearer\s+/i, '')
        .trim();
    if (!grezza) {
      throw new UnauthorizedException('Chiave API mancante (header x-api-key).');
    }
    // Si confronta lo SHA-256, mai il valore: la ricerca per hash è anche un
    // confronto a tempo costante di fatto (indice unico, nessun ===
    // carattere per carattere sulla chiave in chiaro).
    const hash = createHash('sha256').update(grezza).digest('hex');
    const record = await this.prisma.appApiKey.findUnique({ where: { hash } });
    if (!record || !record.attiva) {
      throw new UnauthorizedException('Chiave API non valida o disattivata.');
    }
    // Traccia d'uso best-effort: un fallimento qui non deve negare la risposta.
    void this.prisma.appApiKey
      .update({ where: { id: record.id }, data: { ultimoUso: new Date() } })
      .catch(() => undefined);
    req.appChiave = { nome: record.nome, scrittura: record.scrittura };
    return true;
  }
}

@Injectable()
export class AppApiService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Le vendite di una sorgente aggiornate da un momento in poi: è la rotta del
   * PULL incrementale di Deluxy Orders (una chiamata a giro di cron, non una
   * per ordine). Il formato di ogni voce è lo stesso del by-ref.
   */
  async venditeAggiornate(source: string, aggiornateDa: string | undefined, limite: number) {
    const da = aggiornateDa ? new Date(aggiornateDa) : null;
    if (aggiornateDa && Number.isNaN(da?.getTime())) {
      throw new NotFoundException('aggiornateDa non è una data ISO valida.');
    }
    const vendite = await this.prisma.sale.findMany({
      where: { source, ...(da ? { updatedAt: { gte: da } } : {}) },
      orderBy: { updatedAt: 'asc' },
      take: Math.min(200, Math.max(1, limite)),
      include: {
        partner: { select: { id: true, insegna: true } },
        province: { select: { code: true } },
        product: { select: { id: true, name: true, type: true } },
      },
    });
    const consegne = new Map(
      (
        await this.prisma.delivery.findMany({
          where: { id: { in: vendite.map((s) => s.deliveryId).filter((x): x is string => !!x) } },
          select: {
            id: true,
            status: true,
            date: true,
            deliveryTimeFrom: true,
            deliveryTimeTo: true,
            valetId: true,
          },
        })
      ).map((d) => [d.id, d]),
    );
    return {
      totale: vendite.length,
      vendite: vendite.map((s) => this.serializza(s, s.deliveryId ? consegne.get(s.deliveryId) ?? null : null)),
    };
  }

  private serializza(
    s: {
      id: string;
      status: string;
      amount: number;
      discountPercent: number;
      externalOrderId: string | null;
      partner: { id: string; insegna: string | null } | null;
      province: { code: string } | null;
      product: { id: string; name: string; type: string } | null;
      createdAt: Date;
      updatedAt: Date;
    },
    consegna: {
      id: string;
      status: string;
      date: Date | null;
      deliveryTimeFrom: string | null;
      deliveryTimeTo: string | null;
      valetId: string | null;
    } | null,
  ) {
    const costoPartner = Math.round(s.amount * (1 - s.discountPercent / 100) * 100) / 100;
    return {
      vendita: {
        id: s.id,
        riferimentoEsterno: s.externalOrderId,
        stato: s.status,
        importo: s.amount,
        scontoPercento: s.discountPercent,
        costoPartner,
        partner: s.partner ? { id: s.partner.id, insegna: s.partner.insegna } : null,
        provincia: s.province?.code ?? null,
        prodotto: s.product ? { id: s.product.id, nome: s.product.name, tipo: s.product.type } : null,
        creataIl: s.createdAt.toISOString(),
        aggiornataIl: s.updatedAt.toISOString(),
      },
      consegna: consegna
        ? {
            id: consegna.id,
            stato: consegna.status,
            data: consegna.date ? consegna.date.toISOString() : null,
            fascia:
              consegna.deliveryTimeFrom && consegna.deliveryTimeTo
                ? `${consegna.deliveryTimeFrom}-${consegna.deliveryTimeTo}`
                : null,
            conValet: Boolean(consegna.valetId),
          }
        : null,
    };
  }

  /** Lo stato di una vendita smistata, per il riferimento esterno. */
  async venditaByRef(source: string, externalOrderId: string) {
    const s = await this.prisma.sale.findFirst({
      where: { source, externalOrderId },
      include: {
        partner: { select: { id: true, insegna: true } },
        province: { select: { code: true } },
        product: { select: { id: true, name: true, type: true } },
      },
    });
    if (!s) {
      throw new NotFoundException(
        `Nessuna vendita con riferimento ${source}/${externalOrderId}.`,
      );
    }
    const consegna = s.deliveryId
      ? await this.prisma.delivery.findUnique({
          where: { id: s.deliveryId },
          select: {
            id: true,
            status: true,
            date: true,
            deliveryTimeFrom: true,
            deliveryTimeTo: true,
            valetId: true,
          },
        })
      : null;
    // Stesso formato della lista: chi consuma non deve imparare due dialetti.
    return this.serializza(s, consegna);
  }
}

@ApiTags('app — canale app-to-app (chiave, non sessione)')
@Controller('app')
@Public() // fuori dal JWT utente: l'autenticazione è la chiave del guard
@UseGuards(AppApiKeyGuard)
export class AppApiController {
  constructor(private readonly service: AppApiService) {}

  @Get('vendite')
  @ApiOperation({
    summary:
      'Vendite di una sorgente aggiornate da un momento in poi (il pull incrementale di Deluxy Orders)',
  })
  @ApiHeader({ name: 'x-api-key', description: 'Chiave app (scripts/crea-chiave-app.mjs)' })
  vendite(
    @Query('source') source = 'deluxy-orders',
    @Query('aggiornateDa') aggiornateDa?: string,
    @Query('limit') limit = '200',
  ) {
    return this.service.venditeAggiornate(source, aggiornateDa, Number(limit) || 200);
  }

  @Get('vendite/by-ref/:source/:externalOrderId')
  @ApiOperation({
    summary:
      'Stato di una vendita smistata, per riferimento esterno (la legge Deluxy Orders per consegna e margine)',
  })
  @ApiHeader({ name: 'x-api-key', description: 'Chiave app (scripts/crea-chiave-app.mjs)' })
  venditaByRef(
    @Param('source') source: string,
    @Param('externalOrderId') externalOrderId: string,
  ) {
    return this.service.venditaByRef(source, externalOrderId);
  }
}

@Module({
  controllers: [AppApiController],
  providers: [AppApiKeyGuard, AppApiService],
})
export class AppApiModule {}
