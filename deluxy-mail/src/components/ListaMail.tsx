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

  // ⚠️ La selezione NON deve sopravvivere al cambio di vista. I filtri sono
  // searchParams sulla stessa route (/?stato=archiviati, /?sezione=…): il
  // componente non si rimonta, quindi senza questo la barra diceva ancora «10
  // selezionate» dopo essere passati in Archivio, e «Cestina» agiva su 10 mail
  // non più a schermo. Si tiene solo ciò che è ancora fra le righe correnti.
  // (Revisione 14/08/2026.)
  useEffect(() => {
    setSelezione((s) => {
      if (s.size === 0) return s
      const vivi = new Set(righe.map((r) => r.id))
      const rimasti = [...s].filter((id) => vivi.has(id))
      return rimasti.length === s.size ? s : new Set(rimasti)
    })
  }, [righe])

  // Ordinando per DIMENSIONE serve il peso vero (allegati compresi), che sta
  // sul server: se qualche riga non ce l'ha, lo si chiede in sottofondo — una
  // sola volta, e solo quando quel dato serve davvero.
  const [pesiInCorso, setPesiInCorso] = useState(false)
  const chiestoPesi = useRef(false)
  useEffect(() => {
    if (ordine.campo !== 'dimensione' || chiestoPesi.current) return
    if (!righe.some((r) => !r.dimensione)) return
    chiestoPesi.current = true
    let vivo = true
    setPesiInCorso(true)
    ;(async () => {
      try {
        // Più giri: il server risponde a blocchi, ma sono solo numeri.
        for (let n = 0; n < 10; n++) {
          const res = await fetch('/api/dimensioni', { method: 'POST' })
          const dati = (await res.json()) as { ok?: boolean; finito?: boolean }
          if (!dati?.ok || dati.finito) break
        }
      } catch {
        /* niente: si ordina con quello che c'è */
      } finally {
        if (vivo) {
          setPesiInCorso(false)
          router.refresh()
        }
      }
    })()
    return () => {
      vivo = false
    }
  }, [ordine.campo, righe, router])

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

  // Le sole NON LETTE, in un colpo: è la selezione che si fa più spesso —
  // segnarle lette tutte, archiviarle, mandarle via. Ripremendo si torna a
  // zero, come fa «Seleziona tutti».
  const nonLette = righe.filter((r) => r.nonLetti)
  const soloNonLette = () =>
    setSelezione((s) => {
      const giaEsatte = nonLette.length > 0 && s.size === nonLette.length && nonLette.every((r) => s.has(r.id))
      return giaEsatte ? new Set() : new Set(nonLette.map((r) => r.id))
    })

  // Gli id di TUTTE le mail selezionate (le righe sono thread): serve sia alle
  // azioni in massa sia al trascinamento.
  const idsSelezionati = righe
    .filter((r) => selezione.has(r.id))
    .flatMap((r) => (r.ids?.length ? r.ids : [r.id]))

  const esegui = (azione: AzioneMassa, sezioneId?: string | null) => {
    if (selezione.size === 0) return
    // ⚠️ In elenco una riga È un thread: la selezione tiene l'id di TESTA, ma
    // l'azione deve toccare TUTTE le mail della conversazione — se no,
    // archiviando/cestinando, le altre restano e la riga ricompare col
    // messaggio precedente; segnando lette, il pallino resta acceso. Ogni riga
    // porta già i suoi `ids` (li usa «✓ Letto»): li si espande qui.
    const ids = righe.filter((r) => selezione.has(r.id)).flatMap((r) => (r.ids?.length ? r.ids : [r.id]))
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
      {pesiInCorso && (
        <div style={{ fontSize: 12.5, color: 'var(--text-tertiary)', padding: '0 12px 8px' }}>
          Chiedo al server la dimensione vera delle mail (allegati compresi)…
        </div>
      )}

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

        {/* La scorciatoia più usata: spuntare le sole da leggere per poi
            smaltirle in blocco. Compare solo se ce n'è davvero qualcuna. */}
        {nonLette.length > 0 && (
          <button
            type="button"
            className="azione-riga"
            onClick={soloNonLette}
            title="Spunta solo le conversazioni con mail da leggere"
          >
            Solo le non lette ({nonLette.length})
          </button>
        )}

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
          mostraPeso={ordine.campo === 'dimensione'}
          // Trascinando una riga SELEZIONATA si trascina tutta la selezione:
          // se no, con dieci mail spuntate, il trascinamento ne sposterebbe una
          // e sembrerebbe che la selezione non conti niente.
          idsDaTrascinare={selezione.has(r.id) ? idsSelezionati : undefined}
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
