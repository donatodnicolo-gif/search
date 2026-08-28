import { Prisma } from "@prisma/client";
import { prisma } from "./db";

// CHI FATTURA — modello semplice (28/08/2026, richiesta dell'utente).
//
// Un CAPOGRUPPO ha dentro AZIENDE, e ognuna «paga da sé» oppure «paga la
// capogruppo». La fatturazione (P.IVA, IBAN, PEC, SDI, intestatario, ecc.) vive:
//   · sull'AZIENDA        quando pagaDaSe = true
//   · sulla CAPOGRUPPO    quando pagaDaSe = false (la paga lei per le sue aziende)
//
// È l'unico raggruppamento del registro: ha sostituito i tre di prima (società
// fiscale, entità, insegna), che confondevano perché usavano la stessa parola.

export const CAMPI_IDENTITA = ["pIva", "codiceFiscale"] as const;
export const CAMPI_FATTURAZIONE = [
  "pec", "codiceSdi", "iban", "intestatarioConto", "banca", "metodoPagamento",
  "condizioniPagamento", "gruppoPagamento", "noteAmministrative",
  "amministrazioneNome", "amministrazioneTelefono", "amministrazioneEmail",
] as const;
export const CAMPI_FISCALI = [...CAMPI_IDENTITA, ...CAMPI_FATTURAZIONE] as const;
export type CampoFiscale = (typeof CAMPI_FISCALI)[number];

// Include da usare dovunque si legga un'anagrafica per rispondere «chi fattura».
export const INCLUDE_CAPOGRUPPO = { capogruppo: true } as const;

type ConCapogruppo = {
  pagaDaSe?: boolean;
  provenienza?: unknown;
  capogruppo?: (Prisma.CapogruppoGetPayload<object>) | null;
} & Partial<Record<CampoFiscale, string | null>>;

export type Fatturazione = Record<CampoFiscale, string | null> & {
  pagaDaSe: boolean;
  // Il capogruppo a cui l'azienda appartiene (per farlo vedere / linkare).
  capogruppo: { id: string; nome: string } | null;
  // true = la fatturazione mostrata è della capogruppo, non dell'azienda.
  dallaCapogruppo: boolean;
  aggiornamenti: Record<string, { sistema: string; asOf?: string }>;
};

// La fatturazione di un'azienda: la sua se paga da sé, altrimenti quella della
// capogruppo. ⚠️ Vuoto vuol dire «non lo sappiamo», non «zero».
export function leggiFatturazione(p: ConCapogruppo): Fatturazione {
  const pagaDaSe = p.pagaDaSe !== false;
  const capo = p.capogruppo ?? null;
  const fonte: Record<string, unknown> = pagaDaSe ? (p as Record<string, unknown>) : ((capo ?? {}) as Record<string, unknown>);
  const prov = ((pagaDaSe ? p.provenienza : capo?.provenienza) ?? {}) as Record<string, { sistema: string; asOf?: string }>;
  const aggiornamenti: Fatturazione["aggiornamenti"] = {};
  for (const c of CAMPI_FISCALI) if (prov[c]) aggiornamenti[c] = prov[c];
  const out = {
    pagaDaSe,
    capogruppo: capo ? { id: capo.id, nome: capo.nome } : null,
    dallaCapogruppo: !pagaDaSe && !!capo,
    aggiornamenti,
  } as Fatturazione;
  for (const c of CAMPI_FISCALI) out[c] = (fonte[c] as string | null) ?? null;
  return out;
}

// Il capogruppo con dentro le sue aziende: per la pagina /capogruppo e per
// rispondere «quali aziende ne fanno parte».
export function leggiCapogruppoConAziende(id: string) {
  return prisma.capogruppo.findUnique({
    where: { id },
    include: {
      aziende: {
        where: { attivo: true },
        select: { id: true, nome: true, citta: true, sede: true, stato: true, pagaDaSe: true },
        orderBy: [{ citta: "asc" }, { nome: "asc" }],
      },
    },
  });
}

// Mette un'azienda dentro un capogruppo (o la toglie, con nome vuoto). Il
// capogruppo si cerca per NOME e nasce se non c'è: chi lavora scrive «MONCLER».
// ⚠️ Confronto senza maiuscole/spazi, se no «Chanel» e «CHANEL» sono due gruppi.
export async function assegnaCapogruppo(
  partnerId: string,
  nomeCapogruppo: string | null,
): Promise<{ ok: true; capogruppo: { id: string; nome: string } | null } | { ok: false; errore: string }> {
  const nome = nomeCapogruppo?.trim() ?? "";
  if (!nome) {
    await prisma.partner.update({ where: { id: partnerId }, data: { capogruppoId: null } });
    return { ok: true, capogruppo: null };
  }
  const esistente = await prisma.capogruppo.findFirst({
    where: { nome: { equals: nome, mode: "insensitive" } },
    select: { id: true, nome: true },
  });
  const c = esistente ?? (await prisma.capogruppo.create({ data: { nome }, select: { id: true, nome: true } }));
  await prisma.partner.update({ where: { id: partnerId }, data: { capogruppoId: c.id } });
  return { ok: true, capogruppo: c };
}
