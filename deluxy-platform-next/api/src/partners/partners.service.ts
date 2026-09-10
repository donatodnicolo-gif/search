import { BadRequestException, ForbiddenException,
  Injectable,
  NotFoundException,  Logger,
} from '@nestjs/common';
import { JwtUser } from '../common/decorators';
import { Role } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';
import { AreeService } from '../aree/aree.module';
import { titleCaseInsegna } from '../common/nome-proprio';
import { UsersService } from '../users/users.service';
import { AnagraficheSyncService, pivaAttendibile, semplificaNome } from './anagrafiche-sync.service';
import { CreatePartnerDto, UpdatePartnerDto } from './dto/create-partner.dto';
import { SettingsService } from '../settings/settings.module';
import { CalendarioUniciService } from '../merchandising-sync/calendario-unici.module';
import {
  CODICE_VALIDO_MINUTI, RIMANDA_DOPO_SECONDI, TENTATIVI_MASSIMI,
  emailMascherata, generaCodice, ibanLeggibile, ibanMascherato, ibanValido,
  impronta, improntaCombacia, intestatarioValido, leggiSospeso, mailAvvisoUfficio,
  mailCodice, normalizzaIban, serializzaSospeso,
} from './cambio-iban';

/**
 * La chiave WooCommerce non esce MAI dall'API.
 *
 * E' una credenziale vera (`ck_` + 48 esadecimali) che nel database originario
 * stava in una colonna di anagrafica come tutto il resto. Importandola qui il
 * 24/08/2026 sarebbe finita in ogni risposta di `GET /partners`, perche' un
 * `findMany` con `include` restituisce tutti i campi scalari — quindi visibile a
 * chiunque abbia un token buono per leggere i partner, partner compresi.
 *
 * `omit` la toglie dalla SELECT: non viaggia e non si puo' dimenticare in giro.
 * Chi deve usarla la legge dal database, non dall'API.
 */
/**
 * ⚠️ 08/09/2026 — anche l'IMPRONTA DEL CODICE e i valori in attesa escono dalla SELECT.
 *
 * `bankCodeHash` è l'impronta del codice di verifica per il cambio IBAN: con quella in
 * mano si potrebbe provare offline finché non si trova il codice a sei cifre, e poi
 * completare la verifica al posto del partner. `bankPending` racconta un cambio in corso
 * a chiunque legga l'elenco dei partner. Nessuno dei due serve a chi guarda una scheda:
 * lo stato del cambio si chiede alla sua rotta, che dice quello che va detto e basta.
 */
const PARTNER_OMIT = { woocommerceApiKey: true, bankCodeHash: true, bankPending: true } as const;

const PARTNER_INCLUDE = {
  provinces: { include: { province: true } },
  services: { include: { serviceType: true } },
  categories: { include: { category: true } },
  mestieri: { include: { mestiere: true } },
  aree: { include: { area: { select: { id: true, nome: true } } } },
  consegnaProvince: { include: { province: { select: { id: true, code: true, name: true } } } },
  openingHours: true,
} as const;

@Injectable()
export class PartnersService {
  private readonly logger = new Logger(PartnersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly anagrafiche: AnagraficheSyncService,
    private readonly aree: AreeService,
    private readonly settings: SettingsService,
    private readonly calendarioUnici: CalendarioUniciService,
  ) {}

  /**
   * ⭐ 10/09/2026 (regola utente): appena un partner salva orari, chiusure del giorno o cambia
   * attivazione, il calendario dei suoi prodotti unici parte verso Merchandising — solo il suo,
   * senza aspettare il giro notturno. Best-effort: non blocca il salvataggio.
   */
  private aggiornaCalendarioSito(partnerId: string): void {
    void this.calendarioUnici.manda(14, false, partnerId).catch((err) => this.logger.warn(`Calendario sito non aggiornato per : ${(err as Error).message}`));
  }

  findAll(includiEliminati = false) {
    return this.prisma.partner.findMany({
      // I partner ELIMINATI (31/08) spariscono dalle liste per default:
      // restano in banca per lo storico, ma non si mostrano più.
      where: includiEliminati ? {} : { deleted: false },
      include: PARTNER_INCLUDE,
      omit: PARTNER_OMIT,
      orderBy: { insegna: 'asc' },
    });
  }

  /**
   * ELIMINA un partner (31/08/2026, utente): stato più forte della
   * disattivazione — sparisce anche da fatturazione e dalle liste. Non
   * cancella i dati (lo storico resta), ma lo marca `deleted`. Reversibile
   * riportando `deleted=false`.
   */
  async elimina(id: string) {
    await this.findOne(id);
    const eliminato = await this.prisma.partner.update({
      where: { id },
      data: { deleted: true, active: false },
      include: PARTNER_INCLUDE,
      omit: PARTNER_OMIT,
    });
    this.anagrafiche.sincronizza(eliminato);
    return eliminato;
  }

  /**
   * DISATTIVA / RIATTIVA un partner (09/09/2026, regola utente: «un pulsante
   * Disattiva che lo lascia tra quelli fatturati ma lo sospende tra quelli
   * attivi»).
   *
   * Sono due stati diversi, e la differenza conta:
   *  · `active = false` (qui) — SOSPESO: non gli si danno lavori nuovi, i suoi
   *    prodotti finiscono in archivio, ma resta in fatturazione e negli elenchi.
   *    Il lavoro già fatto si paga e si fattura come prima;
   *  · `deleted = true` (`elimina`) — FUORI: sparisce anche da fatturazione e
   *    dalle liste.
   *
   * Ha una rotta sua invece di passare da `PUT /partners/:id` per due motivi:
   * l'aggiornamento generale fa validazioni che con la sospensione non c'entrano
   * (e potrebbero rifiutarla per un campo che manca da mesi), e un comando di un
   * campo solo non deve poter portarsi dietro il resto della scheda.
   * `seguiLoStatoDelPartner` fa il lavoro sui prodotti nei due versi: archiviati
   * alla sospensione, ripescati alla riattivazione — solo quelli archiviati per
   * questo motivo, così un archivio deciso a mano non si riapre da solo.
   */
  async disattiva(id: string) {
    return this.cambiaAttivazione(id, false);
  }

  async attiva(id: string) {
    return this.cambiaAttivazione(id, true);
  }

  private async cambiaAttivazione(id: string, attivo: boolean) {
    const prima = await this.findOne(id);
    const dopo = await this.prisma.partner.update({
      where: { id },
      data: { active: attivo },
      include: PARTNER_INCLUDE,
      omit: PARTNER_OMIT,
    });
    await this.seguiLoStatoDelPartner(id, Boolean((prima as any).active), attivo);
    this.anagrafiche.sincronizza(dopo);
    return dopo;
    this.aggiornaCalendarioSito(id);
  }

  /** Ripristina un partner eliminato (torna disattivato, non attivo). */
  async ripristina(id: string) {
    return this.prisma.partner.update({
      where: { id },
      data: { deleted: false },
      include: PARTNER_INCLUDE,
      omit: PARTNER_OMIT,
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
      omit: PARTNER_OMIT,
    });
    if (!partner) throw new NotFoundException('Partner non trovato');
    return partner;
  }

