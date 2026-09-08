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
  Patch,
  Post,
  Logger,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtUser, Roles } from '../common/decorators';
import { DeliveryStatus, NotificationType, ProductType, Role, SaleStatus } from '../common/enums';
import { prezzoAlPartner } from '../common/prezzo-partner';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsModule, NotificationsService } from '../notifications/notifications.module';
import { SettingsModule, SettingsService } from '../settings/settings.module';

/** Un partner candidato allo smistamento, col motivo per cui e' in lista. */
/** `prezzo`/`sconto` arrivano SOLO da una riconciliazione accettata: la vendita nasce a quel prezzo. */
/**
 * ⭐ 05/09/2026: QUANDO va consegnato — il giorno, e la fascia chiesta dal
 * cliente se c'è. È questo che si confronta con gli orari del partner.
 */
interface FinestraConsegna {
  /** Importo pagato dal cliente. */
  importo?: number | null;
  /** Sconto (quota Deluxy) stimato per (provincia, categoria): serve a stimare il prezzo partner. */
  scontoPct?: number | null;
  /** Sui prodotti UNICI il prezzo partner è quello di listino della variante/prodotto. */
  prezzoPartnerListino?: number | null;
  /** Indirizzo del destinatario: serve al raggio massimo dei partner che consegnano da soli. */
  indirizzo?: string | null;
  /** ⭐ 06/09 (regola utente): la variante ordinata — la riconciliazione vale solo se è la stessa. */
  variantId?: string | null;
  /** ⭐ 07/09 (regola utente): quanti PEZZI. Su un prodotto «a quantità» il prezzo al partner
   *  è il suo prezzo UNITARIO per i pezzi, non il pubblico meno la percentuale. */
  pezzi?: number | null;
  /** Il titolo della riga d'ordine: dice QUALE fiore, quando il prodotto è un generico. */
  titolo?: string | null;
  giorno: Date;
  /** «08:00», dalla fascia dell'ordine. Assente = non si sa l'ora. */
  dalle?: string;
  /** «12:00». Assente = non si sa l'ora. */
  alle?: string;
}

type Candidato = {
  partnerId: string;
  motivo: string;
  /**
   * ⭐ 04/09/2026 (regola utente): quanto deve incassare il PARTNER, quando
   * arriva da una riconciliazione accettata. L'importo al cliente non si
   * tocca: si ricalcola la quota Deluxy perché il partner prenda questa cifra.
   */
  prezzoPartner?: number;
};

/** Quel che serve allo smistamento per decidere: niente di piu'. */
type ProdottoDaSmistare = {
  id: string;
  type: string;
  partnerId: string | null;
  categoryId: string | null;
  visibleToOtherPartners: boolean;
  /** unico | quantita | mix | preventivo — decisa in Merchandising. */
  tipologiaVendita?: string | null;
  sku?: string | null;
};

/** Lo stato di un ordine come lo dice Orders (letto dal vivo, 04/09). */
type StatoOrdineOrders = {
  /**
   * ⭐ 04/09/2026 (regola utente): la SALUTE dell'ordine in Orders —
   * conforme | a_rischio | non_pagato | cancellato | nullo. Se non è
   * «conforme» la vendita NON si manda avanti: niente accettazione, niente
   * consegna, niente proposta a un partner. Resta in Vendite, e l'unica cosa
   * che si può fare è rifiutarla.
   */
  salute: string | null;
  stato: string | null; terminale: boolean | null;
  smistamento: string | null; evasione: string | null;
  fulfillmentStatus: string | null; consegnataIl: string | null; annullato: unknown;
};

/**
 * ⭐ 07/09/2026 — IL PREZZO DELLA RIGA DI UNA VENDITA.
 *
 * Era scritto dentro il `create` della consegna; da quando una riga può finire anche su
 * una consegna già esistente (due prodotti dello stesso ordine per lo stesso partner)
 * serve in due posti, e un calcolo del prezzo copiato in due punti è un modo sicuro di
 * farli divergere.
 *
 * Il prezzo di riga è quello del PARTNER (canone 29/08: la fee si calcola sul SUO
 * prezzo). Il pubblico è il ripiego; sui generici, che a listino valgono 0, si ricava
 * da quanto prende il partner diviso i pezzi.
 */
function prezzoRigaVendita(
  vendita: { quantity?: number; amount?: number | null; discountPercent?: number | null; product?: { publicPrice: number | null } | null },
  variante?: { price: number | null; publicPrice: number | null } | null,
): number | null {
  const pezzi = Math.max(1, Number(vendita.quantity) || 1);
  const listino = variante?.price ?? variante?.publicPrice ?? vendita.product?.publicPrice ?? null;
  if (listino) return listino;
  const alPartner = (vendita.amount ?? 0) * (1 - (vendita.discountPercent ?? 0) / 100);
  return alPartner > 0 ? Math.round((alPartner / pezzi) * 100) / 100 : null;
}

