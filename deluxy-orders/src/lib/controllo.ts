import type { MovimentoBanca, Ordine } from "@prisma/client";
import { prisma } from "./db";

// CONTROLLO DEI SOLDI DI UN ORDINE — le due metà del margine.
//
// Un ordine, in banca, lascia due tracce diverse e in due momenti diversi:
//  1. l'INCASSO del cliente — un accredito, di importo ~ uguale al totale;
//  2. il COSTO del fornitore — un addebito al fioraio, che vale una frazione
//     (di norma ~60%) e quindi NON si riconosce dall'importo.
//
// Da qui tutto il resto: l'abbinamento **non** si fa per importo ma per NUMERO
// D'ORDINE nella causale, e i due lati si tengono separati sull'ordine. Se un
// dato non c'è, si scrive che non c'è: un margine calcolato su un costo
// inventato è peggio di un margine mancante.
//
// Questa logica arriva da deluxy-partner (`/ordini`), che l'ha maturata su dati
// veri per mesi; qui è stata portata dove stanno gli ordini. Le differenze
// volute rispetto a là sono due, e sono dichiarate:
//  · i movimenti sono uno SPECCHIO di sola lettura (Finance resta il padrone del
//    denaro): non si marca «registrata» niente di suo;
//  · un movimento non viene «consumato»: che sia usato lo dice l'ordine che lo
//    cita, perciò una reimportazione dell'estratto non può perdere il lavoro.

export const STATI_INCASSO: Record<string, { nome: string; colore: string; spiega: string }> = {
  da_riconciliare: {
    nome: "Da riconciliare",
    colore: "var(--orange)",
    spiega: "Il denaro dovrebbe essere arrivato in banca, ma nessuno ha ancora indicato quale movimento è",
  },
  riconciliato: {
    nome: "Riconciliato",
    colore: "var(--green)",
    spiega: "Abbinato a un movimento bancario (o segnato incassato a mano)",
  },
  incassato_gateway: {
    nome: "Incassato (carta)",
    colore: "var(--blue)",
    spiega: "Pagato con carta su Shopify: l'incasso è avvenuto sul gateway, il versamento arriva a blocchi",
  },
  ignorato: {
    nome: "Ignorato",
    colore: "var(--text-tertiary)",
    spiega: "Fuori dal conto per scelta: non entra nelle percentuali",
  },
};

// COME si incassa — cosa diversa dallo STATO. Gli ordini di deluxy.it sono
// ordini di un PARTNER e rientrano nel suo conto mensile: cercarne il bonifico
// in banca è tempo perso, e per questo lì la riconciliazione non si offre.
export const GESTIONI_INCASSO: Record<string, { nome: string; riconciliabile: boolean; spiega: string }> = {
  riconciliazione: { nome: "Incasso da riconciliare", riconciliabile: true, spiega: "Il denaro arriva in banca e si abbina a un movimento" },
  partner: { nome: "Ordine partner", riconciliabile: false, spiega: "Rientra nel conto mensile del partner: in banca non c'è niente da cercare" },
  pagamento_esterno: { nome: "Richiesta di pagamento esterna", riconciliabile: true, spiega: "Pagamento chiesto fuori da Shopify: il denaro arriva in banca" },
};

// Il brand i cui ordini nascono già «ordine partner» (come in Finance).
export const BRAND_ORDINI_PARTNER = "deluxy.it";

export function gestioneIniziale(brand: string): string {
  return brand === BRAND_ORDINI_PARTNER ? "partner" : "riconciliazione";
}

// Da dove parte l'incasso di un ordine appena arrivato. Una carta PAID è già
// incassata sul gateway: il versamento in banca arriva a blocchi, non ordine per
// ordine, quindi cercarne il movimento è tempo perso. Tutto il resto parte «da
// riconciliare», che è la verità: non lo sappiamo ancora.
export function statoIncassoIniziale(categoriaPagamento: string, financialStatus: string | null): string {
  return categoriaPagamento === "carta" && financialStatus === "PAID" ? "incassato_gateway" : "da_riconciliare";
}

