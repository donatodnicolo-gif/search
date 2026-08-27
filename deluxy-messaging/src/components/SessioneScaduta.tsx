'use client'

import { useEffect, useState } from 'react'

// QUANDO LA SESSIONE MUORE MENTRE L'APP È APERTA.
//
// ⚠️⚠️ NASCE DA UN GUASTO VERO, il 27/08/2026, e il guasto l'ho fatto io. Ho
// cambiato la forma del cookie di sessione per poterla revocare — cosa giusta —
// e tutti i cookie già in giro sono diventati invalidi. Chi aveva l'app aperta
// in una scheda **non è stato mandato al login**: la pagina non si ricarica,
// quindi il middleware non la vede mai passare. Da quel momento ogni `fetch`
// del browser si è preso un 307 verso /login, che `fetch` segue restituendo la
// pagina di login con stato 200.
//
// Il risultato, dalla parte di chi lavora: la tendina dei negozi vuota nel
// nuovo ordine, il diario che «non si riesce più a leggere», la chat ferma.
// Tre segnalazioni diverse, **un guasto solo**, e nessuna delle tre diceva la
// cosa vera — «devi rientrare».
//
// ⚠️ Perché una fascia e non un salto automatico al login: chi sta compilando
// un ordine al telefono ha mezz'ora di lavoro in quel modulo, e mandarlo via
// gliela butta. La fascia si vede da qualunque schermata, spiega, e il salto lo
// decide lui. ⚠️ Ma è **fissa in cima e non si chiude**: un avviso che si può
// scacciare, su un'app che da quel momento non funziona più, si scaccia.

/** Il nome dell'evento: lo manda `src/lib/leggi-json.ts` quando se ne accorge. */
export const EVENTO_SESSIONE_SCADUTA = 'deluxy:sessione-scaduta'

export function SessioneScaduta() {
  const [scaduta, setScaduta] = useState(false)

  useEffect(() => {
    const quando = () => setScaduta(true)
    window.addEventListener(EVENTO_SESSIONE_SCADUTA, quando)
    return () => window.removeEventListener(EVENTO_SESSIONE_SCADUTA, quando)
  }, [])

  if (!scaduta) return null

  return (
    <div className="sessione-scaduta" role="alert">
      <span>
        <strong>La sessione è scaduta.</strong> Da adesso gli elenchi restano vuoti finché non
        rientri — non è che i dati non ci sono.
      </span>
      {/* ⚠️ `window.location` e non il router: si vuole un caricamento VERO, che
          passi dal middleware e getti via lo stato di una pagina che ormai
          parla con un'app che non la riconosce più. */}
      <button className="bottone" onClick={() => (window.location.href = '/login')}>
        Rientra
      </button>
    </div>
  )
}
