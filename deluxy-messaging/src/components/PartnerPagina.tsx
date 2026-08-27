'use client'

import { useState } from 'react'
import { PartnerLista } from './PartnerLista'
import { FornitoriUsati } from './FornitoriUsati'

// LE DUE DOMANDE DELLA PAGINA PARTNER, tenute separate.
//
// ⚠️⚠️ «Chi esiste» e «chi ha lavorato» sono due cose diverse, e mescolarle in
// una tabella sola è il modo di non rispondere a nessuna delle due:
//  · **Partner** legge il registro Anagrafiche — l'elenco delle insegne attive,
//    che è di un'altra app e cambia quando cambia là;
//  · **Fornitori pagati** conta gli ordini di QUESTA app — chi li ha preparati e
//    soldi e quanto, che il registro non sa e non deve sapere.
//
// ⚠️ Un fornitore può stare nella seconda e non nella prima (l'abbiamo pagato
// una volta e in registro non c'è), e viceversa (un partner attivo che non ha
// mai preparato niente). Sono insiemi che si intersecano, non due viste dello
// stesso dato — e la scheda che si cambia lo rende evidente.
//
// ⚠️ La sezione si sceglie qui e non con due pagine perché è **un confronto**:
// «questo l'abbiamo in anagrafica?» si fa passando da una all'altra.

type Sezione = 'partner' | 'fornitori'

export function PartnerPagina() {
  const [sezione, setSezione] = useState<Sezione>('partner')

  return (
    <main>
      <div className="page-head">
        <div>
          <h1 className="page-title">Partner e fornitori</h1>
        </div>
      </div>

      {/* ⚠️ Due bottoni e non una tendina: sono due, si vedono tutti e due, e
          quello acceso dice dove sei senza doverlo aprire. */}
      <div className="barra-elenco" role="tablist" aria-label="Sezione">
        <button
          role="tab"
          aria-selected={sezione === 'partner'}
          className={`bottone${sezione === 'partner' ? ' attivo' : ''}`}
          onClick={() => setSezione('partner')}
        >
          Partner in anagrafica
        </button>
        <button
          role="tab"
          aria-selected={sezione === 'fornitori'}
          className={`bottone${sezione === 'fornitori' ? ' attivo' : ''}`}
          onClick={() => setSezione('fornitori')}
        >
          Fornitori usati
        </button>
      </div>

      {/* ⚠️ Si SMONTA quella che non serve invece di nasconderla col CSS: ognuna
          delle due carica da una sorgente diversa (il registro Anagrafiche e il
          nostro database), e tenerle vive vorrebbe dire due chiamate a ogni
          apertura per mostrarne una. */}
      {sezione === 'partner' ? <PartnerLista dentroLaPagina /> : <FornitoriUsati />}
    </main>
  )
}
