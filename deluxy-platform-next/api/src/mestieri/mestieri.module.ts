import { Body, Controller, Get, Injectable, Module, NotFoundException, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { Roles } from '../common/decorators';
import { Role } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';

/**
 * ⭐ 06/09/2026 (decisione utente: «vai con 8 mestieri, cake e pasticceria
 * separati»). I MESTIERI sono il livello nostro fra il catalogo e i partner:
 *
 *   tipo prodotto Shopify → Categoria (65, non si tocca) → MESTIERE (8) → Partner × Provincia → lista di priorità
 *
 * Le categorie restano l'ingresso (Merchandising e Shopify non cambiano); il
 * mestiere è la lingua con cui si parla ai partner: un partner ha 1–3 mestieri,
 * non 65 caselle. Una categoria nuova che arriva senza mestiere finisce in
 * «da assegnare» e non si smista da sola finché qualcuno non la colloca.
 */
export class AggiornaMestiereDto {
  @IsOptional() @IsString() nome?: string;
  @IsOptional() @IsBoolean() smistamentoAutomatico?: boolean;
  @IsOptional() @IsBoolean() attivo?: boolean;
}
export class AssegnaCategoriaDto {
  /** null = torna «da assegnare» */
  @IsOptional() @IsString() mestiereId?: string | null;
}

@Injectable()
export class MestieriService {
  constructor(private readonly prisma: PrismaService) {}

  /** Gli 8 mestieri con i conti: categorie, prodotti a catalogo, partner attivi, liste. */
  async lista() {
    const mestieri = await this.prisma.mestiere.findMany({ orderBy: { ordine: 'asc' }, include: { categorie: { select: { id: true, name: true } } } });
    const righe = [] as any[];
    for (const m of mestieri) {
      const ids = m.categorie.map((c) => c.id);
      const [prodotti, partner, liste] = await Promise.all([
        ids.length ? this.prisma.product.count({ where: { categoryId: { in: ids }, deletedAt: null } }) : 0,
        this.prisma.partnerMestiere.count({ where: { mestiereId: m.id, partner: { active: true, deleted: false } } }),
        this.prisma.priorityList.count({ where: { mestiereId: m.id } }),
      ]);
      righe.push({ ...m, prodotti, partner, liste, categorie: m.categorie.map((c) => c.name).sort((a, b) => a.localeCompare(b, 'it')) });
    }
    return righe;
  }

  /** Tutte le categorie col loro mestiere (le «da assegnare» prima), coi prodotti. */
  async categorie() {
    const cat = await this.prisma.category.findMany({
      select: { id: true, name: true, archived: true, mestiereId: true, _count: { select: { products: true } } },
      orderBy: { name: 'asc' },
    });
    return cat
      .map((c) => ({ id: c.id, name: c.name, archived: (c as any).archived ?? false, mestiereId: c.mestiereId, prodotti: c._count.products }))
      .sort((a, b) => Number(!!a.mestiereId) - Number(!!b.mestiereId) || a.name.localeCompare(b.name, 'it'));
  }

  async assegnaCategoria(categoryId: string, mestiereId: string | null | undefined) {
    const c = await this.prisma.category.findUnique({ where: { id: categoryId }, select: { id: true } });
    if (!c) throw new NotFoundException('Categoria non trovata');
    if (mestiereId) {
      const m = await this.prisma.mestiere.findUnique({ where: { id: mestiereId }, select: { id: true } });
      if (!m) throw new NotFoundException('Mestiere non trovato');
    }
    return this.prisma.category.update({ where: { id: categoryId }, data: { mestiereId: mestiereId ?? null }, select: { id: true, name: true, mestiereId: true } });
  }

  async aggiorna(id: string, dto: AggiornaMestiereDto) {
    const m = await this.prisma.mestiere.findUnique({ where: { id } });
    if (!m) throw new NotFoundException('Mestiere non trovato');
    return this.prisma.mestiere.update({ where: { id }, data: { ...(dto.nome !== undefined ? { nome: dto.nome } : {}), ...(dto.smistamentoAutomatico !== undefined ? { smistamentoAutomatico: dto.smistamentoAutomatico } : {}), ...(dto.attivo !== undefined ? { attivo: dto.attivo } : {}) } });
  }
}

@ApiTags('mestieri')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.OPERATION, Role.PROJECT_MANAGER)
@Controller('mestieri')
export class MestieriController {
  constructor(private readonly service: MestieriService) {}

  @Get()
  @ApiOperation({ summary: 'I mestieri (8) con categorie, prodotti, partner e liste' })
  lista() { return this.service.lista(); }

  @Get('categorie')
  @ApiOperation({ summary: 'Le categorie col mestiere assegnato (le «da assegnare» prima)' })
  categorie() { return this.service.categorie(); }

  @Put('categorie/:categoryId')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Colloca una categoria in un mestiere (null = da assegnare)' })
  assegna(@Param('categoryId') categoryId: string, @Body() dto: AssegnaCategoriaDto) { return this.service.assegnaCategoria(categoryId, dto.mestiereId); }

  @Put(':id')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Aggiorna un mestiere (nome, smistamento automatico, attivo)' })
  aggiorna(@Param('id') id: string, @Body() dto: AggiornaMestiereDto) { return this.service.aggiorna(id, dto); }
}

@Module({ controllers: [MestieriController], providers: [MestieriService], exports: [MestieriService] })
export class MestieriModule {}
