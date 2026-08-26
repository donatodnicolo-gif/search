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
  const [annullate, setAnnullate] = useState(0)
  const [caricato, setCaricato] = useState(false)
  // ⚠️ «Tutte» è la vista di partenza (chiesto dall'utente): aprendo su «da
  // incassare» si vedeva una lista vuota nei giorni buoni — cioè quasi sempre —
  // e la sezione sembrava rotta invece che a posto.
  const [vista, setVista] = useState<'aperte' | 'tutte' | 'annullate'>('tutte')
  const [errore, setErrore] = useState('')

  const carica = useCallback(async () => {
    setCaricato(false)
    try {
      const res = await fetch(`/api/bozze${vista === 'annullate' ? '?annullate=1' : ''}`, {
        cache: 'no-store',
      })
      const d = (await res.json().catch(() => ({}))) as {
        bozze?: Bozza[]
        aperte?: number
        pagate?: number
        valoreInSospeso?: number
        annullate?: number
        nonChiesti?: string[]
      }
      setBozze(d.bozze ?? [])
      setAperte(d.aperte ?? 0)
      setPagate(d.pagate ?? 0)
      setSospeso(d.valoreInSospeso ?? 0)
      setAnnullate(d.annullate ?? 0)
      setNonChiesti(d.nonChiesti ?? [])
    } catch {
      setErrore('Stato delle bozze non caricato: problema di rete.')
    } finally {
      setCaricato(true)
    }
  }, [vista])

  useEffect(() => {
    void carica()
  }, [carica])

  const daMostrare = vista === 'aperte' ? bozze.filter((b) => b.stato !== 'pagata') : bozze

  // ⚠️⚠️ IN CIMA ALLA PAGINA, quindi COMPATTA. Questa sezione sta sopra il
  // modulo del nuovo ordine: ogni riga che si prende è una riga in meno di
  // quello per cui la pagina esiste. Quando non c'è niente da incassare resta
  // una riga sola, e la spiegazione lunga vive nel manuale — non qui, tutti i
  // giorni, davanti a chi sa già cos'è.
  const nienteInSospeso = caricato && daMostrare.length === 0

  return (
    <section className="card bozze-riquadro">
      <div className="testa-riquadro">
        <h2 style={{ margin: 0, fontSize: 16 }}>Bozze mandate</h2>
        <span className="cella-sub">
          {aperte} non pagate
          {sospeso > 0 ? ` · ${soldi(sospeso)} in sospeso` : ''} · {pagate} diventate ordini
          {/* ⚠️ Le annullate si CONTANO anche quando non si vedono: una fila che
              sparisce senza lasciare un numero fa credere che non sia mai
              esistita, e nessuno si accorge se il cron ne sta chiudendo troppe. */}
          {annullate > 0 ? ` · ${annullate} annullate` : ''}
        </span>
      </div>

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

      <div className="bozze-comandi">
        <button
          className={`btn ${vista === 'tutte' ? '' : 'btn-secondario'} small`}
          onClick={() => setVista('tutte')}
        >
          Tutte
        </button>
        <button
          className={`btn ${vista === 'aperte' ? '' : 'btn-secondario'} small`}
          onClick={() => setVista('aperte')}
        >
          Da incassare
        </button>
        {/* ⚠️ Le annullate hanno un filtro loro e non stanno in «Tutte»: sono
            chiuse, e rimetterle nel mucchio vorrebbe dire far ricontrollare ogni
            giorno una fila che cresce e non si smaltisce. Ma il filtro c'è —
            toglierle dalla vista non è cancellarle, e chi cerca «quel link di
            due settimane fa» deve poterlo ritrovare. */}
        {annullate > 0 ? (
          <button
            className={`btn ${vista === 'annullate' ? '' : 'btn-secondario'} small`}
            onClick={() => setVista('annullate')}
          >
            Annullate ({annullate})
          </button>
        ) : null}
        <button className="btn btn-secondario small" onClick={() => void carica()}>
          Richiedi lo stato
        </button>
      </div>

      {!caricato ? (
        <p className="colonna-vuota">Chiedo a Shopify…</p>
      ) : nienteInSospeso ? (
        <p className="cella-sub" style={{ margin: 0 }}>
          {vista === 'aperte'
            ? 'Nessuna bozza in sospeso: tutti i link mandati sono stati pagati o chiusi.'
            : vista === 'annullate'
              ? 'Nessuna bozza annullata negli ultimi 60 giorni.'
              : 'Nessuna bozza mandata negli ultimi 60 giorni.'}
        </p>
      ) : (
        // ⚠️ Un tetto d'altezza, non l'elenco intero: venti bozze in sospeso
        // spingerebbero il modulo del nuovo ordine fuori dallo schermo — cioè il
        // problema che si voleva risolvere, spostato di un posto.
        <div className="bozze-elenco">
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