// ---- La normalizzazione dell'archivio -------------------------------------
// Gli ordini importati PRIMA che esistesse il controllo sono tutti «da
// riconciliare» con gestione «riconciliazione»: dodicimila ordini in una coda
// che nessuno deve lavorare. Questa funzione li porta al punto di partenza
// giusto, e **solo dove nessuno ha ancora deciso niente** (nessun movimento
// abbinato, stato ancora quello di default). Due UPDATE, non dodicimila.
export async function normalizzaControllo(): Promise<{ gestioni: number; gateway: number }> {
  const gestioni = await prisma.ordine.updateMany({
    where: {
      brand: BRAND_ORDINI_PARTNER,
      gestioneIncasso: "riconciliazione",
      movimentoIncassoId: null,
      statoIncasso: "da_riconciliare",
    },
    data: { gestioneIncasso: "partner" },
  });
  const gateway = await prisma.ordine.updateMany({
    where: {
      categoriaPagamento: "carta",
      financialStatus: "PAID",
      statoIncasso: "da_riconciliare",
      movimentoIncassoId: null,
    },
    data: { statoIncasso: "incassato_gateway" },
  });
  return { gestioni: gestioni.count, gateway: gateway.count };
}

// Gli stati che valgono come «i soldi del cliente li abbiamo».
export const INCASSATI = ["riconciliato", "incassato_gateway"] as const;

// ---- La quota attesa del fornitore -----------------------------------------
// Deluxy paga al fornitore una quota del valore dell'ordine: di norma ~60%.
// Pagare SOTTO la quota è bene (margine alto), SOPRA è male. Si cambia in
// Impostazioni senza toccare il codice.
export const QUOTA_FORNITORE_DEFAULT = 60;
const CHIAVE_QUOTA = "controllo.quotaFornitore";

export async function quotaFornitore(): Promise<number> {
  const r = await prisma.impostazione.findUnique({ where: { chiave: CHIAVE_QUOTA } });
  const v = Number(r?.valore);
  return Number.isFinite(v) && v > 0 && v < 100 ? v : QUOTA_FORNITORE_DEFAULT;
}

/**
 * La quota fornitore PER PROVINCIA (e categoria): Standard §7.4.
 *
 * Cascata: regola (provincia, categoria) → regola (provincia, qualunque) →
 * quota globale. La risposta dice DA DOVE viene il numero (`regola`), perché
 * «60 di default» e «55 deciso per Caserta» non meritano la stessa fiducia
 * quando qualcuno si chiede perché un costo non torna.
 *
 * ⚠️ Vale per i fornitori in chat: gli ordini smistati dalla piattaforma hanno
 * lo sconto cristallizzato sulla vendita là, e questo numero non c'entra.
 */
export async function quotaFornitorePer(
  provincia?: string | null,
  categoria?: string | null,
): Promise<{ quota: number; regola: "provincia+categoria" | "provincia" | "default" }> {
  const prov = provincia?.trim().toUpperCase() ?? "";
  const cat = categoria?.trim().toLowerCase() ?? "";
  if (prov) {
    const regole = await prisma.quotaRegola.findMany({
      where: { provincia: prov, categoria: { in: cat ? [cat, ""] : [""] } },
    });
    const precisa = cat ? regole.find((r) => r.categoria === cat) : undefined;
    if (precisa) return { quota: precisa.percento, regola: "provincia+categoria" };
    const generica = regole.find((r) => r.categoria === "");
    if (generica) return { quota: generica.percento, regola: "provincia" };
  }
  return { quota: await quotaFornitore(), regola: "default" };
}

