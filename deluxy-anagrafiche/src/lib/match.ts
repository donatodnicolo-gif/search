import type { Partner } from "@prisma/client";
import { prisma } from "./db";
import { whereRicerca } from "./ricerca";

const norm = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export type TipoMatch = "piva" | "codice_fiscale" | "nome_citta" | "nome" | "vuota";
export type EsitoMatch = "agganciata" | "candidati" | "nessuna";
export type Confidenza = "alta" | "media" | "nessuna";

export type RisultatoMatch = {
  tipo: TipoMatch;
  esito: EsitoMatch;
  confidenza: Confidenza;
  match: Partner | null;
  candidati: Partner[];
};

// Risoluzione dell'identità per il "primo contatto senza id", in ordine di
// certezza: P.IVA → codice fiscale → nome+città. È il gemello in lettura della
// cascata di scrittura del POST. Ogni criterio che NON aggancia ricade sul
// successivo (così una P.IVA che non è nel registro non chiude la ricerca:
// si prova comunque per nome).
export async function risolviMatch(input: {
  pIva?: string | null;
  codiceFiscale?: string | null;
  nome?: string | null;
  citta?: string | null;
}): Promise<RisultatoMatch> {
  const pIva = input.pIva?.trim();
  const cf = input.codiceFiscale?.trim();
  const nome = input.nome?.trim();
  const citta = input.citta?.trim();

  // P.IVA — identità forte: se aggancia, si chiude qui.
  if (pIva) {
    const match = await prisma.partner.findFirst({ where: { pIva, attivo: true } });
    if (match) return { tipo: "piva", esito: "agganciata", confidenza: "alta", match, candidati: [] };
  }
  // Codice fiscale — identità forte.
  if (cf) {
    const match = await prisma.partner.findFirst({ where: { codiceFiscale: cf, attivo: true } });
    if (match) return { tipo: "codice_fiscale", esito: "agganciata", confidenza: "alta", match, candidati: [] };
  }
  // Nome (+ città) — ricade qui se P.IVA/CF non hanno agganciato.
  if (nome) {
    const tipo: TipoMatch = citta ? "nome_citta" : "nome";
    const trovati = await prisma.partner.findMany({
      where: { attivo: true, AND: whereRicerca(nome), ...(citta ? { citta: citta.toUpperCase() } : {}) },
      take: 10,
      orderBy: { nome: "asc" },
    });
    const nn = norm(nome);
    const esatti = trovati.filter((p) => norm(p.nome) === nn);
    if (esatti.length === 1) {
      // nome esatto: alta se anche la città vincola, altrimenti media (omonimi)
      return { tipo, esito: "agganciata", confidenza: citta ? "alta" : "media", match: esatti[0], candidati: [] };
    }
    if (esatti.length > 1) return { tipo, esito: "candidati", confidenza: "media", match: null, candidati: esatti };
    if (trovati.length === 1) return { tipo, esito: "agganciata", confidenza: "media", match: trovati[0], candidati: [] };
    if (trovati.length > 1) return { tipo, esito: "candidati", confidenza: "nessuna", match: null, candidati: trovati };
  }

  // Niente ha agganciato: esito "nessuna" col tipo del criterio più forte fornito.
  const tipo: TipoMatch = pIva ? "piva" : cf ? "codice_fiscale" : nome ? (citta ? "nome_citta" : "nome") : "vuota";
  return { tipo, esito: "nessuna", confidenza: "nessuna", match: null, candidati: [] };
}

// Vista sintetica di un partner per la risposta di match
export function sintesiPartner(p: Partner) {
  return { id: p.id, nome: p.nome, categoria: p.categoria, citta: p.citta, provincia: p.provincia, stato: p.stato };
}
