import { formattaEuro } from "@/lib/dominio";
import { SOGLIA_GIUDIZIO_EUR } from "@/lib/salute";

// Le due celle che le tabelle per categoria e per area usano identiche.
//
// PERCHÉ IN UN FILE A PARTE. Erano la stessa dozzina di righe copiata in due
// componenti: la regola del colore, la soglia sotto cui un rapporto non si
// giudica e il modo di scrivere uno zero. Tre decisioni ricopiate sono tre
// decisioni che al prossimo giro divergono, e due tabelle nella stessa pagina
// che colorano lo stesso 2,7× in modi diversi.

/**
 * Un importo in euro. Lo zero si scrive in due modi diversi, e la differenza
 * è tutto:
 *  · «—» quando non c'è niente da dire (nessuna spesa, nessun ordine);
 *  · «0 €» quando c'è stata una spesa e il ritorno è stato **zero davvero**.
 * Scrivere «—» in quel secondo caso, accanto a una resa di 0,00×, è una
 * contraddizione che fa sospettare un dato mancante dove invece c'è una
 * notizia: si è pagato e non è tornato niente.
 */
export function Euro({ v, zeroEsplicito }: { v: number; zeroEsplicito?: boolean }) {
  return <td className="num">{v > 0 ? formattaEuro(v) : zeroEsplicito ? "0 €" : "—"}</td>;
}

/**
 * La resa: incasso diviso spesa, col colore del break-even del brand.
 *
 * ⚠️ Sotto i 20 € di spesa (`SOGLIA_GIUDIZIO_EUR`, la stessa soglia con cui
 * l'app giudica keyword e annunci) il numero si mostra ma **non si giudica**:
 * 130 € di ritorno su 11,56 € di spesa fanno 11×, che sembra il miglior
 * risultato della pagina e invece è un caso. Colorarlo di verde inviterebbe a
 * spostarci budget sulla base di tre clic.
 *
 * ⚠️ Con spesa zero non c'è resa: `null`, non «infinito». E con `nonLetto` non
 * c'è nemmeno la domanda — il dato di partenza non è arrivato.
 */
export function CellaResa({
  incasso,
  spesa,
  breakEven,
  nonLetto,
}: {
  incasso: number;
  spesa: number;
  breakEven: number;
  nonLetto?: boolean;
}) {
  const v = !nonLetto && spesa > 0 ? incasso / spesa : null;
  const giudicabile = spesa >= SOGLIA_GIUDIZIO_EUR;
  const colore =
    v == null || !giudicabile
      ? undefined
      : v >= breakEven * 1.5
        ? "var(--green)"
        : v >= breakEven
          ? "var(--blue)"
          : "var(--red)";
  return (
    <td
      className={giudicabile ? "num" : "num cella-muta"}
      style={{ fontWeight: giudicabile ? 600 : 400, color: colore }}
      title={
        v == null
          ? nonLetto
            ? "Manca la spesa: senza il denominatore la resa non esiste"
            : "Nessuna spesa su questo canale: non c'è niente da dividere"
          : giudicabile
            ? `Break-even del brand: ${breakEven.toFixed(2).replace(".", ",")}×`
            : `Meno di ${SOGLIA_GIUDIZIO_EUR} € di spesa: il rapporto si mostra ma non si giudica, la base è troppo piccola`
      }
    >
      {v != null ? `${v.toFixed(2).replace(".", ",")}×` : "—"}
    </td>
  );
}
