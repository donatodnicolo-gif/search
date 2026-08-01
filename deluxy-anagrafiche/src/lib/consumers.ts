// CONSUMERS — le persone che comprano da noi su Shopify (B2C).
//
// ⚠️ Non sono i «Partner» del registro. Lì stanno le AZIENDE del B2B: quelle
// che lavorano per noi (fioristi, pasticcerie) o con cui trattiamo. Qui sta chi
// ha messo la carta su deluxy.it. Misurato il 31/07/2026: solo 61 delle 1.004
// anagrafiche B2B si ritrovano fra i 10.285 clienti di Orders — sono due
// popolazioni diverse, e mescolarle vorrebbe dire non poter più contare né
// gli uni né gli altri.
//
// ⚠️ È uno SPECCHIO di Orders, che possiede gli ordini (regola del CLAUDE.md di
// radice). I numeri qui dentro sono la fotografia che Orders ha calcolato, con
// scritto quando è stata scattata. Non si correggono a mano: si risincronizza.

// ————————————————————— Vocabolario —————————————————————
// Copiato da `deluxy-orders/src/lib/segmenti.ts` così com'è. Inventarne un
// secondo qui vorrebbe dire che le due app chiamano «fedele» due cose diverse,
// e la prima volta che i numeri non tornano nessuno capisce perché.

export const SEGMENTI = [
  { chiave: "vip", nome: "VIP", colore: "var(--gold-strong)", spiega: "Ha speso almeno 1.000 € o fatto almeno 8 ordini, e compra ancora." },
  { chiave: "da-non-perdere", nome: "Da non perdere", colore: "var(--red)", spiega: "Stessi numeri dei VIP, ma fermo da più di 12 mesi." },
  { chiave: "fedele", nome: "Fedele", colore: "var(--green)", spiega: "Almeno 4 ordini e attivo negli ultimi 12 mesi." },
  { chiave: "ricorrente", nome: "Ricorrente", colore: "var(--blue)", spiega: "2 o 3 ordini, attivo negli ultimi 12 mesi." },
  { chiave: "nuovo", nome: "Nuovo", colore: "var(--purple)", spiega: "Un solo ordine, negli ultimi 90 giorni." },
  { chiave: "una-tantum", nome: "Una tantum", colore: "var(--text-secondary)", spiega: "Un solo ordine, fra 3 e 12 mesi fa." },
  { chiave: "da-riattivare", nome: "Da riattivare", colore: "var(--orange)", spiega: "Fermo fra 12 e 24 mesi." },
  { chiave: "perso", nome: "Perso", colore: "var(--text-tertiary)", spiega: "Fermo da più di 24 mesi." },
] as const;

export const TIPOLOGIE = [
  { chiave: "privato", nome: "Privato", colore: "var(--text-secondary)" },
  { chiave: "azienda", nome: "Azienda", colore: "var(--blue)" },
  { chiave: "horeca", nome: "Hotel / Ristorante", colore: "var(--green)" },
  { chiave: "eventi", nome: "Eventi / Wedding", colore: "var(--purple)" },
  { chiave: "rivenditore", nome: "Rivenditore", colore: "var(--orange)" },
] as const;

export function nomeSegmento(v: string | null): string {
  return SEGMENTI.find((s) => s.chiave === v)?.nome ?? v ?? "—";
}
export function coloreSegmento(v: string | null): string {
  return SEGMENTI.find((s) => s.chiave === v)?.colore ?? "var(--text-tertiary)";
}
export function nomeTipologia(v: string | null): string {
  return TIPOLOGIE.find((t) => t.chiave === v)?.nome ?? v ?? "—";
}
export function coloreTipologia(v: string | null): string {
  return TIPOLOGIE.find((t) => t.chiave === v)?.colore ?? "var(--text-tertiary)";
}

// Da quanto non compra. È il segmento ridotto al solo tempo, che è la domanda
// che ci si fa davvero scorrendo un elenco: «questa persona c'è ancora?».
export function attivita(giorni: number | null): { nome: string; colore: string } {
  if (giorni == null) return { nome: "—", colore: "var(--text-tertiary)" };
  if (giorni <= 90) return { nome: "Attivo", colore: "var(--green)" };
  if (giorni <= 365) return { nome: "Recente", colore: "var(--blue)" };
  if (giorni <= 730) return { nome: "Dormiente", colore: "var(--orange)" };
  return { nome: "Inattivo", colore: "var(--text-tertiary)" };
}

// ————————————————————— Client di Orders —————————————————————

export type ConsumerDaOrders = {
  cliente: string; // codice base64url della chiave, per tornare alla scheda di Orders
  nome: string | null;
  email: string | null;
  telefono: string | null;
  citta: string | null;
  ordini: number;
  annullati?: number;
  speso: number;
  ordineMedio: number;
  primoOrdine?: string | null;
  ultimoOrdine: string | null;
  giorniDallUltimo: number | null;
  brand: string[];
  segmento: string;
  tipologia: string;
  acquisizione?: { canale: string | null; primoOrdine: string | null };
  riepilogo?: { riassunto: string; gusti: string; ordiniConsiderati: number } | null;
};

function base(): string {
  return (process.env.ORDERS_URL ?? "https://deluxy-orders.vercel.app").trim().replace(/\/$/, "");
}

// BOM e a-capo invisibili incollati nelle env fanno fallire l'header con un
// errore illeggibile (ByteString ... 65279): si puliscono qui.
function chiave(): string | null {
  const v = process.env.ORDERS_API_KEY?.replace(/^﻿/, "").trim();
  return v || null;
}

export function ordersConfigurato(): boolean {
  return chiave() != null;
}

// Una pagina di clienti da Orders. `limit` massimo accettato di là: 500.
export async function paginaClienti(page: number, limit = 500): Promise<{ totale: number; pagine: number; clienti: ConsumerDaOrders[] }> {
  const key = chiave();
  if (!key) throw new Error("Manca ORDERS_API_KEY: la sezione Consumers non può sincronizzarsi.");
  const res = await fetch(`${base()}/api/v1/clienti?page=${page}&limit=${limit}`, {
    headers: { "x-api-key": key },
    cache: "no-store",
  });
  if (!res.ok) {
    const testo = await res.text();
    throw new Error(`Orders ha risposto ${res.status}: ${testo.slice(0, 200)}`);
  }
  const j = await res.json();
  return { totale: j.totale ?? 0, pagine: j.pagine ?? 1, clienti: j.clienti ?? [] };
}
