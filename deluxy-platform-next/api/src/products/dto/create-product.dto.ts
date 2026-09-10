import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
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

  @ApiPropertyOptional({ description: 'Prezzo pubblico variante' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  publicPrice?: number;

  @ApiPropertyOptional({ description: 'SKU variante (generato automaticamente: <SKU prodotto>-NN)' })
  @IsOptional()
  @IsString()
  sku?: string;

  @ApiPropertyOptional({ description: 'Nota di specifica della taglia: «10-15 fiori» (⭐ 07/09/2026)' })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({ description: 'Immagine della variante (URL)' })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({ description: 'Giorni di preparazione variante' })
  @IsOptional()
  @IsInt()
  @Min(0)
  prepDays?: number;

  @ApiPropertyOptional({ default: false, description: 'Controlla stock variante' })
  @IsOptional()
  @IsBoolean()
  controlStock?: boolean;

  @ApiPropertyOptional({ description: 'Giacenza variante' })
  @IsOptional()
  @IsInt()
  @Min(0)
  stock?: number;
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

  @ApiPropertyOptional({ description: 'Immagine principale (URL)' })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({ type: [String], description: 'Galleria immagini (URL)' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @ApiPropertyOptional({ description: 'Descrizione per piattaforma { piattaforma: testo }' })
  @IsOptional()
  @IsObject()
  platformDescriptions?: Record<string, string>;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  approved?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiProperty({ enum: ProductType, description: 'Chi lo vende: UNICO (di un partner) | NON_UNICO (es. fiori)' })
  @IsEnum(ProductType)
  type: ProductType;

  /**
   * Com'e' fatto: combinazione di piu' prodotti. Indipendente da `type` —
   * un prodotto puo' essere unico di un partner E combinato.
   */
  @ApiPropertyOptional({ description: 'Super prodotto: combinazione di piu prodotti' })
  @IsOptional()
  @IsBoolean()
  isSuperProduct?: boolean;

  @ApiPropertyOptional({ description: 'Partner proprietario (obbligatorio per UNICO)' })
  @IsOptional()
  @IsString()
  partnerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;

  // ⭐ 06/09/2026 (regola utente): la TIPOLOGIA DI VENDITA dice come si sceglie il fornitore
  // e come si fa il prezzo. La casa è Merchandising; qui si può scrivere perché un partner
  // carica il suo prodotto da questa app, e allora la tipologia nasce qui.
  // Valore chiuso: un testo libero renderebbe la classificazione inservibile.
  @ApiPropertyOptional({ description: "Nota di specifica del prodotto: che cosa c'è dentro (20-25 fiori, 6/8 porzioni). Arriva da Merchandising e la vede il fioraio." })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({ enum: ['unico', 'quantita', 'mix', 'preventivo'], description: 'Come si vende: unico | quantita | mix | preventivo' })
  @IsOptional()
  @IsIn(['unico', 'quantita', 'mix', 'preventivo'])
  tipologiaVendita?: string;

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

  @ApiPropertyOptional({ default: false, description: 'Prodotto APP: vive solo nella piattaforma consegne, non si espone a Merchandising' })
  @IsOptional()
  @IsBoolean()
  prodottoApp?: boolean;

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

  @ApiPropertyOptional({ type: [ProductComponentDto], description: 'Componenti (solo se isSuperProduct)' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductComponentDto)
  components?: ProductComponentDto[];
}

export class UpdateProductDto extends PartialType(CreateProductDto) {}
