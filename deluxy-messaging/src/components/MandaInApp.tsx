'use client'

import { useCallback, useEffect, useState } from 'react'

// MANDARE L'ORDINE IN APP: lo stesso modulo che la piattaforma usa per inserire
// una consegna da una vendita, portato qui sulla scheda dell'ordine.
//
// ⚠️⚠️ NON è una copia della logica: i campi sono quelli che accetta
// `POST /api/v1/app/consegne` di là, cioè **la stessa porta del form della
// piattaforma** (prezzo dal listino del partner, paga dal listino del valet,
// attività e notifiche le fa lei). Qui si compila e si manda; il prezzo, la
// paga e gli avvisi restano a casa loro.
//
// ⚠️ Quello che non sappiamo resta VUOTO e lo compila una persona: su una
// consegna vera un dato dedotto è un valet mandato all'indirizzo sbagliato.

type Campi = {
  date: string
  serviceTypeId: string
  partnerId?: string
  recipientFirstName: string
  recipientLastName: string
  recipientAddress: string
  recipientIntercom?: string
  recipientPhone?: string
  recipientEmail?: string
  senderFirstName?: string
  senderLastName?: string
  senderPhone?: string
  deliveryTimeFrom?: string
  deliveryTimeTo?: string
  pickupAddress?: string
  notes?: string
  internalNotes?: string
  ddtNumber?: string
  ddtBrand?: string
}

type Servizio = { id: string; nome?: string; name?: string; codice?: string; code?: string }

type Partner = { id: string; insegna: string; citta?: string; province?: string[] }

type Prefill = {
  ok: boolean
  perche: string
  ordineNumero: string
  venditaId: string
  venditaStato: string
  partnerId: string
  partnerNome: string
  campi: Campi
  servizi: Servizio[]
  partner: Partner[]
  serviziErrore: string
}

const URL_PIATTAFORMA_DEFAULT = 'https://deluxy-delivery.vercel.app'

