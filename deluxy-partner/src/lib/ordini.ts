import type { OrdineShopify, TransazioneBancaria } from "@prisma/client";

// Helper puri per gli ordini Shopify (etichette, categorie, suggerimento match).

export const STATI_ORDINE: Record<string, { label: string; badge: string }> = {
  da_riconciliare: { label: "Da riconciliare", badge: "orange" },
  riconciliato: { label: "Riconciliato", badge: "green" },
  incassato_gateway: { label: "Incassato (gateway)", badge: "blue" },
  ignorato: { label: "Ignorato", badge: "neutral" },
};

// COME si incassa un ordine — cosa diversa dallo STATO della riconciliazione.
// Gli ordini del sito deluxy.it non si abbinano a un movimento bancario: sono
// ordini di un PARTNER e rientrano nel suo conto mensile (servizi a
// fatturazione / saldi), quindi cercarne il bonifico in Qonto è tempo perso ed
// è il motivo per cui lì il bottone «Riconcilia» non compare. L'eccezione è
// l'ordine per cui è partita una richiesta di pagamento fuori da Shopify:
// quel denaro arriva davvero in banca e va abbinato, perciò la riconciliazione
// torna disponibile appena l'operatore lo classifica così.
export const GESTIONI: Record<string, { label: string; badge: string; riconciliabile: boolean }> = {
  riconciliazione: { label: "Incasso da riconciliare", badge: "orange", riconciliabile: true },
  partner: { label: "Ordine partner", badge: "purple", riconciliabile: false },
  pagamento_esterno: { label: "Richiesta di pagamento esterna", badge: "blue", riconciliabile: true },
};

export const GESTIONE_DEFAULT = "riconciliazione";

// Il brand i cui ordini nascono già «ordine partner». È il nome che arriva dal
// registro Deluxy Orders (`brand`), non il dominio myshopify.
export const BRAND_ORDINI_PARTNER = "deluxy.it";

export function gestioneIniziale(brand: string): string {
  return brand === BRAND_ORDINI_PARTNER ? "partner" : GESTIONE_DEFAULT;
}

export const CATEGORIE_PAG: Record<string, string> = {
  bonifico: "Bonifico",
  carta: "Carta / gateway",
  contrassegno: "Contrassegno",
  altro: "Altro",
};

const TOLLERANZA = 0.02;

// Quota di riferimento che Deluxy paga al fornitore sul valore dell'ordine: di
// norma ~60%. Regola voluta dall'utente: pagare SOTTO il 60% è BENE (margine
// alto), SOPRA il 60% è MALE (margine basso). Configurabile in Impostazioni
// (chiave `ordini.quotaFornitore`); qui il default.
export const QUOTA_FORNITORE_DEFAULT = 60;

export type ValutazioneQuota = {
  atteso: number; // importo di riferimento = totale × quota%
  pct: number; // quanto è stato pagato in % del totale
  scostoPP: number; // scarto in punti percentuali dalla quota (>0 = sopra = male)
  stato: "buono" | "alto"; // buono = pagato ≤ quota; alto = sopra quota (male)
};

// Valuta il pagato al fornitore rispetto alla quota: ≤ quota è buono, sopra è male.
export function valutaQuota(
  totaleOrdine: number,
  pagato: number,
  quota = QUOTA_FORNITORE_DEFAULT
): ValutazioneQuota {
  const atteso = totaleOrdine * (quota / 100);
  const pct = totaleOrdine > 0.005 ? (pagato / totaleOrdine) * 100 : 0;
  const scostoPP = pct - quota;
  const stato = pct <= quota + 0.5 ? "buono" : "alto";
  return { atteso, pct, scostoPP, stato };
}

// Estrae il numero d'ordine (solo cifre) da `nome` tipo "#2582" → "2582".
export function numeroOrdine(nome: string): string {
  return (nome.match(/\d+/g)?.join("") ?? "").trim();
}

// La causale contiene il numero dell'ordine come TOKEN ISOLATO (delimitato da
// spazi/punteggiatura, non attaccato a lettere o altre cifre)? Serve la forma
// stretta perché gli ID lunghi dei gateway (PayPal/Stripe) contengono cifre a
// caso: "2570" dentro "1045694124072570" NON deve valere come match. I bonifici
// ai fornitori (es. Vivid) hanno invece la causale = il solo numero d'ordine.
export function causaleContieneNumero(t: TransazioneBancaria, numero: string): boolean {
  if (!numero || numero.length < 2) return false;
  const testo = `${t.descrizione} ${t.controparte ?? ""}`;
  return new RegExp(`(?<![\\p{L}\\d])${numero}(?![\\p{L}\\d])`, "u").test(testo);
}

// Criterio STRETTO per i pagamenti ai fornitori: la causale è (essenzialmente)
// il solo numero d'ordine, SENZA parole. I bonifici ai fiorai hanno causale tipo
// "2534"; gli addebiti di PayPal/fornitori terzi ("PayPal Europe…", "DEDEM SPA…")
// contengono un nome e vanno esclusi anche se una cifra coincide per caso.
export function causaleSoloNumero(t: TransazioneBancaria, numero: string): boolean {
  if (!numero || numero.length < 2) return false;
  const desc = t.descrizione ?? "";
  if (/\p{L}/u.test(desc)) return false; // c'è una parola/nome → non è un pagamento "puro"
  return new RegExp(`(?<![\\p{L}\\d])${numero}(?![\\p{L}\\d])`, "u").test(desc);
}

// Suggerisce i movimenti bancari (accrediti) compatibili con un ordine a
// bonifico. Due segnali, dal più forte:
//   1) il NUMERO dell'ordine compare nella causale del movimento;
//   2) stesso importo (±2 cent), rafforzato se c'è anche il nome cliente.
// I candidati per numero sono mostrati anche se l'importo non combacia.
export function suggerisciMovimenti(
  ordine: OrdineShopify,
  movimenti: TransazioneBancaria[],
  giaAbbinati: Set<string>
): { tx: TransazioneBancaria; forte: boolean; matchNumero: boolean }[] {
  const nome = (ordine.clienteNome ?? "").toLowerCase().split(/\s+/).filter((w) => w.length >= 4);
  const numero = numeroOrdine(ordine.nome);
  return movimenti
    .filter((t) => t.importo > 0 && !giaAbbinati.has(t.id))
    .map((t) => {
      const matchNumero = causaleContieneNumero(t, numero);
      const matchImporto = Math.abs(t.importo - ordine.totale) <= TOLLERANZA;
      const desc = `${t.descrizione} ${t.controparte ?? ""}`.toLowerCase();
      const matchNome = nome.length > 0 && nome.some((w) => desc.includes(w));
      return { tx: t, matchNumero, matchImporto, forte: matchNumero || (matchImporto && matchNome) };
    })
    .filter((c) => c.matchNumero || c.matchImporto)
    .sort((a, b) => Number(b.matchNumero) - Number(a.matchNumero) || Number(b.forte) - Number(a.forte))
    .map(({ tx, forte, matchNumero }) => ({ tx, forte, matchNumero }));
}
