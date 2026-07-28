// **Proposta** del conto economico a partire dai dati che l'app ha già.
//
// Non è un import del bilancio: è un punto di partenza. Il bilancio vero lo fa
// il commercialista, e alcune voci l'app non può conoscerle per costruzione —
// gli ammortamenti non passano dalla banca, le rimanenze non esistono in
// nessuna delle fonti. Quelle restano vuote **e la pagina dice perché**, invece
// di riempirle con uno zero che sembrerebbe un dato.
//
// Ogni proposta porta con sé la propria **provenienza**: chi la accetta deve
// poter dire da dove viene quel numero, altrimenti fra sei mesi nessuno sa se
// quel B7 è il bilancio o una stima.
//
// Nulla viene salvato da solo: si propone, l'utente conferma.

import { caricaConsuntivo } from "./consuntivo";
import { type DatiAnno } from "./calc";
import { fetchConsuntivo } from "./finance";

export type { Proposta, NonProponibile } from "./proposta-voci";
import { NON_PROPONIBILI, type Proposta } from "./proposta-voci";
export { NON_PROPONIBILI };

export async function proponiDaApp(dati: DatiAnno): Promise<{ proposte: Proposta[]; avvisi: string[] }> {
  const anno = dati.year;
  const mesi = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const [cons, fattTotale] = await Promise.all([
    caricaConsuntivo(dati, mesi),
    // Il **totale** fatturato, non solo le tipologie mappate a una voce di
    // budget: in bilancio A1 sono tutti i ricavi, anche quelli che in Margini
    // nessuno ha ancora collegato.
    fetchConsuntivo({ anno, dal: 1, al: 12, stato: "tutte" }),
  ]);

  const avvisi: string[] = [];
  const proposte: Proposta[] = [];

  const fatturato = fattTotale.ok ? fattTotale.dati.totali.imponibile : 0;
  const ecommerce = cons.ricaviPerTipologia["D2C"] ?? 0;
  if (fattTotale.ok || ecommerce > 0) {
    proposte.push({
      codice: "A1",
      importo: fatturato + ecommerce,
      fonte: `fatturato Finance ${anno} (imponibile, tutte le tipologie) + quota ecommerce dal registro ordini`,
    });
  } else {
    avvisi.push("Finance non ha risposto: i ricavi non si possono proporre.");
  }

  // B7 «Servizi» raccoglie quello che in banca è costo per servizi e pubblicità:
  // sono entrambi servizi di terzi nello schema civilistico.
  if (cons.cogs > 0 || cons.adv > 0) {
    proposte.push({
      codice: "B7",
      importo: cons.cogs + cons.adv,
      fonte:
        cons.advFonte === "marketing"
          ? "uscite di banca categorizzate «Costo per servizi» nel CFO + spesa delle campagne da Deluxy Marketing"
          : "uscite di banca categorizzate «Costo per servizi» e «Pubblicità» nel CFO",
    });
    if (cons.advFonte === "marketing" && cons.advCopertura && !cons.advCopertura.completa) {
      avvisi.push(
        `La spesa pubblicitaria arriva da Marketing, ma Marketing dichiara la copertura incompleta: ${cons.advCopertura.avvertenze.join(" ")} Il B7 proposto è quindi sottostimato.`
      );
    }
  }

  if (cons.personale > 0) {
    proposte.push({
      codice: "B9",
      importo: cons.personale,
      fonte: "costo del personale dall'anagrafica Dipendenti (payroll a budget, non il costo effettivo con TFR e ratei)",
    });
  }

  if (cons.struttura > 0) {
    proposte.push({
      codice: "B14",
      importo: cons.struttura,
      fonte: "uscite di banca categorizzate «Struttura» — se il commercialista le divide fra B7, B8 e B14, va corretto a mano",
    });
  }

  if (cons.nonCategorizzato > 0) {
    avvisi.push(
      `In banca ci sono ${Math.round(cons.nonCategorizzato).toLocaleString("it-IT")} € di uscite non ancora categorizzate nel CFO: non entrano in nessuna proposta, quindi i costi qui sotto sono sottostimati di almeno quella cifra.`
    );
  }

  return { proposte, avvisi };
}
