'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { azioneMassa, uniciInThread } from '@/lib/actions'
import { PrioritaButtons } from './PrioritaButtons'
import { RispostaAzioni } from './RispostaAzioni'
import { mostraFlash } from './Flash'

export type RigaContatto = {
  id: string
  /**
   * La mail era indirizzata AL contatto (non l'ha scritta lui).
   * ⚠️ Si decide dal mittente, non da `direzione`: quella dice in quale cartella
   * la mail è stata trovata, e una mail partita da un collega con la casella in
   * copia risulta «entrata» pur essendo stata mandata al contatto.
   */
  alContatto: boolean
  oggetto: string
  letto: boolean
  riassunto: string | null
  anteprima: string
  data: string // ISO: le date attraversano il confine server→client come stringa
  dataBreve: string
  sezione: { nome: string; colore: string } | null
  archiviato: boolean
  attivita: number
  bozze: number
  priorita: string | null
  prioritaDa: string | null
  analizzato: boolean
}

/**
 * L'elenco dei messaggi di un contatto con SELEZIONE MULTIPLA e azioni in
 * blocco. Chiesto il 17/08/2026: «permettimi di selezionare più mail e scegliere
 * diverse azioni tra cui: cestino, creare thread».
 *
 * ⚠️ Qui una riga è UNA mail (non un thread, come in posta): questa scheda le
 * mostra una per una, quindi le azioni agiscono sulle mail scelte e basta.
 * «Unisci in una conversazione» è l'eccezione: prende le selezionate e le fa
 * diventare un solo thread (`uniciInThread`).
 */
export function MessaggiContatto({ messaggi }: { messaggi: RigaContatto[] }) {
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [inCorso, start] = useTransition()
  const router = useRouter()

  // Se l'elenco cambia (ricarico dopo un'azione), la selezione si pota alle
  // mail ancora presenti (stessa cautela della posta in arrivo).
  useEffect(() => {
    setSel((s) => {
      if (s.size === 0) return s
      const vivi = new Set(messaggi.map((m) => m.id))
      const rimasti = [...s].filter((id) => vivi.has(id))
      return rimasti.length === s.size ? s : new Set(rimasti)
    })
  }, [messaggi])

  const toggle = (id: string, on: boolean) =>
    setSel((s) => {
      const n = new Set(s)
      if (on) n.add(id)
      else n.delete(id)
      return n
    })

  const tutte = messaggi.length > 0 && sel.size >= messaggi.length
  const selezionaTutte = () =>
    setSel((s) => (s.size >= messaggi.length ? new Set() : new Set(messaggi.map((m) => m.id))))

  const massa = (azione: 'cestina' | 'archivia' | 'letto') =>
    start(async () => {
      const ids = [...sel]
      if (ids.length === 0) return
      const r = await azioneMassa(ids, azione)
      mostraFlash(r.messaggio)
      setSel(new Set())
      router.refresh()
    })

  const unisci = () =>
    start(async () => {
      const ids = [...sel]
      if (ids.length < 2) return
      const r = await uniciInThread(ids)
      mostraFlash(r.messaggio)
      setSel(new Set())
      router.refresh()
    })

  return (
    <div className="card tight">
      {/* Barra di selezione: «Seleziona tutti» e, quando c'è una scelta, le
          azioni. «Unisci» compare solo con 2+ mail (una sola non è un thread). */}
      <div className="mail-select-bar">
        <label className="mail-select-all">
          <input type="checkbox" checked={tutte} onChange={selezionaTutte} aria-label="Seleziona tutti i messaggi" />
          <span>{sel.size > 0 ? `${sel.size} selezionate` : `Seleziona tutti (${messaggi.length})`}</span>
        </label>

        {sel.size > 0 && (
          <div className="mail-select-azioni">
            <button type="button" className="btn secondary small" disabled={inCorso} onClick={() => massa('cestina')}>
              Cestina
            </button>
            <button type="button" className="btn secondary small" disabled={inCorso} onClick={() => massa('archivia')}>
              Archivia
            </button>
            <button type="button" className="btn secondary small" disabled={inCorso} onClick={() => massa('letto')}>
              Segna lette
            </button>
            <button
              type="button"
              className="btn secondary small"
              disabled={inCorso || sel.size < 2}
              title={sel.size < 2 ? 'Servono almeno due mail' : 'Unisci le selezionate in una sola conversazione'}
              onClick={unisci}
            >
              ⛓ Unisci in una conversazione
            </button>
          </div>
        )}
      </div>

      <div className="mail-list">
        {messaggi.map((m) => (
          <div key={m.id} className={`mail-row ${m.letto ? '' : 'non-letto'} ${sel.has(m.id) ? 'selezionato' : ''}`}>
            <div className="mail-row-head">
              <label className="mail-check" title="Seleziona">
                <input
                  type="checkbox"
                  checked={sel.has(m.id)}
                  onChange={(e) => toggle(m.id, e.target.checked)}
                  aria-label={`Seleziona «${m.oggetto}»`}
                />
              </label>
              <Link href={`/messaggio/${m.id}`} className="mail-row-link">
                <div className="mail-top">
                  <span className={m.letto ? 'dot-spacer' : 'dot-unread'} />
                  {/* La freccia dice il verso: ↗ mandata a lui, ↙ scritta da
                      lui. Con un elenco a due versi, senza di essa due righe
                      uguali sono due cose opposte. */}
                  <span
                    className="muted"
                    style={{ fontSize: 12.5 }}
                    title={m.alContatto ? 'Mandata a questo contatto' : 'Scritta da questo contatto'}
                  >
                    {m.alContatto ? '↗' : '↙'}
                  </span>
                  <span className="mail-mittente">{m.oggetto}</span>
                </div>

                <div className="mail-riassunto" style={{ paddingLeft: 17 }}>
                  {m.riassunto ? (
                    <>
                      <span className="ai-mark">AI</span>
                      <span>{m.riassunto}</span>
                    </>
                  ) : (
                    <span className="muted">{m.anteprima}</span>
                  )}
                </div>

                {(m.sezione || m.archiviato || m.attivita > 0 || m.bozze > 0) && (
                  <div className="mail-tags" style={{ paddingLeft: 17 }}>
                    {m.sezione && (
                      <span className={`badge ${m.sezione.colore}`}>
                        <span className="dot" />
                        {m.sezione.nome}
                      </span>
                    )}
                    {m.archiviato && <span className="badge neutral">archiviato</span>}
                    {m.attivita > 0 && <span className="badge neutral">{m.attivita} attività</span>}
                    {m.bozze > 0 && <span className="badge gold">Bozza pronta</span>}
                  </div>
                )}
              </Link>

              <div className="mail-row-side">
                <span className="mail-data">{m.dataBreve}</span>
                <RispostaAzioni id={m.id} />
              </div>
            </div>

            <div style={{ paddingLeft: 17 }}>
              <PrioritaButtons id={m.id} priorita={m.priorita} prioritaDa={m.prioritaDa} analizzato={m.analizzato} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
