import {
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtUser } from '../common/decorators';
import { ProductType, Role } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(user: JwtUser) {
    const where =
      user.role === Role.PARTNER ? { partnerId: user.partnerId ?? '-' } : {};
    return this.prisma.sale.findMany({
      where,
      include: {
        product: { select: { id: true, name: true, price: true, type: true } },
        partner: { select: { id: true, insegna: true } },
        province: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Crea una vendita e la smista al partner giusto:
   * - prodotto UNICO   -> il partner proprietario, se opera nella provincia
   *                       ed e' aperto in questo momento;
   * - prodotto NON_UNICO -> primo partner aperto nella lista priorita'
   *                       per provincia + categoria.
   * Lo sconto e' gia' incorporato nei prodotti scontati automatici
   * (arrotondati a 0/5).
   */
  async create(body: {
    productId: string;
    provinceId: string;
    brand?: string;
    customerId?: string;
    source?: string;
    externalOrderId?: string;
  }) {
    const product = await this.prisma.product.findUnique({
      where: { id: body.productId },
    });
    if (!product) throw new NotFoundException('Prodotto non trovato');

    let partnerId: string | null = null;

    if (product.type === ProductType.UNICO && product.partnerId) {
      const owner = await this.prisma.partner.findFirst({
        where: {
          id: product.partnerId,
          active: true,
          provinces: { some: { provinceId: body.provinceId } },
        },
        include: { openingHours: true },
      });
      if (owner && this.isOpenNow(owner.openingHours)) partnerId = owner.id;
    } else if (product.categoryId) {
      // Lista priorita' partner per provincia + categoria
      const candidates = await this.prisma.partnerCategory.findMany({
        where: {
          categoryId: product.categoryId,
          partner: {
            active: true,
            provinces: { some: { provinceId: body.provinceId } },
          },
        },
        include: { partner: { include: { openingHours: true } } },
        orderBy: { priority: 'asc' },
      });
      const open = candidates.find((c) => this.isOpenNow(c.partner.openingHours));
      partnerId = open?.partner.id ?? candidates[0]?.partner.id ?? null;
    }

    return this.prisma.sale.create({
      data: {
        productId: product.id,
        provinceId: body.provinceId,
        partnerId,
        customerId: body.customerId,
        brand: body.brand ?? 'DELUXY',
        amount: product.price,
        status: partnerId ? 'dispatched' : 'created',
        source: body.source ?? 'app',
        externalOrderId: body.externalOrderId,
      },
      include: {
        product: { select: { id: true, name: true } },
        partner: { select: { id: true, insegna: true } },
      },
    });
  }

  private isOpenNow(
    hours: { dayOfWeek: number; openTime: string | null; closeTime: string | null; closed: boolean }[],
  ): boolean {
    if (!hours.length) return true; // senza orari configurati: sempre aperto
    const now = new Date();
    const today = hours.filter((h) => h.dayOfWeek === now.getDay());
    if (!today.length) return false;
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    return today.some(
      (h) =>
        !h.closed &&
        h.openTime != null &&
        h.closeTime != null &&
        h.openTime <= hhmm &&
        hhmm <= h.closeTime,
    );
  }
}

@ApiTags('sales')
@ApiBearerAuth()
@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Get()
  @ApiOperation({ summary: 'Lista vendite (il partner vede le proprie)' })
  findAll(@CurrentUser() user: JwtUser) {
    return this.salesService.findAll(user);
  }

  @Post()
  @ApiOperation({ summary: 'Crea vendita con smistamento automatico al partner' })
  create(
    @Body()
    body: {
      productId: string;
      provinceId: string;
      brand?: string;
      customerId?: string;
    },
  ) {
    return this.salesService.create(body);
  }
}

@Module({
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
