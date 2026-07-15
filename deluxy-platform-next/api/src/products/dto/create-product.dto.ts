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

export class ProductVariantDto {
  @ApiProperty({ description: 'Valore opzione (es. "Media")' })
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  price?: number;
}

export class CreateProductDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Plus del prodotto (max 80 char)' })
  @IsOptional()
  @IsString()
  shortDesc?: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  price: number;

  @ApiPropertyOptional({ description: 'Prezzo pubblico' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  publicPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sku?: string;

  @ApiPropertyOptional({ description: 'Giorni di preparazione' })
  @IsOptional()
  @IsInt()
  @Min(0)
  prepDays?: number;

  @ApiPropertyOptional({ description: 'Linea / brand' })
  @IsOptional()
  @IsString()
  line?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  approved?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

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

  @ApiPropertyOptional({ default: false, description: 'Non modificabile' })
  @IsOptional()
  @IsBoolean()
  notEditable?: boolean;

  @ApiPropertyOptional({ default: false, description: 'Controlla stock' })
  @IsOptional()
  @IsBoolean()
  controlStock?: boolean;

  @ApiPropertyOptional({ description: 'Giacenza' })
  @IsOptional()
  @IsInt()
  @Min(0)
  stock?: number;

  @ApiPropertyOptional({ default: false, description: 'Prodotto non fisico' })
  @IsOptional()
  @IsBoolean()
  notPhysical?: boolean;

  @ApiPropertyOptional({ default: false, description: 'Super provincia' })
  @IsOptional()
  @IsBoolean()
  isSuperProvince?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  useAlternateName?: boolean;

  @ApiPropertyOptional({ description: 'Nome alternativo del prodotto' })
  @IsOptional()
  @IsString()
  alternateName?: string;

  @ApiPropertyOptional({ type: [String], description: 'Piattaforme: deluxy|cakes|flowers|business|experience|dotcom' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  platforms?: string[];

  @ApiPropertyOptional({ default: false, description: 'Il prodotto ha varianti' })
  @IsOptional()
  @IsBoolean()
  hasVariants?: boolean;

  @ApiPropertyOptional({ description: 'Titolo opzione varianti (es. Dimensione)' })
  @IsOptional()
  @IsString()
  optionTitle?: string;

  @ApiPropertyOptional({ type: [ProductVariantDto], description: 'Varianti (nome + prezzo, SKU auto)' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductVariantDto)
  variants?: ProductVariantDto[];

  @ApiPropertyOptional({ type: [String], description: 'ID partner aggiuntivi (PRODUCTS PARTNER)' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  additionalPartnerIds?: string[];

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
