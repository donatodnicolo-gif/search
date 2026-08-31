'use client'

import { useCallback, useEffect, useState } from 'react'

// LA FATTURA CHIESTA DAL CLIENTE, sulla scheda dell'ordine.
//
// ⚠️⚠️ Qui non si emette niente: la fattura elettronica esce da FINANCE/Fatture
// in Cloud, prende un numero nella numerazione dell'anno e parte verso lo SDI —
// e non si annulla con un clic, si annulla con una nota di credito. Questo
// riquadro raccoglie la RICHIESTA e i dati fiscali, che oggi non stanno da
// nessuna parte, e dice a chi la emette che cosa manca.

type Fattura = {
  id: string
  ordineNumero: string
  tipo: string
  intestazione: string
  partitaIva: string
  codiceFiscale: string
  codiceSdi: string
  pec: string
  email: string
  indirizzo: string
  cap: string
  citta: string
  provincia: string
  paese: string
  note: string
  stato: string
  numeroFattura: string
  emessaIl: string | null
  emessaDaNome: string
  chiestaDaNome: string
  creatoIl: string
  mancano: string[]
}

const VUOTA = {
  tipo: 'privato',
  intestazione: '',
  partitaIva: '',
  codiceFiscale: '',
  codiceSdi: '',
  pec: '',
  email: '',
  indirizzo: '',
  cap: '',
  citta: '',
  provincia: '',
  paese: 'IT',
  note: '',
}

function nomeStato(s: string): string {
  if (s === 'emessa') return 'Emessa'
  if (s === 'non_dovuta') return 'Non dovuta'
  return 'Da emettere'
}

