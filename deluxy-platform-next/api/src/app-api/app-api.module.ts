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

    // Quanto va al partner: l'importo meno lo sconto che riconosce a Deluxy,
    // CRISTALLIZZATO sulla vendita alla nascita (non il listino di oggi).
    const costoPartner =
      Math.round(s.amount * (1 - s.discountPercent / 100) * 100) / 100;

    return {
      vendita: {
        id: s.id,
        stato: s.status, // da_gestire | proposta | accettata | non_accettata | annullata
        importo: s.amount,
        scontoPercento: s.discountPercent,
        costoPartner,
        partner: s.partner ? { id: s.partner.id, insegna: s.partner.insegna } : null,
        provincia: s.province?.code ?? null,
        prodotto: s.product
          ? { id: s.product.id, nome: s.product.name, tipo: s.product.type }
          : null,
        creataIl: s.createdAt.toISOString(),
        aggiornataIl: s.updatedAt.toISOString(),
      },
      // La consegna nata dall'accettazione, se c'è. `null` = non ancora nata:
      // è un'informazione, non un errore.
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
}

@ApiTags('app — canale app-to-app (chiave, non sessione)')
@Controller('app')
@Public() // fuori dal JWT utente: l'autenticazione è la chiave del guard
@UseGuards(AppApiKeyGuard)
export class AppApiController {
  constructor(private readonly service: AppApiService) {}

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
