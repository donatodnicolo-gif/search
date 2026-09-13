import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Injectable,
  Logger,
  Module,
  NotFoundException,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { CurrentUser, JwtUser, Public, Roles } from '../common/decorators';
import { DELIVERY_CLOSED_STATUSES, Role } from '../common/enums';
import { dataBreveRoma, dataLungaRoma, giornoRoma, oraRoma } from '../common/giorno-roma';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsModule, SettingsService } from '../settings/settings.module';

/**
 * ⭐ 07/09/2026 (regola utente): «Recap giornaliero al partner. Manda ogni
 * mattina alle 7:00. Se ci sono consegne per il giorno dopo anche un
 * reminder alle 18:30 (quindi se domani mattina ci sono consegne un reminder
 * alle 18:30 di oggi)». E poi: «non solo di oggi ma dei prossimi giorni».
 *
 * Due giri, entrambi da Vercel (vercel.json) con identità `CRON_SECRET`:
 *  - MATTINA, ore 7 di Roma: a ogni partner le SUE consegne di OGGI e dei
 *    prossimi giorni (una settimana: oggi + 6), raggruppate per giorno, oggi
 *    in testa;
 *  - SERA, ore 18:30 di Roma: a ogni partner che DOMANI ha consegne, le
 *    consegne di domani. Chi domani non ha niente non riceve niente.
 *
 * ⚠️ ORA DI ROMA, NON UTC. I cron di Vercel girano in UTC e non conoscono
 * l'ora legale: 7:00 di Roma sono le 5 UTC d'estate e le 6 d'inverno. Per
 * questo ogni giro è registrato a DUE ore UTC («0 5,6 * * *»; «30 16,17 * * *»)
 * e la rotta controlla l'ora di Roma: parte solo se è quella giusta, l'altra
 * chiamata esce senza fare niente. Il marcatore nel registro della consegna
 * (`[recap-partner:mattina:AAAA-MM-GG]`, UNA riga per partner e invio, sulla
 * prima consegna dell'elenco) garantisce comunque UN invio solo per partner e
 * per giorno, anche se Vercel richiamasse due volte.
 *
 * ⚠️ Cosa vede il partner: numero, fascia oraria, ritiro (chi e quando),
 * destinatario con indirizzo, citofono e telefono, prodotti con la NOTA DI
 * SPECIFICA («20-25 fiori») e le note della consegna. MAI `internalNotes`
 * (sono dell'ufficio e del valet) e niente prezzi: è un promemoria di lavoro,
 * non un documento contabile.
 *
 * La mail passa da AI Mail come il recap mensile (Standard §5.3: il canale
 * SMTP ha una casa sola). Best-effort per partner: un invio fallito si scrive
 * nell'esito e non ferma gli altri; al giro successivo (o a mano con
 * `?forza=1`) si riprova, perché senza marcatore il partner risulta da fare.
 */
export type TipoRecap = 'mattina' | 'sera';

/** Quanti giorni copre il recap del mattino: oggi + i sei seguenti. */
export const GIORNI_RECAP_MATTINA = 7;

const SELEZIONE = {
  id: true,
  code: true,
  date: true,
  status: true,
  deliveryTimeFrom: true,
  deliveryTimeTo: true,
  deliveryFlexible: true,
  pickupTimeFrom: true,
  pickupTimeTo: true,
  pickupFlexible: true,
  pickupAddress: true,
  recipientFirstName: true,
  recipientLastName: true,
  recipientAddress: true,
  recipientIntercom: true,
  recipientPhone: true,
  notes: true,
  deliveredByPartner: true,
  partner: { select: { id: true, insegna: true, email: true, active: true, deleted: true } },
  valet: { select: { firstName: true, lastName: true, phone: true } },
  // ⚠️ `pricingModel` e `hideCustomerInfo` NON sono decorazione: la mascheratura dei dati del
  // cliente li legge per decidere che cosa togliere. Toglierli dalla selezione spegne una protezione.
  serviceType: { select: { name: true, pricingModel: true, hideCustomerInfo: true } },
  products: {
    where: { deletedAt: null },
    select: {
      quantity: true,
      productName: true,
      variantName: true,
      product: { select: { name: true, note: true } },
      productVariant: { select: { name: true, note: true } },
    },
  },
} as const;

