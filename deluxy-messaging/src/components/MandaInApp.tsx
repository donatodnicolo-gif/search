'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

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
  products?: { productId: string; quantity?: number; price?: number; flexiblePrice?: boolean }[]
}

/** Un prodotto del catalogo della piattaforma (vedi /api/piattaforma/prodotti). */
type Prodotto = {
  id: string
  nome: string
  sku: string
  prezzo: number
  prezzoPubblico: number | null
  tipo: string
  partnerId: string
  partner: string
}

/** Una riga dell'ordine, per proporre il prodotto: quello che il cliente ha comprato. */
export type RigaPerApp = { titolo: string; prezzo: number; quantita: number; sku: string }

type Servizio = { id: string; nome?: string; name?: string; codice?: string; code?: string }

type Partner = {
  id: string
  insegna: string
  citta?: string
  province?: string[]
  /** Gli id dei servizi nel listino del partner. Assente = la piattaforma non li manda ancora. */
  servizi?: string[]
}

type Prefill = {
  ok: boolean
  perche: string
  ordineNumero: string
  venditaId: string
  venditaStato: string
  partnerId: string
  partnerNome: string
  /** La sigla della provincia di consegna, '' se non riconosciuta. */
  provinciaConsegna?: string
  campi: Campi
  servizi: Servizio[]
  partner: Partner[]
  serviziErrore: string
}

const URL_PIATTAFORMA_DEFAULT = 'https://deluxy-delivery.vercel.app'

