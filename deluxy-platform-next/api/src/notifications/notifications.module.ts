// ============================================================
// Notifiche in-app + Web Push
// ------------------------------------------------------------
// Porta nel nuovo ambiente il modulo `web-push-notification`
// dell'app reale (contatore nell'header + storico). I punti in
// cui l'app avvisa Admin e Operation sono quelli documentati al
// §5 di docs/COME-FUNZIONA-APP-DELUXY.md (ritiro / consegnato /
// non consegnato).
//
// Il Web Push e' best-effort: la notifica in-app viene salvata
// comunque su DB: se il push fallisce (browser offline,
// iscrizione scaduta) l'utente la vede lo stesso entrando in app.
// ============================================================
import {
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  Logger,
  Module,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import webpush from 'web-push';
import { CurrentUser, JwtUser } from '../common/decorators';
import { NotificationType, Role, UserStatus } from '../common/enums';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';

export class SubscribeDto {
  @ApiProperty({ description: 'Endpoint assegnato dal push service del browser' })
  @IsString()
  endpoint: string;

  @ApiProperty({ description: 'Chiave pubblica del client (p256dh)' })
  @IsString()
  p256dh: string;

  @ApiProperty({ description: 'Segreto di autenticazione del client' })
  @IsString()
  auth: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  userAgent?: string;
}

export class ListNotificationsDto {
  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiProperty({ required: false, default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

/** Payload di una notifica da creare. */
export interface NotifyInput {
  type: NotificationType;
  title: string;
  body: string;
  entityType?: string;
  entityId?: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  /** Il Web Push si attiva solo se le chiavi VAPID sono configurate. */
  private readonly pushEnabled: boolean;

  constructor(private readonly prisma: PrismaService) {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    this.pushEnabled = Boolean(publicKey && privateKey);
    if (this.pushEnabled) {
      webpush.setVapidDetails(
        process.env.VAPID_SUBJECT ?? 'mailto:info@deluxy.it',
        publicKey!,
        privateKey!,
      );
    } else {
      // Non e' un errore: senza chiavi l'app funziona con le sole notifiche
      // in-app (utile in dev e nei test).
      this.logger.warn(
        'VAPID non configurate: le notifiche restano solo in-app (nessun push al browser).',
      );
    }
  }

  get vapidPublicKey(): string | null {
    return this.pushEnabled ? process.env.VAPID_PUBLIC_KEY! : null;
  }

  // ---------------- lettura ----------------

  async list(user: JwtUser, dto: ListNotificationsDto) {
    const page = dto.page ?? 1;
    const pageSize = dto.pageSize ?? 20;
    const [items, total, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId: user.sub },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.notification.count({ where: { userId: user.sub } }),
      this.prisma.notification.count({ where: { userId: user.sub, readAt: null } }),
    ]);
    return { items, total, page, pageSize, unread };
  }

  /** Contatore dell'header: solo le non lette. */
  async unreadCount(user: JwtUser) {
    const count = await this.prisma.notification.count({
      where: { userId: user.sub, readAt: null },
    });
    return { count };
  }

  // ---------------- scrittura ----------------

  /** Segna letta una notifica (solo se e' dell'utente). `updateMany` evita di
   *  dover prima leggere il record per verificarne il proprietario. */
  async markRead(id: string, user: JwtUser) {
    const { count } = await this.prisma.notification.updateMany({
      where: { id, userId: user.sub, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: count };
  }

  async markAllRead(user: JwtUser) {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId: user.sub, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: count };
  }

  // ---------------- iscrizioni push ----------------

  /** Idempotente: lo stesso browser che si re-iscrive aggiorna le sue chiavi
   *  invece di creare un duplicato (l'endpoint e' unique). */
  async subscribe(user: JwtUser, dto: SubscribeDto) {
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      create: {
        userId: user.sub,
        endpoint: dto.endpoint,
        p256dh: dto.p256dh,
        auth: dto.auth,
        userAgent: dto.userAgent ?? null,
      },
      update: { userId: user.sub, p256dh: dto.p256dh, auth: dto.auth },
    });
    return { subscribed: true };
  }

  async unsubscribe(endpoint: string, user: JwtUser) {
    const { count } = await this.prisma.pushSubscription.deleteMany({
      where: { endpoint, userId: user.sub },
    });
    return { deleted: count };
  }

  // ---------------- invio (usato dagli altri moduli) ----------------

  /**
   * Crea le notifiche a DB e prova a inviare il push. Non solleva mai:
   * un guasto delle notifiche non deve far fallire l'operazione di business
   * che le ha generate (es. il valet che segna "consegnato").
   */
  async notifyUsers(userIds: string[], input: NotifyInput): Promise<void> {
    const unique = [...new Set(userIds)];
    if (unique.length === 0) return;
    try {
      await this.prisma.notification.createMany({
        data: unique.map((userId) => ({
          userId,
          type: input.type,
          title: input.title,
          body: input.body,
          entityType: input.entityType ?? null,
          entityId: input.entityId ?? null,
        })),
      });
      await this.sendPush(unique, input);
    } catch (err) {
      this.logger.error(`Invio notifica "${input.type}" fallito: ${String(err)}`);
    }
  }

  /** Destinatari dei fatti operativi: Admin + Operation attivi (come l'app reale). */
  async adminAndOperationIds(excludeUserId?: string): Promise<string[]> {
    const users = await this.prisma.user.findMany({
      where: {
        role: { in: [Role.ADMIN, Role.OPERATION] },
        status: UserStatus.ACTIVE,
        ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
      },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }

  private async sendPush(userIds: string[], input: NotifyInput): Promise<void> {
    if (!this.pushEnabled) return;
    const subs = await this.prisma.pushSubscription.findMany({
      where: { userId: { in: userIds } },
    });
    if (subs.length === 0) return;

    const payload = JSON.stringify({
      title: input.title,
      body: input.body,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
    });

    // Su serverless bisogna attendere gli invii: se la funzione ritorna prima,
    // le richieste in volo vengono troncate.
    const results = await Promise.allSettled(
      subs.map((s) =>
        webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        ),
      ),
    );

    // 404/410 = iscrizione morta (browser disinstallato, permesso revocato):
    // va rimossa, altrimenti resta a sporcare ogni invio successivo.
    const dead: string[] = [];
    results.forEach((res, i) => {
      if (res.status === 'rejected') {
        const code = (res.reason as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) dead.push(subs[i].endpoint);
        else this.logger.warn(`Push fallito (${code ?? 'errore'}) su ${subs[i].endpoint}`);
      }
    });
    if (dead.length > 0) {
      await this.prisma.pushSubscription.deleteMany({ where: { endpoint: { in: dead } } });
      this.logger.log(`Rimosse ${dead.length} iscrizioni push non piu' valide`);
    }
  }
}

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Storico notifiche dell utente (piu recenti prima)' })
  list(@CurrentUser() user: JwtUser, @Query() dto: ListNotificationsDto) {
    return this.service.list(user, dto);
  }

  @Get('count')
  @ApiOperation({ summary: 'Numero di notifiche non lette (contatore header)' })
  count(@CurrentUser() user: JwtUser) {
    return this.service.unreadCount(user);
  }

  @Get('vapid-public-key')
  @ApiOperation({ summary: 'Chiave pubblica VAPID per iscriversi al Web Push' })
  vapidKey() {
    return { publicKey: this.service.vapidPublicKey };
  }

  @Post('subscribe')
  @ApiOperation({ summary: 'Registra questo browser per il Web Push' })
  subscribe(@CurrentUser() user: JwtUser, @Body() dto: SubscribeDto) {
    return this.service.subscribe(user, dto);
  }

  @Delete('subscribe')
  @ApiOperation({ summary: 'Disiscrive questo browser dal Web Push' })
  unsubscribe(@CurrentUser() user: JwtUser, @Body('endpoint') endpoint: string) {
    return this.service.unsubscribe(endpoint, user);
  }

  @Post(':id/read')
  @ApiOperation({ summary: 'Segna una notifica come letta' })
  markRead(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.markRead(id, user);
  }

  @Post('read-all')
  @ApiOperation({ summary: 'Segna tutte le notifiche come lette' })
  markAllRead(@CurrentUser() user: JwtUser) {
    return this.service.markAllRead(user);
  }
}

@Module({
  imports: [PrismaModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
