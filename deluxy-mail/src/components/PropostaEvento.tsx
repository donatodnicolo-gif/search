'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { accettaEventoProposto, ignoraEventoProposto } from '@/lib/actions'

type Props = {
  messaggioId: string
  evento: { titolo: string; inizio: string; fine: string | null; luogo: string; giornataIntera: boolean }
}

/**
 * L'AI ha riconosciuto un appuntamento nella mail: qui lo si accetta (va in
 * calendario) o si ignora. Niente parte da solo — l'inserimento lo decidi tu.
 */
export function PropostaEvento({ messaggioId, evento }: Props) {
  const [stato, setStato] = useState<string | null>(null)
  const [inCorso, start] = useTransition()
  const router = useRouter()

  // La data è in ora italiana (YYYY-MM-DDTHH:MM): la mostro leggibile senza
  // riconvertire fusi, prendendo i pezzi così come sono.
  const quando = formattaQuando(evento.inizio, evento.fine, evento.giornataIntera)

  const accetta = () =>
    start(async () => {
      const r = await accettaEventoProposto(messaggioId)
      setStato(r.messaggio)
      if (r.ok) router.refresh()
    })

  const ignora = () =>
    start(async () => {
      await ignoraEventoProposto(messaggioId)
      router.refresh()
    })

  return (
    <div className="ai-box">
      <div className="ai-box-title">Appuntamento trovato dall’AI</div>
      <div className="ai-box-text">
        <strong>{evento.titolo}</strong>
        <br />
        {quando}
        {evento.luogo && (
          <>
            <br />
            {/^https?:\/\//.test(evento.luogo) ? (
              <a href={evento.luogo} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>
                {evento.luogo}
              </a>
            ) : (
              evento.luogo
            )}
          </>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn primary small" type="button" onClick={accetta} disabled={inCorso}>
          {inCorso ? 'Aggiungo…' : '＋ Aggiungi al calendario'}
        </button>
        <button className="btn secondary small" type="button" onClick={ignora} disabled={inCorso}>
          Ignora
        </button>
        {stato && <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{stato}</span>}
      </div>
    </div>
  )
}

const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato']
const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']

function formattaQuando(inizio: string, fine: string | null, giornataIntera: boolean): string {
  const mi = inizio.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/)
  if (!mi) return inizio
  const [Y, M, G, h, min] = [mi[1], mi[2], mi[3], mi[4], mi[5]]
  // Il giorno della settimana: uso UTC per non farmi spostare dal fuso locale.
  const g = new Date(Date.UTC(Number(Y), Number(M) - 1, Number(G))).getUTCDay()
  const data = `${GIORNI[g]} ${Number(G)} ${MESI[Number(M) - 1]} ${Y}`
  if (giornataIntera || !h) return `${data} · tutto il giorno`
  const mf = fine?.match(/[T ](\d{2}):(\d{2})/)
  const ora = mf ? `${h}:${min}–${mf[1]}:${mf[2]}` : `${h}:${min}`
  return `${data} · ${ora}`
}