export function MandaInApp({
  ordineId,
  righe = [],
  apri = 0,
  urlPiattaforma,
  onFatto,
}: {
  ordineId: string
  /** Le righe dell'ordine: il modulo propone prodotto, prezzo e quantità da qui. */
  righe?: RigaPerApp[]
  /** Ogni incremento apre il riquadro (dal passo «In App» della lavorazione). */
  apri?: number
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
  /** «Mostra anche i partner di altre province»: si apre, non è il default. */
  const [tuttiIPartner, setTuttiIPartner] = useState(false)
  // ── LA MERCE ──
  const [cercaProdotto, setCercaProdotto] = useState('')
  const [trovati, setTrovati] = useState<Prodotto[]>([])
  const [generico, setGenerico] = useState<Prodotto | null>(null)
  const [cercando, setCercando] = useState(false)
  const [erroreProdotti, setErroreProdotti] = useState('')
  const [prodotto, setProdotto] = useState<Prodotto | null>(null)
  const [quantita, setQuantita] = useState('1')
  const [prezzo, setPrezzo] = useState('')
  /** Con il prodotto generico la merce si descrive a parole: finisce nelle note. */
  const [descrizione, setDescrizione] = useState('')
  const riquadro = useRef<HTMLDivElement>(null)

  // ⚠️ Il passo «In App» della lavorazione apre QUESTO modulo dopo la conferma
  // (utente, 06/09/2026): `apri` cambia, il riquadro si apre e si porta a vista.
  useEffect(() => {
    if (apri > 0) {
      setAperto(true)
      setTimeout(() => riquadro.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
    }
  }, [apri])

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

  // ⚠️ IL PRODOTTO SI PROPONE DALL'ORDINE, NON SI SCEGLIE DA SOLO. La prima riga
  // dell'ordine dà il testo da cercare, il prezzo e la quantità; il prodotto del
  // catalogo lo conferma una persona, perché lo stesso bouquet esiste in più
  // taglie e la riga di consegna fotografa quello che si sceglie.
  useEffect(() => {
    if (!aperto || !righe.length) return
    const r = righe[0]
    setCercaProdotto((v) => v || r.titolo)
    setPrezzo((v) => v || (r.prezzo ? String(r.prezzo).replace('.', ',') : ''))
    setQuantita((v) => (v === '1' && r.quantita > 1 ? String(r.quantita) : v))
    setDescrizione((v) => v || r.titolo)
  }, [aperto, righe])

  // La ricerca a catalogo: dopo mezzo secondo di pausa, nel perimetro del
  // partner scelto. Si rifà cambiando partner, perché cambia il perimetro.
  const partnerIdScelto = campi?.partnerId ?? ''
  useEffect(() => {
    if (!aperto) return
    const q = cercaProdotto.trim()
    const t = setTimeout(async () => {
      setCercando(true)
      setErroreProdotti('')
      try {
        const p = new URLSearchParams()
        if (q) p.set('q', q)
        if (partnerIdScelto) p.set('partnerId', partnerIdScelto)
        const res = await fetch(`/api/piattaforma/prodotti?${p.toString()}`, { cache: 'no-store' })
        const d = (await res.json().catch(() => ({}))) as {
          prodotti?: Prodotto[]
          generico?: Prodotto | null
          errore?: string
        }
        if (!res.ok) {
          setErroreProdotti(d.errore || 'Catalogo non disponibile.')
          setTrovati([])
          return
        }
        setTrovati(d.prodotti ?? [])
        setGenerico(d.generico ?? null)
      } catch {
        setErroreProdotti('Catalogo non disponibile: problema di rete.')
      } finally {
        setCercando(false)
      }
    }, 450)
    return () => clearTimeout(t)
  }, [aperto, cercaProdotto, partnerIdScelto])

  function scegliProdotto(p: Prodotto) {
    setProdotto(p)
    // ⚠️ Il prezzo NON si sovrascrive se l'operatore l'ha già scritto (o se
    // viene dall'ordine): è il prezzo di QUESTA vendita, il listino è un
    // ripiego quando non si sa altro.
    setPrezzo((v) => v || (p.prezzo ? String(p.prezzo).replace('.', ',') : ''))
  }

  const prezzoNumero = Number(prezzo.replace(',', '.'))
  const prezzoValido = prezzo.trim() !== '' && Number.isFinite(prezzoNumero) && prezzoNumero >= 0
  const prezzoFlessibile = Boolean(prodotto) && prezzoValido && prezzoNumero !== (prodotto?.prezzo ?? NaN)
  const eGenerico = Boolean(prodotto && generico && prodotto.id === generico.id)

  async function manda() {
    if (!campi) return
    // La merce viaggia con la consegna: prodotto del catalogo, quantità, e il
    // prezzo scritto qui (flessibile quando non è quello di listino). Col
    // prodotto generico la descrizione va nelle note, sotto gli occhi del valet.
    const qta = Math.max(1, Math.round(Number(quantita) || 1))
    const products = prodotto
      ? [
          {
            productId: prodotto.id,
            quantity: qta,
            ...(prezzoValido ? { price: prezzoNumero, flexiblePrice: prezzoFlessibile } : {}),
          },
        ]
      : undefined
    const notaMerce = eGenerico && descrizione.trim() ? `Prodotto: ${descrizione.trim()}` : ''
    const corpo: Campi = {
      ...campi,
      products,
      notes: [notaMerce, campi.notes ?? ''].filter(Boolean).join('\n'),
    }
    setMandando(true)
    setErrore('')
    try {
      const res = await fetch(`/api/ordini/${ordineId}/in-app`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
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
    setCampi((c) => {
      if (!c) return c
      // ⚠️ Cambiando partner, un servizio che nel suo listino non c'è si
      // svuota: lasciarlo scelto vorrebbe dire mandare una combinazione che la
      // piattaforma rifiuta, e scoprirlo solo premendo «Manda».
      if (k === 'partnerId' && c.serviceTypeId) {
        const p = dati?.partner.find((x) => x.id === v)
        if (p?.servizi && !p.servizi.includes(c.serviceTypeId)) {
          return { ...c, partnerId: v, serviceTypeId: '' }
        }
      }
      return { ...c, [k]: v }
    })
  }

  // ── SOLO I PARTNER DELLA PROVINCIA, E SOLO I SERVIZI DEL PARTNER (06/09/2026) ──
  //
  // ⚠️ L'elenco della piattaforma è già dei soli partner ATTIVI (`active: true,
  // deleted: false` di là). Qui si restringe alla provincia di consegna: un
  // partner di Milano proposto per Sant'Agnello è una scelta sbagliata a
  // portata di clic. Chi non serve la provincia non sparisce: sta dietro
  // «mostra tutti», con il conto — un filtro che toglie righe senza dirlo è
  // un filtro di cui ci si fida per fede.
  // ⚠️ Provincia NON riconosciuta = elenco intero, e lo si scrive: «non lo so»
  // non diventa né un divieto né un filtro muto.
  const provincia = dati?.provinciaConsegna ?? ''
  const partnerInZona = provincia
    ? (dati?.partner ?? []).filter((p) => (p.province ?? []).includes(provincia))
    : (dati?.partner ?? [])
  const partnerFuori = (dati?.partner ?? []).length - partnerInZona.length
  const partnerMostrati = provincia && !tuttiIPartner ? partnerInZona : (dati?.partner ?? [])
  const partnerScelto = (dati?.partner ?? []).find((p) => p.id === campi?.partnerId)
  // I servizi: se il partner scelto porta il suo listino, solo quelli. Se non
  // lo porta (piattaforma vecchia) o non c'è ancora un partner, tutti.
  const serviziMostrati =
    partnerScelto?.servizi
      ? (dati?.servizi ?? []).filter((s) => partnerScelto.servizi!.includes(s.id))
      : (dati?.servizi ?? [])

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
    <div className="card" style={{ padding: 10, marginTop: 12 }} ref={riquadro}>
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
              {partnerMostrati.map((p) => (
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
          {dati.partner.length ? (
            <p className="cella-sub" style={{ marginTop: -4 }}>
              {provincia ? (
                <>
                  Solo i partner attivi che servono la provincia <strong>{provincia}</strong>{' '}
                  ({partnerInZona.length}).
                  {partnerFuori > 0 ? (
                    <>
                      {' '}
                      <button
                        type="button"
                        className="btn btn-secondario small"
                        style={{ marginLeft: 4 }}
                        onClick={() => setTuttiIPartner((v) => !v)}
                      >
                        {tuttiIPartner
                          ? `Nascondi i ${partnerFuori} di altre province`
                          : `Mostra anche i ${partnerFuori} di altre province`}
                      </button>
                    </>
                  ) : null}
                  {!partnerInZona.length && !tuttiIPartner ? (
                    <>
                      {' '}
                      Nessun partner serve questa provincia: o ne abiliti uno sulla piattaforma, o
                      scegli fra gli altri sapendo che è fuori zona.
                    </>
                  ) : null}
                </>
              ) : (
                <>
                  Provincia di consegna non riconosciuta dall&apos;indirizzo: elenco completo dei
                  partner attivi.
                </>
              )}
            </p>
          ) : null}
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
                {serviziMostrati.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome || s.name || s.codice || s.code || s.id}
                  </option>
                ))}
              </select>
              {/* ⚠️ Si dice DA CHE COSA dipende l'elenco: senza, un menu con
                  tre voci invece di quarantotto sembra un guasto. */}
              {partnerScelto?.servizi ? (
                <span className="cella-sub">
                  {serviziMostrati.length
                    ? `Solo i ${serviziMostrati.length} servizi nel listino di ${partnerScelto.insegna}.`
                    : `${partnerScelto.insegna} non ha servizi nel listino sulla piattaforma: va abilitato di là prima di mandare.`}
                </span>
              ) : !campi.partnerId ? (
                <span className="cella-sub">
                  Scegli prima il partner: l&apos;elenco si restringe al suo listino.
                </span>
              ) : null}
            </label>
          </div>

          {/* ── LA MERCE: prodotto e prezzo, flessibili (06/09/2026) ──
              ⚠️ Il prodotto è uno del catalogo della PIATTAFORMA, perché è lei
              che fotografa la riga di consegna; si cerca per nome o sku, nel
              perimetro del partner scelto (i suoi prima). Il prezzo si scrive:
              quello dell'ordine è già qui, il listino è solo un ripiego. Se la
              merce non sta a catalogo c'è il prodotto generico e si descrive. */}
          <div className="campo" style={{ marginTop: 6 }}>
            <span>Prodotto {righe.length ? <span className="cella-sub">· dall&apos;ordine: {righe[0].titolo}</span> : null}</span>
            {prodotto ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 8px',
                  border: '1px solid var(--hairline)',
                  borderRadius: 10,
                }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ fontWeight: 600 }}>{prodotto.nome}</strong>
                  <span className="cella-sub">
                    {prodotto.sku ? ` · ${prodotto.sku}` : ''}
                    {prodotto.partner ? ` · ${prodotto.partner}` : ' · catalogo comune'}
                    {` · listino ${prodotto.prezzo.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}`}
                  </span>
                </span>
                <button type="button" className="btn btn-secondario small" onClick={() => setProdotto(null)}>
                  Cambia
                </button>
              </div>
            ) : (
              <>
                <input
                  value={cercaProdotto}
                  onChange={(e) => setCercaProdotto(e.target.value)}
                  placeholder="Cerca nel catalogo della piattaforma per nome o sku…"
                />
                {erroreProdotti ? <span className="avviso-errore">{erroreProdotti}</span> : null}
                {cercando ? <span className="cella-sub">Cerco…</span> : null}
                {!cercando && !erroreProdotti ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                    {trovati.slice(0, 8).map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="btn btn-secondario small"
                        onClick={() => scegliProdotto(p)}
                        title={`${p.partner || 'catalogo comune'} · listino ${p.prezzo.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}`}
                      >
                        {p.nome}
                        {p.partner ? ` — ${p.partner}` : ''}
                      </button>
                    ))}
                    {generico ? (
                      <button
                        type="button"
                        className="btn btn-secondario small"
                        onClick={() => scegliProdotto(generico)}
                        title="Per merce che non sta a catalogo: la descrivi qui sotto e finisce nelle note per il valet"
                      >
                        Prodotto generico: lo descrivo io
                      </button>
                    ) : null}
                    {!trovati.length && cercaProdotto.trim() ? (
                      <span className="cella-sub">
                        Nessun prodotto a catalogo per «{cercaProdotto.trim()}»
                        {partnerScelto ? ` nel perimetro di ${partnerScelto.insegna}` : ''}.
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </>
            )}
          </div>
          {prodotto ? (
            <>
              {eGenerico ? (
                <label className="campo">
                  <span>Che cosa va consegnato (finisce nelle note per il valet)</span>
                  <input
                    value={descrizione}
                    onChange={(e) => setDescrizione(e.target.value)}
                    placeholder="es. Bouquet 50 rose rosse e bianche"
                  />
                </label>
              ) : null}
              <div className="campi-affiancati">
                <label className="campo">
                  <span>Quantità</span>
                  <input value={quantita} onChange={(e) => setQuantita(e.target.value)} inputMode="numeric" />
                </label>
                <label className="campo">
                  <span>
                    Prezzo prodotto (€)
                    {prezzoFlessibile ? <span className="cella-sub"> · diverso dal listino: flessibile</span> : null}
                  </span>
                  <input
                    value={prezzo}
                    onChange={(e) => setPrezzo(e.target.value)}
                    inputMode="decimal"
                    placeholder={prodotto.prezzo ? String(prodotto.prezzo).replace('.', ',') : '0,00'}
                  />
                </label>
              </div>
            </>
          ) : null}

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
