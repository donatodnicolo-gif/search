import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JwtUser } from '../common/decorators';
import { ProductType, Role } from '../common/enums';
import {
  ListQueryDto,
  PagedResult,
  buildOrderBy,
  paginate,
  textSearch,
} from '../common/list-query';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto, UpdateProductDto } from './dto/create-product.dto';

const PRODUCT_INCLUDE = {
  partner: { select: { id: true, insegna: true } },
  category: true,
  fields: true,
  variants: true,
  partnerLinks: true,
  components: { include: { componentProduct: { select: { id: true, name: true, price: true } } } },
} as const;

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Campi testuali coperti dalla ricerca globale `q`. */
  private static readonly SEARCH_FIELDS = [
    'name',
    'sku',
    'line',
    'shortDesc',
    'description',
    'alternateName',
    'category.name',
    'partner.insegna',
  ];

  /** Campi ordinabili (whitelist: niente ordinamenti su colonne arbitrarie). */
  private static readonly SORT_FIELDS = [
    'name',
    'sku',
    'price',
    'publicPrice',
    'stock',
    'type',
    'approved',
    'active',
    'createdAt',
    'category.name',
    'partner.insegna',
  ];

  /**
   * Lista prodotti con ricerca globale, ordinamento e paginazione.
   * Il partner vede i propri prodotti + quelli visibili agli altri partner.
   */
  async findAll(user: JwtUser, query: ListQueryDto): Promise<PagedResult<unknown>> {
    const scope =
      user.role === Role.PARTNER
        ? {
            OR: [
              { partnerId: user.partnerId ?? '-' },
              { visibleToOtherPartners: true },
            ],
          }
        : {};
    const search = textSearch(query.q, ProductsService.SEARCH_FIELDS);
    // scope e ricerca vanno in AND: la ricerca non deve allargare la visibilita'
    const where = search ? { AND: [scope, search] } : scope;
    const { skip, take, page, pageSize } = paginate(query);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        include: PRODUCT_INCLUDE,
        orderBy: buildOrderBy(query, ProductsService.SORT_FIELDS, { name: 'asc' }) as any,
        skip,
        take,
      }),
      this.prisma.product.count({ where }),
    ]);
    return { items, total, page, pageSize };
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
    const {
      fields,
      components,
      variants,
      additionalPartnerIds,
      platforms,
      images,
      platformDescriptions,
      partnerId: _p,
      sku: _sku,
      ...scalar
    } = dto;
    // SKU generato automaticamente (progressivo), rigenerato a ogni duplicazione
    const count = await this.prisma.product.count();
    const baseSku = `DXY-${String(count + 1).padStart(5, '0')}`;
    // SKU variante generato automaticamente: <SKU prodotto>-NN progressivo
    const variantCreate = dto.hasVariants && variants?.length
      ? variants.map((v, i) => ({
          name: v.name,
          price: v.price,
          publicPrice: v.publicPrice,
          sku: `${baseSku}-${String(i + 1).padStart(2, '0')}`,
          imageUrl: v.imageUrl,
          prepDays: v.prepDays,
          controlStock: v.controlStock ?? false,
          stock: v.stock,
        }))
      : undefined;
    return this.prisma.product.create({
      data: {
        ...scalar,
        sku: baseSku,
        partnerId,
        platforms: platforms?.length ? JSON.stringify(platforms) : undefined,
        images: images?.length ? JSON.stringify(images) : undefined,
        platformDescriptions:
          platformDescriptions && Object.keys(platformDescriptions).length
            ? JSON.stringify(platformDescriptions)
            : undefined,
        fields: fields?.length ? { create: fields } : undefined,
        variants: variantCreate ? { create: variantCreate } : undefined,
        partnerLinks: additionalPartnerIds?.length
          ? { create: additionalPartnerIds.map((partnerId) => ({ partnerId })) }
          : undefined,
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
    const {
      fields,
      components,
      variants,
      additionalPartnerIds,
      platforms,
      images,
      platformDescriptions,
      ...scalar
    } = dto;
    return this.prisma.product.update({
      where: { id },
      data: {
        ...scalar,
        ...(platforms ? { platforms: JSON.stringify(platforms) } : {}),
        ...(images ? { images: JSON.stringify(images) } : {}),
        ...(platformDescriptions
          ? { platformDescriptions: JSON.stringify(platformDescriptions) }
          : {}),
        ...(fields ? { fields: { deleteMany: {}, create: fields } } : {}),
        ...(variants
          ? {
              variants: {
                deleteMany: {},
                // SKU variante rigenerato progressivamente dallo SKU del prodotto
                create: variants.map((v, i) => ({
                  name: v.name,
                  price: v.price,
                  publicPrice: v.publicPrice,
                  sku: `${product.sku ?? 'DXY'}-${String(i + 1).padStart(2, '0')}`,
                  imageUrl: v.imageUrl,
                  prepDays: v.prepDays,
                  controlStock: v.controlStock ?? false,
                  stock: v.stock,
                })),
              },
            }
          : {}),
        ...(additionalPartnerIds
          ? {
              partnerLinks: {
                deleteMany: {},
                create: additionalPartnerIds.map((partnerId) => ({ partnerId })),
              },
            }
          : {}),
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
