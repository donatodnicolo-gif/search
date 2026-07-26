import { prisma } from "./db";
import { categoriaDaGateway, type CategoriaPagamento } from "./classificazione";
import { deduciCanale } from "./marketing";

// Client Shopify Admin API (GraphQL 2024-10) per scaricare gli ordini dei
// negozi collegati. Il token (shpat_... o coniato) di ogni negozio è salvato in
// NegozioShopify e non lascia mai il server. Sola lettura (read_orders).
// Evoluzione del client di deluxy-partner: qui prendiamo anche le righe
// d'ordine, l'indirizzo di spedizione, il telefono, lo stato di evasione e i tag.

const API_VERSION = "2024-10";

export type RigaNormalizzata = {
  titolo: string;
  variante: string | null;
  sku: string | null;
  quantita: number;
  prezzo: number;
  proprieta: string | null;
  immagine: string | null;
};

export type OrdineNormalizzato = {
  orderId: string;
  numero: string;
  data: Date;
  totale: number;
  valuta: string;
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  annullatoIl: Date | null;
  motivoAnnullamento: string | null;
  chiusoIl: Date | null;
  rischioLivello: string | null;
  rischioRaccomandazione: string | null;
  rischioMotivi: string | null;
  gateway: string | null;
  categoriaPagamento: CategoriaPagamento;
  clienteNome: string | null;
  clienteEmail: string | null;
  clienteTelefono: string | null;
  consensoEmail: string | null;
  consensoEmailIl: Date | null;
  consensoSms: string | null;
  consensoSmsIl: Date | null;
  dataConsegna: Date | null;
  fasciaConsegna: string | null;
  biglietto: string | null;
  bigliettoDaNota: boolean;
  spedizioneNome: string | null;
  indirizzo: string | null;
  citta: string | null;
  cap: string | null;
  provincia: string | null;
  paese: string | null;
  noteShopify: string | null;
  tagShopify: string | null;
  sorgente: string | null;
  visitaSorgente: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  canaleMarketing: string;
  righe: RigaNormalizzata[];
};

// 25 ordini per pagina con 25 righe ciascuno: l'API Admin ha un limite a punti
// (query cost) e chiedere di più fa scattare il throttling su negozi grandi.
const ORDERS_QUERY = `
query Ordini($cursor: String, $q: String) {
  orders(first: 25, after: $cursor, query: $q, sortKey: CREATED_AT, reverse: true) {
    edges {
      cursor
      node {
        id
        name
        createdAt
        displayFinancialStatus
        displayFulfillmentStatus
        cancelledAt
        cancelReason
        closedAt
        risk {
          recommendation
          assessments { riskLevel facts { description sentiment } }
        }
        note
        tags
        customAttributes { key value }
        paymentGatewayNames
        # Da dove è arrivato l'ordine. sourceName è il canale tecnico (web,
        # shopify_draft_order, pos); la firstVisit del customerJourneySummary è
        # la PRIMA visita del percorso che ha portato all'acquisto, con gli utm
        # della campagna se c'erano. Misurato il 27/07/2026: 25 ordini col
        # percorso costano 26 punti su un bucket da 1000, quindi non cambia il
        # ritmo dell'import.
        sourceName
        customerJourneySummary {
          firstVisit {
            source
            referrerUrl
            utmParameters { source medium campaign }
          }
        }
        totalPriceSet { shopMoney { amount currencyCode } }
        customer {
          firstName lastName email phone
          # Consensi di marketing: servono a non scrivere a chi non vuole essere
          # contattato. Sono accessibili col token degli ordini (verificato sui
          # tre negozi il 26/07/2026); se un giorno non lo fossero, vanno tolti
          # da qui, perché un campo senza permessi fa fallire l'INTERO import —
          # è già successo con le foto dei prodotti.
          emailMarketingConsent { marketingState consentUpdatedAt }
          smsMarketingConsent { marketingState consentUpdatedAt }
        }
        shippingAddress {
          name address1 address2 city zip provinceCode province countryCodeV2 country phone
        }
        lineItems(first: 25) {
          edges { node {
            title
            quantity
            sku
            variantTitle
            customAttributes { key value }
            image { url }
            originalUnitPriceSet { shopMoney { amount } }
          } }
        }
      }
    }
    pageInfo { hasNextPage }
  }
}`;