  /**
   * ⭐ 08/09/2026 (regola dell'utente) — LA COMPENSAZIONE È OBBLIGATORIA PER CHI VENDE.
   *
   * `compensazioneIncassi` ha tre stati e nasce `null` = «ancora da valorizzare».
   * Per un partner che fa solo consegne va benissimo lasciarlo così: la domanda
   * non lo riguarda. Ma se ha un servizio con `pricingModel = 'VENDITA'` allora
   * quel campo decide come girano i soldi — se le commissioni che il partner ci
   * deve si scalano dagli incassi che noi gli dobbiamo, o se restano due partite
   * separate — e rimandarlo vuol dire non sapere quanto pagargli. Lì si ferma.
   *
   * ⚠️ Si guarda il RISULTATO del salvataggio, non solo ciò che arriva: chi
   * aggiunge un servizio di vendita a un partner che ce l'ha `null` va fermato,
   * e chi manda i soli contatti di un partner già a posto no.
   */
  private async esigiCompensazioneSeVende(
    compensazioneInArrivo: boolean | null | undefined,
    serviziInArrivo: { serviceTypeId: string }[] | undefined,
    esistente?: {
      compensazioneIncassi?: boolean | null;
      services?: { serviceType?: { pricingModel?: string | null } | null }[];
    } | null,
  ) {
    // Il valore che avrà DOPO il salvataggio: se la chiave non arriva, resta quello di prima.
    const finale = compensazioneInArrivo !== undefined ? compensazioneInArrivo : esistente?.compensazioneIncassi ?? null;
    if (finale !== null && finale !== undefined) return; // una scelta c'è: niente da chiedere

    let vende: boolean;
    if (serviziInArrivo) {
      // I servizi arrivano col payload: contano quelli, non quelli in archivio.
      const ids = [...new Set(serviziInArrivo.map((s) => s.serviceTypeId).filter(Boolean))];
      if (!ids.length) return;
      const tipi = await this.prisma.serviceType.findMany({ where: { id: { in: ids } }, select: { pricingModel: true } });
      vende = tipi.some((t) => t.pricingModel === 'VENDITA');
    } else {
      vende = (esistente?.services ?? []).some((s) => s?.serviceType?.pricingModel === 'VENDITA');
    }
    if (!vende) return;

    throw new BadRequestException(
      'Questo partner ha servizi di VENDITA: «Compensa commissioni e vendite» non può restare da valorizzare. ' +
        'Scegli sì o no — decide se le commissioni che ci deve si scalano dagli incassi che gli dobbiamo.',
    );
  }

  async create(dto: CreatePartnerDto, actor?: JwtUser) {
    const { provinceIds, categoryIds, mestiereIds, areaIds, consegnaProvince, services, openingHours, pickupAddresses, ...scalar } = dto;
    await this.esigiCompensazioneSeVende(scalar.compensazioneIncassi, services, null);
    if ((scalar as any).insegna != null) (scalar as any).insegna = titleCaseInsegna((scalar as any).insegna) ?? (scalar as any).insegna;
    const partner = await this.prisma.partner.create({
      data: {
        ...scalar,
        contractStart: scalar.contractStart ? new Date(scalar.contractStart) : undefined,
        contractEnd: scalar.contractEnd ? new Date(scalar.contractEnd) : undefined,
        pickupAddresses: pickupAddresses?.length ? JSON.stringify(pickupAddresses) : undefined,
        // ⭐ 06/09 (regola utente): `provinceIds` sono le province scelte A MANO, oltre alle aree.
        provinces: provinceIds?.length
          ? { create: [...new Set(provinceIds)].map((provinceId) => ({ provinceId, manuale: true })) }
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
        mestieri: mestiereIds?.length ? { create: mestiereIds.map((mestiereId) => ({ mestiereId })) } : undefined,
      },
      include: PARTNER_INCLUDE,
      omit: PARTNER_OMIT,
    });
    // ⭐ 06/09 (regola utente): le AREE decidono le province effettive (unione).
    if (areaIds?.length) await this.aree.assegnaAlPartner(partner.id, areaIds);
    if (consegnaProvince?.length) await this.scriviAreaDiConsegna(partner.id, consegnaProvince);
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

    // ⚠️ Un record del registro creato dalla piattaforma (`fonte: platform`) e'
    // un rispecchiamento dei nostri stessi dati: confrontarcisi non prova nulla,
    // dice sempre «nessuna differenza». Se esiste un altro record con la stessa
    // P.IVA, quello e' probabilmente l'anagrafica vera, e il collegamento e'
    // finito sul doppione. Successo davvero il 23/08 con 142 RESTAURANT, la cui
    // ragione sociale «BEYOND 142 SRL» era percio' introvabile.
    const gemelli = await this.anagrafiche.gemelli(trovato);
    const specchio = trovato.fonte === 'platform' && gemelli.length > 0;

    const fin = trovato.datiFinanziari ?? null;
    // ⭐ Da dove viene, e da quando, ogni dato fiscale del registro.
    //
    // È la risposta alla domanda «è più aggiornato il loro o il nostro?».
    // Le date di record non possono darla: il nostro `updatedAt` cambia anche
    // solo perché un import ha toccato il telefono, e infatti su 142 RESTAURANT
    // diceva che eravamo più freschi noi — ma solo perché ci avevo scritto io
    // quella mattina.
    const provenienza = fin?.aggiornamenti ?? {};
    const DA_DOVE: Record<string, string> = {
      'Codice SDI': 'codiceSdi', PEC: 'pec', IBAN: 'iban',
      'Intestatario conto': 'intestatarioConto', 'Metodo di pagamento': 'metodoPagamento',
      'Amministrazione — nome': 'amministrazioneNome',
      'Amministrazione — email': 'amministrazioneEmail',
      'Amministrazione — telefono': 'amministrazioneTelefono',
    };

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
      // — Dati fiscali e bancari —
      //
      // Stanno nel registro sotto `datiFinanziari`, e sono i piu' utili da
      // confrontare: su 97 partner abbinati ci sono 164 valori che qui mancano
      // e la' ci sono. Sono anche i piu' delicati: 12 P.IVA e 3 IBAN
      // discordano, e un IBAN sbagliato e' un bonifico a un estraneo.
      ['Codice SDI', p.sdiCode, fin?.codiceSdi],
      ['PEC', p.certifiedEmail, fin?.pec],
      ['IBAN', p.bankAccount, fin?.iban],
      ['Intestatario conto', p.bankAccountName, fin?.intestatarioConto],
      ['Metodo di pagamento', p.paymentMethod, fin?.metodoPagamento],
      ['Stato finanziario', p.financialStatus, trovato.statoFinanziario],
      ['Amministrazione — nome', p.adminName, fin?.amministrazioneNome],
      ['Amministrazione — email', p.adminEmail, fin?.amministrazioneEmail],
      ['Amministrazione — telefono', p.adminPhone, fin?.amministrazioneTelefono],
    ];
    const norm = (v: unknown) => (v === null || v === undefined || v === '' ? null : String(v).trim());
    const differenze = coppie
      .map(([campo, qui, la]) => {
        const prov = provenienza[DA_DOVE[campo] ?? ''];
        return {
          campo, piattaforma: norm(qui), registro: norm(la),
          // Presenti solo dove il registro lo sa: una data non si inventa.
          scrittoDa: prov?.sistema ?? null,
          scrittoIl: prov?.asOf ?? null,
        };
      })
      .filter((d) => d.piattaforma !== d.registro);

