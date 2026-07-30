'use client'

import { useCallback, useEffect, useState } from 'react'

// I messaggi del cliente, dentro la scheda dell'ordine.
//
// Chi guarda un ordine ha bisogno di sapere se quel cliente ci ha già scritto e
// cosa ha detto: senza, si risponde due volte alla stessa domanda, o si telefona
// a qualcuno che aveva già spiegato tutto per iscritto. E si può rispondere da
// qui: uscire, cercare la conversazione in Inbox e tornare indietro è il modo
// migliore per non rispondere affatto.

type MessaggioOrdine = {
  id: string
  direzione: string
  testo: string
  oggetto: string
  creatoIl: string
  utenteNome: string
}

type ConversazioneOrdine = {
  id: string
  canale: string
  chi: string
  nonLetti: number
  legame: 'numero' | 'email' | 'telefono'
  messaggi: MessaggioOrdine[]
}

const NOMI_CANALE: Record<string, string> = {
  whatsapp: 'WhatsApp',
  messenger: 'Messenger',
  instagram: 'Instagram',
  widget: 'Sito',
  email: 'Email',
}

/** Come l'abbiamo collegata a questo ordine: dice quanto fidarsi. */
const NOMI_LEGAME: Record<string, string> = {
  numero: 'cita questo ordine',
  email: 'stessa email',
  telefono: 'stesso telefono',
}

function quando(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('it-IT', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function MessaggiOrdine({ ordineId }: { ordineId: string }) {
  const [conversazioni, setConversazioni] = useState<ConversazioneOrdine[] | null>(null)
  const [bozze, setBozze] = useState<Record<string, string>>({})
  const [inviando, setInviando] = useState('')
  const [errore, setErrore] = useState('')

  const carica = useCallback(async () => {
    try {
      const res = await fetch(`/api/ordini/${ordineId}/messaggi`)
      if (!res.ok) return
      const d = (await res.json()) as { conversazioni: ConversazioneOrdine[] }
      setConversazioni(d.conversazioni ?? [])
    } catch {
      setConversazioni([])
    }
  }, [ordineId])

  useEffect(() => {
    carica()
  }, [carica])

  async function rispondi(conversazioneId: string) {
    const testo = (bozze[conversazioneId] ?? '').trim()
    if (!testo || inviando) return
    setInviando(conversazioneId)
    setErrore('')
    try {
      // La stessa rotta dell'Inbox: la risposta esce dal canale della
      // conversazione e dall'account che aveva ricevuto, senza scorciatoie.
      const res = await fetch(`/api/conversazioni/${conversazioneId}/messaggi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testo }),
      })
      const d = (await res.json().catch(() => ({}))) as { errore?: string }
      if (!res.ok) {
        setErrore(d.errore || 'Invio non riuscito.')
        return
      }
      setBozze((p) => ({ ...p, [conversazioneId]: '' }))
      await carica()
    } catch {
      setErrore('Invio non riuscito: problema di rete.')
    } finally {
      setInviando('')
    }
  }

  if (conversazioni === null) return null
  if (!conversazioni.length) {
    return (
      <div className="card">
        <h3 style={{ marginTop: 0, fontSize: 15 }}>Messaggi del cliente</h3>
        <p className="descrizione" style={{ marginBottom: 0 }}>
          Nessun messaggio collegato a questo ordine. Si collegano da soli quando la mail cita il
          numero d&apos;ordine, o quando il cliente scrive dalla stessa email o dallo stesso numero.
        </p>
      </div>
    )
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0, fontSize: 15 }}>
        Messaggi del cliente{' '}
        <span className="cella-sub">
          {conversazioni.length} conversazion{conversazioni.length === 1 ? 'e' : 'i'}
        </span>
      </h3>

      {errore ? <div className="avviso-errore">{errore}</div> : null}

      {conversazioni.map((c) => (
        <div className="conversazione-ordine" key={c.id}>
          <div className="testa">
            <span className={`badge canale-${c.canale}`}>{NOMI_CANALE[c.canale] ?? c.canale}</span>
            <strong>{c.chi}</strong>
            {/* Perché è collegata: «cita questo ordine» vale più di «stessa
                email», e chi legge deve poterlo sapere. */}
            <span className="cella-sub">{NOMI_LEGAME[c.legame]}</span>
            {c.nonLetti > 0 ? <span className="pill-nonletti">{c.nonLetti}</span> : null}
            <a className="btn btn-secondario small" href={`/inbox?c=${c.id}`}>
              Apri in Inbox
            </a>
          </div>

          <div className="battute">
            {c.messaggi.map((m) => (
              <div key={m.id} className={`battuta ${m.direzione === 'out' ? 'nostra' : 'sua'}`}>
                {m.oggetto ? <span className="oggetto">{m.oggetto}</span> : null}
                <span className="testo">{m.testo.slice(0, 400)}</span>
                <span className="quando">
                  {quando(m.creatoIl)}
                  {m.direzione === 'out' && m.utenteNome ? ` · ${m.utenteNome}` : ''}
                </span>
              </div>
            ))}
          </div>

          <div className="rispondi">
            <textarea
              rows={2}
              placeholder={`Rispondi su ${NOMI_CANALE[c.canale] ?? c.canale}…`}
              value={bozze[c.id] ?? ''}
              onChange={(e) => setBozze((p) => ({ ...p, [c.id]: e.target.value }))}
            />
            <button
              className="btn"
              onClick={() => rispondi(c.id)}
              disabled={inviando === c.id || !(bozze[c.id] ?? '').trim()}
            >
              {inviando === c.id ? 'Invio…' : 'Invia'}
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
