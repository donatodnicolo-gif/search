import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Injectable,
  Logger,
  Get,
  Module,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtUser, Public, Roles } from '../common/decorators';
import { DeliveryStatus, Role } from '../common/enums';
import { DeliveriesModule } from '../deliveries/deliveries.module';
import { DeliveriesService } from '../deliveries/deliveries.service';

/**
 * ⭐ 06/09/2026 (regola utente «Procedi»): il CONTRATTO DEL VECCHIO PLUGIN.
 * Il plugin WordPress `deluxy-send-order` (v1.0.0) installato sui siti dei
 * partner (Clivati, Martesana) manda ancora, al checkout, una POST a
 * `https://app.deluxy.it/api/deliveries/sync/woo-order` con la chiave del
 * partner nell'header `x-deluxy-partner-key` e questo corpo — e non ritenta.
 * Quel dominio oggi serve QUESTA app: senza la rotta gli ordini si perdevano
 * (405). Si replica il contratto così com'è, per non toccare i siti.
 * Analisi del plugin: docs/INTEGRAZIONE-WOOCOMMERCE-SYNC.md.
 */
interface WooLegacyPayload {
  ddtNumber?: string | number;
  orderId?: string | number;
  name?: string;
  surname?: string;
  email?: string;
  smsPhoneNo?: string;
  deliveryProducts?: { productName?: string; quantity?: number; sku?: string; price?: number; categoryName?: string }[];
  deliveryDate?: string;
  address?: string;
  intercom?: string;
  startTime?: string;
  endTime?: string;
  notes?: string;
  senderName?: string;
  senderSurname?: string;
  senderPhone?: string;
  pickUpTime?: string;
  externalOrderSource?: string;
  province?: string | null;
}
import { PrismaService } from '../prisma/prisma.service';

interface WooOrderPayload {
  orderId: string;
  date?: string;
  recipient: {
    firstName: string;
    lastName: string;
    address: string;
    phone?: string;
    intercom?: string;
  };
  serviceTypeCode?: string;
  notes?: string;
  items?: { name?: string; productId?: string; quantity?: number }[];
}

@Injectable()
export class WoocommerceService {
  constructor(
    private readonly prisma: PrismaService,
    // Serve solo a misurare la distanza ritiro -> consegna (10/09): senza,
    // gli ordini dal sito del partner nascevano senza km e la paga del valet
    // perdeva gli extra km.
    private readonly deliveries: DeliveriesService,
  ) {}

  /**
   * Riceve un ordine dal plugin WooCommerce "deluxy-send-order".
   * L'autenticazione avviene con l'API key del partner (header x-api-key):
   * ogni partner ha la propria chiave configurata in anagrafica.
   * L'ordine genera una consegna in stato "created" (da gestire).
   */
  async receiveOrder(apiKey: string | undefined, payload: WooOrderPayload) {
    if (!apiKey) throw new UnauthorizedException('API key mancante (header x-api-key)');
    const partner = await this.prisma.partner.findUnique({
      where: { woocommerceApiKey: apiKey },
    });
    if (!partner || !partner.active) {
      throw new UnauthorizedException('API key non valida');
    }

    const serviceType = payload.serviceTypeCode
      ? await this.prisma.serviceType.findUnique({
          where: { code: payload.serviceTypeCode },
        })
      : await this.prisma.serviceType.findFirst({
          where: { pricingModel: 'PREZZO_FISSO' },
        });
    if (!serviceType) throw new UnauthorizedException('Tipo di servizio non configurato');

    const productIds = (payload.items ?? [])
      .filter((i) => i.productId)
      .map((i) => ({ productId: i.productId!, quantity: i.quantity ?? 1 }));

    const last = await this.prisma.delivery.aggregate({ _max: { code: true } });
    const kmMisurati = await this.deliveries.distanzaMisurata(
      partner.address,
      payload.recipient.address,
    );

    const delivery = await this.prisma.delivery.create({
      data: {
        code: (last._max.code ?? 0) + 1,
        date: payload.date ? new Date(payload.date) : new Date(),
        serviceTypeId: serviceType.id,
        partnerId: partner.id,
        status: DeliveryStatus.CREATED,
        recipientFirstName: payload.recipient.firstName,
        recipientLastName: payload.recipient.lastName,
        recipientAddress: payload.recipient.address,
        recipientPhone: payload.recipient.phone,
        recipientIntercom: payload.recipient.intercom,
        notes: payload.notes
          ? `[WooCommerce #${payload.orderId}] ${payload.notes}`
          : `[WooCommerce #${payload.orderId}]`,
        pickupAddress: partner.address,
        ...(kmMisurati != null ? { distanceKm: kmMisurati } : {}),
        products: productIds.length ? { create: productIds } : undefined,
        logs: {
          create: {
            type: 'created',
            message: `Ordine WooCommerce #${payload.orderId} ricevuto via API`,
          },
        },
      },
    });
    return { deliveryId: delivery.id, code: delivery.code, status: delivery.status };
  }
}

