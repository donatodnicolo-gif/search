// Catalogo delle TIPOLOGIE di chiave API con cui le altre app chiamano il
// registro. Ogni "ambito" corrisponde a un permesso vero, controllato in
// `src/lib/api-auth.ts`: qui c'è solo il nome leggibile e la spiegazione di
// cosa sblocca. Aggiungendo un ambito nuovo vanno toccati tre punti nello
// stesso commit: la colonna in `prisma/schema.prisma`, il controllo in
// `autentica()` e questa lista.
//
// ⚠️ FINO AL 27/08/2026 la lettura era implicita: ogni chiave attiva vedeva
// TUTTO, IBAN e rubrica compresi. Non era un difetto di una rotta, era il
// modello dei permessi ad avere un asse solo — diceva chi SCRIVE cosa, mai chi
// LEGGE cosa. Provato dal vivo: con una chiave di sola lettura si legge l'IBAN
// di un fornitore, e camminando sulle pagine si raccoglie l'intero registro.
//
// Adesso gli assi sono due. La lettura di BASE (aziende: nome, indirizzo,
// stati, categorie) resta implicita; i due pezzi che fanno male hanno il loro
// ambito: «Dati finanziari» e «Persone». Sono ambiti di LETTURA, e per questo
// il predefinito è chiuso.

export type Ambito = "scrittura" | "partner" | "referenti" | "feedback" | "finanziari" | "persone";

export type PermessiChiave = {
  leggeDatiFinanziari: boolean;
  leggePersone: boolean;
  scrittura: boolean;
  scritturaPartner: boolean;
  scritturaReferenti: boolean;
  scritturaFeedback: boolean;
};

export const PERMESSI_VUOTI: PermessiChiave = {
  leggeDatiFinanziari: false,
  leggePersone: false,
  scrittura: false,
  scritturaPartner: false,
  scritturaReferenti: false,
  scritturaFeedback: false,
};

export const AMBITI: {
  id: Ambito;
  campo: keyof PermessiChiave;
  nome: string;
  descrizione: string;
  endpoint: string;
  colore: string;
}[] = [
  {
    id: "finanziari",
    campo: "leggeDatiFinanziari",
    nome: "Dati finanziari (lettura)",
    descrizione:
      "Fa uscire IBAN, intestatario del conto, PEC, SDI e contatto amministrativo. Senza, quel blocco è null. Da dare solo a chi paga o fattura davvero: col registro usato anche per i fornitori, è la superficie da frode del bonifico.",
    endpoint: "blocco datiFinanziari in GET /api/v1/partners",
    colore: "var(--red)",
  },
  {
    id: "persone",
    campo: "leggePersone",
    nome: "Persone (lettura)",
    descrizione:
      "Fa uscire i referenti (nome, telefono, email) e i valet (codice fiscale, indirizzo). Senza, i referenti sono null e /api/v1/valet risponde 403. Da negare alle app che rigirano la risposta al browser dei loro utenti.",
    endpoint: "contatti in GET /api/v1/partners · GET /api/v1/valet",
    colore: "var(--purple)",
  },
  {
    id: "scrittura",
    campo: "scrittura",
    nome: "Scrittura piena",
    descrizione:
      "Crea, modifica e archivia le anagrafiche: tutto il golden record. Da dare solo alle app che possiedono il dato.",
    endpoint: "POST/PATCH/DELETE /api/v1/partners",
    colore: "var(--red)",
  },
  {
    id: "partner",
    campo: "scritturaPartner",
    nome: "Upsert partner",
    descrizione:
      "Solo POST dei partner (niente PATCH né DELETE), ma può dichiarare stato e interessi: è il permesso dei driver di prima parte, come Scout.",
    endpoint: "POST /api/v1/partners",
    colore: "var(--purple)",
  },
  {
    id: "referenti",
    campo: "scritturaReferenti",
    nome: "Archivio referenti",
    descrizione: "Archivia o ripristina un referente. Non tocca nient'altro dell'anagrafica.",
    endpoint: "POST /api/v1/referenti/archivia",
    colore: "var(--blue)",
  },
  {
    id: "feedback",
    campo: "scritturaFeedback",
    nome: "Feedback D2C",
    descrizione:
      "Manda i giudizi interni sulle consegne (voto, motivi, autore) senza poter toccare il golden record.",
    endpoint: "POST /api/v1/feedback",
    colore: "var(--gold-strong)",
  },
];

