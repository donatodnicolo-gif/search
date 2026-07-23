'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cambiaThreadChiuso } from '@/lib/actions'
import { mostraFlash } from './Flash'

/**
 * Segna una conversazione come CHIUSA (pratica finita) o la riapre. Chiusa:
 * fuori dai «Top thread» e con l'etichetta «Chiuso» in elenco. Le mail restano
 * dove sono: è un'etichetta, non un archivio.
 *
 * `variante='riga'` è la versione compatta per le righe della lista Thread.
 */
export function ChiudiThread({
  messaggioId,
  chiuso,
  variante = 'bottone',
}: {
  messaggioId: string
  chiuso: boolean
  variante?: 'bottone' | 'riga'
}) {
  const [attivo, setAttivo] = useState(chiuso)
  const [inCorso, start] = useTransition()
  const router = useRouter()

  const cambia = () =>
    start(async () => {
      const nuovo = !attivo
      const esito = await cambiaThreadChiuso(messaggioId, nuovo)
      if (esito.ok) setAttivo(nuovo)
      mostraFlash(esito.messaggio)
      router.refresh()
    })

  const titolo = attivo
    ? 'Conversazione chiusa: riaprila se la pratica torna viva.'
    : 'Segna la conversazione come chiusa: esce dai Top thread e prende l’etichetta «Chiuso».'

  if (variante === 'riga') {
    return (
      <button
        type="button"
        className="azione-riga"
        disabled={inCorso}
        title={titolo}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          cambia()
        }}
      >
        {inCorso ? '…' : attivo ? 'Riapri' : 'Chiudi'}
      </button>
    )
  }

  return (
    <button
      type="button"
      className="btn secondary small"
      disabled={inCorso}
      title={titolo}
      onClick={cambia}
    >
      {inCorso ? '…' : attivo ? '↻ Riapri conversazione' : '✓ Segna come chiusa'}
    </button>
  )
}
