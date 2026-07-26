// Valutazione D2C — la pagella di un partner vista dal cliente finale.
//
// Un partner riceve FEEDBACK (uno per consegna/ordine, da qualunque canale) e
// da quelli si ricava un voto medio su 5. Regole di lettura, valide ovunque:
//  - nessun feedback → «Da valutare», MAI zero: un partner mai valutato non è
//    un partner scarso (stessa regola delle altre pagelle Deluxy);
//  - sotto la soglia di affidabilità il voto si mostra come «indicativo»:
//    due feedback non fanno una media.
// Gli aggregati vivono su Partner (votoD2C, numeroFeedbackD2C, …) e si
// ricalcolano a ogni scrittura, così elenchi, filtri e API non fanno conti.

import { prisma } from "./db";

// Sotto questa soglia il voto esiste ma non è ancora rappresentativo.
export const SOGLIA_AFFIDABILE = 3;

export const VOTO_MIN = 1;
export const VOTO_MAX = 5;

// Canali da cui può arrivare un feedback. Elenco aperto (la sorgente può
// mandarne altri): questo serve al menu della UI e alle etichette.
export const CANALI_FEEDBACK = [
  "whatsapp",
  "email",
  "telefono",
  "modulo",
  "shopify",
  "google",
  "trustpilot",
  "manuale",
] as const;

export type CanaleFeedback = (typeof CANALI_FEEDBACK)[number];

export const ETICHETTE_CANALE: Record<string, string> = {
  whatsapp: "WhatsApp",
  email: "Email",
  telefono: "Telefono",
  modulo: "Modulo online",
  shopify: "Shopify",
  google: "Google",
  trustpilot: "Trustpilot",
  manuale: "Raccolto a mano",
};

// Tag del giudizio: dicono *perché* quel voto. Servono a capire se un partner
// sbaglia sempre la stessa cosa (e a non dedurlo dal testo libero del commento).
export const MOTIVI_FEEDBACK = [
  "puntualita",
  "qualita_prodotto",
  "presentazione",
  "biglietto",
  "comunicazione",
  "cortesia",
  "conformita_ordine",
] as const;

export type MotivoFeedback = (typeof MOTIVI_FEEDBACK)[number];

export const ETICHETTE_MOTIVO: Record<string, string> = {
  puntualita: "Puntualità",
  qualita_prodotto: "Qualità del prodotto",
  presentazione: "Presentazione / confezione",
  biglietto: "Biglietto",
  comunicazione: "Comunicazione",
  cortesia: "Cortesia",
  conformita_ordine: "Conformità all'ordine",
};

// Fasce della valutazione: l'etichetta con cui si legge un voto medio.
export const FASCE = [
  { min: 4.5, chiave: "eccellente", etichetta: "Eccellente", colore: "var(--green)" },
  { min: 4.0, chiave: "buono", etichetta: "Buono", colore: "var(--green)" },
  { min: 3.0, chiave: "sufficiente", etichetta: "Sufficiente", colore: "var(--orange)" },
  { min: 0, chiave: "critico", etichetta: "Critico", colore: "var(--red)" },
] as const;

export const FASCIA_SENZA_DATI = {
  chiave: "da_valutare",
  etichetta: "Da valutare",
  colore: "var(--text-tertiary)",
} as const;

export type Valutazione = {
  /** Media 1–5, oppure null quando non ci sono feedback (≠ zero). */
  voto: number | null;
  /** Quanti feedback l'hanno prodotta. */
  feedback: number;
  etichetta: string;
  colore: string;
  /** false = pochi feedback: il voto è indicativo, non una pagella. */
  affidabile: boolean;
  ultimoFeedback: Date | null;
  aggiornatoIl: Date | null;
};

type PartnerValutabile = {
  votoD2C: number | null;
  numeroFeedbackD2C: number;
  ultimoFeedbackD2C?: Date | null;
  votoD2CAggiornatoIl?: Date | null;
};

// Come si legge il voto di un partner: unica funzione usata da UI e API, così
// scheda, elenco e app esterne raccontano la stessa cosa.
export function valutazioneD2C(p: PartnerValutabile): Valutazione {
  const voto = p.numeroFeedbackD2C > 0 ? p.votoD2C : null;
  const fascia = voto == null ? FASCIA_SENZA_DATI : (FASCE.find((f) => voto >= f.min) ?? FASCE[FASCE.length - 1]);
  const affidabile = p.numeroFeedbackD2C >= SOGLIA_AFFIDABILE;
  return {
    voto,
    feedback: p.numeroFeedbackD2C,
    etichetta: fascia.etichetta,
    colore: fascia.colore,
    affidabile,
    ultimoFeedback: p.ultimoFeedbackD2C ?? null,
    aggiornatoIl: p.votoD2CAggiornatoIl ?? null,
  };
}

