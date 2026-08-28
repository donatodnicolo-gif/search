import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  Body,
  Controller,
  Module,
  NotFoundException,
  Param,
  Post,
  Req,
  UnauthorizedException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsModule, SettingsService } from '../settings/settings.module';
import { Public, Roles } from '../common/decorators';
import { PaymentStatus, PaymentType, Role, SalaryStatus } from '../common/enums';

// Deluxy Transactions — il collettore unico delle richieste di pagamento
// (28/08/2026). La piattaforma NON paga i valet: chiede. Uno stipendio
// APPROVED (ricevuta firmata) si inoltra come richiesta firmata HMAC; una
// persona autorizza in Transactions; l'esito torna sul webhook qui sotto e
// SOLO quello scrive PAID. Idem per i rimborsi/reclami approvati.
//
// Contratto (docs/API.md di deluxy-transactions): chiave `x-api-key` + firma
// HMAC-SHA256 di `metodo\npercorso\ntimestamp\nnonce\nsha256(corpo)`;
// idempotenza su `riferimentoEsterno` (`salary-<id>` / `payment-<id>`);
// esiti firmati con lo stesso segreto su `timestamp\nsha256(corpo)`.

const BASE_DEFAULT = 'https://deluxy-transactions.vercel.app';

/** Checksum IBAN mod-97 (ISO 7064): l'IBAN del valet si legge dall'anagrafica
 *  SERVER-side e si verifica PRIMA di chiedere un bonifico. */