    return {
      stato: (trovato as any).platformId === p.id ? 'collegato' : 'trovato-non-collegato',
      specchio,
      gemelli: gemelli.map((g) => ({
        id: g.id, nome: g.nome, ragioneSociale: g.ragioneSociale ?? null,
        citta: g.citta ?? null, fonte: g.fonte ?? null, contatti: g.contatti?.length ?? 0,
      })),
      criterio,
      anagrafica: { id: trovato.id, nome: trovato.nome, platformId: (trovato as any).platformId ?? null },
      // ⭐ 10/09/2026: chi fattura per questa sede, se è dentro un capogruppo del registro.
      capogruppo: (trovato as any).capogruppo ? { id: (trovato as any).capogruppo.id, nome: (trovato as any).capogruppo.nome } : null,
      pagaDaSe: (trovato as any).pagaDaSe ?? null,
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
  /**
   * Manda il partner al registro.
   *
   * ⭐ 04/09/2026 (regola utente): con più candidati non si sceglie da soli, ma
   * ORA si può dire quale — `anagraficaId` — oppure chiedere al registro di
   * **crearne una nuova** (`creaNuova`). Prima la risposta era solo un «no» e
   * non c'era modo di andare avanti dalla pagina.
   *
   * ⚠️ `creaNuova` è una decisione, non un ripiego: si scrive nel messaggio
   * che il doppione, se c'è, l'abbiamo voluto noi.
   */
  async sincronizzaAnagrafica(
    id: string,
    actor?: JwtUser,
    scelta?: { anagraficaId?: string | null; creaNuova?: boolean; campi?: string[] },
  ) {
    const p = await this.findOne(id, actor);
    if (scelta?.anagraficaId) {
      const esito = await this.anagrafiche.sincronizzaOra(p as any, scelta.anagraficaId, scelta.campi);
      return esito;
    }
    if (scelta?.creaNuova) {
      const esito = await this.anagrafiche.sincronizzaOra(p as any, null, scelta.campi);
      return { ...esito, messaggio: esito.ok ? `Creata una scheda nuova nel registro (scelta dall'ufficio). ${esito.messaggio}` : esito.messaggio };
    }
    const { trovato, candidati } = await this.anagrafiche.cerca({
      id: p.id, insegna: p.insegna, businessName: p.businessName,
      vatNumber: p.vatNumber, fiscalCode: p.fiscalCode, email: p.email,
    });
    if (!trovato && candidati.length) {
      return {
        ok: false, stato: 0,
        messaggio: `Nel registro ci sono ${candidati.length} record possibili: scegliere a mano quale collegare, o chiedere di crearne una nuova.`,
      };
    }
    return this.anagrafiche.sincronizzaOra(p as any, trovato?.id ?? null, scelta?.campi);
  }

  /**
   * Porta nella piattaforma i campi scelti dal record del registro.
   *
   * È la direzione che mancava: fino al 23/08 esisteva solo «Invia al registro»,
   * cioè schiacciare i nostri dati sui loro. Ma su 89 partner confrontabili il
   * registro ha 33 codici fiscali che qui mancano e 8 P.IVA vere al posto del
   * segnaposto 11111111111 — e allo stesso tempo ha il telefono VUOTO su 84 e
   * l'email vuota su 77.
   *
   * Da qui le due regole non negoziabili:
   *
   *  1. **Un vuoto non sovrascrive mai un valore.** Un import «prendi tutto»
   *     avrebbe cancellato 239 valori per guadagnarne 34.
   *  2. **Insegna e indirizzo non si importano se non esplicitamente chiesti.**
   *     Nel registro c'è l'AZIENDA, qui il PUNTO VENDITA: «DR VRANJES FIORI
   *     CHIARI» diventerebbe «DR. VRANJES», e il suo indirizzo quello della
   *     sede legale, uguale per tutti i negozi della catena.
   */
  cercaAnagrafiche(q: string) { return this.anagrafiche.cercaPerNome(q); }

  /** ⭐ 10/09/2026 (regola utente): questo partner fattura sotto l'entità di un ALTRO partner della piattaforma. */
  async mettiSottoEntita(id: string, capofilaId: string, actor?: JwtUser) {
    if (!capofilaId || capofilaId === id) throw new BadRequestException('Scegli un altro partner come entità di fatturazione.');
    const [sede, capofila] = await Promise.all([this.findOne(id, actor), this.findOne(capofilaId, actor)]);
    return this.anagrafiche.mettiSottoCapogruppo(sede as any, capofila as any);
  }

  async importaDaAnagrafica(id: string, campi: string[], actor?: JwtUser) {
    const confronto = await this.confrontaAnagrafica(id, actor);
    if (!confronto.anagrafica) {
      return { ok: false, messaggio: 'Nessun record del registro collegato a questo partner.', applicati: [] };
    }
    // Importare da un record che abbiamo scritto noi significa ricopiarsi addosso
    // i propri dati, e per giunta lasciando fuori l'anagrafica vera.
    if ((confronto as any).specchio) {
      return {
        ok: false,
        messaggio:
          "Il record collegato e' un doppione creato dalla piattaforma: importarne i dati "
          + "non porterebbe nulla. Collegare prima l'anagrafica vera.",
        applicati: [],
      };
    }

    const scelti = new Set(campi);
    const dati: Record<string, unknown> = {};
    const applicati: { campo: string; da: string | null; a: string }[] = [];
    const ignorati: { campo: string; perche: string }[] = [];

    for (const d of confronto.differenze) {
      if (!scelti.has(d.campo)) continue;
      const chiave = CAMPI_IMPORTABILI[d.campo];
      if (!chiave) { ignorati.push({ campo: d.campo, perche: 'campo non importabile' }); continue; }
      if (!d.registro) {
        ignorati.push({ campo: d.campo, perche: 'nel registro è vuoto: non si sovrascrive un valore con un vuoto' });
        continue;
      }
      dati[chiave] = d.registro;
      applicati.push({ campo: d.campo, da: d.piattaforma, a: d.registro });
    }

    if (!applicati.length) {
      return { ok: false, messaggio: 'Nessun campo da importare.', applicati: [], ignorati };
    }

    // L'email è unica in piattaforma: importarne una già in uso farebbe fallire
    // l'intero salvataggio con un errore di vincolo, illeggibile a schermo.
    if (typeof dati.email === 'string') {
      const occupata = await this.prisma.partner.findFirst({
        where: { email: dati.email, id: { not: id } },
        select: { id: true, insegna: true },
      });
      if (occupata) {
        return {
          ok: false,
          messaggio: `L'email ${dati.email} è già di «${occupata.insegna}»: non può stare su due partner.`,
          applicati: [],
        };
      }
    }

    await this.prisma.partner.update({ where: { id }, data: dati });
    return { ok: true, messaggio: `Importati ${applicati.length} campi dal registro.`, applicati, ignorati };
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
      omit: PARTNER_OMIT,
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

  /**
   * I prodotti seguono il partner: se lo si disattiva, vanno in archivio.
   *
   * Un prodotto di un partner spento non è vendibile — non compare nel form
   * consegna, non lo smista nessuno — ma restava nella lista principale come
   * se lo fosse. Erano 522 su 15.135.
   *
   * ⚠️ Si segna il MOTIVO (`archivedReason`), e serve alla direzione opposta:
   * riattivando il partner si ripescano **solo** i prodotti finiti in archivio
   * per causa sua. Senza quel segno, riattivare avrebbe tirato fuori anche
   * quelli che qualcuno aveva archiviato apposta — disfacendo una decisione
   * presa da una persona.
   */
  private async seguiLoStatoDelPartner(partnerId: string, prima: boolean, dopo: boolean) {
    if (prima === dopo) return;
    const MOTIVO = 'partner-disattivato';
    if (!dopo) {
      const { count } = await this.prisma.product.updateMany({
        where: { partnerId, archived: false },
        data: { archived: true, archivedAt: new Date(), archivedReason: MOTIVO },
      });
      if (count) this.logger.log(`Partner ${partnerId} disattivato: ${count} prodotti archiviati`);
      return;
    }
    const { count } = await this.prisma.product.updateMany({
      where: { partnerId, archived: true, archivedReason: MOTIVO },
      data: { archived: false, archivedAt: null, archivedReason: null },
    });
    if (count) this.logger.log(`Partner ${partnerId} riattivato: ${count} prodotti ripescati`);
  }

  /** ⭐ 06/09 sera: riscrive l'area di consegna (province + minimo/raggio per provincia). Lista vuota = nessuna. */
  private async scriviAreaDiConsegna(partnerId: string, righe: { provinceId: string; minimoOrdine?: number | null; raggioKm?: number | null }[]) {
    const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : null);
    const viste = new Set<string>();
    const pulite = righe.filter((r) => r && typeof r.provinceId === 'string' && !viste.has(r.provinceId) && viste.add(r.provinceId));
    if (pulite.length) {
      const n = await this.prisma.province.count({ where: { id: { in: pulite.map((r) => r.provinceId) } } });
      if (n !== pulite.length) throw new BadRequestException('Provincia sconosciuta nell\'area di consegna');
    }
    await this.prisma.$transaction([
      this.prisma.partnerConsegnaProvincia.deleteMany({ where: { partnerId } }),
      ...(pulite.length ? [this.prisma.partnerConsegnaProvincia.createMany({ data: pulite.map((r) => ({ partnerId, provinceId: r.provinceId, minimoOrdine: num(r.minimoOrdine), raggioKm: num(r.raggioKm) })), skipDuplicates: true })] : []),
    ]);
  }

  async update(id: string, dto: UpdatePartnerDto, user: JwtUser) {
    if (user.role === Role.PARTNER && user.partnerId !== id) {
      throw new ForbiddenException('Accesso non consentito');
    }
    // ⚠️ 02/09 (regola utente: mai prezzi e tariffe in mano al partner). Il
    // DTO dichiara ANCHE kmIncluded, extraOutOfCityPrice, listini, carnet,
    // insegna, stato: whitelist ≠ difesa (lezione del 27/08 sulle consegne).
    // Per il PARTNER si RIASSEGNA il dto tenendo il solo elenco esplicito dei
    // contatti; tutto il resto — economia, identità, configurazione — resta
    // dell'ufficio.
    if (user.role === Role.PARTNER) {
      const p = dto as Record<string, unknown>;
      dto = {
        ...(p['phone'] !== undefined ? { phone: p['phone'] } : {}),
        ...(p['email'] !== undefined ? { email: p['email'] } : {}),
        ...(p['address'] !== undefined ? { address: p['address'] } : {}),
        // 02/09 (regola utente): gli indirizzi di RITIRO aggiuntivi sono suoi
        // — li imposta dalla scheda profilo.
        ...(Array.isArray(p['pickupAddresses']) ? { pickupAddresses: p['pickupAddresses'] as string[] } : {}),
        // ⭐ 06/09/2026 sera (difetto segnalato dall'utente: «ho salvato consegna partner, km e
        // minimo dal profilo e non ha salvato nulla»): questa riassegnazione BUTTAVA i tre campi
        // di vendita prima che la whitelist qui sotto potesse ammetterli. Passano, e restano
        // comunque gated dal servizio di VENDITA (controllo più avanti).
        ...(p['autoDeliveredByPartner'] !== undefined ? { autoDeliveredByPartner: p['autoDeliveredByPartner'] } : {}),
        ...(p['minimoOrdineVendita'] !== undefined ? { minimoOrdineVendita: p['minimoOrdineVendita'] } : {}),
        ...(p['raggioMaxConsegnaKm'] !== undefined ? { raggioMaxConsegnaKm: p['raggioMaxConsegnaKm'] } : {}),
        ...(Array.isArray(p['consegnaProvince']) ? { consegnaProvince: p['consegnaProvince'] as any } : {}),
      } as UpdatePartnerDto;
    }
    const prima = await this.findOne(id);
    const { provinceIds, categoryIds, mestiereIds, areaIds, consegnaProvince, services, openingHours, pickupAddresses, ...rest } = dto;
    // Obbligatoria per chi vende: si controlla PRIMA di scrivere, e sul
    // risultato — servizi in arrivo se ci sono, altrimenti quelli in archivio.
    await this.esigiCompensazioneSeVende((rest as any).compensazioneIncassi, services, prima as any);

    /**
     * ⚠⚠ 08/09/2026 — SECONDA FALLA TROVATA DALL'AGENTE OSTILE: la porta accanto.
     *
     * Le coordinate bancarie hanno una rotta loro, con la verifica per email. Ma
     * `PUT /partners/:id` accetta `bankAccount` e `bankAccountName` dal DTO e il ramo
     * restrittivo scatta solo per il ruolo PARTNER: **PROJECT_MANAGER, OPERATION e ADMIN
     * li scrivevano dalla rotta generica**, senza codice, senza checksum, senza avviso al
     * partner e senza avviso all'ufficio. La porta nuova chiusa a chiave, quella vecchia
     * accanto socchiusa — e per il project manager era perfino in contraddizione col
     * commento che dichiara «non tocca il denaro di nessuno».
     *
     * Adesso da qui l'IBAN non passa per NESSUNO. Chi lo deve cambiare usa la rotta con la
     * verifica; l'ufficio può farlo per conto del partner dalla stessa rotta (è fra i ruoli
     * ammessi), e così il gesto lascia sempre la sua traccia.
     */
    const banca = rest as { bankAccount?: string; bankAccountName?: string };
    if (banca.bankAccount !== undefined || banca.bankAccountName !== undefined) {
      const iban = normalizzaIban(banca.bankAccount ?? '');
      const nome = String(banca.bankAccountName ?? '').trim();
      const ibanCambia = banca.bankAccount !== undefined && iban !== normalizzaIban(prima.bankAccount ?? '');
      const nomeCambia = banca.bankAccountName !== undefined && nome !== (prima.bankAccountName ?? '').trim();
      const ufficio = user.role === Role.ADMIN || user.role === Role.OPERATION;

      if (!ufficio) {
        // PARTNER e PROJECT_MANAGER: da qui non passano. Il partner ha la rotta con la
        // verifica; il project manager «sul denaro di nessuno», come dice il suo commento.
        delete banca.bankAccount;
        delete banca.bankAccountName;
        if (ibanCambia || nomeCambia) {
          this.logger.warn(
            `Tentativo di cambiare le coordinate bancarie del partner ${id} dalla scheda (${user.role}, ${user.email ?? user.sub}): rifiutato.`,
          );
          throw new BadRequestException(
            "Le coordinate bancarie non si cambiano da qui: si usa il riquadro «Coordinate bancarie» del profilo, " +
            "che manda un codice di verifica all'indirizzo email del partner.",
          );
        }
      } else if (ibanCambia || nomeCambia) {
        /**
         * ⚠️ L'UFFICIO CONTINUA A POTERLO FARE — ma non in silenzio (08/09/2026).
         *
         * La versione precedente della toppa vietava la scrittura a TUTTI. Chiudeva la
         * falla del project manager, ma **toglieva all'ufficio l'unica via che aveva**
         * per correggere un IBAN sbagliato (il riquadro con la verifica sta nel profilo
         * del PARTNER, e manda il codice a lui: se il partner non risponde, l'ufficio
         * resta fermo). E il solo intestatario diventava immodificabile in silenzio.
         * Una difesa che costringe a lavorare da un'altra parte non protegge: sposta.
         *
         * Quindi ADMIN e OPERATION scrivono, con tre condizioni: l'IBAN passa dal
         * CHECKSUM come dalla rotta verificata, il gesto lascia un log, e l'avviso parte
         * sia al partner sia all'ufficio. È un rischio accettato e dichiarato: chi ha
         * quelle credenziali può già fare molto altro, ma non lo fa senza lasciare traccia.
         */
        if (ibanCambia && !ibanValido(iban)) {
          throw new BadRequestException("L'IBAN non è valido: controlli di averlo copiato per intero.");
        }
        if (ibanCambia) banca.bankAccount = iban;
        this.logger.warn(
          `Coordinate bancarie del partner ${id} cambiate DALL'UFFICIO (${user.role}, ${user.email ?? user.sub}): ` +
          `${ibanMascherato(prima.bankAccount)} → ${ibanMascherato(ibanCambia ? iban : prima.bankAccount)}`,
        );
        void this.avvisaUfficioBanca('fatto', prima.insegna ?? '', prima.bankAccount, ibanCambia ? iban : (prima.bankAccount ?? ''), nome || (prima.bankAccountName ?? ''));
        void this.avvisaPartnerCambioBanca(prima.id, prima.insegna ?? '', prima.email, prima.bankAccount, ibanCambia ? iban : (prima.bankAccount ?? ''));
      }
    }
    const scalar = {
      ...rest,
      ...(rest.insegna != null ? { insegna: titleCaseInsegna(rest.insegna) ?? rest.insegna } : {}),
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
      // ⚠️ 02/09: email e indirizzo qui MANCAVANO — la scheda profilo li
      // mandava (il dto riassegnato sopra li ammette) ma questa seconda
      // whitelist li buttava in silenzio: si salvava solo il telefono.
      // ⚠⚠ 08/09/2026: il cambio del RECAPITO lascia una traccia, perché è il primo passo
      // dell'attacco all'IBAN (l'ostile: si riscrive l'email, poi si chiede il codice).
      // `emailCambiataIl` fa scattare il blocco di sette giorni sul cambio delle coordinate,
      // `emailPrecedente` fa arrivare il codice anche dove arrivava prima.
      if (scalar.email !== undefined) {
        allowed.email = scalar.email;
        const nuova = String(scalar.email ?? '').trim().toLowerCase();
        const vecchia = (prima.email ?? '').trim().toLowerCase();
        if (nuova && nuova !== vecchia) {
          allowed.emailCambiataIl = new Date();
          allowed.emailPrecedente = prima.email ?? null;
          // ⚠️ L'AVVISO AL VECCHIO RECAPITO (secondo giro dell'ostile). Il blocco dei
          // sette giorni, da solo, per chi ha la password è solo un'ATTESA: cambia il
          // recapito, aspetta, poi dirotta l'IBAN. Questo avviso rende l'attesa inutile,
          // perché il titolare vero lo scopre il giorno stesso — all'indirizzo che
          // l'attaccante ha appena smesso di controllare.
          void this.avvisaCambioRecapito(prima.insegna ?? '', vecchia, nuova);
        }
      }
      if (scalar.address !== undefined) allowed.address = scalar.address;
      // ⭐ 06/09/2026 (regola utente): con un servizio di VENDITA il partner regola da solo
      // «Consegna da Partner», minimo d'ordine e raggio (la rotta del profilo lo controlla già; qui
      // vale anche per chi chiama /partners/:id direttamente).
      if ((scalar as any).autoDeliveredByPartner !== undefined || (scalar as any).minimoOrdineVendita !== undefined || (scalar as any).raggioMaxConsegnaKm !== undefined) {
        const vend = await this.prisma.partnerService.count({ where: { partnerId: id, serviceType: { pricingModel: 'VENDITA' } } });
        if (vend > 0) {
          if ((scalar as any).autoDeliveredByPartner !== undefined) allowed.autoDeliveredByPartner = (scalar as any).autoDeliveredByPartner;
          if ((scalar as any).minimoOrdineVendita !== undefined) allowed.minimoOrdineVendita = (scalar as any).minimoOrdineVendita;
          if ((scalar as any).raggioMaxConsegnaKm !== undefined) allowed.raggioMaxConsegnaKm = (scalar as any).raggioMaxConsegnaKm;
        }
      }
      if ((scalar as any).pickupAddresses !== undefined) allowed.pickupAddresses = (scalar as any).pickupAddresses;
      const aggiornatoPartner = await this.prisma.partner.update({
        where: { id },
        data: {
          ...allowed,
          ...(openingHours
            ? { openingHours: { deleteMany: {}, create: openingHours } }
            : {}),
        },
        include: PARTNER_INCLUDE,
      omit: PARTNER_OMIT,
      });
      if (openingHours) this.aggiornaCalendarioSito(id);
      // ⭐ 06/09 sera (segnalazione utente): area di consegna dal profilo: il ramo PARTNER esce qui,
      // quindi va scritta QUI (gated dal servizio di VENDITA come gli altri campi di vendita).
      if (consegnaProvince && (await this.prisma.partnerService.count({ where: { partnerId: id, serviceType: { pricingModel: 'VENDITA' } } })) > 0) {
        await this.scriviAreaDiConsegna(id, consegnaProvince);
      }
      const conArea = await this.findOne(id);
      this.anagrafiche.sincronizza(conArea);
      return conArea;
    }

    const aggiornato = await this.prisma.partner.update({
      where: { id },
      data: {
        ...scalar,
        ...(provinceIds
          ? {
              provinces: {
                deleteMany: {},
                create: [...new Set(provinceIds)].map((provinceId) => ({ provinceId, manuale: true })),
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
        ...(mestiereIds ? { mestieri: { deleteMany: {}, create: mestiereIds.map((mestiereId) => ({ mestiereId })) } } : {}),
      },
      include: PARTNER_INCLUDE,
      omit: PARTNER_OMIT,
    });
    // ⭐ 06/09 (regola utente): con le AREE le province effettive si ricalcolano (unione delle aree).
    if (areaIds) await this.aree.assegnaAlPartner(id, areaIds);
    else if (provinceIds) await this.aree.ricalcolaProvincePartner(id); // le province delle aree tornano accanto a quelle a mano
    // ⭐ 06/09 sera: l'AREA DI CONSEGNA (per il PARTNER solo con un servizio di VENDITA, come gli altri campi di vendita).
    if (consegnaProvince && ((user.role as Role) !== Role.PARTNER || (await this.prisma.partnerService.count({ where: { partnerId: id, serviceType: { pricingModel: 'VENDITA' } } })) > 0)) {
      await this.scriviAreaDiConsegna(id, consegnaProvince);
    }
    await this.seguiLoStatoDelPartner(id, prima.active, aggiornato.active);
    if (openingHours || prima.active !== aggiornato.active) this.aggiornaCalendarioSito(id);
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
      omit: PARTNER_OMIT,
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
    this.aggiornaCalendarioSito(partnerId);
    return { date: row.date.toISOString().slice(0, 10), ...data };
  }

  async removeDayException(partnerId: string, user: JwtUser, dateStr: string) {
    this.assertCanManage(partnerId, user);
    const date = new Date(dateStr + 'T00:00:00.000Z');
    await this.prisma.partnerDayException.deleteMany({ where: { partnerId, date } });
    this.aggiornaCalendarioSito(partnerId);
    return { deleted: true };
  }

  // ============================================================
  // CAMBIO DELLE COORDINATE BANCARIE IN DUE PASSI (⭐ 08/09/2026, regola utente)
  // ------------------------------------------------------------
  // «In impostazioni del profilo consenti di modificare anche le proprie informazioni sul
  // conto corrente e intestatario conto; per modificare queste cose però va inserito un
  // codice che l'app manda alla mail del partner con il codice di verifica. È solo per la
  // modifica delle informazioni bancarie.»
  //
  // ⚠️ Le parti pure (validazione IBAN, codice, impronta, mail) stanno in `cambio-iban.ts`.
  // Qui c'è solo il giro: chi può, cosa si salva, quando si scrive davvero.
  // ============================================================

  /**
   * Per quanti giorni, dopo un cambio del recapito email, le coordinate bancarie restano
   * bloccate. Chiude l'ordine di mosse dell'attacco trovato dall'ostile: prima si riscrive
   * l'email, poi si chiede il codice. Sette giorni sono il tempo perché un partner vero si
   * accorga di un cambio che non ha fatto — e per lui il blocco è un'attesa, non una porta
   * chiusa: l'ufficio può sempre cambiare l'IBAN dalla scheda.
   */
  private static readonly GIORNI_DOPO_CAMBIO_EMAIL = 7;

  /** Il partner agisce sul PROPRIO profilo; ufficio e amministrazione su chiunque. */
  private assertPuoToccareBanca(partnerId: string, user: JwtUser) {
    if (user.role === Role.PARTNER) {
      if (user.partnerId !== partnerId) throw new ForbiddenException('Accesso non consentito');
      return;
    }
    if (user.role === Role.ADMIN || user.role === Role.OPERATION) return;
    throw new ForbiddenException('Questo ruolo non può cambiare le coordinate bancarie');
  }

  /**
   * Lo stato della richiesta in corso, per l'interfaccia: c'è un codice in attesa? dove è
   * stato mandato? quanto manca alla scadenza? Non torna MAI l'impronta né il codice.
   */
  async statoCambioBanca(partnerId: string, user: JwtUser) {
    this.assertPuoToccareBanca(partnerId, user);
    const p = await this.prisma.partner.findUnique({
      where: { id: partnerId },
      select: {
        email: true, bankAccount: true, bankAccountName: true,
        bankCodeExpiresAt: true, bankCodeAttempts: true, bankPending: true,
      },
    });
    if (!p) throw new NotFoundException('Partner non trovato');
    const sospeso = leggiSospeso(p.bankPending);
    const scaduto = !p.bankCodeExpiresAt || p.bankCodeExpiresAt.getTime() <= Date.now();
    return {
      ibanAttuale: p.bankAccount ? ibanLeggibile(p.bankAccount) : null,
      intestatarioAttuale: p.bankAccountName ?? null,
      // Dove arriverebbe il codice: chi chiede il cambio deve sapere dove guardare, ma
      // la casella non si scrive per intero a chi magari non è il proprietario.
      mailDiVerifica: p.email ? emailMascherata(p.email) : null,
      inAttesa: !!(sospeso && !scaduto),
      richiesta: sospeso && !scaduto
        ? { iban: ibanLeggibile(sospeso.bankAccount), intestatario: sospeso.bankAccountName,
            scadeIl: p.bankCodeExpiresAt, tentativiRimasti: Math.max(0, TENTATIVI_MASSIMI - p.bankCodeAttempts) }
        : null,
    };
  }

  /**
   * PRIMO PASSO: si chiede il cambio. **Non si scrive niente** sui campi veri — i valori
   * proposti restano parcheggiati e parte il codice alla mail in anagrafica.
   */
  async richiediCambioBanca(partnerId: string, user: JwtUser, dto: { bankAccount?: string; bankAccountName?: string }) {
    this.assertPuoToccareBanca(partnerId, user);
    const iban = normalizzaIban(String(dto?.bankAccount ?? ''));
    const intestatario = String(dto?.bankAccountName ?? '').trim();
    if (!ibanValido(iban)) {
      throw new BadRequestException("L'IBAN non è valido: controlli di averlo copiato per intero.");
    }
    if (!intestatarioValido(intestatario)) {
      throw new BadRequestException("L'intestatario del conto è obbligatorio.");
    }
    const p = await this.prisma.partner.findUnique({
      where: { id: partnerId },
      select: { insegna: true, email: true, bankAccount: true, bankAccountName: true,
                bankCodeSentAt: true, emailCambiataIl: true, emailPrecedente: true },
    });
    if (!p) throw new NotFoundException('Partner non trovato');

    /**
     * ⚠⚠ LA FALLA CHE L'AGENTE OSTILE HA TROVATO NELLA PRIMA VERSIONE (08/09/2026).
     *
     * Il codice si manda «all'indirizzo in anagrafica» per non farlo scegliere a chi chiede
     * il cambio. Ma `Partner.email` è **nella whitelist del profilo del partner**: chi ha
     * una sessione di partner poteva
     *   1. `POST /auth/profilo` con `{partner:{email:'suo@indirizzo'}}`,
     *   2. chiedere il codice — che arrivava a lui,
     *   3. confermare, e dirottare i bonifici.
     * Due salvataggi sulla stessa schermata. La verifica non verificava niente, e il
     * titolare vero non riceveva né il codice né l'avviso: anche il recapito in anagrafica
     * era ormai quello dell'attaccante, e di lì finiva pure nel registro Anagrafiche da cui
     * FINANCE legge l'IBAN per pagare.
     *
     * Tre chiusure, che valgono solo insieme:
     *   a) un recapito appena cambiato NON apre un cambio IBAN (`GIORNI_DOPO_CAMBIO_EMAIL`)
     *      — chiude proprio l'ordine delle mosse dell'attacco;
     *   b) il codice parte verso TUTTI gli indirizzi noti (quello in scheda, quello
     *      dell'account, e il PRECEDENTE se il cambio è recente): chi ne riscrive uno non
     *      intercetta gli altri;
     *   c) l'ufficio riceve l'avviso già sulla RICHIESTA, non solo a cambio avvenuto.
     */
    if (p.emailCambiataIl) {
      const giorni = (Date.now() - p.emailCambiataIl.getTime()) / 86_400_000;
      if (giorni < PartnersService.GIORNI_DOPO_CAMBIO_EMAIL) {
        throw new BadRequestException(
          "L'indirizzo email del profilo è stato cambiato di recente: per sicurezza le coordinate bancarie non si " +
          `possono modificare per altri ${Math.ceil(PartnersService.GIORNI_DOPO_CAMBIO_EMAIL - giorni)} giorni. ` +
          "Se è urgente, contatti l'ufficio.",
        );
      }
    }
    const buona = (x: string | null | undefined) => {
      const v = (x ?? '').trim().toLowerCase();
      return v && v.includes('@') && !v.includes('no-email') ? v : null;
    };
    /**
     * ⚠⚠⚠ SECONDO GIRO DELL'OSTILE (08/09/2026): LA TOPPA AVEVA CREATO IL CANALE.
     *
     * Per non dipendere da un solo indirizzo avevo aggiunto fra i destinatari anche
     * l'email dell'ACCOUNT (`User.email`). Ma `User.email` si riscrive da
     * `POST /auth/profilo` **senza codice, senza conferma e senza attesa** — e senza
     * lasciare la traccia che fa scattare il blocco dei sette giorni, che guarda solo
     * `Partner.email`. Cioè: tre chiamate con una sessione rubata, nessuna attesa, IBAN
     * sostituito. Prima della mia «toppa» riscrivere `User.email` non serviva a niente.
     *
     * La regola che ne esce, e che vale oltre questo caso: **un secondo fattore non può
     * essere un dato che il primo fattore riscrive**. Ogni indirizzo raggiungibile dalla
     * sessione va o congelato o tolto dai destinatari. Qui si toglie: resta
     * `Partner.email`, che è protetta dal blocco dei sette giorni, più quello precedente.
     *
     * ⚠️ E il blocco dei sette giorni da solo sarebbe solo un'ATTESA per chi ha la
     * password: per questo, cambiando il recapito, ora parte un avviso al VECCHIO
     * indirizzo (`avvisaCambioRecapito`). Il titolare vero lo scopre il giorno stesso,
     * non sette giorni dopo a IBAN cambiato.
     */
    const precedenteVale = p.emailCambiataIl
      && (Date.now() - p.emailCambiataIl.getTime()) < 30 * 86_400_000;
    const destinatari = [...new Set([
      buona(p.email),
      precedenteVale ? buona(p.emailPrecedente) : null,
    ].filter(Boolean) as string[])];
    if (!destinatari.length) {
      throw new BadRequestException(
        "Il profilo non ha un indirizzo email valido: il codice non avrebbe dove arrivare. Contatti l'ufficio.",
      );
    }
    const a = destinatari[0];
    // ⚠️ Il SOLO intestatario deve poter cambiare (segnalato dall'ostile): la ragione
    // sociale si corregge senza toccare il conto, ed è comunque il campo che la banca
    // confronta col beneficiario — quindi passa dalla stessa verifica, non da una scorciatoia.
    // Prima si rifiutava tutto quando l'IBAN era uguale, e quella correzione non aveva
    // più nessuna strada: dalla scheda veniva scartata in silenzio, da qui rifiutata.
    const stessoIban = normalizzaIban(p.bankAccount ?? '') === iban;
    const stessoNome = (p.bankAccountName ?? '').trim() === intestatario;
    if (stessoIban && stessoNome) {
      throw new BadRequestException('Coordinate identiche a quelle registrate: non c\'è niente da cambiare.');
    }
    // Il bottone «rimanda» non deve diventare un modo per riempire una casella.
    if (p.bankCodeSentAt && Date.now() - p.bankCodeSentAt.getTime() < RIMANDA_DOPO_SECONDI * 1000) {
      const mancano = Math.ceil((RIMANDA_DOPO_SECONDI * 1000 - (Date.now() - p.bankCodeSentAt.getTime())) / 1000);
      throw new BadRequestException(`Un codice è appena partito: attenda ${mancano} secondi prima di chiederne un altro.`);
    }

    const codice = generaCodice();
    const scade = new Date(Date.now() + CODICE_VALIDO_MINUTI * 60_000);
    await this.prisma.partner.update({
      where: { id: partnerId },
      data: {
        bankCodeHash: impronta(codice),
        bankCodeExpiresAt: scade,
        bankCodeAttempts: 0,
        bankCodeSentAt: new Date(),
        bankPending: serializzaSospeso({ bankAccount: iban, bankAccountName: intestatario }),
      },
    });

    const { oggetto, html } = mailCodice(p.insegna ?? '', codice, iban, p.bankAccount);
    // ⚠️ A TUTTI gli indirizzi noti, non solo al primo: basta che UNO arrivi al titolare
    // vero perché un dirottamento si veda mentre l'IBAN è ancora il suo.
    const esiti = await Promise.all(destinatari.map((x) => this.settings.inviaHtmlViaAiMail(x, oggetto, html)));
    const esito = esiti.some((e) => e.ok)
      ? { ok: true, motivo: 'inviata' }
      : { ok: false, motivo: esiti[0]?.motivo ?? 'errore non specificato' };
    if (!esito.ok) {
      // ⚠️ Se la mail non parte la richiesta si annulla: lasciare un codice valido che
      // nessuno ha ricevuto vorrebbe dire lasciare aperta una porta senza campanello.
      await this.prisma.partner.update({
        where: { id: partnerId },
        data: { bankCodeHash: null, bankCodeExpiresAt: null, bankCodeSentAt: null, bankPending: null },
      });
      throw new BadRequestException(`Non si è riusciti a mandare il codice: ${esito.motivo}`);
    }
    this.logger.warn(
      `Cambio IBAN RICHIESTO per il partner ${partnerId} (${p.insegna}): ` +
      `${ibanMascherato(p.bankAccount)} → ${ibanMascherato(iban)}, codice a ` +
      `${destinatari.map(emailMascherata).join(', ')}, da ${user.email ?? user.sub}`,
    );
    // (c) L'ufficio lo sa ADESSO, non a cambio avvenuto: se la richiesta non è del partner,
    // questo è il momento in cui la si può ancora fermare.
    void this.avvisaUfficioBanca('richiesta', p.insegna ?? '', p.bankAccount, iban, intestatario);
    return {
      inviato: true,
      mailDiVerifica: emailMascherata(a),
      ancheAd: destinatari.slice(1).map(emailMascherata),
      scadeIl: scade,
      validoMinuti: CODICE_VALIDO_MINUTI,
    };
  }

  /**
   * SECONDO PASSO: arriva il codice, e SOLO adesso i campi veri cambiano.
   *
   * ⚠️ Il messaggio d'errore non distingue «codice sbagliato» da «codice scaduto» più del
   * necessario, e non dice mai quanto ci si è avvicinati: un errore che spiega troppo è
   * un aiuto a chi prova a indovinare.
   */
  async confermaCambioBanca(partnerId: string, user: JwtUser, codice: string) {
    this.assertPuoToccareBanca(partnerId, user);
    const p = await this.prisma.partner.findUnique({
      where: { id: partnerId },
      select: {
        insegna: true, bankAccount: true, bankAccountName: true,
        bankCodeHash: true, bankCodeExpiresAt: true, bankCodeAttempts: true, bankPending: true,
      },
    });
    if (!p) throw new NotFoundException('Partner non trovato');
    const sospeso = leggiSospeso(p.bankPending);
    if (!sospeso || !p.bankCodeHash || !p.bankCodeExpiresAt) {
      throw new BadRequestException('Non c\'è nessuna richiesta di cambio in corso.');
    }
    if (p.bankCodeExpiresAt.getTime() <= Date.now()) {
      await this.azzeraRichiestaBanca(partnerId);
      throw new BadRequestException('Il codice è scaduto: chieda un codice nuovo.');
    }
    if (p.bankCodeAttempts >= TENTATIVI_MASSIMI) {
      await this.azzeraRichiestaBanca(partnerId);
      throw new BadRequestException('Troppi tentativi: la richiesta è stata annullata. Ne faccia una nuova.');
    }
    if (!improntaCombacia(p.bankCodeHash, String(codice ?? ''))) {
      // ⚠️ ATOMICO (falla trovata dall'ostile, 08/09/2026). Prima si leggeva il contatore e
      // lo si riscriveva col valore assoluto `letto + 1`: N richieste in parallelo leggevano
      // tutte 0 e scrivevano tutte 1 — il tetto valeva solo provando in fila, e l'app non ha
      // nessun throttler. `increment` lo fa fare al database, e si decide sul valore che
      // TORNA, non su quello letto prima.
      const aggiornato = await this.prisma.partner.update({
        where: { id: partnerId },
        data: { bankCodeAttempts: { increment: 1 } },
        select: { bankCodeAttempts: true },
      });
      const dopo = aggiornato.bankCodeAttempts;
      if (dopo >= TENTATIVI_MASSIMI) {
        await this.azzeraRichiestaBanca(partnerId);
        throw new BadRequestException('Codice errato. Troppi tentativi: la richiesta è stata annullata.');
      }
      throw new BadRequestException(`Codice errato. Le restano ${TENTATIVI_MASSIMI - dopo} tentativi.`);
    }

    const vecchio = p.bankAccount;
    /**
     * ⚠️ IL CONSUMO DELLA RICHIESTA È ATOMICO (secondo giro dell'ostile, 08/09/2026).
     *
     * Rendere atomico il CONTATORE non bastava: la guardia che decide leggeva uno stato
     * scattato all'inizio della richiesta. N `conferma` in parallelo leggono tutte l'hash
     * ancora presente e `bankCodeAttempts = 0` prima che una qualsiasi scriva — e con la
     * latenza verso il database la coda è profonda. Il tetto non era «cinque prove»: era
     * «quante ne stanno in una raffica».
     *
     * Qui la condizione sta nella WHERE: solo una richiesta può trovare l'impronta ancora
     * al suo posto, e l'update che la azzera è lo stesso che scrive l'IBAN. Le altre
     * tornano `count: 0` e non scrivono niente.
     */
    const consumata = await this.prisma.partner.updateMany({
      where: {
        id: partnerId,
        bankCodeHash: p.bankCodeHash,
        bankCodeExpiresAt: { gt: new Date() },
        bankCodeAttempts: { lt: TENTATIVI_MASSIMI },
      },
      data: {
        bankAccount: sospeso.bankAccount,
        bankAccountName: sospeso.bankAccountName,
        bankCodeHash: null, bankCodeExpiresAt: null, bankCodeAttempts: 0,
        bankPending: null,
      },
    });
    if (consumata.count === 0) {
      // Qualcun altro ha già consumato (o esaurito) questa richiesta mentre la si confermava.
      throw new BadRequestException('La richiesta non è più valida: ne faccia una nuova.');
    }
    const aggiornato = await this.prisma.partner.findUniqueOrThrow({
      where: { id: partnerId },
      include: PARTNER_INCLUDE,
      omit: PARTNER_OMIT,
    });

    // ⚠️ L'UFFICIO DEVE SAPERLO. Un cambio di IBAN che avviene a insaputa di tutti è
    // esattamente lo scenario che questa funzione deve rendere impossibile: la verifica
    // per email ferma chi non ha la casella, l'avviso qui ferma chi ce l'ha.
    // L'avviso non blocca la risposta: il cambio è già valido e confermato.
    void this.avvisaUfficioBanca('fatto', p.insegna ?? '', vecchio, sospeso.bankAccount, sospeso.bankAccountName);
    this.logger.warn(
      `IBAN cambiato per il partner ${partnerId} (${p.insegna}): ${ibanMascherato(vecchio)} → ${ibanMascherato(sospeso.bankAccount)}, da ${user.email ?? user.sub}`,
    );
    this.anagrafiche.sincronizza(aggiornato);
    return { cambiato: true, iban: ibanLeggibile(sospeso.bankAccount), intestatario: sospeso.bankAccountName };
  }

  /** Si rinuncia: la richiesta sparisce e i campi veri restano quelli di prima. */
  async annullaCambioBanca(partnerId: string, user: JwtUser) {
    this.assertPuoToccareBanca(partnerId, user);
    await this.azzeraRichiestaBanca(partnerId);
    return { annullata: true };
  }

  /**
   * ⚠️ `bankCodeSentAt` NON si azzera più (falla trovata dall'ostile, 08/09/2026).
   *
   * Prima sì, e la pausa di 60 secondi fra due invii si annullava da sola: bastava un
   * `DELETE .../banca/richiedi` — o esaurire i cinque tentativi, che chiama proprio questo
   * metodo — per poterne chiedere subito un altro. Il tetto «cinque prove» diventava
   * «cinque prove per codice, e un codice nuovo ogni giro di rete»: un milione di
   * combinazioni si copre in ore, non in anni.
   *
   * L'ora dell'ultimo invio è un FATTO, non parte della richiesta: resta scritta anche
   * quando la richiesta cade.
   */
  private async azzeraRichiestaBanca(partnerId: string) {
    await this.prisma.partner.update({
      where: { id: partnerId },
      data: { bankCodeHash: null, bankCodeExpiresAt: null, bankCodeAttempts: 0, bankPending: null },
    });
  }

  /**
   * Avvisa il VECCHIO indirizzo che il recapito del profilo è cambiato.
   * È la difesa che rende inutile aspettare i sette giorni: chi non ha la casella del
   * partner non può impedire che l'avviso ci arrivi.
   */
  private async avvisaCambioRecapito(insegna: string, vecchia: string, nuova: string) {
    try {
      if (!vecchia || !vecchia.includes('@')) return;
      const esc = (x: string) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const html =
        `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1d1d1f;max-width:560px">` +
        `<p style="font-size:15px;margin:0 0 14px">Gentile ${esc(insegna)},</p>` +
        `<p style="font-size:15px;margin:0 0 14px">l'indirizzo email del suo profilo Deluxy è stato cambiato in <b>${esc(nuova)}</b>. ` +
        `Da adesso le nostre comunicazioni arriveranno lì.</p>` +
        `<p style="font-size:14px;margin:0 0 6px"><b>Non è stato lei?</b> Ci contatti subito: con l'indirizzo cambiato ` +
        `qualcuno potrebbe provare a modificare anche le sue coordinate bancarie.</p>` +
        `<p style="font-size:13px;color:#6e6e73;margin:18px 0 0">Deluxy</p></div>`;
      await this.settings.inviaHtmlViaAiMail(vecchia, 'Il recapito del suo profilo Deluxy è cambiato', html);
    } catch (err) {
      this.logger.error(`Avviso del cambio recapito non partito: ${(err as Error).message}`);
    }
  }

  /**
   * Avvisa il PARTNER che l'ufficio gli ha cambiato le coordinate. Non chiede permesso —
   * l'ufficio ha il diritto di correggere — ma il partner deve poterlo sapere subito: è
   * il suo conto, ed è lui il primo che si accorge se il numero è sbagliato.
   */
  private async avvisaPartnerCambioBanca(
    partnerId: string, insegna: string, email: string | null, vecchio: string | null, nuovo: string,
  ) {
    try {
      const a = (email ?? '').trim();
      if (!a || !a.includes('@') || a.includes('no-email')) return;
      const esc = (x: string) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const html =
        `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1d1d1f;max-width:560px">` +
        `<p style="font-size:15px;margin:0 0 14px">Gentile ${esc(insegna)},</p>` +
        `<p style="font-size:15px;margin:0 0 14px">le sue coordinate bancarie sono state aggiornate dal nostro ufficio: ` +
        `da ${esc(ibanMascherato(vecchio))} a <b>${esc(ibanLeggibile(nuovo))}</b>.</p>` +
        `<p style="font-size:14px;margin:0 0 6px"><b>Non era quello che aveva comunicato?</b> Ci risponda subito, ` +
        `prima del prossimo pagamento.</p>` +
        `<p style="font-size:13px;color:#6e6e73;margin:18px 0 0">Deluxy</p></div>`;
      await this.settings.inviaHtmlViaAiMail(a, 'Le sue coordinate bancarie sono state aggiornate', html);
    } catch (err) {
      this.logger.error(`Avviso al partner ${partnerId} del cambio coordinate non partito: ${(err as Error).message}`);
    }
  }

  private async avvisaUfficioBanca(
    quando: 'richiesta' | 'fatto',
    insegna: string, vecchio: string | null, nuovo: string, intestatario: string,
  ) {
    try {
      const a = ((await this.settings.get('mailUtente')) || process.env.MAIL_UTENTE || '').trim();
      if (!a) return;
      const { oggetto, html } = mailAvvisoUfficio(insegna, vecchio, nuovo, intestatario, new Date(), quando);
      await this.settings.inviaHtmlViaAiMail(a, oggetto, html);
    } catch (err) {
      this.logger.error(`Avviso all'ufficio sul cambio IBAN non partito: ${(err as Error).message}`);
    }
  }
}

/**
 * Dai nomi mostrati nella tabella delle differenze ai campi del Partner.
 *
 * «Attivo» non c'è di proposito: è un interruttore operativo della piattaforma
 * (un partner spento qui non riceve consegne) e non un dato anagrafico. Farlo
 * decidere al registro spegnerebbe partner che lavorano — sono 18 quelli che
 * oggi non concordano.
 */
const CAMPI_IMPORTABILI: Record<string, string> = {
  'Insegna / nome': 'insegna',
  'Ragione sociale': 'businessName',
  'P.IVA': 'vatNumber',
  'Codice fiscale': 'fiscalCode',
  'Indirizzo': 'address',
  'Telefono': 'phone',
  'Referente': 'contactName',
  // — Fiscali e bancari: sono il motivo per cui la maggior parte dei partner
  // ha qualcosa da prendere dal registro (164 valori su 97 partner abbinati).
  'Codice SDI': 'sdiCode',
  'PEC': 'certifiedEmail',
  // ⚠️ 08/09/2026 (secondo giro dell'ostile): IBAN, intestatario ed email NON si
  // importano più dal registro. Erano l'ultima via per scrivere le coordinate bancarie
  // senza codice, senza checksum e senza avvisi — e per cambiare il recapito senza
  // lasciare la traccia che protegge l'IBAN. Restano nel CONFRONTO (si vede la
  // differenza col registro), ma applicarla passa dalla rotta con la verifica.
  // 'IBAN': 'bankAccount',              ← tolto di proposito
  // 'Intestatario conto': 'bankAccountName',  ← tolto di proposito
  // 'Email': 'email',                   ← tolto di proposito (vedi sotto)
  'Metodo di pagamento': 'paymentMethod',
  'Stato finanziario': 'financialStatus',
  'Amministrazione — nome': 'adminName',
  'Amministrazione — email': 'adminEmail',
  'Amministrazione — telefono': 'adminPhone',
};
