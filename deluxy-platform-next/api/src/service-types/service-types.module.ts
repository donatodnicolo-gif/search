import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtUser, Roles } from '../common/decorators';
import { Role } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ServiceTypesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Tipi di servizio attivi (usati per abilitare i servizi dei partner e dei valet). */
  findAll() {
    return this.prisma.serviceType.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const service = await this.prisma.serviceType.findUnique({ where: { id } });
    if (!service) throw new NotFoundException('Servizio non trovato');
    return service;
  }

  /**
   * I campi SCALARI che si possono aggiornare, per nome.
   *
   * ⚠️ 27/08/2026 — Prima il corpo era un `Record<string, unknown>` versato
   * dritto dentro `data`. Un `Record` non è una classe, quindi il
   * `ValidationPipe` con `whitelist: true` non aveva niente da filtrare: il
   * corpo passava **letteralmente**. E Prisma accetta le scritture ANNIDATE
   * sulle relazioni, quindi
   *   `{ "partnerServices": { "deleteMany": {} } }`
   * cancellava tutti i listini partner di quel servizio. Senza log, senza
   * conferma, con un solo PUT.
   *
   * L'elenco per nome è la difesa: un campo non nominato non arriva a Prisma,
   * e le relazioni non sono nominabili per costruzione.
   */
  private static readonly CAMPI_MODIFICABILI = [
    'name', 'code', 'pricingModel', 'scope',
    'basePrice', 'perPiecePrice', 'transportPrice', 'deliveryPrice',
    'minHours', 'noticeDays', 'slotHours',
    'maxOrderTime', 'minOrderTime', 'allowFlexibleTime',
    'notes', 'hideCustomerInfo', 'active',
  ] as const;

  async update(id: string, body: Record<string, unknown>) {
    await this.findOne(id);
    const data: Record<string, unknown> = {};
    for (const campo of ServiceTypesService.CAMPI_MODIFICABILI) {
      if (body[campo] !== undefined) data[campo] = body[campo];
    }
    if (!Object.keys(data).length) {
      throw new BadRequestException('Nessun campo modificabile nella richiesta.');
    }
    return this.prisma.serviceType.update({ where: { id }, data });
  }

  /** Filtrabile per ambito (partner | valet). "both" appare in entrambi. */
  findByScope(scope?: string) {
    const where: any = { active: true };
    if (scope === 'partner') where.scope = { in: ['partner', 'both'] };
    if (scope === 'valet') where.scope = { in: ['valet', 'both'] };
    return this.prisma.serviceType.findMany({ where, orderBy: { name: 'asc' } });
  }

  async create(body: {
    name: string;
    code?: string;
    pricingModel: string;
    scope?: string;
    basePrice?: number;
    perPiecePrice?: number;
    transportPrice?: number;
    deliveryPrice?: number;
    minHours?: number;
    noticeDays?: number;
    slotHours?: number;
    maxOrderTime?: string;
    minOrderTime?: string;
    allowFlexibleTime?: boolean;
    notes?: string;
    hideCustomerInfo?: boolean;
  }) {
    // Code auto dal nome se non fornito (univoco)
    const base =
      body.code?.trim() ||
      body.name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
    let code = base || 'SVC';
    let i = 1;
    while (await this.prisma.serviceType.findUnique({ where: { code } })) {
      code = `${base}_${++i}`;
    }
    return this.prisma.serviceType.create({
      data: {
        name: body.name,
        code,
        pricingModel: body.pricingModel,
        scope: body.scope ?? 'partner',
        basePrice: body.basePrice,
        perPiecePrice: body.perPiecePrice,
        transportPrice: body.transportPrice,
        deliveryPrice: body.deliveryPrice,
        minHours: body.minHours,
        noticeDays: body.noticeDays,
        slotHours: body.slotHours,
        maxOrderTime: body.maxOrderTime,
        minOrderTime: body.minOrderTime,
        allowFlexibleTime: body.allowFlexibleTime ?? false,
        notes: body.notes,
        hideCustomerInfo: body.hideCustomerInfo ?? false,
      },
    });
  }
}

/**
 * I PREZZI DI UN SERVIZIO SONO UN FATTO FRA NOI E IL PARTNER.
 *
 * ⚠️ 29/08/2026 — Provato con un token VALET vero: `GET /service-types`
 * rispondeva 200 con `basePrice` e `perPiecePrice` di tutti i servizi. Il
 * RolesGuard è allow-by-default, quindi una rotta senza `@Roles` è aperta a
 * chiunque sia autenticato: il valet leggeva il listino che pagano i partner.
 *
 * Il nome del servizio gli serve (deve sapere che lavoro fa), il prezzo no.
 */
const PREZZI_DEL_PARTNER = ['basePrice', 'perPiecePrice', 'transportPrice', 'deliveryPrice'] as const;

function senzaPrezzi<T>(dati: T, user?: { role?: string }): T {
  if (user?.role !== 'VALET') return dati;
  const pulisci = (x: Record<string, unknown>) => {
    const copia = { ...x };
    for (const c of PREZZI_DEL_PARTNER) delete copia[c];
    return copia;
  };
  return (Array.isArray(dati)
    ? dati.map((x) => pulisci(x as Record<string, unknown>))
    : pulisci(dati as Record<string, unknown>)) as T;
}

@ApiTags('service-types')
@ApiBearerAuth()
@Controller('service-types')
export class ServiceTypesController {
  constructor(private readonly serviceTypesService: ServiceTypesService) {}

  @Get()
  @ApiOperation({ summary: 'Lista tipi di servizio (filtrabile per scope: partner | valet)' })
  async findAll(@CurrentUser() user: JwtUser, @Query('scope') scope?: string) {
    const dati = scope
      ? await this.serviceTypesService.findByScope(scope)
      : await this.serviceTypesService.findAll();
    return senzaPrezzi(dati, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Dettaglio tipo di servizio' })
  async findOne(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return senzaPrezzi(await this.serviceTypesService.findOne(id), user);
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Aggiorna tipo di servizio' })
  update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.serviceTypesService.update(id, body);
  }

  @Post()
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Crea tipo di servizio (partner o valet)' })
  create(
    @Body()
    body: {
      name: string;
      code?: string;
      pricingModel: string;
      scope?: string;
      basePrice?: number;
      perPiecePrice?: number;
      transportPrice?: number;
      deliveryPrice?: number;
      minHours?: number;
      noticeDays?: number;
      slotHours?: number;
      maxOrderTime?: string;
      minOrderTime?: string;
      allowFlexibleTime?: boolean;
      notes?: string;
      hideCustomerInfo?: boolean;
    },
  ) {
    return this.serviceTypesService.create(body);
  }
}

@Module({
  controllers: [ServiceTypesController],
  providers: [ServiceTypesService],
})
export class ServiceTypesModule {}