/**
 * Il MARGINE di un ordine — la formula vive QUI e solo qui (Standard §7.4).
 *
 *   fornitore diretto:  totale − costoFornitore
 *   via piattaforma:    totale − costoFornitore − costoConsegna + feeConsegna
 *
 * `null` = non calcolabile (manca il costo del fornitore): mai zero, mai un
 * numero finto. `parziale` dice che manca un ingrediente della consegna
 * nostra: il numero c'è ma non è tutto.
 *
 * ⚠️ IL VALORE PUÒ ESSERE NEGATIVO, ed è giusto così. Un ordine venduto sotto
 * costo esiste: uno sconto spinto, un fornitore più caro del previsto, una
 * consegna costata più del margine. Non si azzera e non si nasconde — un
 * margine negativo è esattamente l'informazione per cui questo conto esiste.
 * Chi lo mostra deve dire «perdita» a lettere: un meno davanti a un numero, in
 * una tabella di numeri, si perde.
 *
 * ⚠️ Da non confondere con gli INGREDIENTI, che negativi non possono essere:
 * `costoFornitore`, `costoConsegna` e `feeConsegna` sono importi pagati, e il
 * PATCH li rifiuta sotto zero. È il RISULTATO che può andare in rosso, non le
 * cose che ci entrano.
 */
export function margineOrdine(o: {
  totale: number;
  costoFornitore: number | null;
  costoConsegna: number | null;
  feeConsegna: number | null;
  evasione: string;
  consegnataDa: string;
}): { valore: number | null; parziale: boolean; nota: string } {
  if (o.costoFornitore == null) {
    return { valore: null, parziale: false, nota: "manca il costo del fornitore" };
  }
  let valore = o.totale - o.costoFornitore;
  let parziale = false;
  let nota = "totale − costo fornitore";
  const consegnaNostra = o.evasione === "piattaforma" && o.consegnataDa !== "fornitore";
  if (consegnaNostra) {
    if (o.costoConsegna != null) {
      valore = valore - o.costoConsegna + (o.feeConsegna ?? 0);
      nota = "totale − costo fornitore − costo consegna + fee";
    } else {
      parziale = true;
      nota = "senza il costo della consegna (la piattaforma non lo espone ancora)";
    }
  }
  return { valore: Math.round(valore * 100) / 100, parziale, nota };
}

export async function salvaQuotaFornitore(quota: number): Promise<void> {
  const v = Math.min(99, Math.max(1, Math.round(quota)));
  await prisma.impostazione.upsert({
    where: { chiave: CHIAVE_QUOTA },
    create: { chiave: CHIAVE_QUOTA, valore: String(v) },
    update: { valore: String(v) },
  });
}

export type ValutazioneQuota = {
  atteso: number; // quanto ci aspettiamo di pagare: totale × quota%
  pct: number; // quanto è stato pagato, in % del totale
  scostoPP: number; // punti percentuali di scarto dalla quota (>0 = sopra = male)
  stato: "buono" | "alto";
};

export function valutaQuota(totale: number, pagato: number, quota = QUOTA_FORNITORE_DEFAULT): ValutazioneQuota {
  const atteso = totale * (quota / 100);
  const pct = totale > 0.005 ? (pagato / totale) * 100 : 0;
  return { atteso, pct, scostoPP: pct - quota, stato: pct <= quota + 0.5 ? "buono" : "alto" };
}

// ---- Il numero d'ordine dentro la causale -----------------------------------

// «#1234» → «1234». Solo le cifre, perché in causale il cancelletto non c'è.
export function numeroOrdine(numero: string): string {
  return (numero.match(/\d+/g)?.join("") ?? "").trim();
}

// I numeri che compaiono in un testo come TOKEN ISOLATI — delimitati da spazi o
// punteggiatura, non attaccati a lettere o ad altre cifre. La forma stretta è
// obbligatoria: gli identificativi dei gateway contengono cifre a caso, e
// «2570» dentro «1045694124072570» non è il nostro ordine.
//
// È l'UNICO posto dove questa regola è scritta: chi deve fare un solo confronto
// usa `causaleContieneNumero`, chi deve incrociare migliaia di righe si costruisce
// l'indice da qui. Due implementazioni della stessa regola divergono sempre.
const NUMERI_ISOLATI = /(?<![\p{L}\d])\d+(?![\p{L}\d])/gu;

