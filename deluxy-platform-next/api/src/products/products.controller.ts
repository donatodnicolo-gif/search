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
import { CreateProductDto, UpdateProductDto } from './dto/create-product.dto';
import { ProductsService } from './products.service';

@ApiTags('products')
@ApiBearerAuth()
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @ApiOperation({ summary: 'Lista prodotti (il partner vede i propri + i visibili)' })
  findAll(@CurrentUser() user: JwtUser) {
    return this.productsService.findAll(user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Dettaglio prodotto' })
  findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.OPERATION, Role.PROJECT_MANAGER, Role.PARTNER)
  @ApiOperation({ summary: 'Crea prodotto (unico/non-unico/superprodotto, con campi)' })
  create(@Body() dto: CreateProductDto, @CurrentUser() user: JwtUser) {
    return this.productsService.create(dto, user);
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.OPERATION, Role.PROJECT_MANAGER, Role.PARTNER)
  @ApiOperation({ summary: 'Aggiorna prodotto' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.productsService.update(id, dto, user);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.OPERATION, Role.PARTNER)
  @ApiOperation({ summary: 'Disattiva prodotto (soft delete)' })
  remove(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.productsService.remove(id, user);
  }

  @Post('categories/:categoryId/generate-discounted')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Genera prodotti scontati automatici da sconti categoria/provincia (arrotondati a 0/5)' })
  generateDiscounted(@Param('categoryId') categoryId: string) {
    return this.productsService.generateDiscountedProducts(categoryId);
  }
}
