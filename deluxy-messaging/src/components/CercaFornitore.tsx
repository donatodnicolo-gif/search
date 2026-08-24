'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  cosaSappiamo,
  diMestiere,
  ibanAccorciato,
  type FornitoreTrovato,
} from '@/lib/cerca-fornitore'

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
  // ── GOOGLE MAPS ──
  // ⚠️ Stato separato perché è una ricerca DIVERSA: si paga a chiamata, parte
  // solo con un bottone, e i suoi risultati non sono nostri.
  const [zona, setZona] = useState('')
  const [cercoMaps, setCercoMaps] = useState(false)
  const [chiestoMaps, setChiestoMaps] = useState(false)
  const [notaMaps, setNotaMaps] = useState('')
  const [prendo, setPrendo] = useState('')

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
      // ⚠️ Cambiando il nome cercato, i risultati di Maps di prima non valgono
      // più: lasciarli visibili farebbe scegliere il fioraio della ricerca
      // precedente.
      setChiestoMaps(false)
      setNotaMaps('')
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

  /**
   * La ricerca su Google Maps: solo su richiesta.
   * ⚠️ Si paga a chiamata — un autocompletamento su Maps a ogni tasto sarebbero
   * centinaia di ricerche al giorno per riempire un campo che nove volte su
   * dieci si riempie con quello che sappiamo già.
   */
  async function cercaMaps() {
    const testo = q.trim()
    if (testo.length < 2) return
    setCercoMaps(true)
    setNotaMaps('')
    try {
      const res = await fetch(
        `/api/fornitori/cerca?q=${encodeURIComponent(testo)}&maps=1&dove=${encodeURIComponent(zona)}`
      )
      if (!res.ok) {
        setNotaMaps('La ricerca su Google Maps non è riuscita.')
        return
      }
      const d = (await res.json()) as {
        fornitori: FornitoreTrovato[]
        nota: string
        notaMaps?: string
      }
      setRisultati(d.fornitori)
      setNota(d.nota || '')
      setNotaMaps(d.notaMaps || '')
      setChiestoMaps(true)
      setFatto(true)
    } catch {
      setNotaMaps('Rete assente.')
    } finally {
      setCercoMaps(false)
    }
  }

  /**
   * Sceglie un risultato. ⚠️ Se viene da Maps si chiede PRIMA il telefono, con
   * una chiamata sola: la ricerca di testo non lo restituisce, e un fornitore
   * senza numero non si può chiamare — che è l'unica cosa che si vuol fare con
   * uno trovato su Maps.
   */
  async function scegli(f: FornitoreTrovato) {
    if (!f.mapsId) {
      onScelto(f)
      return
    }
    setPrendo(f.mapsId)
    try {
      const res = await fetch(`/api/fornitori/maps?id=${encodeURIComponent(f.mapsId)}`)
      const d = (await res.json().catch(() => ({}))) as {
        luogo?: { telefono: string; sito: string; citta: string; indirizzo: string }
        errore?: string
      }
      // ⚠️ Se il dettaglio non arriva si sceglie LO STESSO, con quello che
      // abbiamo: nome e indirizzo valgono già, e bloccare la scelta per un
      // telefono mancante vorrebbe dire ricopiare tutto a mano.
      onScelto(
        d.luogo
          ? { ...f, telefono: d.luogo.telefono || '', citta: d.luogo.citta || f.citta }
          : f
      )
      if (!d.luogo) setNotaMaps(`Il numero non è arrivato (${d.errore ?? 'errore'}): scrivilo a mano.`)
    } catch {
      onScelto(f)
      setNotaMaps('Il numero non è arrivato: scrivilo a mano.')
    } finally {
      setPrendo('')
    }
  }

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
                onClick={() => void scegli(f)}
                disabled={!!prendo}
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
                  {/* ⚠️ La CATEGORIA del registro è l'unico modo in cui si sa
                      che «da questo compriamo»: un campo «fornitore sì/no» non
                      esiste. Marcata in verde quando è un mestiere di
                      fornitura, così un fioraio si distingue da una boutique
                      cliente — che in un elenco si somigliano molto. */}
                  {f.categoria ? (
                    <span
                      className="badge"
                      style={{
                        marginLeft: 6,
                        color: diMestiere(f.categoria) ? 'var(--green)' : 'var(--text-tertiary)',
                      }}
                    >
                      {f.categoria.toLowerCase()}
                    </span>
                  ) : null}
                  {/* ⚠️⚠️ Chi viene da Maps si vede SUBITO ed è in fondo
                      all'elenco: non lo conosciamo, non sappiamo se risponde né
                      se fattura. Una riga uguale alle altre lo farebbe scegliere
                      per sbaglio, con la fretta di un ordine da sistemare. */}
                  {f.fonti.includes('maps') && f.fonti.length === 1 ? (
                    <span className="badge" style={{ marginLeft: 6, color: 'var(--text-tertiary)' }}>
                      Google Maps
                    </span>
                  ) : null}
                  {prendo === f.mapsId ? (
                    <span className="cella-sub"> · prendo il numero…</span>
                  ) : null}
                </span>
                <span className="cella-sub">
                  {[f.citta, cosaSappiamo(f)].filter(Boolean).join(' — ')}
                </span>
                {f.indirizzo ? <span className="cella-sub">{f.indirizzo}</span> : null}
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

      {/* ── CERCARE FUORI, SU GOOGLE MAPS ──
          ⚠️⚠️ Compare solo quando si è già cercato in casa, perché è l'ordine
          giusto delle cose: chi conosciamo ha l'IBAN, la storia degli ordini e
          un prezzo già concordato; chi sta su Maps è un numero di telefono da
          chiamare. Mettere le due ricerche affiancate le farebbe sembrare
          equivalenti, e non lo sono.
          ⚠️ E si dice che si paga a chiamata: è la ragione per cui c'è un
          bottone invece di partire da sola. */}
      {fatto && q.trim().length >= 2 ? (
        <div className="cerca-fuori">
          <label className="campo" style={{ margin: 0, flex: '1 1 160px' }}>
            <span>Zona in cui cercare</span>
            <input
              value={zona}
              onChange={(e) => setZona(e.target.value)}
              placeholder="Lecce"
              aria-label="Città o provincia in cui cercare su Google Maps"
            />
          </label>
          <button
            type="button"
            className="btn btn-secondario small"
            onClick={() => void cercaMaps()}
            disabled={cercoMaps}
            title="Cerca su Google Maps chi non è ancora fra i nostri. Questa ricerca si paga: parte solo premendo qui."
          >
            {cercoMaps ? 'Cerco su Maps…' : 'Cerca anche su Google Maps'}
          </button>
        </div>
      ) : null}

      {chiestoMaps && !notaMaps ? (
        <p className="cella-sub">
          Sotto ai nostri ci sono anche i risultati di Google Maps, marcati:{' '}
          <strong>non ci abbiamo mai lavorato</strong>, e il loro IBAN va chiesto.
        </p>
      ) : null}
      {notaMaps ? <p className="cella-sub">{notaMaps}</p> : null}
    </div>
  )
}