export function numeriIsolati(testo: string): Set<string> {
  return new Set((testo ?? "").match(NUMERI_ISOLATI) ?? []);
}

export function causaleContieneNumero(m: Pick<MovimentoBanca, "descrizione" | "controparte">, numero: string): boolean {
  if (!numero || numero.length < 2) return false;
  return numeriIsolati(`${m.descrizione} ${m.controparte ?? ""}`).has(numero);
}

// Criterio STRETTO per i pagamenti ai fornitori: la causale è il solo numero,
// senza parole. I bonifici ai fiorai hanno causale «2534»; gli addebiti di
// PayPal o di un fornitore terzo contengono un nome e vanno esclusi anche se
// una cifra coincide per caso.
export function causaleSenzaParole(descrizione: string | null): boolean {
  return !/\p{L}/u.test(descrizione ?? "");
}

export function causaleSoloNumero(m: Pick<MovimentoBanca, "descrizione">, numero: string): boolean {
  if (!numero || numero.length < 2) return false;
  if (!causaleSenzaParole(m.descrizione)) return false;
  return numeriIsolati(m.descrizione ?? "").has(numero);
}

const TOLLERANZA = 0.02;

// I movimenti compatibili con l'incasso di un ordine, dal più probabile. Due
// segnali: il numero in causale (forte) e l'importo uguale (±2 cent), rafforzato
// dal nome del cliente. I candidati per numero si mostrano anche se l'importo
// non torna: è proprio il caso da guardare a mano.
export function suggerisciIncassi(
  ordine: Pick<Ordine, "numero" | "totale" | "clienteNome">,
  movimenti: MovimentoBanca[],
  giaUsati: Set<string>,
): { movimento: MovimentoBanca; forte: boolean; perNumero: boolean; stessoImporto: boolean }[] {
  const parole = (ordine.clienteNome ?? "").toLowerCase().split(/\s+/).filter((p) => p.length >= 4);
  const numero = numeroOrdine(ordine.numero);
  return movimenti
    .filter((m) => m.importo > 0 && !giaUsati.has(m.id))
    .map((m) => {
      const perNumero = causaleContieneNumero(m, numero);
      const stessoImporto = Math.abs(m.importo - ordine.totale) <= TOLLERANZA;
      const testo = `${m.descrizione} ${m.controparte ?? ""}`.toLowerCase();
      const nomeCombacia = parole.length > 0 && parole.some((p) => testo.includes(p));
      return { movimento: m, perNumero, stessoImporto, forte: perNumero || (stessoImporto && nomeCombacia) };
    })
    .filter((c) => c.perNumero || c.stessoImporto)
    .sort((a, b) => Number(b.perNumero) - Number(a.perNumero) || Number(b.forte) - Number(a.forte));
}

// I movimenti già usati dal controllo: la verità sta sugli ORDINI, non sul
// movimento. Derivarla invece di salvarla costa una query e non può andare
// fuori sincrono — cosa che con un flag salvato succede sempre, prima o poi.
export async function movimentiUsati(): Promise<Set<string>> {
  const righe = await prisma.ordine.findMany({
    where: { OR: [{ movimentoIncassoId: { not: null } }, { costoMovimentoId: { not: null } }] },
    select: { movimentoIncassoId: true, costoMovimentoId: true },
  });
  const usati = new Set<string>();
  for (const r of righe) {
    if (r.movimentoIncassoId) usati.add(r.movimentoIncassoId);
    if (r.costoMovimentoId) usati.add(r.costoMovimentoId);
  }
  return usati;
}
