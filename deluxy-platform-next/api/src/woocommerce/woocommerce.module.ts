import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Injectable,
  Logger,
  Module,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtUser, Public } from '../common/decorators';
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
  constructor(private readonly prisma: PrismaService) {}

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

  async ricevi(chiave: string | undefined, p: WooLegacyPayload) {
    const k = (chiave ?? '').trim();
    if (!k) throw new UnauthorizedException('Chiave partner mancante (header x-deluxy-partner-key)');
    const partner = await this.prisma.partner.findUnique({
      where: { woocommerceApiKey: k },
      include: { services: { include: { serviceType: { select: { id: true, name: true, pricingModel: true } } } } },
    });
    if (!partner || !partner.active) throw new UnauthorizedException('Chiave partner non valida');
    const ordine = String(p.orderId ?? p.ddtNumber ?? '').trim();
    if (!ordine) throw new BadRequestException('orderId mancante');
    if (!(p.address ?? '').trim()) throw new BadRequestException('address mancante');

    // Idempotente: il plugin non ritenta, ma un checkout ricaricato può
    // rimandare lo stesso ordine. Stesso partner + stesso DDT = stessa consegna.
    const esistente = await this.prisma.delivery.findFirst({
      where: { partnerId: partner.id, deletedAt: null, ddtNumber: ordine, notes: { contains: '[WooCommerce #' } },
      select: { id: true, code: true },
    });
    if (esistente) return { status: true, deliveryId: esistente.code, statusCode: 200, giaRicevuto: true };

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
    return { status: true, deliveryId: d.code, statusCode: 201 };
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
  controllers: [WoocommerceController, WooLegacyController],
  providers: [WoocommerceService, WooLegacyService],
})
export class WoocommerceModule {}
