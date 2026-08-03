// Il risultato atteso: quanto resta in tasca, stimato.
//
// Vendite × margine − spesa pubblicitaria. È la domanda che nessun ROAS
// risponde: un 4× su un margine del 30% lascia un utile, un 4× su un margine
// del 10% lo brucia. Serve per sapere se la pubblicità sta producendo soldi o
// solo fatturato.
//
// ⚠️ È una STIMA, e va detto ogni volta che la si mostra. Il margine è una
// percentuale media dichiarata, non il costo reale di quei prodotti; e sotto
// non ci sono i costi che non passano da qui — personale, logistica,
// commissioni di pagamento, resi. Un risultato atteso positivo NON è un utile:
// è il margine lordo di prodotto meno la pubblicità, cioè quanto la pubblicità
// lascia sul tavolo prima di tutto il resto.

// Margine lordo medio di riferimento. 30% è quello che l'azienda usa per
// Gifts; guardrail.ts ne tiene di diversi per brand (Flowers 40%, Cake 50%),
// e chi chiama può passarli.
export const MARGINE_PREDEFINITO = 0.3;

export type RisultatoAtteso = {
  margineLordo: number; // vendite × margine
  spesa: number;
  risultato: number; // margineLordo − spesa
  margineUsato: number;
  // Quale venduto è stato usato: cambia quanto ci si può fidare del numero
  fonte: "shopify" | "piattaforma";
  // Quanto delle vendite se ne va in pubblicità (incidenza ADV)
  incidenzaAdv: number | null;
  // Il ROAS oltre il quale la pubblicità comincia a produrre margine
  pareggio: number;
};

export function risultatoAtteso(
  vendite: number,
  spesa: number,
  opzioni: { margine?: number; fonte?: "shopify" | "piattaforma" } = {}
): RisultatoAtteso {
  const margine = opzioni.margine ?? MARGINE_PREDEFINITO;
  const margineLordo = vendite * margine;
  return {
    margineLordo,
    spesa,
    risultato: margineLordo - spesa,
    margineUsato: margine,
    fonte: opzioni.fonte ?? "shopify",
    incidenzaAdv: vendite > 0 ? spesa / vendite : null,
    // Con un margine del 30% servono 3,33 € di vendite per ogni euro speso
    // solo per pareggiare: è lo stesso break-even del guardrail, visto da qui.
    pareggio: margine > 0 ? 1 / margine : Infinity,
  };
}
