import { existsSync, mkdirSync } from 'fs';
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
@Controller('receipts')
export class ReceiptsController {
  constructor(private readonly receiptsService: ReceiptsService) {}

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
  upload(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @UploadedFile() file?: { filename: string },
  ) {
    if (!file) throw new BadRequestException('Nessun file caricato');
    return this.receiptsService.sign(user, id, `/uploads/receipts/${file.filename}`);
  }
}

@Module({
  controllers: [ReceiptsController],
  providers: [ReceiptsService],
})
export class ReceiptsModule {}
