import { BadRequestException, Body, ConflictException, Controller, Delete, Get, Injectable, Module, NotFoundException, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';
import { Roles } from '../common/decorators';
import { Role } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';

/**
 * ⭐ 06/09/2026 (regola utente): le AREE — gruppi di province con un nome
 * («Milano e hinterland» = 12 province lombarde, «Roma», «Firenze»…). Ai partner
 * si assegnano le aree, non le 107 province una per una. Le province EFFETTIVE
 * del partner (PartnerProvince, quelle che lo smistamento e il form consegna
 * leggono) restano e si ricalcolano come unione delle sue aree: nessun altro
 * codice cambia. Un'area ha almeno una provincia; non si cancella se un partner
 * la usa. Aree e assegnazioni iniziali nate dai dati con
 * scripts/applica-migrazione-aree.mjs.
 */
export class AreaDto {
  @IsOptional() @IsString() nome?: string;
  @IsOptional() @IsString() note?: string | null;
  @IsOptional() @IsBoolean() attiva?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) provinceIds?: string[];
}

const AREA_INCLUDE = { province: { include: { province: { select: { id: true, code: true, name: true } } } }, _count: { select: { partners: true, valets: true } } } as const;

@Injectable()
export class AreeService {
  constructor(private readonly prisma: PrismaService) {}

  private forma(a: any) {
    const province = (a.province ?? []).map((x: any) => x.province).sort((x: any, y: any) => x.code.localeCompare(y.code));
    return { id: a.id, nome: a.nome, note: a.note ?? null, attiva: a.attiva, province, partner: a._count?.partners ?? 0, valet: a._count?.valets ?? 0, createdAt: a.createdAt, updatedAt: a.updatedAt };
  }

  async lista() {
    const aree = await this.prisma.area.findMany({ include: AREA_INCLUDE, orderBy: [{ nome: 'asc' }] });
    return aree.map((a) => this.forma(a)).sort((x, y) => y.province.length - x.province.length || x.nome.localeCompare(y.nome, 'it'));
  }

  async una(id: string) {
    const a = await this.prisma.area.findUnique({ where: { id }, include: AREA_INCLUDE });
    if (!a) throw new NotFoundException('Area non trovata');
    return this.forma(a);
  }

  private async provinceValide(ids: string[] | undefined) {
    const puliti = [...new Set((ids ?? []).filter(Boolean))];
    if (!puliti.length) throw new BadRequestException("Un'area ha almeno una provincia");
    const n = await this.prisma.province.count({ where: { id: { in: puliti } } });
    if (n !== puliti.length) throw new BadRequestException('Provincia sconosciuta');
    return puliti;
  }

  async crea(dto: AreaDto) {
    const nome = String(dto.nome ?? '').trim();
    if (!nome) throw new BadRequestException("Serve il nome dell'area");
    const ids = await this.provinceValide(dto.provinceIds);
    const a = await this.prisma.area.create({ data: { nome, note: dto.note ?? null, attiva: dto.attiva ?? true, province: { create: ids.map((provinceId) => ({ provinceId })) } }, include: AREA_INCLUDE });
    return this.forma(a);
  }

  /** Cambiare le province di un'area ricalcola le province effettive di TUTTI i partner che la usano. */
  async aggiorna(id: string, dto: AreaDto) {
    await this.una(id);
    const ids = dto.provinceIds !== undefined ? await this.provinceValide(dto.provinceIds) : null;
    const a = await this.prisma.area.update({
      where: { id },
      data: {
        ...(dto.nome !== undefined ? { nome: String(dto.nome).trim() } : {}),
        ...(dto.note !== undefined ? { note: dto.note } : {}),
        ...(dto.attiva !== undefined ? { attiva: dto.attiva } : {}),
        ...(ids ? { province: { deleteMany: {}, create: ids.map((provinceId) => ({ provinceId })) } } : {}),
      },
      include: AREA_INCLUDE,
    });
    if (ids) {
      const partner = await this.prisma.partnerArea.findMany({ where: { areaId: id }, select: { partnerId: true } });
      for (const p of partner) await this.ricalcolaProvincePartner(p.partnerId);
      const valet = await this.prisma.valetArea.findMany({ where: { areaId: id }, select: { valetId: true } });
      for (const v of valet) await this.ricalcolaProvinceValet(v.valetId);
    }
    return this.forma(a);
  }