// Tipologie preconfezionate: sono le combinazioni che usiamo davvero, così chi
// crea una chiave sceglie un mestiere invece di spuntare permessi a caso.
// «Personalizzata» è la via d'uscita per le combinazioni fuori catalogo.
export const TIPOLOGIE: { id: string; nome: string; descrizione: string; ambiti: Ambito[] }[] = [
  {
    id: "lettura",
    nome: "Sola lettura",
    descrizione: "Interroga il registro e basta. È la tipologia predefinita per le app che consumano le anagrafiche.",
    ambiti: [],
  },
  {
    id: "lettura-aziende",
    nome: "Sola lettura — solo aziende",
    descrizione:
      "Legge le anagrafiche senza vedere né le persone né i dati bancari. È la tipologia giusta per le app che mostrano il registro ai propri utenti.",
    ambiti: [],
  },
  {
    id: "lettura-completa",
    nome: "Sola lettura — con persone e fatturazione",
    descrizione: "Legge tutto ma non scrive niente. Da dare solo a chi ha bisogno della rubrica o dell'IBAN.",
    ambiti: ["finanziari", "persone"],
  },
  {
    id: "scrittura",
    nome: "Scrittura piena",
    descrizione: "Possiede il dato: crea, modifica, archivia. Oggi ce l'hanno la piattaforma consegne e FINANCE.",
    ambiti: ["scrittura"],
  },
  {
    id: "fatturazione",
    nome: "Fatturazione (FINANCE)",
    descrizione: "Scrive il golden record e legge la fatturazione: è il mestiere di chi emette fatture e paga.",
    ambiti: ["scrittura", "finanziari", "persone"],
  },
  {
    id: "partner",
    nome: "Driver di prima parte",
    descrizione: "Crea e aggiorna partner dichiarando stato e interessi, senza poter cancellare (Scout).",
    ambiti: ["partner"],
  },
  {
    id: "referenti",
    nome: "Archivio referenti",
    descrizione: "Sistema solo le persone: archivia e ripristina i referenti.",
    ambiti: ["referenti"],
  },
  {
    id: "feedback",
    nome: "Feedback D2C",
    descrizione: "Manda i giudizi interni sulle consegne (candidato: Deluxy Customer Service).",
    ambiti: ["feedback"],
  },
];

export const TIPOLOGIA_PERSONALIZZATA = {
  id: "personalizzata",
  nome: "Personalizzata",
  descrizione: "Combinazione di permessi fuori dalle tipologie standard.",
};

export function ambitiDi(p: PermessiChiave): Ambito[] {
  return AMBITI.filter((a) => p[a.campo]).map((a) => a.id);
}

export function permessiDa(ambiti: string[]): PermessiChiave {
  const permessi = { ...PERMESSI_VUOTI };
  for (const a of AMBITI) if (ambiti.includes(a.id)) permessi[a.campo] = true;
  return permessi;
}

// Nome della tipologia a partire dai permessi: si cerca la combinazione esatta
// nel catalogo, altrimenti è "Personalizzata".
export function tipologiaDi(p: PermessiChiave): { id: string; nome: string; descrizione: string } {
  const ambiti = ambitiDi(p);
  const trovata = TIPOLOGIE.find(
    (t) => t.ambiti.length === ambiti.length && t.ambiti.every((a) => ambiti.includes(a)),
  );
  return trovata ?? TIPOLOGIA_PERSONALIZZATA;
}

export function isAmbito(v: string): v is Ambito {
  return AMBITI.some((a) => a.id === v);
}

// Il nome è anche la "sorgente" nella provenienza dei dati e nel ranking del
// merge: niente spazi o maiuscole, così resta uguale a come lo scrivono gli
// script (`npm run chiave -- <nome>`).
export function normalizzaNomeChiave(v: string): string {
  return v
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