/** La rotta del vecchio contratto: stesso indirizzo, header e corpo del plugin. */
@Injectable()
export class WooLegacyService {
  private readonly logger = new Logger(WooLegacyService.name);
  constructor(private readonly prisma: PrismaService, private readonly deliveries: DeliveriesService) {}

  private static orario(v?: string | null): string | undefined {
    const m = /^([01]\d|2[0-3]):([0-5]\d)/.exec((v ?? '').trim());
    return m ? `${m[1]}:${m[2]}` : undefined;
  }

  /**
   * ⭐⭐ 13/09/2026 (regola utente, dopo il caso Clivati) — SI SEGNA OGNI CHIAMATA, ANCHE QUELLE
   * RESPINTE.
   *
   * Prima si vedeva solo ciò che era andato a buon fine: una consegna nata. Se il plugin chiamava e
   * prendeva 401 — chiave cambiata, sandbox accesa, partner spento — di qui non se ne sapeva niente,
   * e la domanda «ci è arrivato l'ordine?» costava un'indagine invece di dieci secondi.
   *
   * ⚠️ Non si registra il corpo né la chiave: la chiave è una credenziale (restano le ultime quattro
   * lettere, che bastano a dire «è quella vecchia») e il corpo porta nome, indirizzo e telefono di un
   * cliente. Un registro tecnico non è un archivio di dati personali.
   * ⚠️ Se il registro non riesce a scrivere, la consegna si fa lo stesso: un diario che blocca il
   * lavoro che dovrebbe raccontare è peggio di nessun diario.
   */
  private async segna(dati: {
    esito: string; chiave?: string; partnerId?: string | null; insegna?: string | null;
    ordine?: string | null; sito?: string | null; consegna?: number | null; motivo?: string | null;
  }): Promise<void> {
    try {
      const k = (dati.chiave ?? '').trim();
      await (this.prisma as unknown as { arrivoWoo: { create: (a: unknown) => Promise<unknown> } }).arrivoWoo.create({
        data: {
          esito: dati.esito,
          partnerId: dati.partnerId ?? null,
          insegna: dati.insegna ?? null,
          chiaveFine: k ? k.slice(-4) : null,
          ordine: dati.ordine ?? null,
          sito: dati.sito ?? null,
          consegna: dati.consegna ?? null,
          motivo: dati.motivo ?? null,
        },
      });
    } catch (e) {
      this.logger?.warn?.(`Registro arrivi WooCommerce non scritto: ${(e as Error).message}`);
    }
  }

