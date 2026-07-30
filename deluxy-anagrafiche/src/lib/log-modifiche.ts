// Registro delle modifiche: chi ha cambiato cosa, e da che valore a che valore.
//
// Tre cose che questo log fa e che prima non si potevano sapere:
//  - la STORIA di un campo, non solo l'ultimo scrittore (`provenienza` tiene
//    solo l'ultimo, e solo per i campi finanziari);
//  - le modifiche ai REFERENTI, che non lasciavano traccia da nessuna parte;
//  - le CANCELLAZIONI: un referente rimosso o un feedback eliminato oggi
//    sparivano senza dire chi li avesse toccati.
//
// Gli stati continuano a vivere in `PassaggioStato` (lo leggono anche le API):
// la timeline della scheda unisce i due flussi invece di duplicarli.

import { prisma } from "./db";

// I valori si salvano come testo: un log si legge, non si ricalcola. Le note
// lunghe si troncano — serve a capire cosa è cambiato, non a conservare il
// testo intero (quello sta sul record).
const LUNGHEZZA_MAX = 240;

export type Cambio = { campo: string; da?: unknown; a?: unknown };

export type ContestoModifica = {
  /** "ui" oppure il nome della chiave API dell'app che ha scritto. */
  origine: string;
  /** La persona, quando la conosciamo (con la password condivisa: quasi mai). */
  autore?: string | null;
  contattoId?: string | null;
  entita?: "partner" | "contatto" | "sede" | "feedback" | "valet";
};

export function testoValore(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "boolean") return v ? "sì" : "no";
  if (Array.isArray(v)) return v.length ? v.map((x) => String(x)).join(", ") : null;
  const s = String(v).trim();
  if (s === "") return null;
  return s.length > LUNGHEZZA_MAX ? `${s.slice(0, LUNGHEZZA_MAX)}…` : s;
}

// Confronto campo per campo fra il record prima e i valori nuovi. Si scartano i
// campi che non cambiano davvero (null e stringa vuota sono la stessa cosa:
// senza questo, ogni salvataggio della scheda scriverebbe decine di righe
// finte e il log diventerebbe illeggibile).
export function diffCampi(
  prima: Record<string, unknown> | null | undefined,
  dopo: Record<string, unknown>,
  campi?: readonly string[],
): Cambio[] {
  const daGuardare = campi ?? Object.keys(dopo);
  const cambi: Cambio[] = [];
  for (const campo of daGuardare) {
    if (!(campo in dopo)) continue;
    const vecchio = testoValore(prima?.[campo]);
    const nuovo = testoValore(dopo[campo]);
    if (vecchio === nuovo) continue;
    cambi.push({ campo, da: vecchio, a: nuovo });
  }
  return cambi;
}

// Scrive le righe di log. Non fa mai fallire l'operazione che l'ha chiamata: un
// log che non parte è un fastidio, un salvataggio che si rompe per colpa del
// log è un danno.
export async function registraModifiche(
  partnerId: string,
  contesto: ContestoModifica,
  cambi: Cambio[],
): Promise<void> {
  if (cambi.length === 0) return;
  try {
    await prisma.modifica.createMany({
      data: cambi.map((c) => ({
        partnerId,
        contattoId: contesto.contattoId ?? null,
        entita: contesto.entita ?? (contesto.contattoId ? "contatto" : "partner"),
        campo: c.campo,
        da: testoValore(c.da),
        a: testoValore(c.a),
        origine: contesto.origine,
        autore: contesto.autore?.trim() || null,
      })),
    });
  } catch {
    // silenzio voluto: vedi sopra
  }
}

export async function registraModifica(
  partnerId: string,
  contesto: ContestoModifica,
  cambio: Cambio,
): Promise<void> {
  await registraModifiche(partnerId, contesto, [cambio]);
}