export function ibanValido(grezzo: string): boolean {
  const v = (grezzo ?? '').replace(/[\s-]/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/.test(v)) return false;
  const riordinato = v.slice(4) + v.slice(0, 4);
  let resto = 0;
  for (const ch of riordinato) {
    const n = ch >= '0' && ch <= '9' ? ch : String(ch.charCodeAt(0) - 55);
    for (const cifra of n) resto = (resto * 10 + Number(cifra)) % 97;
  }
  return resto === 1;
}

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  private async config() {
    const base = (
      (await this.settings.get('transactionsUrl')) ??
      process.env.TRANSACTIONS_URL ??
      BASE_DEFAULT
    ).replace(/\/+$/, '');
    const chiave = ((await this.settings.get('transactionsApiKey')) ?? process.env.TRANSACTIONS_API_KEY ?? '').trim();
    const segreto = (
      (await this.settings.get('transactionsHmacSecret')) ??
      process.env.TRANSACTIONS_HMAC_SECRET ??
      ''
    ).trim();
    return { base, chiave, segreto };
  }

  private async chiamataFirmata(
    metodo: 'GET' | 'POST',
    percorso: string,
    corpoOggetto?: unknown,
    idempotenza?: string,
  ): Promise<{ stato: number; dati: Record<string, unknown> | null }> {
    const { base, chiave, segreto } = await this.config();
    if (!chiave || !segreto) {
      throw new ServiceUnavailableException(
        'Transactions non configurata: mancano chiave e segreto (Impostazioni o env TRANSACTIONS_API_KEY / TRANSACTIONS_HMAC_SECRET).',
      );
    }
    const corpo = corpoOggetto ? JSON.stringify(corpoOggetto) : '';
    const timestamp = String(Date.now());
    const nonce = randomUUID();
    const impronta = createHash('sha256').update(corpo).digest('hex');
    const firma = createHmac('sha256', segreto)
      .update([metodo, percorso, timestamp, nonce, impronta].join('\n'))
      .digest('hex');
    const res = await fetch(`${base}${percorso}`, {
      method: metodo,
      headers: {
        'content-type': 'application/json',
        'x-api-key': chiave,
        'x-deluxy-timestamp': timestamp,
        'x-deluxy-nonce': nonce,
        'x-deluxy-signature': `sha256=${firma}`,
        ...(idempotenza ? { 'x-idempotency-key': idempotenza } : {}),
      },
      ...(corpo ? { body: corpo } : {}),
      signal: AbortSignal.timeout(15000),
    });
    return { stato: res.status, dati: (await res.json().catch(() => null)) as Record<string, unknown> | null };
  }

  /** Lo stipendio APPROVED diventa una richiesta di pagamento. */
  async richiediPagamentoStipendio(salaryId: string) {
    const salary = await this.prisma.salary.findUnique({
      where: { id: salaryId },
      include: { valet: true, receipts: true },
    });
    if (!salary) throw new NotFoundException('Stipendio non trovato');
    if (salary.status === SalaryStatus.PAID) throw new BadRequestException('Stipendio già pagato.');
    if (salary.status !== SalaryStatus.APPROVED) {
      throw new BadRequestException('Si chiede il pagamento solo di uno stipendio APPROVATO (ricevuta firmata).');
    }
    // ⚠️ L'IBAN si legge QUI, dall'anagrafica, mai dal client (Legge 2).
    const iban = (salary.valet.iban ?? '').replace(/[\s-]/g, '').toUpperCase();
    if (!iban) {
      throw new BadRequestException('Il valet non ha un IBAN in anagrafica: aggiungilo nella sua scheda.');
    }
    if (!ibanValido(iban)) {
      throw new BadRequestException("L'IBAN in anagrafica non passa il controllo di checksum: correggilo prima di chiedere il pagamento.");
    }
    const importo = Math.round(salary.netAmount * 100) / 100;
    if (!(importo > 0)) throw new BadRequestException('Importo dello stipendio non positivo.');

    const fmt = (d: Date) =>
      `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    const ricevuta = salary.receipts.find((r) => r.signed) ?? salary.receipts[0];
    const beneficiario = `${salary.valet.firstName} ${salary.valet.lastName}`.trim();
    const riferimentoEsterno = `salary-${salary.id}`;

    const { stato, dati } = await this.chiamataFirmata(
      'POST',
      '/api/v1/richieste',
      {
        importo: importo.toFixed(2),
        beneficiario: beneficiario.slice(0, 120),
        iban,
        causale: `Stipendio valet ${beneficiario} ${fmt(salary.periodStart)}-${fmt(salary.periodEnd)}${ricevuta ? ` ${ricevuta.number}` : ''}`.slice(0, 140),
        categoria: 'valet',
        riferimentoEsterno,
      },
      riferimentoEsterno,
    );
    if (stato !== 200 && stato !== 201) {
      const msg = String(dati?.errore ?? `Transactions ha risposto ${stato}`);
      await this.prisma.salary.update({ where: { id: salaryId }, data: { richiestaEsito: msg.slice(0, 300) } });
      throw new BadRequestException(`Richiesta non inviata: ${msg}`);
    }
    return this.prisma.salary.update({
      where: { id: salaryId },
      data: {
        richiestaRif: String(dati?.riferimento ?? ''),
        richiestaStato: String(dati?.stato ?? 'in_attesa'),
        richiestaIl: new Date(),
        richiestaEsito: null,
      },
    });
  }

  /** Un rimborso/reclamo APPROVED diventa una richiesta di pagamento. */
  async richiediPagamentoRimborso(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId }, include: { valet: true } });
    if (!payment) throw new NotFoundException('Pagamento non trovato');
    if (payment.status === PaymentStatus.PAID) throw new BadRequestException('Già pagato.');
    if (payment.status !== PaymentStatus.APPROVED) {
      throw new BadRequestException('Si chiede il pagamento solo di un rimborso APPROVATO.');
    }
    if (payment.type === PaymentType.SALARY) {
      throw new BadRequestException('Gli stipendi si chiedono dalla loro scheda, non da qui.');
    }
    const iban = (payment.valet.iban ?? '').replace(/[\s-]/g, '').toUpperCase();
    if (!iban || !ibanValido(iban)) {
      throw new BadRequestException('IBAN del valet mancante o non valido in anagrafica.');
    }
    const beneficiario = `${payment.valet.firstName} ${payment.valet.lastName}`.trim();
    const riferimentoEsterno = `payment-${payment.id}`;
    const { stato, dati } = await this.chiamataFirmata(
      'POST',
      '/api/v1/richieste',
      {
        importo: (Math.round(payment.amount * 100) / 100).toFixed(2),
        beneficiario: beneficiario.slice(0, 120),
        iban,
        causale: `${payment.type === PaymentType.REIMBURSEMENT ? 'Rimborso' : 'Reclamo'} valet ${beneficiario}${payment.description ? ` - ${payment.description}` : ''}`.slice(0, 140),
        categoria: 'valet',
        riferimentoEsterno,
      },
      riferimentoEsterno,
    );
    if (stato !== 200 && stato !== 201) {
      const msg = String(dati?.errore ?? `Transactions ha risposto ${stato}`);
      await this.prisma.payment.update({ where: { id: paymentId }, data: { richiestaEsito: msg.slice(0, 300) } });
      throw new BadRequestException(`Richiesta non inviata: ${msg}`);
    }
    return this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        richiestaRif: String(dati?.riferimento ?? ''),
        richiestaStato: String(dati?.stato ?? 'in_attesa'),
        richiestaIl: new Date(),
        richiestaEsito: null,
      },
    });
  }

  /** Firma del webhook: fail-closed, finestra ±5′ sul timestamp dell'header. */
  async notificaAutentica(corpoGrezzo: Buffer, timestamp: string, firma: string): Promise<boolean> {
    const { segreto } = await this.config();
    if (!segreto) return false;
    const ts = Number(timestamp);
    if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > 5 * 60_000) return false;
    const impronta = createHash('sha256').update(corpoGrezzo).digest('hex');
    const attesa = createHmac('sha256', segreto).update(`${timestamp}\n${impronta}`).digest('hex');
    const a = Buffer.from(attesa);
    const b = Buffer.from(firma);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /**
   * L'esito da Transactions. IDEMPOTENTE e ATOMICO: `updateMany` col filtro di
   * stato ripetuto nella scrittura + `Payment` storico creato SOLO se la riga
   * è stata toccata davvero — due consegne dello stesso webhook non possono
   * contare il denaro due volte (era il buco di updateStatus, giuria 28/08).
   */
  async gestisciEsito(payload: {
    riferimentoEsterno?: string;
    riferimento?: string;
    stato?: string;
    pagataIl?: string | null;
    pagatoCon?: string | null;
    motivo?: string | null;
  }) {
    const rif = payload.riferimentoEsterno ?? '';
    const stato = payload.stato ?? '';

    if (rif.startsWith('salary-')) {
      const id = rif.slice('salary-'.length);
      await this.prisma.salary.updateMany({
        where: { id },
        data: {
          richiestaStato: stato,
          ...(payload.motivo ? { richiestaEsito: `Transactions: ${payload.motivo}`.slice(0, 300) } : {}),
        },
      });
      if (stato === 'pagata') {
        const quando = payload.pagataIl ? new Date(payload.pagataIl) : new Date();
        await this.prisma.$transaction(async (tx) => {
          const toccate = await tx.salary.updateMany({
            where: { id, status: { not: SalaryStatus.PAID } },
            data: { status: SalaryStatus.PAID, paidAt: quando },
          });
          if (toccate.count === 1) {
            const salary = await tx.salary.findUnique({ where: { id } });
            if (salary) {
              const fmt = (d: Date) =>
                `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
              await tx.payment.create({
                data: {
                  valetId: salary.valetId,
                  salaryId: salary.id,
                  type: PaymentType.SALARY,
                  amount: salary.netAmount,
                  status: PaymentStatus.PAID,
                  description: `Stipendio ${fmt(salary.periodStart)} – ${fmt(salary.periodEnd)} · pagato da Transactions (${payload.riferimento ?? ''}${payload.pagatoCon ? `, ${payload.pagatoCon}` : ''})`,
                },
              });
            }
          }
        });
      }
      return { ok: true };
    }

    if (rif.startsWith('payment-')) {
      const id = rif.slice('payment-'.length);
      await this.prisma.payment.updateMany({
        where: { id },
        data: {
          richiestaStato: stato,
          ...(payload.motivo ? { richiestaEsito: `Transactions: ${payload.motivo}`.slice(0, 300) } : {}),
        },
      });
      if (stato === 'pagata') {
        await this.prisma.payment.updateMany({
          where: { id, status: { not: PaymentStatus.PAID } },
          data: { status: PaymentStatus.PAID },
        });
      }
      return { ok: true };
    }

    return { ok: true, nota: 'Riferimento non nostro: ignorata.' };
  }
}

