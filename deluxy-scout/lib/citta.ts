// Filtro città uniforme in tutto il progetto: invece di elencare tutte le zone,
// si scelgono le principali (Milano, Roma, Firenze), "Altre" (tutto il resto) e
// "Tutte" (nessun filtro). `zona` sui negozi contiene la città (es. "MILANO").

export type BucketCitta = 'Milano' | 'Roma' | 'Firenze' | 'Altre';

// Opzioni mostrate nei filtri, nell'ordine richiesto.
export const OPZIONI_CITTA: (BucketCitta | 'Tutte')[] = ['Milano', 'Roma', 'Firenze', 'Altre', 'Tutte'];

/**
 * ⚠️ SI CONFRONTANO LE PAROLE, NON I PEZZI DI PAROLA (27/08/2026).
 *
 * Prima bastava un `includes`, e «romano di lombardia» contiene «roma»: un
 * fioraio in provincia di Bergamo finiva nel bucket **Roma**, «MILANO
 * MARITTIMA» (Cervia, provincia di Ravenna) finiva in **Milano**, e «ROMANS
 * D'ISONZO» pure. Non è un'etichetta: il bucket filtra le basi di Dashboard,
 * Storico, Trattative, Rubrica e Clienti — cioè trattative, visite e KPI di una
 * città contenevano negozi a trecento chilometri.
 *
 * Il campo `zona` è testo libero (l'import ci mette la città del registro, la
 * scoperta lo lascia vuoto, a mano ci si scrive anche il quartiere), quindi non
 * si può pretendere una forma sola: si guarda se una delle sue PAROLE è il nome
 * della città. Così «MILANO», «Milano Centro» e «via Torino, Milano» entrano, e
 * «Milano Marittima» no — perché lì «Marittima» fa parte del nome del posto.
 */
const ECCEZIONI: Record<BucketCitta, string[]> = {
  // Comuni che iniziano con il nome della città ma non sono quella città.
  Milano: ['milano marittima'],
  Roma: [],
  Firenze: [],
  Altre: [],
};

const CITTA: BucketCitta[] = ['Milano', 'Roma', 'Firenze'];

export function bucketCitta(zona: string | null | undefined): BucketCitta {
  const z = (zona ?? '')
    .trim()
    .toLowerCase()
    // La punteggiatura non separa le città: «via Torino, Milano» e
    // «Milano (MI)» devono valere come Milano.
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  if (!z) return 'Altre';
  const parole = z.split(' ');
  for (const citta of CITTA) {
    const nome = citta.toLowerCase();
    if (ECCEZIONI[citta].some((e) => z.includes(e))) continue;
    if (parole.includes(nome)) return citta;
  }
  return 'Altre';
}

/** Il negozio passa il filtro città scelto? `null` o "Tutte" = passa sempre. */
export function passaFiltroCitta(zona: string | null | undefined, filtro: string | null): boolean {
  if (!filtro || filtro === 'Tutte') return true;
  return bucketCitta(zona) === filtro;
}
