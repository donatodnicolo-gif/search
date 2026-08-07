'use client'

import { useEffect, useRef } from 'react'
import { segnaLetto } from '@/lib/actions'

/** Avvisa la barra dei comandi che questa mail è appena stata segnata letta. */
export const EVENTO_LETTA = 'aimail:letta'

/**
 * APRIRE UNA MAIL LA SEGNA LETTA.
 *
 * Fino al 5/08/2026 no: il pallino blu si spegneva solo col tasto «✓ Letto»,
 * rispondendo, archiviando o cestinando. Aprire una mail, leggerla e tornare
 * indietro la lasciava fra le da leggere — che è il contrario di quello che fa
 * qualunque programma di posta, e infatti è stato segnalato come un difetto.
 *
 * ⚠️ Perché un componente client e non una scrittura dentro la pagina: la
 * pagina è un Server Component che viene ri-eseguito a ogni `router.refresh()`,
 * e il refresh lo fa anche **«Segna non letto»**. Marcando dentro il render, il
 * tasto per rimetterla fra le da leggere si sarebbe disfatto da solo un istante
 * dopo, senza che si capisse perché. Qui invece si marca **al montaggio**, cioè
 * una volta per mail aperta: un refresh non rimonta niente, e il «non letto»
 * resta.
 * ⚠️ `id` nelle dipendenze e non `[]`: passando da una mail all'altra il
 * componente può essere riusato invece che rimontato, e la seconda mail
 * resterebbe da leggere.
 */
export function SegnaLettaAllApertura({ id, letto }: { id: string; letto: boolean }) {
  // La mail già letta non si tocca: sarebbe una scrittura inutile a ogni
  // apertura, per giunta su ogni rilettura della stessa mail.
  const fattoPer = useRef<string | null>(letto ? id : null)

  useEffect(() => {
    if (fattoPer.current === id) return
    fattoPer.current = id
    void segnaLetto(id, true).then(() => {
      // ⚠️ NIENTE `router.refresh()`: rifarebbe l'intero render della pagina
      // (conversazione, riassunto, chiavi) a ogni mail aperta, per cambiare
      // una parola su un bottone — proprio il lavoro enorme per un risultato
      // minuscolo che questa app ha già pagato altrove. Si avvisa e basta: la
      // barra dei comandi cambia «Segna letto» in «Segna non letto» da sé, e
      // l'elenco è comunque invalidato dalla server action.
      window.dispatchEvent(new CustomEvent(EVENTO_LETTA, { detail: { id } }))
    })
  }, [id])

  return null
}
