import {
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
  PartialType,
} from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsIn, IsOptional, IsString } from 'class-validator';

/** Ruoli operatore e sezioni visibili. */
export const OPERATION_ROLES = [
  'operation',
  'finance',
  'project_manager',
  'customer_service',
] as const;
import { CurrentUser, JwtUser, Roles } from '../common/decorators';
import { Role } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';
import { UsersModule } from '../users/users.module';
import { UsersService } from '../users/users.service';

export class CreateOperationDto {
  @ApiProperty()
  @IsString()
  firstName: string;

  @ApiProperty()
  @IsString()
  lastName: string;

  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  notifyWhatsapp?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  notifyMail?: boolean;

  @ApiPropertyOptional({
    enum: OPERATION_ROLES,
    default: 'operation',
    description:
      'Ruolo: operation (base) | finance (vede Amministrazione) | project_manager (no Operatività) | customer_service (no Amministrazione)',
  })
  @IsOptional()
  @IsIn(OPERATION_ROLES as unknown as string[])
  operationRole?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ default: true, description: 'Operatore attivo/disattivo' })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateOperationDto extends PartialType(CreateOperationDto) {}

@Injectable()
export class OperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  findAll() {
    return this.prisma.operation.findMany({ orderBy: { lastName: 'asc' } });
  }

  async findOne(id: string) {
    const operation = await this.prisma.operation.findUnique({ where: { id } });
    if (!operation) throw new NotFoundException('Operatore non trovato');
    return operation;
  }

  async create(dto: CreateOperationDto, actor?: JwtUser) {
    const operation = await this.prisma.operation.create({ data: dto });
    // Un gesto solo: crea l'utente collegato (invitato). Project Manager è un
    // ruolo di accesso a sé; gli altri sotto-ruoli restano OPERATION.
    const role =
      operation.operationRole === 'project_manager' ? Role.PROJECT_MANAGER : Role.OPERATION;
    await this.users.provisionForAnagrafica(
      {
        email: operation.email,
        firstName: operation.firstName,
        lastName: operation.lastName,
        role,
        operationId: operation.id,
      },
      actor,
    );
    return operation;
  }

  update(id: string, dto: UpdateOperationDto) {
    return this.prisma.operation.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.prisma.operation.update({ where: { id }, data: { active: false } });
    return { deactivated: true };
  }
}

@ApiTags('operations')
@ApiBearerAuth()
@Controller('operations')
export class OperationsController {
  constructor(private readonly operationsService: OperationsService) {}

  @Get()
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Lista operatori (staff ufficio)' })
  findAll() {
    return this.operationsService.findAll();
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Dettaglio operatore' })
  findOne(@Param('id') id: string) {
    return this.operationsService.findOne(id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Crea operatore' })
  create(@Body() dto: CreateOperationDto, @CurrentUser() actor: JwtUser) {
    return this.operationsService.create(dto, actor);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Modifica operatore' })
  update(@Param('id') id: string, @Body() dto: UpdateOperationDto) {
    return this.operationsService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Disattiva operatore' })
  remove(@Param('id') id: string) {
    return this.operationsService.remove(id);
  }
}

@Module({
  imports: [UsersModule],
  controllers: [OperationsController],
  providers: [OperationsService],
})
export class OperationsModule {}
