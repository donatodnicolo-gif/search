'use client'

import { useCallback, useEffect, useState } from 'react'
import type { NotaDiario } from './Diario'

// Le righe di diario di UNA CONVERSAZIONE, dentro il thread.
//
// ⚠️ Esiste perché la cosa da ricordare nasce QUI: «richiamare lunedì», «vuole
// il biglietto scritto a mano», «il campanello non funziona, citofonare al 3».
// Finché la nota si poteva scrivere solo dalla pagina del diario o dalla scheda
// di un ordine, o si usciva dalla chat — e allora non la si scriveva — oppure
// restava nella testa di chi aveva risposto.
//
// ⚠️ Se la conversazione è collegata a un ordine la nota prende ANCHE quel
// numero: così la stessa riga si legge dalla scheda dell'ordine, dove la cerca
// chi prepara la consegna. Scriverla due volte sarebbe l'unico modo per avere
// due versioni diverse della stessa cosa.

export function DiarioConversazione({
  conversazioneId,
  chi,
  ordineNumero,
  onCambiato,
}: {
  conversazioneId: string
  /** Nome o numero di chi scrive: si COPIA sulla nota, vedi lo schema. */
  chi: string
  /** Il numero d'ordine della conversazione, se ce l'ha. */
  ordineNumero?: string
  /** Per aggiornare il contatore sul bottone senza ricaricare tutto. */
  onCambiato?: (aperte: number) => void
}) {
  const [note, setNote] = useState<NotaDiario[]>([])
  const [testo, setTesto] = useState('')
  const [caricato, setCaricato] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [errore, setErrore] = useState('')

  const carica = useCallback(async () => {
    if (!conversazioneId) return
    const p = new URLSearchParams({ conversazione: conversazioneId, stato: 'tutte' })
    const res = await fetch('/api/diario?' + p.toString())
    if (!res.ok) return
    const d = (await res.json()) as { note: NotaDiario[] }
    setNote(d.note)
    setCaricato(true)
    onCambiato?.(d.note.filter((n) => !n.fatta).length)
  }, [conversazioneId, onCambiato])

  useEffect(() => {
    void carica()
  }, [carica])

  async function aggiungi() {
    const riga = testo.trim()
    if (!riga || salvando) return
    setSalvando(true)
    setErrore('')
    try {
      const res = await fetch('/api/diario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testo: riga,
          conversazioneId,
          conversazioneChi: chi,
          // ⚠️ Solo se c'è: mandare una stringa vuota farebbe credere alla rotta
          // che il numero arrivi «dal contesto», e il numero scritto in testa
          // alla riga a mano non verrebbe più staccato.
          ...(ordineNumero ? { ordineNumero } : {}),
        }),
      })
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { errore?: string }
        // ⚠️ L'errore si dice. Una nota che sembra salvata e non c'è è peggio
        // di una nota non scritta: chi l'ha scritta smette di pensarci.
        setErrore(d.errore || 'Non è stata salvata.')
        return
      }
      setTesto('')
      await carica()
    } catch {
      setErrore('Non è stata salvata: rete assente.')
    } finally {
      setSalvando(false)
    }
  }

  async function segna(n: NotaDiario, fatta: boolean) {
    await fetch(`/api/diario/${n.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fatta }),
    })
    await carica()
  }

  return (
    <div className="diario-conversazione">
      <div className="cella-nome">
        Diario di questa conversazione
        {ordineNumero ? (
          <span className="cella-sub" style={{ marginLeft: 8 }}>
            le note vanno anche sull&apos;ordine {ordineNumero}
          </span>
        ) : null}
      </div>

      {caricato && note.length === 0 ? (
        <p className="cella-sub" style={{ margin: '4px 0 8px' }}>
          Nessuna nota. Scrivine una: la ritrovi qui e nel diario di lavoro.
        </p>
      ) : (
        <ul className="elenco-diario">
          {note.map((n) => (
            <li key={n.id} className={n.fatta ? 'fatta' : ''}>
              <input
                type="checkbox"
                checked={n.fatta}
                onChange={(e) => void segna(n, e.target.checked)}
                aria-label={n.fatta ? 'Riapri' : 'Segna fatta'}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div>{n.testo}</div>
                <div className="cella-sub">
                  {[
                    n.autoreNome,
                    new Date(n.creatoIl).toLocaleDateString('it-IT'),
                    n.ordineNumero,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="riga-nuova-nota">
        <input
          value={testo}
          onChange={(e) => setTesto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void aggiungi()
            }
          }}
          placeholder="richiamare lunedì · vuole il biglietto scritto a mano"
          aria-label="Aggiungi una nota al diario di questa conversazione"
        />
        <button
          className="bottone secondario mini"
          onClick={() => void aggiungi()}
          disabled={salvando || !testo.trim()}
        >
          {salvando ? 'Salvo…' : 'Aggiungi'}
        </button>
      </div>
      {errore ? <p className="errore-riga">{errore}</p> : null}
    </div>
  )
}
