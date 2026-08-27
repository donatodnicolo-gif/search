import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtUser, Roles } from '../common/decorators';
import { Role } from '../common/enums';
import { ListQueryDto } from '../common/list-query';
import { CustomersService } from './customers.service';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/create-customer.dto';

@ApiTags('customers')
@ApiBearerAuth()
// ⚠️ Il guard dei ruoli, SENZA `@Roles`, lascia passare chiunque sia
// autenticato (roles.guard.ts). Questo controller non ne aveva nessuno: un
// VALET leggeva tutto. Provato con un token vero il 27/08/2026. I ruoli qui
// sono gli stessi che il frontend applica alla pagina (app.routes.ts).
@Roles(Role.ADMIN, Role.OPERATION, Role.PROJECT_MANAGER, Role.PARTNER)
@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @ApiOperation({
    summary:
      'Lista clienti paginata (il partner vede solo i propri). q = ricerca globale sui campi testuali',
  })
  findAll(@CurrentUser() user: JwtUser, @Query() query: ListQueryDto) {
    return this.customersService.findAll(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Dettaglio cliente' })
  findOne(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.customersService.findOne(id, user);
  }

  @Post()
  @Roles(Role.ADMIN, Role.OPERATION, Role.PROJECT_MANAGER, Role.PARTNER)
  @ApiOperation({ summary: 'Crea cliente' })
  create(@Body() dto: CreateCustomerDto, @CurrentUser() user: JwtUser) {
    return this.customersService.create(dto, user);
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.OPERATION, Role.PROJECT_MANAGER, Role.PARTNER)
  @ApiOperation({ summary: 'Aggiorna cliente' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.customersService.update(id, dto, user);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Elimina cliente' })
  remove(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.customersService.remove(id, user);
  }
}
