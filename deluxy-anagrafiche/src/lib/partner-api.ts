import { Prisma } from "@prisma/client";
import { CAMPI_FINANZIARI } from "./insegna";
import { isStato, isStatoFinanziario, normalizzaStatoAnalisi } from "./stati";

// Campi scalari accettati in scrittura dalle API (POST/PATCH).
const CAMPI_TESTO = [
  "nome",
  "ragioneSociale",
  "categoria",
  "tipoProspect",
  // i tre stati dell'azienda: commerciale (storico `stato`), finanziario, analisi
  "stato",
  "statoFinanziario",
  "statoAnalisi",
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
  // dati finanziari / fatturazione (condivisi tra le sedi della stessa insegna)
  "pec",
  "codiceSdi",
  "iban",
  "banca",
  "metodoPagamento",
  "condizioniPagamento",
  "noteAmministrative",
  "amministrazioneNome",
  "amministrazioneTelefono",
  "amministrazioneEmail",
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
  // Simmetria lettura/scrittura: la risposta annida i campi finanziari sotto
  // `datiFinanziari`; accettiamo la stessa forma in ingresso (oltre a quella
  // piatta) sollevandone i campi al primo livello — così un'app può rispedire
  // esattamente ciò che ha letto.
  if (body.datiFinanziari && typeof body.datiFinanziari === "object") {
    const nidi = body.datiFinanziari as Record<string, unknown>;
    for (const campo of CAMPI_FINANZIARI) {
      if (campo in nidi && !(campo in body)) body = { ...body, [campo]: nidi[campo] };
    }
  }

  // `stato` è lo stato COMMERCIALE: `statoCommerciale` è il suo sinonimo
  // esplicito, per le app che scrivono le tre dimensioni con nomi simmetrici.
  if ("statoCommerciale" in body && !("stato" in body)) {
    body = { ...body, stato: body.statoCommerciale };
  }

  const dati: Record<string, unknown> = {};

  for (const campo of CAMPI_TESTO) {
    if (campo in body) dati[campo] = pulisci(body[campo]);
  }

  if (perCreazione && !dati.nome) return { errore: "Il campo 'nome' è obbligatorio" };
  if ("nome" in dati && dati.nome === null) return { errore: "Il campo 'nome' non può essere vuoto" };

  if (dati.categoria) dati.categoria = String(dati.categoria).toUpperCase();
  // Normalizzazioni finanziarie (stesse regole della UI)
  if (dati.iban) dati.iban = String(dati.iban).replace(/\s+/g, "").toUpperCase();
  if (dati.codiceSdi) dati.codiceSdi = String(dati.codiceSdi).toUpperCase();
  if (dati.stato && !isStato(String(dati.stato))) {
    return { errore: `Stato non valido: '${dati.stato}'` };
  }
  if (dati.statoFinanziario && !isStatoFinanziario(String(dati.statoFinanziario))) {
    return { errore: `Stato finanziario non valido: '${dati.statoFinanziario}'` };
  }
  if (dati.statoAnalisi) {
    // FINANCE manda "P.P." / "Nuovo" / "Dismesso": si normalizza sullo slug
    const normalizzato = normalizzaStatoAnalisi(String(dati.statoAnalisi));
    if (!normalizzato) return { errore: `Stato analisi non valido: '${dati.statoAnalisi}'` };
    dati.statoAnalisi = normalizzato;
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
    // Le linee sono i nomi canonici del master Scout: si accettano così come
    // arrivano (Scout manda "Consegne", "Eventi & Catering", …), solo ripuliti
    // e deduplicati. Il catalogo vive in Scout, non qui.
    dati.interessi = [
      ...new Set((body.interessi as unknown[]).map((v) => String(v).trim()).filter(Boolean)),
    ];
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

type PartnerConContatti = Prisma.PartnerGetPayload<{ include: { contatti: true } }> & {
  riferimenti?: { sistema: string; idEsterno: string }[];
};

// Estrae dalla provenienza per campo solo i campi finanziari: per ciascuno
// chi l'ha scritto (`sistema`) e la freschezza dichiarata (`asOf`).
function provenienzaFinanziaria(prov: unknown): Record<string, { sistema: string; asOf?: string }> {
  const p = (prov ?? {}) as Record<string, { sistema: string; asOf?: string }>;
  const out: Record<string, { sistema: string; asOf?: string }> = {};
  for (const campo of CAMPI_FINANZIARI) {
    if (p[campo]) out[campo] = p[campo];
  }
  return out;
}

// Rappresentazione JSON esposta dalle API
export function serializzaPartner(p: PartnerConContatti) {
  return {
    id: p.id,
    nome: p.nome,
    ragioneSociale: p.ragioneSociale,
    categoria: p.categoria,
    tipoProspect: p.tipoProspect,
    // Le tre dimensioni di stato dell'azienda. `stato` resta il nome storico
    // dello stato commerciale (compatibilità); `statoCommerciale` è l'alias
    // esplicito con cui leggerle simmetricamente.
    stato: p.stato,
    statoCommerciale: p.stato,
    statoFinanziario: p.statoFinanziario,
    statoAnalisi: p.statoAnalisi,
    citta: p.citta,
    provincia: p.provincia,
    regione: p.regione,
    indirizzo: p.indirizzo,
    email: p.email,
    telefono: p.telefono,
    pIva: p.pIva,
    codiceFiscale: p.codiceFiscale,
    // Dati finanziari della società: condivisi tra tutte le sedi della stessa
    // insegna. `aggiornamenti` dice chi li ha scritti e quando (asOf), così le
    // app capiscono se il registro ha una versione più fresca della loro.
    datiFinanziari: {
      pec: p.pec,
      codiceSdi: p.codiceSdi,
      iban: p.iban,
      banca: p.banca,
      metodoPagamento: p.metodoPagamento,
      condizioniPagamento: p.condizioniPagamento,
      noteAmministrative: p.noteAmministrative,
      amministrazioneNome: p.amministrazioneNome,
      amministrazioneTelefono: p.amministrazioneTelefono,
      amministrazioneEmail: p.amministrazioneEmail,
      aggiornamenti: provenienzaFinanziaria(p.provenienza),
    },
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
    hubspotId: p.hubspotId,
    // Riferimenti esterni per il join cross-app (sistema → id di quell'app)
    riferimenti: (p.riferimenti ?? []).map((r) => ({ sistema: r.sistema, idEsterno: r.idEsterno })),
    fonte: p.fonte,
    attivo: p.attivo,
    creatoIl: p.creatoIl,
    aggiornatoIl: p.aggiornatoIl,
  };
}
