'use client'

import { useEffect, useState } from 'react'

// QUANTO VALEVA L'ORDINE, E QUANTO CI È RIMASTO — sulla scheda del reclamo.
//
// ⚠️⚠️ È la cifra che manca quando si decide un rimborso. Rimborsare 250 € su un
// ordine che ce ne ha lasciati 40 non è la stessa decisione che rimborsarli su
// uno che ne ha lasciati 120 — e finora chi decideva quel numero non aveva
// davanti né l'uno né l'altro.
//
// ⚠️ Il margine arriva da **Deluxy Orders**, che è l'unico posto dove si
// calcola (Standard §7.4) ed è al NETTO IVA. Qui non si rifà: «totale − costo»
// darebbe un numero più alto e altrettanto credibile, e le due schermate
// direbbero due cifre diverse sulla stessa cosa senza che nessuna dia errore.

type Soldi = {
  totale: number
  costo: number | null
  margine: number | null
  fornitore: string
  costoDa: string
}

const euro = (n: number) =>
  n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })

export function SoldiReclamo({ reclamoId }: { reclamoId: string }) {
  const [soldi, setSoldi] = useState<Soldi | null>(null)
  const [nota, setNota] = useState('')
  const [caricato, setCaricato] = useState(false)

  useEffect(() => {
    let vivo = true
    setCaricato(false)
    fetch(`/api/reclami/${reclamoId}/soldi`)
      .then((r) => r.json())
      .then((d: { soldi: Soldi | null; nota?: string }) => {
        if (!vivo) return
        setSoldi(d.soldi)
        setNota(d.nota ?? '')
      })
      .catch(() => {
        if (vivo) setNota('Non sono riuscito a leggere i soldi di quest’ordine.')
      })
      .finally(() => {
        if (vivo) setCaricato(true)
      })
    return () => {
      vivo = false
    }
  }, [reclamoId])

  if (!caricato) return <p className="cella-sub">Leggo i numeri dell’ordine…</p>
  if (!soldi && !nota) return null

  return (
    <div className="card" style={{ padding: 12, marginTop: 16 }}>
      <div className="cella-nome" style={{ marginBottom: 6 }}>
        Quest’ordine, in soldi
      </div>
      {soldi ? (
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'baseline' }}>
          <span>
            <span className="cella-sub">Valore dell’ordine </span>
            <strong>{euro(soldi.totale)}</strong>
          </span>
          <span>
            <span className="cella-sub">Al fornitore </span>
            {/* ⚠️ «non lo sappiamo» ≠ «zero»: un ordine senza costo scritto non
                è un ordine gratis, ed è la differenza fra un margine vero e uno
                inventato. */}
            <strong>{soldi.costo === null ? 'non indicato' : euro(soldi.costo)}</strong>
            {soldi.fornitore ? <span className="cella-sub"> · {soldi.fornitore}</span> : null}
          </span>
          <span>
            <span className="cella-sub">Ci è rimasto </span>
            <strong
              style={{
                color:
                  soldi.margine === null
                    ? 'var(--text-tertiary)'
                    : soldi.margine > 0
                      ? 'var(--green)'
                      : 'var(--red)',
              }}
            >
              {soldi.margine === null ? 'non calcolabile' : euro(soldi.margine)}
            </strong>
            {soldi.margine !== null && soldi.totale > 0 ? (
              /* ⚠️ La base della percentuale è il TOTALE PAGATO DAL CLIENTE, come
                 in Deluxy Orders: «di ogni 100 € incassati me ne restano 32,80,
                 IVA e fornitore pagati». Usare l'imponibile darebbe un numero
                 più bello e diverso da quello che si legge di là. */
              <span className="cella-sub">
                {' '}
                ({(((soldi.margine / soldi.totale) * 100).toFixed(1)).replace('.', ',')}% del totale
                pagato dal cliente)
              </span>
            ) : null}
          </span>
        </div>
      ) : null}
      {/* ⚠️ Perché il margine non c'è si DICE. Un trattino muto accanto a una
          decisione sui soldi fa credere a un guadagno di zero. */}
      {soldi && soldi.margine === null ? (
        <p className="cella-sub" style={{ marginTop: 6 }}>
          Il margine non si può calcolare finché non risulta quanto è stato pagato al fornitore.
        </p>
      ) : null}
      {nota ? (
        <p className="cella-sub" style={{ marginTop: 6 }}>
          {nota}
        </p>
      ) : null}
      {soldi?.margine !== null && soldi ? (
        <p className="cella-sub" style={{ marginTop: 6 }}>
          Il margine lo calcola Deluxy Orders ed è al <strong>netto IVA</strong>: qui si legge, non
          si rifà. ⚠️ Per questo la quota del fornitore e il margine non fanno 100 fra loro — il
          costo è lordo su lordo, il margine netto su lordo.
        </p>
      ) : null}
    </div>
  )
}
