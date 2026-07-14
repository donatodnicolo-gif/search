import {
  Body,
  Controller,
  Headers,
  Injectable,
  Module,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators';
import { DeliveryStatus } from '../common/enums';
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
  controllers: [WoocommerceController],
  providers: [WoocommerceService],
})
export class WoocommerceModule {}
