'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// L'ordine a cui una richiesta di pagamento si riferisce.
//
// ⚠️⚠️ Il campo `ordineNumero` esisteva già in tabella ed era **sempre vuoto**:
// la pagina non lo mandava mai. Quindi una richiesta salvata non si sapeva a
// quale ordine appartenesse — restava solo la causale scritta a mano («ordine
// 2785»), che non è un collegamento: non si può contare, non si può risalire al
// cliente, e non si sa quanto valeva quell'ordine. Da cui: niente margine.

export type OrdineTrovato = {
  id: string
  numero: string
  negozioNome: string
  clienteNome: string
  totale: number
  valuta: string
  data: string
  fornitoreNome: string
  fornitoreCosto: number | null
  /**
   * Viene dall'ARCHIVIO di Orders, non dalla nostra copia di 60 giorni.
   * ⚠️ Si dice, perché di un ordine d'archivio non sappiamo chi lo prepara né
   * come lo stiamo lavorando: quei dati sono nostri e valgono solo su ciò che è
   * passato di qui.
   */
  daArchivio?: boolean
}

export function ScegliOrdine({
  numero,
  onScelto,
  onTolto,
  cercaDa,
}: {
  /** Il numero già collegato, se c'è. */
  numero: string
  onScelto: (o: OrdineTrovato) => void
  onTolto: () => void
  /**
   * Un numero da cui partire — per esempio quello che si legge nella causale.
   * ⚠️ Si CERCA da solo, ma non si collega da solo: vedi sotto.
   */
  cercaDa?: string
}) {
  const [q, setQ] = useState('')
  const [trovati, setTrovati] = useState<OrdineTrovato[]>([])
  const [scelto, setScelto] = useState<OrdineTrovato | null>(null)
  const [cerco, setCerco] = useState(false)
  const [fatto, setFatto] = useState(false)
  const [nota, setNota] = useState('')
  const ultima = useRef('')
  const giaProvato = useRef('')

  const cerca = useCallback(async (testo: string): Promise<OrdineTrovato[]> => {
    const t = testo.replace(/\D/g, '')
    ultima.current = t
    if (t.length < 2) {
      setTrovati([])
      setFatto(false)
      return []
    }
    setCerco(true)
    try {
      const res = await fetch(`/api/ordini/per-numero?q=${encodeURIComponent(t)}`)
      if (!res.ok) return []
      const d = (await res.json()) as { ordini: OrdineTrovato[]; nota?: string }
      setNota(d.nota ?? '')
      if (ultima.current !== t) return []
      setTrovati(d.ordini)
      setFatto(true)
      return d.ordini
    } catch {
      return []
    } finally {
      setCerco(false)
    }
  }, [])

  // ── Il numero letto nella causale ──
  //
  // ⚠️⚠️ Si cerca da soli, ma si collega da soli **solo se il risultato è uno**.
  // Lo stesso numero esiste su più negozi («#1733» è sia di Cake sia di
  // Deluxy): sceglierne uno a caso vorrebbe dire mostrare il margine calcolato
  // sul valore di un altro ordine, e mostrarlo come se fosse quello giusto.
  useEffect(() => {
    const n = (cercaDa ?? '').replace(/\D/g, '')
    if (!n || n.length < 3 || numero || giaProvato.current === n) return
    giaProvato.current = n
    void cerca(n).then((o) => {
      if (o.length === 1) {
        setScelto(o[0])
        onScelto(o[0])
      }
    })
  }, [cercaDa, numero, cerca, onScelto])

  if (numero && scelto) {
    return (
      <div className="ordine-collegato">
        <span className="badge">{scelto.numero}</span>
        {scelto.daArchivio ? <span className="cella-sub">archivio</span> : null}
        <span className="cella-sub">
          {[
            scelto.negozioNome,
            scelto.clienteNome,
            scelto.totale
              ? scelto.totale.toLocaleString('it-IT', {
                  style: 'currency',
                  currency: scelto.valuta || 'EUR',
                })
              : '',
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
        <button
          type="button"
          className="btn btn-secondario small"
          onClick={() => {
            setScelto(null)
            setTrovati([])
            setFatto(false)
            giaProvato.current = 'gia'
            onTolto()
          }}
        >
          Cambia
        </button>
      </div>
    )
  }

  return (
    <div className="scegli-ordine">
      <label className="campo">
        <span>Ordine</span>
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            void cerca(e.target.value)
          }}
          placeholder="2785"
          inputMode="numeric"
          aria-label="Numero dell’ordine da collegare"
        />
      </label>
      {cerco ? <p className="cella-sub">Cerco…</p> : null}
      {fatto && !cerco && trovati.length === 0 ? (
        <p className="cella-sub">
          Nessun ordine con questo numero, né fra i recenti né nell&apos;archivio Ordini.
        </p>
      ) : null}
      {nota ? <p className="cella-sub">{nota}</p> : null}
      {trovati.length > 1 ? (
        // ⚠️ Si dice PERCHÉ ce n'è più d'uno: senza, sembra che l'app non sappia
        // decidere, mentre il fatto è che quel numero appartiene a due ordini
        // diversi e sbagliare vuol dire pagare sul valore di un altro.
        <p className="cella-sub">
          Questo numero esiste su più negozi: scegli tu quale, o il margine verrebbe calcolato
          sull&apos;ordine sbagliato.
        </p>
      ) : null}
      {trovati.length > 0 ? (
        <ul className="elenco-ordini-trovati">
          {trovati.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                className="riga-ordine-trovato"
                onClick={() => {
                  setScelto(o)
                  onScelto(o)
                }}
              >
                <span className="titolo">
                  {o.numero} · {o.negozioNome}
                  {/* ⚠️ Un ordine d'archivio si distingue: puo' essere di anni
                      fa, e senza dirlo si collega un pagamento all'ordine
                      sbagliato con lo stesso numero. */}
                  {o.daArchivio ? <span className="cella-sub"> · archivio</span> : null}
                </span>
                <span className="cella-sub">
                  {[
                    o.clienteNome,
                    o.totale
                      ? o.totale.toLocaleString('it-IT', {
                          style: 'currency',
                          currency: o.valuta || 'EUR',
                        })
                      : '',
                    new Date(o.data).toLocaleDateString('it-IT'),
                    o.fornitoreNome ? `lo prepara ${o.fornitoreNome}` : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
