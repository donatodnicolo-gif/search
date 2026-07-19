import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
  PartialType,
} from '@nestjs/swagger';
import { IsBoolean, IsIn, IsObject, IsOptional, IsString } from 'class-validator';
import { CurrentUser, JwtUser } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';

/** Sezioni che supportano le viste rapide. */
export const VIEW_SECTIONS = [
  'deliveries',
  'products',
  'customers',
  'partners',
  'valets',
  'categories',
  'services',
  'operators',
] as const;

export class CreateSavedViewDto {
  @ApiProperty({ enum: VIEW_SECTIONS })
  @IsIn(VIEW_SECTIONS as unknown as string[])
  section: string;

  @ApiProperty({ description: 'Nome della vista mostrato nel chip' })
  @IsString()
  name: string;

  @ApiProperty({
    description: 'Stato della lista: { q, sort, dir, pageSize, ...filtri }',
    type: 'object',
    additionalProperties: true,
  })
  @IsObject()
  config: Record<string, unknown>;

  @ApiPropertyOptional({ default: false, description: 'Condivisa con tutto il team' })
  @IsOptional()
  @IsBoolean()
  shared?: boolean;
}

export class UpdateSavedViewDto extends PartialType(CreateSavedViewDto) {}

@Injectable()
export class SavedViewsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Viste proprie + quelle condivise dal team, per una sezione. */
  async findAll(user: JwtUser, section?: string) {
    const views = await this.prisma.savedView.findMany({
      where: {
        ...(section ? { section } : {}),
        OR: [{ userId: user.sub }, { shared: true }],
      },
      orderBy: { createdAt: 'asc' },
    });
    // Il config e' salvato come stringa JSON: al client arriva gia' come oggetto
    return views.map((v) => ({
      ...v,
      config: safeParse(v.config),
      own: v.userId === user.sub,
    }));
  }

  async create(user: JwtUser, dto: CreateSavedViewDto) {
    const view = await this.prisma.savedView.create({
      data: {
        userId: user.sub,
        section: dto.section,
        name: dto.name.trim(),
        config: JSON.stringify(dto.config ?? {}),
        shared: dto.shared ?? false,
      },
    });
    return { ...view, config: safeParse(view.config), own: true };
  }

  /** Solo chi l'ha creata puo' modificarla o cancellarla. */
  private async ownedOrFail(id: string, user: JwtUser) {
    const view = await this.prisma.savedView.findUnique({ where: { id } });
    if (!view) throw new NotFoundException('Vista non trovata');
    if (view.userId !== user.sub) {
      throw new ForbiddenException('Puoi modificare solo le viste che hai creato');
    }
    return view;
  }

  async update(id: string, user: JwtUser, dto: UpdateSavedViewDto) {
    await this.ownedOrFail(id, user);
    const view = await this.prisma.savedView.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.config !== undefined ? { config: JSON.stringify(dto.config) } : {}),
        ...(dto.shared !== undefined ? { shared: dto.shared } : {}),
      },
    });
    return { ...view, config: safeParse(view.config), own: true };
  }

  async remove(id: string, user: JwtUser) {
    await this.ownedOrFail(id, user);
    await this.prisma.savedView.delete({ where: { id } });
    return { deleted: true };
  }
}

/** Un config corrotto non deve far fallire l'intera lista di viste. */
function safeParse(json: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

@ApiTags('saved-views')
@ApiBearerAuth()
@Controller('saved-views')
export class SavedViewsController {
  constructor(private readonly service: SavedViewsService) {}

  @Get()
  @ApiOperation({ summary: 'Viste rapide dell utente (+ quelle condivise) per una sezione' })
  findAll(@CurrentUser() user: JwtUser, @Query('section') section?: string) {
    return this.service.findAll(user, section);
  }

  @Post()
  @ApiOperation({ summary: 'Salva una vista rapida' })
  create(@CurrentUser() user: JwtUser, @Body() dto: CreateSavedViewDto) {
    return this.service.create(user, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Aggiorna una vista (solo il creatore)' })
  update(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateSavedViewDto,
  ) {
    return this.service.update(id, user, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Elimina una vista (solo il creatore)' })
  remove(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.remove(id, user);
  }
}

@Module({
  controllers: [SavedViewsController],
  providers: [SavedViewsService],
})
export class SavedViewsModule {}