type Attributo = { key: string; value: string | null };

type LineItemNode = {
  title: string;
  quantity: number;
  sku: string | null;
  variantTitle: string | null;
  customAttributes: Attributo[] | null;
  image: { url: string } | null;
  originalUnitPriceSet: { shopMoney: { amount: string } } | null;
};

type OrderNode = {
  id: string;
  name: string;
  createdAt: string;
  displayFinancialStatus: string | null;
  displayFulfillmentStatus: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  closedAt: string | null;
  risk: {
    recommendation: string | null;
    assessments: { riskLevel: string | null; facts: { description: string; sentiment: string }[] | null }[] | null;
  } | null;
  note: string | null;
  tags: string[];
  customAttributes: Attributo[] | null;
  paymentGatewayNames: string[];
  sourceName: string | null;
  customerJourneySummary: {
    firstVisit: {
      source: string | null;
      referrerUrl: string | null;
      utmParameters: { source: string | null; medium: string | null; campaign: string | null } | null;
    } | null;
  } | null;
  totalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
  customer: {
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    emailMarketingConsent: { marketingState: string | null; consentUpdatedAt: string | null } | null;
    smsMarketingConsent: { marketingState: string | null; consentUpdatedAt: string | null } | null;
  } | null;
  shippingAddress: {
    name: string | null;
    address1: string | null;
    address2: string | null;
    city: string | null;
    zip: string | null;
    provinceCode: string | null;
    province: string | null;
    countryCodeV2: string | null;
    country: string | null;
    phone: string | null;
  } | null;
  lineItems: { edges: { node: LineItemNode }[] };
};

