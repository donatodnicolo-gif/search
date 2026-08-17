'use client'

import { useEffect } from 'react'

/**
 * La × della chat pubblica (`/chat/<codice>`) riporta il cliente da dove era
 * venuto.
 *
 * Dentro l'iframe la × fa una cosa sola: manda `deluxy-widget:chiudi` alla
 * pagina che la ospita. Sui siti la ascolta `widget.js` e chiude il pannello;
 * qui la pagina ospite siamo noi, e prima non la ascoltava nessuno — il
 * cliente premeva la × e non succedeva niente, su una pagina che non aveva
 * altro modo per andarsene.
 *
 * Cosa vuol dire «tornare» dipende da come è arrivato, e si prova nell'ordine:
 *  1. c'è una pagina prima nella storia della scheda (ha cliccato il link da
 *     Instagram, da WhatsApp web, dal sito) → indietro, alla pagina che stava
 *     guardando;
 *  2. non c'è (QR sul biglietto, link aperto in una scheda nuova) → il sito
 *     del marchio, che è il posto più vicino a «dov'era»;
 *  3. non abbiamo nemmeno quello → si prova a chiudere la scheda, che riesce
 *     solo se l'ha aperta uno script.
 *
 * ⚠️ `history.back()` non promette di navigare: con una sola voce non fa
 * niente, e alcuni browser in-app contano voci che non portano da nessuna
 * parte. Perciò dopo averlo chiesto si aspetta un attimo: se la pagina è
 * ancora qui (nessun `pagehide`), si passa al punto 2. È lo stesso schema del
 * ripiego dei link rapidi nel widget.
 */
export function RitornoChatPubblica({ dominio }: { dominio: string }) {
  useEffect(() => {
    // Il dominio è configurato da noi, ma finisce in un indirizzo: si accetta
    // solo la forma di un nome di dominio, senza schema né percorso.
    const sito = /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(dominio) ? `https://${dominio}/` : ''

    function versoIlSito() {
      if (sito) {
        window.location.href = sito
        return
      }
      window.close()
    }

    function torna() {
      if (window.history.length <= 1) {
        versoIlSito()
        return
      }
      let andato = false
      const segnaAndato = () => {
        andato = true
      }
      window.addEventListener('pagehide', segnaAndato, { once: true })
      window.history.back()
      window.setTimeout(() => {
        window.removeEventListener('pagehide', segnaAndato)
        // Ancora qui dopo mezzo secondo: l'indietro non ha portato da nessuna
        // parte, si va sul sito. (Non si guarda `document.hidden`: una scheda
        // in secondo piano è ancora questa pagina.)
        if (!andato) versoIlSito()
      }, 500)
    }

    function alMessaggio(e: MessageEvent) {
      // Solo dal nostro iframe: la pagina non ha altri frame, ma un messaggio
      // può arrivare da qualunque finestra che ne conosca l'indirizzo.
      if (e.origin !== window.location.origin) return
      if (e.data !== 'deluxy-widget:chiudi') return
      torna()
    }

    window.addEventListener('message', alMessaggio)
    return () => window.removeEventListener('message', alMessaggio)
  }, [dominio])

  return null
}
