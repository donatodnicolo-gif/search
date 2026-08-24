import {
  Body,
  BadRequestException,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Put,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
  PartialType,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Roles } from '../common/decorators';
import { Role } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';

export class CategoryFieldDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional({ enum: ['optional', 'required', 'admin'], default: 'optional' })
  @IsOptional()
  @IsIn(['optional', 'required', 'admin'])
  fieldType?: string;
}

export class CategoryDiscountDto {
  @ApiProperty()
  @IsString()
  provinceId: string;

  @ApiProperty({ description: 'Sconto % per la provincia' })
  @IsNumber()
  discountPercent: number;
}

export class CreateCategoryDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Prompt per generazione AI' })
  @IsOptional()
  @IsString()
  aiPrompt?: string;

  @ApiPropertyOptional({ type: [CategoryFieldDto], description: 'Campi testuali extra' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CategoryFieldDto)
  fields?: CategoryFieldDto[];

  @ApiPropertyOptional({ type: [CategoryDiscountDto], description: 'Sconti % per provincia' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CategoryDiscountDto)
  discounts?: CategoryDiscountDto[];
}

/** Update parziale: tutti i campi opzionali. */
export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}

const CATEGORY_INCLUDE = {
  fields: true,
  discounts: { include: { province: true } },
} as const;

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Le categorie. Di default SOLO quelle in uso; con `archived` l'archivio.
   *
   * ⚠️ Il default conta: questa lista alimenta le tendine di scelta del form
   * prodotto e delle liste priorita'. Una categoria archiviata non deve poter
   * essere SCELTA di nuovo — ma resta scritta ovunque lo sia gia'.
   */
  findAll(archived = false) {
    return this.prisma.category.findMany({
      where: { archived },
      include: CATEGORY_INCLUDE,
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Archivia o ripristina una categoria.
   *
   * ⚠️ NON tocca i prodotti che ce l'hanno: 16 categorie su 65 non hanno piu'
   * un prodotto in lista, ma i loro prodotti archiviati continuano a dire a
   * quale categoria appartenevano. Senza quel nome una scheda del 2023
   * diventa illeggibile.
   *
   * ⚠️ E non tocca lo SMISTAMENTO: le liste priorita' partner-categoria
   * continuano a funzionare. Archiviare e' igiene del catalogo, non un
   * interruttore operativo — un ordine che arriva per una categoria
   * archiviata va smistato lo stesso, se no sparirebbe senza dirlo a nessuno.
   */
  async setArchived(id: string, archived: boolean) {
    await this.findOne(id);
    return this.prisma.category.update({
      where: { id },
      data: { archived, archivedAt: archived ? new Date() : null },
      include: CATEGORY_INCLUDE,
    });
  }

  /** Archivia o ripristina piu' categorie insieme. */
  async azioneMultipla(ids: string[], azione: 'archivia' | 'ripristina') {
    if (!ids?.length) throw new BadRequestException('Nessuna categoria selezionata.');
    const archived = azione === 'archivia';
    const { count } = await this.prisma.category.updateMany({
      where: { id: { in: ids } },
      data: { archived, archivedAt: archived ? new Date() : null },
    });
    return { azione, fatti: count };
  }

  async findOne(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: CATEGORY_INCLUDE,
    });
    if (!category) throw new NotFoundException('Categoria non trovata');
    return category;
  }

  /** Aggiorna la categoria; campi extra e sconti sono sostituiti in blocco. */
  async update(id: string, dto: UpdateCategoryDto) {
    await this.findOne(id);
    const { fields, discounts, ...scalar } = dto;
    return this.prisma.category.update({
      where: { id },
      data: {
        ...scalar,
        ...(fields ? { fields: { deleteMany: {}, create: fields } } : {}),
        ...(discounts
          ? {
              discounts: {
                deleteMany: {},
                create: discounts.map((d) => ({
                  provinceId: d.provinceId,
                  discountPercent: d.discountPercent,
                })),
              },
            }
          : {}),
      },
      include: CATEGORY_INCLUDE,
    });
  }

  create(dto: CreateCategoryDto) {
    const { fields, discounts, ...scalar } = dto;
    return this.prisma.category.create({
      data: {
        ...scalar,
        fields: fields?.length ? { create: fields } : undefined,
        discounts: discounts?.length
          ? {
              create: discounts.map((d) => ({
                provinceId: d.provinceId,
                discountPercent: d.discountPercent,
              })),
            }
          : undefined,
      },
      include: CATEGORY_INCLUDE,
    });
  }

  /** Sconto % per categoria e provincia (base dei prodotti scontati automatici). */
  setDiscount(categoryId: string, provinceId: string, discountPercent: number) {
    return this.prisma.categoryDiscount.upsert({
      where: { categoryId_provinceId: { categoryId, provinceId } },
      create: { categoryId, provinceId, discountPercent },
      update: { discountPercent },
    });
  }
}

@ApiTags('categories')
@ApiBearerAuth()
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @ApiOperation({ summary: 'Lista categorie con campi e sconti per provincia' })
  findAll(@Query('archived') archived?: string) {
    return this.categoriesService.findAll(archived === 'true' || archived === '1');
  }

  @Patch(':id/archive')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Archivia o ripristina una categoria: i prodotti che ce l hanno non cambiano' })
  setArchived(@Param('id') id: string, @Body() body: { archived: boolean }) {
    return this.categoriesService.setArchived(id, body?.archived === true);
  }

  @Post('azione-multipla')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Archivia o ripristina piu categorie insieme' })
  azioneMultipla(@Body() body: { ids: string[]; azione: 'archivia' | 'ripristina' }) {
    return this.categoriesService.azioneMultipla(body?.ids ?? [], body?.azione);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Dettaglio categoria' })
  findOne(@Param('id') id: string) {
    return this.categoriesService.findOne(id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Crea categoria (con campi extra e sconti provincia)' })
  create(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(dto);
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Aggiorna categoria (campi extra e sconti sostituiti in blocco)' })
  update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.categoriesService.update(id, dto);
  }

  @Post(':id/discounts')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Imposta sconto % categoria/provincia' })
  setDiscount(
    @Param('id') id: string,
    @Body() body: { provinceId: string; discountPercent: number },
  ) {
    return this.categoriesService.setDiscount(id, body.provinceId, body.discountPercent);
  }
}

@Module({
  controllers: [CategoriesController],
  providers: [CategoriesService],
})
export class CategoriesModule {}