  async ricevi(chiave: string | undefined, p: WooLegacyPayload) {
    const k = (chiave ?? '').trim();
    const sito = (p as { externalOrderSource?: string | null }).externalOrderSource ?? null;
    const ordineChiesto = String(p.orderId ?? p.ddtNumber ?? '').trim() || null;
    if (!k) {
      await this.segna({ esito: 'chiave-mancante', ordine: ordineChiesto, sito, motivo: 'header x-deluxy-partner-key assente' });
      throw new UnauthorizedException('Chiave partner mancante (header x-deluxy-partner-key)');
    }
    const partner = await this.prisma.partner.findUnique({
      where: { woocommerceApiKey: k },
      include: { services: { include: { serviceType: { select: { id: true, name: true, pricingModel: true } } } } },
    });
    if (!partner || !partner.active) {
      await this.segna({
        esito: 'chiave-non-valida', chiave: k, ordine: ordineChiesto, sito,
        partnerId: partner?.id ?? null, insegna: partner?.insegna ?? null,
        motivo: partner ? 'partner spento' : 'nessun partner con questa chiave',
      });
      throw new UnauthorizedException('Chiave partner non valida');
    }
    const ordine = String(p.orderId ?? p.ddtNumber ?? '').trim();
    if (!ordine) {
      await this.segna({ esito: 'dati-mancanti', chiave: k, partnerId: partner.id, insegna: partner.insegna, sito, motivo: 'orderId mancante' });
      throw new BadRequestException('orderId mancante');
    }
    if (!(p.address ?? '').trim()) {
      await this.segna({ esito: 'dati-mancanti', chiave: k, partnerId: partner.id, insegna: partner.insegna, ordine, sito, motivo: 'address mancante' });
      throw new BadRequestException('address mancante');
    }

    // Idempotente: il plugin non ritenta, ma un checkout ricaricato può
    // rimandare lo stesso ordine. Stesso partner + stesso DDT = stessa consegna.
    const esistente = await this.prisma.delivery.findFirst({
      where: { partnerId: partner.id, deletedAt: null, ddtNumber: ordine, notes: { contains: '[WooCommerce #' } },
      select: { id: true, code: true },
    });
    if (esistente) {
      await this.segna({ esito: 'duplicato', chiave: k, partnerId: partner.id, insegna: partner.insegna, ordine, sito, consegna: esistente.code, motivo: 'stesso ordine già ricevuto' });
      return { status: true, deliveryId: esistente.code, statusCode: 200, giaRicevuto: true };
    }

    // Il servizio: il listino del partner a PREZZO FISSO («consegna» se c'è),
    // altrimenti un servizio a prezzo fisso del catalogo. Il prezzo lo mette
    // `create` dal listino, come per una consegna scritta a mano dal partner.
    const fissi = (partner.services ?? []).filter((s: any) => s.serviceType?.pricingModel === 'PREZZO_FISSO');
    const scelto = fissi.find((s: any) => /consegn/i.test(s.serviceType?.name ?? '')) ?? fissi[0];
    const serviceTypeId: string | undefined = scelto?.serviceTypeId ?? scelto?.serviceType?.id
      ?? (await this.prisma.serviceType.findFirst({ where: { pricingModel: 'PREZZO_FISSO' }, orderBy: { name: 'asc' }, select: { id: true } }))?.id;
    if (!serviceTypeId) throw new BadRequestException('Nessun servizio a prezzo fisso disponibile per il partner');

    // I prodotti: per SKU sul catalogo del partner (varianti, poi prodotti);
    // quello che non si trova resta scritto nelle note, non sparisce.
    const righe = Array.isArray(p.deliveryProducts) ? p.deliveryProducts : [];
    const skus = [...new Set(righe.map((r) => String(r.sku ?? '').trim()).filter(Boolean))];
    const varianti = skus.length
      ? await this.prisma.productVariant.findMany({ where: { sku: { in: skus } }, select: { id: true, sku: true, productId: true, product: { select: { partnerId: true } } } })
      : [];
    const prodotti = skus.length
      ? await this.prisma.product.findMany({ where: { sku: { in: skus } }, select: { id: true, sku: true, partnerId: true } })
      : [];
    const mio = (pid: string | null | undefined) => pid == null || pid === partner.id;
    const products: { productId: string; productVariantId?: string; quantity: number; price?: number }[] = [];
    const nonACatalogo: string[] = [];
    for (const r of righe) {
      const sku = String(r.sku ?? '').trim();
      const q = Math.max(1, Number(r.quantity ?? 1) || 1);
      const prezzo = r.price != null && Number.isFinite(Number(r.price)) ? Number(r.price) : undefined;
      const v = sku ? varianti.find((x) => x.sku === sku && mio(x.product?.partnerId)) : undefined;
      const pr = sku ? prodotti.find((x) => x.sku === sku && mio(x.partnerId)) : undefined;
      if (v) products.push({ productId: v.productId, productVariantId: v.id, quantity: q, price: prezzo });
      else if (pr) products.push({ productId: pr.id, quantity: q, price: prezzo });
      else nonACatalogo.push(`${r.productName ?? '?'} ×${q}${sku ? ' (' + sku + ')' : ''}${prezzo != null ? ' ' + prezzo.toFixed(2) + ' €' : ''}`);
    }
    const note = [
      (p.notes ?? '').trim() || null,
      nonACatalogo.length ? 'Prodotti non a catalogo: ' + nonACatalogo.join('; ') : null,
      `[WooCommerce #${ordine}${p.externalOrderSource ? ' da ' + p.externalOrderSource : ''}]`,
    ].filter(Boolean).join('\n');

    const oggi = new Date().toISOString().slice(0, 10);
    const data = /^\d{4}-\d{2}-\d{2}$/.test((p.deliveryDate ?? '').trim()) ? p.deliveryDate!.trim() : oggi;
    const dto: any = {
      date: data,
      serviceTypeId,
      partnerId: partner.id,
      recipientFirstName: (p.name ?? '').trim() || '—',
      recipientLastName: (p.surname ?? '').trim() || '—',
      recipientAddress: (p.address ?? '').trim(),
      recipientIntercom: (p.intercom ?? '').trim() || undefined,
      recipientPhone: (p.smsPhoneNo ?? '').trim() || undefined,
      recipientEmail: (p.email ?? '').trim() || undefined,
      smsPhoneNo: (p.smsPhoneNo ?? '').trim() || undefined,
      deliveryTimeFrom: WooLegacyService.orario(p.startTime),
      deliveryTimeTo: WooLegacyService.orario(p.endTime),
      pickupTimeFrom: WooLegacyService.orario(p.pickUpTime),
      senderFirstName: (p.senderName ?? '').trim() || undefined,
      senderLastName: (p.senderSurname ?? '').trim() || undefined,
      senderPhone: (p.senderPhone ?? '').trim() || undefined,
      notes: note,
      ddtNumber: ordine,
      products: products.length ? products : undefined,
    };
    // La consegna nasce COME SE l'avesse scritta il partner: stesse regole
    // (listino, ritiro alla sua sede, verifica identità del valet, avvisi).
    const utente = {
      sub: `woocommerce:${partner.id}`,
      email: partner.email ?? 'woocommerce@deluxy.it',
      role: Role.PARTNER,
      isSupport: false,
      partnerId: partner.id,
      valetId: null,
    } as JwtUser;
    const d: any = await this.deliveries.create(dto, utente);
    this.logger.log(`WooCommerce #${ordine} di ${partner.insegna} → consegna #${d.code}${nonACatalogo.length ? ` (${nonACatalogo.length} righe non a catalogo)` : ''}`);
    await this.segna({ esito: 'created', chiave: k, partnerId: partner.id, insegna: partner.insegna, ordine, sito, consegna: d.code });
    return { status: true, deliveryId: d.code, statusCode: 201 };
  }
}

