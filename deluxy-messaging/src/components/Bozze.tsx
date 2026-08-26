'use client'

import { useCallback, useEffect, useState } from 'react'

// LE BOZZE MANDATE, e com'è finita.
//
// Un link di pagamento mandato e mai pagato non fa rumore: il cliente non
// scrive «non ho pagato», semplicemente non paga. Finché lo stato stava solo su
// Shopify — negozio per negozio, da cercare a mano — nessuno lo guardava.
//
// ⚠️⚠️ Lo stato si CHIEDE a Shopify a ogni apertura: è suo, non nostro. Qui non
// c'è una copia da fidarsi.

type Bozza = {
  id: string
  bozzaNome: string
  negozioNome: string
  clienteNome: string
  clienteEmail: string
  importo: number
  valuta: string
  utenteNome: string
  creatoIl: string
  invitoInviato: boolean
  stato: 'pagata' | 'aperta' | 'invito_inviato' | 'sparita' | 'non_chiesto'
  ordineNumero: string
  link: string
  giorni: number
}

function soldi(v: number, valuta = 'EUR'): string {
  return v.toLocaleString('it-IT', { style: 'currency', currency: valuta || 'EUR' })
}

function dataBreve(iso: string): string {
  return new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
}

/**
 * Com'è finita, detto in una pillola.
 *
 * ⚠️ «non chiesto» e «sparita» NON sono «non pagata»: la prima vuol dire che
 * Shopify non ha risposto, la seconda che la bozza non c'è più (cancellata a
 * mano). Appiattirle su «aperta» vorrebbe dire dichiarare non pagata una bozza
 * che magari è stata incassata.
 */
function Stato({ b }: { b: Bozza }) {
  if (b.stato === 'pagata') {
    return (
      <span className="badge verde" title="La bozza è stata pagata ed è diventata un ordine">
        Pagata{b.ordineNumero ? ` · ordine ${b.ordineNumero}` : ''}
      </span>
    )
  }
  if (b.stato === 'sparita') {
    return (
      <span className="badge" title="Su Shopify questa bozza non c'è più: è stata cancellata">
        Non c&apos;è più su Shopify
      </span>
    )
  }
  if (b.stato === 'non_chiesto') {
    return (
      <span className="badge" title="Shopify non ha risposto per questo negozio: lo stato non si sa">
        Stato non disponibile
      </span>
    )
  }
  return (
    <span
      className={`badge${b.giorni >= 7 ? ' rosso' : ''}`}
      title={
        b.stato === 'invito_inviato'
          ? 'Shopify ha mandato l’invito al cliente, che non ha ancora pagato'
          : 'La bozza è aperta: il cliente non ha ancora pagato'
      }
    >
      Non pagata{b.giorni ? ` · da ${b.giorni} g` : ''}
    </span>
  )
}

export function Bozze() {
  const [bozze, setBozze] = useState<Bozza[]>([])
  const [aperte, setAperte] = useState(0)
  const [pagate, setPagate] = useState(0)
  const [sospeso, setSospeso] = useState(0)
  const [nonChiesti, setNonChiesti] = useState<string[]>([])
  const [caricato, setCaricato] = useState(false)
  const [soloAperte, setSoloAperte] = useState(true)
  const [errore, setErrore] = useState('')

  const carica = useCallback(async () => {
    setCaricato(false)
    try {
      const res = await fetch('/api/bozze', { cache: 'no-store' })
      const d = (await res.json().catch(() => ({}))) as {
        bozze?: Bozza[]
        aperte?: number
        pagate?: number
        valoreInSospeso?: number
        nonChiesti?: string[]
      }
      setBozze(d.bozze ?? [])
      setAperte(d.aperte ?? 0)
      setPagate(d.pagate ?? 0)
      setSospeso(d.valoreInSospeso ?? 0)
      setNonChiesti(d.nonChiesti ?? [])
    } catch {
      setErrore('Stato delle bozze non caricato: problema di rete.')
    } finally {
      setCaricato(true)
    }
  }, [])

  useEffect(() => {
    void carica()
  }, [carica])

  const daMostrare = soloAperte
    ? bozze.filter((b) => b.stato !== 'pagata')
    : bozze

  return (
    <section className="card" style={{ marginTop: 18 }}>
      <div className="testa-riquadro">
        <h2 style={{ margin: 0, fontSize: 16 }}>Bozze mandate</h2>
        <span className="cella-sub">
          {aperte} non pagate · {pagate} diventate ordini
        </span>
      </div>
      <p className="cella-sub" style={{ marginTop: 2 }}>
        I link di pagamento creati da qui negli ultimi 60 giorni. Lo stato lo dice{' '}
        <strong>Shopify</strong>, chiesto adesso: quando la bozza viene pagata diventa un ordine e
        qui compare il suo numero.
      </p>

      {errore ? <div className="avviso-errore">{errore}</div> : null}

      {/* ⚠️ Se per un negozio Shopify non ha risposto si DICE: senza, quelle
          bozze sembrerebbero semplicemente non pagate — e una bozza incassata
          data per non pagata è il modo di richiamare un cliente che ha già
          pagato. */}
      {nonChiesti.length ? (
        <div className="avviso-errore">
          Shopify non ha risposto per: {nonChiesti.join(', ')}. Per quelle bozze lo stato non si sa.
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 8, margin: '10px 0', flexWrap: 'wrap' }}>
        <button
          className={`btn ${soloAperte ? '' : 'btn-secondario'} small`}
          onClick={() => setSoloAperte(true)}
        >
          Da incassare
        </button>
        <button
          className={`btn ${soloAperte ? 'btn-secondario' : ''} small`}
          onClick={() => setSoloAperte(false)}
        >
          Tutte
        </button>
        <button className="btn btn-secondario small" onClick={() => void carica()}>
          Richiedi lo stato
        </button>
        {sospeso > 0 ? (
          <span className="cella-sub" style={{ alignSelf: 'center' }}>
            {soldi(sospeso)} in sospeso
          </span>
        ) : null}
      </div>

      {!caricato ? (
        <p className="colonna-vuota">Chiedo a Shopify…</p>
      ) : daMostrare.length === 0 ? (
        <p className="colonna-vuota">
          {soloAperte ? 'Nessuna bozza in sospeso.' : 'Nessuna bozza negli ultimi 60 giorni.'}
        </p>
      ) : (
        <div>
          {daMostrare.map((b) => (
            <div className="chiamata" key={b.id}>
              <div className="chiamata-numero">
                {b.bozzaNome || 'bozza'} · {soldi(b.importo, b.valuta)}
              </div>
              <div className="chiamata-quando">
                <span>{dataBreve(b.creatoIl)}</span>
                <span className="chiamata-marchio">{b.negozioNome}</span>
              </div>
              <div className="chiamata-chi">
                <Stato b={b} />
                <div className="cella-sub" style={{ marginTop: 4 }}>
                  {b.clienteNome || b.clienteEmail || 'senza nome'}
                  {b.utenteNome ? ` · l'ha fatta ${b.utenteNome}` : ''}
                  {b.invitoInviato ? ' · invito mandato da Shopify' : ''}
                </div>
              </div>
              <div className="chiamata-azioni">
                {b.link ? (
                  <>
                    <button
                      className="btn btn-secondario small"
                      onClick={() => void navigator.clipboard?.writeText(b.link)}
                    >
                      Copia il link
                    </button>
                    <a
                      className="btn btn-secondario small"
                      href={b.link}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Apri
                    </a>
                  </>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
