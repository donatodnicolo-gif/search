import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtUser, Roles } from '../common/decorators';
import { Role } from '../common/enums';
import { CustomersService } from './customers.service';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/create-customer.dto';

@ApiTags('customers')
@ApiBearerAuth()
@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @ApiOperation({ summary: 'Lista clienti (il partner vede solo i propri)' })
  findAll(@CurrentUser() user: JwtUser) {
    return this.customersService.findAll(user);
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