/**
 * ⭐⭐ 13/09/2026 (regola utente) — IL REGISTRO SI LEGGE DALL APP.
 *
 * Scrivere il diario e non poterlo aprire sarebbe metà lavoro: qui l ufficio vede le ultime chiamate
 * dei siti dei partner, comprese quelle respinte, e la domanda «ci è arrivato l ordine?» si chiude
 * senza aprire un terminale.
 */
@ApiTags('woocommerce')
@ApiBearerAuth()
@Controller('arrivi-woo')
export class ArriviWooController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Le ultime chiamate dai siti WooCommerce dei partner: accettate, duplicate e RESPINTE' })
  @ApiQuery({ name: 'giorni', required: false, description: 'finestra in giorni (default 14)' })
  async elenco(@Query('giorni') giorni?: string) {
    const g = Math.min(120, Math.max(1, Number(giorni) || 14));
    const da = new Date(Date.now() - g * 86_400_000);
    const righe = await (this.prisma as unknown as { arrivoWoo: { findMany: (a: unknown) => Promise<unknown[]> } })
      .arrivoWoo.findMany({ where: { quando: { gte: da } }, orderBy: { quando: 'desc' }, take: 300 });
    const conta: Record<string, number> = {};
    for (const r of righe as { esito: string }[]) conta[r.esito] = (conta[r.esito] ?? 0) + 1;
    return { giorni: g, totale: righe.length, perEsito: conta, righe };
  }
}

@ApiTags('woocommerce')
@Controller('api/deliveries/sync')
export class WooLegacyController {
  constructor(private readonly service: WooLegacyService) {}

  /** Fuori dal prefisso api/v1 (vedi `setGlobalPrefix(... exclude)` in main.ts/vercel.ts e la rotta in vercel.json). */
  @Public()
  @Post('woo-order')
  @HttpCode(200)
  @ApiOperation({ summary: 'Contratto del vecchio plugin deluxy-send-order: POST /api/deliveries/sync/woo-order (auth: x-deluxy-partner-key)' })
  @ApiHeader({ name: 'x-deluxy-partner-key', description: 'Chiave WooCommerce del partner (scheda partner)' })
  ricevi(
    @Headers('x-deluxy-partner-key') chiave: string | undefined,
    @Headers('x-api-key') chiaveAlt: string | undefined,
    @Body() payload: WooLegacyPayload,
  ) {
    return this.service.ricevi(chiave ?? chiaveAlt, payload);
  }
}

@ApiTags('woocommerce')
@Controller('woocommerce')
export class WoocommerceController {
  constructor(private readonly woocommerceService: WoocommerceService) {}

  @Public()
  @Post('orders')
  @ApiOperation({ summary: 'Riceve ordini dal plugin WooCommerce deluxy-send-order (auth: x-api-key del partner)' })
  @ApiHeader({ name: 'x-api-key', description: 'API key WooCommerce del partner' })
  receiveOrder(
    @Headers('x-api-key') apiKey: string | undefined,
    @Body() payload: WooOrderPayload,
  ) {
    return this.woocommerceService.receiveOrder(apiKey, payload);
  }
}

@Module({
  imports: [DeliveriesModule],
  controllers: [WoocommerceController, WooLegacyController, ArriviWooController],
  providers: [WoocommerceService, WooLegacyService],
})
export class WoocommerceModule {}