@Injectable()
export class SalesService {
  private readonly logger = new Logger(SalesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * ⭐ 06/09/2026 (segnalazione utente: «perché non vengono mandate notifiche?»):
   * finora una vendita PROPOSTA al partner non avvisava nessuno — il partner la
   * scopriva solo entrando in Vendite. Ora gli utenti attivi di quel partner
   * ricevono campanella e push (stesso canale delle ore da approvare). Se la
   * notifica fallisce la vendita resta proposta: avvisare non è un prerequisito.
   */
  /** Distanza in linea d'aria (km) fra due punti: basta per il raggio del partner, non serve la strada. */
  static kmInLineaDAria(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const r = (x: number) => (x * Math.PI) / 180;
    const dLat = r(lat2 - lat1), dLng = r(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(dLng / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /** Le categorie di FIORI: le uniche in cui un prodotto non unico si smista da solo (regola utente 06/09/2026). */
  static categoriaFiori(nome: string | null | undefined): boolean {
    const n = String(nome ?? '').toLowerCase();
    return /fior|flor|rosa|rose|piant|ghirland|cappellier|terrarium|bouquet/.test(n);
  }

  private async avvisaProposta(v: {
    id: string; partnerId?: string | null; externalOrderNumber?: string | null;
    amount?: number | null; discountPercent?: number | null; quantity?: number | null;
    product?: { name?: string | null } | null;
  }): Promise<void> {
    if (!v.partnerId) return;
    try {
      const utenti = await this.prisma.user.findMany({ where: { partnerId: v.partnerId, status: 'active' }, select: { id: true } });
      if (!utenti.length) return;
      // ⭐ 07/09/2026 (segnalazione utente: «è sbagliato, è senza sconto applicato»).
      //
      // L'avviso diceva `amount`, cioè quello che paga il CLIENTE: al fioraio di Torino
      // è arrivato «135,00 €» per una vendita che gliene rende 94,50. Chi legge decide
      // se accettare guardando quel numero — ed è il numero sbagliato.
      //
      // Il partner deve leggere QUANTO PRENDE LUI: il pubblico meno lo sconto del
      // territorio. Lo si dice per intero, così non resta il dubbio di che numero sia.
      const pezzi = Math.max(1, Number(v.quantity) || 1);
      // Il numero che il partner legge deve essere quello della REGOLA: prezzo al partner
      // arrotondato al multiplo di 5 (common/prezzo-partner.ts, 01/09). Ricalcolarlo a mano
      // ai centesimi dava 94,50 € dove la regola dice 95 — e su quel numero uno decide.
      const alPartner = v.amount != null ? prezzoAlPartner(v.amount, Number(v.discountPercent) || 0) : null;
      // ⭐ 08/09/2026: il prodotto SUO che corrisponde al patto — anche nel campanello,
      // così chi guarda dall'app sa cosa preparare senza aprire la mail.
      const rif = await this.riferimentoDelPatto(
        (v as { productId?: string | null }).productId ?? null,
        (v as { productVariantId?: string | null }).productVariantId ?? null,
        (v as { provinceId?: string | null }).provinceId ?? null,
        v.partnerId,
      );
      const importo = alPartner != null ? ` · ${alPartner.toFixed(2)} € a te` : '';
      const quanti = pezzi > 1 ? ` (×${pezzi})` : '';
      await this.notifications.notifyUsers(utenti.map((u) => u.id), {
        type: NotificationType.SALE_PROPOSED,
        title: 'Nuova vendita proposta',
        body: `${v.externalOrderNumber ? 'Ordine #' + v.externalOrderNumber + ': ' : ''}${v.product?.name ?? 'prodotto'}${quanti}${importo}${rif ? ` · per te: ${rif.nome}` : ''} — accetta o rifiuta in Vendite`,
        entityType: 'sale',
        entityId: v.id,
      });
      // ⭐ 07/09/2026 (regola utente: «ci sono le mail di questi partner») — ANCHE PER MAIL.
      //
      // Il campanello dentro l'app non basta: FAG Torino Fiori e Omnistore Flowers hanno una
      // proposta in attesa e non hanno MAI fatto accesso, zero iscrizioni push. Lo smistamento
      // propone in un minuto e poi il messaggio non arriva a destinazione. Gli indirizzi ci sono
      // (129 partner attivi su 129, 106 con le notifiche accese) e il canale pure: è lo stesso
      // AI Mail delle consegne. Mancava solo il collegamento fra i due flussi.
      //
      // In coda e best-effort: una mail che non parte non deve fermare lo smistamento.
      void this.mailProposta(v.id, v.partnerId, alPartner, pezzi);
    } catch {
      // la vendita è già scritta: un avviso mancato non la annulla
    }
  }

  /**
   * ⭐ 08/09/2026 (regola utente: «aggiungi il prodotto di riferimento»).
   *
   * QUANDO IL PATTO NASCE DA UN ALTRO PRODOTTO, IL PARTNER DEVE SAPERLO.
   *
   * Una riconciliazione creata a mano dice «questa Torta Chantilly di Cakedesignme la fa
   * Martesana a 48 €», e nel patto resta scritto DA QUALE prodotto di Martesana nasce il
   * prezzo: la sua «Chantilly Classica». Ma nella proposta quel dato non arrivava, e il
   * partner riceveva la scheda di un dolce di un concorrente — foto e descrizione comprese
   * — dovendo indovinare che gli stiamo chiedendo il suo.
   *
   * Il riferimento sta in `ProductReconciliation.stats` (lo scrive `creaManuale`): qui si
   * rilegge e si porta al partner. Se non c'è — patto nato dal giro notturno, o vecchio —
   * non si inventa niente: la proposta resta come prima.
   */
  private async riferimentoDelPatto(
    productId: string | null | undefined,
    productVariantId: string | null | undefined,
    provinceId: string | null | undefined,
    partnerId: string | null | undefined,
  ): Promise<{ nome: string; sku: string | null } | null> {
    if (!productId || !provinceId || !partnerId) return null;
    try {
      const ric = await this.prisma.productReconciliation.findFirst({
        where: { productId, provinceId, productVariantId: productVariantId ?? null, partnerId, status: 'accettata' },
        select: { stats: true },
      });
      if (!ric?.stats) return null;
      const righe = JSON.parse(ric.stats) as { riferimento?: string; variante?: string }[];
      const voce = Array.isArray(righe) ? righe.find((x) => x && x.riferimento) : null;
      if (!voce?.riferimento) return null;
      const prodotto = await this.prisma.product.findUnique({
        where: { id: voce.riferimento },
        select: { name: true, sku: true },
      });
      if (!prodotto) return null;
      // La variante del riferimento, se il patto la nomina: «Chantilly Classica · 6».
      const variante = voce.variante
        ? await this.prisma.productVariant.findUnique({ where: { id: voce.variante }, select: { name: true, sku: true } })
        : null;
      return {
        nome: variante?.name ? `${prodotto.name} · ${variante.name}` : prodotto.name,
        sku: variante?.sku ?? prodotto.sku ?? null,
      };
    } catch {
      return null;
    }
  }

  /**
   * La mail al partner per una vendita proposta (07/09/2026, regola utente).
   *
   * Stesse guardie delle consegne: parte solo a chi ha un indirizzo vero e ha ACCESO le
   * notifiche — i nostri di ripiego (Cakedesignme, Deluxy Flowers) le hanno spente apposta.
   * Dice il prezzo DEL PARTNER, la data, il destinatario e come rispondere: chi la legge
   * deve poter decidere senza aprire nient'altro.
   */
  private async mailProposta(saleId: string, partnerId: string, alPartner: number | null, pezzi: number): Promise<void> {
    try {
      const [partner, vendita] = await Promise.all([
        this.prisma.partner.findUnique({ where: { id: partnerId }, select: { insegna: true, email: true, mailNotifications: true } }),
        this.prisma.sale.findUnique({
          where: { id: saleId },
          select: {
            externalOrderNumber: true, productName: true, variantName: true, deliveryDate: true,
            recipientFirstName: true, recipientLastName: true, recipientAddress: true,
            productId: true, productVariantId: true, provinceId: true,
            product: { select: { name: true, note: true } },
            province: { select: { name: true, code: true } },
          },
        }),
      ]);
      const riferimento = vendita
        ? await this.riferimentoDelPatto(vendita.productId, vendita.productVariantId, vendita.provinceId, partnerId)
        : null;
      const a = (partner?.email ?? '').trim();
      if (!a || !a.includes('@') || a.includes('no-email') || !partner?.mailNotifications || !vendita) return;

      const prodotto = vendita.product?.name ?? vendita.productName ?? 'prodotto';
      const giorno = vendita.deliveryDate
        ? new Date(vendita.deliveryDate).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Rome' })
        : null;
      const destinatario = [vendita.recipientFirstName, vendita.recipientLastName].filter(Boolean).join(' ').trim();
      const esc = (x: string) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const riga = (etichetta: string, valore: string) =>
        `<tr><td style="padding:4px 14px 4px 0;color:#6e6e73;font-size:13px;white-space:nowrap">${esc(etichetta)}</td><td style="padding:4px 0;font-size:14px">${valore}</td></tr>`;

      const html = [
        `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1d1d1f;max-width:560px">`,
        `<p style="font-size:15px;margin:0 0 14px">Gentile ${esc(partner.insegna ?? '')},</p>`,
        `<p style="font-size:15px;margin:0 0 18px">le proponiamo una nuova vendita${vendita.externalOrderNumber ? ` per l'ordine <b>#${esc(vendita.externalOrderNumber)}</b>` : ''}.</p>`,
        `<table style="border-collapse:collapse;margin:0 0 18px">`,
        riga('Prodotto', `<b>${esc(prodotto)}</b>${vendita.variantName ? ` · ${esc(vendita.variantName)}` : ''}${pezzi > 1 ? ` — <b>${pezzi} pezzi</b>` : ''}`),
        alPartner != null ? riga('Importo a lei', `<b style="font-size:16px">${alPartner.toFixed(2)} €</b>`) : '',
        giorno ? riga('Consegna', esc(giorno)) : '',
        destinatario ? riga('Destinatario', esc(destinatario)) : '',
        vendita.recipientAddress ? riga('Indirizzo', esc(vendita.recipientAddress)) : '',
        vendita.province?.name ? riga('Provincia', `${esc(vendita.province.name)} (${esc(vendita.province.code ?? '')})`) : '',
        // ⭐ 08/09: il prodotto SUO che corrisponde — è quello che deve preparare.
        riferimento ? riga('Per lei corrisponde a', `<b>${esc(riferimento.nome)}</b>${riferimento.sku ? ` <span style="color:#6e6e73">(${esc(riferimento.sku)})</span>` : ''}`) : '',
        vendita.product?.note ? riga('Note', esc(vendita.product.note)) : '',
        `</table>`,
        `<p style="font-size:15px;margin:0 0 18px">Le chiediamo di <b>accettare o rifiutare</b> dal suo pannello: senza risposta la proposta passa al fornitore successivo.</p>`,
        `<p style="margin:0 0 22px"><a href="https://app.deluxy.it/sales" style="display:inline-block;background:#1d1d1f;color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:22px;font-size:14px">Apri le vendite</a></p>`,
        `<p style="font-size:13px;color:#6e6e73;margin:0">Deluxy</p>`,
        `</div>`,
      ].filter(Boolean).join('');

      const oggetto = `Nuova proposta di vendita${vendita.externalOrderNumber ? ` · ordine #${vendita.externalOrderNumber}` : ''}${alPartner != null ? ` · ${alPartner.toFixed(2)} €` : ''}`;
      const esito = await this.settings.inviaHtmlViaAiMail(a, oggetto, html);
      if (!esito.ok) this.logger.warn(`Mail della proposta ${saleId} non partita: ${esito.motivo}`);
    } catch (err) {
      this.logger.warn(`Mail della proposta ${saleId}: ${(err as Error).message}`);
    }
  }

  /**
   * ⭐ 04/09/2026 (regola utente): IL REGISTRO DELLA VENDITA — ogni creazione,
   * cambio di stato, modifica o assegnazione lascia una riga con CHI l'ha
   * fatto (utente e ruolo). Best-effort: una riga che non si scrive non ferma
   * la vendita, ma finisce nel log del server.
   */
  async registra(
    saleId: string, type: string, message: string,
    user?: Pick<JwtUser, 'sub' | 'email' | 'role'> | null,
  ): Promise<void> {
    try {
      await this.prisma.saleLog.create({ data: {
        saleId, type, message,
        userId: user?.sub ?? null, userEmail: user?.email ?? null, userRole: (user?.role as string) ?? null,
      } });
    } catch (e) { console.error('registro-vendita:', (e as Error).message); }
  }

  async findAll(user: JwtUser) {
    const where =
      user.role === Role.PARTNER ? { partnerId: user.partnerId ?? '-' } : {};
    const vendite = await this.prisma.sale.findMany({
      where,
      include: {
        product: { select: { id: true, name: true, sku: true, price: true, type: true, tipologiaVendita: true, note: true } },
        partner: { select: { id: true, insegna: true } },
        province: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    // ⭐ 04/09 (regola utente): in tabella si vede anche lo STATO DELL'ORDINE
    // IN ORDERS (classificazione, evasione, smistamento, consegnato). Letto
    // dal vivo da Orders — nessuna copia (Standard §7) — con una cache di 2′
    // in memoria: la lista si aggiorna da sola ogni 30″ e Orders non va
    // interrogato a ogni giro. Best-effort: senza Orders la colonna resta vuota.
    const stati = await this.statiDaOrders(vendite);
    // ⭐ 07/09/2026 (regola utente: «prima dovrebbe richiedere il preventivo e nascondere
    // accetta, rifiuta e inserisci»). Per le vendite di un prodotto A PREVENTIVO si dice se il
    // prezzo concordato esiste già: senza, in pagina resta solo «Salva preventivo».
    // Si calcola con due letture per tutta la lista, non una per riga.
    const daPreventivo = vendite.filter((v) => v.product?.tipologiaVendita === 'preventivo' && v.productId && v.provinceId);
    const conPrezzo = new Set<string>();
    if (daPreventivo.length) {
      const [patti, varianti, listini] = await Promise.all([
        this.prisma.productReconciliation.findMany({
          where: {
            status: 'accettata',
            productId: { in: [...new Set(daPreventivo.map((v) => v.productId!))] },
            provinceId: { in: [...new Set(daPreventivo.map((v) => v.provinceId))] },
          },
          select: { productId: true, productVariantId: true, provinceId: true },
        }),
        this.prisma.productVariant.findMany({
          where: { id: { in: daPreventivo.map((v) => v.productVariantId).filter(Boolean) as string[] } },
          select: { id: true, sku: true },
        }),
        // I preventivi raccolti vivono come listino del partner: sku «PP-<codice>-<partner>».
        this.prisma.product.findMany({
          where: { active: true, deletedAt: null, archived: false, sku: { startsWith: 'PP-' }, partnerId: { not: null } },
          select: { sku: true, partnerId: true },
        }),
      ]);
      const patto = new Set(patti.map((r) => `${r.productId}|${r.productVariantId ?? ''}|${r.provinceId}`));
      const skuVariante = new Map(varianti.map((x) => [x.id, (x.sku ?? '').toUpperCase()]));
      const perPartner = new Map<string, string[]>();
      for (const l of listini) {
        const a2 = perPartner.get(l.partnerId!) ?? [];
        a2.push((l.sku ?? '').toUpperCase());
        perPartner.set(l.partnerId!, a2);
      }
      const chiaveSku = (x: string) => x.toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 28);
      for (const v of daPreventivo) {
        if (patto.has(`${v.productId}|${v.productVariantId ?? ''}|${v.provinceId}`) || patto.has(`${v.productId}||${v.provinceId}`)) {
          conPrezzo.add(v.id);
          continue;
        }
        if (!v.partnerId) continue;
        const basi = [v.productVariantId ? skuVariante.get(v.productVariantId) : null, v.product?.sku]
          .filter(Boolean)
          .map((x) => chiaveSku(String(x)));
        const suoi = perPartner.get(v.partnerId) ?? [];
        if (basi.some((b2) => suoi.some((sk) => sk.startsWith(`PP-${b2}-`)))) conPrezzo.add(v.id);
      }
    }
    const senzaPreventivo = new Set(daPreventivo.filter((v) => !conPrezzo.has(v.id)).map((v) => v.id));
    return vendite.map((v) => {
      const trovato = SalesService.chiaviOrdine(v.externalOrderId).map((k) => stati.get(k)).find(Boolean) ?? null;
      const conStato = { ...v, ordine: trovato, preventivoMancante: senzaPreventivo.has(v.id) };
      return user.role === Role.PARTNER ? SalesService.perPartner(conStato) : conStato;
    });
  }

  /**
   * ⭐ 04/09 (regola utente): al PARTNER niente dati personali (destinatario,
   * cliente) e niente prezzi pubblici. Vede SOLO il suo prezzo:
   * importo × (1 − sconto%) — lo sconto e' la quota Deluxy sulla categoria in
   * quella provincia, fotografata sulla vendita. Il registro gli arriva senza
   * le righe «modifica», che elencano campi con nomi e importi.
   * Si applica in findAll e findOne: un solo punto, cosi' la lista e il
   * dettaglio non possono raccontare due cose diverse.
   */
  private static perPartner<T extends { amount: number; discountPercent: number }>(v: T) {
    const {
      recipientFirstName: _n, recipientLastName: _c, recipientAddress: _i, recipientPhone: _t, customerId: _k,
      amount, discountPercent, ...resto
    } = v as T & Record<string, unknown>;
    const prodotto = (resto as { product?: Record<string, unknown> | null }).product;
    const logs = (resto as { logs?: Array<{ type: string }> }).logs;
    return {
      ...resto,
      amount: null,
      discountPercent: null,
      prezzoPartner: Math.round(amount * (1 - (discountPercent ?? 0) / 100) * 100) / 100,
      // ⚠️ Al partner niente listino E niente PRODUTTORE: il produttore è un
      // altro partner, e sapere chi fa il prodotto è la stessa informazione
      // che «Chi abbiamo usato?» tiene riservata all'ufficio.
      product: prodotto ? { ...prodotto, price: null, partner: null } : prodotto,
      ...(logs ? { logs: logs.filter((l) => l.type !== 'modifica') } : {}),
    };
  }

  /**
   * ⭐ 04/09 (regola utente): il LINK all'ordine su Shopify, per il dettaglio.
   * La base è configurabile in Impostazioni (`shopifyAdminUrl`) perché i
   * negozi sono più d'uno; di default il negozio storico. Lo costruisce il
   * SERVER e non finisce mai nella risposta del partner: da lì si vedrebbero
   * i dati del cliente che la maschera-partner toglie.
   */
  /** La salute dell'ordine, o null se Orders non risponde / non c'è ordine. */
  private async saluteOrdine(externalOrderId: string | null | undefined): Promise<string | null> {
    const ordine = await this.ordineDaOrders(externalOrderId);
    return typeof ordine?.salute === 'string' ? ordine.salute : (ordine?.salute?.chiave ?? null);
  }

  private async linkShopify(externalOrderId: string | null, brand?: string | null): Promise<string | null> {
    // ⚠️ Sull'ordine D2C `externalOrderId` è l'id di **Deluxy Orders** (un
    // cuid), NON quello di Shopify: verificato su tutte le 489 vendite con
    // riferimento, nessuna ha un `gid://`. Il numero vero ce l'ha Orders, nel
    // campo `orderId` (`gid://shopify/Order/N`). Prima si prova la strada
    // corta (se un domani l'id arrivasse già buono), poi si chiede a Orders.
    let id = SalesService.numeroShopify(externalOrderId);
    let marchio = (brand ?? '').trim();
    if (!id) {
      const ordine = await this.ordineDaOrders(externalOrderId);
      id = SalesService.numeroShopify(ordine?.orderId ?? null);
      marchio = marchio || String(ordine?.brand ?? '').trim();
    }
    if (!id) return null; // meglio nessun bottone che un link che non apre niente
    const s = await this.prisma.appSetting.findUnique({ where: { key: 'shopifyAdminUrl' } });
    const base = SalesService.baseShopify(s?.value, marchio);
    return base ? `${base}/orders/${id}` : null;
  }

  /**
   * ⭐ 04/09/2026 (regola utente): «se lo stato non è conforme l'ordine non
   * può essere mandato avanti». Qui si ferma: accettazione, consegna e
   * proposta a un partner. La vendita resta dov'è — anche quella di un
   * prodotto UNICO, che altrimenti sarebbe passata liscia.
   *
   * ⚠️ Se Orders non risponde NON si blocca: un servizio giù fermerebbe tutto
   * l'ufficio, e il rischio di un ordine non conforme accettato è lo stesso
   * che si correva prima di questa regola. Il silenzio si distingue dal «no».
   */
  private async assertOrdineConforme(externalOrderId: string | null | undefined) {
    const ordine = await this.ordineDaOrders(externalOrderId);
    const salute = typeof ordine?.salute === 'string' ? ordine.salute : (ordine?.salute?.chiave ?? null);
    if (salute && salute !== 'conforme') {
      throw new BadRequestException(
        `L'ordine in Orders non è conforme (${String(salute).replace(/_/g, ' ')}): non si può mandare avanti. Si può solo rifiutare.`,
      );
    }
  }

  /**
   * La base dell'admin per quel marchio. L'impostazione `shopifyAdminUrl`
   * accetta due forme: **un indirizzo solo** (vale per tutti) o un **JSON per
   * marchio** — es. {"deluxy.it": ".../store/deluxygifts", "*": ".../store/altro"}.
   * I negozi sono più d'uno e un link al negozio sbagliato apre una pagina
   * vuota: se il marchio non è in mappa e non c'è la voce "*", niente bottone.
   */
  private static baseShopify(valore: string | null | undefined, brand: string): string {
    const grezzo = (valore ?? '').trim() || process.env.SHOPIFY_ADMIN_URL || '';
    const pulisci = (v: string) => (v ?? '').trim().replace(/\/+$/, '');
    if (grezzo.startsWith('{')) {
      try {
        const mappa = JSON.parse(grezzo) as Record<string, string>;
        const chiave = Object.keys(mappa).find((k) => k.toLowerCase() === brand.toLowerCase());
        return pulisci(mappa[chiave ?? ''] ?? mappa['*'] ?? '');
      } catch {
        return '';
      }
    }
    return pulisci(grezzo) || 'https://admin.shopify.com/store/deluxygifts';
  }

  /**
   * La quota Deluxy che lascia al partner esattamente `daDare` su un importo
   * cliente `importo`.
   *
   * ⚠️ Se il patto col partner è più alto dell'importo che incassiamo, la
   * quota non può essere negativa: si mette a zero e il partner prende tutto
   * l'importo. Il caso esiste (un prodotto svenduto) e va visto, non nascosto:
   * la riconciliazione resta scritta col suo prezzo, e il conto lo fa la
   * Fatturazione sui numeri veri.
   */
  private static quotaPerDare(importo: number, daDare: number): number {
    if (!(importo > 0)) return 0;
    const quota = (1 - daDare / importo) * 100;
    if (!isFinite(quota) || quota <= 0) return 0;
    return Math.round(Math.min(quota, 100) * 100) / 100;
  }

  /** La coda numerica di «gid://shopify/Order/N» (o «N»): la chiave con cui Orders si trova. */
  private static numeroShopify(v?: string | null): string | null {
    const t = (v ?? '').trim();
    if (!t) return null;
    const coda = t.split('/').pop() ?? '';
    return /^\d+$/.test(coda) ? coda : null;
  }

  private statiOrdersCache: { quando: number; da: string; mappa: Map<string, StatoOrdineOrders> } | null = null;

  /**
   * Gli stati degli ordini in Orders, per numero Shopify, a pagine di 200 dal
   * primo giorno utile (la vendita più vecchia della lista, al massimo 120
   * giorni fa). Cache per istanza, 2 minuti.
   */
  /**
   * Le CHIAVI con cui una vendita si ritrova in Orders: l'id salvato sulla
   * vendita (che è l'id di **Deluxy Orders**) e, se mai fosse un gid Shopify,
   * la sua coda numerica.
   *
   * ⚠️ Difetto trovato il 04/09/2026 e riparato: la mappa era costruita SOLO
   * sul numero Shopify preso da `o.orderId`, mentre la vendita porta l'id di
   * Orders. Nessuna chiave combaciava e la colonna «Stato in Orders» era
   * vuota per TUTTI — sembrava che Orders non rispondesse, mentre rispondeva
   * benissimo ([[trappola-numero-non-e-identita]]).
   */
  private static chiaviOrdine(externalOrderId: string | null | undefined): string[] {
    const grezzo = (externalOrderId ?? '').trim();
    const numero = SalesService.numeroShopify(externalOrderId);
    return [grezzo, numero ?? ''].filter(Boolean);
  }

  private async statiDaOrders(vendite: { externalOrderId: string | null; createdAt: Date }[]): Promise<Map<string, StatoOrdineOrders>> {
    const conOrdine = vendite.filter((v) => SalesService.chiaviOrdine(v.externalOrderId).length);
    if (!conOrdine.length) return new Map();
    const limite = new Date(); limite.setDate(limite.getDate() - 120);
    const piuVecchia = conOrdine.reduce((m, v) => (v.createdAt < m ? v.createdAt : m), new Date());
    const da = (piuVecchia < limite ? limite : piuVecchia).toISOString().slice(0, 10);
    const adesso = Date.now();
    if (this.statiOrdersCache && this.statiOrdersCache.da <= da && adesso - this.statiOrdersCache.quando < 120_000) {
      return this.statiOrdersCache.mappa;
    }
    const cfg = await this.prisma.appSetting.findMany({ where: { key: { in: ['ordersUrl', 'ordersApiKey'] } } });
    const map = Object.fromEntries(cfg.map((r) => [r.key, r.value]));
    const url = (map['ordersUrl'] || process.env.ORDERS_URL || '').replace(/\/+$/, '');
    const chiave = map['ordersApiKey'] || process.env.ORDERS_API_KEY || '';
    const mappa = new Map<string, StatoOrdineOrders>();
    if (!url || !chiave) return mappa;
    try {
      for (let pagina = 1; pagina <= 25; pagina++) {
        const q = new URLSearchParams({ page: String(pagina), limit: '200', da, annullati: 'inclusi' });
        const res = await fetch(`${url}/api/v1/ordini?${q}`, { headers: { 'x-api-key': chiave } });
        if (!res.ok) break;
        const body = (await res.json()) as { ordini?: any[]; pagine?: number };
        for (const o of body.ordini ?? []) {
          const k = SalesService.numeroShopify(o.orderId);
          const idOrders = typeof o.id === 'string' ? o.id : null;
          if (!k && !idOrders) continue;
          const dati = {
            salute: typeof o.salute === 'string' ? o.salute : (o.salute?.chiave ?? null),
            stato: o.classificazione?.stato?.chiave ?? null,
            terminale: o.classificazione?.stato?.terminale ?? null,
            smistamento: o.smistamento ?? null,
            evasione: o.evasione ?? null,
            fulfillmentStatus: o.fulfillmentStatus ?? null,
            consegnataIl: o.consegnata?.il ?? null,
            annullato: o.annullato ?? o.cancelledAt ?? null,
          };
          // Due chiavi per lo stesso ordine: l'id di Orders (quello che la
          // vendita ha davvero) e il numero Shopify, per chi arrivasse col gid.
          if (idOrders) mappa.set(idOrders, dati);
          if (k) mappa.set(k, dati);
        }
        if (!(body.ordini ?? []).length || pagina >= (body.pagine ?? 1)) break;
      }
      this.statiOrdersCache = { quando: adesso, da, mappa };
    } catch (e) {
      console.error('stati-da-orders:', (e as Error).message);
    }
    return mappa;
  }

  /**
   * Crea una vendita e la smista, con le due regole dell'app reale
   * (manuale COME-FUNZIONA-APP-DELUXY.md, sezione 3.7):
   *
   *  - prodotto UNICO: al partner proprietario, se opera nella provincia ed e'
   *    aperto. Se il prodotto e' «visibile ad altri partner» valgono anche i
   *    partner collegati: e' il Corporate Service.
   *  - prodotto NON UNICO: primo partner APERTO della lista priorita' per
   *    provincia e categoria.
   *
   * Se non c'e' nessuno di aperto la vendita resta DA GESTIRE, e non si assegna
   * a un partner chiuso. Fino al 24/08/2026 il codice faceva
   * `open?.partner.id ?? candidates[0]?.partner.id`: mandava la vendita al primo
   * della lista anche a serranda abbassata, e il partner si trovava un ordine
   * che non poteva prendere.
   */
  async create(body: {
    /** ⭐ 06/09/2026: % sconto decisa da Orders (vince se c'è). */
    discountPercent?: number;
    productId: string;
    productVariantId?: string;
    provinceId: string;
    brand?: string;
    customerId?: string;
    source?: string;
    externalOrderId?: string;
    externalOrderNumber?: string;
    recipientFirstName?: string;
    recipientLastName?: string;
    recipientAddress?: string;
    recipientPhone?: string;
    deliveryDate?: string;
    serviceTypeId?: string;
    /** Quanto ha pagato il cliente, se chi chiama lo sa (Orders lo sa). */
    amount?: number;
    /** ⭐ 07/09/2026: quanti pezzi. Sui generici a quantità il prezzo unitario è amount / quantity. */
    quantity?: number;
    /** Titolo della riga d ordine: sui generici resta scritto che cosa aveva chiesto il cliente. */
    productName?: string;
  }) {
    const product = await this.prisma.product.findUnique({
      where: { id: body.productId },
    });
    if (!product) throw new NotFoundException('Prodotto non trovato');

    // La VARIANTE dell'ordine (es. la taglia M). Deve appartenere al prodotto:
    // una variante di un altro prodotto e' un errore del chiamante, non un
    // dettaglio da ignorare in silenzio.
    const variante = body.productVariantId
      ? await this.prisma.productVariant.findFirst({
          where: { id: body.productVariantId, productId: product.id },
        })
      : null;
    if (body.productVariantId && !variante) {
      throw new NotFoundException('Variante non trovata per questo prodotto');
    }

    // ⭐ 05/09/2026 (regola utente): la finestra è quella della CONSEGNA, non
    // l'istante in cui la vendita arriva. Il giorno è quello chiesto
    // dall'ordine; l'ora è la FASCIA che il cliente ha scelto al checkout
    // (8–12, 12–16, 16–20), che si chiede a Orders — la stessa che finirà su
    // `deliveryTimeFrom/To` della consegna.
    // ⚠️ Se l'ordine non ha una data si guarda OGGI come giorno, ma senza
    // nessuna ora: «adesso» è quando è arrivata la vendita, non quando si
    // consegna, e usarlo come orario è esattamente il difetto che si corregge.
    const ordineChiamante = await this.ordineDaOrders(body.externalOrderId);
    const fasciaOrdine = SalesService.fasciaInOrari(ordineChiamante?.consegna?.fascia);
    const finestra: FinestraConsegna = {
      giorno: body.deliveryDate ? new Date(body.deliveryDate) : new Date(),
      dalle: fasciaOrdine.dalle,
      alle: fasciaOrdine.alle,
      importo: body.amount && body.amount > 0 ? body.amount : null,
      // ⭐ 06/09 (regola utente): «il minimo ordine dovrà essere confrontato con il prezzo
      // partner di una vendita» — qui la stima: listino per gli unici, altrimenti importo
      // cliente meno la quota (Orders, poi la regola locale). La cifra vera si scrive dopo.
      scontoPct: body.discountPercent ?? (await this.quotaDaOrders(body.provinceId, product.categoryId))?.sconto
        ?? (product.categoryId ? (await this.prisma.categoryDiscount.findUnique({ where: { categoryId_provinceId: { categoryId: product.categoryId, provinceId: body.provinceId } }, select: { discountPercent: true } }))?.discountPercent : null) ?? 0,
      prezzoPartnerListino: product.type === ProductType.UNICO ? (variante?.price ?? product.price ?? null) : null,
      indirizzo: body.recipientAddress ?? null,
      variantId: variante?.id ?? null,
      pezzi: body.quantity && body.quantity > 1 ? Math.round(body.quantity) : null,
      titolo: body.productName ?? null,
    };
    // ⭐ 06/09/2026 (regola utente, caso #12889 «Elegant Cake» finito a Clivati):
    // «applica questo concetto per ora solo ai fiori, per le torte lascia la
    // regola che proponi solo prodotti unici». Un prodotto NON UNICO si smista
    // da solo (lista di priorità, partner unico, lista auto) SOLO se la sua
    // categoria è di FIORI; per tutto il resto (torte, dolci, regali…) la
    // vendita nasce DA GESTIRE e decide una persona. Gli UNICI restano com'erano.
    // Il blocco sta PRIMA di scegliPartner: così non nasce nemmeno la lista
    // di priorità automatica per una coppia che non deve smistarsi da sola.
    const categoria = product.categoryId ? await this.prisma.category.findUnique({ where: { id: product.categoryId }, select: { name: true, mestiere: { select: { nome: true, smistamentoAutomatico: true } } } }) : null;
    // Col mestiere assegnato decide il SUO interruttore «smistamento automatico» (oggi acceso solo su Fiorista); senza, il vecchio criterio sul nome.
    const automatico = categoria?.mestiere ? categoria.mestiere.smistamentoAutomatico : SalesService.categoriaFiori(categoria?.name);
    // ⭐ 06/09/2026 sera (regola utente): «i prodotti a preventivo richiedono il preventivo a
    // tutti i partner che fanno quel mestiere: prima di poter accettare la vendita, il
    // Customer Service deve inserire il preventivo dato dal partner». Quindi un prodotto a
    // PREVENTIVO non si smista mai da solo, nemmeno se il mestiere è automatico e nemmeno se
    // in provincia c'è un partner solo: senza un prezzo concordato non c'è una proposta, c'è
    // un'ipotesi. Il preventivo lo raccoglie il Customer Service e resta scritto lì.
    // ⭐ 07/09/2026 (regola utente): il prodotto a preventivo non è più bloccato in partenza —
    // `scegliPartner` propone a chi il prezzo l'ha già dato (e a quel prezzo). Resta «da
    // gestire» solo quando non l'ha dato nessuno, e allora il motivo lo dice.
    const aPreventivo = (product as any).tipologiaVendita === 'preventivo';
    const bloccoGrezzo = product.type !== ProductType.UNICO && !automatico
      ? `prodotto non unico di un mestiere senza smistamento automatico (${categoria?.mestiere?.nome ?? categoria?.name ?? 'senza categoria'}): si gestisce a mano`
      : null;
    // ⭐ 06/09/2026 sera (regola utente): «in vendita, se non c'è più di un partner per
    // provincia, lascia la vendita in vendita per il partner da accettare, in caso di
    // prodotto non-unico». Con UN partner solo non c'è nessuna scelta da fare — il blocco
    // serviva a non far scegliere alla macchina fra più fornitori. La vendita nasce
    // PROPOSTA a lui e la accetta (o la rifiuta) lui, come tutte le altre.
    // Si conta in SOLA LETTURA: chiedere quanti sono non deve creare una lista di priorità.
    const unSoloPartner = bloccoGrezzo && !aPreventivo
      ? (await this.candidati(product, body.provinceId, finestra.variantId ?? null, true)).length === 1
      : false;
    const bloccoNonUnico = bloccoGrezzo && !unSoloPartner ? bloccoGrezzo : null;
    const scelto = bloccoNonUnico ? null : await this.scegliPartner(product, body.provinceId, finestra, []);
    // Un prodotto a preventivo senza nessuno che abbia risposto: si dice perché resta fermo.
    const bloccoPreventivo = !scelto && aPreventivo && !bloccoNonUnico
      ? 'prodotto a preventivo: nessun partner ha ancora dato un prezzo (lo chiede il Customer Service, Vendite → Liste di prodotto)'
      : null;
    // ⭐ 05/09/2026 (regola utente, caso 12879 — Tiramisù «4 porzioni» di
    // Clivati): «non devi togliere la % per il prezzo partner, ma prendere il
    // prezzo partner per variante già presente per quel prodotto».
    //
    // Nel catalogo `price` e' quanto prende il PARTNER e `publicPrice` quanto
    // paga il CLIENTE: la variante «4» ha price 28 e publicPrice 30, Orders
    // dice che il cliente ha pagato 30, e le 15 consegne passate di quella
    // variante hanno dato al partner 28. Qui invece `price` veniva letto come
    // importo del cliente e poi ci si toglieva la quota di categoria (20%):
    // 28 → 22,40 al partner, cioe' 5,60 in meno del suo listino, e un cliente
    // registrato a 28 invece che a 30.
    //
    // Ora: il cliente paga quanto dice Orders (o il listino pubblico), il
    // partner PROPRIETARIO prende il SUO prezzo di listino per quella variante,
    // e la quota e' la differenza. Vale per i prodotti UNICI, che hanno un
    // padrone e un listino suo; sui NON UNICI resta la regola di categoria.
    const prezzoPubblicoListino = variante?.publicPrice ?? variante?.price ?? product.publicPrice ?? product.price ?? 0;
    const importoCliente = body.amount && body.amount > 0 ? body.amount : prezzoPubblicoListino;
    const prezzoPartnerDaListino = product.type === ProductType.UNICO
      ? (variante?.price ?? product.price ?? null)
      : null;

    // Lo SCONTO si cristallizza QUI, alla nascita della vendita: e' la regola
    // CategoryDiscount (categoria del prodotto × provincia), gestita
    // dall'admin. Scriverlo sulla vendita — e non ricalcolarlo dopo — fa si'
    // che un cambio di listino non riscriva la storia: le vendite passate
    // restano ai patti del loro giorno. 0 = nessuna regola per quella coppia.
    const sconto = product.categoryId
      ? await this.prisma.categoryDiscount.findUnique({
          where: {
            categoryId_provinceId: {
              categoryId: product.categoryId,
              provinceId: body.provinceId,
            },
          },
          select: { discountPercent: true },
        })
      : null;

    // ⭐ 06/09/2026 (regola utente: «anche per app delivery deve essere preso da
    // Orders»). La quota al fornitore per provincia e categoria ha UNA casa,
    // Orders (`GET /api/v1/quota-fornitore`, Standard §7.4): la si chiede lì,
    // arrotondata ai centesimi, e vale al posto della regola locale
    // CategoryDiscount. Se Orders risponde «default» (nessuna regola per quella
    // provincia) o non risponde, resta la regola locale — e il motivo lo dice.
    const quotaOrders = scelto?.prezzoPartner === undefined && prezzoPartnerDaListino === null && body.discountPercent == null
      // ⭐ 07/09/2026 (regola utente: «prendi la % da CS con arrotondamento»): col prezzo
      // pubblico il custode risponde anche col prezzo al fornitore, già arrotondato a 5/0.
      ? await this.quotaDaOrders(body.provinceId, product.categoryId, importoCliente)
      : null;
    const creata = await this.prisma.sale.create({
      data: {
        productId: product.id,
        // ⭐ 07/09/2026: i pezzi («50 rose») e il titolo scritto dal cliente sul generico.
        quantity: Math.max(1, Math.round(Number(body.quantity) || 1)),
        productName: body.productName ?? product.name ?? null,
        // Fotografia della variante: id + nome, come per il prodotto.
        productVariantId: variante?.id ?? null,
        variantName: variante?.name ?? null,
        provinceId: body.provinceId,
        partnerId: scelto?.partnerId ?? null,
        assignmentReason: [scelto?.motivo ? (unSoloPartner ? `${scelto.motivo} (unico partner in provincia: proposta da accettare)` : scelto.motivo) : bloccoNonUnico ?? bloccoPreventivo ?? null, quotaOrders ? `sconto dal Customer Service (${quotaOrders.regola}: fornitore ${quotaOrders.quota}%${quotaOrders.prezzoFornitore != null ? `, ${quotaOrders.prezzoFornitore} € arrotondati` : ''})` : null].filter(Boolean).join(' · ') || null,
        customerId: body.customerId,
        brand: body.brand ?? 'DELUXY',
        // La Cappelliera base fa 110 ma la M ne fa 215: se c'e' la variante,
        // il valore della vendita e' il SUO listino, non quello del base.
        amount: importoCliente,
        // ⭐ 04/09 (regola utente): con una riconciliazione accettata la quota
        // si piega al patto col partner; senza, vale la regola di categoria.
        // Ordine di precedenza: patto di riconciliazione > listino del
        // proprietario (UNICO) > regola di categoria × provincia.
        // ⭐ 06/09/2026 (regola utente): «le % di sconto con arrotondamento
        // dovrebbero arrivare direttamente da Orders». Se Orders manda la sua,
        // vince (arrotondata ai centesimi); altrimenti valgono le regole di qui.
        // Precedenza: riconciliazione prodotto/provincia > prezzo partner di listino
        // (prodotto UNICO, regola 05/09) > % di ORDERS (se la manda, arrotondata) >
        // CategoryDiscount della piattaforma. La % di Orders sostituisce la regola
        // per categoria×provincia, non il prezzo di un prodotto specifico.
        discountPercent: scelto?.prezzoPartner !== undefined
          ? SalesService.quotaPerDare(importoCliente, scelto.prezzoPartner)
          : prezzoPartnerDaListino !== null
            ? SalesService.quotaPerDare(importoCliente, prezzoPartnerDaListino)
            : body.discountPercent != null && isFinite(Number(body.discountPercent))
              ? Math.round(Math.min(100, Math.max(0, Number(body.discountPercent))) * 100) / 100
              : quotaOrders
                // ⭐ 07/09/2026: se il custode manda il PREZZO (arrotondato da lui), la
                // percentuale si ricava da quello — così il partner prende esattamente
                // il numero che il Customer Service ha deciso: 135 € → 95 €, non 94,50.
                // Senza il prezzo (CS vecchio o non raggiungibile) resta la percentuale.
                ? quotaOrders.prezzoFornitore != null
                  ? SalesService.quotaPerDare(importoCliente, quotaOrders.prezzoFornitore)
                  : quotaOrders.sconto
                : sconto?.discountPercent ?? 0,
        status: scelto ? SaleStatus.PROPOSTA : SaleStatus.DA_GESTIRE,
        source: body.source ?? 'app',
        externalOrderId: body.externalOrderId,
        // Il numero Shopify (es. 2824): quello che un umano riconosce in pagina.
        externalOrderNumber: body.externalOrderNumber ?? null,
        recipientFirstName: body.recipientFirstName,
        recipientLastName: body.recipientLastName,
        recipientAddress: body.recipientAddress,
        recipientPhone: body.recipientPhone,
        deliveryDate: body.deliveryDate ? new Date(body.deliveryDate) : null,
        serviceTypeId: body.serviceTypeId,
      },
      include: {
        product: { select: { id: true, name: true } },
        partner: { select: { id: true, insegna: true } },
      },
    });
    if (creata.status === SaleStatus.PROPOSTA && creata.partnerId) await this.avvisaProposta(creata);
    return creata;
  }

  /**
   * Riceve un ordine da un sistema esterno (Deluxy Orders, Shopify) e lo smista.
   *
   * E' idempotente sulla coppia (sorgente, id ordine esterno): lo stesso ordine
   * rimandato due volte non genera due vendite. Un webhook che ritenta e' la
   * norma, non l'eccezione.
   */
  async ingest(body: {
    source: string;
    externalOrderId: string;
    externalOrderNumber?: string;
    provinceCode?: string;
    provinceId?: string;
    productId?: string;
    productVariantId?: string;
    productSku?: string;
    /** Titolo della riga d'ordine: per la vendita SENZA prodotto a catalogo. */
    productName?: string;
    /** Prezzo pagato dal cliente (riga d'ordine): senza prodotto non c'è un listino da cui prenderlo. */
    amount?: number;
    /** ⭐ 07/09/2026: quanti pezzi («50 rose rosse»). Il prezzo unitario è amount / quantity. */
    quantity?: number;
    /** ⭐ 06/09/2026: % di sconto al partner decisa da ORDERS (già arrotondata): se c'è, vince. */
    discountPercent?: number;
    /** ⭐ 03/09 (ordini ESTERI): DA GESTIRE senza proposta automatica anche
     *  col prodotto a catalogo — all'estero non abbiamo partner. */
    senzaProposta?: boolean;
    /** ⭐ 07/09/2026: PERCHÉ questa vendita non si smista da sola. Il testo era cablato
     *  su «ordine estero» ed è finito su vendite di Pavia e Cagliari: un motivo che mente
     *  è peggio di un motivo assente, perché chi legge smette di cercare quello vero. */
    motivo?: string;
    brand?: string;
    customerId?: string;
    recipientFirstName?: string;
    recipientLastName?: string;
    recipientAddress?: string;
    recipientPhone?: string;
    deliveryDate?: string;
    serviceTypeId?: string;
  }) {
    if (!body?.source || !body?.externalOrderId) {
      throw new BadRequestException('Servono «source» e «externalOrderId».');
    }
    // ⭐ 07/09/2026 (regola utente: «in vendita dovrei vedere due flussi, uno per il bouquet e
    // uno per la torta»). Un ordine con una torta e un bouquet ha DUE fornitori diversi: fino a
    // ieri la seconda riga non nasceva perché il doppione si misurava sull'ORDINE. Adesso si
    // misura sulla RIGA — prodotto e variante — e l'ordine senza prodotto riconosciuto resta
    // uno solo, com'era (là non c'è una riga da distinguere).
    const gia = await this.prisma.sale.findFirst({
      where: {
        source: body.source,
        externalOrderId: body.externalOrderId,
        // Con un prodotto: la riga è quella coppia. Senza (riga fuori catalogo), il doppione
        // si misura sul TITOLO: due righe diverse dello stesso ordine devono poter nascere
        // tutte e due, o l'ordine composto torna a essere mezzo.
        ...(body.productId
          ? { productId: body.productId, productVariantId: body.productVariantId ?? null }
          : body.productName
            ? { productName: body.productName }
            : {}),
      },
      include: { partner: { select: { id: true, insegna: true } } },
    });
    if (gia) return { creata: false, motivo: 'ordine gia ricevuto', vendita: gia };

    // ⚠️ Lo SKU di un ordine e' quasi sempre quello della VARIANTE (es.
    // MQLSWA-2 = Cappelliera taglia M): se fra i prodotti non c'e', si cerca
    // fra le varianti e si tiene ANCHE la variante — perdere quale taglia e'
    // stata ordinata fa sbagliare tutti i prezzi a valle.
    let variantId = body.productVariantId ?? null;
    let prodotto = body.productId
      ? await this.prisma.product.findUnique({ where: { id: body.productId } })
      : body.productSku
        ? await this.prisma.product.findFirst({ where: { sku: body.productSku } })
        : null;
    if (!prodotto && body.productSku) {
      const variante = await this.prisma.productVariant.findFirst({
        where: { sku: body.productSku },
        include: { product: true },
      });
      if (variante) {
        prodotto = variante.product;
        variantId = variante.id;
      }
    }
    if (!prodotto) {
      // ⭐ 01/09 (regola utente «fai nascere la vendita»): un prodotto
      // personalizzato o uno SKU fuori catalogo NON buttano più l'ordine — la
      // vendita nasce SENZA aggancio a catalogo, DA GESTIRE, col titolo in
      // chiaro e lo SKU grezzo. Niente smistamento automatico: senza prodotto
      // non si conosce il mestiere, decide una persona. Prima il 18% degli
      // ordini (76 su 425 in 30 giorni) non entrava affatto.
      if (!body.productName && !body.productSku) {
        throw new NotFoundException('Prodotto non trovato (per id o SKU)');
      }
      const prov = body.provinceId
        ? await this.prisma.province.findUnique({ where: { id: body.provinceId } })
        : body.provinceCode
          ? await this.prisma.province.findFirst({ where: { code: body.provinceCode.toUpperCase() } })
          : null;
      if (!prov) throw new NotFoundException('Provincia non trovata (per id o codice)');
      const vendita = await this.prisma.sale.create({
        data: {
          productId: null,
          productName: body.productName ?? null,
          productSku: body.productSku ?? null,
          provinceId: prov.id,
          partnerId: null,
          assignmentReason: 'Senza prodotto a catalogo (SKU assente o sconosciuto): da gestire a mano.',
          customerId: body.customerId,
          brand: body.brand ?? 'DELUXY',
          amount: body.amount ?? 0,
          quantity: Math.max(1, Math.round(Number(body.quantity) || 1)),
          discountPercent: 0,
          status: SaleStatus.DA_GESTIRE,
          source: body.source ?? 'app',
          externalOrderId: body.externalOrderId,
          externalOrderNumber: body.externalOrderNumber ?? null,
          recipientFirstName: body.recipientFirstName,
          recipientLastName: body.recipientLastName,
          recipientAddress: body.recipientAddress,
          recipientPhone: body.recipientPhone,
          deliveryDate: body.deliveryDate ? new Date(body.deliveryDate) : null,
          serviceTypeId: body.serviceTypeId,
        },
        include: {
          product: { select: { id: true, name: true } },
          partner: { select: { id: true, insegna: true } },
        },
      });
      await this.registra(vendita.id, 'creata', `Vendita creata da ${body.source ?? 'app'}${body.externalOrderNumber ? ' (ordine #' + body.externalOrderNumber + ')' : ''} · stato ${vendita.status}${(vendita as any).partner?.insegna ? ' · proposta a ' + (vendita as any).partner.insegna : ''}`);
      return { creata: true, vendita };
    }

    const provincia = body.provinceId
      ? await this.prisma.province.findUnique({ where: { id: body.provinceId } })
      : body.provinceCode
        ? await this.prisma.province.findFirst({
            where: { code: body.provinceCode.toUpperCase() },
          })
        : null;
    if (!provincia) throw new NotFoundException('Provincia non trovata (per id o codice)');

    // ⭐ NIENTE SMISTAMENTO AUTOMATICO: la vendita nasce DA GESTIRE e decide una
    // persona. Due i casi: l'ESTERO (03/09, regola utente: fuori Italia non abbiamo
    // partner né liste) e, dal 07/09, il prodotto che NON HA NESSUN PARTNER a cui
    // essere proposto — tipicamente l'unico di un partner «escluso dalle proposte».
    // Il motivo lo dice chi chiama: era cablato su «estero» e usciva anche su Pavia.
    if (body.senzaProposta) {
      const vendita = await this.prisma.sale.create({
        data: {
          productId: prodotto.id,
          productVariantId: variantId,
          productName: prodotto.name ?? null,
          productSku: body.productSku ?? prodotto.sku ?? null,
          provinceId: provincia.id,
          partnerId: null,
          assignmentReason: body.motivo ?? 'Ordine estero: nessuno smistamento automatico, si gestisce a mano.',
          customerId: body.customerId,
          brand: body.brand ?? 'DELUXY',
          amount: body.amount ?? prodotto.price ?? 0,
          quantity: Math.max(1, Math.round(Number(body.quantity) || 1)),
          discountPercent: 0,
          status: SaleStatus.DA_GESTIRE,
          source: body.source ?? 'app',
          externalOrderId: body.externalOrderId,
          externalOrderNumber: body.externalOrderNumber ?? null,
          recipientFirstName: body.recipientFirstName,
          recipientLastName: body.recipientLastName,
          recipientAddress: body.recipientAddress,
          recipientPhone: body.recipientPhone,
          deliveryDate: body.deliveryDate ? new Date(body.deliveryDate) : null,
          serviceTypeId: body.serviceTypeId,
        },
        include: {
          product: { select: { id: true, name: true } },
          partner: { select: { id: true, insegna: true } },
        },
      });
      await this.registra(vendita.id, 'creata', `Vendita creata da ${body.source ?? 'app'}${body.externalOrderNumber ? ' (ordine #' + body.externalOrderNumber + ')' : ''} · stato ${vendita.status}${(vendita as any).partner?.insegna ? ' · proposta a ' + (vendita as any).partner.insegna : ''}`);
      return { creata: true, vendita };
    }

    const vendita = await this.create({
      ...body,
      productId: prodotto.id,
      productVariantId: variantId ?? undefined,
      provinceId: provincia.id,
    });
    await this.registra(vendita.id, 'creata', `Vendita creata da ${body.source ?? 'app'}${body.externalOrderNumber ? ' (ordine #' + body.externalOrderNumber + ')' : ''} · stato ${vendita.status}${(vendita as any).partner?.insegna ? ' · proposta a ' + (vendita as any).partner.insegna : ''}`);
    return { creata: true, vendita };
  }

  /** Il partner accetta: la vendita diventa sua e nasce la consegna. */
  async accetta(id: string, user: JwtUser) {
    const vendita = await this.prisma.sale.findUnique({
      where: { id },
      include: { product: true },
    });
    if (!vendita) throw new NotFoundException('Vendita non trovata');
    this.assertPuoRispondere(vendita, user);
    if (vendita.status !== SaleStatus.PROPOSTA) {
      throw new BadRequestException(
        `La vendita non e' in attesa di risposta (stato: ${vendita.status}).`,
      );
    }
    // ⭐ 04/09 (regola utente): un ordine non conforme non va avanti.
    await this.assertOrdineConforme(vendita.externalOrderId);
    // ⭐ 04/09 (regola utente): si accetta solo una vendita davvero andata a un
    // partner. Senza partner la consegna non saprebbe da chi ritirare.
    if (!vendita.partnerId) {
      throw new BadRequestException("La vendita non è andata a nessun partner: si inserisce dall'ufficio.");
    }

    const variante = vendita.productVariantId
      ? await this.prisma.productVariant.findUnique({ where: { id: vendita.productVariantId } })
      : null;
    const consegna = await this.creaConsegna(vendita, variante);
    const aggiornata = await this.aggiornaVenditaConConsegna(
      id,
      {
        status: SaleStatus.ACCETTATA,
        deliveryId: consegna?.id ?? null,
        // Il servizio con cui è nata la consegna resta scritto anche sulla vendita.
        serviceTypeId: vendita.serviceTypeId ?? consegna?.serviceTypeId ?? undefined,
        historyAt: new Date(),
      },
      { partner: { select: { id: true, insegna: true } } },
    );
    await this.registra(id, 'stato', `Accettata ${user.role === Role.PARTNER ? 'dal partner ' + (aggiornata.partner?.insegna ?? '') : "dall'ufficio"}${consegna ? ' → nasce la consegna #' + (consegna as any).code : ' — consegna NON creata (dati mancanti)'}`, user);
    return {
      vendita: aggiornata,
      consegna,
      // Meglio dire che la consegna non e' nata, che lasciarla credere creata.
      avviso: consegna
        ? null
        : "Vendita accettata, ma la consegna non e' stata creata: mancano destinatario, indirizzo, data o servizio. Va inserita a mano.",
    };
  }

  /**
   * PORTA IN CONSEGNA DA UN'ALTRA APP (31/08/2026, canale app-to-app):
   * il Customer Service decide di portare la vendita in consegna, e la
   * piattaforma la porta in STORICO (accettata). Due modi:
   *  - senza deliveryId: si CREA la consegna dalla vendita (come l'accettazione
   *    del partner), se ci sono i dati (destinatario, indirizzo, data, servizio);
   *  - con deliveryId: la consegna esiste già (creata altrove) e si AGGANCIA.
   * Idempotente: se la vendita è già accettata con una consegna, non fa nulla.
   */
  async portaInConsegnaDaApp(source: string, externalOrderId: string, deliveryId?: string) {
    const vendita = await this.prisma.sale.findFirst({
      where: { source, externalOrderId }, include: { product: true },
    });
    if (!vendita) throw new NotFoundException(`Nessuna vendita ${source}/${externalOrderId}.`);
    if (vendita.status === SaleStatus.ACCETTATA && vendita.deliveryId) {
      return { giaInConsegna: true, venditaId: vendita.id, deliveryId: vendita.deliveryId };
    }
    let consegnaId = deliveryId ?? null;
    if (deliveryId) {
      const d = await this.prisma.delivery.findUnique({ where: { id: deliveryId }, select: { id: true } });
      if (!d) throw new BadRequestException('Consegna inesistente');
    } else {
      const variante = vendita.productVariantId
        ? await this.prisma.productVariant.findUnique({ where: { id: vendita.productVariantId } })
        : null;
      const consegna = await this.creaConsegna(vendita, variante);
      consegnaId = consegna?.id ?? null;
      if (!consegnaId) {
        throw new BadRequestException(
          'Non si è potuta creare la consegna: mancano destinatario, indirizzo, data o servizio. Passare un deliveryId di una consegna già creata.',
        );
      }
    }
    await this.prisma.sale.update({
      where: { id: vendita.id },
      data: {
        status: SaleStatus.ACCETTATA,
        historyAt: new Date(),
        deliveryId: consegnaId,
        partnerId: vendita.partnerId,
        assignmentReason: [vendita.assignmentReason, 'portata in consegna da Customer Service (31/08)']
          .filter(Boolean).join(' · '),
      },
    });
    await this.registra(vendita.id, 'stato', `Portata in consegna dal Customer Service (${source})${deliveryId ? ' · agganciata alla consegna esistente' : ' · consegna creata dalla vendita'}`);
    return { portataInConsegna: true, venditaId: vendita.id, deliveryId: consegnaId };
  }

  /** Dettaglio di una vendita: serve al prefill del form consegna (ufficio). */
  async findOne(id: string, user?: JwtUser) {
    const vendita = await this.prisma.sale.findUnique({
      where: { id },
      include: {
        // ⭐ 05/09/2026 (regola utente): nel pop-up si vede il PRODUTTORE del
        // prodotto (il partner che lo fa: è lui il produttore, non chi lo
        // vende) e si aprono le FOTO cliccando il nome.
        product: {
          select: {
            id: true, name: true, price: true, type: true, sku: true,
            imageUrl: true, images: true, line: true,
            partner: { select: { id: true, insegna: true } },
          },
        },
        partner: { select: { id: true, insegna: true } },
        province: true,
        // ⭐ 04/09: il pop-up di dettaglio mostra consegna collegata, servizio e REGISTRO.
        logs: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!vendita) throw new NotFoundException('Vendita non trovata');
    // La consegna collegata (Sale ha solo deliveryId, senza relazione Prisma).
    const delivery = vendita.deliveryId
      ? await this.prisma.delivery.findUnique({ where: { id: vendita.deliveryId }, select: { id: true, code: true, status: true, date: true } })
      : null;
    // Il PARTNER vede solo le vendite proposte a lui (o che ha rifiutato lui).
    if (user?.role === Role.PARTNER) {
      let rifiutati: string[] = [];
      try { rifiutati = JSON.parse(vendita.refusedPartnerIds ?? '[]'); } catch { rifiutati = []; }
      if (vendita.partnerId !== user.partnerId && !rifiutati.includes(user.partnerId ?? '-')) {
        throw new ForbiddenException("Questa vendita non e' proposta a te.");
      }
      // Al partner l'ufficio è «Ufficio Deluxy», non un'email di persona.
      const logs = vendita.logs.map((l) => ({
        ...l,
        userEmail: l.userRole && l.userRole !== Role.PARTNER ? 'Ufficio Deluxy' : l.userEmail,
        userId: null,
      }));
      const serviceType = vendita.serviceTypeId
        ? await this.prisma.serviceType.findUnique({ where: { id: vendita.serviceTypeId }, select: { id: true, name: true } })
        : null;
      // Anche al partner la SALUTE: se l'ordine non è conforme deve vedere
      // l'allarme e non un bottone «Accetta» che darebbe errore.
      const saluteP = await this.saluteOrdine(vendita.externalOrderId);
      return SalesService.perPartner({
        ...vendita, logs, serviceType, delivery, refusedPartnerIds: null, assignmentReason: null,
        ordine: saluteP ? { salute: saluteP } : null,
      });
    }
    const serviceType = vendita.serviceTypeId
      ? await this.prisma.serviceType.findUnique({ where: { id: vendita.serviceTypeId }, select: { id: true, name: true } })
      : null;
    // Una sola lettura di Orders per il pop-up: da lì escono sia il link
    // all'ordine sia la salute (che decide i bottoni).
    const ordineOrders = await this.ordineDaOrders(vendita.externalOrderId);
    const salute = typeof ordineOrders?.salute === 'string' ? ordineOrders.salute : (ordineOrders?.salute?.chiave ?? null);
    const idShopify = SalesService.numeroShopify(vendita.externalOrderId) ?? SalesService.numeroShopify(ordineOrders?.orderId ?? null);
    const baseAdmin = idShopify
      ? SalesService.baseShopify(
          (await this.prisma.appSetting.findUnique({ where: { key: 'shopifyAdminUrl' } }))?.value,
          vendita.brand || String(ordineOrders?.brand ?? ''),
        )
      : '';
    return {
      ...vendita, serviceType, delivery,
      shopifyUrl: baseAdmin && idShopify ? `${baseAdmin}/orders/${idShopify}` : null,
      ordine: salute ? { salute } : null,
    };
  }

  /**
   * DETTAGLIO ORDINE dietro la vendita (per precompilare la consegna, 31/08).
   *
   * La vendita salva l'essenziale per lo smistamento; il RESTO (mittente, TUTTE
   * le righe, il pagamento in contrassegno) vive nell'ordine originale di Deluxy
   * Orders. Qui lo si legge al volo — nessuna copia in casa (Standard §7) — e si
   * risolvono le righe agli id di piattaforma, pronte per il form.
   *
   * Best-effort: se Orders non è configurato o non risponde, `disponibile:false`
   * e il form usa solo quel che la vendita ha già.
   */
  async dettaglioOrdine(id: string): Promise<{
    disponibile: boolean;
    mittenteFirstName?: string; mittenteLastName?: string;
    contrassegno?: boolean;
    /** ⭐ 06/09/2026 (regola utente, caso 12879): il TIPO di vendita lo decide l'ordine —
     *  contrassegno = pagamento alla consegna; altrimenti singola (1 pezzo) o multipla (2+). */
    tipoVendita?: 'contrassegno' | 'singola' | 'multipla';
    /** Pezzi da consegnare (somma delle quantità delle righe con SKU: gli extra senza SKU sono personalizzazioni). */
    pezzi?: number;
    /** Totale dell'ordine (prodotti + consegna): è l'importo del contrassegno. */
    totale?: number;
    /** Fascia oraria chiesta dal cliente (attributo Shopify, es. «16-20»), già
     *  spezzata negli orari del form: dalle «16:00» alle «20:00». */
    consegnaDalle?: string; consegnaAlle?: string;
    /** Dedica/biglietto dell'ordine: va nella personalizzazione. */
    biglietto?: string;
    /** Note Shopify dell'ordine (testo libero del cliente). */
    note?: string;
    /** ⭐ 07/09/2026 (regola utente «devo poter vedere foto e produttore di tutti i prodotti
     *  nell'ordine»): ogni riga porta la foto, chi lo fa e il prezzo pagato. */
    prodotti?: {
      productId: string | null; productVariantId: string | null; nome: string | null;
      quantita: number; sku: string | null; prezzo: number | null;
      immagine: string | null; produttore: string | null; nota: string | null;
      venditaId: string | null; consegnaId: string | null;
    }[];
    /** ⭐ 07/09/2026: le altre vendite nate dallo stesso ordine (ordine composto). */
    vendite?: { id: string; prodotto: string | null; stato: string; consegnaId: string | null; partner: string | null }[];
    /** Acceso quando l'ordine ha più vendite e non tutte sono finite in consegna. */
    incompleto?: boolean;
  }> {
    const sale = await this.prisma.sale.findUnique({
      where: { id }, select: { externalOrderId: true },
    });
    if (!sale?.externalOrderId) return { disponibile: false };

    const ordine = await this.ordineDaOrders(sale.externalOrderId);
    if (!ordine) return { disponibile: false };

    // Mittente = chi ha ORDINATO (il committente del regalo), non il destinatario.
    // Si divide sull'ULTIMO spazio: «Maria Teresa Rossi» = nome «Maria Teresa».
    const nome = String(ordine?.mittente?.nome ?? ordine?.cliente?.nome ?? '').trim();
    const taglio = nome.lastIndexOf(' ');
    const mittenteFirstName = taglio > 0 ? nome.slice(0, taglio) : nome || undefined;
    const mittenteLastName = taglio > 0 ? nome.slice(taglio + 1) : undefined;

    // Contrassegno (pagamento alla consegna): la categoria di pagamento di
    // Orders sta in `classificazione.categoriaPagamento` (bonifico | carta |
    // contrassegno | altro); come rete, anche il nome del gateway.
    const categoria = String(ordine?.classificazione?.categoriaPagamento ?? '').toLowerCase();
    // ⚠️ Orders espone il gateway in `shopify.gateway` (misurato sul 12879: «shopify_payments»);
    // `pagamento.gateway` non esiste e lasciava sempre la rete vuota.
    const gateway = String(ordine?.shopify?.gateway ?? ordine?.pagamento?.gateway ?? '').toLowerCase();
    const contrassegno = categoria === 'contrassegno' || /contrassegno|cash on delivery|\bcod\b/.test(gateway);

    // Tutte le righe dell'ordine, risolte a prodotto/variante di piattaforma via SKU.
    const righe: any[] = Array.isArray(ordine?.righe) ? ordine.righe : [];
    const prodotti: {
      productId: string | null; productVariantId: string | null; nome: string | null;
      quantita: number; sku: string | null; prezzo: number | null;
      immagine: string | null; produttore: string | null; nota: string | null;
      venditaId: string | null; consegnaId: string | null;
    }[] = [];
    for (const r of righe) {
      const sku = String(r?.sku ?? '').trim();
      let productId: string | null = null;
      let productVariantId: string | null = null;
      if (sku) {
        const v = await this.prisma.productVariant.findFirst({ where: { sku }, select: { id: true, productId: true } });
        if (v) { productId = v.productId; productVariantId = v.id; }
        else {
          const p = await this.prisma.product.findFirst({ where: { sku }, select: { id: true } });
          if (p) productId = p.id;
        }
      }
      // ⭐ 07/09/2026: la foto e CHI LO FA. Il produttore è il partner del prodotto quando c'è
      // (il proprietario di un unico), altrimenti la linea/marca scritta a catalogo: senza,
      // guardando un ordine con due righe non si capisce chi deve fare cosa.
      let immagine: string | null = null;
      let produttore: string | null = null;
      let nota: string | null = null;
      if (productId) {
        const pr = await this.prisma.product.findUnique({
          where: { id: productId },
          select: { imageUrl: true, line: true, note: true, partner: { select: { insegna: true } } },
        });
        immagine = pr?.imageUrl ?? null;
        produttore = pr?.partner?.insegna ?? pr?.line ?? null;
        nota = pr?.note ?? null;
        if (productVariantId) {
          const v = await this.prisma.productVariant.findUnique({ where: { id: productVariantId }, select: { imageUrl: true, note: true } });
          if (v?.imageUrl) immagine = v.imageUrl;
          if (v?.note) nota = v.note;
        }
      }
      // La vendita che porta QUESTA riga (e la consegna che ne è nata), per vedere i due flussi.
      const venditaRiga = productId
        ? await this.prisma.sale.findFirst({
            where: { externalOrderId: sale.externalOrderId, productId, ...(productVariantId ? { productVariantId } : {}) },
            select: { id: true, deliveryId: true },
          })
        : null;
      prodotti.push({
        productId, productVariantId, nome: r?.titolo ?? null,
        quantita: Number(r?.quantita) || 1, sku: sku || null,
        prezzo: Number.isFinite(Number(r?.prezzo)) ? Number(r.prezzo) : null,
        immagine, produttore, nota,
        venditaId: venditaRiga?.id ?? null, consegnaId: venditaRiga?.deliveryId ?? null,
      });
    }

    // ⭐ 07/09/2026 (regola utente): «se un ordine è composto e tutte le vendite associate non
    // sono andate in consegne, metti un alert» — così non si consegna mezzo ordine.
    const sorelle = await this.prisma.sale.findMany({
      where: { externalOrderId: sale.externalOrderId },
      select: { id: true, status: true, deliveryId: true, productName: true, product: { select: { name: true } }, partner: { select: { insegna: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const vendite = sorelle.map((x) => ({
      id: x.id,
      prodotto: x.product?.name ?? x.productName ?? null,
      stato: x.status,
      consegnaId: x.deliveryId ?? null,
      partner: x.partner?.insegna ?? null,
    }));
    const incompleto = vendite.length > 1 && vendite.some((v) => !v.consegnaId && v.stato !== 'annullata');

    // ⭐ 06/09/2026 (regola utente, caso 12879 — usciva «con pagamento alla
    // consegna» pur essendo pagato con carta): il tipo di vendita lo decide
    // l'ORDINE, non l'ordine alfabetico del listino.
    //  - COD/contrassegno → «Vendita con Pagamento alla Consegna», flag
    //    contrassegno acceso con l'importo = totale dell'ordine;
    //  - già pagato, un pezzo → «Vendita Deluxy»;
    //  - già pagato, più pezzi → «Vendita Deluxy Multipla».
    // I pezzi sono le righe CON SKU (prodotti): la riga «Selections» senza
    // SKU (candelina, scritta) è una personalizzazione, non un secondo pezzo.
    const pezzi = righe.filter((r) => String(r?.sku ?? '').trim()).reduce((t, r) => t + (Number(r?.quantita) || 1), 0);
    const tipoVendita: 'contrassegno' | 'singola' | 'multipla' = contrassegno ? 'contrassegno' : pezzi > 1 ? 'multipla' : 'singola';
    const totale = Number(ordine?.totale);
    // ⭐ FASCIA ORARIA DEL CLIENTE (regola utente 01/09: «la fascia oraria la
    // hai già nell'ordine»). Su Shopify è un attributo tipo «16-20» o «08/12»:
    // si spezza in dalle/alle per il form. Un formato non riconosciuto si
    // scarta — una fascia inventata è peggio di una mancante.
    const { dalle: consegnaDalle, alle: consegnaAlle } = SalesService.fasciaInOrari(ordine?.consegna?.fascia);
    // Biglietto e note del cliente: esistono già sull'ordine, il form non deve
    // farli riscrivere a mano (regola utente 01/09).
    // ⚠️ La nota Shopify NON sta al primo livello: sta in `shopify.note`
    // (misurato sull'ordine 12851: il biglietto del cliente era lì, e
    // `ordine.note` tornava sempre undefined — il form usciva senza nota).
    const biglietto = String(ordine?.biglietto ?? '').trim() || undefined;
    const note = String(ordine?.shopify?.note ?? ordine?.note ?? '').trim() || undefined;

    return {
      disponibile: true, mittenteFirstName, mittenteLastName, contrassegno,
      tipoVendita, pezzi, totale: Number.isFinite(totale) ? totale : undefined,
      consegnaDalle, consegnaAlle, biglietto, note, prodotti, vendite, incompleto,
    };
  }

  /** L'ordine dietro una vendita, letto da Deluxy Orders. Best-effort: `null`
   *  quando non c'è o Orders non risponde — chi chiama non inventa. */
  /** Memoria breve della quota per (provincia, categoria): la corsa dello smistamento chiede la stessa coppia decine di volte. */
  private quotaCache = new Map<string, { quando: number; valore: { quota: number; regola: string; sconto: number } | null }>();

  /**
   * La quota al FORNITORE per provincia e categoria, chiesta a Orders
   * (`GET /api/v1/quota-fornitore?provincia=&categoria=`). Orders risponde con
   * `quota` = quanto va al fornitore in % e `regola` = da dove viene
   * («provincia+categoria», «provincia», «default»). Lo SCONTO della vendita è
   * il complemento (100 − quota), arrotondato ai centesimi. Con «default» si
   * torna null: la regola locale vale finché Orders non ha la sua per quella
   * provincia. Categoria: il NOME della categoria di piattaforma, minuscolo —
   * Orders confronta in minuscolo.
   */
  /**
   * ⭐ 07/09/2026 (regola utente: «prendi la % da CS con arrotondamento»).
   *
   * Il Customer Service non custodisce solo la percentuale: se gli si passa il
   * `prezzoPubblico` risponde col `prezzoFornitore` GIÀ ARROTONDATO a 5 o a 0, e lo
   * dichiara nel campo `arrotondamento`. La piattaforma chiedeva solo la quota e
   * rifaceva il conto per conto suo, fermandosi ai centesimi: 135 € − 30% le davano
   * 94,50 € dove il custode della regola dice **95 €**.
   *
   * È lo Standard §7: una regola economica non si ricopia, si legge dal proprietario.
   * Il ripiego locale (`prezzoAlPartner`) resta solo per quando il CS non risponde o
   * non manda il campo — e applica la stessa regola, scritta una volta sola.
   */
  private async quotaDaOrders(
    provinceId: string,
    categoryId: string | null | undefined,
    prezzoPubblico?: number | null,
  ): Promise<{ quota: number; regola: string; sconto: number; prezzoFornitore?: number | null } | null> {
    const [prov, cat] = await Promise.all([
      this.prisma.province.findUnique({ where: { id: provinceId }, select: { code: true } }),
      categoryId ? this.prisma.category.findUnique({ where: { id: categoryId }, select: { name: true } }) : Promise.resolve(null),
    ]);
    if (!prov?.code) return null;
    // ⭐ 06/09/2026 (regola utente, REGOLA DEL TERRITORIO in Orders): lo sconto dipende
    // dal fatto che in provincia ci sia un nostro partner — e questo lo sa SOLO la
    // piattaforma (PartnerProvince): glielo si dice (`conPartner=1|0`), non si lascia
    // indovinare a Orders. Un partner attivo che copre la provincia basta.
    // ⭐ 06/09 sera (regola utente): «Orders non deve guardare le province dei partner ma la
    // LISTA dei partner abilitati per provincia» — cioè le liste di priorità: una provincia è
    // «con partner» se ha almeno una lista con un partner attivo dentro. Chi copre tutta Italia
    // per area (Artista Locale, ECI…) non rende «con partner» una provincia dove non è in lista.
    // (06/09 sera) …e il partner in lista non dev'essere ESCLUSO DALLE PROPOSTE (i nostri di ripiego non contano).
    // ⭐ 06/09 sera (regola utente, con il flag «escluso dalle proposte» ora si può): «con partner» = in
    // provincia c'è almeno un partner ATTIVO con un servizio di VENDITA, non escluso — o una lista con
    // un partner così. I nostri di ripiego (Artista Locale, Deluxy Flowers, Cakedesignme) non contano.
    const conPartner = (await this.prisma.partner.count({ where: { active: true, deleted: false, esclusoDalleProposte: false, provinces: { some: { provinceId } }, services: { some: { serviceType: { pricingModel: 'VENDITA' } } } } })) > 0
      || (await this.prisma.priorityList.count({ where: { provinceId, entries: { some: { partner: { active: true, deleted: false, esclusoDalleProposte: false } } } } })) > 0;
    // Il prezzo entra nella chiave: la risposta contiene il prezzo al fornitore, che
    // dipende da quello pubblico. Senza, due prodotti diversi si scambierebbero il prezzo.
    const perPrezzo = prezzoPubblico != null && Number.isFinite(prezzoPubblico) && prezzoPubblico > 0 ? Math.round(prezzoPubblico * 100) : 0;
    const chiave = `${prov.code}|${(cat?.name ?? '').toLowerCase()}|${conPartner ? 'p' : 'np'}|${perPrezzo}`;
    const inCache = this.quotaCache.get(chiave);
    if (inCache && Date.now() - inCache.quando < 5 * 60_000) return inCache.valore;
    let valore: { quota: number; regola: string; sconto: number; prezzoFornitore?: number | null } | null = null;
    try {
      // ⭐ 06/09/2026 sera — NUOVA ARCHITETTURA VENDITE (regola utente): la casa dello sconto per
      // provincia è il CUSTOMER SERVICE (pagina Vendite), non più Orders, che gestisce solo l'ordine.
      // Si chiede prima a lui (`customerServiceUrl` / `customerServiceApiKey` in AppSetting o
      // CUSTOMER_SERVICE_URL / CUSTOMER_SERVICE_API_KEY); Orders resta il ripiego finché delega anche lui.
      const cfg = await this.prisma.appSetting.findMany({ where: { key: { in: ['ordersUrl', 'ordersApiKey', 'customerServiceUrl', 'customerServiceApiKey'] } } });
      const map = Object.fromEntries(cfg.map((r) => [r.key, r.value]));
      const urlCs = (map['customerServiceUrl'] || process.env.CUSTOMER_SERVICE_URL || '').replace(/\/+$/, '');
      const chiaveCs = map['customerServiceApiKey'] || process.env.CUSTOMER_SERVICE_API_KEY || '';
      const url = urlCs && chiaveCs ? urlCs : (map['ordersUrl'] || process.env.ORDERS_URL || '').replace(/\/+$/, '');
      const chiaveApi = urlCs && chiaveCs ? chiaveCs : (map['ordersApiKey'] || process.env.ORDERS_API_KEY || '');
      if (url && chiaveApi) {
        const q = new URLSearchParams({
          provincia: prov.code,
          conPartner: conPartner ? '1' : '0',
          ...(cat?.name ? { categoria: cat.name.toLowerCase() } : {}),
          // Col prezzo pubblico il custode risponde anche col prezzo al fornitore, arrotondato da lui.
          ...(perPrezzo ? { prezzoPubblico: String(perPrezzo / 100) } : {}),
        });
        const res = await fetch(`${url}/api/v1/quota-fornitore?${q}`, { headers: { 'x-api-key': chiaveApi } });
        if (res.ok) {
          const j: any = await res.json();
          const quota = Number(j?.quota);
          if (Number.isFinite(quota) && quota > 0 && quota < 100 && j?.regola && j.regola !== 'default') {
            const dalCustode = Number(j?.prezzoFornitore);
            valore = {
              quota,
              regola: String(j.regola),
              sconto: Math.round((100 - quota) * 100) / 100,
              prezzoFornitore: Number.isFinite(dalCustode) && dalCustode > 0 ? dalCustode : null,
            };
          }
        }
      }
    } catch (err) {
      this.logger.warn(`Quota da Orders non letta (${chiave}): ${(err as Error).message}`);
    }
    this.quotaCache.set(chiave, { quando: Date.now(), valore });
    return valore;
  }

  private async ordineDaOrders(externalOrderId: string | null | undefined): Promise<any | null> {
    const rif = (externalOrderId ?? '').trim();
    if (!rif) return null;
    const cfg = await this.prisma.appSetting.findMany({ where: { key: { in: ['ordersUrl', 'ordersApiKey'] } } });
    const map = Object.fromEntries(cfg.map((r) => [r.key, r.value]));
    const url = (map['ordersUrl'] || process.env.ORDERS_URL || '').replace(/\/+$/, '');
    const chiave = map['ordersApiKey'] || process.env.ORDERS_API_KEY || '';
    if (!url || !chiave) return null;
    try {
      const res = await fetch(`${url}/api/v1/ordini/${encodeURIComponent(rif)}?annullati=inclusi`, {
        headers: { 'x-api-key': chiave },
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  /** «16-20», «08/12», «16:30-20» → orari del form. Formato ignoto = niente:
   *  una fascia inventata è peggio di una mancante. */
  /**
   * ⭐ 05/09/2026 (regola utente): «devi confrontare l'ORARIO DI CONSEGNA del
   * prodotto con l'orario di apertura del partner, non con l'orario di arrivo
   * della vendita».
   *
   * La finestra in cui la consegna deve avvenire: il giorno, e la fascia
   * chiesta dal cliente sull'ordine (8–12, 12–16, 16–20). Senza fascia resta
   * il solo giorno, e allora la domanda giusta è «quel giorno è aperto?».
   */
  private static fasciaInOrari(fascia: unknown): { dalle?: string; alle?: string } {
    const raw = String(fascia ?? '').trim();
    const m = raw.match(/^(\d{1,2})(?:[:.](\d{2}))?\s*[-\/–]\s*(\d{1,2})(?:[:.](\d{2}))?$/);
    if (!m) return {};
    const ora = (h?: string, min?: string) => {
      if (!h) return undefined;
      const hh = Number(h);
      if (!Number.isFinite(hh) || hh > 24) return undefined;
      return `${String(hh === 24 ? 0 : hh).padStart(2, '0')}:${min ?? '00'}`;
    };
    return { dalle: ora(m[1], m[2]), alle: ora(m[3], m[4]) };
  }

  /**
   * L'ufficio PRENDE IN MANO la vendita (bottone «Inserisci», 31/08/2026):
   * ferma il giro automatico — se era proposta a un partner, la proposta
   * decade (accetta/rifiuta valgono solo su PROPOSTA) — e la consegna si
   * inserisce a mano dal form. La vendita resta «da gestire» finché la
   * consegna non nasce: chiuderla PRIMA direbbe il falso, e chi abbandona il
   * form a metà la ritroverebbe dove deve stare.
   */
  /**
   * ⭐ 04/09/2026 (regola utente): «CHI ABBIAMO USATO, E A QUANTO».
   *
   * Per una vendita ferma, lo storico REALE di quel prodotto in quella
   * provincia: le vendite ACCETTATE, raggruppate per partner, con quante
   * volte, i prezzi e l'ultima volta.
   *
   * ⚠️ Tre scelte che contano:
   *  - **niente finestra che taglia**: si legge TUTTO lo storico e le righe
   *    più vecchie di 12 mesi si marcano `vecchia` — un taglio silenzioso
   *    farebbe sparire l'unico precedente di un prodotto che gira poco
   *    ([[trappola-censimento-troncato]]);
   *  - **l'allargamento si dichiara**: se per quella coppia non c'è niente si
   *    guarda lo stesso prodotto nelle ALTRE province, poi la stessa categoria
   *    in QUELLA provincia, e la risposta dice quale dei tre sta leggendo
   *    ([[trappola-cercare-non-e-affermare]]);
   *  - **è roba d'ufficio**: nomi e prezzi di altri partner. Il controller la
   *    apre solo ad ADMIN e OPERATION, mai al partner.
   */
  async storicoPartner(id: string) {
    const vendita = await this.prisma.sale.findUnique({
      where: { id },
      select: {
        productId: true, provinceId: true, productName: true,
        product: { select: { name: true, categoryId: true, type: true } },
        province: { select: { code: true, name: true } },
      },
    });
    if (!vendita) throw new NotFoundException('Vendita non trovata');
    if (!vendita.productId) {
      return { base: 'nessuna' as const, regola: null, righe: [], prodotto: vendita.productName, provincia: vendita.province?.code ?? null };
    }

    const comune = { status: SaleStatus.ACCETTATA, partnerId: { not: null } };
    const select = {
      partnerId: true, amount: true, discountPercent: true, createdAt: true,
      externalOrderNumber: true, provinceId: true,
      // ⭐ 06/09 (regola utente): nell'ultima volta si dice anche COSA (prodotto, variante) e QUANDO si è consegnato.
      variantName: true, productName: true, deliveryDate: true, product: { select: { name: true } },
    };
    // \u2b50 07/09/2026 (regola utente: \u00abstesso prodotto, altre province non \u00e8 un confronto
    // che ci interessa; fai confronto anche per nomi somiglianti nella stessa provincia\u00bb).
    //
    // La cascata guarda SEMPRE la stessa provincia \u2014 \u00e8 l\u00ec che si deve consegnare, e chi ha
    // fatto quel dolce ad Asti non aiuta a sceglierlo a Milano. Al posto delle altre
    // province c\u00e8 ora il NOME SOMIGLIANTE: \u00abTorta Chantilly\u00bb trova \u00abChantilly ai frutti
    // di bosco\u00bb dello stesso territorio, che \u00e8 il confronto che serve davvero.
    //
    //  1) lo stesso prodotto, qui;
    //  2) i prodotti col NOME SOMIGLIANTE, qui;
    //  3) la stessa categoria, qui.
    let base: 'coppia' | 'nome-simile' | 'categoria' | 'nessuna' = 'coppia';
    let vendite = await this.prisma.sale.findMany({
      where: { ...comune, productId: vendita.productId, provinceId: vendita.provinceId },
      select, orderBy: { createdAt: 'desc' },
    });
    if (!vendite.length) {
      // Le parole che contano del nome: si scartano le corte e quelle di servizio,
      // che da sole pescherebbero mezzo catalogo.
      const SCARTA = new Set(['con', 'del', 'della', 'delle', 'dei', 'degli', 'per', 'and', 'the', 'di', 'da', 'il', 'la', 'le', 'lo', 'un', 'una', 'gli', 'a', 'e']);
      const parole = (vendita.product?.name ?? vendita.productName ?? '')
        .toLowerCase()
        .split(/[^a-z\u00e0\u00e8\u00e9\u00ec\u00f2\u00f9]+/)
        .filter((w) => w.length >= 4 && !SCARTA.has(w));
      if (parole.length) {
        base = 'nome-simile';
        vendite = await this.prisma.sale.findMany({
          where: {
            ...comune,
            provinceId: vendita.provinceId,
            productId: { not: vendita.productId },
            OR: parole.map((w) => ({ product: { name: { contains: w, mode: 'insensitive' as const } } })),
          },
          select, orderBy: { createdAt: 'desc' },
        });
      }
    }
    if (!vendite.length && vendita.product?.categoryId) {
      base = 'categoria';
      vendite = await this.prisma.sale.findMany({
        where: { ...comune, provinceId: vendita.provinceId, product: { categoryId: vendita.product.categoryId } },
        select, orderBy: { createdAt: 'desc' },
      });
    }
    if (!vendite.length) base = 'nessuna';

    const perPartner = new Map<string, typeof vendite>();
    for (const v of vendite) perPartner.set(v.partnerId!, [...(perPartner.get(v.partnerId!) ?? []), v]);

    const [partner, province, regola, esclusi] = await Promise.all([
      this.prisma.partner.findMany({
        where: { id: { in: [...perPartner.keys()] } },
        select: { id: true, insegna: true, active: true, provinces: { select: { provinceId: true } } },
      }),
      this.prisma.province.findMany({
        where: { id: { in: [...new Set(vendite.map((v) => v.provinceId))] } },
        select: { id: true, code: true },
      }),
      this.prisma.productReconciliation.findFirst({
        where: { productId: vendita.productId, provinceId: vendita.provinceId },
        select: { partnerId: true, price: true, discountPercent: true, status: true },
      }),
      this.prisma.appSetting.findUnique({ where: { key: 'riconciliazioniPartnerEsclusi' } }),
    ]);
    const perId = new Map(partner.map((p) => [p.id, p]));
    const sigla = new Map(province.map((p) => [p.id, p.code]));
    const listaEsclusi = (esclusi?.value ?? '').split(',').map((t) => t.trim()).filter(Boolean);
    const dodiciMesiFa = new Date();
    dodiciMesiFa.setMonth(dodiciMesiFa.getMonth() - 12);

    const arrotonda = (n: number) => Math.round(n * 100) / 100;
    const moda = (valori: number[]) => {
      const conta = new Map<number, number>();
      for (const v of valori) conta.set(arrotonda(v), (conta.get(arrotonda(v)) ?? 0) + 1);
      let migliore = arrotonda(valori[0] ?? 0);
      let max = 0;
      for (const [v, n] of conta) if (n > max || (n === max && v > migliore)) { max = n; migliore = v; }
      return migliore;
    };

    const righe = [...perPartner.entries()].map(([partnerId, lista]) => {
      const p = perId.get(partnerId);
      const importi = lista.map((v) => v.amount);
      const prezzoModa = moda(importi);
      const scontoModa = moda(lista.map((v) => v.discountPercent));
      const ultima = lista[0]; // già ordinate dal più recente
      return {
        partnerId,
        insegna: p?.insegna ?? '(partner sconosciuto)',
        attivo: p?.active ?? false,
        operaInProvincia: (p?.provinces ?? []).some((x) => x.provinceId === vendita.provinceId),
        escluso: listaEsclusi.includes(partnerId),
        vendite: lista.length,
        prezzoMin: arrotonda(Math.min(...importi)),
        prezzoMax: arrotonda(Math.max(...importi)),
        prezzoModa,
        scontoModa,
        nettoModa: arrotonda(prezzoModa * (1 - scontoModa / 100)),
        ultimaData: ultima.createdAt,
        ultimoOrdine: ultima.externalOrderNumber,
        ultimoProdotto: (ultima as any).product?.name ?? (ultima as any).productName ?? null,
        ultimaVariante: (ultima as any).variantName ?? null,
        ultimaConsegna: (ultima as any).deliveryDate ?? null,
        ultimaProvincia: sigla.get(ultima.provinceId) ?? null,
        // Più vecchia di un anno: si mostra, ma segnalata. I prezzi invecchiano.
        vecchia: ultima.createdAt < dodiciMesiFa,
      };
    }).sort((x, y) => y.vendite - x.vendite || y.ultimaData.getTime() - x.ultimaData.getTime());

    return {
      base,
      prodotto: vendita.product?.name ?? vendita.productName,
      provincia: vendita.province?.code ?? null,
      tipoProdotto: vendita.product?.type ?? null,
      considerate: vendite.length,
      regola: regola ? { ...regola, insegna: perId.get(regola.partnerId)?.insegna ?? (await this.prisma.partner.findUnique({ where: { id: regola.partnerId }, select: { insegna: true } }))?.insegna ?? null } : null,
      righe,
    };
  }

  /**
   * ⭐ 04/09/2026 (regola utente): «sotto indirizzo, un bottone RICONCILIA che
   * cerca per quell'indirizzo possibili consegne».
   *
   * Le consegne di tipo VENDITA fatte allo stesso indirizzo: sono quelle nate
   * a mano, che con ogni probabilità sono già questa vendita, entrata due
   * volte. Si confronta l'indirizzo NORMALIZZATO (minuscole, senza
   * punteggiatura, senza le parole di via/piazza) e si tengono le consegne in
   * una finestra di ±10 giorni dalla data della vendita quando c'è.
   *
   * ⚠️ Si PROPONE soltanto: nessuna corrispondenza automatica. Due consegne
   * allo stesso indirizzo in giorni diversi sono cose diverse, e il pop-up le
   * mostra tutte perché a decidere sia una persona.
   */
  async consegneAllIndirizzo(id: string) {
    const vendita = await this.prisma.sale.findUnique({
      where: { id },
      select: { recipientAddress: true, deliveryDate: true, provinceId: true, deliveryId: true, externalOrderNumber: true, externalOrderId: true },
    });
    if (!vendita) throw new NotFoundException('Vendita non trovata');
    const chiave = SalesService.chiaveIndirizzo(vendita.recipientAddress);

    // ⭐ 05/09/2026 — PRIMA IL DDT. Sul DDT della consegna si scrive il NUMERO
    // D'ORDINE: e' il legame piu' forte che abbiamo, molto piu' dell'indirizzo,
    // e non dipende da come Shopify ha scritto la via. Nel caso 12847 la
    // ricerca per indirizzo trovava zero e le due consegne gia' fatte
    // (#100788 e #100789, stesso giorno, stesso indirizzo, DDT 12847)
    // restavano invisibili. Si cerca in OGNI stato, storico compreso, e senza
    // vincolo di servizio: un DDT uguale e' gia' una risposta.
    // Il DDT porta il NUMERO d'ordine; per le consegne piu' vecchie puo'
    // portare l'id di Orders. Si cercano tutti e due: costa niente e copre le
    // due popolazioni senza chiedere a chi guarda di sapere quale sia quale.
    const rifDdt = [vendita.externalOrderNumber, vendita.externalOrderId]
      .map((x) => (x ?? '').trim())
      .filter(Boolean);
    // ⭐ 08/09/2026 (regola utente: «nascondi le annullate»). Una consegna annullata
    // non è un candidato: riconciliarci una vendita vorrebbe dire dichiararla evasa da
    // un lavoro che nessuno ha fatto. Sull'ordine 12883 se ne vedevano tre — due vere e
    // una annullata — e le tre righe si somigliavano tutte.
    const NON_ANNULLATE = { status: { notIn: [DeliveryStatus.CANCELLED, DeliveryStatus.NOT_ACCEPTED] } };
    const perDdt = rifDdt.length
      ? await this.prisma.delivery.findMany({
          where: { deletedAt: null, ddtNumber: { in: rifDdt }, ...NON_ANNULLATE },
          select: {
            id: true, code: true, date: true, status: true, recipientAddress: true,
            ddtNumber: true, price: true,
            partner: { select: { insegna: true } },
            serviceType: { select: { name: true } },
          },
          orderBy: { date: 'desc' },
          take: 50,
        })
      : [];

    if (!chiave && !perDdt.length) {
      return { indirizzo: vendita.recipientAddress, consegne: [], motivo: 'senza-indirizzo' as const };
    }

    const quando = vendita.deliveryDate ?? null;
    const da = quando ? new Date(quando.getTime() - 10 * 86400000) : null;
    const a = quando ? new Date(quando.getTime() + 10 * 86400000) : null;
    const candidate = chiave ? await this.prisma.delivery.findMany({
      where: {
        deletedAt: null,
        provinceId: vendita.provinceId,
        ...NON_ANNULLATE,
        ...(da && a ? { date: { gte: da, lte: a } } : {}),
        // Solo i servizi di VENDITA, come chiesto.
        serviceType: { name: { contains: 'vendita', mode: 'insensitive' } },
      },
      select: {
        id: true, code: true, date: true, status: true, recipientAddress: true,
        ddtNumber: true, price: true,
        partner: { select: { insegna: true } },
        serviceType: { select: { name: true } },
      },
      orderBy: { date: 'desc' },
      take: 200,
    }) : [];
    const perIndirizzo = candidate.filter((d) => SalesService.chiaveIndirizzo(d.recipientAddress) === chiave);

    // Le due strade si uniscono senza doppioni; il DDT viene prima perche' e'
    // il segnale piu' forte, e OGNI riga dice da che cosa e' stata trovata:
    // un elenco che non spiega perche' e' li' non si puo' verificare.
    const visti = new Set<string>();
    const consegne = [
      ...perDdt.map((d) => ({ d, motivo: 'ddt' as const })),
      ...perIndirizzo.map((d) => ({ d, motivo: 'indirizzo' as const })),
    ]
      .filter(({ d }) => (visti.has(d.id) ? false : (visti.add(d.id), true)))
      .map(({ d, motivo }) => ({
        id: d.id, code: d.code, date: d.date, status: d.status,
        indirizzo: d.recipientAddress, ddt: d.ddtNumber, prezzo: d.price,
        partner: d.partner?.insegna ?? null, servizio: d.serviceType?.name ?? null,
        motivo,
      }));
    return { indirizzo: vendita.recipientAddress, giaCollegata: vendita.deliveryId, consegne };
  }

  /**
   * L'indirizzo ridotto all'osso per confrontarlo: minuscole, via/piazza e
   * punteggiatura via, spazi normalizzati. «Via Roberto Rossellini, 51 -
   * 00137 Roma» e «via roberto rossellini 51, 00137, Roma RM» diventano la
   * stessa chiave. Non è geocodifica: è un confronto onesto fra stringhe, e
   * infatti serve a PROPORRE, non a decidere.
   */
  private static chiaveIndirizzo(indirizzo: string | null | undefined): string | null {
    let grezzo = (indirizzo ?? '').trim().toLowerCase();
    if (!grezzo) return null;
    // ⚠️ 05/09/2026 — CASO 12847. Sull'ordine di Shopify il TESTO DEL BIGLIETTO
    // finisce dentro l'indirizzo: «Via Principe Eugenio 12, Testo biglietto:
    // Caro Victor, un brindisi alla nuova vita lavorativa!… , 20155, Milano,
    // MI, IT». Con la dedica dentro, la chiave non somigliava piu' a niente e
    // il confronto con la consegna vera («Via Principe Eugenio, 12, 20155
    // Milano MI») dava ZERO — mentre le consegne c'erano, due, con lo stesso
    // DDT. Il biglietto si taglia via: e' un messaggio, non un indirizzo.
    // ⚠️ Si taglia FINO AL CAP, non fino in fondo: dopo la dedica torna la
    // parte vera dell'indirizzo (CAP, citta', provincia), e buttarla via
    // farebbe fallire il confronto lo stesso, solo per un altro motivo.
    grezzo = grezzo.replace(/(testo\s*)?bigliett[oi]\s*:[\s\S]*?(?=\b\d{5}\b)/, ' ');
    // Se dopo la dedica non c'era nessun CAP, allora la coda e' tutta dedica.
    grezzo = grezzo.replace(/(testo\s*)?bigliett[oi]\s*:[\s\S]*$/, ' ').trim();
    const pulito = grezzo
      .replace(/\b(via|viale|piazza|piazzale|corso|largo|vicolo|strada|localita|località|str\.|v\.le|p\.zza)\b/g, ' ')
      .replace(/\b(italia|italy)\b/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      // La sigla del paese in coda c'e' su una fonte e non sull'altra
      // (Shopify la scrive, la consegna no): non e' una differenza vera.
      .replace(/\s+(it|ita)$/, '');
    return pulito.length >= 6 ? pulito : null;
  }

  /**
   * ⭐ 04/09/2026 (regola utente): la vendita è la stessa cosa di una consegna
   * già fatta. Allora: la vendita va in STORICO (accettata, collegata a quella
   * consegna) e la consegna prende NEL DDT il riferimento della vendita.
   *
   * ⚠️ Non si crea niente e non si tocca il prezzo: si dichiara che le due
   * righe sono lo stesso fatto. Il DDT non si sovrascrive se c'è già: si
   * aggiunge, perché quel numero è la prova di come è viaggiata la merce.
   */
  async riconciliaConConsegna(id: string, deliveryId: string, user: JwtUser) {
    const vendita = await this.prisma.sale.findUnique({
      where: { id },
      select: { id: true, status: true, deliveryId: true, externalOrderNumber: true, externalOrderId: true, brand: true, partnerId: true },
    });
    if (!vendita) throw new NotFoundException('Vendita non trovata');
    if (vendita.deliveryId) throw new BadRequestException('Questa vendita è già collegata a una consegna.');
    const consegna = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
      select: { id: true, code: true, ddtNumber: true, ddtBrand: true, partnerId: true },
    });
    if (!consegna) throw new NotFoundException('Consegna non trovata');
    const giaPresa = await this.prisma.sale.findFirst({ where: { deliveryId, NOT: { id } }, select: { externalOrderNumber: true } });
    if (giaPresa) {
      throw new BadRequestException(`Quella consegna è già di un'altra vendita (#${giaPresa.externalOrderNumber ?? '—'}).`);
    }

    // Il riferimento della vendita nel DDT: il numero d'ordine, che è quello
    // che una persona riconosce; se manca, l'id esterno.
    const riferimento = (vendita.externalOrderNumber ?? vendita.externalOrderId ?? vendita.id).trim();
    const ddt = consegna.ddtNumber?.trim();
    const nuovoDdt = ddt
      ? (ddt.split('/').map((t) => t.trim()).includes(riferimento) ? ddt : `${ddt} / ${riferimento}`)
      : riferimento;

    const [aggiornata] = await this.prisma.$transaction([
      this.prisma.sale.update({
        where: { id },
        data: {
          deliveryId,
          status: SaleStatus.ACCETTATA,
          historyAt: new Date(),
          partnerId: vendita.partnerId ?? consegna.partnerId ?? null,
          assignmentReason: `riconciliata con la consegna #${consegna.code} (stesso indirizzo)`,
        },
        include: { partner: { select: { id: true, insegna: true } }, province: true },
      }),
      this.prisma.delivery.update({
        where: { id: deliveryId },
        data: {
          ddtNumber: nuovoDdt,
          ddtBrand: consegna.ddtBrand ?? vendita.brand ?? null,
          logs: { create: { type: 'note', userId: user.sub ?? null,
            message: `Riconciliata con la vendita ${riferimento}: riferimento aggiunto al DDT` } },
        },
      }),
    ]);
    await this.registra(id, 'stato', `Riconciliata con la consegna #${consegna.code}: vendita in storico, riferimento ${riferimento} nel DDT`, user);
    return aggiornata;
  }

  /**
   * ⭐ 04/09/2026 (regola utente): l'ufficio PROPONE la vendita a un partner
   * scelto a mano (di solito dallo storico qui sopra). Non è un'accettazione:
   * la palla resta al partner, che può rifiutare come sempre.
   */
  async proponiAPartner(id: string, partnerId: string, user: JwtUser) {
    const vendita = await this.prisma.sale.findUnique({ where: { id }, select: { status: true, partnerId: true, externalOrderId: true } });
    if (!vendita) throw new NotFoundException('Vendita non trovata');
    if (![SaleStatus.PROPOSTA, SaleStatus.DA_GESTIRE].includes(vendita.status as SaleStatus)) {
      throw new BadRequestException(`La vendita non è aperta (stato: ${vendita.status}).`);
    }
    await this.assertOrdineConforme(vendita.externalOrderId);
    const partner = await this.prisma.partner.findUnique({ where: { id: partnerId }, select: { insegna: true, active: true } });
    if (!partner) throw new NotFoundException('Partner non trovato');
    if (!partner.active) throw new BadRequestException('Il partner non è attivo.');

    const aggiornata = await this.prisma.sale.update({
      where: { id },
      data: {
        partnerId,
        status: SaleStatus.PROPOSTA,
        historyAt: null,
        assignmentReason: "scelto a mano dall'ufficio sullo storico",
      },
      include: { product: { select: { id: true, name: true } }, partner: { select: { id: true, insegna: true } }, province: true },
    });
    await this.registra(id, 'stato', `Proposta a ${partner.insegna} dall'ufficio (scelta a mano sullo storico)`, user);
    await this.avvisaProposta(aggiornata);
    return aggiornata;
  }

  /**
   * ⭐ 07/09/2026 (regola utente) — IL PREZZO CONCORDATO di una vendita a preventivo.
   * Due posti, in ordine: la RICONCILIAZIONE accettata per (prodotto, variante, provincia) —
   * che è il patto scritto — e il listino `PP-*` del partner. Torna null se non c'è.
   */
  private async prezzoConcordato(vendita: { productId: string | null; productVariantId: string | null; provinceId: string; partnerId: string | null }): Promise<number | null> {
    if (!vendita.productId) return null;
    const ric = await this.prisma.productReconciliation.findFirst({
      where: { productId: vendita.productId, provinceId: vendita.provinceId, productVariantId: vendita.productVariantId ?? null, status: 'accettata' },
      select: { partnerPrice: true, price: true, discountPercent: true },
    });
    if (ric) return ric.partnerPrice ?? Math.round(ric.price * (1 - ric.discountPercent / 100) * 100) / 100;
    if (!vendita.partnerId) return null;
    const prodotto = await this.prisma.product.findUnique({ where: { id: vendita.productId }, select: { id: true, sku: true, type: true, partnerId: true, categoryId: true, visibleToOtherPartners: true, tipologiaVendita: true } });
    if (!prodotto) return null;
    const variante = vendita.productVariantId
      ? await this.prisma.productVariant.findUnique({ where: { id: vendita.productVariantId }, select: { sku: true } })
      : null;
    const preventivi = await this.preventiviDelProdotto(prodotto as unknown as ProdottoDaSmistare, variante?.sku ?? null);
    return preventivi.get(vendita.partnerId) ?? null;
  }

  /**
   * ⭐ 07/09/2026 (regola utente): «per un prodotto a preventivo, prima di poter essere
   * inserito va salvato il preventivo; salvarlo genera automaticamente una riconciliazione che
   * permetterà per i prossimi ordini di mandare il prodotto in automatico».
   *
   * Quindi qui succedono tre cose insieme, ed è giusto che siano una sola mossa:
   *  1. la vendita prende il partner e il prezzo concordato (e lo sconto che ne deriva);
   *  2. nasce — o si aggiorna — una RICONCILIAZIONE ACCETTATA per prodotto, variante e
   *     provincia: da lì in poi l'ordine uguale si smista da solo, a quel prezzo;
   *  3. il registro dice chi ha raccolto il preventivo e quando.
   */
  async salvaPreventivo(id: string, body: { partnerId?: string; prezzo: number }, user: JwtUser) {
    const vendita = await this.prisma.sale.findUnique({
      where: { id },
      include: { product: { select: { name: true, tipologiaVendita: true } } },
    });
    if (!vendita) throw new NotFoundException('Vendita non trovata');
    if (!vendita.productId || !vendita.provinceId) {
      throw new BadRequestException('La vendita non ha un prodotto a catalogo o una provincia: il preventivo non si può legare a niente.');
    }
    const prezzo = Number(body?.prezzo);
    if (!Number.isFinite(prezzo) || prezzo <= 0) throw new BadRequestException('Il preventivo è un prezzo maggiore di zero.');
    const partnerId = body?.partnerId || vendita.partnerId;
    if (!partnerId) throw new BadRequestException('Serve il partner che ha dato il preventivo.');
    const partner = await this.prisma.partner.findUnique({
      where: { id: partnerId },
      select: { insegna: true, active: true, deleted: true, esclusoDalleProposte: true, provinces: { where: { provinceId: vendita.provinceId }, select: { provinceId: true } } },
    });
    if (!partner || partner.deleted) throw new NotFoundException('Partner non trovato.');
    if (!partner.active) throw new BadRequestException('Il partner non è attivo.');
    if (!partner.provinces.length) throw new BadRequestException(`${partner.insegna} non lavora in questa provincia.`);

    const importo = vendita.amount ?? 0;
    const sconto = importo > 0 ? SalesService.quotaPerDare(importo, prezzo) : 0;

    // La riconciliazione: il patto che vale da domani.
    const gia = await this.prisma.productReconciliation.findFirst({
      where: { productId: vendita.productId, provinceId: vendita.provinceId, productVariantId: vendita.productVariantId ?? null },
      select: { id: true },
    });
    const datiRic = {
      partnerId,
      partnerPrice: prezzo,
      price: importo,
      discountPercent: sconto,
      salesCount: 1,
      lastSaleId: id,
      lastOrderNumber: vendita.externalOrderNumber,
      trigger: 'preventivo',
      status: 'accettata',
      decidedAt: new Date(),
      decidedBy: user.email ?? user.sub ?? null,
    };
    if (gia) await this.prisma.productReconciliation.update({ where: { id: gia.id }, data: datiRic });
    else await this.prisma.productReconciliation.create({ data: { productId: vendita.productId, productVariantId: vendita.productVariantId ?? null, provinceId: vendita.provinceId, stats: JSON.stringify([]), ...datiRic } });

    const aggiornata = await this.prisma.sale.update({
      where: { id },
      data: {
        partnerId,
        discountPercent: sconto,
        status: SaleStatus.PROPOSTA,
        assignmentReason: [vendita.assignmentReason, `preventivo di ${partner.insegna}: ${prezzo} €`].filter(Boolean).join(' · '),
      },
      include: { partner: { select: { id: true, insegna: true } } },
    });
    await this.registra(id, 'stato', `Preventivo salvato: ${partner.insegna} fa «${vendita.product?.name ?? 'il prodotto'}» a ${prezzo} € — riconciliazione accettata per le prossime volte`, user);
    await this.avvisaProposta(aggiornata as any);
    return { ok: true, prezzo, partner: partner.insegna, vendita: aggiornata };
  }

  async prendiInMano(id: string, user?: JwtUser) {
    const vendita = await this.prisma.sale.findUnique({ where: { id }, include: { product: { select: { name: true, tipologiaVendita: true } } } });
    if (!vendita) throw new NotFoundException('Vendita non trovata');
    // ⭐ 07/09/2026 (regola utente): un prodotto A PREVENTIVO non si inserisce finché il
    // preventivo non è stato raccolto. Non è una formalità: senza il prezzo concordato la
    // consegna nascerebbe con un costo inventato, e il partner lo scoprirebbe a cose fatte.
    if (vendita.product?.tipologiaVendita === 'preventivo' && !(await this.prezzoConcordato(vendita))) {
      throw new BadRequestException(
        `«${vendita.product?.name ?? 'Il prodotto'}» va a preventivo: prima salva il preventivo del partner (bottone «Salva preventivo»), poi si può inserire.`,
      );
    }
    if (![SaleStatus.PROPOSTA, SaleStatus.DA_GESTIRE].includes(vendita.status as SaleStatus)) {
      throw new BadRequestException(`La vendita non è aperta (stato: ${vendita.status}).`);
    }
    const presa = await this.prisma.sale.update({
      where: { id },
      data: {
        status: SaleStatus.DA_GESTIRE,
        historyAt: null,
        // Idempotente: il secondo click non deve accodare il motivo un'altra
        // volta (visto in pagina il 31/08: «presa in mano · presa in mano»).
        assignmentReason: vendita.assignmentReason?.includes('inserimento manuale')
          ? vendita.assignmentReason
          : [vendita.assignmentReason, "presa in mano dall'ufficio: inserimento manuale"]
              .filter(Boolean).join(' · '),
      },
      include: { product: { select: { id: true, name: true } }, province: true },
    });
    await this.registra(id, 'stato', "Presa in mano dall'ufficio: inserimento manuale (da gestire)", user);
    return presa;
  }

  /**
   * Chiude il giro dell'inserimento manuale: la consegna è nata dal form,
   * la vendita la aggancia e passa in storico (accettata). Il partner della
   * vendita diventa quello della CONSEGNA: è lì che l'ufficio ha deciso.
   */
  async collegaConsegna(id: string, deliveryId: string, user?: JwtUser) {
    const vendita = await this.prisma.sale.findUnique({ where: { id } });
    if (!vendita) throw new NotFoundException('Vendita non trovata');
    if (!deliveryId) throw new BadRequestException('deliveryId obbligatorio');
    const consegna = await this.prisma.delivery.findUnique({
      where: { id: deliveryId }, select: { id: true, partnerId: true, code: true },
    });
    if (!consegna) throw new BadRequestException('Consegna inesistente');
    if (vendita.deliveryId && vendita.deliveryId !== deliveryId) {
      throw new BadRequestException('La vendita è già collegata a un\'altra consegna');
    }
    const agg = await this.prisma.sale.update({
      where: { id },
      data: {
        status: SaleStatus.ACCETTATA,
        historyAt: new Date(),
        deliveryId,
        partnerId: consegna.partnerId ?? vendita.partnerId,
      },
    });
    await this.registra(id, 'stato', `Consegna #${consegna.code} inserita dall'ufficio e collegata: vendita accettata (storico)`, user);
    return agg;
  }

  /**
   * ⭐ 03/09 (regola utente): l'ufficio MODIFICA la vendita dal bottone in
   * lista. Campi a lista chiusa — i DATI della vendita, non il suo giro:
   * lo stato ha le sue azioni (accetta/rifiuta/inserisci), l'aggancio alla
   * consegna il suo endpoint.
   */
  async modifica(id: string, body: Record<string, unknown>, user?: JwtUser) {
    const vendita = await this.prisma.sale.findUnique({ where: { id } });
    if (!vendita) throw new NotFoundException('Vendita non trovata');
    const data: Record<string, unknown> = {};
    for (const campo of ['productName', 'variantName', 'brand', 'recipientFirstName', 'recipientLastName', 'recipientAddress', 'recipientPhone'] as const) {
      if (typeof body[campo] === 'string') data[campo] = (body[campo] as string).trim() || null;
    }
    if (body.amount !== undefined) {
      const n = Number(body.amount);
      if (!Number.isFinite(n) || n < 0) throw new BadRequestException('Importo non valido');
      data.amount = Math.round(n * 100) / 100;
    }
    if (body.deliveryDate !== undefined) {
      data.deliveryDate = body.deliveryDate ? new Date(String(body.deliveryDate)) : null;
    }
    if (typeof body.provinceId === 'string' && body.provinceId) {
      const prov = await this.prisma.province.findUnique({ where: { id: body.provinceId }, select: { id: true } });
      if (!prov) throw new BadRequestException('Provincia inesistente');
      data.provinceId = prov.id;
    }
    if (!Object.keys(data).length) throw new BadRequestException('Niente da modificare');
    const agg = await this.prisma.sale.update({ where: { id }, data });
    // Il registro dice COSA è cambiato, prima → dopo, campo per campo.
    const mostra = (v: unknown) => v instanceof Date ? v.toISOString().slice(0, 10) : (v == null || v === '' ? '—' : String(v));
    const cambi = Object.keys(data)
      .filter((k) => mostra((vendita as any)[k]) !== mostra(data[k]))
      .map((k) => `${k}: ${mostra((vendita as any)[k])} → ${mostra(data[k])}`);
    if (cambi.length) await this.registra(id, 'modifica', `Modificata dall'ufficio · ${cambi.join(' · ')}`, user);
    return agg;
  }

  /**
   * Il partner rifiuta: la vendita passa al prossimo della lista, e chi ha
   * rifiutato non la rivede piu'. Se non resta nessuno torna «da gestire».
   */
  /**
   * ⭐ 07/09/2026 (regola utente: «se rifiuta va al secondo partner in lista») — il RIFIUTO:
   *  - il PARTNER rifiuta → la vendita passa al PROSSIMO della lista di priorità, con gli
   *    stessi controlli della prima proposta (provincia, apertura, variante, minimo, raggio);
   *    chi ha rifiutato non la rivede più. Solo quando la lista è finita torna all'UFFICIO
   *    da inserire (da gestire) — e il motivo lo dice.
   *  - ADMIN/OPERATION rifiutano → la vendita chiude in STORICO (non accettata).
   * In ogni caso una riga nel registro dice chi e perché.
   * ⚠️ Sostituisce la regola del 04/09/2026, per cui il rifiuto del partner riportava
   * SEMPRE la vendita all'ufficio senza provare il secondo della lista.
   */
  async rifiuta(id: string, user: JwtUser) {
    const vendita = await this.prisma.sale.findUnique({
      where: { id },
      include: { partner: { select: { id: true, insegna: true } } },
    });
    if (!vendita) throw new NotFoundException('Vendita non trovata');
    this.assertPuoRispondere(vendita, user);
    if (![SaleStatus.PROPOSTA, SaleStatus.DA_GESTIRE].includes(vendita.status as SaleStatus)) {
      throw new BadRequestException(`La vendita non è aperta (stato: ${vendita.status}).`);
    }

    let rifiutati: string[] = [];
    try { rifiutati = JSON.parse(vendita.refusedPartnerIds ?? '[]'); } catch { rifiutati = []; }
    if (vendita.partnerId && !rifiutati.includes(vendita.partnerId)) rifiutati.push(vendita.partnerId);

    if (user.role === Role.PARTNER) {
      const nome = vendita.partner?.insegna ?? 'partner';

      // Il PROSSIMO della lista, cercato con lo stesso codice della prima proposta: chi ha
      // già rifiutato è escluso, e i controlli (provincia, apertura, variante, minimo,
      // raggio, non escluso dalle proposte) valgono uguali. Se qualcosa non si può leggere —
      // il prodotto, la provincia, l'ordine in Orders — non si tira a indovinare: si torna
      // all'ufficio, che è il comportamento sicuro.
      let prossimo: Candidato | null = null;
      const prodotto = vendita.productId
        ? await this.prisma.product.findUnique({ where: { id: vendita.productId } })
        : null;
      if (prodotto && vendita.provinceId) {
        const ordine = await this.ordineDaOrders(vendita.externalOrderId).catch(() => null);
        const f = SalesService.fasciaInOrari(ordine?.consegna?.fascia);
        const finestra: FinestraConsegna = {
          giorno: vendita.deliveryDate ?? new Date(),
          dalle: f.dalle,
          alle: f.alle,
          variantId: (vendita as any).productVariantId ?? null,
        };
        prossimo = await this.scegliPartner(prodotto as unknown as ProdottoDaSmistare, vendita.provinceId, finestra, rifiutati)
          .catch(() => null);
      }

      if (prossimo) {
        const dopo = await this.prisma.partner.findUnique({ where: { id: prossimo.partnerId }, select: { insegna: true } });
        const agg = await this.prisma.sale.update({
          where: { id },
          data: {
            partnerId: prossimo.partnerId,
            status: SaleStatus.PROPOSTA,
            historyAt: null,
            refusedPartnerIds: JSON.stringify(rifiutati),
            assignmentReason: `rifiutata da ${nome} · proposta a ${dopo?.insegna ?? 'partner successivo'} (${prossimo.motivo})`,
          },
          include: { partner: { select: { id: true, insegna: true } } },
        });
        await this.registra(id, 'stato', `Rifiutata dal partner ${nome}: proposta a ${dopo?.insegna ?? prossimo.partnerId} — ${prossimo.motivo}`, user);
        await this.avvisaProposta(agg);
        return agg;
      }

      const agg = await this.prisma.sale.update({
        where: { id },
        data: {
          partnerId: null,
          status: SaleStatus.DA_GESTIRE,
          historyAt: null,
          refusedPartnerIds: JSON.stringify(rifiutati),
          assignmentReason: `rifiutata da ${nome}: nessun altro partner disponibile, da inserire dall'ufficio`,
        },
        include: { partner: { select: { id: true, insegna: true } } },
      });
      await this.registra(id, 'stato', `Rifiutata dal partner ${nome}: nessun altro partner nella lista, torna all'ufficio (da gestire)`, user);
      return agg;
    }

    const agg = await this.prisma.sale.update({
      where: { id },
      data: {
        status: SaleStatus.NON_ACCETTATA,
        historyAt: new Date(),
        refusedPartnerIds: JSON.stringify(rifiutati),
        assignmentReason: [vendita.assignmentReason, "rifiutata dall'ufficio"].filter(Boolean).join(' · '),
      },
      include: { partner: { select: { id: true, insegna: true } } },
    });
    await this.registra(id, 'stato', "Rifiutata dall'ufficio: in storico come non accettata", user);
    return agg;
  }

  private assertPuoRispondere(vendita: { partnerId: string | null }, user: JwtUser) {
    if (user.role === Role.PARTNER && user.partnerId !== vendita.partnerId) {
      throw new ForbiddenException("Questa vendita non e' proposta a te.");
    }
  }

  /**
   * RISMISTA LE VENDITE RIMASTE SENZA PARTNER (05/09/2026, regola utente:
   * «sistema allora tu»).
   *
   * Lo smistamento gira UNA VOLTA, alla nascita della vendita. Quando la
   * regola dell'orario era sbagliata — si confrontava l'ora di ARRIVO della
   * vendita invece della FASCIA DI CONSEGNA — le vendite che ne uscivano senza
   * partner restavano ferme per sempre: nessuno le riprovava. Questo metodo le
   * ripassa con la regola giusta, usando **lo stesso codice** dello
   * smistamento normale (`scegliPartner`), non una copia che domani diverge.
   *
   * ⚠️ Si salta chi non deve essere toccato, e si dice perche':
   *  - gli ordini ESTERI (si gestiscono a mano per decisione dell'utente);
   *  - quelle PRESE IN MANO dall'ufficio (qualcuno ci sta gia' lavorando);
   *  - gli ordini NON CONFORMI in Orders (un ordine non conforme non va
   *    avanti: proporlo a un partner e' esattamente «andare avanti»);
   *  - quelle senza prodotto o senza provincia, che non si possono smistare.
   *
   * ⚠️ La QUOTA non si riscrive, tranne quando il partner arriva da una
   * riconciliazione accettata: li' il patto e' il prezzo al partner, come alla
   * nascita della vendita. Negli altri casi lo sconto resta quello fotografato
   * il giorno dell'ordine — non si riscrive la storia.
   */
  async rismistaAperte(applica = false) {
    const aperte = await this.prisma.sale.findMany({
      where: { status: SaleStatus.DA_GESTIRE, partnerId: null, deliveryId: null },
      include: { product: true, province: { select: { code: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const esito: {
      ordine: string | null; brand: string | null; provincia: string | null;
      prodotto: string | null; data: string | null;
      partner: string | null; motivo: string | null; saltata: string | null;
    }[] = [];

    for (const v of aperte) {
      const riga = {
        ordine: v.externalOrderNumber, brand: v.brand,
        provincia: v.province?.code ?? null,
        prodotto: v.product?.name ?? v.productName ?? null,
        data: v.deliveryDate ? v.deliveryDate.toISOString().slice(0, 10) : null,
        partner: null as string | null, motivo: null as string | null, saltata: null as string | null,
      };
      const perche = (v.assignmentReason ?? '').toLowerCase();
      if (!v.product) riga.saltata = 'senza prodotto a catalogo';
      else if (!v.provinceId) riga.saltata = 'senza provincia';
      else if (perche.includes('estero')) riga.saltata = 'ordine estero: si gestisce a mano';
      else if (perche.includes('presa in mano')) riga.saltata = "presa in mano dall'ufficio";
      if (riga.saltata) { esito.push(riga); continue; }

      try {
        await this.assertOrdineConforme(v.externalOrderId);
      } catch {
        riga.saltata = 'ordine non conforme in Orders';
        esito.push(riga);
        continue;
      }

      // La finestra della CONSEGNA: il giorno chiesto e la fascia del cliente.
      const ordine = await this.ordineDaOrders(v.externalOrderId);
      const f = SalesService.fasciaInOrari(ordine?.consegna?.fascia);
      const finestra: FinestraConsegna = {
        giorno: v.deliveryDate ?? new Date(),
        dalle: f.dalle,
        alle: f.alle,
        variantId: (v as any).productVariantId ?? null,
      };
      const scelto = await this.scegliPartner(v.product as ProdottoDaSmistare, v.provinceId, finestra, []);
      if (!scelto) { riga.saltata = 'nessun partner disponibile nemmeno ora'; esito.push(riga); continue; }

      const p = await this.prisma.partner.findUnique({
        where: { id: scelto.partnerId }, select: { insegna: true },
      });
      riga.partner = p?.insegna ?? scelto.partnerId;
      riga.motivo = scelto.motivo;

      if (applica) {
        await this.prisma.sale.update({
          where: { id: v.id },
          data: {
            partnerId: scelto.partnerId,
            assignmentReason: scelto.motivo,
            status: SaleStatus.PROPOSTA,
            ...(scelto.prezzoPartner !== undefined
              ? { discountPercent: SalesService.quotaPerDare(v.amount, scelto.prezzoPartner) }
              : {}),
          },
        });
        await this.registra(v.id, 'stato',
          `Rismistata con la regola nuova degli orari (fascia di consegna, non ora di arrivo): proposta a ${riga.partner} — ${scelto.motivo}`);
      }
      esito.push(riga);
    }
    return {
      applicato: applica,
      guardate: aperte.length,
      proposte: esito.filter((r) => r.partner).length,
      ferme: esito.filter((r) => !r.partner).length,
      righe: esito,
    };
  }

  // --- smistamento -------------------------------------------------------

  /**
   * Esiste un partner che POTREBBE prendere questa vendita in questa provincia?
   *
   * È il filtro d'ingresso dello smistamento automatico (Standard §7.4, regola
   * dell'utente): si smistano SOLO i prodotti UNICI (che hanno un proprietario)
   * e i NON_UNICI **in una provincia dove abbiamo un partner**. Dove non c'è
   * nessuno che potrà mai prenderla, la vendita NON si crea: resta all'ordine
   * originale, e non si accumulano vendite orfane «da gestire» (ce n'erano 43
   * dal primo giro del 24/08).
   *
   * ⚠️ NON guarda gli orari (aperto/chiuso ADESSO): «avere un partner» è un
   * fatto della rete, non del momento. Un partner che esiste ma è chiuso ora
   * prende la vendita quando riapre — qui basta che ESISTA, sia attivo e OPERI
   * nella provincia. ⭐ 06/09/2026 (regola utente): vale ANCHE per l'UNICO —
   * il proprietario deve coprire la provincia (chi consegna ovunque ha l'area
   * «Tutto il mondo»); prima bastava che fosse attivo.
   */
  async esisteCandidato(product: ProdottoDaSmistare, provinceId: string, variantId: string | null = null): Promise<boolean> {
    const lista = await this.candidati(product, provinceId, variantId);
    if (!lista.length) return false;
    const n = await this.prisma.partner.count({
      where: {
        id: { in: lista.map((c) => c.partnerId) },
        active: true,
        esclusoDalleProposte: false,
        provinces: { some: { provinceId } },
      },
    });
    return n > 0;
  }

  /** Chi puo' prendere questa vendita, nell'ordine giusto. */
  /**
   * @param soloLettura conta i candidati SENZA creare nulla. Serve alla regola «un solo
   *   partner in provincia» (06/09 sera): lì si guarda quanti sono PRIMA di decidere se la
   *   vendita si smista da sola, e una lista di priorità creata per l'occasione sarebbe un
   *   effetto collaterale di una domanda.
   */
  private async candidati(product: ProdottoDaSmistare, provinceId: string, variantId: string | null = null, soloLettura = false): Promise<Candidato[]> {
    if (product.type === ProductType.UNICO) {
      const lista: Candidato[] = product.partnerId
        ? [{ partnerId: product.partnerId, motivo: 'proprietario del prodotto unico' }]
        : [];
      // Corporate Service: il prodotto unico di un partner puo' essere venduto
      // anche da altri, se il flag e' acceso e i collegamenti esistono.
      if (product.visibleToOtherPartners) {
        const altri = await this.prisma.productPartnerLink.findMany({
          where: { productId: product.id },
          select: { partnerId: true },
        });
        for (const a of altri) {
          if (!lista.some((c) => c.partnerId === a.partnerId)) {
            lista.push({ partnerId: a.partnerId, motivo: 'partner aggiuntivo del prodotto' });
          }
        }
      }
      return lista;
    }
    // ⭐ 04/09 (regola utente): la RICONCILIAZIONE accettata per (prodotto,
    // provincia) vince su lista di priorita' e ripiego: quel prodotto, li', va
    // SOLO a quel partner, a quel prezzo. Nasce in Prodotti → Riconciliazioni.
    // ⭐ 06/09 (regola utente): «solo se la variante è la stessa, la riconciliazione approvata,
    // provincia inclusa e partner aperto» — provincia e apertura le controlla scegliPartner.
    const regola = await this.prisma.productReconciliation.findFirst({
      where: { productId: product.id, provinceId, status: 'accettata', productVariantId: variantId ?? null },
      select: { partnerId: true, partnerPrice: true, price: true, discountPercent: true },
    });
    if (regola) {
      return [{
        partnerId: regola.partnerId,
        motivo: 'riconciliazione prodotto/provincia',
        // ⭐ Il patto è QUANTO PRENDE IL PARTNER: l'importo al cliente resta
        // quello di listino, e la quota Deluxy si ricava di conseguenza.
        prezzoPartner: regola.partnerPrice ?? Math.round(regola.price * (1 - regola.discountPercent / 100) * 100) / 100,
      }];
    }
    if (!product.categoryId) return [];

    // ⭐ 06/09/2026 (decisione utente: 8 MESTIERI). Prima si guarda il MESTIERE della
    // categoria: lista di priorità per (provincia, mestiere) → unico partner col mestiere
    // in provincia → lista creata da sola per ordini gestiti. Se la categoria non ha
    // ancora un mestiere, o nessun partner lo ha in provincia, si ricade sul giro per
    // categoria (transizione): niente resta fermo per una mappa incompleta.
    const cat = await this.prisma.category.findUnique({ where: { id: product.categoryId }, select: { mestiere: { select: { id: true, nome: true } } } });
    const mestiere = cat?.mestiere ?? null;
    if (mestiere) {
      const listaM = await this.prisma.priorityList.findFirst({ where: { provinceId, mestiereId: mestiere.id }, include: { entries: { orderBy: { position: 'asc' }, select: { partnerId: true, position: true } } } });
      if (listaM?.entries.length) return listaM.entries.map((e) => ({ partnerId: e.partnerId, motivo: `lista priorita' ${mestiere.nome} ${e.position}a di ${listaM.entries.length}` }));
      const abilitatiM = await this.prisma.partner.findMany({ where: { active: true, deleted: false, esclusoDalleProposte: false, mestieri: { some: { mestiereId: mestiere.id } }, provinces: { some: { provinceId } } }, select: { id: true, insegna: true } });
      if (abilitatiM.length === 1) return [{ partnerId: abilitatiM[0].id, motivo: `unico partner ${mestiere.nome} della provincia` }];
      if (abilitatiM.length > 1) {
        if (soloLettura) return abilitatiM.map((p) => ({ partnerId: p.id, motivo: `partner ${mestiere.nome} della provincia` }));
        const gestitiM = await this.prisma.sale.groupBy({ by: ['partnerId'], where: { partnerId: { in: abilitatiM.map((p) => p.id) }, provinceId, status: SaleStatus.ACCETTATA }, _count: { _all: true } });
        const contoM = new Map(gestitiM.map((g) => [g.partnerId as string, g._count._all]));
        const ordinatiM = [...abilitatiM].sort((a, b) => (contoM.get(b.id) ?? 0) - (contoM.get(a.id) ?? 0) || a.insegna.localeCompare(b.insegna, 'it'));
        const creataM = await this.prisma.priorityList.create({ data: { provinceId, mestiereId: mestiere.id, entries: { create: ordinatiM.map((p, i) => ({ partnerId: p.id, position: i + 1 })) } }, include: { entries: { orderBy: { position: 'asc' }, select: { partnerId: true, position: true } } } });
        this.logger.log(`Lista di priorità ${mestiere.nome} creata da sola (provincia ${provinceId}): ${ordinatiM.map((p) => `${p.insegna} (${contoM.get(p.id) ?? 0})`).join(' > ')}`);
        return creataM.entries.map((e) => ({ partnerId: e.partnerId, motivo: `lista priorita' ${mestiere.nome} creata in automatico (ordini gestiti): ${e.position}a di ${creataM.entries.length}` }));
      }
    }

    // ⭐ La LISTA PRIORITA' vera: una per coppia (provincia, categoria), coi
    // partner in un ordine deciso da qualcuno. Importate dal legacy il
    // 24/08/2026: 26 liste, 48 partner.
    //
    // ⚠️ Prima si usava PartnerCategory, che dice solo QUALI categorie tratta
    // un partner — senza provincia, e con `priority` a 0 su tutte e 455 le
    // righe. Ordinare per un campo uguale per tutti non e' ordinare: il
    // partner scelto era il primo che capitava.
    const lista = await this.prisma.priorityList.findUnique({
      where: { provinceId_categoryId: { provinceId, categoryId: product.categoryId } },
      include: {
        entries: { orderBy: { position: 'asc' }, select: { partnerId: true, position: true } },
      },
    });
    if (lista?.entries.length) {
      return lista.entries.map((e) => ({
        partnerId: e.partnerId,
        motivo: `lista priorita' ${e.position}a di ${lista.entries.length}`,
      }));
    }

    // Nessuna lista per questa coppia. Il manuale dice che la vendita resta
    // «da gestire», e in teoria ha ragione — ma le liste coprono 26 coppie su
    // centinaia possibili, e applicarlo alla lettera oggi manderebbe in coda
    // quasi tutto. Si ripiega su chi tratta la categoria, DICENDO che e' un
    // ripiego: cosi' chi guarda una vendita sa se il partner e' stato scelto
    // da una lista o da un'approssimazione.
    // ⭐ 06/09/2026 (regola utente): senza lista, chi tratta la categoria ED
    // è attivo in provincia. Uno solo → proposta automatica. Più d'uno → la
    // lista di priorità si CREA da sola, ordinata per ordini gestiti fino a
    // oggi in quella provincia (a parità: nome), e da lì in poi comanda lei
    // (l'ufficio la può riordinare come le altre).
    const abilitati = await this.prisma.partner.findMany({
      where: {
        active: true,
        esclusoDalleProposte: false,
        categories: { some: { categoryId: product.categoryId } },
        provinces: { some: { provinceId } },
      },
      select: { id: true, insegna: true },
    });
    if (!abilitati.length) return [];
    if (abilitati.length === 1) {
      return [{ partnerId: abilitati[0].id, motivo: 'unico partner della provincia per questa categoria' }];
    }
    if (soloLettura) return abilitati.map((p) => ({ partnerId: p.id, motivo: 'partner della provincia per questa categoria' }));
    const gestiti = await this.prisma.sale.groupBy({
      by: ['partnerId'],
      where: { partnerId: { in: abilitati.map((p) => p.id) }, provinceId, status: SaleStatus.ACCETTATA },
      _count: { _all: true },
    });
    const conto = new Map(gestiti.map((g) => [g.partnerId as string, g._count._all]));
    const ordinati = [...abilitati].sort((a, b) =>
      (conto.get(b.id) ?? 0) - (conto.get(a.id) ?? 0) || a.insegna.localeCompare(b.insegna, 'it'));
    const creata = await this.prisma.priorityList.create({
      data: {
        provinceId,
        categoryId: product.categoryId,
        entries: { create: ordinati.map((p, i) => ({ partnerId: p.id, position: i + 1 })) },
      },
      include: { entries: { orderBy: { position: 'asc' }, select: { partnerId: true, position: true } } },
    });
    this.logger.log(`Lista di priorità creata da sola (provincia ${provinceId}, categoria ${product.categoryId}): ${ordinati.map((p) => `${p.insegna} (${conto.get(p.id) ?? 0})`).join(' > ')}`);
    return creata.entries.map((e) => ({
      partnerId: e.partnerId,
      motivo: `lista priorita' creata in automatico (ordini gestiti): ${e.position}a di ${creata.entries.length}`,
    }));
  }

  /**
   * ⭐ 07/09/2026 (regola utente: «Il Pappagallo l'ha già fatta a 47 €, quindi dovrebbe essere
   * proposta a lui in automatico») — CHI HA GIÀ UN PREZZO su questo prodotto.
   *
   * I preventivi raccolti vivono come prodotti UNICI del partner con lo sku
   * `PP-<codice del prodotto o della variante>-<id partner>`: è così che li ha scritti
   * l'analisi dei DDT, ed è così che li scrive il Customer Service quando telefona.
   * Un prodotto «a preventivo» non si smista al buio, ma se il prezzo esiste già la domanda
   * è stata fatta: si propone, e al prezzo concordato.
   */
  private async preventiviDelProdotto(product: ProdottoDaSmistare, variantSku: string | null): Promise<Map<string, number>> {
    // ⚠️ Con la VARIANTE si guarda SOLO la variante: «PP-MPSXZK-2-…» (la torta da 10) comincia
    // per «PP-MPSXZK-» e verrebbe presa per un preventivo della 6 — il prezzo della 10 non è il
    // prezzo della 6. Senza variante vale il codice del prodotto.
    const basi = (variantSku ? [variantSku] : [product.sku, product.id])
      .filter(Boolean)
      .map((x) => String(x).toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 28));
    if (!basi.length) return new Map();
    const righe = await this.prisma.product.findMany({
      where: {
        active: true, deletedAt: null, archived: false, partnerId: { not: null },
        OR: basi.map((b) => ({ sku: { startsWith: `PP-${b}-` } })),
      },
      select: { partnerId: true, price: true, sku: true },
    });
    const m = new Map<string, number>();
    for (const r of righe) {
      // La base più specifica (la VARIANTE) vince su quella del prodotto.
      const specifica = variantSku && r.sku?.toUpperCase().startsWith(`PP-${String(variantSku).toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 28)}-`);
      if (r.partnerId && r.price != null && (specifica || !m.has(r.partnerId))) m.set(r.partnerId, r.price);
    }
    return m;
  }

  /**
   * ⭐ 07/09/2026 (regola utente: «è un ordine a quantità») — IL PREZZO UNITARIO DEL PARTNER.
   *
   * Su un prodotto «a quantità» il prezzo NON è il pubblico meno la percentuale del
   * territorio: è quanto quel partner fa UN pezzo, per i pezzi ordinati. «50 rose rosse» da
   * Cannavo, che fa la rosa a 6 €, sono 300 € — e se il cliente ne ha pagati 300 il margine
   * è zero: è un fatto che l'ufficio deve vedere, non una cosa da nascondere dietro una
   * percentuale che tornava per finta.
   *
   * Dove sta il prezzo unitario, in ordine:
   *  · il LISTINO DEL FIORAIO — i suoi «fiori a stelo», sku STELO-FIORE-partner, che il
   *    fioraio compila lui dalla pagina Listino;
   *  · un preventivo/accordo scritto sullo stesso prodotto (PP-codice-partner).
   * Il fiore si riconosce dal nome del prodotto o dal titolo della riga d'ordine.
   */
  private async prezzoUnitario(product: ProdottoDaSmistare & { name?: string | null }, titolo: string | null, partnerIds: string[]): Promise<Map<string, { unitario: number; da: string }>> {
    const fuori = new Map<string, { unitario: number; da: string }>();
    if (!partnerIds.length) return fuori;
    const testo = `${product.name ?? ''} ${titolo ?? ''}`.toLowerCase();
    // I fiori che hanno un listino a stelo: la parola nel titolo decide quale.
    const FIORI: { chiave: string; re: RegExp }[] = [
      { chiave: 'ROSA', re: /\brose\b|\brosa\b|\broses\b/ },
      { chiave: 'TULIPANO', re: /tulipan/ },
      { chiave: 'GIRASOLE', re: /girasol/ },
      { chiave: 'ORTENSIA', re: /ortensi/ },
      { chiave: 'PEONIA', re: /peoni/ },
      { chiave: 'ORCHIDEA', re: /orchide/ },
      { chiave: 'LISIANTHUS', re: /lisianthus|lisiantus/ },
      { chiave: 'GERBERA', re: /gerber/ },
      { chiave: 'GIGLIO', re: /giglio|lilium/ },
      { chiave: 'GAROFANO', re: /garofan/ },
    ];
    const fiore = FIORI.find((f) => f.re.test(testo))?.chiave ?? null;
    const skuBase = (product.sku ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 28);
    const righe = await this.prisma.product.findMany({
      where: {
        active: true, deletedAt: null, archived: false,
        partnerId: { in: partnerIds },
        OR: [
          ...(fiore ? [{ sku: { startsWith: `STELO-${fiore}-` } }] : []),
          ...(skuBase ? [{ sku: { startsWith: `PP-${skuBase}-` } }] : []),
        ],
      },
      select: { partnerId: true, price: true, sku: true },
    });
    for (const r of righe) {
      if (!r.partnerId || r.price == null || r.price <= 0) continue;
      const da = (r.sku ?? '').startsWith('STELO-') ? 'listino del fioraio' : 'prezzo concordato';
      const gia = fuori.get(r.partnerId);
      // Il listino a stelo è quello unitario vero: vince sul patto sul prodotto intero.
      if (!gia || da === 'listino del fioraio') fuori.set(r.partnerId, { unitario: r.price, da });
    }
    return fuori;
  }

  private async scegliPartner(
    product: ProdottoDaSmistare,
    provinceId: string,
    finestra: FinestraConsegna,
    escludi: string[],
  ): Promise<Candidato | null> {
    let lista = (await this.candidati(product, provinceId, finestra.variantId ?? null)).filter(
      (c) => !escludi.includes(c.partnerId),
    );
    if (!lista.length) return null;

    // ⭐ 07/09/2026 (regola utente: «è un ordine a quantità»). Su un prodotto A QUANTITÀ il
    // prezzo al partner è il SUO unitario per i pezzi. Chi non ha un prezzo unitario resta in
    // lista — si propone lo stesso, ma col prezzo della percentuale, e il motivo lo dice.
    if (product.tipologiaVendita === 'quantita' && (finestra.pezzi ?? 0) > 1) {
      const pezzi = Math.round(finestra.pezzi!);
      const unitari = await this.prezzoUnitario(product as ProdottoDaSmistare & { name?: string | null }, finestra.titolo ?? null, lista.map((c) => c.partnerId));
      lista = lista.map((c) => {
        const u = unitari.get(c.partnerId);
        if (!u) return { ...c, motivo: `${c.motivo} · senza prezzo unitario: vale la percentuale` };
        const totale = Math.round(u.unitario * pezzi * 100) / 100;
        const troppo = finestra.importo != null && totale >= finestra.importo;
        return {
          ...c,
          prezzoPartner: totale,
          motivo: `${c.motivo} · ${pezzi} × ${u.unitario} € (${u.da}) = ${totale} €${troppo ? ' ⚠️ pari o sopra il prezzo pagato dal cliente' : ''}`,
        };
      });
    }

    // ⭐ 07/09/2026 (regola utente): un prodotto A PREVENTIVO si propone SOLO a chi un prezzo
    // l'ha già dato, e a quel prezzo. Se non l'ha dato nessuno la lista si svuota e la vendita
    // resta da gestire: è il momento in cui si telefona. L'ordine della lista non cambia —
    // fra chi ha risposto vince chi viene prima, non chi costa meno.
    if (product.tipologiaVendita === 'preventivo') {
      const variante = finestra.variantId
        ? await this.prisma.productVariant.findUnique({ where: { id: finestra.variantId }, select: { sku: true } })
        : null;
      const preventivi = await this.preventiviDelProdotto(product, variante?.sku ?? null);
      // ⚠️ 07/09/2026: chi ha già un prezzo NELLA CANDIDATURA passa comunque — una
      // RICONCILIAZIONE ACCETTATA è il patto più forte che esista (prodotto, variante,
      // provincia, quel partner, quel prezzo) e non va ridiscussa chiedendo un preventivo
      // che è già stato dato. Il filtro serve a chi un prezzo non ce l'ha.
      lista = lista
        .filter((c) => c.prezzoPartner !== undefined || preventivi.has(c.partnerId))
        .map((c) =>
          c.prezzoPartner !== undefined
            ? c
            : { ...c, prezzoPartner: preventivi.get(c.partnerId)!, motivo: `${c.motivo} · preventivo già dato: ${preventivi.get(c.partnerId)} €` },
        );
      if (!lista.length) return null;
    }

    const partners = await this.prisma.partner.findMany({
      where: {
        id: { in: lista.map((c) => c.partnerId) },
        active: true,
        // ⭐ 06/09 sera (regola utente): gli ESCLUSI DALLE PROPOSTE si saltano, da qualunque lista arrivino.
        esclusoDalleProposte: false,
        provinces: { some: { provinceId } },
      },
      include: { openingHours: true, consegnaProvince: { where: { provinceId }, select: { provinceId: true, minimoOrdine: true, raggioKm: true } } },
    });
    const perId = new Map(partners.map((p) => [p.id, p]));
    let destino: { lat: number; lng: number } | null | undefined;

    for (const c of lista) {
      const p = perId.get(c.partnerId);
      if (!p) continue; // non attivo, o non opera in quella provincia
      // ⭐ 06/09/2026 (regola utente): il partner può dire il MINIMO d'ordine che vuole
      // ricevere sulle vendite: sotto quella cifra si passa al successivo.
      // ⭐ 06/09 sera (nuova architettura vendite): minimo e raggio valgono PER PROVINCIA di consegna
      // (area di consegna del partner); la riga vuota eredita i predefiniti del partner.
      const perQui = ((p as any).consegnaProvince ?? [])[0] as { minimoOrdine: number | null; raggioKm: number | null } | undefined;
      const minimo = (perQui?.minimoOrdine ?? (p as any).minimoOrdineVendita) as number | null;
      const prezzoPartner = c.prezzoPartner ?? finestra.prezzoPartnerListino ?? (finestra.importo != null ? Math.round(finestra.importo * (1 - (finestra.scontoPct ?? 0) / 100) * 100) / 100 : null);
      if (minimo != null && prezzoPartner != null && prezzoPartner < minimo) { this.logger.log(`${p.insegna}: al partner andrebbero ${prezzoPartner} €, sotto il suo minimo di ${minimo} €: si passa oltre`); continue; }
      // ⭐ 06/09/2026 (regola utente): il partner che CONSEGNA DA SOLO può dire il raggio
      // massimo (km in linea d'aria dal suo negozio): oltre, la vendita passa al successivo.
      // Serve la sua posizione e quella del destinatario (geocodifica, una volta per giro).
      const raggio = (perQui?.raggioKm ?? (p as any).raggioMaxConsegnaKm) as number | null;
      if (raggio != null && (p as any).autoDeliveredByPartner && (p as any).latitude != null && (p as any).longitude != null && finestra.indirizzo) {
        if (destino === undefined) { const g = await this.settings.geocode(finestra.indirizzo).catch(() => null); destino = g?.lat != null && g?.lng != null ? { lat: g.lat, lng: g.lng } : null; }
        if (destino) { const km = SalesService.kmInLineaDAria((p as any).latitude, (p as any).longitude, destino.lat, destino.lng); if (km > raggio) { this.logger.log(`${p.insegna}: destinatario a ${km.toFixed(1)} km, oltre il suo raggio di ${raggio} km: si passa oltre`); continue; } }
      }
      if (await this.aperto(p.id, p.openingHours, finestra)) return c;
    }
    return null; // nessuno aperto: la vendita resta «da gestire»
  }

  /**
   * Il partner e' aperto in quel momento?
   *
   * L'ordine conta: il giorno preciso batte la settimana. Un partner puo'
   * essere «aperto il lunedi'» e chiuso questo lunedi' specifico. Prima del
   * 24/08/2026 si guardavano solo gli orari settimanali, e le 113.191 fasce per
   * giorno importate dal legacy non le leggeva nessuno: un partner chiuso a
   * Ferragosto risultava aperto.
   */
  private async aperto(
    partnerId: string,
    settimanali: {
      dayOfWeek: number;
      openTime: string | null;
      closeTime: string | null;
      closed: boolean;
    }[],
    finestra: FinestraConsegna,
  ): Promise<boolean> {
    const quando = finestra.giorno;
    const giorno = new Date(
      Date.UTC(quando.getFullYear(), quando.getMonth(), quando.getDate()),
    );

    // 1) fasce del giorno specifico
    const fasce = await this.prisma.partnerDaySlot.findMany({
      where: { partnerId, date: giorno },
    });
    if (fasce.length) {
      const utili = fasce.filter((f) => f.available);
      if (!utili.length) return false; // giorno dichiarato chiuso
      return utili.some((f) => this.siSovrappone(finestra, f.timeFrom, f.timeTo));
    }

    // 2) eccezione del giorno specifico
    const ecc = await this.prisma.partnerDayException.findUnique({
      where: { partnerId_date: { partnerId, date: giorno } },
    });
    if (ecc) return ecc.closed ? false : this.siSovrappone(finestra, ecc.openTime, ecc.closeTime);

    // 3) orari settimanali
    if (!settimanali.length) return true; // nessun orario configurato: sempre aperto
    const oggi = settimanali.filter((h) => h.dayOfWeek === giorno.getUTCDay());
    if (!oggi.length) return false;
    return oggi.some((h) => !h.closed && this.siSovrappone(finestra, h.openTime, h.closeTime));
  }

  /**
   * La consegna e l'apertura si INCROCIANO?
   *
   * ⚠️ 05/09/2026 — qui stava il difetto. Prima si confrontava un ISTANTE
   * (`quando`) con l'orario del partner, e quell'istante era l'ora dentro la
   * data della vendita: quando l'ordine non porta un'ora, la data arriva a
   * mezzanotte UTC, cioè le 02:00 italiane, e QUALUNQUE partner con orari
   * scritti risultava chiuso. Misurato sul database: fra le vendite con data a
   * mezzanotte il 46% restava senza partner (79 su 171), fra quelle con un
   * orario vero il 7% (18 su 248) — e le uniche mezzanotte che passavano erano
   * quelle di partner SENZA orari, che il codice tratta come sempre aperti.
   * Il caso che l'ha fatto vedere: ordine 12879, Tiramisù di Clivati 1969
   * (UNICO, quindi c'era un solo partner possibile), consegna di domenica
   * 06/09 — Clivati apre 07:30–19:30 la domenica, ma alle 02:00 no.
   *
   * Ora si confronta la FASCIA DI CONSEGNA con l'apertura, e basta che si
   * tocchino. Senza fascia la domanda diventa «quel giorno è aperto?»: è
   * l'unica cosa che si sa, e fingere di sapere l'ora è peggio che non saperla.
   */
  private siSovrappone(finestra: FinestraConsegna, apre: string | null, chiude: string | null): boolean {
    // Il partner non ha scritto gli orari di quel giorno: è aperto.
    if (!apre || !chiude) return true;
    // Nessuna fascia sull'ordine: basta che il giorno sia aperto.
    if (!finestra.dalle || !finestra.alle) return true;
    // Si toccano davvero: un negozio che chiude alle 16 non serve la 16–20.
    return finestra.dalle < chiude && apre < finestra.alle;
  }

  /** Una fascia senza orari vale tutto il giorno, non zero minuti. */
  private dentro(hhmm: string, da: string | null, a: string | null): boolean {
    if (!da || !a) return true;
    return da <= hhmm && hhmm <= a;
  }

  /**
   * Crea la consegna che nasce da una vendita accettata.
   *
   * Restituisce null se manca qualcosa di obbligatorio: meglio una vendita
   * accettata senza consegna, e detto, che una consegna con un destinatario
   * inventato.
   */
  private async creaConsegna(
    vendita: {
      id: string;
      partnerId: string | null;
      customerId: string | null;
      recipientFirstName: string | null;
      recipientLastName: string | null;
      recipientAddress: string | null;
      recipientPhone: string | null;
      deliveryDate: Date | null;
      serviceTypeId: string | null;
      amount: number;
      /** ⭐ 07/09/2026: i pezzi della vendita (generici a quantità). */
      quantity?: number;
      discountPercent?: number;
      externalOrderId?: string | null;
      /** Il numero dell'ordine come lo leggono le persone: è questo il DDT. */
      externalOrderNumber?: string | null;
      source?: string;
      brand?: string | null;
      productId?: string | null;
      productVariantId?: string | null;
      variantName?: string | null;
      product?: { name: string; sku: string | null; publicPrice: number | null } | null;
    },
    variante?: { id: string; name: string; price: number | null; publicPrice: number | null } | null,
  ) {
    // ⭐ 07/09/2026 (regola utente: «il tipo di servizio è sempre Vendita Deluxy,
    // crea anche le consegne»): le vendite che arrivano da Orders non portano un
    // tipo di servizio, e qui si usciva in silenzio — «Accettata — consegna NON
    // creata (dati mancanti)» su 15 vendite dal 24/08 (#12901 di Rizzi, 655 €,
    // accettata in 20 secondi e mai diventata consegna). Il servizio di una
    // vendita è UNO: «Vendita Deluxy». Se la vendita non lo dice, vale quello.
    // ⭐ 07/09/2026 (regola utente): il servizio lo decide il PAGAMENTO dell'ordine,
    // come nel modulo dell'ufficio — e col contrassegno il valet deve sapere quanto
    // incassare, se no il denaro non lo chiede nessuno.
    const scelta = vendita.serviceTypeId
      ? { serviceTypeId: vendita.serviceTypeId, contrassegno: false, importo: null as number | null }
      : await this.servizioDaPagamento(vendita.externalOrderId);
    const serviceTypeId = scelta.serviceTypeId;
    if (!vendita.partnerId || !serviceTypeId || !vendita.deliveryDate) return null;
    if (!vendita.recipientFirstName || !vendita.recipientLastName || !vendita.recipientAddress) {
      return null;
    }

    // ⭐ RITIRO = INDIRIZZO DEL PARTNER (regola utente 31/08/2026). Una consegna
    // nata dallo smistamento di una vendita partiva senza indirizzo di ritiro:
    // il valet non sapeva DOVE ritirare. Il ritiro di default è la sede del
    // partner della vendita, come nel form manuale.
    const partnerVendita = await this.prisma.partner.findUnique({
      where: { id: vendita.partnerId },
      select: { address: true },
    });
    const indirizzoRitiro = partnerVendita?.address?.trim() || null;

    // ⭐ L'ECONOMIA DELLA VENDITA — dal CANONE 01/09 la quota NON si congela.
    //
    // Fino al 01/09 qui si scriveva `price = amount × discountPercent%`: un
    // numero congelato sul PUBBLICO che vinceva sul canone (lo scritto > 0
    // vince) e smetteva di seguire listino e righe. Ora il campo resta VUOTO e
    // la Fatturazione calcola fee% × valore prodotti a ogni lettura.
    //
    // `productValue` (= amount, il pagato dal cliente) si scrive SOLO se non
    // nasce la riga prodotto: e' l'ultimo ripiego della cascata di
    // valore-prodotti.ts, non la verita' — dove la riga c'e', parlano le righe.
    const valoreProdotti = arrotonda(vendita.amount);

    // ⭐ LA REGOLA DEL DDT (corretta il 05/09/2026). Su una vendita la consegna
    // viaggia col documento di trasporto, e il suo numero e' il riferimento
    // della vendita: nei dati veri e' cosi' su 10.515 consegne su 12.967 con un
    // DDT (l'81%), e il 96% delle vendite ne ha uno.
    //
    // ⚠️ Qui si scriveva `externalOrderId`, che sulla vendita e' l'id INTERNO
    // di Deluxy Orders — un cuid tipo `cmthk6uht0002jr044m6xlqvm`, non un
    // numero di documento. Nel database i DDT sono 16.357 e sono numeri
    // (15.164 tutti cifre, zero in forma cuid): scriverci un id avrebbe messo
    // in quel campo una cosa che nessuno riconosce, e avrebbe fatto fallire la
    // riconciliazione per DDT — che e' il legame piu' forte fra vendita e
    // consegna (regola utente del 05/09). Vale il NUMERO d'ordine, quello che
    // le persone leggono; l'id resta come ultimo ripiego se il numero manca.
    const numeroDdt = vendita.externalOrderNumber?.trim() || vendita.externalOrderId?.trim() || null;

    // ⭐ 01/09 (regola utente «sistemati anche gli altri ordini»): anche la via
    // AUTOMATICA porta con sé quello che l'ordine sa già — fascia oraria del
    // cliente, biglietto (→ personalizzazione) e nota Shopify (→ note). Prima
    // solo il form li aveva: le consegne nate dallo smistamento uscivano mute.
    // Best-effort: se Orders non risponde, la consegna nasce come prima.
    let fasciaDalle: string | undefined;
    let fasciaAlle: string | undefined;
    let biglietto: string | undefined;
    let notaShopify: string | undefined;
    const ordine = await this.ordineDaOrders(vendita.externalOrderId);
    if (ordine) {
      const f = SalesService.fasciaInOrari(ordine?.consegna?.fascia);
      fasciaDalle = f.dalle;
      fasciaAlle = f.alle;
      biglietto = String(ordine?.biglietto ?? '').trim() || undefined;
      notaShopify = String(ordine?.shopify?.note ?? '').trim() || undefined;
    }

    // ⭐ 07/09/2026 (regola utente: «se è due prodotti stesso partner unisci in unica
    // consegna con più prodotti») — UNA CONSEGNA, NON DUE.
    //
    // Da ieri sera ogni vendita accettata genera la SUA consegna. Un ordine con due
    // righe per lo stesso partner — la torta e i macarons di Rizzi, per dire — ne
    // faceva nascere due allo stesso indirizzo, alla stessa ora: due giri, due fatture,
    // due paghe, e il cliente che apre la porta due volte. Se una consegna per questo
    // ordine e questo partner c'è già, la riga si aggiunge LÌ.
    //
    // Solo le consegne ancora vive: una annullata o già consegnata non si tocca —
    // aggiungere merce a un giro già fatto sarebbe merce che nessuno porta.
    if (vendita.externalOrderId && vendita.productId) {
      // ⚠️ `Sale.deliveryId` è un campo sciolto, senza relazione Prisma: la consegna si
      // legge in un secondo passo, non con un include.
      const sorelle = await this.prisma.sale.findMany({
        where: {
          externalOrderId: vendita.externalOrderId,
          partnerId: vendita.partnerId,
          id: { not: vendita.id },
          deliveryId: { not: null },
          status: { not: 'annullata' },
        },
        select: { deliveryId: true },
      });
      const consegnaSorella = sorelle.length
        ? await this.prisma.delivery.findFirst({
            where: {
              id: { in: sorelle.map((x) => x.deliveryId!) },
              deletedAt: null,
              // Solo le consegne ancora vive: su una già consegnata o annullata la merce
              // aggiunta non la porterebbe nessuno.
              status: { in: [DeliveryStatus.CREATED, DeliveryStatus.ASSIGNED, DeliveryStatus.ACCEPTED, DeliveryStatus.IN_PREPARATION] },
            },
            select: { id: true, code: true, date: true, serviceTypeId: true },
            orderBy: { code: 'asc' },
          })
        : null;
      if (consegnaSorella) {
        const gia = await this.prisma.deliveryProduct.findFirst({
          where: {
            deliveryId: consegnaSorella.id,
            productId: vendita.productId,
            productVariantId: vendita.productVariantId ?? null,
            deletedAt: null,
          },
          select: { id: true },
        });
        if (!gia) {
          await this.prisma.deliveryProduct.create({
            data: {
              deliveryId: consegnaSorella.id,
              productId: vendita.productId,
              productName: vendita.product?.name ?? null,
              productSku: vendita.product?.sku ?? null,
              productVariantId: vendita.productVariantId ?? null,
              variantName: vendita.variantName ?? variante?.name ?? null,
              quantity: Math.max(1, Number(vendita.quantity) || 1),
              price: prezzoRigaVendita(vendita, variante),
            },
          });
          await this.prisma.deliveryLog.create({
            data: {
              deliveryId: consegnaSorella.id, type: 'note', userId: null,
              message: `Aggiunta la riga «${vendita.product?.name ?? 'prodotto'}» dalla vendita dello stesso ordine (#${vendita.externalOrderNumber ?? '?'}), stesso partner: una consegna sola con più prodotti`,
            },
          });
        }
        // ⚠️ `Sale.deliveryId` è ancora @unique in questo database: la seconda vendita non
        // può puntare alla stessa consegna finché il vincolo non viene tolto. La riga
        // però è già sulla consegna — il lavoro da fare è completo — e il collegamento
        // si prova comunque: quando il vincolo sarà un indice normale, funziona da sé.
        return consegnaSorella;
      }
    }

    const ultimo = await this.prisma.delivery.aggregate({ _max: { code: true } });
    return this.prisma.delivery.create({
      data: {
        code: (ultimo._max.code ?? 0) + 1,
        date: vendita.deliveryDate,
        serviceTypeId,
        partnerId: vendita.partnerId,
        customerId: vendita.customerId,
        recipientFirstName: vendita.recipientFirstName,
        recipientLastName: vendita.recipientLastName,
        recipientAddress: vendita.recipientAddress,
        recipientPhone: vendita.recipientPhone,
        pickupAddress: indirizzoRitiro,
        // ⭐ 07/09/2026: sul contrassegno il valet deve sapere che incassa, e quanto.
        // Il servizio da solo non basta: il flag e l'importo sono quello che l'app gli
        // mostra prima di mettersi in consegna.
        ...(scelta.contrassegno ? { paymentOnDelivery: true, paymentAmount: scelta.importo ?? undefined } : {}),
        // La finestra chiesta dal cliente sull'ordine (es. «16-20»): aperta
        // come fascia flessibile quando è una finestra vera.
        deliveryTimeFrom: fasciaDalle,
        deliveryTimeTo: fasciaAlle,
        deliveryFlexible: Boolean(fasciaDalle && fasciaAlle && fasciaAlle !== fasciaDalle) || undefined,
        personalizeSaleNotes: biglietto,
        notes: notaShopify,
        // ⭐ 06/09/2026: l'id Shopify dell'ordine (`realOrderNumber`) è la chiave
        // con cui Finanza trova quello che il cliente ha pagato (cache di Orders).
        // Senza, 162 consegne di vendita su 636 dal 01/08 restavano «stimate».
        realOrderNumber: SalesService.numeroShopify(ordine?.orderId ?? null) ?? undefined,
        productValue: vendita.productId ? null : valoreProdotti,
        ddtNumber: numeroDdt,
        // Con piu' brand lo stesso numero DDT esiste su negozi diversi: il
        // brand della vendita viaggia col documento, o il numero non identifica.
        ddtBrand: numeroDdt ? (vendita.brand ?? null) : null,
        legacySaleId: vendita.externalOrderId ?? null,
        // ⭐ LA RIGA PRODOTTO, che prima non veniva scritta affatto: la consegna
        // nasceva senza dire COSA andava consegnato («Nessun prodotto» a
        // schermo), e la Finanza leggeva un venduto a zero. E' la fotografia
        // del giorno, variante compresa: la Cappelliera M non e' la Cappelliera.
        products: vendita.productId
          ? {
              create: [{
                productId: vendita.productId,
                productName: vendita.product?.name ?? null,
                productSku: vendita.product?.sku ?? null,
                productVariantId: vendita.productVariantId ?? null,
                variantName: vendita.variantName ?? variante?.name ?? null,
                // ⭐ 07/09/2026 (regola utente): i PEZZI della vendita — «50 rose rosse» è una
                // riga da 50, non da 1 — e sui GENERICI il prezzo è quello dell ordine diviso i
                // pezzi (prezzo flessibile del generico), perché a listino il generico vale 0.
                quantity: Math.max(1, Number(vendita.quantity) || 1),
                // Il prezzo di riga e' quello del PARTNER (canone 29/08: la fee
                // si calcola sul SUO prezzo — la prova: la quota registrata e'
                // il 20% esatto della variante `price`, non del pubblico). Il
                // pubblico e' il ripiego; se nessuno lo dichiara resta vuoto.
                price: prezzoRigaVendita(vendita, variante),
              }],
            }
          : undefined,
      },
      select: { id: true, code: true, date: true, serviceTypeId: true },
    });
  }

  /**
   * ⭐ 07/09/2026 — COLLEGARE LA VENDITA ALLA SUA CONSEGNA, anche quando la consegna
   * è condivisa con una vendita sorella.
   *
   * Da oggi due righe dello stesso ordine per lo stesso partner finiscono su UNA
   * consegna: la seconda vendita vorrebbe puntare alla stessa. Ma `Sale.deliveryId` è
   * ancora `@unique` in questo database, e l'update fallirebbe con P2002 — facendo
   * fallire l'ACCETTAZIONE, cioè l'unica cosa che non deve mai fallire: il partner ha
   * detto sì, la consegna c'è, la riga è sopra.
   *
   * Qui si prova a scrivere il collegamento; se il vincolo lo impedisce si riscrive
   * tutto il resto senza `deliveryId` e lo si annota nel registro. Quando il vincolo
   * diventerà un indice normale (migrazione concordata) questo ramo non scatterà più.
   */
  private async aggiornaVenditaConConsegna<T>(
    id: string,
    dati: Record<string, unknown>,
    include: T,
  ): Promise<any> {
    try {
      return await this.prisma.sale.update({ where: { id }, data: dati, include: include as any });
    } catch (err) {
      const p2002 = (err as { code?: string })?.code === 'P2002' && 'deliveryId' in dati;
      if (!p2002) throw err;
      const { deliveryId, ...senzaConsegna } = dati;
      this.logger.warn(`Vendita ${id}: la consegna ${String(deliveryId)} è già di una vendita sorella (Sale.deliveryId è ancora @unique). La riga è sulla consegna; il collegamento no.`);
      return this.prisma.sale.update({ where: { id }, data: senzaConsegna, include: include as any });
    }
  }

  private servizioVenditaDeluxyId: string | null | undefined;

  /**
   * L'id del tipo di servizio «Vendita Deluxy» (regola utente 07/09/2026: il
   * servizio di una vendita è sempre quello). Letto una volta e tenuto in
   * memoria: il catalogo dei servizi non cambia nel corso di una vita
   * dell'istanza. Null solo se in questo database non esiste: allora la
   * consegna non nasce, ed è giusto che si veda.
   */
  /**
   * ⭐ 07/09/2026 (regola utente: «applica anche in caso di vendite automatiche»).
   *
   * IL SERVIZIO LO DECIDE L'ORDINE, SU TUTTE E DUE LE STRADE.
   *
   * Dal 06/09 il modulo che l'ufficio apre «prendendo in mano» una vendita sceglie il
   * tipo di servizio dal PAGAMENTO: contrassegno → «Vendita con Pagamento alla
   * Consegna», già pagato con più pezzi → «Vendita Deluxy Multipla», altrimenti
   * «Vendita Deluxy» (nato dal caso 12879, che usciva «con pagamento alla consegna»
   * pur essendo pagato con carta). Ma la consegna che nasce DA SOLA quando il partner
   * accetta prendeva sempre «Vendita Deluxy»: stesso ordine, due risposte diverse a
   * seconda di chi lo tocca per primo — e su un contrassegno vuol dire un valet che
   * non sa di dover incassare.
   *
   * Best-effort per scelta: se Orders non risponde si torna a «Vendita Deluxy». Una
   * consegna che nasce col servizio di ripiego è meglio di una consegna che non nasce.
   */
  private async servizioDaPagamento(externalOrderId: string | null | undefined): Promise<{ serviceTypeId: string | null; contrassegno: boolean; importo: number | null }> {
    const ripiego = { serviceTypeId: await this.servizioVenditaDeluxy(), contrassegno: false, importo: null as number | null };
    if (!externalOrderId) return ripiego;
    let ordine: any = null;
    try {
      ordine = await this.ordineDaOrders(externalOrderId);
    } catch {
      return ripiego;
    }
    if (!ordine) return ripiego;
    // Le stesse due fonti del modulo: la categoria di pagamento classificata da Orders,
    // e come rete il nome del gateway Shopify.
    const categoria = String(ordine?.classificazione?.categoriaPagamento ?? '').toLowerCase();
    const gateway = String(ordine?.shopify?.gateway ?? ordine?.pagamento?.gateway ?? '').toLowerCase();
    const contrassegno = categoria === 'contrassegno' || /contrassegno|cash on delivery|\bcod\b/.test(gateway);
    // I pezzi sono le righe CON SKU: una riga senza SKU è una personalizzazione
    // (la candelina, la scritta sulla torta), non un secondo pezzo.
    const righe: any[] = Array.isArray(ordine?.righe) ? ordine.righe : [];
    const pezzi = righe.filter((r) => String(r?.sku ?? '').trim()).reduce((t, r) => t + (Number(r?.quantita) || 1), 0);
    const totale = Number(ordine?.totale);
    const nome = contrassegno ? 'Vendita con Pagamento alla Consegna' : pezzi > 1 ? 'Vendita Deluxy Multipla' : 'Vendita Deluxy';
    const st = await this.prisma.serviceType.findFirst({
      where: { name: { equals: nome, mode: 'insensitive' } },
      select: { id: true },
    });
    return {
      serviceTypeId: st?.id ?? ripiego.serviceTypeId,
      contrassegno,
      importo: contrassegno && Number.isFinite(totale) && totale > 0 ? totale : null,
    };
  }

  private async servizioVenditaDeluxy(): Promise<string | null> {
    if (this.servizioVenditaDeluxyId !== undefined) return this.servizioVenditaDeluxyId;
    const st = await this.prisma.serviceType.findFirst({
      where: { name: { equals: 'Vendita Deluxy', mode: 'insensitive' } },
      select: { id: true },
    });
    this.servizioVenditaDeluxyId = st?.id ?? null;
    if (!st) this.logger.error('Tipo di servizio «Vendita Deluxy» NON trovato: le vendite accettate non generano consegne.');
    return this.servizioVenditaDeluxyId;
  }

  /**
   * ⭐ 07/09/2026: crea la consegna che una vendita ACCETTATA non ha avuto
   * (le 15 ferme dal 24/08, e ogni caso futuro che l'ufficio vuole sanare).
   * Idempotente: se la consegna c'è già non fa nulla. Se manca davvero
   * qualcosa (partner, data, destinatario) lo dice invece di inventare.
   */
  async creaConsegnaMancante(id: string, user?: Pick<JwtUser, 'sub' | 'email' | 'role'> | null) {
    const vendita = await this.prisma.sale.findUnique({ where: { id }, include: { product: true } });
    if (!vendita) throw new NotFoundException('Vendita non trovata');
    if (vendita.status !== SaleStatus.ACCETTATA) {
      throw new BadRequestException(`La vendita non è accettata (stato: ${vendita.status}): la consegna nasce solo da una vendita accettata.`);
    }
    if (vendita.deliveryId) {
      const c = await this.prisma.delivery.findUnique({ where: { id: vendita.deliveryId }, select: { id: true, code: true } });
      if (c) return { creata: false, motivo: `ha già la consegna #${c.code}`, consegna: c };
    }
    const manca = [
      !vendita.partnerId && 'partner',
      !vendita.deliveryDate && 'data di consegna',
      (!vendita.recipientFirstName || !vendita.recipientLastName) && 'destinatario',
      !vendita.recipientAddress && 'indirizzo',
    ].filter(Boolean) as string[];
    if (manca.length) return { creata: false, motivo: `manca: ${manca.join(', ')}`, consegna: null };

    const variante = vendita.productVariantId
      ? await this.prisma.productVariant.findUnique({ where: { id: vendita.productVariantId } })
      : null;
    const consegna = await this.creaConsegna(vendita, variante);
    if (!consegna) return { creata: false, motivo: 'tipo di servizio «Vendita Deluxy» non trovato', consegna: null };
    await this.prisma.sale.update({
      where: { id },
      data: { deliveryId: consegna.id, serviceTypeId: vendita.serviceTypeId ?? consegna.serviceTypeId, historyAt: new Date() },
    });
    await this.registra(id, 'stato', `Consegna creata a posteriori → #${consegna.code} (tipo di servizio Vendita Deluxy)`, user);
    return { creata: true, motivo: null, consegna };
  }
}

/** Due decimali: gli importi si scrivono come si leggono. */
function arrotonda(n: number): number {
  return Math.round(n * 100) / 100;
}

@ApiTags('sales')
@ApiBearerAuth()
// ⚠️ Il guard dei ruoli, SENZA `@Roles`, lascia passare chiunque sia
// autenticato (roles.guard.ts). Questo controller non ne aveva nessuno: un
// VALET leggeva tutto. Provato con un token vero il 27/08/2026. I ruoli qui
// sono gli stessi che il frontend applica alla pagina (app.routes.ts).
@Roles(Role.ADMIN, Role.OPERATION, Role.PROJECT_MANAGER, Role.PARTNER)
@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Get()
  @ApiOperation({ summary: 'Lista vendite (il partner vede le proprie)' })
  findAll(@CurrentUser() user: JwtUser) {
    return this.salesService.findAll(user);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.OPERATION, Role.PARTNER)
  @ApiOperation({ summary: 'Dettaglio vendita col registro (il partner solo le sue)' })
  findOne(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.salesService.findOne(id, user);
  }

  @Get(':id/ordine')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Dettaglio ordine dietro la vendita (mittente, righe, contrassegno) per il prefill' })
  dettaglioOrdine(@Param('id') id: string) {
    return this.salesService.dettaglioOrdine(id);
  }

  @Post()
  @ApiOperation({ summary: 'Crea vendita con smistamento automatico al partner' })
  async create(
    @Body()
    body: {
      productId: string;
      productVariantId?: string;
      provinceId: string;
      brand?: string;
      customerId?: string;
      source?: string;
      externalOrderId?: string;
      recipientFirstName?: string;
      recipientLastName?: string;
      recipientAddress?: string;
      recipientPhone?: string;
      deliveryDate?: string;
      serviceTypeId?: string;
    },
    @CurrentUser() user: JwtUser,
  ) {
    const v = await this.salesService.create(body);
    await this.salesService.registra(v.id, 'creata', `Vendita creata dall'app · stato ${v.status}${(v as any).partner?.insegna ? ' · proposta a ' + (v as any).partner.insegna : ''}`, user);
    return v;
  }

  @Post('ingest')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({
    summary: 'Riceve un ordine da un sistema esterno e lo smista (idempotente)',
  })
  ingest(
    @Body()
    body: {
      source: string;
      externalOrderId: string;
      provinceCode?: string;
      provinceId?: string;
      productId?: string;
      productVariantId?: string;
      productSku?: string;
      brand?: string;
      customerId?: string;
      recipientFirstName?: string;
      recipientLastName?: string;
      recipientAddress?: string;
      recipientPhone?: string;
      deliveryDate?: string;
      serviceTypeId?: string;
    },
  ) {
    return this.salesService.ingest(body);
  }

  @Post(':id/accetta')
  @ApiOperation({ summary: 'Il partner accetta la vendita: nasce la consegna' })
  accetta(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.salesService.accetta(id, user);
  }

  @Post(':id/crea-consegna')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Ufficio: crea la consegna che una vendita accettata non ha avuto (idempotente; dice cosa manca)' })
  creaConsegna(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.salesService.creaConsegnaMancante(id, user);
  }

  @Post(':id/rifiuta')
  @ApiOperation({
    summary: 'Il partner rifiuta: la vendita passa al prossimo, o torna da gestire',
  })
  rifiuta(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.salesService.rifiuta(id, user);
  }

  @Post(':id/preventivo')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Salva il preventivo dato dal partner: la vendita prende quel prezzo e nasce la riconciliazione accettata' })
  salvaPreventivo(@Param('id') id: string, @Body() body: { partnerId?: string; prezzo: number }, @CurrentUser() user: JwtUser) {
    return this.salesService.salvaPreventivo(id, body, user);
  }

  @Post(':id/inserisci')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({
    summary: "L'ufficio prende in mano la vendita: ferma il giro automatico, la consegna si inserisce dal form",
  })
  inserisci(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.salesService.prendiInMano(id, user);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Modifica i DATI della vendita (importo, destinatario, date…) — non lo stato' })
  modifica(@Param('id') id: string, @Body() body: Record<string, unknown>, @CurrentUser() user: JwtUser) {
    return this.salesService.modifica(id, body, user);
  }

  @Get(':id/storico-partner')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Chi abbiamo usato in passato per questo prodotto in questa provincia, e a che prezzo' })
  storicoPartner(@Param('id') id: string) {
    return this.salesService.storicoPartner(id);
  }

  @Get(':id/consegne-indirizzo')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Consegne di tipo vendita allo stesso indirizzo di questa vendita' })
  consegneIndirizzo(@Param('id') id: string) {
    return this.salesService.consegneAllIndirizzo(id);
  }

  @Post(':id/riconcilia-consegna')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'La vendita È quella consegna: va in storico e il suo riferimento entra nel DDT' })
  riconciliaConsegna(@Param('id') id: string, @Body() body: { deliveryId?: string }, @CurrentUser() user: JwtUser) {
    if (!body?.deliveryId) throw new BadRequestException('Serve «deliveryId».');
    return this.salesService.riconciliaConConsegna(id, body.deliveryId, user);
  }

  @Post(':id/proponi')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'L\'ufficio propone la vendita a un partner scelto a mano' })
  proponi(@Param('id') id: string, @Body() body: { partnerId?: string }, @CurrentUser() user: JwtUser) {
    if (!body?.partnerId) throw new BadRequestException('Serve «partnerId».');
    return this.salesService.proponiAPartner(id, body.partnerId, user);
  }

  @Post(':id/collega-consegna')
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Collega la consegna inserita a mano e chiude la vendita (accettata)' })
  collegaConsegna(@Param('id') id: string, @Body() body: { deliveryId?: string }, @CurrentUser() user: JwtUser) {
    return this.salesService.collegaConsegna(id, body?.deliveryId ?? '', user);
  }
}

@Module({
  imports: [NotificationsModule, SettingsModule],
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
