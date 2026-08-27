import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';
import { JwtUser } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  // ============================================================
  // FORZA BRUTA SUL LOGIN (27/08/2026)
  // ------------------------------------------------------------
  // ⚠️ Non c'era NIENTE: nessun limite, nessun ritardo, nessun log dei
  // fallimenti. Su serverless il parallelismo è gratis per chi attacca — le
  // invocazioni scalano da sole — quindi il costo di bcrypt non è un freno
  // come lo sarebbe su una macchina sola.
  //
  // ⚠️ Il contatore sta sul DATABASE e non in memoria: ogni richiesta può
  // finire su un'istanza diversa, e un contatore per istanza non conta niente.
  // ============================================================
  private static readonly FINESTRA_MIN = 15;
  private static readonly TENTATIVI_MAX = 8;
  /**
   * Il tetto PER INDIRIZZO DI RETE, più alto perché da uno stesso ufficio
   * possono sbagliare in più persone.
   *
   * ⚠️ Senza questo, il freno per email non ferma lo SPRAY: una password
   * comune provata su mille indirizzi diversi non alza mai nessun contatore.
   * Misurato dall'agente ostile — 12 email, stessa password, dodici 401 e mai
   * un 429. Un freno che si aggira cambiando bersaglio non è un freno.
   */
  private static readonly TENTATIVI_MAX_IP = 30;

  /** L'impronta dell'email: la tabella non deve diventare un elenco leggibile. */
  private static impronta(email: string): string {
    return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
  }

  private async quantiFallimenti(email: string, ip?: string): Promise<{ perEmail: number; perIp: number }> {
    const da = new Date(Date.now() - AuthService.FINESTRA_MIN * 60_000);
    const [perEmail, perIp] = await Promise.all([
      this.prisma.tentativoAccesso.count({
        where: { chiave: AuthService.impronta(email), quando: { gte: da } },
      }),
      ip
        ? this.prisma.tentativoAccesso.count({ where: { ip, quando: { gte: da } } })
        : Promise.resolve(0),
    ]);
    return { perEmail, perIp };
  }

  /**
   * Registra un fallimento. Fuori dal percorso critico: se la scrittura non
   * riesce, il login deve comunque rispondere «credenziali non valide» — non
   * un errore che rivela che qualcosa è andato storto altrove.
   */
  private segnaFallimento(email: string, ip?: string): void {
    void this.prisma.tentativoAccesso
      .create({ data: { chiave: AuthService.impronta(email), ip: ip ?? null } })
      .catch(() => undefined);
    // Pulizia opportunistica: la tabella non deve crescere per sempre.
    void this.prisma.tentativoAccesso
      .deleteMany({ where: { quando: { lt: new Date(Date.now() - 24 * 3600_000) } } })
      .catch(() => undefined);
  }

  async login(dto: LoginDto, ip?: string) {
    // ⚠️ Il conto si fa PRIMA di guardare la password: se lo si facesse dopo,
    // ogni tentativo pagherebbe comunque il costo di bcrypt e il freno non
    // frenerebbe niente.
    const falliti = await this.quantiFallimenti(dto.email, ip);
    if (falliti.perEmail >= AuthService.TENTATIVI_MAX || falliti.perIp >= AuthService.TENTATIVI_MAX_IP) {
      // ⚠️ Un solo messaggio per tutt'e due i freni: dire «troppi tentativi da
      // questo indirizzo» racconterebbe a chi attacca quale dei due l'ha
      // fermato, cioè come aggirarlo.
      throw new HttpException(
        `Troppi tentativi falliti. Riprova fra ${AuthService.FINESTRA_MIN} minuti.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    // ⚠️ 27/08/2026 — UN SOLO MESSAGGIO PER TUTTI I CASI.
    //
    // Prima lo stato «invited» aveva un messaggio suo: chi provava un'email a
    // caso scopriva così quali account esistono e hanno un invito in sospeso,
    // cioè l'elenco esatto dei bersagli da phishing («ti rimando il link»).
    // Chi ha davvero un invito in sospeso lo sa dalla mail che ha ricevuto,
    // non dalla risposta del login.
    if (!user || user.status !== 'active' || !user.passwordHash) {
      this.segnaFallimento(dto.email, ip);
      throw new UnauthorizedException('Credenziali non valide');
    }
    const passwordOk = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordOk) {
      this.segnaFallimento(dto.email, ip);
      throw new UnauthorizedException('Credenziali non valide');
    }
    // Entrato: si azzera il conto, o un utente distratto resterebbe frenato
    // per un quarto d'ora dopo essere già rientrato.
    void this.prisma.tentativoAccesso
      .deleteMany({ where: { chiave: AuthService.impronta(dto.email) } })
      .catch(() => undefined);

    // L'ultimo accesso si REGISTRA: e' la base della regola «un valet fermo da
    // 90 giorni passa inattivo» (corsa notturna). Fuori dal percorso critico:
    // se la scrittura fallisce, il login non deve fallire con lei.
    this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
      .catch(() => undefined);

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      isSupport: user.isSupport,
      partnerId: user.partnerId,
      valetId: user.valetId,
    };

    return {
      accessToken: await this.jwtService.signAsync(payload),
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isSupport: user.isSupport,
        partnerId: user.partnerId,
        valetId: user.valetId,
      },
    };
  }

  async me(jwtUser: JwtUser) {
    const user = await this.prisma.user.findUnique({
      where: { id: jwtUser.sub },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isSupport: true,
        partnerId: true,
        valetId: true,
        operationId: true,
        status: true,
      },
    });
    return user;
  }

  /** Dati minimi dell'invito (pagina pubblica di accettazione): a chi è rivolto. */
  async inviteInfo(token: string) {
    const user = await this.prisma.user.findUnique({ where: { inviteToken: token } });
    if (!user || user.status !== 'invited') {
      throw new NotFoundException('Invito non valido');
    }
    if (user.inviteTokenExpiresAt && user.inviteTokenExpiresAt < new Date()) {
      throw new BadRequestException('Invito scaduto: chiedi un nuovo invito.');
    }
    return { email: user.email, firstName: user.firstName, lastName: user.lastName };
  }

  /** L'utente sceglie la password dal link di invito: attiva l'account e lo logga. */
  async acceptInvite(dto: AcceptInviteDto) {
    const user = await this.prisma.user.findUnique({ where: { inviteToken: dto.token } });
    if (!user || user.status !== 'invited') {
      throw new BadRequestException('Invito non valido o già usato');
    }
    if (user.inviteTokenExpiresAt && user.inviteTokenExpiresAt < new Date()) {
      throw new BadRequestException('Invito scaduto: chiedi un nuovo invito.');
    }
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await bcrypt.hash(dto.password, 10),
        status: 'active',
        activatedAt: new Date(),
        inviteToken: null,
        inviteTokenExpiresAt: null,
      },
    });
    await this.prisma.userEvent.create({
      data: { userId: user.id, action: 'activated', note: 'Invito accettato' },
    });
    const payload = {
      sub: updated.id,
      email: updated.email,
      role: updated.role,
      isSupport: updated.isSupport,
      partnerId: updated.partnerId,
      valetId: updated.valetId,
    };
    return {
      accessToken: await this.jwtService.signAsync(payload),
      user: {
        id: updated.id,
        email: updated.email,
        firstName: updated.firstName,
        lastName: updated.lastName,
        role: updated.role,
        isSupport: updated.isSupport,
        partnerId: updated.partnerId,
        valetId: updated.valetId,
      },
    };
  }
}
