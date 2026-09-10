// IL NOME DI UN NEGOZIO COME SI LEGGE (10/09/2026, richiesta dell'utente:
// «nomi negozio minuscolo con prima lettera maiuscola»).
//
// Nel registro e in Scout i nomi arrivano come li ha scritti chi li ha
// inseriti: «MICAELA FLORAL DESIGN», «pasticceria bar giglio», «L'ATELIER
// DEL FIORE». A schermo si leggono meglio con ogni parola in maiuscolo
// iniziale e il resto minuscolo. È SOLO presentazione: il dato non si tocca,
// la ricerca e l'ordinamento lavorano sul nome vero.

/** Parole che restano minuscole dentro il nome (non all'inizio). */
const MINUSCOLE = new Set(['di', 'da', 'de', 'del', 'della', 'dello', 'dei', 'degli', 'delle', 'e', 'ed', 'il', 'lo', 'la', 'i', 'gli', 'le', 'in', 'a', 'al', 'alla', 'allo', 'ai', 'agli', 'alle', 'per', 'con', 'su', 'sul', 'sulla', 'dal', 'dalla', 'the', 'of', 'and', 'by']);

/** Sigle che restano tutte maiuscole. ⚠️ Non «sa», «ss», «sc»: sono anche
 *  sillabe di nomi veri («Sa Commercial Garden Group») e in maiuscolo
 *  sbaglierebbero più di quanto azzeccano. */
const SIGLE = new Set(['srl', 'srls', 'snc', 'sas', 'spa', 'ltd', 'llc', 'gmbh', 'b2b', 'd2c', 'nyc', 'usa', 'uk']);

function capitalizza(parola: string, prima: boolean): string {
  if (!parola) return parola;
  const min = parola.toLowerCase();
  if (SIGLE.has(min.replace(/\./g, ''))) return parola.toUpperCase();
  if (!prima && MINUSCOLE.has(min)) return min;
  // «L'atelier» → «L'Atelier», «D'Angelo» → «D'Angelo»: dopo l'apostrofo si
  // ricomincia, ma solo se prima c'è una lettera sola (un articolo eliso).
  return min
    .split(/(['’])/)
    .map((pezzo, i, tutti) => {
      if (pezzo === "'" || pezzo === '’') return pezzo;
      const dopoApostrofo = i >= 2 && tutti[i - 2].length === 1;
      return i === 0 || dopoApostrofo ? pezzo.charAt(0).toUpperCase() + pezzo.slice(1) : pezzo;
    })
    .join('');
}

export function nomeLeggibile(nome: string | null | undefined): string {
  const n = (nome ?? '').trim();
  if (!n) return '';
  // Si spezza su spazi e trattini/barre tenendo i separatori: «Il-mondo» resta «Il-Mondo».
  return n
    .split(/(\s+|[-\/&])/)
    .map((pezzo, i, tutti) => {
      if (/^(\s+|[-\/&])$/.test(pezzo) || pezzo === '') return pezzo;
      const prima = tutti.slice(0, i).every((t) => /^(\s+|[-\/&])$/.test(t) || t === '');
      return capitalizza(pezzo, prima);
    })
    .join('');
}
