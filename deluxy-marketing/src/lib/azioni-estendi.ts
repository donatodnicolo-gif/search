"use server";

import { chiediAllAi } from "@/lib/ai";
import { prisma } from "@/lib/db";
import { testoKeywordPulito } from "@/lib/dominio";
import { linguaDaNome } from "@/lib/vendite-campagna";

// «Estendi con AI»: dall'indicazione scritta dalla persona (più le parole
// spuntate come seme) l'AI propone una sequenza di parole di ricerca
// correlate per QUESTA campagna.
//
// ⚠️ Qui si PROPONE soltanto: niente tocca la coda. Le parole tornano al
// dialogo, la persona spunta quelle che vuole, e l'accodamento passa da
// `applicaKeywordAdAltreCampagne` — con il controllo «ce l'ha già», il
// livello L1 e l'approvazione in Operazioni, come ogni altra keyword.

export type EsitoEstendi =
  | { ok: true; parole: string[]; scartateEsistenti: number; modello: string }
  | { ok: false; errore: string };

// ⚠️ Schema MINIMO: l'API di Claude rifiuta `maxItems` (e i vincoli di
// lunghezza) negli structured outputs — provato il 10/08/2026, errore 400
// «For 'array' type, property 'maxItems' is not supported». I limiti (25
// parole, 80 caratteri) stanno nel codice qui sotto, dove stavano comunque.
const SCHEMA_PAROLE = {
  type: "object",
  additionalProperties: false,
  required: ["parole"],
  properties: {
    parole: {
      type: "array",
      items: { type: "string" },
    },
  },
} as const;

export async function estendiKeywordConAi(input: {
  campagnaId: string;
  indicazione: string;
  semi: string[];
}): Promise<EsitoEstendi> {
  const indicazione = (input.indicazione ?? "").trim();
  const semi = (input.semi ?? []).map((s) => testoKeywordPulito(String(s)).trim()).filter(Boolean);
  if (!indicazione && semi.length === 0) {
    return { ok: false, errore: "Serve un'indicazione, o almeno una parola spuntata da cui partire." };
  }

  const campagna = await prisma.campagna.findUnique({
    where: { id: input.campagnaId },
    select: { nome: true, brand: true },
  });
  if (!campagna) return { ok: false, errore: "Campagna non trovata." };

  // Le keyword che la campagna ha già: l'AI le riceve per NON riproporle, e
  // comunque il filtro si rifà qui sotto — uno schema rispettato non vuol
  // dire un contenuto sensato. (Il controllo definitivo resta quello
  // dell'accodamento, che guarda anche la corrispondenza riga per riga.)
  const esistenti = await prisma.copyAnnuncio.findMany({
    where: { tipo: "keyword", campagna: campagna.nome },
    select: { testo: true },
    take: 400,
  });
  const giaPresenti = new Set(esistenti.map((k) => testoKeywordPulito(k.testo).toLowerCase()));

  const esito = await chiediAllAi({
    istruzioni: [
      "Proponi parole di ricerca (keyword Google Ads) CORRELATE per la campagna indicata, seguendo l'indicazione della persona.",
      "Regole, tutte vincolanti:",
      "- Parole che una persona digiterebbe davvero su Google per comprare: niente frasi da titolo, niente descrizioni.",
      "- Nella STESSA LINGUA dei semi e delle keyword esistenti (se l'indicazione chiede esplicitamente un'altra lingua, vince l'indicazione).",
      "- NIENTE nomi di concorrenti, insegne o marchi altrui, e niente storpiature del nostro: solo parole che descrivono cosa si vende.",
      "- Non ripetere le keyword esistenti della campagna, nemmeno in variante banale (singolare/plurale o riordino delle stesse parole).",
      "- Ogni parola in minuscolo, senza virgolette, parentesi o segni di corrispondenza.",
      "- Da 10 a 20 parole; se l'indicazione è troppo vaga o fuori tema per questa campagna, restituisci un elenco vuoto.",
      "Rispondi SOLO in JSON: {\"parole\": [\"...\"]}.",
    ].join("\n"),
    dati: {
      campagna: campagna.nome,
      brand: campagna.brand,
      linguaDedottaDalNome: linguaDaNome(campagna.nome),
      indicazioneDellaPersona: indicazione || null,
      paroleSeme: semi,
      keywordEsistenti: [...giaPresenti].slice(0, 400),
    },
    schema: SCHEMA_PAROLE as unknown as Record<string, unknown>,
    massimoToken: 2000,
  });

  if (!esito.ok) return { ok: false, errore: esito.errore };

  let grezzi: unknown;
  try {
    grezzi = JSON.parse(esito.testo);
  } catch {
    return { ok: false, errore: "L'AI ha risposto in una forma non leggibile: riprova." };
  }
  const lista = Array.isArray((grezzi as { parole?: unknown })?.parole)
    ? ((grezzi as { parole: unknown[] }).parole as unknown[])
    : [];

  // Pulizia e difesa: minuscole, spazi collassati, niente doppioni, niente
  // parole che la campagna ha già, taglio a 25.
  const viste = new Set<string>();
  const parole: string[] = [];
  let scartateEsistenti = 0;
  for (const grezza of lista) {
    const p = testoKeywordPulito(String(grezza)).toLowerCase().replace(/\s+/g, " ").trim();
    if (!p || p.length > 80) continue;
    if (viste.has(p)) continue;
    viste.add(p);
    if (giaPresenti.has(p)) {
      scartateEsistenti++;
      continue;
    }
    parole.push(p);
    if (parole.length >= 25) break;
  }

  return { ok: true, parole, scartateEsistenti, modello: esito.modello };
}
