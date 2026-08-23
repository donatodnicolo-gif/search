'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { cosaSappiamo, ibanAccorciato, type FornitoreTrovato } from '@/lib/cerca-fornitore'

// «Magari abbiamo già i dati»: cerca il fornitore prima di ribattere l'IBAN.
//
// ⚠️ Non è una comodità. Un IBAN sono ventisette caratteri copiati da una chat o
// da una foto: ribatterlo ogni volta è il modo classico di sbagliarne uno — e un
// bonifico parte lo stesso, verso un conto che non esiste o, peggio, che esiste.
// Se quel fornitore l'abbiamo già pagato, l'IBAN giusto ce l'abbiamo in casa.

export function CercaFornitore({
  cercaSubito,
  onScelto,
}: {
  /** Il nome che arriva dall'ordine: si cerca da solo, senza far digitare. */
  cercaSubito?: string
  onScelto: (f: FornitoreTrovato) => void
}) {
  const [q, setQ] = useState('')
  const [risultati, setRisultati] = useState<FornitoreTrovato[]>([])
  const [nota, setNota] = useState('')
  const [cerco, setCerco] = useState(false)
  const [fatto, setFatto] = useState(false)
  const ultima = useRef('')

  const cerca = useCallback(async (testo: string) => {
    const t = testo.trim()
    ultima.current = t
    if (t.length < 2) {
      setRisultati([])
      setFatto(false)
      return
    }
    setCerco(true)
    try {
      const res = await fetch(`/api/fornitori/cerca?q=${encodeURIComponent(t)}`)
      if (!res.ok) return
      const d = (await res.json()) as { fornitori: FornitoreTrovato[]; nota: string }
      // ⚠️ Si scarta la risposta di una ricerca vecchia: scrivendo in fretta le
      // chiamate tornano in disordine, e l'elenco finirebbe per mostrare i
      // risultati di due lettere fa senza che si capisca perché.
      if (ultima.current !== t) return
      setRisultati(d.fornitori)
      setNota(d.nota || '')
      setFatto(true)
    } catch {
      // rete assente: si riprova scrivendo
    } finally {
      setCerco(false)
    }
  }, [])

  // Arrivando dal bottone «Paga» di un ordine il nome c'è già: si cerca subito,
  // perché chi arriva qui vuole pagare quel fornitore, non cercarlo.
  useEffect(() => {
    if (!cercaSubito) return
    setQ(cercaSubito)
    void cerca(cercaSubito)
  }, [cercaSubito, cerca])

  // Mezzo secondo di pausa: si cerca su tre fonti, una delle quali è un'altra
  // app, e una chiamata per ogni tasto le tempesterebbe.
  useEffect(() => {
    if (cercaSubito && q === cercaSubito) return
    const t = setTimeout(() => void cerca(q), 500)
    return () => clearTimeout(t)
  }, [q, cerca, cercaSubito])

  return (
    <div className="cerca-fornitore">
      <label className="campo">
        <span>Cerca il fornitore — magari lo conosciamo già</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Pasticceria Rossi"
          aria-label="Cerca un fornitore fra quelli che conosciamo"
        />
      </label>

      {/* ⚠️ La ricerca DEVE dire che sta lavorando e che cosa ha trovato.
          Senza, una casella che non mostra niente sembra rotta — e chi la crede
          rotta torna a ribattere l'IBAN a mano, che è il problema da cui si è
          partiti. */}
      {cerco ? <p className="cella-sub">Cerco…</p> : null}

      {!cerco && fatto && risultati.length > 0 ? (
        <p className="cella-sub">
          {risultati.length} che potrebbe{risultati.length === 1 ? '' : 'ro'} essere lui — il
          primo è quello che ci fa risparmiare di più.
        </p>
      ) : null}

      {fatto && !cerco && risultati.length === 0 ? (
        <p className="cella-sub">
          {/* ⚠️ Si dice che è NORMALE, e si dice DOVE si è cercato. Senza,
              «nessun risultato» sembra un guasto della ricerca, e chi lo legge
              riprova invece di scrivere. */}
          Nessuno con questo nome fra i nostri ordini, i pagamenti già fatti e il registro
          Anagrafiche: compila i campi qui sotto a mano. La prima volta è così per tutti —
          dalla prossima lo trovi qui.
        </p>
      ) : null}

      {risultati.length > 0 ? (
        <ul className="elenco-fornitori-trovati">
          {risultati.map((f, i) => (
            <li key={`${f.nome}-${i}`}>
              <button
                type="button"
                className="riga-fornitore-trovato"
                onClick={() => onScelto(f)}
                title={
                  f.iban
                    ? `Compila con questi dati: IBAN ${ibanAccorciato(f.iban)}`
                    : 'Compila nome e recapiti: l’IBAN va scritto a mano'
                }
              >
                <span className="titolo">
                  {f.ragioneSociale || f.nome}
                  {f.ragioneSociale && f.nome && f.ragioneSociale !== f.nome ? (
                    <span className="cella-sub"> · {f.nome}</span>
                  ) : null}
                </span>
                <span className="cella-sub">
                  {[f.citta, cosaSappiamo(f)].filter(Boolean).join(' — ')}
                </span>
              </button>
              {/* ⚠️⚠️ Più IBAN diversi per lo stesso nome: NON se ne propone
                  nessuno, e si dice perché. Due IBAN vogliono dire che è
                  cambiato qualcosa — un conto nuovo, un'altra società, un
                  omonimo — e indovinare vuol dire mandare i soldi altrove. */}
              {f.ibanDiversi > 1 ? (
                <p className="avviso-iban">
                  Di «{f.nome}» risultano <strong>{f.ibanDiversi} IBAN diversi</strong>: nessuno
                  viene proposto. Controlla qual è quello giusto prima di chiedere il pagamento.
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {nota ? <p className="cella-sub">{nota}</p> : null}
    </div>
  )
}
