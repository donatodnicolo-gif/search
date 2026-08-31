import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtUser, Roles } from '../common/decorators';
import { Role } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';

/**
 * SEGNALAZIONI (31/08/2026): l'ufficio (admin/operation) apre segnalazioni su
 * un partner o un valet; i partner e i valet aprono reclami (che sono
 * segnalazioni «in entrata»). Tutto in un posto solo. Il partner/valet vede
 * solo le proprie; l'ufficio le vede tutte e le gestisce.
 */
@Injectable()
export class SegnalazioniService {
  constructor(private readonly prisma: PrismaService) {}

  private async arricchisci(righe: any[]) {
    const partnerIds = [...new Set(righe.map((r) => r.partnerId).filter(Boolean))];
    const valetIds = [...new Set(righe.map((r) => r.valetId).filter(Boolean))];
    const [partner, valet] = await Promise.all([
      partnerIds.length ? this.prisma.partner.findMany({ where: { id: { in: partnerIds } }, select: { id: true, insegna: true } }) : [],
      valetIds.length ? this.prisma.valet.findMany({ where: { id: { in: valetIds } }, select: { id: true, firstName: true, lastName: true } }) : [],
    ]);
    const pMap = new Map<string, string>(partner.map((p) => [p.id, p.insegna] as [string, string]));
    const vMap = new Map<string, string>(valet.map((v) => [v.id, `${v.lastName} ${v.firstName}`] as [string, string]));
    return righe.map((r) => ({
      ...r,
      partnerNome: r.partnerId ? pMap.get(r.partnerId) ?? null : null,
      valetNome: r.valetId ? vMap.get(r.valetId) ?? null : null,
    }));
  }

  async lista(user: JwtUser, stato?: string) {
    const where: any = {};
    if (stato) where.stato = stato;
    // Partner/valet vedono SOLO le proprie.
    if (user.role === Role.PARTNER) where.partnerId = user.partnerId ?? '-';
    else if (user.role === Role.VALET) where.valetId = user.valetId ?? '-';
    const righe = await this.prisma.segnalazione.findMany({ where, orderBy: { createdAt: 'desc' }, take: 500 });
    return this.arricchisci(righe);
  }

  async crea(user: JwtUser, body: {
    tipo?: string; partnerId?: string; valetId?: string; deliveryId?: string; oggetto?: string; testo?: string; importo?: number;
  }) {
    const testo = (body?.testo ?? '').trim();
    if (!testo) throw new BadRequestException('Il testo della segnalazione è obbligatorio.');
    // Partner/valet aprono qualcosa su SE STESSI; l'ufficio una SEGNALAZIONE su
    // chi indica. Il valet può aprire un RECLAMO o una richiesta di RIMBORSO
    // (`tipo: 'rimborso'`, con importo); il partner solo reclami.
    let partnerId = body.partnerId ?? null;
    let valetId = body.valetId ?? null;
    let tipo = body.tipo ?? 'segnalazione';
    let importo: number | null = null;
    if (user.role === Role.PARTNER) { partnerId = user.partnerId ?? null; valetId = null; tipo = 'reclamo'; }
    else if (user.role === Role.VALET) {
      valetId = user.valetId ?? null; partnerId = null;
      tipo = body.tipo === 'rimborso' ? 'rimborso' : 'reclamo';
      if (tipo === 'rimborso') {
        const n = Number(body.importo);
        if (!Number.isFinite(n) || n <= 0) throw new BadRequestException('Indica un importo valido per il rimborso.');
        importo = Math.round(n * 100) / 100;
      }
    }
    return this.prisma.segnalazione.create({
      data: {
        tipo, importo, partnerId, valetId, deliveryId: body.deliveryId ?? null,
        oggetto: body.oggetto?.trim() || null, testo,
        apertaDaUserId: user.sub, apertaDaRuolo: user.role,
      },
    });
  }

  /** Ufficio: cambia stato / risponde. */
  async aggiorna(user: JwtUser, id: string, body: { stato?: string; risposta?: string }) {
    const s = await this.prisma.segnalazione.findUnique({ where: { id } });
    if (!s) throw new BadRequestException('Segnalazione non trovata');
    const data: any = {};
    if (body.stato) { data.stato = body.stato; if (body.stato === 'chiusa') data.chiusaIl = new Date(); }
    if (body.risposta !== undefined) data.risposta = body.risposta?.trim() || null;
    return this.prisma.segnalazione.update({ where: { id }, data });
  }
}

@ApiTags('segnalazioni')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.OPERATION, Role.PARTNER, Role.VALET)
@Controller('segnalazioni')
export class SegnalazioniController {
  constructor(private readonly service: SegnalazioniService) {}

  @Get()
  @ApiOperation({ summary: 'Elenco segnalazioni (partner/valet solo le proprie)' })
  lista(@CurrentUser() user: JwtUser, @Query('stato') stato?: string) {
    return this.service.lista(user, stato);
  }

  @Post()
  @ApiOperation({ summary: 'Apre una segnalazione (ufficio) o un reclamo (partner/valet)' })
  crea(@CurrentUser() user: JwtUser, @Body() body: any) {
    return this.service.crea(user, body);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Aggiorna stato/risposta di una segnalazione (ufficio)' })
  aggiorna(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() body: any) {
    return this.service.aggiorna(user, id, body);
  }
}

@Module({
  controllers: [SegnalazioniController],
  providers: [SegnalazioniService],
})
export class SegnalazioniModule {}
