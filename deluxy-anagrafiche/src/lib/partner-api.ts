import { Prisma } from "@prisma/client";
import { isInteresse } from "./interessi";
import { isStato } from "./stati";

// Campi scalari accettati in scrittura dalle API (POST/PATCH).
const CAMPI_TESTO = [
  "nome",
  "ragioneSociale",
  "categoria",
  "tipoProspect",
  "stato",
  "citta",
  "provincia",
  "regione",
  "indirizzo",
  "email",
  "telefono",
  "pIva",
  "codiceFiscale",
  "account",
  "note",
  "contattiRaw",
  "platformId",
  "fonte",
] as const;

export type ContattoInput = {
  ruolo?: string | null;
  nome?: string | null;
  telefono?: string | null;
  email?: string | null;
};

export type ErroreValidazione = { errore: string };

function pulisci(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

// Converte il body JSON in dati Prisma. Con `perCreazione` esige il nome.
export function validaPartner(
  body: Record<string, unknown>,
  perCreazione: boolean,
): { dati: Prisma.PartnerUncheckedCreateInput; contatti?: ContattoInput[] } | ErroreValidazione {
  const dati: Record<string, unknown> = {};

  for (const campo of CAMPI_TESTO) {
    if (campo in body) dati[campo] = pulisci(body[campo]);
  }

  if (perCreazione && !dati.nome) return { errore: "Il campo 'nome' è obbligatorio" };
  if ("nome" in dati && dati.nome === null) return { errore: "Il campo 'nome' non può essere vuoto" };

  if (dati.categoria) dati.categoria = String(dati.categoria).toUpperCase();
  if (dati.stato && !isStato(String(dati.stato))) {
    return { errore: `Stato non valido: '${dati.stato}'` };
  }

  if ("ultimaVisita" in body) {
    const v = pulisci(body.ultimaVisita);
    if (v === null) {
      dati.ultimaVisita = null;
    } else {
      const data = new Date(v);
      if (isNaN(data.getTime())) return { errore: `Data 'ultimaVisita' non valida: '${v}'` };
      dati.ultimaVisita = data;
    }
  }

  if ("datiExtra" in body) {
    dati.datiExtra = body.datiExtra == null ? null : JSON.stringify(body.datiExtra);
  }

  if ("attivo" in body) dati.attivo = Boolean(body.attivo);

  if ("interessi" in body) {
    if (!Array.isArray(body.interessi)) return { errore: "'interessi' deve essere una lista" };
    // valori fuori catalogo scartati in silenzio (catalogo in src/lib/interessi.ts)
    dati.interessi = (body.interessi as unknown[])
      .map((v) => String(v).trim().toLowerCase().replace(/[\s-]+/g, "_"))
      .filter(isInteresse);
  }

  let contatti: ContattoInput[] | undefined;
  if ("contatti" in body) {
    if (!Array.isArray(body.contatti)) return { errore: "'contatti' deve essere una lista" };
    contatti = (body.contatti as Record<string, unknown>[]).map((c) => ({
      ruolo: pulisci(c?.ruolo),
      nome: pulisci(c?.nome),
      telefono: pulisci(c?.telefono),
      email: pulisci(c?.email),
    }));
  }

  return { dati: dati as Prisma.PartnerUncheckedCreateInput, contatti };
}

type PartnerConContatti = Prisma.PartnerGetPayload<{ include: { contatti: true } }>;

// Rappresentazione JSON esposta dalle API
export function serializzaPartner(p: PartnerConContatti) {
  return {
    id: p.id,
    nome: p.nome,
    ragioneSociale: p.ragioneSociale,
    categoria: p.categoria,
    tipoProspect: p.tipoProspect,
    stato: p.stato,
    citta: p.citta,
    provincia: p.provincia,
    regione: p.regione,
    indirizzo: p.indirizzo,
    email: p.email,
    telefono: p.telefono,
    pIva: p.pIva,
    codiceFiscale: p.codiceFiscale,
    account: p.account,
    ultimaVisita: p.ultimaVisita,
    interessi: p.interessi,
    note: p.note,
    contattiRaw: p.contattiRaw,
    datiExtra: p.datiExtra ? JSON.parse(p.datiExtra) : null,
    contatti: p.contatti.map((c) => ({
      id: c.id,
      ruolo: c.ruolo,
      nome: c.nome,
      telefono: c.telefono,
      email: c.email,
    })),
    platformId: p.platformId,
    fonte: p.fonte,
    attivo: p.attivo,
    creatoIl: p.creatoIl,
    aggiornatoIl: p.aggiornatoIl,
  };
}