export function MandaInApp({
  ordineId,
  urlPiattaforma,
  onFatto,
}: {
  ordineId: string
  urlPiattaforma?: string
  onFatto?: () => void
}) {
  const [aperto, setAperto] = useState(false)
  const [dati, setDati] = useState<Prefill | null>(null)
  const [campi, setCampi] = useState<Campi | null>(null)
  const [caricando, setCaricando] = useState(false)
  const [mandando, setMandando] = useState(false)
  const [errore, setErrore] = useState('')
  const [fatto, setFatto] = useState('')

  const carica = useCallback(async () => {
    setCaricando(true)
    setErrore('')
    try {
      const res = await fetch(`/api/ordini/${ordineId}/in-app`, { cache: 'no-store' })
      const d = (await res.json().catch(() => ({}))) as Prefill & { errore?: string }
      if (!res.ok) {
        setErrore(d.errore || 'Modulo non caricato.')
        return
      }
      setDati(d)
      setCampi(d.campi)
    } catch {
      setErrore('Modulo non caricato: problema di rete.')
    } finally {
      setCaricando(false)
    }
  }, [ordineId])

  useEffect(() => {
    if (aperto && !dati) void carica()
  }, [aperto, dati, carica])

  async function manda() {
    if (!campi) return
    setMandando(true)
    setErrore('')
    try {
      const res = await fetch(`/api/ordini/${ordineId}/in-app`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(campi),
      })
      const d = (await res.json().catch(() => ({}))) as { errore?: string; nota?: string }
      if (!res.ok) {
        setErrore(d.errore || 'Consegna non creata.')
        return
      }
      setFatto(d.nota || 'Consegna creata in piattaforma.')
      onFatto?.()
    } catch {
      setErrore('Consegna non creata: problema di rete.')
    } finally {
      setMandando(false)
    }
  }

  function cambia(k: keyof Campi, v: string) {
    setCampi((c) => (c ? { ...c, [k]: v } : c))
  }

  if (!aperto) {
    return (
      <button
        className="btn btn-secondario small"
        onClick={() => setAperto(true)}
        title="Crea la consegna nella piattaforma e porta l'ordine nello stato «In App»"
      >
        Manda in app
      </button>
    )
  }

  const base = (urlPiattaforma || URL_PIATTAFORMA_DEFAULT).replace(/\/+$/, '')

  return (
    <div className="card" style={{ padding: 10, marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <div className="cella-nome" style={{ flex: 1 }}>
          Manda in app — nuova consegna
        </div>
        <button className="btn btn-secondario small" onClick={() => setAperto(false)}>
          Chiudi
        </button>
      </div>

      {caricando ? <p className="cella-sub">Chiedo alla piattaforma…</p> : null}
      {errore ? <div className="avviso-errore">{errore}</div> : null}
      {fatto ? <div className="avviso-ok">{fatto}</div> : null}

      {/* ⚠️ Quello che non va si dice PRIMA del modulo: compilare venti campi e
          scoprire alla fine che la vendita ha già una consegna è il modo di far
          perdere il lavoro a qualcuno. */}
      {dati && dati.perche ? (
        <div className={dati.ok ? 'avviso-ok' : 'avviso-errore'}>{dati.perche}</div>
      ) : null}
      {dati?.serviziErrore ? <div className="avviso-errore">{dati.serviziErrore}</div> : null}

      {dati && campi && !fatto ? (
        <>
          {/* ⚠️⚠️ IL PARTNER SI SCEGLIE QUI (31/08/2026, chiesto dall'utente).
              La piattaforma pretende il partner («dal canale app non c'è un
              partner sottinteso») e prima l'elenco non usciva da lì: quando la
              vendita non ne aveva uno, il modulo si arrendeva e mandava al form
              di là. Adesso l'elenco arriva dalla piattaforma
              (`GET /app/partner`, aggiunta apposta) e la scelta si fa senza
              cambiare app.
              ⚠️ Quello della vendita resta PRESELEZIONATO quando c'è: è chi
              l'ha già presa in carico, e cambiarlo dev'essere una decisione, non
              una distrazione. */}
          <label className="campo">
            <span>
              Partner{' '}
              {dati.partnerId ? (
                <span className="cella-sub">
                  · proposto dalla vendita{dati.venditaStato ? ` (${dati.venditaStato})` : ''}
                </span>
              ) : null}
            </span>
            <select
              value={campi.partnerId ?? ''}
              onChange={(e) => cambia('partnerId', e.target.value)}
            >
              <option value="">Scegli il partner…</option>
              {dati.partner.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.insegna}
                  {p.citta ? ` — ${p.citta}` : ''}
                  {p.province?.length ? ` (${p.province.join(', ')})` : ''}
                </option>
              ))}
              {/* ⚠️ Se il partner della vendita non è nell'elenco (disattivato,
                  o l'elenco non è arrivato) resta comunque scelto: toglierlo
                  dalla tendina lo cancellerebbe dal modulo senza dirlo. */}
              {dati.partnerId && !dati.partner.some((p) => p.id === dati.partnerId) ? (
                <option value={dati.partnerId}>
                  {dati.partnerNome || dati.partnerId} — dalla vendita
                </option>
              ) : null}
            </select>
          </label>
          {!dati.partner.length ? (
            <p className="cella-sub">
              L&apos;elenco dei partner non è arrivato dalla piattaforma.
              {dati.venditaId ? (
                <>
                  {' '}
                  <a
                    href={`${base}/deliveries/new?vendita=${encodeURIComponent(dati.venditaId)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Apri il modulo della piattaforma
                  </a>
                  .
                </>
              ) : null}
            </p>
          ) : null}

          <div className="campi-affiancati">
            <label className="campo">
              <span>Giorno</span>
              <input type="date" value={campi.date} onChange={(e) => cambia('date', e.target.value)} />
            </label>
            <label className="campo">
              <span>Servizio</span>
              <select
                value={campi.serviceTypeId}
                onChange={(e) => cambia('serviceTypeId', e.target.value)}
              >
                <option value="">Scegli…</option>
                {dati.servizi.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome || s.name || s.codice || s.code || s.id}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="campi-affiancati">
            <label className="campo">
              <span>Dalle</span>
              <input
                value={campi.deliveryTimeFrom ?? ''}
                onChange={(e) => cambia('deliveryTimeFrom', e.target.value)}
                placeholder="16:00"
              />
            </label>
            <label className="campo">
              <span>Alle</span>
              <input
                value={campi.deliveryTimeTo ?? ''}
                onChange={(e) => cambia('deliveryTimeTo', e.target.value)}
                placeholder="20:00"
              />
            </label>
          </div>

          {/* ⚠️ Il DESTINATARIO, non il cliente: da noi chi ordina e chi riceve
              sono due persone diverse quasi sempre — è un regalo. */}
          <div className="campi-affiancati">
            <label className="campo">
              <span>Destinatario — nome</span>
              <input
                value={campi.recipientFirstName}
                onChange={(e) => cambia('recipientFirstName', e.target.value)}
              />
            </label>
            <label className="campo">
              <span>Cognome</span>
              <input
                value={campi.recipientLastName}
                onChange={(e) => cambia('recipientLastName', e.target.value)}
              />
            </label>
          </div>

          <label className="campo">
            <span>Indirizzo di consegna</span>
            <input
              value={campi.recipientAddress}
              onChange={(e) => cambia('recipientAddress', e.target.value)}
            />
          </label>

          <div className="campi-affiancati">
            <label className="campo">
              <span>Citofono</span>
              <input
                value={campi.recipientIntercom ?? ''}
                onChange={(e) => cambia('recipientIntercom', e.target.value)}
              />
            </label>
            <label className="campo">
              {/* ⚠️⚠️ VUOTO DI PROPOSITO: il numero che abbiamo sull'ordine è di
                  chi COMPRA. Metterlo qui vorrebbe dire far chiamare dal valet
                  il mittente per consegnare un regalo a sorpresa — cioè
                  rovinarlo — o far credere che il numero del destinatario ce
                  l'abbiamo. Si scrive quando si sa; quello del cliente sta qui
                  sotto, nel mittente, dov'è vero. */}
              <span>Telefono del destinatario</span>
              <input
                value={campi.recipientPhone ?? ''}
                onChange={(e) => cambia('recipientPhone', e.target.value)}
                placeholder="se lo sappiamo — non è quello del cliente"
              />
            </label>
          </div>

          <label className="campo">
            <span>Email del destinatario</span>
            <input
              type="email"
              value={campi.recipientEmail ?? ''}
              onChange={(e) => cambia('recipientEmail', e.target.value)}
              placeholder="facoltativa"
            />
          </label>

          {/* ── IL MITTENTE ──
              ⚠️ Si vede e si può correggere: è chi ha comprato, e sulla consegna
              serve a chi la porta («un regalo da parte di…»). Precompilato col
              cliente dell'ordine, che lì è il dato giusto. */}
          <div className="campi-affiancati">
            <label className="campo">
              <span>Mittente — nome</span>
              <input
                value={campi.senderFirstName ?? ''}
                onChange={(e) => cambia('senderFirstName', e.target.value)}
              />
            </label>
            <label className="campo">
              <span>Cognome</span>
              <input
                value={campi.senderLastName ?? ''}
                onChange={(e) => cambia('senderLastName', e.target.value)}
              />
            </label>
          </div>

          <label className="campo">
            <span>Telefono del mittente</span>
            <input
              value={campi.senderPhone ?? ''}
              onChange={(e) => cambia('senderPhone', e.target.value)}
            />
          </label>

          <label className="campo">
            <span>Note per chi consegna</span>
            <textarea
              rows={2}
              value={campi.notes ?? ''}
              onChange={(e) => cambia('notes', e.target.value)}
              placeholder="Biglietto, orari, «citofonare al vicino»…"
            />
          </label>

          <div className="campi-affiancati">
            <label className="campo">
              <span>Riferimento (DDT)</span>
              <input
                value={campi.ddtNumber ?? ''}
                onChange={(e) => cambia('ddtNumber', e.target.value)}
              />
            </label>
            <label className="campo">
              <span>Brand del riferimento</span>
              {/* ⚠️ Il brand accanto al numero: con più negozi «1798» da solo
                  non identifica niente — lo stesso numero esiste su due marchi. */}
              <input
                value={campi.ddtBrand ?? ''}
                onChange={(e) => cambia('ddtBrand', e.target.value)}
              />
            </label>
          </div>

          {/* ⚠️ Il bottone guarda il partner SCELTO, non quello della vendita:
              da quando lo si può scegliere, bloccare sul secondo terrebbe spento
              il bottone anche dopo averlo scelto. */}
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <button
              className="btn small"
              disabled={mandando || !dati.ok || !campi.partnerId}
              onClick={() => void manda()}
            >
              {mandando ? 'Mando…' : 'Crea la consegna e metti In App'}
            </button>
            {dati.venditaId ? (
              <a
                className="btn btn-secondario small"
                href={`${base}/deliveries/new?vendita=${encodeURIComponent(dati.venditaId)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Aprilo nella piattaforma
              </a>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  )
}
