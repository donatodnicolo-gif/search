'use client'

import { useCallback, useEffect, useState } from 'react'

// Il pop-up per collegare una conversazione a un ordine.
//
// L'aggancio automatico prende il caso facile (il cliente cita il numero, o
// scrive dalla mail dell'ordine). Questo prende tutti gli altri — «buongiorno,
// per la consegna di domani» da un indirizzo che non è quello dell'ordine — che
// oggi costano una ricerca a mano ogni volta che si riapre il thread.

type OrdineTrovato = {
  id: string
  numero: string
  clienteNome: string
  negozioNome: string
  dataConsegna: string | null
  fasciaConsegna: string
  totale: number
  valuta: string
}

function soldi(v: number, valuta: string): string {
  return v.toLocaleString('it-IT', { style: 'currency', currency: valuta || 'EUR' })
}

function consegna(o: OrdineTrovato): string {
  if (!o.dataConsegna) return 'consegna non indicata'
  const d = new Date(o.dataConsegna).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })
  return o.fasciaConsegna ? `${d} · ${o.fasciaConsegna}` : d
}

export function CollegaOrdine({
  collegato,
  suggerimento,
  citati = [],
  onScegli,
  onChiudi,
}: {
  /** Il numero già collegato, se c'è: da lì si può anche scollegare. */
  collegato?: string
  /**
   * Da cosa partire per cercare: il nome o la mail del cliente della
   * conversazione. ⚠️ La ricerca parte **da sola** con questo, perché nove volte
   * su dieci l'ordine è di quel cliente — e chi apre il pop-up ha già in mente
   * lui, non una stringa da digitare.
   */
  suggerimento?: string
  /**
   * I numeri d'ordine **già scritti dentro la conversazione**.
   *
   * ⚠️ Quasi sempre la risposta è lì: il cliente incolla la conferma
   * («Ordine #2759 confermato») o lo cita scrivendo. Far cercare a mano un
   * numero che è tre righe più su è il tipo di lavoro che l'app dovrebbe
   * togliere, non chiedere.
   */
  citati?: string[]
  onScegli: (numero: string) => void
  onChiudi: () => void
}) {
  const [q, setQ] = useState(suggerimento ?? '')
  const [risultati, setRisultati] = useState<OrdineTrovato[]>([])
  const [cercando, setCercando] = useState(false)
  const [errore, setErrore] = useState('')
  const [cercato, setCercato] = useState(false)

  const cerca = useCallback(async (testo: string) => {
    const pulito = testo.trim()
    if (!pulito) {
      setRisultati([])
      setCercato(false)
      return
    }
    setCercando(true)
    setErrore('')
    try {
      // Si cerca fra TUTTI gli ordini, non solo quelli aperti: una mail arriva
      // spesso dopo la consegna («non è arrivato niente»), e un ordine già
      // chiuso è esattamente quello di cui parla.
      const p = new URLSearchParams({ q: pulito, gestione: '' })
      const res = await fetch('/api/ordini?' + p.toString())
      const d = (await res.json().catch(() => ({}))) as { ordini?: OrdineTrovato[]; errore?: string }
      if (!res.ok) {
        setErrore(d.errore || 'Ricerca non riuscita.')
        return
      }
      setRisultati((d.ordini ?? []).slice(0, 25))
      setCercato(true)
    } catch {
      setErrore('Ricerca non riuscita: problema di rete.')
    } finally {
      setCercando(false)
    }
  }, [])

  // La prima ricerca parte da sola col nome del cliente.
  useEffect(() => {
    if (suggerimento?.trim()) void cerca(suggerimento)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const tasto = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onChiudi()
    }
    document.addEventListener('keydown', tasto)
    return () => document.removeEventListener('keydown', tasto)
  }, [onChiudi])

  return (
    // ⚠️ `velo-sopra` e non `velo` e basta: la conversazione a colonne è
    // anch'essa una finestra col suo velo, e due veli allo stesso livello li
    // ordina il DOM — questo nasceva prima, quindi si apriva DIETRO. Da fuori
    // sembrava che il bottone non facesse niente.
    <div className="velo velo-sopra" onClick={onChiudi} role="presentation">
      <div
        className="pannello stretto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Collega a un ordine"
      >
        <div className="pannello-testa">
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>Collega a un ordine</h2>
            <div className="cella-sub">
              Cerca per numero, cliente, telefono, email o indirizzo.
            </div>
          </div>
          {/* ✕ obbligatoria (Libro v1.7 §9): stesso handler di Esc e del velo. */}
          <button className="pannello-chiudi" aria-label="Chiudi" title="Chiudi (Esc)" onClick={onChiudi}>
            ✕
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, margin: '12px 0' }}>
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void cerca(q)
            }}
            placeholder="1742, Mario Rossi, mario@…"
            aria-label="Cerca l'ordine"
            style={{ flex: 1 }}
          />
          <button className="bottone" onClick={() => void cerca(q)} disabled={cercando}>
            {cercando ? 'Cerco…' : 'Cerca'}
          </button>
        </div>

        {errore ? <div className="avviso-errore">{errore}</div> : null}

        {/* I numeri citati nel thread, in cima: un clic e via. */}
        {citati.length ? (
          <div style={{ marginBottom: 10 }}>
            <div className="cella-sub" style={{ marginBottom: 4 }}>
              Scritti in questa conversazione:
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {citati.map((n) => (
                <button key={n} className="bottone mini" onClick={() => onScegli(n)}>
                  {n}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {/* ⚠️ Lo scollegamento sta qui dentro e non fra le azioni del thread: un
            aggancio sbagliato fa leggere la conversazione col contesto di un
            altro cliente, e chi se ne accorge è chi sta guardando proprio
            questo. */}
        {collegato ? (
          <div
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              flexWrap: 'wrap',
              marginBottom: 10,
            }}
          >
            <span className="cella-sub">Adesso è collegata a {collegato}.</span>
            <button className="bottone secondario mini" onClick={() => onScegli('')}>
              Scollega
            </button>
          </div>
        ) : null}

        <div style={{ maxHeight: '50vh', overflowY: 'auto', display: 'grid', gap: 8 }}>
          {risultati.map((o) => (
            <button
              key={o.id}
              className="card riga-cliccabile"
              style={{ padding: 10, textAlign: 'left' }}
              onClick={() => onScegli(o.numero)}
            >
              <div className="cella-nome">
                {o.numero} · {soldi(o.totale, o.valuta)}
              </div>
              <div className="cella-sub">
                {[o.clienteNome || 'senza nome', o.negozioNome, consegna(o)]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            </button>
          ))}
          {cercato && !risultati.length && !cercando ? (
            <p className="descrizione">
              Nessun ordine trovato. ⚠️ Qui teniamo gli ultimi <strong>60 giorni</strong>: di
              uno più vecchio si cerca dall&apos;archivio in Ordini globali.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
