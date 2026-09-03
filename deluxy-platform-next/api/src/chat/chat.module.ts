import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  Module,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtUser, Roles } from '../common/decorators';
import { Role } from '../common/enums';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';

/**
 * CHAT IN APP (03/09/2026, regola utente): valet e partner scrivono
 * all'UFFICIO direttamente in piattaforma — un filo per controparte, come le
 * conversazioni del Customer Service. Admin e operation vedono tutti i fili,
 * rispondono, e i non-letti accendono i pallini.
 *
 * Niente websocket: su serverless il «tempo reale» è un polling educato
 * (pannello aperto: pochi secondi; pallini: mezzo minuto) — stessa via del CS.
 */
@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  private eUfficio(user: JwtUser): boolean {
    return user.role === Role.ADMIN || user.role === Role.OPERATION;
  }

  /** Il filo della controparte (valet o partner), creato al primo accesso. */
  private async filoDi(user: JwtUser) {
    if (user.role === Role.VALET) {
      if (!user.valetId) throw new ForbiddenException('Utente valet senza scheda.');
      return this.prisma.chatThread.upsert({
        where: { valetId: user.valetId },
        update: {},
        create: { valetId: user.valetId },
      });
    }
    if (user.role === Role.PARTNER) {
      if (!user.partnerId) throw new ForbiddenException('Utente partner senza scheda.');
      return this.prisma.chatThread.upsert({
        where: { partnerId: user.partnerId },
        update: {},
        create: { partnerId: user.partnerId },
      });
    }
    throw new ForbiddenException('L\'ufficio entra dai fili, non da qui.');
  }

  /** La MIA conversazione (valet/partner): messaggi e lettura automatica. */
  async mia(user: JwtUser) {
    const filo = await this.filoDi(user);
    const messaggi = await this.prisma.chatMessage.findMany({
      where: { threadId: filo.id },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    // Leggere la chat È leggere: i messaggi dell'ufficio si marcano letti.
    await this.prisma.chatMessage.updateMany({
      where: { threadId: filo.id, dalUfficio: true, letto: false },
      data: { letto: true },
    });
    return { threadId: filo.id, messaggi };
  }

  /** I fili per l'ufficio: controparte, ultimo messaggio, non letti. */
  async fili(user: JwtUser) {
    if (!this.eUfficio(user)) throw new ForbiddenException('Solo ufficio.');
    const fili = await this.prisma.chatThread.findMany({
      orderBy: { lastMessageAt: 'desc' },
      take: 200,
      include: {
        valet: { select: { firstName: true, lastName: true } },
        partner: { select: { insegna: true } },
        messaggi: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    const nonLetti = await this.prisma.chatMessage.groupBy({
      by: ['threadId'],
      where: { dalUfficio: false, letto: false },
      _count: true,
    });
    const mappa = new Map(nonLetti.map((x) => [x.threadId, x._count]));
    return fili.map((f) => ({
      id: f.id,
      controparte: f.partner ? f.partner.insegna : `${f.valet?.firstName ?? ''} ${f.valet?.lastName ?? ''}`.trim(),
      tipo: f.partnerId ? 'partner' : 'valet',
      lastMessageAt: f.lastMessageAt,
      ultimo: f.messaggi[0]?.testo ?? '',
      nonLetti: mappa.get(f.id) ?? 0,
    }));
  }

  /** Un filo aperto dall'ufficio: messaggi + lettura automatica. */
  async filo(user: JwtUser, threadId: string) {
    if (!this.eUfficio(user)) throw new ForbiddenException('Solo ufficio.');
    const filo = await this.prisma.chatThread.findUnique({
      where: { id: threadId },
      include: {
        valet: { select: { firstName: true, lastName: true } },
        partner: { select: { insegna: true } },
      },
    });
    if (!filo) throw new BadRequestException('Filo inesistente.');
    const messaggi = await this.prisma.chatMessage.findMany({
      where: { threadId },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    await this.prisma.chatMessage.updateMany({
      where: { threadId, dalUfficio: false, letto: false },
      data: { letto: true },
    });
    return {
      threadId,
      controparte: filo.partner ? filo.partner.insegna : `${filo.valet?.firstName ?? ''} ${filo.valet?.lastName ?? ''}`.trim(),
      messaggi,
    };
  }

  /** Scrive un messaggio: l'ufficio indica il filo, la controparte usa il suo. */
  async scrivi(user: JwtUser, body: { threadId?: string; testo?: string }) {
    const testo = (body.testo ?? '').trim().slice(0, 2000);
    if (!testo) throw new BadRequestException('Il messaggio è vuoto.');
    const ufficio = this.eUfficio(user);
    let threadId: string;
    if (ufficio) {
      if (!body.threadId) throw new BadRequestException('Serve il filo (threadId).');
      const c = await this.prisma.chatThread.count({ where: { id: body.threadId } });
      if (!c) throw new BadRequestException('Filo inesistente.');
      threadId = body.threadId;
    } else {
      threadId = (await this.filoDi(user)).id;
    }
    const chi = await this.prisma.user.findUnique({
      where: { id: user.sub },
      select: { firstName: true, lastName: true },
    });
    const msg = await this.prisma.chatMessage.create({
      data: {
        threadId,
        dalUfficio: ufficio,
        userId: user.sub,
        autore: `${chi?.firstName ?? ''} ${chi?.lastName ?? ''}`.trim() || null,
        testo,
      },
    });
    await this.prisma.chatThread.update({ where: { id: threadId }, data: { lastMessageAt: msg.createdAt } });
    return msg;
  }

  /**
   * LE NOVITÀ per i pallini gialli (03/09): conteggi vivi per sezione,
   * calcolati per ruolo. Un numero > 0 = pallino acceso.
   */
  async novita(user: JwtUser) {
    if (this.eUfficio(user)) {
      const [chat, vendite, segnalazioni] = await Promise.all([
        this.prisma.chatMessage.count({ where: { dalUfficio: false, letto: false } }),
        this.prisma.sale.count({ where: { status: 'da_gestire' } }),
        this.prisma.segnalazione.count({ where: { stato: 'aperta' } }),
      ]);
      return { chat, vendite, segnalazioni };
    }
    if (user.role === Role.PARTNER) {
      const filo = await this.prisma.chatThread.findUnique({ where: { partnerId: user.partnerId ?? '-' }, select: { id: true } });
      const [chat, proposte, consegne] = await Promise.all([
        filo ? this.prisma.chatMessage.count({ where: { threadId: filo.id, dalUfficio: true, letto: false } }) : 0,
        this.prisma.sale.count({ where: { partnerId: user.partnerId ?? '-', status: 'proposta' } }),
        this.prisma.delivery.count({ where: { partnerId: user.partnerId ?? '-', deletedAt: null, readAtByPartner: null, status: { in: ['created', 'assigned'] } } }),
      ]);
      return { chat, vendite: proposte, consegne };
    }
    if (user.role === Role.VALET) {
      const filo = await this.prisma.chatThread.findUnique({ where: { valetId: user.valetId ?? '-' }, select: { id: true } });
      const [chat, consegne] = await Promise.all([
        filo ? this.prisma.chatMessage.count({ where: { threadId: filo.id, dalUfficio: true, letto: false } }) : 0,
        this.prisma.delivery.count({ where: { valetId: user.valetId ?? '-', deletedAt: null, readAtByValet: null, status: { in: ['assigned', 'accepted', 'in_preparation'] } } }),
      ]);
      return { chat, consegne };
    }
    return { chat: 0 };
  }
}

@ApiTags('chat')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.OPERATION, Role.PARTNER, Role.VALET)
@Controller('chat')
export class ChatController {
  constructor(private readonly service: ChatService) {}

  @Get('mia')
  @Roles(Role.PARTNER, Role.VALET)
  @ApiOperation({ summary: 'La mia conversazione con l\'ufficio (creata al primo accesso)' })
  mia(@CurrentUser() user: JwtUser) {
    return this.service.mia(user);
  }

  @Get('fili')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'I fili di chat (ufficio): controparte, ultimo messaggio, non letti' })
  fili(@CurrentUser() user: JwtUser) {
    return this.service.fili(user);
  }

  @Get('fili/:id')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Un filo aperto dall\'ufficio (segna letti i messaggi in entrata)' })
  filo(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.filo(user, id);
  }

  @Post('messaggi')
  @ApiOperation({ summary: 'Scrive un messaggio (l\'ufficio indica il filo)' })
  scrivi(@CurrentUser() user: JwtUser, @Body() body: { threadId?: string; testo?: string }) {
    return this.service.scrivi(user, body);
  }

  @Get('novita')
  @ApiOperation({ summary: 'Conteggi per i pallini gialli (per ruolo)' })
  novita(@CurrentUser() user: JwtUser) {
    return this.service.novita(user);
  }
}

@Module({
  imports: [PrismaModule],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
