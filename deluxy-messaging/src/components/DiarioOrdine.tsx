'use client'

import { useCallback, useEffect, useState } from 'react'
import { insieme, type NotaDiario } from './Diario'
import { CampoRigaDiario } from './CampoRigaDiario'

// Le righe di diario di UN ordine, dentro il pannello dell'ordine.
//
// ⚠️ È il motivo per cui il diario esiste: prima quelle righe stavano in una
// chat interna, e chi apriva l'ordine non sapeva che ci fosse scritto
// «pagamento su cs, concordato cambio fiori con mittente». Qui la nota si legge
// dove si lavora l'ordine, e si scrive senza ripetere il numero.

export function DiarioOrdine({
  numero,
  rileggiA = 0,
}: {
  numero: string
  /**
   * Un contatore che cambia quando fuori è successo qualcosa che tocca queste
   * note — oggi: l'ordine è stato messo «Gestito» e le note si sono chiuse.
   *
   * ⚠️ Senza, l'elenco qui dentro restava quello di prima: si spuntava
   * «Gestito», le note erano chiuse nel database, e a schermo continuavano a
   * risultare da fare finché non si ricaricava la pagina. Una schermata che
   * mostra il contrario di quello che è appena successo fa premere il bottone
   * una seconda volta.
   */
  rileggiA?: number
}) {
  const [note, setNote] = useState<NotaDiario[]>([])
  const [testo, setTesto] = useState('')
  const [caricato, setCaricato] = useState(false)

  const carica = useCallback(async () => {
    if (!numero) return
    const p = new URLSearchParams({ ordine: numero, stato: 'tutte' })
    const res = await fetch('/api/diario?' + p.toString())
    if (!res.ok) return
    // ⚠️⚠️ CAPOFILA **E** SEGUITI. Dal 25/08/2026 una nota può avere un filo, e
    // la rotta li tiene separati (`note` = le capofila, `seguiti` = le righe che
    // le citano). Qui si rimettono insieme: questa vista è già dentro un ordine
    // — il contesto non manca — e leggerne solo metà vorrebbe dire che una riga
    // scritta dal Diario qui **sparisce**, senza che niente dia errore.
    const d = (await res.json()) as { note: NotaDiario[]; seguiti?: NotaDiario[] }
    setNote(insieme(d.note, d.seguiti))
    setCaricato(true)
  }, [numero])

  useEffect(() => {
    void carica()
  }, [carica, rileggiA])

  async function aggiungi() {
    const riga = testo.trim()
    if (!riga) return
    // ⚠️ Il numero si passa dal contesto: qui la riga si scrive senza
    // ripeterlo — «da fare 16 luglio» — ed è così che la scriverebbe una
    // persona che ha l'ordine già davanti.
    await fetch('/api/diario', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ testo: riga, ordineNumero: numero }),
    })
    setTesto('')
    await carica()
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
    <div style={{ marginTop: 12, borderTop: '1px solid var(--hairline)', paddingTop: 10 }}>
      <div className="cella-nome" style={{ marginBottom: 6 }}>
        Diario{note.length ? ` · ${note.filter((n) => !n.fatta).length} da fare` : ''}
      </div>

      {caricato && note.length === 0 ? (
        <p className="cella-sub" style={{ marginTop: 0 }}>
          Nessuna nota su questo ordine.
        </p>
      ) : (
        <ul className="elenco-diario" style={{ marginBottom: 8 }}>
          {note.map((n) => (
            <li key={n.id} className={n.fatta ? 'fatta' : ''} style={{ padding: '6px 0' }}>
              <input
                type="checkbox"
                checked={n.fatta}
                onChange={(e) => void segna(n, e.target.checked)}
                aria-label={n.fatta ? 'Riapri' : 'Segna fatta'}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div>{n.testo}</div>
                <div className="cella-sub">
                  {[n.autoreNome, new Date(n.creatoIl).toLocaleDateString('it-IT')]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div style={{ display: 'flex', gap: 6 }}>
        <CampoRigaDiario
          value={testo}
          onChange={setTesto}
          onInvio={() => void aggiungi()}
          placeholder="da fare 16 luglio · «/» per il calendario"
          ariaLabel="Aggiungi una nota al diario di questo ordine"
        />
        <button className="bottone secondario mini" onClick={() => void aggiungi()}>
          Aggiungi
        </button>
      </div>
    </div>
  )
}
