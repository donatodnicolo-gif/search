'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Salvataggio AUTOMATICO della mail che stai scrivendo.
 *
 * Regole scelte per non riempire le Bozze di spazzatura:
 *  - si salva solo dopo che hai davvero cambiato qualcosa rispetto al testo
 *    precompilato (aprire una risposta e chiuderla non crea nessuna bozza);
 *  - si aspetta che tu smetta di scrivere, non si salva a ogni tasto;
 *  - dal primo salvataggio in poi si AGGIORNA quella bozza, non se ne creano
 *    altre (l'id torna dal server e lo si riusa);
 *  - non si salva mentre è in corso un invio.
 */
export function useBozzaAuto({
  attivo,
  contenuto,
  cambiato,
  salva,
  attesaMs = 2500,
}: {
  /** False mentre si invia (o quando non ha senso salvare). */
  attivo: boolean
  /** ⚠️ Deve CAMBIARE a ogni modifica del testo: è quello che fa ripartire
   *  l'attesa a ogni battuta. Con un semplice booleano il timer partirebbe una
   *  volta sola e la bozza si salverebbe solo al primo carattere. */
  contenuto: string
  /** True se il contenuto è diverso da quello di partenza. */
  cambiato: boolean
  /** Salva davvero e torna l'id della bozza (o null se non riuscito). */
  salva: () => Promise<string | null>
  attesaMs?: number
}): { stato: 'fermo' | 'salvo' | 'salvata'; quando: string | null } {
  const [stato, setStato] = useState<'fermo' | 'salvo' | 'salvata'>('fermo')
  const [quando, setQuando] = useState<string | null>(null)
  // `salva` cambia a ogni render (legge lo stato corrente): la si tiene in un
  // ref così l'effetto non riparte per quello, ma usa sempre l'ultima versione.
  const salvaRef = useRef(salva)
  salvaRef.current = salva

  useEffect(() => {
    if (!attivo || !cambiato) return
    const t = setTimeout(async () => {
      setStato('salvo')
      try {
        const id = await salvaRef.current()
        if (id !== null) {
          setStato('salvata')
          setQuando(new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }))
        } else {
          setStato('fermo')
        }
      } catch {
        setStato('fermo') // niente allarmi: si riprova al prossimo cambiamento
      }
    }, attesaMs)
    return () => clearTimeout(t)
  }, [attivo, contenuto, cambiato, attesaMs])

  return { stato, quando }
}