@ApiTags('transactions')
// ⚠️ `@Roles` ESPLICITO: il RolesGuard della piattaforma è allow-by-default
// per gli autenticati — una rotta che chiede denaro senza @Roles nascerebbe
// aperta a ogni PARTNER e VALET loggato.
@Roles(Role.ADMIN)
@Controller()
export class TransactionsController {
  constructor(private readonly service: TransactionsService) {}

  @Post('salaries/:id/richiedi-pagamento')
  @ApiOperation({ summary: 'Inoltra lo stipendio APPROVED a Deluxy Transactions come richiesta di pagamento' })
  richiediStipendio(@Param('id') id: string) {
    return this.service.richiediPagamentoStipendio(id);
  }

  @Post('payments/:id/richiedi-pagamento')
  @ApiOperation({ summary: 'Inoltra un rimborso/reclamo APPROVED a Deluxy Transactions' })
  richiediRimborso(@Param('id') id: string) {
    return this.service.richiediPagamentoRimborso(id);
  }
}

@ApiTags('transactions')
@Controller('transactions')
export class TransactionsEsitoController {
  constructor(private readonly service: TransactionsService) {}

  // Fuori dal JWT utente: l'autenticazione è la FIRMA HMAC, verificata
  // fail-closed sul corpo grezzo prima di leggerne il contenuto.
  @Public()
  @Post('esito')
  @ApiOperation({ summary: 'Webhook degli esiti da Deluxy Transactions (firmato HMAC)' })
  async esito(@Req() req: RawBodyRequest<Request>, @Body() body: Record<string, unknown>) {
    const grezzo = req.rawBody;
    if (!grezzo) throw new ServiceUnavailableException('Corpo grezzo non disponibile: rawBody spento.');
    const timestamp = String(req.headers['x-deluxy-timestamp'] ?? '');
    const firma = String(req.headers['x-deluxy-signature'] ?? '').replace(/^sha256=/i, '').trim();
    if (!timestamp || !firma || !(await this.service.notificaAutentica(grezzo, timestamp, firma))) {
      throw new UnauthorizedException('Firma non valida.');
    }
    return this.service.gestisciEsito(body as Parameters<TransactionsService['gestisciEsito']>[0]);
  }
}

@Module({
  imports: [PrismaModule, SettingsModule],
  providers: [TransactionsService],
  controllers: [TransactionsController, TransactionsEsitoController],
  exports: [TransactionsService],
})
export class TransactionsModule {}