const GIORNO = /^\d{4}-\d{2}-\d{2}$/;

@Injectable()
export class RecapPartnerService {
  private readonly logger = new Logger(RecapPartnerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  /** Il giorno civile di Roma (+ scarto), come mezzanotte UTC: è così che sono salvate le date delle consegne. */
  static giornoRoma(scartoGiorni = 0): { chiave: string; data: Date } {
    return giornoRoma(scartoGiorni);
  }

  /** L'ora di Roma adesso (0-23). */
  static oraRoma(): number {
    return oraRoma();
  }

  /** Le consegne VIVE da un giorno per N giorni (non chiuse, non cancellate), con quanto serve al partner, in ordine di giorno e ora. */
  async consegneDalGiorno(giorno: Date, giorni = 1, partnerId?: string) {
    const fine = new Date(giorno.getTime() + giorni * 86400000);
    return this.prisma.delivery.findMany({
      where: {
        deletedAt: null,
        date: { gte: giorno, lt: fine },
        status: { notIn: DELIVERY_CLOSED_STATUSES },
        ...(partnerId ? { partnerId } : {}),
      },
      select: SELEZIONE,
      orderBy: [{ date: 'asc' }, { deliveryTimeFrom: 'asc' }, { code: 'asc' }],
    });
  }

  /** Quanti giorni copre un recap: la mattina una settimana, la sera solo domani. */
  static giorniDi(tipo: TipoRecap): number {
    return tipo === 'mattina' ? GIORNI_RECAP_MATTINA : 1;
  }

  /** Le email dei partner che NON vogliono il recap (impostazione `recapPartnerEsclusi`, separate da virgola). */
  private async esclusi(): Promise<Set<string>> {
    const grezzo = (await this.settings.get('recapPartnerEsclusi')) ?? '';
    return new Set(grezzo.split(/[,;\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean));
  }

  /**
   * Il giro vero, chiamato dal cron. `forza` salta il controllo dell'ora (per
   * un invio a mano fuori orario), NON il marcatore: chi ha già ricevuto oggi
   * non riceve una seconda volta.
   */
  async invia(tipo: TipoRecap, forza = false) {
    const oraAttesa = tipo === 'mattina' ? 7 : 18;
    const ora = RecapPartnerService.oraRoma();
    if (!forza && ora !== oraAttesa) {
      return {
        tipo,
        saltato: `sono le ${ora} di Roma: il ${tipo === 'mattina' ? 'recap del mattino parte alle 7' : 'promemoria della sera parte alle 18:30'}`,
        consegne: 0, partner: 0, inviate: [] as string[], saltati: [] as string[], errori: [] as string[],
      };
    }
    const oggi = RecapPartnerService.giornoRoma(0);
    const giorno = tipo === 'mattina' ? oggi : RecapPartnerService.giornoRoma(1);
    const consegne = await this.consegneDalGiorno(giorno.data, RecapPartnerService.giorniDi(tipo));
    const perPartner = new Map<string, typeof consegne>();
    for (const c of consegne) {
      const lista = perPartner.get(c.partner.id) ?? [];
      lista.push(c);
      perPartner.set(c.partner.id, lista);
    }
    const esclusi = await this.esclusi();
    // Il marcatore porta il giorno dell'INVIO (oggi), non quello delle consegne:
    // la stessa consegna di dopodomani sta nel recap di oggi e in quello di domani.
    const marcatore = RecapPartnerService.marcatore(tipo, oggi.chiave);
    const esito = {
      tipo, giorno: giorno.chiave, giorni: RecapPartnerService.giorniDi(tipo), consegne: consegne.length, partner: perPartner.size,
      inviate: [] as string[], saltati: [] as string[], errori: [] as string[],
    };

    for (const righe of perPartner.values()) {
      const p = righe[0].partner;
      if (!p.email || !p.active || p.deleted) {
        esito.saltati.push(`${p.insegna}: senza email o non attivo`);
        continue;
      }
      if (esclusi.has(p.email.toLowerCase())) {
        esito.saltati.push(`${p.insegna}: escluso dalle impostazioni`);
        continue;
      }
      // Idempotenza: basta la riga marcata su UNA sua consegna dell'elenco. La
      // ricerca usa l'indice su deliveryId (quello dell'incidente del 07/09),
      // non scorre il registro.
      const giaFatto = await this.prisma.deliveryLog.findFirst({
        where: { deliveryId: { in: righe.map((r) => r.id) }, type: 'note', message: { contains: marcatore } },
        select: { id: true },
      });
      if (giaFatto) {
        esito.saltati.push(`${p.insegna}: già inviato`);
        continue;
      }
      const r = await this.settings.inviaHtmlViaAiMail(
        p.email,
        RecapPartnerService.oggetto(tipo, giorno.data, p.insegna, righe),
        this.html(tipo, giorno.data, p.insegna, righe),
      );
      if (!r.ok) {
        esito.errori.push(`${p.insegna}: ${r.motivo}`);
        continue;
      }
      // UNA riga per partner e invio, sulla prima consegna dell'elenco: sette
      // righe «recap inviato» su una consegna di settimana prossima sarebbero rumore.
      const prima = righe[0];
      const ultima = righe[righe.length - 1];
      await this.prisma.deliveryLog.create({
        data: {
          deliveryId: prima.id,
          type: 'note',
          userId: null,
          message: `${tipo === 'mattina' ? 'Recap del mattino' : 'Promemoria della sera'} inviato al partner (${p.email}): ${righe.length === 1 ? '1 consegna' : `${righe.length} consegne`}${righe.length > 1 ? ` dal ${dataBreveRoma(prima.date)} al ${dataBreveRoma(ultima.date)}` : ''} ${marcatore}`,
        },
      });
      esito.inviate.push(`${p.insegna} (${righe.length})`);
    }
    this.logger.log(`Recap partner ${tipo} ${giorno.chiave}: ${esito.inviate.length} inviate, ${esito.saltati.length} saltate, ${esito.errori.length} errori su ${esito.partner} partner`);
    return esito;
  }

  /** L'HTML di un recap, per guardarlo prima di mandarlo (ufficio). */
  async anteprima(partnerId: string, giorno?: string, tipo?: string) {
    const t = RecapPartnerService.tipo(tipo);
    const g = RecapPartnerService.giorno(giorno, t);
    const partner = await this.prisma.partner.findUnique({ where: { id: partnerId }, select: { id: true, insegna: true, email: true } });
    if (!partner) throw new NotFoundException('Partner non trovato');
    const righe = await this.consegneDalGiorno(g.data, RecapPartnerService.giorniDi(t), partner.id);
    return {
      partner: partner.insegna, a: partner.email, giorno: g.chiave, giorni: RecapPartnerService.giorniDi(t), tipo: t, consegne: righe.length,
      oggetto: RecapPartnerService.oggetto(t, g.data, partner.insegna, righe),
      html: this.html(t, g.data, partner.insegna, righe),
    };
  }

  /**
   * Una PROVA vera nella casella di chi la chiede: la mail di un partner
   * (quello indicato, o il primo che ha consegne nella settimana), mandata a
   * `a` invece che al partner. Niente marcatore: non conta come invio.
   */
  async prova(user: JwtUser, a?: string, partnerId?: string, giorno?: string, tipo?: string) {
    const dest = (a ?? user.email ?? '').trim();
    if (!dest) throw new BadRequestException('Indica un indirizzo a cui mandare la prova.');
    const t = RecapPartnerService.tipo(tipo);
    const g = RecapPartnerService.giorno(giorno, t);
    const righe = await this.consegneDalGiorno(g.data, RecapPartnerService.giorniDi(t), partnerId);
    if (!righe.length) {
      throw new BadRequestException(`Nessuna consegna ${partnerId ? 'di questo partner ' : ''}${t === 'mattina' ? `nei ${RecapPartnerService.giorniDi(t)} giorni dal` : 'il'} ${g.chiave.split('-').reverse().join('/')}: niente da mandare.`);
    }
    const scelto = righe[0].partner;
    const sue = righe.filter((r) => r.partner.id === scelto.id);
    const r = await this.settings.inviaHtmlViaAiMail(
      dest,
      `[PROVA] ${RecapPartnerService.oggetto(t, g.data, scelto.insegna, sue)}`,
      this.html(t, g.data, scelto.insegna, sue),
    );
    if (!r.ok) throw new BadRequestException(`La prova non è partita: ${r.motivo}`);
    return { ok: true, a: dest, partner: scelto.insegna, giorno: g.chiave, giorni: RecapPartnerService.giorniDi(t), tipo: t, consegne: sue.length };
  }

  static marcatore(tipo: TipoRecap, chiaveGiorno: string): string {
    return `[recap-partner:${tipo}:${chiaveGiorno}]`;
  }

  private static tipo(v?: string): TipoRecap {
    if (v && v !== 'mattina' && v !== 'sera') throw new BadRequestException('tipo: mattina o sera');
    return (v as TipoRecap) || 'mattina';
  }

  private static giorno(v: string | undefined, tipo: TipoRecap): { chiave: string; data: Date } {
    if (!v) return RecapPartnerService.giornoRoma(tipo === 'mattina' ? 0 : 1);
    if (!GIORNO.test(v)) throw new BadRequestException('giorno: AAAA-MM-GG');
    const data = new Date(v + 'T00:00:00.000Z');
    if (Number.isNaN(data.getTime())) throw new BadRequestException('giorno non valido');
    return { chiave: v, data };
  }

  static dataLunga(giorno: Date): string {
    return dataLungaRoma(giorno);
  }

  private static quante(n: number): string {
    return n === 1 ? '1 consegna' : `${n} consegne`;
  }

  static oggetto(tipo: TipoRecap, giorno: Date, insegna: string, righe: { date: Date }[]): string {
    if (tipo === 'sera') {
      return `Promemoria: domani ${RecapPartnerService.quante(righe.length)} · ${RecapPartnerService.dataLunga(giorno)} · ${insegna}`;
    }
    const chiave = giorno.toISOString().slice(0, 10);
    const oggi = righe.filter((r) => r.date.toISOString().slice(0, 10) === chiave).length;
    const dopo = righe.length - oggi;
    const parti = [`oggi ${RecapPartnerService.quante(oggi)}`];
    if (dopo) parti.push(`prossimi giorni ${RecapPartnerService.quante(dopo)}`);
    return `Le tue consegne: ${parti.join(', ')} · ${RecapPartnerService.dataLunga(giorno)} · ${insegna}`;
  }

  /**
   * La mail: una scheda per consegna, raggruppate per giorno (oggi in testa),
   * leggibile sul telefono (il partner la apre in laboratorio). Niente CSS
   * esterno né immagini, come il recap mensile.
   */
  html(tipo: TipoRecap, giorno: Date, insegna: string, righe: Awaited<ReturnType<RecapPartnerService['consegneDalGiorno']>>): string {
    const e = (v: unknown) => String(v ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const fascia = (da: string | null, a: string | null, flessibile: boolean) =>
      flessibile ? 'orario flessibile' : da || a ? `${e(da ?? '…')}&ndash;${e(a ?? '…')}` : 'orario da definire';
    const chiaveOggi = giorno.toISOString().slice(0, 10);
    const chiaveDomani = new Date(giorno.getTime() + 86400000).toISOString().slice(0, 10);
    const dataLunga = RecapPartnerService.dataLunga(giorno);
    const n = righe.length;
    const quante = n === 1 ? 'una consegna' : `${n} consegne`;

    const scheda = (d: (typeof righe)[number]) => {
      const prodotti = d.products.map((p) => {
        const nome = p.productName || p.product?.name || 'Prodotto';
        const variante = p.variantName || p.productVariant?.name;
        const nota = p.productVariant?.note || p.product?.note;
        return `<li>${p.quantity > 1 ? `<b>${p.quantity} &times;</b> ` : ''}${e(nome)}${variante ? ` <span class="muted">(${e(variante)})</span>` : ''}${nota ? `<div class="spec">${e(nota)}</div>` : ''}</li>`;
      }).join('');
      const ritiro = d.deliveredByPartner
        ? '<tr><th>Consegna</th><td>A cura tua (consegna da partner)</td></tr>'
        : `<tr><th>Ritiro</th><td>${d.valet ? `${e(d.valet.firstName)} ${e(d.valet.lastName)}${d.valet.phone ? ` &middot; ${e(d.valet.phone)}` : ''}` : 'un valet Deluxy (ancora da assegnare)'}
            &middot; ${fascia(d.pickupTimeFrom, d.pickupTimeTo, d.pickupFlexible)}${d.pickupAddress ? `<div class="muted">${e(d.pickupAddress)}</div>` : ''}</td></tr>`;
      /**
       * ⭐⭐ 13/09/2026 (regola utente: «nei recap mandati via mail ai partner nascondi i dati dei
       * clienti come da regola privacy»).
       *
       * La regola esiste nell'app dal 31/08 — sui servizi di VENDITA il cliente finale è di Deluxy,
       * non del partner, e i suoi dati non gli si mostrano; lo stesso vale col flag
       * `hideCustomerInfo` del servizio. La deroga è una sola: **se è il partner a consegnare**, i
       * dati gli servono per consegnare davvero.
       *
       * ⚠️ La mail la scavalcava: la pagina nascondeva e il riepilogo delle 7 del mattino mandava
       * nome, indirizzo, citofono e telefono per posta — dove restano, si inoltrano e non si revocano.
       * Una protezione che vale in un posto solo non è una protezione.
       *
       * ⚠️ Si toglie il nome ma si tiene la ZONA (città e CAP): il partner deve poter capire quanta
       * strada farà la merce e organizzarsi, senza sapere chi la riceve.
       */
      const svc = (d.serviceType ?? {}) as { pricingModel?: string | null; hideCustomerInfo?: boolean | null };
      const daNascondere = !d.deliveredByPartner && (svc.pricingModel === 'VENDITA' || svc.hideCustomerInfo === true);
      const zona = (() => {
        const pezzi = String(d.recipientAddress ?? '').split(',').map((x) => x.trim()).filter(Boolean);
        const conCap = pezzi.find((x) => /\d{5}/.test(x));
        return conCap ?? pezzi[pezzi.length - 1] ?? '';
      })();
      const destinatario = daNascondere
        ? `<span class="muted">dati del cliente riservati</span>${zona ? `<div class="muted">zona ${e(zona)}</div>` : ''}`
        : [
            e(`${d.recipientFirstName} ${d.recipientLastName}`.trim()),
            `<div>${e(d.recipientAddress)}${d.recipientIntercom ? ` &middot; citofono ${e(d.recipientIntercom)}` : ''}</div>`,
            d.recipientPhone ? `<div class="muted">${e(d.recipientPhone)}</div>` : '',
          ].join('');
      return `
      <div class="scheda">
        <div class="testa"><span class="num">#${d.code}</span><span class="ora">${fascia(d.deliveryTimeFrom, d.deliveryTimeTo, d.deliveryFlexible)}</span><span class="srv">${e(d.serviceType?.name ?? '')}</span></div>
        <table>
          ${ritiro}
          <tr><th>Destinatario</th><td>${destinatario}</td></tr>
          <tr><th>Prodotti</th><td>${prodotti ? `<ul>${prodotti}</ul>` : '<span class="muted">nessun prodotto indicato</span>'}</td></tr>
          ${d.notes ? `<tr><th>Note</th><td>${e(d.notes).replace(/\n/g, '<br>')}</td></tr>` : ''}
        </table>
        <a class="link" href="https://app.deluxy.it/deliveries/${e(d.id)}">Apri la consegna in piattaforma &rarr;</a>
      </div>`;
    };

    // Un blocco per giorno: «Oggi», «Domani», poi il giorno per esteso.
    const perGiorno = new Map<string, typeof righe>();
    for (const d of righe) {
      const k = d.date.toISOString().slice(0, 10);
      perGiorno.set(k, [...(perGiorno.get(k) ?? []), d]);
    }
    const blocchi = [...perGiorno.entries()].map(([k, lista]) => {
      const etichetta = tipo === 'sera' ? `Domani, ${RecapPartnerService.dataLunga(lista[0].date)}`
        : k === chiaveOggi ? `Oggi, ${RecapPartnerService.dataLunga(lista[0].date)}`
        : k === chiaveDomani ? `Domani, ${RecapPartnerService.dataLunga(lista[0].date)}`
        : RecapPartnerService.dataLunga(lista[0].date);
      return `<h2 class="${k === chiaveOggi && tipo === 'mattina' ? 'oggi' : ''}">${e(etichetta)} <span class="conta">${RecapPartnerService.quante(lista.length)}</span></h2>${lista.map(scheda).join('')}`;
    }).join('');

    const oggiN = righe.filter((r) => r.date.toISOString().slice(0, 10) === chiaveOggi).length;
    const titolo = tipo === 'sera'
      ? `Domani hai ${quante}`
      : oggiN === n ? `Oggi hai ${quante}`
      : oggiN === 0 ? `Oggi niente, ${quante} nei prossimi giorni`
      : `Oggi hai ${RecapPartnerService.quante(oggiN)}, e ${RecapPartnerService.quante(n - oggiN)} nei prossimi giorni`;
    const cappello = tipo === 'sera'
      ? `Ciao ${e(insegna)}, promemoria per domani, ${dataLunga}: ecco le consegne da preparare.`
      : `Buongiorno ${e(insegna)}, ecco le consegne in programma da oggi, ${dataLunga}, ai prossimi ${GIORNI_RECAP_MATTINA - 1} giorni.`;

    return `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(titolo)} — ${e(insegna)}</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; padding: 20px 12px; background: #F5F5F7; color: #1d1d1f;
    font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  .foglio { max-width: 640px; margin: 0 auto; }
  h1 { margin: 0 0 4px; font-size: 24px; font-weight: 600; letter-spacing: -.025em; }
  .cappello { margin: 0 0 18px; color: #6e6e73; }
  h2 { margin: 22px 0 8px; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; color: #6e6e73; }
  h2.oggi { color: #1d1d1f; }
  h2 .conta { font-weight: 400; text-transform: none; letter-spacing: 0; }
  .scheda { background: #fff; border-radius: 14px; padding: 16px 18px; margin: 0 0 12px; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
  .testa { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; margin-bottom: 8px; }
  .num { font-weight: 600; font-variant-numeric: tabular-nums; }
  .ora { font-weight: 600; font-variant-numeric: tabular-nums; }
  .srv { color: #6e6e73; font-size: 13px; margin-left: auto; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; vertical-align: top; width: 92px; padding: 6px 8px 6px 0; font-size: 11.5px; font-weight: 600;
    text-transform: uppercase; letter-spacing: .04em; color: #6e6e73; }
  td { padding: 6px 0; border-top: 1px solid #f2f2f4; vertical-align: top; }
  tr:first-child td, tr:first-child th { border-top: 0; }
  ul { margin: 0; padding-left: 18px; }
  li { margin: 0 0 4px; }
  .spec { font-size: 13px; color: #B8963E; }
  .muted { color: #6e6e73; }
  .link { display: inline-block; margin-top: 10px; font-size: 13px; color: #1d1d1f; }
  .coda { margin-top: 18px; font-size: 12px; color: #6e6e73; }
</style></head>
<body><div class="foglio">
  <h1>${e(titolo)}</h1>
  <p class="cappello">${cappello}</p>
  ${blocchi}
  <p class="coda">Riepilogo automatico della piattaforma consegne Deluxy: ogni mattina alle 7 le consegne di oggi e dei prossimi giorni e, quando domani ci sono consegne, un promemoria alle 18:30. Le consegne inserite dopo l'invio le trovi in piattaforma.</p>
</div></body></html>`;
  }
}

class ProvaRecapDto {
  @IsOptional() @IsEmail() a?: string;
  @IsOptional() @IsString() partnerId?: string;
  @IsOptional() @Matches(GIORNO) giorno?: string;
  @IsOptional() @IsIn(['mattina', 'sera']) tipo?: string;
}

/** Le due rotte del cron (vercel.json). Identità = `CRON_SECRET`, verificata prima di tutto, come le altre. */
@ApiTags('cron')
@Controller('cron')
export class RecapPartnerCronController {
  constructor(private readonly service: RecapPartnerService) {}

  private verifica(authorization?: string) {
    const segreto = process.env.CRON_SECRET ?? '';
    if (!segreto || authorization !== `Bearer ${segreto}`) throw new UnauthorizedException();
  }

  @Get('recap-partner-mattina')
  @Public()
  @ApiOperation({ summary: 'Ore 7 di Roma: a ogni partner le sue consegne di oggi e dei prossimi giorni (?forza=1 salta il controllo dell’ora, non il marcatore)' })
  mattina(@Headers('authorization') authorization?: string, @Query('forza') forza?: string) {
    this.verifica(authorization);
    return this.service.invia('mattina', forza === '1');
  }

  @Get('recap-partner-sera')
  @Public()
  @ApiOperation({ summary: 'Ore 18:30 di Roma: a ogni partner che domani ha consegne, il promemoria di domani' })
  sera(@Headers('authorization') authorization?: string, @Query('forza') forza?: string) {
    this.verifica(authorization);
    return this.service.invia('sera', forza === '1');
  }
}

/** Per l'ufficio: guardare la mail prima, e mandarsene una prova. */
@ApiTags('recap-partner')
@Controller('recap-partner')
export class RecapPartnerController {
  constructor(private readonly service: RecapPartnerService) {}

  @Get('anteprima')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'L’HTML del recap di un partner (giorno = AAAA-MM-GG di partenza, tipo = mattina | sera)' })
  anteprima(@Query('partnerId') partnerId: string, @Query('giorno') giorno?: string, @Query('tipo') tipo?: string) {
    if (!partnerId) throw new BadRequestException('partnerId obbligatorio');
    return this.service.anteprima(partnerId, giorno, tipo);
  }

  @Post('prova')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Manda a un indirizzo (di norma il proprio) la mail di un partner, come prova. Non conta come invio.' })
  prova(@CurrentUser() user: JwtUser, @Body() body: ProvaRecapDto) {
    return this.service.prova(user, body.a, body.partnerId, body.giorno, body.tipo);
  }
}

@Module({
  imports: [SettingsModule],
  controllers: [RecapPartnerCronController, RecapPartnerController],
  providers: [RecapPartnerService],
  exports: [RecapPartnerService],
})
export class RecapPartnerModule {}
