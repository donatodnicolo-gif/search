import { Prisma } from "@prisma/client";
import { prisma } from "./db";

// I dati finanziari appartengono alla SOCIETÀ (stessa P.IVA), non alla singola
// sede: sono quindi condivisi da tutte le sedi della stessa insegna. Le sedi
// (Bottega Veneta Milano, Roma, …) restano record autonomi per stato,
// referenti e azioni, ma la fatturazione è una sola.
export const CAMPI_FINANZIARI = [
  "pIva",
  "codiceFiscale",
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

export type CampoFinanziario = (typeof CAMPI_FINANZIARI)[number];
export type DatiFinanziari = Record<CampoFinanziario, string | null>;

// Chiave del gruppo: il nome dell'insegna. Se il record è una sede collegata a
// mano a una madre (nome diverso, es. "… FLAGSHIP"), conta il nome della madre.
function nomeInsegna(p: { nome: string; capogruppo?: { nome: string } | null }): string {
  return (p.capogruppo?.nome ?? p.nome).trim();
}

// Condizione Prisma per tutti i record della stessa insegna: stesso nome
// (case-insensitive) più le sedi la cui madre ha quel nome.
function whereInsegna(nome: string): Prisma.PartnerWhereInput {
  return {
    attivo: true,
    OR: [
      { nome: { equals: nome, mode: "insensitive" } },
      { capogruppo: { is: { nome: { equals: nome, mode: "insensitive" } } } },
    ],
  };
}

// Dati finanziari condivisi dell'insegna a cui appartiene il record: per ogni
// campo il primo valore compilato tra le sedi (la più vecchia vince, così è
// deterministico). Con la propagazione in scrittura le sedi restano allineate;
// questo merge copre anche una sede appena aggiunta e non ancora salvata.
export async function datiFinanziariCondivisi(p: {
  nome: string;
  capogruppo?: { nome: string } | null;
}): Promise<DatiFinanziari> {
  const membri = await prisma.partner.findMany({
    where: whereInsegna(nomeInsegna(p)),
    orderBy: { creatoIl: "asc" },
  });
  const out = {} as DatiFinanziari;
  for (const campo of CAMPI_FINANZIARI) {
    out[campo] = membri.map((m) => m[campo]).find((v) => v) ?? null;
  }
  return out;
}

// Dopo un salvataggio: copia i dati finanziari del record (valori E timbri di
// provenienza per campo) su tutte le altre sedi della stessa insegna, così la
// fatturazione resta unica per la società e ogni sede risponde alle API con
// gli stessi `aggiornamenti` (chi ha scritto il campo e quando).
export async function propagaDatiFinanziari(partnerId: string): Promise<void> {
  const p = await prisma.partner.findUnique({
    where: { id: partnerId },
    include: { capogruppo: { select: { nome: true } } },
  });
  if (!p) return;
  const dati = Object.fromEntries(CAMPI_FINANZIARI.map((c) => [c, p[c]])) as DatiFinanziari;
  const provOrigine = (p.provenienza ?? {}) as Record<string, unknown>;
  const provFin = Object.fromEntries(
    CAMPI_FINANZIARI.filter((c) => provOrigine[c]).map((c) => [c, provOrigine[c]]),
  );
  const sedi = await prisma.partner.findMany({
    where: { AND: [whereInsegna(nomeInsegna(p)), { NOT: { id: p.id } }] },
    select: { id: true, provenienza: true },
  });
  for (const s of sedi) {
    await prisma.partner.update({
      where: { id: s.id },
      data: {
        ...dati,
        provenienza: {
          ...((s.provenienza ?? {}) as Record<string, unknown>),
          ...provFin,
        } as Prisma.InputJsonValue,
      },
    });
  }
}
