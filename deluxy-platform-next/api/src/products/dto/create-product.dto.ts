import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { ProductType } from '../../common/enums';

export class ProductFieldDto {
  @ApiProperty({ example: 'Messaggio sul biglietto' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional({ default: false, description: 'Visibile/compilabile solo da admin' })
  @IsOptional()
  @IsBoolean()
  adminOnly?: boolean;
}

export class ProductComponentDto {
  @ApiProperty()
  @IsString()
  componentProductId: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;
}

export class CreateProductDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  price: number;

  @ApiProperty({ enum: ProductType, description: 'UNICO (di un partner) | NON_UNICO (es. fiori) | SUPERPRODOTTO (combinazione)' })
  @IsEnum(ProductType)
  type: ProductType;

  @ApiPropertyOptional({ description: 'Partner proprietario (obbligatorio per UNICO)' })
  @IsOptional()
  @IsString()
  partnerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  visibleToOtherPartners?: boolean;

  @ApiPropertyOptional({ type: [ProductFieldDto], description: 'Campi testuali (obbligatori/opzionali/solo-admin)' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductFieldDto)
  fields?: ProductFieldDto[];

  @ApiPropertyOptional({ type: [ProductComponentDto], description: 'Componenti (solo SUPERPRODOTTO)' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductComponentDto)
  components?: ProductComponentDto[];
}

export class UpdateProductDto extends PartialType(CreateProductDto) {}
