'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// La chat che vive dentro l'iframe del widget sui siti. È pubblica: la
// "identità" del visitatore è solo il token di sessione, salvato nel
// localStorage di questo dominio.

type MessaggioWidget = { id: string; direzione: string; testo: string; creatoIl: string }

const CHIAVE_TOKEN = 'deluxy_widget_token'

export default function PaginaWidget() {
  const [token, setToken] = useState<string | null>(null)
  const [titolo, setTitolo] = useState('Deluxy')
  const [benvenuto, setBenvenuto] = useState('')
  const [messaggi, setMessaggi] = useState<MessaggioWidget[]>([])
  const [bozza, setBozza] = useState('')
  const [pronto, setPronto] = useState(false)
  const fondoRef = useRef<HTMLDivElement>(null)

  // Apre (o riapre) la sessione del visitatore.
  useEffect(() => {
    let annullato = false
    async function avvia() {
      const salvato = window.localStorage.getItem(CHIAVE_TOKEN)
      if (salvato) {
        // se la sessione esiste ancora la riusiamo, altrimenti se ne crea una nuova
        const res = await fetch(`/api/widget/messaggi?token=${encodeURIComponent(salvato)}`)
        if (res.ok && !annullato) {
          setToken(salvato)
          return
        }
      }
      const res = await fetch('/api/widget/sessione', { method: 'POST' })
      const dati = (await res.json()) as { token: string }
      if (!annullato) {
        window.localStorage.setItem(CHIAVE_TOKEN, dati.token)
        setToken(dati.token)
      }
    }
    avvia().catch(() => {})
    return () => {
      annullato = true
    }
  }, [])

  const aggiorna = useCallback(async () => {
    if (!token) return
    try {
      const res = await fetch(`/api/widget/messaggi?token=${encodeURIComponent(token)}`)
      if (!res.ok) return
      const dati = (await res.json()) as {
        titolo: string
        benvenuto: string
        messaggi: MessaggioWidget[]
      }
      setTitolo(dati.titolo)
      setBenvenuto(dati.benvenuto)
      setMessaggi(dati.messaggi)
      setPronto(true)
    } catch {
      // rete assente: si ritenta al giro dopo
    }
  }, [token])

  useEffect(() => {
    if (!token) return
    aggiorna()
    const t = setInterval(aggiorna, 3500)
    return () => clearInterval(t)
  }, [token, aggiorna])

  useEffect(() => {
    fondoRef.current?.scrollIntoView({ block: 'end' })
  }, [messaggi.length])

  async function invia() {
    const testo = bozza.trim()
    if (!token || !testo) return
    setBozza('')
    // eco locale immediata, poi il polling riallinea
    setMessaggi((prec) => [
      ...prec,
      { id: `locale-${Date.now()}`, direzione: 'in', testo, creatoIl: new Date().toISOString() },
    ])
    try {
      await fetch('/api/widget/messaggi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, testo }),
      })
    } catch {
      // il polling mostrerà lo stato reale
    }
  }

  return (
    <div className="widget-app">
      <div className="widget-testata">
        <div className="titolo">{titolo}</div>
        <div className="sotto">Di solito rispondiamo in giornata</div>
      </div>

      <div className="widget-messaggi">
        {pronto && benvenuto ? <div className="bolla out">{benvenuto}</div> : null}
        {messaggi.map((m) => (
          // Nel widget la prospettiva si ribalta: "in" (il visitatore) sta a destra.
          <div key={m.id} className={`bolla ${m.direzione === 'in' ? 'out' : 'in'}`}>
            {m.testo}
          </div>
        ))}
        <div ref={fondoRef} />
      </div>

      <div className="widget-composer">
        <input
          placeholder="Scrivi un messaggio…"
          value={bozza}
          onChange={(e) => setBozza(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') invia()
          }}
        />
        <button className="bottone" onClick={invia} disabled={!bozza.trim() || !token}>
          Invia
        </button>
      </div>
    </div>
  )
}