export function RichiediFattura({
  ordineId,
  clienteNome,
  email,
}: {
  ordineId: string
  clienteNome?: string
  email?: string
}) {
  const [fattura, setFattura] = useState<Fattura | null>(null)
  const [aperto, setAperto] = useState(false)
  const [campi, setCampi] = useState({ ...VUOTA })
  const [numero, setNumero] = useState('')
  const [errore, setErrore] = useState('')
  const [salvando, setSalvando] = useState(false)

  const carica = useCallback(async () => {
    try {
      const res = await fetch(`/api/ordini/${ordineId}/fattura`, { cache: 'no-store' })
      const d = (await res.json().catch(() => ({}))) as { fattura?: Fattura | null }
      setFattura(d.fattura ?? null)
      if (d.fattura) {
        setCampi({ ...VUOTA, ...d.fattura })
        setNumero(d.fattura.numeroFattura ?? '')
      }
    } catch {
      /* la scheda si apre lo stesso: il riquadro dirà solo «richiedi» */
    }
  }, [ordineId])

  useEffect(() => {
    void carica()
  }, [carica])

  async function salva() {
    setSalvando(true)
    setErrore('')
    try {
      const res = await fetch(`/api/ordini/${ordineId}/fattura`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ azione: 'salva', ...campi }),
      })
      const d = (await res.json().catch(() => ({}))) as { errore?: string; fattura?: Fattura }
      if (!res.ok) {
        setErrore(d.errore || 'Non salvato.')
        return
      }
      setFattura(d.fattura ?? null)
      setAperto(false)
    } catch {
      setErrore('Non salvato: problema di rete.')
    } finally {
      setSalvando(false)
    }
  }

  async function cambiaStato(stato: string) {
    setErrore('')
    try {
      const res = await fetch(`/api/ordini/${ordineId}/fattura`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ azione: 'stato', stato, numeroFattura: numero }),
      })
      const d = (await res.json().catch(() => ({}))) as { errore?: string; fattura?: Fattura }
      if (!res.ok) {
        setErrore(d.errore || 'Non salvato.')
        return
      }
      setFattura(d.fattura ?? null)
    } catch {
      setErrore('Non salvato: problema di rete.')
    }
  }

  // Niente richiesta e modulo chiuso: un bottone solo.
  if (!fattura && !aperto) {
    return (
      <button
        className="btn btn-secondario small"
        onClick={() => {
          // ⚠️ Si precompila solo quello che sappiamo per certo — il nome di chi
          // compra e la sua email. Ragione sociale, P.IVA e indirizzo di
          // fatturazione NON si deducono: l'indirizzo che abbiamo è quello di
          // consegna, ed è del destinatario (è un regalo).
          setCampi({ ...VUOTA, intestazione: clienteNome ?? '', email: email ?? '' })
          setAperto(true)
        }}
      >
        Richiedi fattura
      </button>
    )
  }

  return (
    <div className="card" style={{ padding: 10, marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <div className="cella-nome" style={{ flex: 1 }}>
          Fattura
          {fattura ? (
            <span className={`badge${fattura.stato === 'emessa' ? ' verde' : ''}`} style={{ marginLeft: 8 }}>
              {nomeStato(fattura.stato)}
              {fattura.numeroFattura ? ` · ${fattura.numeroFattura}` : ''}
            </span>
          ) : null}
        </div>
        {fattura && !aperto ? (
          <button className="btn btn-secondario small" onClick={() => setAperto(true)}>
            Correggi i dati
          </button>
        ) : null}
      </div>

      {errore ? <div className="avviso-errore">{errore}</div> : null}

      {/* ⚠️⚠️ COSA MANCA, detto subito: lo SDI SCARTA una fattura elettronica
          senza il recapito giusto, e lo scarto arriva giorni dopo — quando il
          cliente ha chiuso la conversazione e nessuno si ricorda di richiamarlo
          per chiedergli il codice destinatario. Meglio dirlo adesso. */}
      {fattura && fattura.mancano.length ? (
        <div className="avviso-errore">
          Prima di emetterla manca {fattura.mancano.join(', ')}.
        </div>
      ) : null}

      {!aperto && fattura ? (
        <>
          <div className="cella-sub">
            {fattura.tipo === 'azienda' ? 'Azienda' : 'Privato'} · {fattura.intestazione || '—'}
            {fattura.partitaIva ? ` · P.IVA ${fattura.partitaIva}` : ''}
            {fattura.codiceFiscale ? ` · CF ${fattura.codiceFiscale}` : ''}
            {fattura.codiceSdi ? ` · SDI ${fattura.codiceSdi}` : ''}
            {fattura.pec ? ` · PEC ${fattura.pec}` : ''}
          </div>
          <div className="cella-sub">
            {[fattura.indirizzo, fattura.cap, fattura.citta, fattura.provincia, fattura.paese]
              .filter(Boolean)
              .join(', ') || 'indirizzo di fatturazione da chiedere'}
          </div>
          <div className="cella-sub" style={{ marginTop: 4 }}>
            Chiesta da {fattura.chiestaDaNome || '—'}
            {fattura.emessaIl
              ? ` · emessa il ${new Date(fattura.emessaIl).toLocaleDateString('it-IT')}${fattura.emessaDaNome ? ` da ${fattura.emessaDaNome}` : ''}`
              : ''}
          </div>

          {fattura.stato === 'chiesta' ? (
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              <input
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
                placeholder="numero della fattura"
                style={{ flex: '1 1 160px' }}
              />
              {/* ⚠️ «Emessa» PRETENDE il numero: senza, è una parola che nessuno
                  può verificare, e fra un mese non si sa quale fattura fosse. */}
              <button className="btn small" onClick={() => void cambiaStato('emessa')}>
                Segna emessa
              </button>
              <button className="btn btn-secondario small" onClick={() => void cambiaStato('non_dovuta')}>
                Non dovuta
              </button>
            </div>
          ) : (
            <button
              className="btn btn-secondario small"
              style={{ marginTop: 8 }}
              onClick={() => void cambiaStato('chiesta')}
            >
              Riaprila
            </button>
          )}
        </>
      ) : null}

      {aperto ? (
        <>
          <label className="campo">
            <span>Chi la vuole</span>
            <select value={campi.tipo} onChange={(e) => setCampi({ ...campi, tipo: e.target.value })}>
              <option value="privato">Privato (serve il codice fiscale)</option>
              <option value="azienda">Azienda (serve P.IVA e codice destinatario o PEC)</option>
            </select>
          </label>

          <label className="campo">
            <span>{campi.tipo === 'azienda' ? 'Ragione sociale' : 'Nome e cognome'}</span>
            <input
              value={campi.intestazione}
              onChange={(e) => setCampi({ ...campi, intestazione: e.target.value })}
            />
          </label>

          {campi.tipo === 'azienda' ? (
            <>
              <div className="campi-affiancati">
                <label className="campo">
                  <span>Partita IVA</span>
                  <input
                    value={campi.partitaIva}
                    onChange={(e) => setCampi({ ...campi, partitaIva: e.target.value })}
                  />
                </label>
                <label className="campo">
                  <span>Codice fiscale (se diverso)</span>
                  <input
                    value={campi.codiceFiscale}
                    onChange={(e) => setCampi({ ...campi, codiceFiscale: e.target.value })}
                  />
                </label>
              </div>
              <div className="campi-affiancati">
                <label className="campo">
                  <span>Codice destinatario (SDI)</span>
                  <input
                    value={campi.codiceSdi}
                    onChange={(e) => setCampi({ ...campi, codiceSdi: e.target.value })}
                    maxLength={7}
                    placeholder="7 caratteri"
                  />
                </label>
                <label className="campo">
                  <span>oppure PEC</span>
                  <input
                    value={campi.pec}
                    onChange={(e) => setCampi({ ...campi, pec: e.target.value })}
                  />
                </label>
              </div>
            </>
          ) : (
            <label className="campo">
              <span>Codice fiscale</span>
              <input
                value={campi.codiceFiscale}
                onChange={(e) => setCampi({ ...campi, codiceFiscale: e.target.value })}
              />
            </label>
          )}

          <label className="campo">
            {/* ⚠️ DI FATTURAZIONE, non di consegna: la fattura va a chi paga, la
                consegna a chi riceve — e da noi sono quasi sempre due persone. */}
            <span>Indirizzo di fatturazione</span>
            <input
              value={campi.indirizzo}
              onChange={(e) => setCampi({ ...campi, indirizzo: e.target.value })}
            />
          </label>
          <div className="campi-affiancati">
            <label className="campo">
              <span>CAP</span>
              <input value={campi.cap} onChange={(e) => setCampi({ ...campi, cap: e.target.value })} />
            </label>
            <label className="campo">
              <span>Città</span>
              <input
                value={campi.citta}
                onChange={(e) => setCampi({ ...campi, citta: e.target.value })}
              />
            </label>
            <label className="campo">
              <span>Prov.</span>
              <input
                value={campi.provincia}
                onChange={(e) => setCampi({ ...campi, provincia: e.target.value })}
                maxLength={2}
              />
            </label>
          </div>

          <label className="campo">
            <span>Email per mandarla</span>
            <input
              type="email"
              value={campi.email}
              onChange={(e) => setCampi({ ...campi, email: e.target.value })}
            />
          </label>

          <label className="campo">
            <span>Note</span>
            <input value={campi.note} onChange={(e) => setCampi({ ...campi, note: e.target.value })} />
          </label>

          <div style={{ display: 'flex', gap: 8 }}>
            {/* ⚠️ Si salva anche INCOMPLETA: chi è al telefono scrive quello che
                il cliente gli detta, e il codice destinatario spesso arriva
                dopo. Rifiutare il salvataggio farebbe perdere anche il resto. */}
            <button className="btn small" disabled={salvando} onClick={() => void salva()}>
              {salvando ? 'Salvo…' : 'Salva la richiesta'}
            </button>
            <button className="btn btn-secondario small" onClick={() => setAperto(false)}>
              Annulla
            </button>
          </div>
        </>
      ) : null}
    </div>
  )
}
