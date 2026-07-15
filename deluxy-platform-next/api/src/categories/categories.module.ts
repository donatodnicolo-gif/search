import { Body, Controller, Get, Injectable, Module, Param, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
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

const CATEGORY_INCLUDE = {
  fields: true,
  discounts: { include: { province: true } },
} as const;

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.category.findMany({
      include: CATEGORY_INCLUDE,
      orderBy: { name: 'asc' },
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
  findAll() {
    return this.categoriesService.findAll();
  }

  @Post()
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Crea categoria (con campi extra e sconti provincia)' })
  create(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(dto);
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
