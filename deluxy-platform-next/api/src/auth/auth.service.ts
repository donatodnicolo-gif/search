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
import { randomBytes } from 'crypto';
import { SettingsService } from '../settings/settings.module';
import { createHash } from 'node:crypto';
import { JwtUser } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { ibanValido } from '../transactions/transactions.module';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly settings: SettingsService,
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
      include: { valet: { select: { isTeamLeader: true } } },
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
      // Cambio obbligatorio al primo accesso (bonifica password deboli 31/08):
      // il login riesce, ma il frontend porta subito alla scelta della password.
      mustChangePassword: user.mustChangePassword === true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isSupport: user.isSupport,
        partnerId: user.partnerId,
        valetId: user.valetId,
        // Team leader: il frontend mostra «Assegna» ai valet team leader
        // (l'API verifica comunque il perimetro).
        isTeamLeader: (user as any).valet?.isTeamLeader === true,
      },
    };
  }

  /**
   * Cambio password da utente LOGGATO (usato dal cambio obbligatorio al primo
   * accesso e da chi vuole cambiarla di sua volontà). Richiede la password
   * attuale: un token rubato non deve bastare a riscriverla. Azzera il flag
   * `mustChangePassword` e registra l'evento.
   */
  async cambiaPassword(jwtUser: JwtUser, attuale: string, nuova: string) {
    const user = await this.prisma.user.findUnique({ where: { id: jwtUser.sub } });
    if (!user || !user.passwordHash) throw new UnauthorizedException('Sessione non valida');
    if (!(await bcrypt.compare(attuale, user.passwordHash))) {
      throw new BadRequestException('La password attuale non è corretta.');
    }
    if (!nuova || nuova.length < 8) {
      throw new BadRequestException('La nuova password deve avere almeno 8 caratteri.');
    }
    if (await bcrypt.compare(nuova, user.passwordHash)) {
      throw new BadRequestException('La nuova password deve essere diversa da quella attuale.');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(nuova, 10), mustChangePassword: false },
    });
    await this.prisma.userEvent.create({
      data: { userId: user.id, action: 'password-changed', note: 'Password cambiata dall\'utente' },
    });
    return { ok: true };
  }

  /**
   * LA SCHEDA PROFILO (utente, 02/09): cliccando il proprio nome si vedono e
   * si correggono i PROPRI dati — account (nome, email, password) e
   * anagrafica collegata (valet o partner). MAI prezzi, tariffe o stipendi:
   * quelli sono dell'ufficio, e il confine sta QUI nel server (elenchi
   * espliciti di campi, non un form che nasconde).
   */
  async profilo(jwtUser: JwtUser) {
    const user = await this.prisma.user.findUnique({
      where: { id: jwtUser.sub },
      select: { email: true, firstName: true, lastName: true, role: true, partnerId: true, valetId: true },
    });
    if (!user) throw new UnauthorizedException('Sessione non valida');
    const valet = user.valetId
      ? await this.prisma.valet.findUnique({
          where: { id: user.valetId },
          select: { phone: true, address: true, city: true, birthPlace: true, birthDate: true,
            fiscalCode: true, vehicle: true, iban: true, notifyByEmail: true, notifyByWhatsapp: true },
        })
      : null;
    const grezzo = user.partnerId
      ? await this.prisma.partner.findUnique({
          where: { id: user.partnerId },
          // L'insegna si MOSTRA ma non si modifica: è l'identità con cui
          // FINANCE e fatture riconoscono il negozio.
          select: { insegna: true, email: true, phone: true, address: true, pickupAddresses: true },
        })
      : null;
    // Gli indirizzi di ritiro aggiuntivi vivono come JSON: al form arrivano
    // già come lista (02/09, regola utente: il partner li imposta da qui).
    let ritiri: string[] = [];
    try { ritiri = grezzo?.pickupAddresses ? JSON.parse(grezzo.pickupAddresses) : []; } catch { ritiri = []; }
    const partner = grezzo ? { ...grezzo, pickupAddresses: Array.isArray(ritiri) ? ritiri : [] } : null;
    return { user: { email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role }, valet, partner };
  }

  async aggiornaProfilo(
    jwtUser: JwtUser,
    body: {
      firstName?: string; lastName?: string; email?: string;
      valet?: { phone?: string; address?: string; city?: string; birthPlace?: string;
        birthDate?: string | null; fiscalCode?: string; vehicle?: string; iban?: string;
        notifyByEmail?: boolean; notifyByWhatsapp?: boolean };
      partner?: { phone?: string; email?: string; address?: string; pickupAddresses?: string[] };
    },
    partners?: { update: (id: string, dto: any, user: JwtUser) => Promise<unknown> },
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: jwtUser.sub },
      select: { id: true, email: true, partnerId: true, valetId: true },
    });
    if (!user) throw new UnauthorizedException('Sessione non valida');
    const s = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : undefined);
    const cambiati: string[] = [];

    // --- ACCOUNT: nome, cognome, email (la password ha la sua rotta, con
    // la verifica dell'attuale).
    const datiUser: Record<string, unknown> = {};
    const nome = s(body.firstName, 80);
    const cognome = s(body.lastName, 80);
    if (nome) { datiUser['firstName'] = nome; cambiati.push('nome'); }
    if (cognome) { datiUser['lastName'] = cognome; cambiati.push('cognome'); }
    const email = s(body.email, 160)?.toLowerCase();
    if (email && email !== user.email) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new BadRequestException("L'email non è in un formato valido.");
      }
      datiUser['email'] = email;
      cambiati.push('email');
    }
    if (Object.keys(datiUser).length) {
      try {
        await this.prisma.user.update({ where: { id: user.id }, data: datiUser });
      } catch (e: any) {
        if (e?.code === 'P2002') throw new BadRequestException('Questa email è già usata da un altro account.');
        throw e;
      }
    }

    // --- ANAGRAFICA VALET: SOLO i dati personali. Niente tariffe, km,
    // ritenuta, team leader o stato: quelli li tocca l'ufficio.
    if (body.valet && user.valetId) {
      const v = body.valet;
      const datiValet: Record<string, unknown> = {};
      for (const campo of ['phone', 'address', 'city', 'birthPlace', 'fiscalCode', 'vehicle'] as const) {
        const val = s(v[campo]);
        if (val !== undefined) { datiValet[campo] = val; cambiati.push(campo); }
      }
      if (typeof v.notifyByEmail === 'boolean') { datiValet['notifyByEmail'] = v.notifyByEmail; cambiati.push('notifiche email'); }
      if (typeof v.notifyByWhatsapp === 'boolean') { datiValet['notifyByWhatsapp'] = v.notifyByWhatsapp; cambiati.push('notifiche whatsapp'); }
      if (v.birthDate !== undefined) {
        const d = v.birthDate ? new Date(v.birthDate) : null;
        if (d && Number.isNaN(d.getTime())) throw new BadRequestException('La data di nascita non è valida.');
        datiValet['birthDate'] = d;
        cambiati.push('data di nascita');
      }
      const iban = s(v.iban, 40)?.replace(/\s+/g, '').toUpperCase();
      if (iban !== undefined) {
        if (iban && !ibanValido(iban)) throw new BadRequestException("L'IBAN non supera il controllo (mod-97): ricontrollalo.");
        datiValet['iban'] = iban || null;
        cambiati.push('iban');
      }
      if (Object.keys(datiValet).length) {
        await this.prisma.valet.update({ where: { id: user.valetId }, data: datiValet });
      }
    }

    // --- CONTATTI PARTNER: passano dalla rotta dei partner (che dal 02/09
    // stringe il PARTNER ai soli contatti E sincronizza le Anagrafiche).
    if (body.partner && user.partnerId && partners) {
      const p: Record<string, unknown> = {};
      const tel = s(body.partner.phone, 40); if (tel !== undefined) { p['phone'] = tel; cambiati.push('telefono negozio'); }
      const em = s(body.partner.email, 160)?.toLowerCase(); if (em) { p['email'] = em; cambiati.push('email negozio'); }
      const ind = s(body.partner.address, 300); if (ind !== undefined) { p['address'] = ind; cambiati.push('indirizzo negozio'); }
      // Indirizzi di ritiro aggiuntivi (02/09, regola utente): lista di
      // stringhe, ripulita e con un tetto — anche la lista VUOTA è un valore
      // (li ha tolti tutti).
      if (Array.isArray(body.partner.pickupAddresses)) {
        p['pickupAddresses'] = body.partner.pickupAddresses
          .filter((x): x is string => typeof x === 'string')
          .map((x) => x.trim().slice(0, 300))
          .filter(Boolean)
          .slice(0, 20);
        cambiati.push('indirizzi di ritiro');
      }
      if (Object.keys(p).length) await partners.update(user.partnerId, p, jwtUser);
    }

    if (cambiati.length) {
      await this.prisma.userEvent.create({
        data: { userId: user.id, action: 'profile-updated', note: `Profilo aggiornato: ${cambiati.join(', ')}` },
      });
    }
    return { ok: true, cambiati };
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
        mustChangePassword: true,
        // ⚠️ Senza questo, `isTeamLeader` c'era al login ma spariva al RELOAD
        // (me() è la fonte dopo un refresh): il team leader perdeva il bottone
        // «Assegna» ricaricando la pagina.
        valet: { select: { isTeamLeader: true } },
      },
    });
    if (!user) return user;
    const { valet, ...resto } = user as typeof user & { valet: { isTeamLeader: boolean } | null };
    return { ...resto, isTeamLeader: valet?.isTeamLeader === true };
  }


  /**
   * «Password dimenticata»: genera un token di reimpostazione e lo manda per
   * mail via AI Mail. Riusa il MECCANISMO dell'invito (stesso token, stessa
   * pagina /invite/:token che fa scegliere la password): un secondo canale di
   * reset sarebbe una seconda superficie da difendere.
   *
   * ⚠️ La risposta è SEMPRE la stessa, esista o no l'account: dire «email non
   * trovata» regalerebbe l'elenco degli account validi. Per lo stesso motivo
   * l'invio della mail non può far fallire la rotta.
   *
   * ⚠️ Passa dallo stesso freno del login (tentativoAccesso): senza, questa
   * rotta pubblica sarebbe un generatore gratuito di mail verso chiunque.
   */
  async richiediRecupero(email: string, ip?: string): Promise<{ ok: true }> {
    const falliti = await this.quantiFallimenti(email, ip);
    if (falliti.perEmail >= AuthService.TENTATIVI_MAX || falliti.perIp >= AuthService.TENTATIVI_MAX_IP) {
      return { ok: true }; // frenato in silenzio: la risposta non cambia
    }
    this.segnaFallimento(email, ip); // ogni richiesta conta verso il freno
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || user.status !== 'active') return { ok: true };

    const token = randomBytes(24).toString('hex');
    await this.prisma.user.update({
      where: { id: user.id },
      data: { inviteToken: token, inviteTokenExpiresAt: new Date(Date.now() + 2 * 3600_000) },
    });

    // Invio via AI Mail (stesso contratto del recap: POST /api/v1/invia).
    try {
      const url = ((await this.settings.get('mailUrl')) ?? process.env.MAIL_URL ?? 'https://deluxy-mail.vercel.app').replace(/\/+$/, '');
      const chiave = (await this.settings.get('mailApiKey')) ?? process.env.MAIL_API_KEY ?? '';
      const utente = (await this.settings.get('mailUtente')) ?? process.env.MAIL_UTENTE ?? '';
      if (!chiave || !utente) throw new Error('AI Mail non configurata (mailApiKey/mailUtente)');
      const link = `https://app.deluxy.it/invite/${token}`;
      const corpo = [
        `Ciao ${user.firstName ?? ''},`,
        '',
        'qualcuno (speriamo tu) ha chiesto di reimpostare la password del tuo accesso Deluxy.',
        `Per scegliere una password nuova apri questo indirizzo entro 2 ore: ${link}`,
        '',
        'Se non sei stato tu, ignora questa mail: la password attuale resta valida.',
      ].join('\n');
      const res = await fetch(`${url}/api/v1/invia`, {
        method: 'POST',
        headers: { 'x-api-key': chiave, 'x-utente': utente, 'Content-Type': 'application/json' },
        body: JSON.stringify({ a: user.email, oggetto: 'Reimposta la tua password Deluxy', corpo }),
      });
      if (!res.ok) throw new Error(`AI Mail risponde ${res.status}`);
    } catch (err) {
      // Non si rivela niente al chiamante; l'avaria si legge nei log del server.
      console.error('recupero-password: invio mail fallito:', (err as Error).message);
    }
    return { ok: true };
  }

  /**
   * Dati minimi del link (pagina pubblica): a chi è rivolto e se è un INVITO
   * (utente mai attivato) o un RESET della password (utente già attivo, dal
   * «password dimenticata»). Il flusso è lo stesso, il testo in pagina no.
   */
  async inviteInfo(token: string) {
    const user = await this.prisma.user.findUnique({ where: { inviteToken: token } });
    if (!user || !['invited', 'active'].includes(user.status)) {
      throw new NotFoundException('Invito non valido');
    }
    if (user.inviteTokenExpiresAt && user.inviteTokenExpiresAt < new Date()) {
      throw new BadRequestException('Link scaduto: chiedine uno nuovo.');
    }
    return {
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      reset: user.status === 'active',
    };
  }

  /** L'utente sceglie la password dal link di invito: attiva l'account e lo logga. */
  async acceptInvite(dto: AcceptInviteDto) {
    const user = await this.prisma.user.findUnique({ where: { inviteToken: dto.token } });
    if (!user || !['invited', 'active'].includes(user.status)) {
      throw new BadRequestException('Invito non valido o già usato');
    }
    if (user.inviteTokenExpiresAt && user.inviteTokenExpiresAt < new Date()) {
      throw new BadRequestException('Link scaduto: chiedine uno nuovo.');
    }
    const eraReset = user.status === 'active';
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await bcrypt.hash(dto.password, 10),
        status: 'active',
        // Il reset non deve riscrivere la data di PRIMA attivazione.
        activatedAt: user.activatedAt ?? new Date(),
        inviteToken: null,
        inviteTokenExpiresAt: null,
      },
    });
    await this.prisma.userEvent.create({
      data: eraReset
        ? { userId: user.id, action: 'password-reset', note: 'Password reimpostata dal link «password dimenticata»' }
        : { userId: user.id, action: 'activated', note: 'Invito accettato' },
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
