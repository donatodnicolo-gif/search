'use client'

import { useCallback, useEffect, useState } from 'react'
import { valuta as valutaProve, type ProveOrdine } from '@/lib/prove-chargeback'
import { ChipsPeriodo } from './ChipsPeriodo'
import { nelPeriodo, type Periodo } from '@/lib/periodo'

// Le contestazioni di pagamento, e la risposta alla banca.
//
// ⚠️ La schermata è costruita attorno a una domanda sola: **quali stanno per
// scadere**. Una contestazione «da rispondere» che nessuno apre si perde per
// silenzio — contate il 19/08/2026: dieci perse, 2.087,66 €.

type Chargeback = {
  id: string
  negozioNome: string
  ordineNumero: string
  ordineIdShopify: string
  tipo: string
  importo: number
  valuta: string
  motivo: string
  codiceRete: string
  stato: string
  scadenzaProve: string | null
  proveInviateIl: string | null
  iniziatoIl: string | null
  bozzaRisposta: string
}

type Evidenza = { submitted: boolean; uncategorizedText: string }

const ACAPO = String.fromCharCode(10)
const RIGA_VUOTA = ACAPO + ACAPO

const NOMI_STATO: Record<string, string> = {
  needs_response: 'Da rispondere',
  under_review: 'In esame',
  charge_refunded: 'Rimborsata',
  accepted: 'Accettata',
  won: 'Vinta',
  lost: 'Persa',
}

const NOMI_MOTIVO: Record<string, string> = {
  fraudulent: 'Carta usata da altri (frode)',
  product_not_received: 'Prodotto mai ricevuto',
  product_unacceptable: 'Prodotto non conforme',
  duplicate: 'Pagamento doppio',
  unrecognized: 'Addebito non riconosciuto',
  credit_not_processed: 'Rimborso non arrivato',
  customer_initiated: 'Aperta dal cliente',
  general: 'Generica',
}

function soldi(v: number, valuta: string): string {
  return v.toLocaleString('it-IT', { style: 'currency', currency: valuta || 'EUR' })
}

/** Quanto manca alla scadenza: è il dato che decide cosa si fa prima. */
function quantoManca(iso: string | null): { testo: string; urgente: boolean; scaduta: boolean } {
  if (!iso) return { testo: 'senza scadenza', urgente: false, scaduta: false }
  const giorni = Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000)
  if (giorni < 0) return { testo: `scaduta da ${-giorni} giorni`, urgente: false, scaduta: true }
  if (giorni === 0) return { testo: 'scade OGGI', urgente: true, scaduta: false }
  if (giorni === 1) return { testo: 'scade domani', urgente: true, scaduta: false }
  return { testo: `${giorni} giorni`, urgente: giorni <= 5, scaduta: false }
}

