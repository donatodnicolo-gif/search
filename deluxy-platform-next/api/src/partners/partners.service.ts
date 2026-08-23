import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JwtUser } from '../common/decorators';
import { Role } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { AnagraficheSyncService, pivaAttendibile, semplificaNome } from './anagrafiche-sync.service';
import { CreatePartnerDto, UpdatePartnerDto } from './dto/create-partner.dto';

const PARTNER_INCLUDE = {
  provinces: { include: { province: true } },
  services: { include: { serviceType: true } },
  categories: { include: { category: true } },
  openingHours: true,
} as const;

@Injectable()
export class PartnersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly anagrafiche: AnagraficheSyncService,
  ) {}

  findAll() {
    return this.prisma.partner.findMany({
      include: PARTNER_INCLUDE,
      orderBy: { insegna: 'asc' },
    });
  }

  async findOne(id: string, user?: JwtUser) {
    // Il partner vede solo se stesso
    if (user?.role === Role.PARTNER && user.partnerId !== id) {
      throw new ForbiddenException('Accesso non consentito');
    }
    const partner = await this.prisma.partner.findUnique({
      where: { id },
      include: PARTNER_INCLUDE,
    });
    if (!partner) throw new NotFoundException('Partner non trovato');
    return partner;
  }

  async create(dto: CreatePartnerDto, actor?: JwtUser) {
    const { provinceIds, categoryIds, services, openingHours, pickupAddresses, ...scalar } = dto;
    const partner = await this.prisma.partner.create({
      data: {
        ...scalar,
        contractStart: scalar.contractStart ? new Date(scalar.contractStart) : undefined,
        contractEnd: scalar.contractEnd ? new Date(scalar.contractEnd) : undefined,
        pickupAddresses: pickupAddresses?.length ? JSON.stringify(pickupAddresses) : undefined,
        provinces: provinceIds?.length
          ? { create: provinceIds.map((provinceId) => ({ provinceId })) }
          : undefined,
        categories: categoryIds?.length
          ? {
              create: categoryIds.map((categoryId, index) => ({
                categoryId,
                priority: index,
              })),
            }
          : undefined,
        services: services?.length ? { create: services } : undefined,
        openingHours: openingHours?.length ? { create: openingHours } : undefined,
      },
      include: PARTNER_INCLUDE,
    });
    // Un gesto solo: crea l'utente PARTNER collegato (invitato). Gestione
    // dell'invito dalla pagina Utenti.
    await this.users.provisionForAnagrafica(
      {
        email: partner.email,
        firstName: partner.contactName || partner.insegna,
        lastName: partner.contactSurname || '',
        role: Role.PARTNER,
        partnerId: partner.id,
      },
      actor,
    );
    // Invia il partner al registro centralizzato Anagrafiche (best-effort, non blocca).
    this.anagrafiche.sincronizza(partner);
    return partner;
  }

  /**
   * Import massivo dei partner ATTIVI dal registro Anagrafiche. Per ogni
   * attivo non ancora presente in piattaforma (dedup per platformId/email/P.IVA)
   * crea il partner con i dati disponibili e lo ricollega al registro
   * (sincronizza → il registro salva il platformId). I campi specifici della
   * piattaforma (pagamenti, servizi, contratto…) non esistono in Anagrafiche:
   * restano vuoti/default e si completano poi dalla scheda partner.
   */
  /**
   * Confronta un partner col suo record nel registro Anagrafiche.
   *
   * Non decide chi ha ragione: mostra i due valori affiancati e lascia scegliere.
   * Il registro è il golden record delle anagrafiche, ma la piattaforma è
   * l'unica che ci scrive: dire da sola quale valore è «giusto» sarebbe una
   * deduzione, e qui si preferisce mostrare la differenza.
   */
  async confrontaAnagrafica(id: string, actor?: JwtUser) {
    const p = await this.findOne(id, actor);
    const { trovato, criterio, candidati } = await this.anagrafiche.cerca({
      id: p.id, insegna: p.insegna, businessName: p.businessName,
      vatNumber: p.vatNumber, fiscalCode: p.fiscalCode, email: p.email,
    });

    if (!trovato) {
      return {
        stato: candidati.length ? 'ambiguo' : 'non-trovato',
        criterio, candidati: candidati.map((c) => ({ id: c.id, nome: c.nome, pIva: c.pIva, citta: (c as any).citta })),
        differenze: [], anagrafica: null,
      };
    }

    // Campo per campo: quello che c'è qui contro quello che c'è là.
    const coppie: [string, unknown, unknown][] = [
      ['Insegna / nome', p.insegna, trovato.nome],
      ['Ragione sociale', p.businessName, trovato.ragioneSociale],
      ['Email', p.email, trovato.email],
      ['P.IVA', p.vatNumber, trovato.pIva],
      ['Codice fiscale', p.fiscalCode, trovato.codiceFiscale],
      ['Indirizzo', p.address, trovato.indirizzo],
      ['Telefono', p.phone, trovato.telefono],
      // Nel registro il referente sta fra i contatti, non su un campo suo.
      ['Referente', p.contactName, (trovato as any).contatti?.[0]?.nome ?? null],
      ['Attivo', p.active, trovato.attivo],
    ];
    const norm = (v: unknown) => (v === null || v === undefined || v === '' ? null : String(v).trim());
    const differenze = coppie
      .map(([campo, qui, la]) => ({ campo, piattaforma: norm(qui), registro: norm(la) }))
      .filter((d) => d.piattaforma !== d.registro);

    return {
      stato: (trovato as any).platformId === p.id ? 'collegato' : 'trovato-non-collegato',
      criterio,
      anagrafica: { id: trovato.id, nome: trovato.nome, platformId: (trovato as any).platformId ?? null },
      differenze,
      candidati: [],
    };
  }

  /**
   * Stato del collegamento col registro per TUTTI i partner, in una chiamata.
   *
   * Serve alla lista: chiedere il confronto partner per partner significherebbe
   * 265 chiamate al registro. Qui si scarica il registro una volta e si
   * abbinano in memoria.
   */
  async statoSyncTutti() {
    const [partners, registro] = await Promise.all([
      this.prisma.partner.findMany({
        select: {
          id: true, insegna: true, email: true, vatNumber: true,
          businessName: true, fiscalCode: true, address: true, phone: true, active: true,
        },
      }),
      this.anagrafiche.fetchTutti(),
    ]);
    if (!registro.length) {
      return { registroRaggiungibile: false, collegati: 0, abbinabili: 0, assenti: 0, perPartner: {} as Record<string, string> };
    }

    // Indici del registro, dal criterio piu' certo al piu' incerto.
    // ⚠️ La P.IVA segnaposto (11111111111) NON entra negli indici: la portano
    // 120 partner della piattaforma, e basterebbe che una sola finisse nel
    // registro perche' tutte e 120 risultino «abbinabili» a quell'azienda.
    const perPlatformId = new Map<string, any>();
    const perPiva = new Map<string, any>();
    const perCf = new Map<string, any>();
    const perEmail = new Map<string, any>();
    const perNome = new Map<string, any>();
    const perNomeSemplice = new Map<string, any>();
    for (const a of registro) {
      if ((a as any).platformId) perPlatformId.set((a as any).platformId, a);
      if (pivaAttendibile(a.pIva)) perPiva.set(a.pIva!.trim().toUpperCase(), a);
      if (a.codiceFiscale) perCf.set(a.codiceFiscale.trim().toUpperCase(), a);
      if (a.email) perEmail.set(a.email.trim().toLowerCase(), a);
      for (const n of [a.nome, a.ragioneSociale]) {
        if (!n) continue;
        perNome.set(n.trim().toLowerCase(), a);
        const semplice = semplificaNome(n);
        if (semplice.length >= 3) perNomeSemplice.set(semplice, a);
      }
    }
    const perPartner: Record<string, string> = {};
    const differenze: {
      partnerId: string; partner: string; criterio: string;
      campi: { campo: string; piattaforma: string | null; registro: string | null }[];
    }[] = [];
    const norm = (v: unknown) => (v === null || v === undefined || v === '' ? null : String(v).trim());

    let collegati = 0, abbinabili = 0, assenti = 0;
    /** Prova i criteri in ordine e riporta QUALE ha funzionato: «per P.IVA» e
     *  «per somiglianza di nome» non danno la stessa fiducia. */
    const abbina = (p: (typeof partners)[number]): { a: any; criterio: string } | null => {
      const nomi = [p.businessName, p.insegna].filter(Boolean) as string[];
      const tentativi: [string, any][] = [
        ['P.IVA', pivaAttendibile(p.vatNumber) ? perPiva.get(p.vatNumber!.trim().toUpperCase()) : null],
        ['codice fiscale', p.fiscalCode ? perCf.get(p.fiscalCode.trim().toUpperCase()) : null],
        ['email', p.email ? perEmail.get(p.email.trim().toLowerCase()) : null],
        ['nome', nomi.map((n) => perNome.get(n.trim().toLowerCase())).find(Boolean)],
        ['nome semplificato', nomi.map((n) => perNomeSemplice.get(semplificaNome(n))).find(Boolean)],
      ];
      for (const [criterio, a] of tentativi) if (a) return { a, criterio };
      return null;
    };
    for (const p of partners) {
      let a: any = perPlatformId.get(p.id);
      let criterio = 'platformId';
      if (a) { perPartner[p.id] = 'collegato'; collegati++; }
      else {
        const esito = abbina(p);
        if (!esito) { perPartner[p.id] = 'assente'; assenti++; continue; }
        a = esito.a; criterio = esito.criterio;
        perPartner[p.id] = 'abbinabile'; abbinabili++;
      }


      // Differenze sui campi che il registro espone dalle sue API.
      const campi = ([
        ['Insegna / nome', p.insegna, a.nome],
        ['Ragione sociale', p.businessName, a.ragioneSociale],
        ['Email', p.email, a.email],
        ['P.IVA', p.vatNumber, a.pIva],
        ['Codice fiscale', p.fiscalCode, a.codiceFiscale],
        ['Indirizzo', p.address, a.indirizzo],
        ['Telefono', p.phone, a.telefono],
        ['Attivo', p.active, a.attivo],
      ] as [string, unknown, unknown][])
        .map(([campo, qui, la]) => ({ campo, piattaforma: norm(qui), registro: norm(la) }))
        .filter((d) => d.piattaforma !== d.registro);

      if (campi.length) differenze.push({ partnerId: p.id, partner: p.insegna, criterio, campi });
    }

    return {
      registroRaggiungibile: true, totaleRegistro: registro.length,
      collegati, abbinabili, assenti,
      conDifferenze: differenze.length,
      differenze, perPartner,
    };
  }

  /**
   * Manda il partner al registro e riporta l'esito (non fire-and-forget).
   *
   * ⚠️ Prima si CERCA. Se il record esiste, si scrive su quello; altrimenti un
   * upsert alla cieca può crearne un doppione, perché la cascata di identità
   * del registro non ritrova un partner con P.IVA diversa e senza città.
   */
  async sincronizzaAnagrafica(id: string, actor?: JwtUser) {
    const p = await this.findOne(id, actor);
    const { trovato, candidati } = await this.anagrafiche.cerca({
      id: p.id, insegna: p.insegna, businessName: p.businessName,
      vatNumber: p.vatNumber, fiscalCode: p.fiscalCode, email: p.email,
    });
    if (!trovato && candidati.length) {
      return {
        ok: false, stato: 0,
        messaggio: `Nel registro ci sono ${candidati.length} record possibili: scegliere a mano quale collegare, per non crearne un altro.`,
      };
    }
    return this.anagrafiche.sincronizzaOra(p as any, trovato?.id ?? null);
  }

  async importFromAnagrafiche(actor?: JwtUser) {
    const attivi = await this.anagrafiche.fetchAttivi();
    const summary = { totale: attivi.length, importati: 0, saltati: 0, errori: [] as string[] };
    if (attivi.length === 0) return summary;

    // Indici per il dedup (una lettura sola).
    const esistenti = await this.prisma.partner.findMany({
      select: { id: true, email: true, vatNumber: true },
    });
    const perId = new Set(esistenti.map((p) => p.id));
    const perEmail = new Set(esistenti.map((p) => p.email.toLowerCase()));
    const perPiva = new Set(esistenti.filter((p) => p.vatNumber).map((p) => p.vatNumber!.toUpperCase()));

    // Categorie/province della piattaforma per risolvere i nomi.
    const [categorie, province] = await Promise.all([
      this.prisma.category.findMany({ select: { id: true, name: true } }),
      this.prisma.province.findMany({ select: { id: true, code: true, name: true } }),
    ]);
    const catByName = new Map(categorie.map((c) => [c.name.toUpperCase(), c.id]));
    const provByKey = new Map<string, string>();
    for (const pr of province) {
      provByKey.set(pr.code.toUpperCase(), pr.id);
      provByKey.set(pr.name.toUpperCase(), pr.id);
    }

    for (const a of attivi) {
      try {
        // Dedup: gia' collegato, o stessa email/P.IVA gia' in piattaforma.
        if (a.platformId && perId.has(a.platformId)) { summary.saltati++; continue; }
        const email = (a.email?.trim() || `import-${a.id}@no-email.deluxy`).toLowerCase();
        const piva = a.pIva?.trim().toUpperCase();
        if (perEmail.has(email) || (piva && perPiva.has(piva))) { summary.saltati++; continue; }

        const categoryId = a.categoria ? catByName.get(a.categoria.toUpperCase()) : undefined;
        const provinceId = a.provincia ? provByKey.get(a.provincia.trim().toUpperCase()) : undefined;
        const contatto = a.contatti?.[0];

        const partner = await this.prisma.partner.create({
          data: {
            insegna: a.nome,
            businessName: a.ragioneSociale ?? undefined,
            email,
            vatNumber: a.pIva ?? undefined,
            fiscalCode: a.codiceFiscale ?? undefined,
            address: a.indirizzo ?? undefined,
            phone: a.telefono ?? undefined,
            contactName: contatto?.nome ?? undefined,
            notes: a.note ?? undefined,
            provinces: provinceId ? { create: [{ provinceId }] } : undefined,
            categories: categoryId ? { create: [{ categoryId, priority: 0 }] } : undefined,
          },
          include: PARTNER_INCLUDE,
        });
        perEmail.add(email);
        if (piva) perPiva.add(piva);
        // Ricollega al registro (upsert per nome+citta → salva il platformId).
        this.anagrafiche.sincronizza(partner);
        summary.importati++;
      } catch (err) {
        summary.errori.push(`${a.nome}: ${(err as Error).message}`);
      }
    }
    return summary;
  }

  async update(id: string, dto: UpdatePartnerDto, user: JwtUser) {
    if (user.role === Role.PARTNER && user.partnerId !== id) {
      throw new ForbiddenException('Accesso non consentito');
    }
    await this.findOne(id);
    const { provinceIds, categoryIds, services, openingHours, pickupAddresses, ...rest } = dto;
    const scalar = {
      ...rest,
      ...(rest.contractStart ? { contractStart: new Date(rest.contractStart) } : {}),
      ...(rest.contractEnd ? { contractEnd: new Date(rest.contractEnd) } : {}),
      ...(pickupAddresses ? { pickupAddresses: JSON.stringify(pickupAddresses) } : {}),
    };

    // Il partner puo' modificare solo alcuni campi propri (es. orari apertura)
    if (user.role === Role.PARTNER) {
      const allowed: any = {};
      if (scalar.phone !== undefined) allowed.phone = scalar.phone;
      if (scalar.contactName !== undefined) allowed.contactName = scalar.contactName;
      if (scalar.notes !== undefined) allowed.notes = scalar.notes;
      const aggiornatoPartner = await this.prisma.partner.update({
        where: { id },
        data: {
          ...allowed,
          ...(openingHours
            ? { openingHours: { deleteMany: {}, create: openingHours } }
            : {}),
        },
        include: PARTNER_INCLUDE,
      });
      this.anagrafiche.sincronizza(aggiornatoPartner);
      return aggiornatoPartner;
    }

    const aggiornato = await this.prisma.partner.update({
      where: { id },
      data: {
        ...scalar,
        ...(provinceIds
          ? {
              provinces: {
                deleteMany: {},
                create: provinceIds.map((provinceId) => ({ provinceId })),
              },
            }
          : {}),
        ...(categoryIds
          ? {
              categories: {
                deleteMany: {},
                create: categoryIds.map((categoryId, index) => ({
                  categoryId,
                  priority: index,
                })),
              },
            }
          : {}),
        ...(services ? { services: { deleteMany: {}, create: services } } : {}),
        ...(openingHours
          ? { openingHours: { deleteMany: {}, create: openingHours } }
          : {}),
      },
      include: PARTNER_INCLUDE,
    });
    this.anagrafiche.sincronizza(aggiornato);
    return aggiornato;
  }

  async remove(id: string) {
    await this.findOne(id);
    // Disattivazione = soft delete; propagato al registro come stato "dismesso".
    const disattivato = await this.prisma.partner.update({
      where: { id },
      data: { active: false },
      include: PARTNER_INCLUDE,
    });
    this.anagrafiche.sincronizza(disattivato);
    return { deactivated: true };
  }

  // --- Eccezioni per data (chiusure straordinarie / orari speciali) ---

  /** Il partner gestisce solo le proprie eccezioni; admin/operation/PM tutte. */
  private assertCanManage(partnerId: string, user: JwtUser): void {
    if (user.role === Role.PARTNER && user.partnerId !== partnerId) {
      throw new ForbiddenException('Accesso non consentito');
    }
  }

  async getDayExceptions(partnerId: string, user: JwtUser, from?: string, to?: string) {
    this.assertCanManage(partnerId, user);
    const where: any = { partnerId };
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to) { const t = new Date(to); t.setDate(t.getDate() + 1); where.date.lt = t; }
    }
    const rows = await this.prisma.partnerDayException.findMany({ where, orderBy: { date: 'asc' } });
    return rows.map((r) => ({
      date: r.date.toISOString().slice(0, 10),
      closed: r.closed,
      openTime: r.openTime,
      closeTime: r.closeTime,
      note: r.note,
    }));
  }

  /** Crea/aggiorna l'eccezione per una data (upsert su partnerId+date). */
  async upsertDayException(
    partnerId: string,
    user: JwtUser,
    dto: { date: string; closed?: boolean; openTime?: string; closeTime?: string; note?: string },
  ) {
    this.assertCanManage(partnerId, user);
    const date = new Date(dto.date + 'T00:00:00.000Z');
    const data = {
      closed: dto.closed ?? false,
      openTime: dto.closed ? null : (dto.openTime || null),
      closeTime: dto.closed ? null : (dto.closeTime || null),
      note: dto.note || null,
    };
    const row = await this.prisma.partnerDayException.upsert({
      where: { partnerId_date: { partnerId, date } },
      update: data,
      create: { partnerId, date, ...data },
    });
    return { date: row.date.toISOString().slice(0, 10), ...data };
  }

  async removeDayException(partnerId: string, user: JwtUser, dateStr: string) {
    this.assertCanManage(partnerId, user);
    const date = new Date(dateStr + 'T00:00:00.000Z');
    await this.prisma.partnerDayException.deleteMany({ where: { partnerId, date } });
    return { deleted: true };
  }
}
