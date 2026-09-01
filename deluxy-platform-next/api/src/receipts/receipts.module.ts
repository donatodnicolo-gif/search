import { existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtUser, Roles } from '../common/decorators';
import { Role, SalaryStatus } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsModule, SettingsService } from '../settings/settings.module';

const RECEIPTS_DIR = join(process.cwd(), 'uploads', 'receipts');

/** Storage su disco per le ricevute caricate dal PC (servite poi da /uploads/receipts). */
const receiptStorage = diskStorage({
  destination: (_req, _file, cb) => {
    if (!existsSync(RECEIPTS_DIR)) mkdirSync(RECEIPTS_DIR, { recursive: true });
    cb(null, RECEIPTS_DIR);
  },
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  },
});

@Injectable()
export class ReceiptsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Ricevute generate dall'invio degli stipendi. Il valet vede solo le proprie. */
  findAll(user: JwtUser, signed?: boolean) {
    const where: any = {};
    if (typeof signed === 'boolean') where.signed = signed;
    // ⚠️ Le 350 ricevute importate dal legacy NON hanno uno stipendio: il
    // valet sta sulla ricevuta stessa (`Receipt.valetId`). Cercarlo solo
    // attraverso lo stipendio le faceva sembrare di nessuno — e al valet non
    // uscivano proprio.
    if (user.role === Role.VALET) {
      where.OR = [
        { salary: { valetId: user.valetId ?? '-' } },
        { valetId: user.valetId ?? '-' },
      ];
    }
    return this.prisma.receipt.findMany({
      where,
      include: {
        valet: { select: { id: true, firstName: true, lastName: true } },
        salary: {
          include: { valet: { select: { id: true, firstName: true, lastName: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Il valet carica la ricevuta firmata (URL del file, come per gli altri allegati).
   * La ricevuta passa a "firmata" e lo stipendio avanza a RECEIPT_PENDING (da approvare).
   */
  async sign(user: JwtUser, id: string, fileUrl?: string) {
    const receipt = await this.prisma.receipt.findUnique({
      where: { id },
      include: { salary: true },
    });
    if (!receipt) throw new NotFoundException('Ricevuta non trovata');
    // ⚠️ `salary` è facoltativo da quando esistono le ricevute importate dal
    // legacy, che appartengono a un valet ma non a uno stipendio: il controllo
    // ricade sul valet della ricevuta.
    const valetDellaRicevuta = receipt.salary?.valetId ?? receipt.valetId;
    if (user.role === Role.VALET && valetDellaRicevuta !== user.valetId) {
      throw new ForbiddenException('Accesso non consentito');
    }
    if (!fileUrl) throw new BadRequestException('Allega il file della ricevuta firmata');

    // Lo stipendio avanza solo se la ricevuta ne ha uno.
    if (receipt.salaryId) {
      await this.prisma.salary.update({
        where: { id: receipt.salaryId },
        data: { status: SalaryStatus.RECEIPT_PENDING },
      });
    }
    return this.prisma.receipt.update({
      where: { id },
      data: { signed: true, signedAt: new Date(), fileUrl },
    });
  }
}

@ApiTags('receipts')
@ApiBearerAuth()
// ⚠️ Il guard dei ruoli, SENZA `@Roles`, lascia passare chiunque sia
// autenticato (roles.guard.ts). Qui non c'era: un PARTNER leggeva il denaro
// dei VALET. Misurato il 27/08/2026 con un token vero di partner —
// /receipts 160,8 KB, /payments 238,4 KB, /salaries/pending 40 KB, e il recap
// paghe di un valet qualsiasi rispondeva 200. I ruoli sono gli stessi che il
// frontend applica alle pagine corrispondenti (app.routes.ts).
@Roles(Role.ADMIN, Role.OPERATION, Role.VALET)
@Controller('receipts')
export class ReceiptsController {
  constructor(
    private readonly receiptsService: ReceiptsService,
    private readonly settings: SettingsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Ricevute stipendi (il valet vede le proprie). signed=true/false per filtrare' })
  @ApiQuery({ name: 'signed', required: false })
  findAll(@CurrentUser() user: JwtUser, @Query('signed') signed?: string) {
    const flag = signed === undefined ? undefined : signed === 'true';
    return this.receiptsService.findAll(user, flag);
  }

  @Post(':id/sign')
  @Roles(Role.ADMIN, Role.OPERATION, Role.VALET)
  @ApiOperation({ summary: 'Carica la ricevuta firmata via URL → stipendio in approvazione' })
  sign(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() body: { fileUrl?: string }) {
    return this.receiptsService.sign(user, id, body.fileUrl);
  }

  @Post(':id/upload')
  @Roles(Role.ADMIN, Role.OPERATION, Role.VALET)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Carica la ricevuta firmata come FILE dal PC → stipendio in approvazione' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: receiptStorage,
      limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
    }),
  )
  async upload(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @UploadedFile() file?: { filename: string; path: string; originalname: string; mimetype: string },
  ) {
    if (!file) throw new BadRequestException('Nessun file caricato');
    // ⭐ 01/09 (decisione utente, Standard §5): se Drive è COLLEGATO (OAuth,
    // mai service account) la ricevuta va nella cartella Drive — sul serverless
    // il disco è effimero e i file spariscono al redeploy. Se Drive non c'è o
    // rifiuta, si tiene il percorso locale di sempre: meglio un file effimero
    // che un upload fallito.
    try {
      const nome = `ricevuta-${id}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const esito = await this.settings.caricaSuDrive(
        nome,
        readFileSync(file.path),
        file.mimetype || 'application/octet-stream',
      );
      if (esito.ok && esito.link) return this.receiptsService.sign(user, id, esito.link);
    } catch {
      // Drive è un di più: il percorso di sempre resta la rete di sicurezza.
    }
    return this.receiptsService.sign(user, id, `/uploads/receipts/${file.filename}`);
  }
}

@Module({
  imports: [SettingsModule],
  controllers: [ReceiptsController],
  providers: [ReceiptsService],
})
export class ReceiptsModule {}