export function ChargebackLista() {
  const [righe, setRighe] = useState<Chargeback[]>([])
  const [aperti, setAperti] = useState(0)
  const [soldiAperti, setSoldiAperti] = useState(0)
  const [tutti, setTutti] = useState(false)
  // Ricerca e periodo (Libro v1.9 §8-bis): qui si filtra IN MEMORIA — le
  // contestazioni sono poche (il server ne manda al più 50) e arrivano già
  // tutte. La ricerca è sui campi con cui si riconosce la riga: ordine,
  // negozio, motivo, codice della rete. Il periodo è sulla DATA DI APERTURA
  // della contestazione (`iniziatoIl`).
  const [q, setQ] = useState('')
  const [periodo, setPeriodo] = useState<Periodo>('')
  const [caricato, setCaricato] = useState(false)
  const [aggiornando, setAggiornando] = useState(false)
  const [errore, setErrore] = useState('')
  const [avviso, setAvviso] = useState('')

  const [aperta, setAperta] = useState<Chargeback | null>(null)
  const [evidenza, setEvidenza] = useState<Evidenza | null>(null)
  const [testo, setTesto] = useState('')
  const [salvando, setSalvando] = useState(false)
  // Che cosa abbiamo in mano, per ogni contestazione aperta.
  const [prove, setProve] = useState<Record<string, ProveOrdine>>({})

  const carica = useCallback(async () => {
    const res = await fetch(`/api/chargeback?stato=${tutti ? 'tutti' : 'aperti'}`)
    if (!res.ok) return
    const d = (await res.json()) as {
      chargeback: Chargeback[]
      aperti: number
      soldiAperti: number
      prove?: Record<string, ProveOrdine>
    }
    setProve(d.prove ?? {})
    setRighe(d.chargeback)
    setAperti(d.aperti)
    setSoldiAperti(d.soldiAperti)
    setCaricato(true)
  }, [tutti])

  useEffect(() => {
    void carica()
  }, [carica])

  async function aggiorna() {
    setAggiornando(true)
    setErrore('')
    try {
      const res = await fetch('/api/chargeback', { method: 'POST' })
      const d = (await res.json().catch(() => ({}))) as {
        letti?: number
        aperti?: number
        errore?: string
      }
      if (!res.ok) setErrore(d.errore || 'Non sono riuscito a rileggere da Shopify.')
      else setAvviso(`Rilette da Shopify: ${d.letti ?? 0}, di cui ${d.aperti ?? 0} aperte.`)
      await carica()
    } finally {
      setAggiornando(false)
    }
  }

  async function apri(c: Chargeback) {
    setAperta(c)
    setEvidenza(null)
    setTesto(c.bozzaRisposta || '')
    const res = await fetch(`/api/chargeback/${c.id}`)
    if (!res.ok) return
    const d = (await res.json()) as { evidenza: Evidenza | null; chargeback: Chargeback }
    setEvidenza(d.evidenza)
    // ⚠️ Se su Shopify c'è già un testo, vince quello: qualcuno può aver
    // risposto dal pannello di Shopify, e riscriverci sopra la nostra bozza
    // vecchia vorrebbe dire cancellare il lavoro di un collega.
    if (d.evidenza?.uncategorizedText) setTesto(d.evidenza.uncategorizedText)
  }

  async function salva(invia: boolean) {
    if (!aperta || salvando) return
    if (invia) {
      const conferma = window.confirm(
        `Le prove partono verso la banca e NON si possono più correggere.\n\n` +
          `${aperta.ordineNumero || 'Ordine'} · ${soldi(aperta.importo, aperta.valuta)}\n\n` +
          'Hai riletto il testo? Procedo con l’invio?'
      )
      if (!conferma) return
    }
    setSalvando(true)
    setErrore('')
    try {
      const res = await fetch(`/api/chargeback/${aperta.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testo, invia }),
      })
      const d = (await res.json().catch(() => ({}))) as { errore?: string; inviata?: boolean }
      if (!res.ok) {
        setErrore(d.errore || 'Non riuscito.')
        return
      }
      setAvviso(
        d.inviata
          ? 'Prove inviate: la contestazione passa in esame alla banca.'
          : 'Bozza salvata qui. Non è ancora partita.'
      )
      setAperta(null)
      await carica()
    } catch {
      setErrore('Non riuscito: problema di rete.')
    } finally {
      setSalvando(false)
    }
  }

  // Il filtro in memoria: ricerca sui campi con cui si riconosce la riga
  // (anche il motivo TRADOTTO: chi cerca scrive «frode», non `fraudulent`) e
  // periodo sulla data di apertura.
  const cercato = q.trim().toLowerCase()
  const visibili = righe.filter((c) => {
    if (!nelPeriodo(c.iniziatoIl, periodo)) return false
    if (!cercato) return true
    return [
      c.ordineNumero,
      c.negozioNome,
      c.motivo,
      NOMI_MOTIVO[c.motivo] ?? '',
      c.codiceRete,
      NOMI_STATO[c.stato] ?? c.stato,
    ]
      .join(' ')
      .toLowerCase()
      .includes(cercato)
  })

  return (
    <>
      <div className="testa-pagina">
        <h1>Chargeback</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {aperti > 0 ? (
            <span className="badge rosso">
              {aperti} aperte · {soldi(soldiAperti, 'EUR')} in gioco
            </span>
          ) : (
            <span className="badge">nessuna contestazione aperta</span>
          )}
          <button
            className="bottone secondario"
            onClick={() => setTutti(!tutti)}
            title={tutti ? 'Mostra solo quelle che aspettano una risposta' : 'Mostra anche le chiuse'}
          >
            {tutti ? 'Solo aperte' : 'Anche le chiuse'}
          </button>
          <button className="bottone secondario" onClick={aggiorna} disabled={aggiornando}>
            {aggiornando ? 'Rileggo…' : 'Aggiorna da Shopify'}
          </button>
        </div>
      </div>

      <p className="descrizione">
        Le contestazioni di pagamento aperte dalle banche dei clienti. ⚠️ Sono soldi{' '}
        <strong>con una scadenza</strong>: se le prove non partono entro la data, la
        contestazione si perde senza che nessuno decida niente.
      </p>

      {avviso ? <div className="avviso-ok">{avviso}</div> : null}
      {errore ? <div className="avviso-errore">{errore}</div> : null}

      {/* Le scorciatoie di periodo (Libro v1.9 §8-bis): sulla data di apertura
          della contestazione. */}
      <ChipsPeriodo valore={periodo} cambia={setPeriodo} campo="la data di apertura della contestazione" />

      {/* La ricerca (Libro v1.9 §8-bis): come si riconosce una contestazione —
          l'ordine, il negozio, il motivo o il codice della rete. */}
      <div className="barra-ricerca">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cerca per ordine, negozio, motivo o codice…"
          aria-label="Cerca contestazioni"
        />
      </div>

      {!caricato ? (
        <p className="descrizione">Carico…</p>
      ) : visibili.length === 0 ? (
        <p className="colonna-vuota">
          {q.trim() || periodo
            ? 'Nessuna contestazione corrisponde ai filtri.'
            : tutti
              ? 'Nessuna contestazione.'
              : 'Nessuna contestazione aperta. '}
        </p>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="tabella">
            <thead>
              <tr>
                <th>Stato</th>
                <th>Scadenza</th>
                <th>Importo</th>
                <th>Negozio</th>
                <th>Ordine</th>
                <th>Motivo</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visibili.map((c) => {
                const q = quantoManca(c.scadenzaProve)
                return (
                  <tr key={c.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <span
                        className="badge"
                        style={{
                          color: c.stato === 'needs_response' ? 'var(--red)' : undefined,
                          fontWeight: c.stato === 'needs_response' ? 600 : undefined,
                        }}
                      >
                        {NOMI_STATO[c.stato] ?? c.stato}
                      </span>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <span style={{ color: q.urgente ? 'var(--red)' : undefined }}>
                        {c.scadenzaProve
                          ? new Date(c.scadenzaProve).toLocaleDateString('it-IT')
                          : '—'}
                      </span>
                      <div className="cella-sub">{q.testo}</div>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{soldi(c.importo, c.valuta)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{c.negozioNome}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {c.ordineNumero || <span className="cella-sub">fuori dai 60 giorni</span>}
                    </td>
                    <td>
                      {NOMI_MOTIVO[c.motivo] ?? c.motivo}
                      {c.codiceRete ? <div className="cella-sub">codice {c.codiceRete}</div> : null}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {c.stato === 'needs_response' ? (
                        <button className="bottone mini" onClick={() => apri(c)}>
                          Rispondi
                        </button>
                      ) : (
                        <button className="bottone secondario mini" onClick={() => apri(c)}>
                          Guarda
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {aperta ? (
        <div className="velo" onClick={() => setAperta(null)} role="presentation">
          <div className="pannello stretto" onClick={(e) => e.stopPropagation()} role="dialog">
            <div className="pannello-testa">
              <div>
                <h2 style={{ margin: 0, fontSize: 18 }}>
                  {aperta.ordineNumero || 'Ordine fuori dai 60 giorni'} ·{' '}
                  {soldi(aperta.importo, aperta.valuta)}
                </h2>
                <div className="cella-sub">
                  {aperta.negozioNome} · {NOMI_MOTIVO[aperta.motivo] ?? aperta.motivo} ·{' '}
                  {NOMI_STATO[aperta.stato] ?? aperta.stato}
                  {aperta.scadenzaProve
                    ? ` · prove entro il ${new Date(aperta.scadenzaProve).toLocaleDateString('it-IT')}`
                    : ''}
                </div>
              </div>
              {/* ✕ obbligatoria (Libro v1.7 §9): stesso handler del velo. */}
              <button className="pannello-chiudi" aria-label="Chiudi" title="Chiudi" onClick={() => setAperta(null)}>
                ✕
              </button>
            </div>

            {/* ⚠️ Si dice CHE COSA vuole la banca, non «scrivi qualcosa»: la
                risposta a «prodotto mai ricevuto» è la prova della consegna, a
                «frode» sono i dati di chi ha ordinato. Chi scrive senza questa
                riga davanti manda un testo generico, e un testo generico si
                perde. */}
            <p className="descrizione">
              {aperta.motivo === 'product_not_received'
                ? 'La banca chiede la prova che il prodotto sia arrivato: giorno e ora della consegna, chi ha ricevuto, la firma o la foto del valet, i messaggi in cui il cliente conferma.'
                : aperta.motivo === 'fraudulent'
                  ? 'La banca chiede la prova che a ordinare sia stato il titolare della carta: email e telefono usati, corrispondenza, indirizzo di consegna, ordini precedenti dello stesso cliente.'
                  : aperta.motivo === 'product_unacceptable'
                    ? 'La banca chiede la prova che il prodotto fosse conforme: foto del prodotto consegnato, descrizione, eventuali scambi col cliente e la nostra politica di reso.'
                    : 'Racconta i fatti con date e riferimenti: cosa è stato ordinato, cosa è stato consegnato, e cosa si è detto al cliente.'}
            </p>

            {/* ── CHE COSA ABBIAMO IN MANO ──
                ⚠️⚠️ Prima c'era solo «da rispondere, 12 giorni» e un riquadro
                vuoto: per sapere se avevamo qualcosa da opporre bisognava
                cercare ordine, conversazioni e fornitore uno per uno. È il
                motivo per cui dieci contestazioni sono state perse per 2.087,66 €
                con le prove mai partite — non per una decisione, ma perché
                rispondere cominciava con mezz'ora di ricerche. */}
            {prove[aperta.id] ? (
              (() => {
                const v = valutaProve(prove[aperta.id], aperta.motivo)
                return (
                  <div
                    className="riquadro-fornitore"
                    style={{
                      borderColor:
                        v.livello === 'niente'
                          ? 'var(--red)'
                          : v.livello === 'abbiamo'
                            ? 'var(--green)'
                            : undefined,
                    }}
                  >
                    <strong>{v.titolo}</strong>
                    <p className="cella-sub" style={{ margin: '4px 0 8px' }}>
                      {v.spiegazione}
                    </p>
                    {v.punti.length ? (
                      <ul style={{ margin: 0, paddingLeft: 18 }}>
                        {v.punti.map((p) => (
                          <li key={p} className="cella-sub" style={{ marginBottom: 3 }}>
                            {p}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {/* ⚠️ Si COPIANO nella bozza, non ci finiscono da soli: sono
                        fatti presi dai nostri archivi e vanno riletti prima di
                        mandarli a una banca. */}
                    {v.punti.length ? (
                      <button
                        type="button"
                        className="btn btn-secondario small"
                        style={{ marginTop: 8 }}
                        onClick={() =>
                          setTesto((x) => (x ? x + RIGA_VUOTA : '') + v.punti.join(ACAPO))
                        }
                      >
                        Mettili nella bozza
                      </button>
                    ) : null}
                  </div>
                )
              })()
            ) : null}

            {evidenza?.submitted ? (
              <div className="avviso-ok">
                Le prove per questa contestazione risultano <strong>già inviate</strong> a Shopify.
              </div>
            ) : null}

            <label className="campo">
              <span>La nostra risposta alla banca</span>
              <textarea
                rows={12}
                value={testo}
                onChange={(e) => setTesto(e.target.value)}
                placeholder="Consegnato il 12 agosto alle 15:40 in via …, ricevuto da …; il cliente conferma su WhatsApp il 12 agosto alle 16:02…"
              />
            </label>

            {/* L'avvertenza sta PRIMA dei bottoni: il piede è sticky in fondo
                al pannello (Libro v1.7 §9) e dopo di lui non deve flottare
                nulla — e un avviso su un invio definitivo si legge prima. */}
            <p className="descrizione" style={{ marginBottom: 0 }}>
              ⚠️ <strong>L&apos;invio è definitivo</strong>: le prove partono verso la banca e la
              contestazione passa in esame. La bozza invece resta qui e non parte: si scrive, si
              rilegge, e si manda dopo.
            </p>
            {/* Piede sticky (Libro v1.7 §9): «Salva bozza» e l'invio restano
                in vista anche col modulo lungo scorrato. */}
            <div className="pannello-piede">
              <button
                className="bottone secondario"
                onClick={() => salva(false)}
                disabled={salvando || !testo.trim()}
              >
                {salvando ? 'Salvo…' : 'Salva bozza'}
              </button>
              {aperta.stato === 'needs_response' ? (
                <button
                  className="bottone"
                  onClick={() => salva(true)}
                  disabled={salvando || !testo.trim()}
                  title="Manda le prove alla banca: da qui non si torna indietro"
                >
                  Invia le prove alla banca
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
