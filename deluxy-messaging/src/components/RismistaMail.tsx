'use client'

import { useState } from 'react'

// «Applica alle mail già arrivate».
//
// ⚠️ Lo smistamento per sito e l'elenco dei mittenti da ignorare agiscono
// all'ARRIVO della mail: le conversazioni di ieri restano dove sono. È per
// questo che in Inbox si vedeva ancora «[cakedesign] Ordine #1742» nella colonna
// Deluxy. Questo bottone ripassa quelle già in casa.
export function RismistaMail() {
  const [inCorso, setInCorso] = useState(false)
  const [esito, setEsito] = useState('')
  const [errore, setErrore] = useState('')

  async function applica() {
    setInCorso(true)
    setEsito('')
    setErrore('')
    try {
      const res = await fetch('/api/email/rismista', { method: 'POST' })
      const d = (await res.json().catch(() => ({}))) as {
        guardate?: number
        smistate?: number
        archiviate?: number
        errore?: string
      }
      if (!res.ok) {
        setErrore(d.errore || 'Non è riuscito.')
        return
      }
      setEsito(
        `Guardate ${d.guardate ?? 0} conversazioni: ${d.smistate ?? 0} spostate nel marchio giusto, ${d.archiviate ?? 0} archiviate perché di mittenti in elenco.`
      )
    } catch {
      setErrore('Non è riuscito: problema di rete.')
    } finally {
      setInCorso(false)
    }
  }

  return (
    <div style={{ marginTop: 10 }}>
      <button type="button" className="btn btn-secondario" onClick={applica} disabled={inCorso}>
        {inCorso ? 'Sto ripassando…' : 'Applica alle mail già arrivate'}
      </button>
      {esito ? (
        <p className="cella-sub" style={{ marginTop: 8, marginBottom: 0 }}>
          {esito}
        </p>
      ) : null}
      {errore ? (
        <div className="avviso-errore" style={{ marginTop: 8 }}>
          {errore}
        </div>
      ) : null}
    </div>
  )
}
