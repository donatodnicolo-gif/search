import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JwtUser } from '../common/decorators';
import { ProductType, Role } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto, UpdateProductDto } from './dto/create-product.dto';

const PRODUCT_INCLUDE = {
  partner: { select: { id: true, insegna: true } },
  category: true,
  fields: true,
  components: { include: { componentProduct: { select: { id: true, name: true, price: true } } } },
} as const;

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Il partner vede i propri prodotti + quelli visibili agli altri partner. */
  findAll(user: JwtUser) {
    const where =
      user.role === Role.PARTNER
        ? {
            OR: [
              { partnerId: user.partnerId ?? '-' },
              { visibleToOtherPartners: true },
            ],
          }
        : {};
    return this.prisma.product.findMany({
      where,
      include: PRODUCT_INCLUDE,
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: PRODUCT_INCLUDE,
    });
    if (!product) throw new NotFoundException('Prodotto non trovato');
    return product;
  }

  async create(dto: CreateProductDto, user: JwtUser) {
    // Il partner crea solo prodotti propri
    const partnerId =
      user.role === Role.PARTNER ? user.partnerId : dto.partnerId;
    if (dto.type === ProductType.UNICO && !partnerId) {
      throw new BadRequestException('Un prodotto UNICO richiede un partner');
    }
    const { fields, components, partnerId: _p, ...scalar } = dto;
    return this.prisma.product.create({
      data: {
        ...scalar,
        partnerId,
        fields: fields?.length ? { create: fields } : undefined,
        components:
          dto.type === ProductType.SUPERPRODOTTO && components?.length
            ? { create: components }
            : undefined,
      },
      include: PRODUCT_INCLUDE,
    });
  }

  async update(id: string, dto: UpdateProductDto, user: JwtUser) {
    const product = await this.findOne(id);
    if (user.role === Role.PARTNER && product.partnerId !== user.partnerId) {
      throw new ForbiddenException('Puoi modificare solo i tuoi prodotti');
    }
    const { fields, components, ...scalar } = dto;
    return this.prisma.product.update({
      where: { id },
      data: {
        ...scalar,
        ...(fields ? { fields: { deleteMany: {}, create: fields } } : {}),
        ...(components
          ? { components: { deleteMany: {}, create: components } }
          : {}),
      },
      include: PRODUCT_INCLUDE,
    });
  }

  async remove(id: string, user: JwtUser) {
    const product = await this.findOne(id);
    if (user.role === Role.PARTNER && product.partnerId !== user.partnerId) {
      throw new ForbiddenException('Puoi eliminare solo i tuoi prodotti');
    }
    await this.prisma.product.update({ where: { id }, data: { active: false } });
    return { deactivated: true };
  }

  /**
   * Genera i prodotti scontati automatici a partire dagli sconti %
   * per categoria/provincia (CategoryDiscount). Prezzo arrotondato a 0/5.
   */
  async generateDiscountedProducts(categoryId: string) {
    const discounts = await this.prisma.categoryDiscount.findMany({
      where: { categoryId },
      include: { province: true },
    });
    const products = await this.prisma.product.findMany({
      where: { categoryId, isAutoDiscounted: false, active: true },
    });
    const created: string[] = [];
    for (const discount of discounts) {
      for (const product of products) {
        const raw = product.price * (1 - discount.discountPercent / 100);
        const rounded = Math.round(raw / 5) * 5; // arrotondamento a 0/5
        const variant = await this.prisma.product.create({
          data: {
            name: `${product.name} (-${discount.discountPercent}% ${discount.province.code})`,
            description: product.description,
            price: rounded,
            type: product.type,
            partnerId: product.partnerId,
            categoryId: product.categoryId,
            visibleToOtherPartners: product.visibleToOtherPartners,
            isAutoDiscounted: true,
            parentProductId: product.id,
          },
        });
        created.push(variant.id);
      }
    }
    return { created: created.length };
  }
}