// Voto formattato all'italiana ("4,3"); null quando non c'è.
export function formattaVoto(voto: number | null): string | null {
  return voto == null ? null : voto.toFixed(1).replace(".", ",");
}

// Normalizza un voto qualsiasi su 1–5. `scala` è il massimo della sorgente
// (5 stelle, 10 NPS, 100 percentuale): sopra 5 si riproporziona, sotto si
// rifiuta. Fuori range → null (l'API risponde 400: meglio niente che un voto
// inventato).
export function normalizzaVoto(valore: unknown, scala = VOTO_MAX): number | null {
  const v = typeof valore === "number" ? valore : Number(String(valore ?? "").replace(",", "."));
  if (!isFinite(v)) return null;
  const max = isFinite(scala) && scala >= VOTO_MAX ? scala : VOTO_MAX;
  if (v < 0 || v > max) return null;
  const su5 = max === VOTO_MAX ? v : (v / max) * VOTO_MAX;
  const arrotondato = Math.round(su5);
  // Uno 0 su 10 resta il voto peggiore possibile (1 stella), non "nessun voto".
  return Math.min(VOTO_MAX, Math.max(VOTO_MIN, arrotondato));
}

// Ricalcola gli aggregati del partner dai suoi feedback. Da chiamare dopo ogni
// inserimento/cancellazione: è la sola strada che scrive votoD2C.
export async function ricalcolaValutazioneD2C(partnerId: string): Promise<Valutazione> {
  const agg = await prisma.feedbackD2C.aggregate({
    where: { partnerId },
    _avg: { voto: true },
    _count: { _all: true },
    _max: { dataFeedback: true },
  });
  const numero = agg._count._all;
  const media = numero > 0 && agg._avg.voto != null ? Math.round(agg._avg.voto * 100) / 100 : null;
  const aggiornato = await prisma.partner.update({
    where: { id: partnerId },
    data: {
      votoD2C: media,
      numeroFeedbackD2C: numero,
      ultimoFeedbackD2C: agg._max.dataFeedback ?? null,
      votoD2CAggiornatoIl: new Date(),
    },
    select: {
      votoD2C: true,
      numeroFeedbackD2C: true,
      ultimoFeedbackD2C: true,
      votoD2CAggiornatoIl: true,
    },
  });
  return valutazioneD2C(aggiornato);
}

type FeedbackSerializzabile = {
  id: string;
  partnerId: string;
  voto: number;
  votoOriginale: number | null;
  scala: number;
  canale: string | null;
  sistema: string;
  idEsterno: string | null;
  ordine: string | null;
  cliente: string | null;
  commento: string | null;
  motivi: string[];
  dataFeedback: Date;
  creatoIl: Date;
};

// Forma JSON di un singolo feedback nelle API.
export function serializzaFeedback(f: FeedbackSerializzabile) {
  return {
    id: f.id,
    partnerId: f.partnerId,
    voto: f.voto,
    votoOriginale: f.votoOriginale,
    scala: f.scala,
    canale: f.canale,
    sistema: f.sistema,
    idEsterno: f.idEsterno,
    ordine: f.ordine,
    cliente: f.cliente,
    commento: f.commento,
    motivi: f.motivi,
    dataFeedback: f.dataFeedback,
    creatoIl: f.creatoIl,
  };
}

// Media di un insieme di anagrafiche (le sedi di un'insegna): pesata sul
// numero di feedback, non media di medie — una sede con 40 feedback conta più
// di una con 2. Restituisce null se nessuna sede ha feedback.
export function valutazioneAggregata(righe: PartnerValutabile[]): { voto: number | null; feedback: number } {
  let somma = 0;
  let feedback = 0;
  for (const r of righe) {
    if (r.numeroFeedbackD2C > 0 && r.votoD2C != null) {
      somma += r.votoD2C * r.numeroFeedbackD2C;
      feedback += r.numeroFeedbackD2C;
    }
  }
  return { voto: feedback > 0 ? Math.round((somma / feedback) * 100) / 100 : null, feedback };
}