  async elimina(id: string) {
    const a = await this.una(id);
    if (a.partner > 0 || (a as any).valet > 0) throw new ConflictException(`L'area è usata da ${a.partner} partner e ${(a as any).valet} valet: prima spostali su un'altra area`);
    await this.prisma.area.delete({ where: { id } });
    return { deleted: true };
  }

  /** Le province effettive del partner = unione delle province delle sue aree. */
  async ricalcolaProvincePartner(partnerId: string) {
    const aree = await this.prisma.partnerArea.findMany({ where: { partnerId }, select: { area: { select: { province: { select: { provinceId: true } } } } } });
    const ids = [...new Set(aree.flatMap((x) => x.area.province.map((p) => p.provinceId)))];
    await this.prisma.$transaction([
      // ⭐ 06/09 (regola utente): le province scelte a mano (manuale=true) restano; si rifanno solo quelle delle aree.
      this.prisma.partnerProvince.deleteMany({ where: { partnerId, manuale: false } }),
      ...(ids.length ? [this.prisma.partnerProvince.createMany({ data: ids.map((provinceId) => ({ partnerId, provinceId })), skipDuplicates: true })] : []),
    ]);
    return ids;
  }

  /** ⭐ Le province effettive del VALET = unione delle sue aree (come per i partner). */
  async ricalcolaProvinceValet(valetId: string) {
    const aree = await this.prisma.valetArea.findMany({ where: { valetId }, select: { area: { select: { province: { select: { provinceId: true } } } } } });
    const ids = [...new Set(aree.flatMap((x) => x.area.province.map((p) => p.provinceId)))];
    await this.prisma.$transaction([
      this.prisma.valetProvince.deleteMany({ where: { valetId, manuale: false } }),
      ...(ids.length ? [this.prisma.valetProvince.createMany({ data: ids.map((provinceId) => ({ valetId, provinceId })), skipDuplicates: true })] : []),
    ]);
    return ids;
  }

  async assegnaAlValet(valetId: string, areaIds: string[]) {
    const puliti = [...new Set(areaIds.filter(Boolean))];
    const n = await this.prisma.area.count({ where: { id: { in: puliti } } });
    if (n !== puliti.length) throw new BadRequestException('Area sconosciuta');
    await this.prisma.$transaction([
      this.prisma.valetArea.deleteMany({ where: { valetId } }),
      ...(puliti.length ? [this.prisma.valetArea.createMany({ data: puliti.map((areaId) => ({ valetId, areaId })), skipDuplicates: true })] : []),
    ]);
    return this.ricalcolaProvinceValet(valetId);
  }

  /** Scrive le aree del partner e ricalcola le sue province. */
  async assegnaAlPartner(partnerId: string, areaIds: string[]) {
    const puliti = [...new Set(areaIds.filter(Boolean))];
    const n = await this.prisma.area.count({ where: { id: { in: puliti } } });
    if (n !== puliti.length) throw new BadRequestException('Area sconosciuta');
    await this.prisma.$transaction([
      this.prisma.partnerArea.deleteMany({ where: { partnerId } }),
      ...(puliti.length ? [this.prisma.partnerArea.createMany({ data: puliti.map((areaId) => ({ partnerId, areaId })), skipDuplicates: true })] : []),
    ]);
    return this.ricalcolaProvincePartner(partnerId);
  }
}

@ApiTags('aree')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.OPERATION, Role.PROJECT_MANAGER)
@Controller('aree')
export class AreeController {
  constructor(private readonly service: AreeService) {}

  @Get()
  @ApiOperation({ summary: 'Le aree (gruppi di province) coi partner che le usano' })
  lista() { return this.service.lista(); }

  @Get(':id')
  una(@Param('id') id: string) { return this.service.una(id); }

  @Post()
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Crea un\'area (nome + province, almeno una)' })
  crea(@Body() dto: AreaDto) { return this.service.crea(dto); }

  @Put(':id')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Aggiorna un\'area; cambiare le province ricalcola i partner che la usano' })
  aggiorna(@Param('id') id: string, @Body() dto: AreaDto) { return this.service.aggiorna(id, dto); }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Elimina un\'area non usata da nessun partner' })
  elimina(@Param('id') id: string) { return this.service.elimina(id); }
}

@Module({ controllers: [AreeController], providers: [AreeService], exports: [AreeService] })
export class AreeModule {}