// Stesse righe, soggetto diverso: un valet non appartiene a nessuna azienda,
// quindi il log si aggancia a lui (`valetId`) e non a un partner. Due funzioni
// separate invece di un parametro «soggetto» per non riscrivere i quindici
// punti che già loggano sui partner e che sono verificati.
export async function registraModificheValet(
  valetId: string,
  contesto: Omit<ContestoModifica, "contattoId" | "entita">,
  cambi: Cambio[],
): Promise<void> {
  if (cambi.length === 0) return;
  try {
    await prisma.modifica.createMany({
      data: cambi.map((c) => ({
        valetId,
        entita: "valet",
        campo: c.campo,
        da: testoValore(c.da),
        a: testoValore(c.a),
        origine: contesto.origine,
        autore: contesto.autore?.trim() || null,
      })),
    });
  } catch {
    // come sopra: il log non deve far fallire il salvataggio
  }
}

export async function registraModificaValet(
  valetId: string,
  contesto: Omit<ContestoModifica, "contattoId" | "entita">,
  cambio: Cambio,
): Promise<void> {
  await registraModificheValet(valetId, contesto, [cambio]);
}

// Nomi leggibili: nel log si legge «Codice SDI», non «codiceSdi».
export const ETICHETTE_CAMPO: Record<string, string> = {
  nome: "Nome / Insegna",
  ragioneSociale: "Ragione sociale",
  categoria: "Tipologia",
  citta: "Città",
  provincia: "Provincia",
  regione: "Regione",
  indirizzo: "Indirizzo",
  email: "Email",
  telefono: "Telefono",
  pIva: "P. IVA",
  codiceFiscale: "Codice fiscale",
  account: "Account commerciale",
  note: "Note",
  ultimaVisita: "Ultimo contatto",
  interessi: "Linee di interesse",
  pec: "PEC",
  codiceSdi: "Codice SDI",
  iban: "IBAN",
  banca: "Banca",
  metodoPagamento: "Metodo di pagamento",
  condizioniPagamento: "Condizioni di pagamento",
  gruppoPagamento: "Gruppo di pagamento",
  noteAmministrative: "Note amministrative",
  amministrazioneNome: "Contatto amministrativo",
  amministrazioneTelefono: "Telefono amministrazione",
  amministrazioneEmail: "Email amministrazione",
  hubspotId: "Collegamento HubSpot",
  platformId: "Collegamento piattaforma",
  capogruppoId: "Gruppo / sede madre",
  tipoProspect: "Tipo prospect",
  statoFinanziario: "Stato finanziario",
  statoAnalisi: "Stato analisi",
  stato: "Stato commerciale",
  // valet
  cognome: "Cognome",
  provinceServite: "Province servite",
  mezzo: "Mezzo",
  // referenti
  ruolo: "Ruolo",
  nomeRubrica: "Nome su rubrica",
  archiviato: "Referente archiviato",
  // azioni (non campi)
  creata: "Anagrafica creata",
  creato: "Referente aggiunto",
  eliminato: "Referente rimosso",
  spostato: "Referente spostato",
  sede_creata: "Sede aggiunta",
  sede_collegata: "Sede collegata",
  sede_sganciata: "Sede sganciata",
  feedback_aggiunto: "Feedback aggiunto",
  feedback_eliminato: "Feedback eliminato",
  archiviata: "Anagrafica archiviata",
  ripristinata: "Anagrafica ripristinata",
};

export function etichettaCampo(campo: string): string {
  return ETICHETTE_CAMPO[campo] ?? campo;
}

// I campi che non sono un cambio di valore ma un fatto: nel log si mostrano
// come una frase, senza la freccia «da → a».
const AZIONI = new Set([
  "creata",
  "creato",
  "eliminato",
  "spostato",
  "sede_creata",
  "sede_collegata",
  "sede_sganciata",
  "feedback_aggiunto",
  "feedback_eliminato",
  "archiviata",
  "ripristinata",
]);

export function eAzione(campo: string): boolean {
  return AZIONI.has(campo);
}

// Da dove arriva la modifica, in italiano.
export function etichettaOrigine(origine: string): string {
  if (origine === "ui") return "dal registro";
  if (origine === "excel") return "dal tracker Excel";
  if (origine === "hubspot") return "da HubSpot";
  return origine;
}
