import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JwtUser } from '../common/decorators';
import { Role } from '../common/enums';
import {
  ListQueryDto,
  PagedResult,
  buildOrderBy,
  paginate,
  textSearch,
} from '../common/list-query';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/create-customer.dto';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Campi testuali coperti dalla ricerca globale `q`. */
  private static readonly SEARCH_FIELDS = [
    'firstName',
    'lastName',
    'email',
    'phone',
    'address',
    'notes',
    'partner.insegna',
  ];

  /** Campi ordinabili (whitelist). */
  private static readonly SORT_FIELDS = [
    'lastName',
    'firstName',
    'email',
    'phone',
    'address',
    'createdAt',
    'partner.insegna',
  ];

  /**
   * Lista clienti paginata: in produzione sono migliaia, quindi ricerca,
   * ordinamento e paginazione sono tutti server-side.
   */
  async findAll(user: JwtUser, query: ListQueryDto): Promise<PagedResult<unknown>> {
    const scope =
      user.role === Role.PARTNER ? { partnerId: user.partnerId ?? '-' } : {};
    const search = textSearch(query.q, CustomersService.SEARCH_FIELDS);
    // scope e ricerca in AND: la ricerca non allarga la visibilita' del partner
    const where = search ? { AND: [scope, search] } : scope;
    const { skip, take, page, pageSize } = paginate(query);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        include: { partner: { select: { id: true, insegna: true } } },
        orderBy: buildOrderBy(query, CustomersService.SORT_FIELDS, { lastName: 'asc' }) as any,
        skip,
        take,
      }),
      this.prisma.customer.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async findOne(id: string, user: JwtUser) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        partner: { select: { id: true, insegna: true } },
        // Consegne del cliente, mostrate nella scheda cliente
        deliveries: {
          select: { id: true, code: true, date: true, status: true },
          orderBy: { date: 'desc' },
        },
      },
    });
    if (!customer) throw new NotFoundException('Cliente non trovato');
    if (user.role === Role.PARTNER && customer.partnerId !== user.partnerId) {
      throw new ForbiddenException('Accesso non consentito');
    }
    return customer;
  }

  create(dto: CreateCustomerDto, user: JwtUser) {
    const partnerId =
      user.role === Role.PARTNER ? user.partnerId : dto.partnerId;
    return this.prisma.customer.create({
      data: { ...dto, partnerId },
    });
  }

  async update(id: string, dto: UpdateCustomerDto, user: JwtUser) {
    await this.findOne(id, user);
    const { partnerId, ...scalar } = dto;
    return this.prisma.customer.update({
      where: { id },
      data: {
        ...scalar,
        ...(user.role !== Role.PARTNER && partnerId !== undefined
          ? { partnerId }
          : {}),
      },
    });
  }

  async remove(id: string, user: JwtUser) {
    await this.findOne(id, user);
    await this.prisma.customer.delete({ where: { id } });
    return { deleted: true };
  }
}
