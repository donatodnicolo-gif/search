'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RigaMail, type RigaData } from './RigaMail'
import { BarraOrdinamento, confrontaRighe, type Ordine } from './Ordinamento'
import { CercaVecchie } from './CercaVecchie'
import { azioneMassa, type AzioneMassa } from '@/lib/actions'

const PASSO = 50

/**
 * La lista della posta con:
 *  - caricamento progressivo a prova di blocco (osservatore + fallback scroll);
 *  - selezione multipla con «Seleziona tutti» e azioni in blocco (archivia,
 *    cestina, sposta in sezione, segna letta/non letta).
 */
export function ListaMail({
  righe,
  sezioni = [],
  cercaVecchie = false,
}: {
  righe: RigaData[]
  sezioni?: { id: string; nome: string }[]
  /** La casella ha ancora storico non scaricato: in fondo alla lista si va a
   *  prendere on-demand un blocco di mail più vecchie dal server. */
  cercaVecchie?: boolean
}) {
  const [mostrate, setMostrate] = useState(PASSO)
  const [selezione, setSelezione] = useState<Set<string>>(new Set())
  const [ordine, setOrdine] = useState<Ordine>({ campo: 'data', discendente: true })
  const [inCorso, start] = useTransition()
  const router = useRouter()
  const sentinella = useRef<HTMLDivElement>(null)
  const spuntaTutti = useRef<HTMLInputElement>(null)

  // Ordinamento lato client sulle righe già caricate: istantaneo, nessun giro
  // al server. Il volto della riga (mittente/oggetto/data/dimensione) decide.
  const righeOrdinate = useMemo(
    () =>
      [...righe].sort((a, b) =>
        confrontaRighe(a, b, ordine, (r) => r.mittenteNome || r.mittente || '')
      ),
    [righe, ordine]
  )

  const visibili = righeOrdinate.slice(0, mostrate)
  const restano = righe.length - visibili.length

  const carica = useCallback(
    () => setMostrate((n) => Math.min(n + PASSO, righe.length)),
    [righe.length]
  )

  useEffect(() => {
    if (restano <= 0) return
    const el = sentinella.current
    if (!el) return

    const vicino = () => {
      const finestra = window.innerHeight || document.documentElement.clientHeight
      return el.getBoundingClientRect().top <= finestra + 600
    }
    // Throttle con requestAnimationFrame: lo scroll spara decine di eventi al
    // secondo e misurare il layout (getBoundingClientRect) a ognuno costa CPU.
    let inCoda = false
    const forse = () => {
      if (inCoda) return
      inCoda = true
      requestAnimationFrame(() => {
        inCoda = false
        if (vicino()) carica()
      })
    }

    const obs = new IntersectionObserver(
      (voci) => {
        if (voci.some((v) => v.isIntersecting)) carica()
      },
      { rootMargin: '600px' }
    )
    obs.observe(el)
    window.addEventListener('scroll', forse, { passive: true })
    window.addEventListener('resize', forse)
    forse()

    return () => {
      obs.disconnect()
      window.removeEventListener('scroll', forse)
      window.removeEventListener('resize', forse)
    }
  }, [restano, carica])

  // ---- Selezione multipla ----
  const toggle = useCallback((id: string, valore: boolean) => {
    setSelezione((s) => {
      const n = new Set(s)
      if (valore) n.add(id)
      else n.delete(id)
      return n
    })
  }, [])

  const tutte = righe.length > 0 && selezione.size >= righe.length
  const alcune = selezione.size > 0 && !tutte

  // La casella "seleziona tutti" mostra lo stato "parziale" (trattino) quando
  // solo alcune sono spuntate.
  useEffect(() => {
    if (spuntaTutti.current) spuntaTutti.current.indeterminate = alcune
  }, [alcune])

  const selezionaTutte = () =>
    setSelezione((s) => (s.size >= righe.length ? new Set() : new Set(righe.map((r) => r.id))))
  const azzera = () => setSelezione(new Set())

  const esegui = (azione: AzioneMassa, sezioneId?: string | null) => {
    const ids = [...selezione]
    if (ids.length === 0) return
    start(async () => {
      await azioneMassa(ids, azione, sezioneId)
      setSelezione(new Set())
      router.refresh()
    })
  }

  return (
    <div className="mail-list">
      <BarraOrdinamento valore={ordine} onCambia={setOrdine} />

      <div className="mail-select-bar">
        <label className="mail-select-all">
          <input
            ref={spuntaTutti}
            type="checkbox"
            checked={tutte}
            onChange={selezionaTutte}
            aria-label="Seleziona tutte le mail"
          />
          <span>
            {selezione.size > 0 ? `${selezione.size} selezionate` : `Seleziona tutti (${righe.length})`}
          </span>
        </label>

        {selezione.size > 0 && (
          <div className="mail-select-azioni">
            <button type="button" className="btn secondary small" disabled={inCorso} onClick={() => esegui('archivia')}>
              Archivia
            </button>
            <button type="button" className="btn secondary small" disabled={inCorso} onClick={() => esegui('cestina')}>
              Cestina
            </button>
            {sezioni.length > 0 && (
              <select
                className="mail-select-sposta"
                value=""
                disabled={inCorso}
                onChange={(e) => {
                  const v = e.target.value
                  if (v) esegui('sposta', v === '__null__' ? null : v)
                }}
                aria-label="Sposta le mail selezionate in una sezione"
              >
                <option value="" disabled>
                  Sposta in…
                </option>
                {sezioni.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
                <option value="__null__">Nessuna sezione (da smistare)</option>
              </select>
            )}
            <button type="button" className="btn secondary small" disabled={inCorso} title="Segna come letta" onClick={() => esegui('letto')}>
              Letta
            </button>
            <button type="button" className="btn secondary small" disabled={inCorso} title="Segna come non letta" onClick={() => esegui('nonletto')}>
              Non letta
            </button>
            <button type="button" className="btn secondary small" disabled={inCorso} onClick={azzera}>
              Annulla
            </button>
          </div>
        )}
      </div>

      {visibili.map((r) => (
        <RigaMail
          key={r.id}
          r={r}
          sezioni={sezioni}
          selezionato={selezione.has(r.id)}
          onSelezione={toggle}
        />
      ))}

      {restano > 0 && (
        <div ref={sentinella} className="mail-carica">
          <button type="button" className="btn secondary small" onClick={carica}>
            Carica altre {Math.min(PASSO, restano)} · ne restano {restano}
          </button>
        </div>
      )}

      {/* Finite le righe locali: se sul server c'è storico non ancora scaricato,
          lo si va a prendere on-demand (scroll o click), un blocco per volta. */}
      {restano <= 0 && cercaVecchie && <CercaVecchie />}
    </div>
  )
}
