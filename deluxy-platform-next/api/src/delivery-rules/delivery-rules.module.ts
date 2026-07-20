// ============================================================
// Regole carnet (delivery rules)
// ------------------------------------------------------------
// Replica la schermata "Consegne Regole" (/partner/delivery/rules)
// dell'app reale: regole per carnet e servizi con numero di consegne
// garantito. Vedi §3 di docs/COME-FUNZIONA-APP-DELUXY.md.
//
// Una regola puo' avere il vincolo giornaliero (dailyRule) e/o quello
// totale nel periodo (totalRule) — i due sono indipendenti come nell'app
// reale. Plus/Minus su fatturazione partner e paga valet, estendibile a
// piu' partner.
// ============================================================
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags, PartialType } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';
import { Roles } from '../common/decorators';
import { Role } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateDeliveryRuleDto {
  @ApiProperty({ description: 'Nome della regola' })
  @IsString()
  name: string;

  @ApiProperty({ default: false, description: 'Attiva il vincolo giornaliero' })
  @IsOptional()
  @IsBoolean()
  dailyRule?: boolean;

  @ApiProperty({ default: 0, description: 'Numero giornaliero di consegne garantite' })
  @IsOptional()
  @IsInt()
  @Min(0)
  dailyCount?: number;

  @ApiProperty({ default: false, description: 'Attiva il vincolo totale nel periodo' })
  @IsOptional()
  @IsBoolean()
  totalRule?: boolean;

  @ApiProperty({ default: 0, description: 'Numero totale di consegne garantite nel periodo' })
  @IsOptional()
  @IsInt()
  @Min(0)
  totalCount?: number;

  @ApiProperty({ required: false, description: 'Inizio validita (ISO)' })
  @IsOptional()
  @IsString()
  periodStart?: string;

  @ApiProperty({ required: false, description: 'Fine validita (ISO)' })
  @IsOptional()
  @IsString()
  periodEnd?: string;

  @ApiProperty({ required: false, description: 'Ora inizio fascia "HH:mm"' })
  @IsOptional()
  @Matches(HHMM, { message: 'timeFrom deve essere HH:mm' })
  timeFrom?: string;

  @ApiProperty({ required: false, description: 'Ora fine fascia "HH:mm"' })
  @IsOptional()
  @Matches(HHMM, { message: 'timeTo deve essere HH:mm' })
  timeTo?: string;

  @ApiProperty({ required: false, description: 'Distanza KM entro cui vale la regola' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  kmDistance?: number;

  @ApiProperty({ required: false, description: 'Tipo di servizio collegato' })
  @IsOptional()
  @IsString()
  serviceTypeId?: string;

  @ApiProperty({ default: 0, description: 'Plus/Minus fatturazione partner' })
  @IsOptional()
  @IsNumber()
  partnerBillingAdjustment?: number;

  @ApiProperty({ default: 0, description: 'Plus/Minus paga valet' })
  @IsOptional()
  @IsNumber()
  valetPayAdjustment?: number;

  @ApiProperty({ default: true, description: 'Da fatturare' })
  @IsOptional()
  @IsBoolean()
  toBill?: boolean;

  @ApiProperty({ default: true, description: 'Da pagare' })
  @IsOptional()
  @IsBoolean()
  toPay?: boolean;

  @ApiProperty({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiProperty({ required: false, type: [String], description: 'Partner a cui estendere la regola' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  partnerIds?: string[];
}

export class UpdateDeliveryRuleDto extends PartialType(CreateDeliveryRuleDto) {}

const RULE_INCLUDE = {
  serviceType: { select: { id: true, name: true } },
  partners: { include: { partner: { select: { id: true, insegna: true } } } },
} as const;

@Injectable()
export class DeliveryRulesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.deliveryRule.findMany({
      include: RULE_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const rule = await this.prisma.deliveryRule.findUnique({
      where: { id },
      include: RULE_INCLUDE,
    });
    if (!rule) throw new NotFoundException('Regola carnet non trovata');
    return rule;
  }

  /** Una regola deve garantire almeno un vincolo, altrimenti non ha senso. */
  private validate(dto: CreateDeliveryRuleDto | UpdateDeliveryRuleDto, isCreate: boolean) {
    // In update i campi possono essere assenti: si validano solo se presenti.
    const daily = dto.dailyRule;
    const total = dto.totalRule;
    if (isCreate && !daily && !total) {
      throw new BadRequestException('Attiva almeno una regola tra giornaliera e totale');
    }
    if (daily && (dto.dailyCount ?? 0) <= 0) {
      throw new BadRequestException('La regola giornaliera richiede un numero di consegne > 0');
    }
    if (total && (dto.totalCount ?? 0) <= 0) {
      throw new BadRequestException('La regola totale richiede un numero di consegne > 0');
    }
  }

  /** Solo i campi scalari (niente relazioni): usato sia in create che update. */
  private data(dto: CreateDeliveryRuleDto | UpdateDeliveryRuleDto) {
    return {
      name: dto.name,
      dailyRule: dto.dailyRule,
      dailyCount: dto.dailyCount,
      totalRule: dto.totalRule,
      totalCount: dto.totalCount,
      periodStart: dto.periodStart ? new Date(dto.periodStart) : null,
      periodEnd: dto.periodEnd ? new Date(dto.periodEnd) : null,
      timeFrom: dto.timeFrom ?? null,
      timeTo: dto.timeTo ?? null,
      kmDistance: dto.kmDistance ?? null,
      partnerBillingAdjustment: dto.partnerBillingAdjustment,
      valetPayAdjustment: dto.valetPayAdjustment,
      toBill: dto.toBill,
      toPay: dto.toPay,
      active: dto.active,
    };
  }

  private partnerCreate(partnerIds?: string[]) {
    return partnerIds?.length
      ? { create: [...new Set(partnerIds)].map((partnerId) => ({ partnerId })) }
      : undefined;
  }

  async create(dto: CreateDeliveryRuleDto) {
    this.validate(dto, true);
    return this.prisma.deliveryRule.create({
      data: {
        ...this.data(dto),
        name: dto.name, // required in create (in data() e' widened a string|undefined)
        ...(dto.serviceTypeId ? { serviceType: { connect: { id: dto.serviceTypeId } } } : {}),
        partners: this.partnerCreate(dto.partnerIds),
      },
      include: RULE_INCLUDE,
    });
  }

  async update(id: string, dto: UpdateDeliveryRuleDto) {
    await this.findOne(id);
    this.validate(dto, false);
    // Se arriva la lista partner, si riscrive per intero l'estensione.
    const rewritePartners = dto.partnerIds !== undefined;
    if (rewritePartners) {
      await this.prisma.deliveryRulePartner.deleteMany({ where: { deliveryRuleId: id } });
    }
    return this.prisma.deliveryRule.update({
      where: { id },
      data: {
        ...pruneUndefined(this.data(dto)),
        // undefined = campo non inviato (non tocca); stringa vuota = scollega.
        ...(dto.serviceTypeId !== undefined
          ? dto.serviceTypeId
            ? { serviceType: { connect: { id: dto.serviceTypeId } } }
            : { serviceType: { disconnect: true } }
          : {}),
        ...(rewritePartners ? { partners: this.partnerCreate(dto.partnerIds) ?? {} } : {}),
      },
      include: RULE_INCLUDE,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.deliveryRule.delete({ where: { id } });
    return { deleted: true };
  }
}

/** Rimuove le chiavi undefined per non azzerare per errore campi non inviati in update. */
function pruneUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

@ApiTags('delivery-rules')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.OPERATION, Role.PROJECT_MANAGER)
@Controller('delivery-rules')
export class DeliveryRulesController {
  constructor(private readonly service: DeliveryRulesService) {}

  @Get()
  @ApiOperation({ summary: 'Lista regole carnet' })
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Dettaglio regola carnet' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Crea regola carnet' })
  create(@Body() dto: CreateDeliveryRuleDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Aggiorna regola carnet' })
  update(@Param('id') id: string, @Body() dto: UpdateDeliveryRuleDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Elimina regola carnet' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}

@Module({
  controllers: [DeliveryRulesController],
  providers: [DeliveryRulesService],
})
export class DeliveryRulesModule {}