const attesa = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Una chiamata GraphQL con ritentativi: l'Admin API limita per "costo" (bucket a
// punti) e su import lunghi risponde THROTTLED o 429. In quel caso si aspetta e
// si riprova invece di far fallire tutto l'import.
export async function chiamataAdmin(
  dominio: string,
  token: string,
  query: string,
  variables: Record<string, unknown>,
  tentativi = 6,
) {
  let ultimoErrore = "";
  for (let t = 0; t < tentativi; t++) {
    let res: Response;
    try {
      res = await fetch(`https://${dominio}/admin/api/${API_VERSION}/graphql.json`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(30000),
      });
    } catch (e) {
      // errore di rete/timeout: riprova con attesa crescente
      ultimoErrore = (e as Error).message;
      await attesa(2000 * (t + 1));
      continue;
    }

    if (res.status === 401 || res.status === 403) {
      throw new Error(`token non valido o scaduto (HTTP ${res.status}) — ricollega il negozio`);
    }
    if (res.status === 429 || res.status >= 500) {
      ultimoErrore = `HTTP ${res.status}`;
      await attesa(3000 * (t + 1));
      continue;
    }
    if (!res.ok) {
      throw new Error(`Shopify ${dominio} → HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }

    const json = await res.json();
    if (json.errors) {
      const testo = JSON.stringify(json.errors);
      if (/throttl/i.test(testo)) {
        ultimoErrore = "THROTTLED";
        await attesa(3000 * (t + 1));
        continue;
      }
      throw new Error(`Shopify GraphQL: ${testo.slice(0, 200)}`);
    }

    // Se il bucket dei punti è quasi esaurito, rallenta prima della prossima pagina.
    const stato = json.extensions?.cost?.throttleStatus;
    if (stato && stato.currentlyAvailable < 200) {
      const mancanti = 400 - stato.currentlyAvailable;
      await attesa(Math.min(5000, Math.max(500, (mancanti / (stato.restoreRate || 50)) * 1000)));
    }
    return json.data;
  }
  throw new Error(`Shopify ${dominio}: limite di frequenza non superato dopo ${tentativi} tentativi (${ultimoErrore})`);
}

// Scorciatoia per l'import: la query degli ordini con gli stessi ritentativi.
function shopifyGraphQL(dominio: string, token: string, variables: Record<string, unknown>) {
  return chiamataAdmin(dominio, token, ORDERS_QUERY, variables);
}

function indirizzoUnaRiga(a: OrderNode["shippingAddress"]): string | null {
  if (!a) return null;
  return [a.address1, a.address2].filter(Boolean).join(", ") || null;
}

// ---------- Rischio frode ----------
// Shopify può restituire più valutazioni (la sua e quelle di app esterne):
// si tiene la PIÙ severa, perché è quella che deve far fermare l'operatore.
const ORDINE_RISCHIO = ["NONE", "LOW", "MEDIUM", "HIGH"] as const;

// Da dove è arrivato l'ordine, letto dal percorso che Shopify tiene per ogni
// acquisto. Il canale in italiano si deduce qui una volta e si salva, così le
// tabelle non devono ragionarci sopra a ogni riga; il vocabolario e la regola
// stanno in src/lib/marketing.ts, e un ricalcolo li rimette d'accordo se la
// regola cambia.
function provenienzaDaOrdine(n: OrderNode): {
  sorgente: string | null;
  visitaSorgente: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  canaleMarketing: string;
} {
  const fv = n.customerJourneySummary?.firstVisit ?? null;
  const utm = fv?.utmParameters ?? null;
  // `source` è di solito un nome («Google», «direct»); quando manca resta
  // l'indirizzo del sito che ci ha mandato la persona, che è comunque una
  // risposta migliore di niente.
  const dati = {
    sorgente: n.sourceName ?? null,
    visitaSorgente: fv?.source ?? fv?.referrerUrl ?? null,
    utmSource: utm?.source ?? null,
    utmMedium: utm?.medium ?? null,
    utmCampaign: utm?.campaign ?? null,
  };
  return { ...dati, canaleMarketing: deduciCanale(dati) };
}

function rischioDaOrdine(n: OrderNode): {
  livello: string | null;
  raccomandazione: string | null;
  motivi: string | null;
} {
  const r = n.risk;
  if (!r) return { livello: null, raccomandazione: null, motivi: null };

  let peggiore = -1;
  const motivi: string[] = [];
  for (const a of r.assessments ?? []) {
    const i = ORDINE_RISCHIO.indexOf((a.riskLevel ?? "NONE") as (typeof ORDINE_RISCHIO)[number]);
    if (i > peggiore) peggiore = i;
    // solo i fatti NEGATIVI: gli altri sono decine per ordine e non aiutano a decidere
    for (const f of a.facts ?? []) {
      if (f.sentiment === "NEGATIVE" && f.description) motivi.push(f.description);
    }
  }

  return {
    livello: peggiore >= 0 ? ORDINE_RISCHIO[peggiore] : null,
    raccomandazione: r.recommendation ?? null,
    motivi: motivi.length ? [...new Set(motivi)].join("\n").slice(0, 2000) : null,
  };
}

// ---------- Consegna richiesta (data e fascia oraria) ----------
// Sui negozi Deluxy sono attributi dell'ordine: Data_Consegna (ISO) e
// Fascia_Oraria_Consegna ("16-20"). Il riconoscimento è però per parola chiave,
// così regge anche i nomi diversi degli ordini vecchi o di negozi futuri, in
// italiano o inglese (stessa logica dell'app di smistamento).

// Cerca fra gli attributi dell'ordine e, in seconda battuta, delle righe.
function cercaAttributo(n: OrderNode, re: RegExp): string | null {
  const tutti: Attributo[] = [...(n.customAttributes ?? [])];
  for (const e of n.lineItems?.edges ?? []) tutti.push(...(e.node.customAttributes ?? []));
  const trovato = tutti.find((a) => a?.key && re.test(a.key) && a.value && a.value.trim() !== "");
  return trovato?.value?.trim() ?? null;
}

// Interpreta le date scritte come 2026-07-25, 25/07/2026 o 25-07-26.
// Si fissa a mezzogiorno UTC: è un giorno di calendario, non un istante, e
// così non scivola al giorno prima cambiando fuso orario.
export function leggiDataConsegna(testo: string | null): Date | null {
  if (!testo) return null;
  const t = testo.trim();

  const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const [, a, m, g] = iso;
    return giornoUtc(Number(a), Number(m), Number(g));
  }

  const eu = t.match(/^(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2,4}))?/);
  if (eu) {
    const [, g, m, aRaw] = eu;
    let anno = aRaw ? Number(aRaw) : new Date().getUTCFullYear();
    if (anno < 100) anno += 2000;
    return giornoUtc(anno, Number(m), Number(g));
  }
  return null;
}

function giornoUtc(anno: number, mese: number, giorno: number): Date | null {
  if (mese < 1 || mese > 12 || giorno < 1 || giorno > 31) return null;
  const d = new Date(Date.UTC(anno, mese - 1, giorno, 12, 0, 0));
  return Number.isNaN(d.getTime()) ? null : d;
}

const RE_DATA = /(data.?consegna|delivery.?date|consegn|delivery|fecha|datum|livraison)/i;
const RE_FASCIA = /(fascia|orari|\bora\b|\btime\b|slot|hora|uhr|heure)/i;
// Il biglietto/dedica: nomi diversi a seconda del tema del sito e della lingua.
// Si escludono le chiavi tecniche (che iniziano per "_") e "messaggio di
// errore"-simili non esiste qui, quindi basta la parola chiave.
const RE_BIGLIETTO = /(bigliet|dedica|messagg|message|card|frase|tarjeta|karte|carte)/i;

// La consegna si legge SOLO dagli attributi strutturati dell'ordine, mai dal
// testo libero delle note. Provarci sembra utile ma produce dati sbagliati: in
// una nota reale «30 Luglio 08/12» il "08/12" è la fascia oraria, e un ripiego
// a espressione regolare la leggeva come 8 dicembre. In uno strumento operativo
// una data di consegna sbagliata è peggio di una mancante: se l'attributo non
// c'è, l'ordine resta "consegna non indicata" e la nota si legge nella scheda.
function consegnaDaOrdine(n: OrderNode): { data: Date | null; fascia: string | null } {
  const data = leggiDataConsegna(cercaAttributo(n, RE_DATA));
  const fascia = cercaAttributo(n, RE_FASCIA);
  return { data, fascia: fascia ? fascia.slice(0, 60) : null };
}

// Il testo del biglietto. L'attributo strutturato è affidabile: è il campo che
// il sito riempie apposta. La nota dell'ordine NO: contiene di tutto —
// indirizzi, preferenze sui fiori, istruzioni per il corriere — e un primo
// tentativo che la accettava quando conteneva "scriv" o "messaggio" ha preso
// per dediche due note di consegna ("contattare per indirizzo di consegna").
//
// Quindi: dall'attributo si prende il testo come biglietto vero; dalla nota
// solo se nomina esplicitamente un biglietto o una dedica, e in quel caso la si
// marca DA VERIFICARE, così in pagina non si spaccia per testo confermato.
function bigliettoDaOrdine(n: OrderNode): { testo: string | null; daNota: boolean } {
  const daAttributo = cercaAttributo(n, RE_BIGLIETTO);
  if (daAttributo) return { testo: daAttributo.slice(0, 1000), daNota: false };
  const nota = n.note?.trim();
  if (nota && /bigliett|dedica/i.test(nota)) return { testo: nota.slice(0, 1000), daNota: true };
  return { testo: null, daNota: false };
}

// Le personalizzazioni di una riga, come le mostra Shopify. Si scartano le
// chiavi tecniche (iniziano con "_") e i valori vuoti.
function proprietaRiga(attributi: Attributo[] | null): string | null {
  const utili = (attributi ?? [])
    .filter((a) => a?.key && !a.key.startsWith("_") && a.value && a.value.trim() !== "")
    .map((a) => `${a.key}: ${a.value!.trim()}`);
  return utili.length ? utili.join("\n").slice(0, 1500) : null;
}

// Scarica gli ordini di un negozio, pagina per pagina.
//  - `dal`  = data di partenza; **null = tutto lo storico** (nessun filtro).
//  - `onPagina` = se passata, riceve ogni pagina appena arriva e la funzione
//    NON accumula nulla in memoria (indispensabile per gli import storici da
//    decine di migliaia di ordini). Senza callback torna l'elenco completo.
export async function scaricaOrdini(
  dominio: string,
  token: string,
  dal: Date | null,
  maxPagine = 5000,
  onPagina?: (ordini: OrdineNormalizzato[], pagina: number) => Promise<void>,
): Promise<OrdineNormalizzato[]> {
  const q = dal ? `created_at:>=${dal.toISOString().slice(0, 10)}` : undefined;
  const out: OrdineNormalizzato[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < maxPagine; page++) {
    const data = await shopifyGraphQL(dominio, token, { cursor, q });
    const edges: { cursor: string; node: OrderNode }[] = data?.orders?.edges ?? [];
    const pagina: OrdineNormalizzato[] = [];
    for (const { node: n } of edges) {
      const gateways = n.paymentGatewayNames ?? [];
      const addr = n.shippingAddress;
      const consegna = consegnaDaOrdine(n);
      const rischio = rischioDaOrdine(n);
      const biglietto = bigliettoDaOrdine(n);
      const righe: RigaNormalizzata[] = (n.lineItems?.edges ?? []).map(({ node: l }) => ({
        titolo: l.title,
        variante: l.variantTitle,
        sku: l.sku,
        quantita: l.quantity ?? 1,
        prezzo: parseFloat(l.originalUnitPriceSet?.shopMoney?.amount ?? "0") || 0,
        proprieta: proprietaRiga(l.customAttributes),
        // foto della riga d'ordine. Non si risale a quella del prodotto:
        // richiederebbe lo scope read_products, che i token non hanno (e
        // chiederlo faceva fallire l'INTERO import con ACCESS_DENIED).
        immagine: l.image?.url ?? null,
      }));
      pagina.push({
        orderId: n.id,
        numero: n.name,
        data: new Date(n.createdAt),
        totale: parseFloat(n.totalPriceSet?.shopMoney?.amount ?? "0") || 0,
        valuta: n.totalPriceSet?.shopMoney?.currencyCode ?? "EUR",
        financialStatus: n.displayFinancialStatus ?? null,
        fulfillmentStatus: n.displayFulfillmentStatus ?? null,
        annullatoIl: n.cancelledAt ? new Date(n.cancelledAt) : null,
        motivoAnnullamento: n.cancelReason ?? null,
        chiusoIl: n.closedAt ? new Date(n.closedAt) : null,
        rischioLivello: rischio.livello,
        rischioRaccomandazione: rischio.raccomandazione,
        rischioMotivi: rischio.motivi,
        gateway: gateways.join(", ") || null,
        categoriaPagamento: categoriaDaGateway(gateways),
        ...provenienzaDaOrdine(n),
        clienteNome: [n.customer?.firstName, n.customer?.lastName].filter(Boolean).join(" ") || null,
        clienteEmail: n.customer?.email ?? null,
        clienteTelefono: n.customer?.phone ?? addr?.phone ?? null,
        consensoEmail: n.customer?.emailMarketingConsent?.marketingState ?? null,
        consensoEmailIl: n.customer?.emailMarketingConsent?.consentUpdatedAt
          ? new Date(n.customer.emailMarketingConsent.consentUpdatedAt)
          : null,
        consensoSms: n.customer?.smsMarketingConsent?.marketingState ?? null,
        consensoSmsIl: n.customer?.smsMarketingConsent?.consentUpdatedAt
          ? new Date(n.customer.smsMarketingConsent.consentUpdatedAt)
          : null,
        dataConsegna: consegna.data,
        fasciaConsegna: consegna.fascia,
        biglietto: biglietto.testo,
        bigliettoDaNota: biglietto.daNota,
        spedizioneNome: addr?.name ?? null,
        indirizzo: indirizzoUnaRiga(addr),
        citta: addr?.city ?? null,
        cap: addr?.zip ?? null,
        provincia: addr?.provinceCode ?? addr?.province ?? null,
        paese: addr?.countryCodeV2 ?? addr?.country ?? null,
        noteShopify: n.note?.slice(0, 1000) ?? null,
        tagShopify: (n.tags ?? []).join(", ") || null,
        righe,
      });
    }
    if (onPagina) await onPagina(pagina, page + 1);
    else out.push(...pagina);

    if (!data?.orders?.pageInfo?.hasNextPage || edges.length === 0) break;
    cursor = edges[edges.length - 1].cursor;
  }
  return out;
}

// Conia un Admin API token per un'app della Dev Dashboard tramite il "client
// credentials grant" (Client ID + Secret → token valido ~24h). Flusso
// server-to-server delle app moderne: nessun redirect, nessun token statico da
// rivelare. Torna il token e i secondi di validità.
export async function tokenDaClientCredentials(
  dominio: string,
  clientId: string,
  clientSecret: string,
): Promise<{ token: string; expiresIn: number }> {
  const res = await fetch(`https://${dominio}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
    signal: AbortSignal.timeout(15000),
  });
  const j = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error_description?: string;
    error?: string;
  };
  if (!res.ok || !j.access_token) {
    throw new Error(j.error_description || j.error || `Grant Shopify fallito (HTTP ${res.status})`);
  }
  return { token: j.access_token, expiresIn: j.expires_in ?? 86400 };
}

