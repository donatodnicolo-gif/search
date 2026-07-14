import { Body, Controller, Get, Injectable, Module, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators';
import { Role } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.category.findMany({
      include: { discounts: { include: { province: true } } },
      orderBy: { name: 'asc' },
    });
  }

  create(name: string) {
    return this.prisma.category.create({ data: { name } });
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
  @ApiOperation({ summary: 'Lista categorie con sconti per provincia' })
  findAll() {
    return this.categoriesService.findAll();
  }

  @Post()
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Crea categoria' })
  create(@Body() body: { name: string }) {
    return this.categoriesService.create(body.name);
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
