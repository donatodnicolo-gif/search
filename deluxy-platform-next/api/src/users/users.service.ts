import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { JwtUser } from '../common/decorators';
import { UserStatus } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto, UpdateUserDto } from './dto/create-user.dto';

const INVITE_TTL_DAYS = 7;

const USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  isSupport: true,
  status: true,
  partnerId: true,
  valetId: true,
  operationId: true,
  activatedAt: true,
  inviteTokenExpiresAt: true,
  createdAt: true,
  partner: { select: { id: true, insegna: true } },
  valet: { select: { id: true, firstName: true, lastName: true } },
  operation: { select: { id: true, firstName: true, lastName: true } },
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.user.findMany({
      select: USER_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { ...USER_SELECT, events: { orderBy: { createdAt: 'desc' } } },
    });
    if (!user) throw new NotFoundException('Utente non trovato');
    return user;
  }

  /** Crea un utente. Con password → subito attivo; senza password → invitato
   *  (genera il token di invito con cui la persona sceglierà la password). */
  async create(dto: CreateUserDto, actor?: JwtUser) {
    const { password, ...rest } = dto;
    const email = dto.email.toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new BadRequestException('Esiste già un utente con questa email');

    const invited = !password;
    const invite = invited ? this.newInviteToken() : {};
    const user = await this.prisma.user.create({
      data: {
        ...rest,
        email,
        passwordHash: password ? await bcrypt.hash(password, 10) : null,
        status: invited ? UserStatus.INVITED : UserStatus.ACTIVE,
        activatedAt: invited ? null : new Date(),
        ...invite,
      },
      select: { ...USER_SELECT, inviteToken: true },
    });
    await this.logEvent(user.id, 'created', actor);
    if (invited) await this.logEvent(user.id, 'invited', actor);
    return user;
  }

  async update(id: string, dto: UpdateUserDto, actor?: JwtUser) {
    const before = await this.findOne(id);
    const { password, email, ...rest } = dto;
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        ...rest,
        ...(email ? { email: email.toLowerCase() } : {}),
        ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}),
      },
      select: USER_SELECT,
    });
    if (dto.role && dto.role !== before.role) {
      await this.logEvent(id, 'role_changed', actor, `${before.role} → ${dto.role}`);
    }
    return user;
  }

  /** Cambia lo stato di accesso (attiva/sospendi/archivia) e registra l'audit. */
  async setStatus(id: string, status: string, actor?: JwtUser) {
    const user = await this.findOne(id);
    if (!Object.values(UserStatus).includes(status as UserStatus)) {
      throw new BadRequestException('Stato non valido');
    }
    if (status === UserStatus.INVITED) {
      throw new BadRequestException('Usa "reinvita" per rimandare un invito');
    }
    if (status === UserStatus.ACTIVE && !user.activatedAt) {
      throw new BadRequestException(
        'L\'utente non ha ancora impostato la password: rimanda l\'invito.',
      );
    }
    const action =
      status === UserStatus.ACTIVE
        ? 'reactivated'
        : status === UserStatus.SUSPENDED
          ? 'suspended'
          : 'archived';
    const updated = await this.prisma.user.update({
      where: { id },
      data: { status },
      select: USER_SELECT,
    });
    await this.logEvent(id, action, actor);
    return updated;
  }

  /** (Ri)genera il token di invito e lo restituisce (il client compone il link). */
  async resendInvite(id: string, actor?: JwtUser) {
    const user = await this.findOne(id);
    if (user.status === UserStatus.ARCHIVED) {
      throw new BadRequestException('Utente archiviato: riattivalo prima di reinvitare');
    }
    const invite = this.newInviteToken();
    await this.prisma.user.update({
      where: { id },
      data: { ...invite, status: UserStatus.INVITED, passwordHash: null },
    });
    await this.logEvent(id, 'invited', actor, 'Invito rimandato');
    return { inviteToken: invite.inviteToken, expiresAt: invite.inviteTokenExpiresAt };
  }

  async remove(id: string, actor?: JwtUser) {
    // "Elimina" = archivia (lo storico va conservato: consegne, stipendi, fatture).
    await this.setStatus(id, UserStatus.ARCHIVED, actor);
    return { archived: true };
  }

  /**
   * Crea (o collega) l'utente di un'anagrafica appena creata: un gesto solo.
   * Se esiste già un utente con quella email lo collega; altrimenti crea un
   * utente invitato con token. Non blocca mai la creazione dell'anagrafica.
   */
  async provisionForAnagrafica(
    params: {
      email: string;
      firstName: string;
      lastName: string;
      role: string;
      partnerId?: string;
      valetId?: string;
      operationId?: string;
    },
    actor?: JwtUser,
  ): Promise<{ userId: string; inviteToken: string | null } | null> {
    const email = params.email?.trim().toLowerCase();
    if (!email) return null;
    const link = {
      ...(params.partnerId ? { partnerId: params.partnerId } : {}),
      ...(params.valetId ? { valetId: params.valetId } : {}),
      ...(params.operationId ? { operationId: params.operationId } : {}),
    };
    try {
      const existing = await this.prisma.user.findUnique({ where: { email } });
      if (existing) {
        await this.prisma.user.update({ where: { id: existing.id }, data: link });
        return { userId: existing.id, inviteToken: null };
      }
      const invite = this.newInviteToken();
      const user = await this.prisma.user.create({
        data: {
          email,
          firstName: params.firstName,
          lastName: params.lastName,
          role: params.role,
          status: UserStatus.INVITED,
          ...invite,
          ...link,
        },
      });
      await this.logEvent(user.id, 'created', actor);
      await this.logEvent(user.id, 'invited', actor, 'Creato con l\'anagrafica');
      return { userId: user.id, inviteToken: invite.inviteToken };
    } catch {
      // Es. valetId già collegato a un altro utente: non blocca l'anagrafica.
      return null;
    }
  }

  private newInviteToken() {
    const expires = new Date();
    expires.setDate(expires.getDate() + INVITE_TTL_DAYS);
    return { inviteToken: randomBytes(24).toString('hex'), inviteTokenExpiresAt: expires };
  }

  private logEvent(userId: string, action: string, actor?: JwtUser, note?: string) {
    return this.prisma.userEvent.create({
      data: { userId, action, actorId: actor?.sub, actorEmail: actor?.email, note },
    });
  }
}