type NegozioAuth = {
  id: string;
  dominio: string;
  token: string;
  clientId: string | null;
  clientSecret: string | null;
  tokenScadeIl: Date | null;
};

// Ritorna un token Admin VALIDO per il negozio, coniandone uno nuovo se serve.
export async function tokenNegozio(neg: NegozioAuth): Promise<string> {
  const usaGrant = Boolean(neg.clientId && neg.clientSecret);
  if (usaGrant) {
    const scaduto = !neg.token || !neg.tokenScadeIl || neg.tokenScadeIl.getTime() < Date.now();
    if (!scaduto) return neg.token;
    const { token, expiresIn } = await tokenDaClientCredentials(neg.dominio, neg.clientId!, neg.clientSecret!);
    const scadeIl = new Date(Date.now() + Math.max(60, expiresIn - 300) * 1000);
    await prisma.negozioShopify.update({ where: { id: neg.id }, data: { token, tokenScadeIl: scadeIl } });
    return token;
  }
  if (neg.token) return neg.token;
  throw new Error("nessun token statico né Client ID/Secret configurati");
}

// Verifica che un token legga (pagina Impostazioni): torna il nome dello shop.
export async function verificaNegozio(
  dominio: string,
  token: string,
): Promise<{ ok: boolean; messaggio: string }> {
  try {
    const res = await fetch(`https://${dominio}/admin/api/${API_VERSION}/shop.json`, {
      headers: { "X-Shopify-Access-Token": token },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { ok: false, messaggio: `HTTP ${res.status} — token o dominio non validi` };
    const j = await res.json();
    return { ok: true, messaggio: j?.shop?.name ?? dominio };
  } catch (e) {
    return { ok: false, messaggio: (e as Error).message };
  }
}
