"use server";

import { chiediAllAi } from "@/lib/ai";
import { prisma } from "@/lib/db";

// «Crea con AI»: un annuncio responsive nuovo (15 titoli, 4 descrizioni) per
// un gruppo, scritto dall'AI a partire da ciò che quel gruppo già compra e
// vende — keyword, ricerche vere, testi esistenti e destinazione.
//
// ⚠️ PROPONE soltanto: qui non si scrive niente né sull'app né su Google.
// Creare un annuncio non è fra le operazioni che lo script sa eseguire, e
// dirlo è parte della risposta: i testi si copiano in Google Ads.

export type EsitoAnnuncioAi =
  | {
      ok: true;
      titoli: string[];
      descrizioni: string[];
      note: string | null;
      modello: string;
    }
  | { ok: false; errore: string };

const SCHEMA_ANNUNCIO = {
  type: "object",
  additionalProperties: false,
  required: ["titoli", "descrizioni"],
  properties: {
    titoli: { type: "array", items: { type: "string" } },
    descrizioni: { type: "array", items: { type: "string" } },
    note: { type: "string" },
  },
} as const;

export async function creaAnnuncioConAi(input: {
  gruppoId: string;
  indicazione: string;
  // Le funzioni di Google fra graffe: inserimento keyword, countdown,
  // personalizzatori. Chi le vuole lo dice: se sono spente l'AI non le usa.
  conFunzioniGoogle: boolean;
}): Promise<EsitoAnnuncioAi> {
  const gruppo = await prisma.gruppo.findUnique({
    where: { id: input.gruppoId },
    select: { nome: true, lingua: true, campagna: { select: { nome: true, brand: true } } },
  });
  if (!gruppo) return { ok: false, errore: "Gruppo non trovato." };

  const [keyword, ricerche, testi, destinazioni] = await Promise.all([
    prisma.copyAnnuncio.findMany({
      where: {
        tipo: "keyword",
        campagna: gruppo.campagna.nome,
        gruppo: { contains: gruppo.nome },
        stato: { not: "defunta" },
      },
      orderBy: { spesa: { sort: "desc", nulls: "last" } },
      take: 25,
      select: { testo: true, spesa: true, incasso: true, conversioni: true },
    }),
    prisma.termineRicerca.findMany({
      where: { gruppo: { contains: gruppo.nome }, conversioni: { gt: 0 } },
      orderBy: { ricavi: { sort: "desc", nulls: "last" } },
      take: 20,
      select: { testo: true, conversioni: true, ricavi: true },
    }),
    prisma.copyAnnuncio.findMany({
      where: {
        tipo: { in: ["titolo", "descrizione"] },
        campagna: gruppo.campagna.nome,
        gruppo: { contains: gruppo.nome },
      },
      take: 60,
      select: { tipo: true, testo: true, rendimento: true },
    }),
    prisma.copyAnnuncio.findMany({
      where: { tipo: "destinazione", campagna: gruppo.campagna.nome, gruppo: { contains: gruppo.nome } },
      take: 5,
      select: { finalUrl: true, testo: true },
    }),
  ]);

  const esito = await chiediAllAi({
    istruzioni: [
      "Scrivi UN annuncio responsive della rete di ricerca (RSA) per il gruppo indicato.",
      "Regole, tutte vincolanti:",
      "- Esattamente 15 titoli (max 30 caratteri l'uno) e 4 descrizioni (max 90 caratteri l'una). Conta i caratteri: un titolo di 31 viene troncato da Google.",
      "- Nella lingua del gruppo, la stessa delle keyword e dei testi esistenti.",
      "- I titoli devono coprire angoli DIVERSI (prodotto, consegna, occasione, prova sociale, chiamata all'azione): quindici modi di dire la stessa cosa non servono a Google, che li ruota.",
      "- Usa il vocabolario delle keyword e delle ricerche che convertono: sono le parole con cui la gente cerca davvero.",
      "- NON ripetere alla lettera i titoli già esistenti passati nei dati; possono ispirare, non essere copiati.",
      "- Niente superlativi non verificabili («il migliore d'Italia»), niente promesse su prezzi o tempi che non risultano dai dati, niente MAIUSCOLO integrale, niente punti esclamativi multipli.",
      input.conFunzioniGoogle
        ? "- PUOI usare le funzioni dinamiche di Google in AL MASSIMO 2 titoli, scritte esattamente così: {KeyWord:Testo di riserva} (il testo di riserva deve stare in 30 caratteri da solo). Non usarle nelle descrizioni."
        : "- NON usare le funzioni dinamiche di Google fra graffe ({KeyWord:…}, {COUNTDOWN…}, {CUSTOMIZER…}): scrivi solo testo normale.",
      "In `note` scrivi UNA riga su come hai diviso gli angoli. Rispondi solo in JSON.",
    ].join("\n"),
    dati: {
      campagna: gruppo.campagna.nome,
      gruppo: gruppo.nome,
      brand: gruppo.campagna.brand,
      linguaDelGruppo: gruppo.lingua,
      indicazioneDellaPersona: input.indicazione.trim() || null,
      destinazione: destinazioni[0]?.finalUrl ?? destinazioni[0]?.testo ?? null,
      keywordDelGruppo: keyword.map((k) => ({
        testo: k.testo,
        spesa: k.spesa,
        incasso: k.incasso,
        conversioni: k.conversioni,
      })),
      ricercheCheConvertono: ricerche.map((r) => ({
        testo: r.testo,
        conversioni: r.conversioni,
        incasso: r.ricavi,
      })),
      testiGiaEsistenti: testi.map((t) => ({ tipo: t.tipo, testo: t.testo, giudizioGoogle: t.rendimento })),
    },
    massimoToken: 3000,
  });

  if (!esito.ok) return { ok: false, errore: esito.errore };

  let grezzo: { titoli?: unknown; descrizioni?: unknown; note?: unknown };
  try {
    grezzo = JSON.parse(esito.testo);
  } catch {
    return { ok: false, errore: "L'AI ha risposto in una forma non leggibile: riprova." };
  }

  // Difesa lato nostro: i limiti di Google sono un fatto, non una preferenza
  // dell'AI. Si scartano i testi fuori misura invece di mostrarli buoni.
  const pulisci = (v: unknown, limite: number) =>
    (Array.isArray(v) ? v : [])
      .map((x) => String(x).replace(/\s+/g, " ").trim())
      .filter((x) => x.length > 0 && lunghezzaUtile(x) <= limite);

  const titoli = pulisci(grezzo.titoli, 30).slice(0, 15);
  const descrizioni = pulisci(grezzo.descrizioni, 90).slice(0, 4);
  if (titoli.length === 0 && descrizioni.length === 0) {
    return { ok: false, errore: "L'AI non ha prodotto testi dentro i limiti di Google: riprova." };
  }

  return {
    ok: true,
    titoli,
    descrizioni,
    note: typeof grezzo.note === "string" ? grezzo.note : null,
    modello: esito.modello,
  };
}

// I segnaposto dinamici valgono per la loro lunghezza REALE solo a runtime:
// per il limite conta il testo di riserva, non tutta la graffa.
function lunghezzaUtile(t: string): number {
  const conRiserva = t.replace(/\{[^:}]+:([^}]*)\}/g, "$1").replace(/\{[^}]*\}/g, "");
  return conRiserva.length;
}
