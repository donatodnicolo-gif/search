// La parte **pura** del vocabolario dei metafield: tipi e funzioni senza
// database, così il modulo prodotto (componente client) le importa senza
// tirarsi dietro Prisma. La lettura dal negozio e la cache stanno in
// `metafield-definizioni.ts`, che riesporta tutto questo.

export type DefinizioneMetafield = {
  namespace: string;
  key: string;
  nome: string;
  descrizione: string | null;
  tipo: string;
  /** I valori ammessi, quando la definizione li fissa. */
  scelte: string[] | null;
  min: number | null;
  max: number | null;
  posizione: number | null;
};

export const chiaveDef = (d: { namespace: string; key: string }) => `${d.namespace}.${d.key}`;

export function etichettaDef(d: DefinizioneMetafield): string {
  const grezza = (d.nome || d.key).replace(/[_-]+/g, " ").trim();
  return grezza.charAt(0).toUpperCase() + grezza.slice(1);
}

/** Legge un valore lista (JSON) in modo tollerante: una stringa sola vale come lista da uno. */
export function listaDa(valore: string | undefined | null): string[] {
  if (!valore) return [];
  try {
    const l = JSON.parse(valore);
    if (Array.isArray(l)) return l.map(String);
  } catch {
    /* non era JSON */
  }
  return [valore];
}

/**
 * ⭐ 10/09/2026: i metafield **operativi** — quelli che dicono come si consegna e
 * cos'è il prodotto per il sito, non cosa contiene. Su un prodotto nuovo il
 * modulo li fa partire dal valore più usato sul sito scelto. Non ci stanno
 * fiori, gusti, occasioni, colori: sono contenuto, e il contenuto lo decide
 * chi scrive.
 */
export const CAMPI_OPERATIVI = [
  "prodotto.consegna",
  "custom.minimo_orario",
  "custom.data",
  "custom.orario_consegna",
  "custom.nations_availability",
  "custom._nations_availability",
  "custom.is_unique",
  "custom.not_physical",
  "custom.tipologia",
  "custom.da_chi_fatto",
  "custom.guida_misure",
] as const;
