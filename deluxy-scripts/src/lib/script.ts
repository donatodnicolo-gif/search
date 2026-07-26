import { prisma } from "./db";
import { componi, daCompilare, risolviValori, type ValoreRisolto } from "./variabili";

// Letture condivise fra pagine e API. Regola: qui dentro non si formatta niente
// per lo schermo, si restituiscono dati già risolti (script + variabili + valori
// dell'app che lo chiede).

export const dettaglioInclude = {
  variabili: { orderBy: [{ ordine: "asc" }, { chiave: "asc" }] },
  abilitazioni: {
    include: { app: true, valori: true },
    orderBy: { app: { ordine: "asc" } },
  },
} as const;

export type ScriptPerApp = {
  slug: string;
  nome: string;
  descrizione: string | null;
  note: string | null;
  linguaggio: string;
  tag: string[];
  aggiornatoIl: Date;
  corpo: string; // con i segnaposto ancora dentro
  corpoRisolto: string; // con i valori dell'app già sostituiti
  variabili: ValoreRisolto[];
  daCompilare: string[]; // variabili obbligatorie senza valore (segreti compresi)
};

// Gli script abilitati per un'app, già composti con i valori di quell'app.
// `chiaveApp` è lo slug dell'app (es. "deluxy-marketing"). Un'app disattivata
// non riceve nulla, come uno script archiviato.
export async function scriptPerApp(chiaveApp: string, slug?: string): Promise<ScriptPerApp[] | null> {
  const app = await prisma.appCollegata.findUnique({ where: { chiave: chiaveApp } });
  if (!app || !app.attiva) return null;

  const abilitazioni = await prisma.abilitazione.findMany({
    where: {
      appId: app.id,
      attiva: true,
      script: { attivo: true, ...(slug ? { slug } : {}) },
    },
    include: {
      valori: true,
      script: { include: { variabili: { orderBy: [{ ordine: "asc" }, { chiave: "asc" }] } } },
    },
    orderBy: { script: { nome: "asc" } },
  });

  return abilitazioni.map((a) => {
    const perId = new Map(a.valori.map((v) => [v.variabileId, v.valore]));
    const valoriApp: Record<string, string> = {};
    for (const v of a.script.variabili) {
      const valore = perId.get(v.id);
      if (valore != null) valoriApp[v.chiave] = valore;
    }
    const risolte = risolviValori(a.script.variabili, valoriApp);
    return {
      slug: a.script.slug,
      nome: a.script.nome,
      descrizione: a.script.descrizione,
      note: a.script.note,
      linguaggio: a.script.linguaggio,
      tag: a.script.tag,
      aggiornatoIl: a.script.aggiornatoIl,
      corpo: a.script.corpo,
      corpoRisolto: componi(a.script.corpo, risolte),
      variabili: risolte,
      daCompilare: daCompilare(risolte),
    };
  });
}

// Uno slug libero a partire dal nome: "Import ordini Shopify" → "import-ordini-shopify".
export function slugDa(nome: string): string {
  return (
    nome
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "") // via gli accenti
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "script"
  );
}

// Slug garantito unico: se esiste già, aggiunge -2, -3, …
export async function slugLibero(nome: string, escludiId?: string): Promise<string> {
  const base = slugDa(nome);
  for (let n = 1; n < 100; n++) {
    const candidato = n === 1 ? base : `${base}-${n}`;
    const esistente = await prisma.script.findUnique({ where: { slug: candidato }, select: { id: true } });
    if (!esistente || esistente.id === escludiId) return candidato;
  }
  return `${base}-${Date.now()}`;
}
