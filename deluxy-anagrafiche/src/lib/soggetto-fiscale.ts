import { Prisma } from "@prisma/client";
import { prisma } from "./db";

// CHI FATTURA e CHI SI PAGA: la società, non il negozio.
//
// ⚠️ Fino al 27/08/2026 questi campi stavano sul record-SEDE e
// `propagaDatiFinanziari` li ricopiava su tutte le sedi della stessa insegna,
// perché si assumeva «un'insegna = una società». Con due società di
// fatturazione la propagazione non le distingueva: prendeva il primo valore
// compilato e lo scriveva sulle altre. Non un dato mancante — un dato giusto
// **sostituito** con uno sbagliato, IBAN compreso.
//
// Adesso il dato ha una casa sola (`SoggettoFiscale`) e le sedi ci puntano:
// due società = due soggetti, e nessuno dei due tocca l'altro. Non c'è più
// niente da propagare, perché non c'è più niente di copiato.

// I campi della fatturazione, nell'ordine in cui l'API li espone.
export const CAMPI_FINANZIARI = [
  "pec",
  "codiceSdi",
  "iban",
  "intestatarioConto",
  "banca",
  "metodoPagamento",
  "condizioniPagamento",
  // Chi paga per tutte le sedi (facoltativo): è una scelta della SOCIETÀ, non
  // della singola sede, quindi vive qui con gli altri campi del soggetto.
  "gruppoPagamento",
  "noteAmministrative",
  "amministrazioneNome",
  "amministrazioneTelefono",
  "amministrazioneEmail",
] as const;

// L'identità fiscale: l'API la espone al primo livello (non dentro
// `datiFinanziari`) da sempre, e le app la leggono lì.
export const CAMPI_IDENTITA = ["pIva", "codiceFiscale"] as const;

// Tutto ciò che appartiene al soggetto e può arrivare da una scrittura.
export const CAMPI_SOGGETTO = [...CAMPI_IDENTITA, ...CAMPI_FINANZIARI] as const;

export type CampoSoggetto = (typeof CAMPI_SOGGETTO)[number];
export type DatiSoggetto = Partial<Record<CampoSoggetto, string | null>>;

// Il soggetto come lo vede chi legge una sede: se la sede non è collegata a
// nessuno, tutti i campi sono vuoti — ⚠️ e vuoto vuol dire «non lo sappiamo»,
// non «zero»: prima al suo posto compariva la fatturazione di un'ALTRA sede
// della stessa insegna, che è una risposta peggiore del silenzio.
export type SoggettoLetto = Record<CampoSoggetto, string | null> & {
  id: string | null;
  ragioneSociale: string | null;
  aggiornamenti: Record<string, { sistema: string; asOf?: string }>;
};

type ConSoggetto = { soggettoFiscale?: Prisma.SoggettoFiscaleGetPayload<object> | null };

export function leggiSoggetto(p: ConSoggetto): SoggettoLetto {
  const s = p.soggettoFiscale ?? null;
  const prov = (s?.provenienza ?? {}) as Record<string, { sistema: string; asOf?: string }>;
  const aggiornamenti: SoggettoLetto["aggiornamenti"] = {};
  for (const c of CAMPI_SOGGETTO) if (prov[c]) aggiornamenti[c] = prov[c];
  const out = { id: s?.id ?? null, ragioneSociale: s?.ragioneSociale ?? null, aggiornamenti } as SoggettoLetto;
  for (const c of CAMPI_SOGGETTO) out[c] = s?.[c] ?? null;
  return out;
}

// Separa una scrittura «piatta» (com'è sempre arrivata dalle API e dal form)
// in ciò che è della SEDE e ciò che è della SOCIETÀ.
export function separaDati<T extends Record<string, unknown>>(
  dati: T,
): { sede: Record<string, unknown>; soggetto: DatiSoggetto } {
  const sede: Record<string, unknown> = {};
  const soggetto: DatiSoggetto = {};
  for (const [k, v] of Object.entries(dati)) {
    if ((CAMPI_SOGGETTO as readonly string[]).includes(k)) soggetto[k as CampoSoggetto] = v as string | null;
    else sede[k] = v;
  }
  return { sede, soggetto };
}

const vuoto = (d: DatiSoggetto) => !Object.values(d).some((v) => v != null && String(v).trim() !== "");

// Scrive i dati fiscali di una sede sul suo soggetto. Se la sede non ne ha
// ancora uno, lo crea e ce la collega — è così che un'anagrafica «sale» al
// modello nuovo la prima volta che qualcuno le scrive una P.IVA.
//
// ⚠️ Una scrittura tutta vuota non crea niente: un soggetto senza un solo dato
// non è una società, è rumore che poi qualcuno dovrà ripulire.
export async function salvaDatiSoggetto(
  partnerId: string,
  dati: DatiSoggetto,
  prov?: Record<string, { sistema: string; asOf?: string }>,
): Promise<string | null> {
  const p = await prisma.partner.findUnique({
    where: { id: partnerId },
    select: { id: true, nome: true, ragioneSociale: true, soggettoFiscaleId: true },
  });
  if (!p) return null;

  const puliti: DatiSoggetto = {};
  for (const c of CAMPI_SOGGETTO) if (c in dati) puliti[c] = dati[c];
  if (p.soggettoFiscaleId) {
    if (!Object.keys(puliti).length) return p.soggettoFiscaleId;
    const attuale = await prisma.soggettoFiscale.findUnique({ where: { id: p.soggettoFiscaleId } });
    await prisma.soggettoFiscale.update({
      where: { id: p.soggettoFiscaleId },
      data: {
        ...puliti,
        provenienza: {
          ...((attuale?.provenienza ?? {}) as Record<string, unknown>),
          ...(prov ?? {}),
        } as Prisma.InputJsonValue,
      },
    });
    return p.soggettoFiscaleId;
  }

  if (vuoto(puliti)) return null;
  // ⚠️ La P.IVA è l'identità: se quella società c'è già, la sede si CLIPPA a
  // quella invece di crearne una gemella. È il caso vero del secondo negozio.
  const pIva = puliti.pIva?.trim();
  const esistente = pIva ? await prisma.soggettoFiscale.findUnique({ where: { pIva } }) : null;
  const soggetto =
    esistente ??
    (await prisma.soggettoFiscale.create({
      data: {
        ...puliti,
        ragioneSociale: puliti.intestatarioConto?.trim() || p.ragioneSociale?.trim() || p.nome,
        provenienza: (prov ?? {}) as Prisma.InputJsonValue,
      },
    }));
  await prisma.partner.update({ where: { id: p.id }, data: { soggettoFiscaleId: soggetto.id } });
  return soggetto.id;
}
