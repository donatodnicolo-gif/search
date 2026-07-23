'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { dataBreve } from '@/lib/format'
import { cestinaMessaggio, spostaInSezione, azioneMassa } from '@/lib/actions'
import { AgganciaBottone, AgganciaDialog } from './AgganciaRiga'

export type RigaInviata = {
  /** Il "volto" della riga: la mail più recente della conversazione. */
  id: string
  /** TUTTE le mie mail della conversazione: le azioni agiscono su queste, se no
   *  cestinandone una la riga ricomparirebbe con la precedente. */
  ids: string[]
  /** Quante mie mail ci sono in questa conversazione (1 = mail singola). */
  nel: number
  /** Il nome dato a mano alla conversazione (null se non ne ha). */
  nomeThread?: string | null
  destinatari: string
  oggetto: string
  anteprima: string
  data: Date
  sezione: { nome: string; colore: string } | null
  sezioneId: string | null
}

/**
 * La lista della Posta inviata con: selezione multipla ("Seleziona tutti") e
 * azioni sulle MIE mail — Cestina e Sposta in sezione (singole e in blocco).
 */
export function ListaInviati({
  righe,
  sezioni = [],
}: {
  righe: RigaInviata[]
  sezioni?: { id: string; nome: string }[]
}) {
  const [selezione, setSelezione] = useState<Set<string>>(new Set())
  const [nascosti, setNascosti] = useState<Set<string>>(new Set())
  const [inCorso, start] = useTransition()
  const router = useRouter()
  const spuntaTutti = useRef<HTMLInputElement>(null)

  const visibili = righe.filter((r) => !nascosti.has(r.id))

  const toggle = useCallback((id: string, valore: boolean) => {
    setSelezione((s) => {
      const n = new Set(s)
      if (valore) n.add(id)
      else n.delete(id)
      return n
    })
  }, [])

  const tutte = visibili.length > 0 && visibili.every((r) => selezione.has(r.id))
  const alcune = selezione.size > 0 && !tutte
  useEffect(() => {
    if (spuntaTutti.current) spuntaTutti.current.indeterminate = alcune
  }, [alcune])

  const selezionaTutte = () =>
    setSelezione((s) => (visibili.every((r) => s.has(r.id)) ? new Set() : new Set(visibili.map((r) => r.id))))
  const azzera = () => setSelezione(new Set())

  const massa = (azione: 'cestina' | 'sposta', sezioneId?: string | null) => {
    // La selezione tiene gli id delle RIGHE (il volto della conversazione):
    // l'azione va invece su tutte le mail dei gruppi selezionati.
    const ids = visibili.filter((r) => selezione.has(r.id)).flatMap((r) => r.ids)
    if (ids.length === 0) return
    start(async () => {
      await azioneMassa(ids, azione, sezioneId)
      setSelezione(new Set())
      router.refresh()
    })
  }

  const singola = (id: string, azione: () => Promise<unknown>, esce = false) => {
    if (esce) setNascosti((s) => new Set(s).add(id))
    start(async () => {
      await azione()
      router.refresh()
    })
  }

  return (
    <>
    <div className="mail-list">
      <div className="mail-select-bar">
        <label className="mail-select-all">
          <input
            ref={spuntaTutti}
            type="checkbox"
            checked={tutte}
            onChange={selezionaTutte}
            aria-label="Seleziona tutti gli inviati"
          />
          <span>{selezione.size > 0 ? `${selezione.size} selezionate` : `Seleziona tutti (${visibili.length})`}</span>
        </label>

        {selezione.size > 0 && (
          <div className="mail-select-azioni">
            <button type="button" className="btn secondary small" disabled={inCorso} onClick={() => massa('cestina')}>
              Cestina
            </button>
            {sezioni.length > 0 && (
              <select
                className="mail-select-sposta"
                value=""
                disabled={inCorso}
                onChange={(e) => {
                  const v = e.target.value
                  if (v) massa('sposta', v === '__null__' ? null : v)
                }}
                aria-label="Sposta gli inviati selezionati in una sezione"
              >
                <option value="" disabled>
                  Sposta in…
                </option>
                {sezioni.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
                <option value="__null__">Nessuna sezione</option>
              </select>
            )}
            <button type="button" className="btn secondary small" disabled={inCorso} onClick={azzera}>
              Annulla
            </button>
          </div>
        )}
      </div>

      {visibili.map((m) => (
        <div key={m.id} className={`mail-row ${selezione.has(m.id) ? 'selezionato' : ''}`}>
          <div className="mail-row-head">
            <label className="mail-check" title="Seleziona" onClick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                checked={selezione.has(m.id)}
                onChange={(e) => toggle(m.id, e.target.checked)}
                aria-label="Seleziona questa mail"
              />
            </label>
            <Link href={`/messaggio/${m.id}`} className="mail-row-link">
              <div className="mail-top">
                <span className="dot-spacer" />
                <span className="mail-mittente">a {m.destinatari}</span>
                {m.nel > 1 && (
                  <span
                    className="thread-count"
                    title={`${m.nel} tue mail in questa conversazione`}
                  >
                    {m.nel}
                  </span>
                )}
                {m.nomeThread && (
                  <span className="badge gold" title="Nome dato alla conversazione">
                    <span className="dot" />
                    {m.nomeThread}
                  </span>
                )}
                {m.sezione && (
                  <span className={`badge ${m.sezione.colore}`}>
                    <span className="dot" />
                    {m.sezione.nome}
                  </span>
                )}
              </div>
              <div className="mail-oggetto" style={{ paddingLeft: 17 }}>
                {m.oggetto}
              </div>
              <div className="mail-riassunto" style={{ paddingLeft: 17 }}>
                <span className="muted">{m.anteprima}</span>
              </div>
            </Link>
            <div className="mail-row-side">
              <span className="mail-data">{dataBreve(m.data)}</span>
            </div>
          </div>

          <div style={{ paddingLeft: 17 }}>
            <div className="riga-azioni">
              <button
                type="button"
                className="azione-riga"
                disabled={inCorso}
                title={m.nel > 1 ? `Cestina tutte le ${m.nel} mail della conversazione` : 'Sposta nel cestino di AI Mail'}
                // Su una conversazione si cestina l'intero gruppo: cestinando
                // solo il volto, la riga tornerebbe con la mail precedente.
                onClick={() =>
                  singola(m.id, () => (m.nel > 1 ? azioneMassa(m.ids, 'cestina') : cestinaMessaggio(m.id)), true)
                }
              >
                Cestina
              </button>
              {/* Associa questa mail inviata a un thread esistente. */}
              <AgganciaBottone id={m.id} />
              {sezioni.length > 0 && (
                <select
                  className="mail-select-sposta"
                  value={m.sezioneId ?? ''}
                  disabled={inCorso}
                  onChange={(e) =>
                    singola(m.id, () =>
                      m.nel > 1
                        ? azioneMassa(m.ids, 'sposta', e.target.value || null)
                        : spostaInSezione(m.id, e.target.value || null)
                    )
                  }
                  aria-label={m.nel > 1 ? 'Sposta la conversazione in una sezione' : 'Sposta questa mail in una sezione'}
                >
                  <option value="">Sposta in…</option>
                  {sezioni.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nome}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
    {/* Il dialogo di aggancio, montato una volta per la lista. */}
    <AgganciaDialog />
    </>
  )
}
