import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  BadRequestException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { SettingsService } from '../settings/settings.module';
import { IsBoolean } from 'class-validator';
import { CurrentUser, JwtUser, Roles } from '../common/decorators';
import { Role } from '../common/enums';
import { CreateProductDto, UpdateProductDto } from './dto/create-product.dto';
import { ProductListQueryDto } from './dto/product-list-query.dto';
import { ProductsService } from './products.service';

export class ArchiveProductDto {
  @ApiProperty({ description: 'true = archivia, false = ripristina' })
  @IsBoolean()
  archived: boolean;
}

@ApiTags('products')
@ApiBearerAuth()
// ⚠️ Il guard dei ruoli, SENZA `@Roles`, lascia passare chiunque sia
// autenticato (roles.guard.ts). Questo controller non ne aveva nessuno: un
// VALET leggeva tutto. Provato con un token vero il 27/08/2026. I ruoli qui
// sono gli stessi che il frontend applica alla pagina (app.routes.ts).
@Roles(Role.ADMIN, Role.OPERATION, Role.PROJECT_MANAGER, Role.PARTNER)
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService, private readonly settings: SettingsService) {}

  @Get()
  @ApiOperation({
    summary:
      'Lista prodotti paginata (il partner vede i propri + i visibili). q = ricerca globale; archived=true = sezione Archivio',
  })
  findAll(@CurrentUser() user: JwtUser, @Query() query: ProductListQueryDto) {
    return this.productsService.findAll(user, query);
  }

  @Patch(':id/archive')
  @Roles(Role.ADMIN, Role.OPERATION, Role.PROJECT_MANAGER, Role.PARTNER)
  @ApiOperation({ summary: 'Archivia o ripristina un prodotto (stato separato da Attivo)' })
  setArchived(
    @Param('id') id: string,
    @Body() dto: ArchiveProductDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.productsService.setArchived(id, dto.archived, user);
  }

  @Post('azione-multipla')
  @Roles(Role.ADMIN, Role.OPERATION, Role.PARTNER)
  @ApiOperation({
    summary:
      "Archivia, ripristina o elimina piu prodotti insieme. "
      + "L eliminazione salta quelli usati in consegne o vendite e li archivia invece.",
  })
  azioneMultipla(
    @Body() body: { ids: string[]; azione: 'archivia' | 'ripristina' | 'elimina' },
    @CurrentUser() user: JwtUser,
  ) {
    return this.productsService.azioneMultipla(body?.ids ?? [], body?.azione, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Dettaglio prodotto' })
  findOne(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    // ⚠️ 27/08: era l'unica rotta del modulo senza controllo di proprietà.
    // Misurato: un partner leggeva «Torta CakeDesign personalizzata» di un
    // altro partner. `findAll` filtrava già, `update`/`remove` pure.
    return this.productsService.findOne(id, user);
  }

  @Post()
  @Roles(Role.ADMIN, Role.OPERATION, Role.PROJECT_MANAGER, Role.PARTNER)
  @ApiOperation({ summary: 'Crea prodotto (unico/non-unico/superprodotto, con campi)' })
  create(@Body() dto: CreateProductDto, @CurrentUser() user: JwtUser) {
    return this.productsService.create(dto, user);
  }

  /**
   * ⭐ 11/09/2026 (regola utente: «consenti caricamento di immagini e video da propri file»). Il file
   * va su Drive («File App», Standard §5: OAuth, mai service account) e qui torna il LINK, che il
   * modulo mette fra le immagini del prodotto. Solo immagini e video, 25 MB al massimo. Senza Drive
   * si dice chiaro che non si può: sul serverless il disco è effimero, un file locale sparirebbe.
   */
  @Post('upload')
  @Roles(Role.ADMIN, Role.OPERATION, Role.PROJECT_MANAGER, Role.PARTNER)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Carica un\'immagine o un video del prodotto su Drive e torna il link' })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } }))
  async upload(@UploadedFile() file?: { buffer: Buffer; originalname: string; mimetype: string; size: number }) {
    if (!file) throw new BadRequestException('Nessun file caricato');
    if (!/^(image|video)\//.test(file.mimetype || '')) throw new BadRequestException('Si caricano solo immagini e video.');
    const nome = `prodotto-${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const esito = await this.settings.caricaSuDrive(nome, file.buffer, file.mimetype);
    if (!esito.ok || !esito.link) throw new BadRequestException(`Drive non ha accettato il file${esito.motivo ? ': ' + esito.motivo : ''}. Collega Drive in Impostazioni → File App.`);
    return { url: esito.link, nome, tipo: file.mimetype };
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
