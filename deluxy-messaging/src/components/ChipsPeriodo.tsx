'use client'

import { PERIODI, type Periodo } from '@/lib/periodo'

// Le chips di periodo (Libro UX&UI v1.9 §8-bis): selezione singola, sopra i
// filtri della pagina.
//
// ⚠️ NON si introduce un secondo sistema di pillole: l'app le ha già
// (`stato-pill` + `attuale`, vedi ClientiLista) e le chips usano quelle — il
// `chip-link` di FINANCE è per le pagine server a link GET, qui le pagine sono
// client e il periodo vive nello stato React. Ripremere la chip accesa la
// spegne (stesso gesto dei passi degli ordini); «Tutto» è l'azzeramento
// esplicito, tratteggiato.
export function ChipsPeriodo({
  valore,
  cambia,
  campo,
}: {
  valore: Periodo
  cambia: (p: Periodo) => void
  /** SU QUALE DATA filtra, detto a chi guarda: «data del reclamo», «data ordine»… */
  campo: string
}) {
  return (
    <div className="filtri-passi riga-chips-scorri">
      <span className="etichetta-ordina">Periodo</span>
      {PERIODI.map((p) => (
        <button
          key={p.chiave}
          className={`stato-pill${valore === p.chiave ? ' attuale' : ''}`}
          onClick={() => cambia(valore === p.chiave ? '' : p.chiave)}
          title={`Solo le righe con ${campo} nel periodo`}
        >
          {p.nome}
        </button>
      ))}
      {valore ? (
        <button className="stato-pill azzera" onClick={() => cambia('')} title="Togli il periodo">
          Tutto
        </button>
      ) : null}
    </div>
  )
}
