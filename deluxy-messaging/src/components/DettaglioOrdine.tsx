'use client'

import { useCallback, useEffect, useState } from 'react'
import { coloreGestione, nomeGestione } from '@/lib/gestione'
import { coloreTipoCliente, nomeTipoCliente } from '@/lib/clienti-tipo'
import { fasciaRitiro, messaggioFornitore } from '@/lib/ritiro'
import { linguaCliente, messaggioCliente, nomeLingua } from '@/lib/lingua'

// Il dettaglio di un ordine, che si apre cliccando la sua scheda.
//
// Serve a una cosa precisa: guardare il prodotto e chiedere al fornitore se è
// fattibile. Per questo la foto è grande, si scarica con un clic, e il messaggio
// («Per mercoledì 29 luglio possibile questo prodotto con ritiro 15-19?») è già
// scritto e si copia — il ritiro è la fascia di consegna meno un'ora, perché il
// valet deve avere il prodotto in mano prima di partire.

type Riga = {
  titolo: string
  variante: string
  sku: string
  quantita: number
  prezzo: number
  proprieta: string[]
  immagine: string
}

type OrdineDettaglio = {
  id: string
  numero: string
  negozioNome: string
  brandRicerca: string
  data: string
  totale: number
  valuta: string
  statoPagamento: string
  clienteNome: string
  telefono: string
  email: string
  indirizzo: string
  citta: string
  paese: string
  dataConsegna: string | null
  fasciaConsegna: string
  statoNome: string
  statoColore: string
  note: string
  gestione: string
  clienteTipo: string
  clienteTipoDa: string
}

function soldi(v: number, valuta: string): string {
  return v.toLocaleString('it-IT', { style: 'currency', currency: valuta || 'EUR' })
}

function dataBreve(iso: string): string {
  return new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** URL della nostra rotta di scarico: il CDN Shopify non si può scaricare diretto. */
function linkScarico(immagine: string, titolo: string): string {
  const p = new URLSearchParams({ url: immagine, nome: titolo })
  return `/api/immagine?${p.toString()}`
}

export function DettaglioOrdine({ ordineId, onChiudi }: { ordineId: string; onChiudi: () => void }) {
  const [ordine, setOrdine] = useState<OrdineDettaglio | null>(null)
  const [righe, setRighe] = useState<Riga[]>([])
  const [righeNota, setRigheNota] = useState('')
  const [caricato, setCaricato] = useState(false)
  const [errore, setErrore] = useState('')
  const [copiato, setCopiato] = useState('')

  const carica = useCallback(async () => {
    try {
      const res = await fetch(`/api/ordini/${ordineId}/dettaglio`)
      const d = (await res.json().catch(() => ({}))) as {
        ordine?: OrdineDettaglio
        righe?: Riga[]
        righeNota?: string
        errore?: string
      }
      if (!res.ok) {
        setErrore(d.errore || 'Dettaglio non disponibile.')
        return
      }
      setOrdine(d.ordine ?? null)
      setRighe(d.righe ?? [])
      setRigheNota(d.righeNota ?? '')
    } catch {
      setErrore('Dettaglio non disponibile: problema di rete.')
    } finally {
      setCaricato(true)
    }
  }, [ordineId])

  useEffect(() => {
    carica()
  }, [carica])

  // Esc chiude: aperto un pannello, è il gesto che tutti provano per primo.
  useEffect(() => {
    const tasto = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onChiudi()
    }
    document.addEventListener('keydown', tasto)
    return () => document.removeEventListener('keydown', tasto)
  }, [onChiudi])

  async function copia(testo: string, quale: string) {
    try {
      await navigator.clipboard.writeText(testo)
      setCopiato(quale)
      setTimeout(() => setCopiato(''), 2500)
    } catch {
      setErrore('Copia non riuscita: seleziona il testo e copialo a mano.')
    }
  }

  const msg = ordine ? messaggioFornitore(ordine.dataConsegna, ordine.fasciaConsegna) : null
  const ritiro = ordine ? fasciaRitiro(ordine.fasciaConsegna) : null
  const lingua = ordine ? linguaCliente(ordine.paese, ordine.telefono, ordine.email) : null

  return (
    <div className="velo" onClick={onChiudi} role="presentation">
      {/* Il clic dentro il pannello non deve chiuderlo. */}
      <div
        className="pannello"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Ordine ${ordine?.numero ?? ''}`}
      >
        <div className="pannello-testa">
          <div>
            <h2 style={{ margin: 0, fontSize: 20 }}>{ordine?.numero || 'Ordine'}</h2>
            <div className="cella-sub">
              {ordine ? `${ordine.negozioNome} · ordine ${dataBreve(ordine.data)}` : ''}
            </div>
          </div>
          <button className="btn btn-secondario small" onClick={onChiudi}>
            Chiudi
          </button>
        </div>

        {errore ? <div className="avviso-errore">{errore}</div> : null}
        {!caricato ? <p style={{ color: 'var(--text-secondary)' }}>Carico…</p> : null}

        {ordine ? (
          <>
            {/* IL FORM RAPIDO: foto + messaggio da mandare al fornitore. */}
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ marginTop: 0, fontSize: 15 }}>Chiedi al fornitore</h3>

              {righeNota ? <div className="avviso-errore">{righeNota}</div> : null}

              {righe.length === 0 && !righeNota && caricato ? (
                <p className="descrizione">Nessun prodotto sull&apos;ordine.</p>
              ) : null}

              <div className="prodotti">
                {righe.map((r, i) => (
                  <div className="prodotto" key={`${r.sku}-${i}`}>
                    {r.immagine ? (
                      // <img> e non next/image: l'URL è del CDN Shopify e non
                      // vogliamo dichiarare domini remoti solo per una miniatura.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.immagine} alt={r.titolo} className="prodotto-foto" />
                    ) : (
                      <div className="prodotto-foto vuota">nessuna foto</div>
                    )}
                    <div className="prodotto-dati">
                      <div className="cella-nome">{r.titolo || '—'}</div>
                      <div className="cella-sub">
                        {r.quantita > 1 ? `${r.quantita} × ` : ''}
                        {soldi(r.prezzo, ordine.valuta)}
                        {r.variante ? ` · ${r.variante}` : ''}
                      </div>
                      {/* Le personalizzazioni del cliente: chi prepara le deve vedere. */}
                      {r.proprieta.length ? (
                        <ul className="prodotto-prop">
                          {r.proprieta.map((p, k) => (
                            <li key={k}>{p}</li>
                          ))}
                        </ul>
                      ) : null}
                      {r.immagine ? (
                        <a
                          className="btn btn-secondario small"
                          href={linkScarico(r.immagine, r.titolo)}
                          style={{ marginTop: 6, display: 'inline-block' }}
                        >
                          Scarica foto
                        </a>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>

              {/* Il messaggio pronto. */}
              <label className="campo" style={{ marginTop: 14 }}>
                <span>Messaggio per il fornitore</span>
                <textarea rows={2} readOnly value={msg?.testo ?? ''} />
              </label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <button className="btn" onClick={() => copia(msg?.testo ?? '', 'msg')}>
                  {copiato === 'msg' ? 'Copiato ✓' : 'Copia messaggio'}
                </button>
                {ordine.brandRicerca ? (
                  <a
                    className="btn btn-secondario"
                    href={`https://search-deluxy.vercel.app/?brand=${encodeURIComponent(ordine.brandRicerca)}&ordine=${encodeURIComponent(ordine.numero.replace(/^#/, ''))}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Cerca fornitore ↗
                  </a>
                ) : null}
              </div>
              <p className="descrizione" style={{ marginBottom: 0 }}>
                {ritiro ? (
                  <>
                    Il ritiro è <strong>{ritiro}</strong>, un&apos;ora prima della consegna (
                    {ordine.fasciaConsegna}): il valet deve avere il prodotto prima di partire.
                  </>
                ) : msg?.mancante === 'fascia' || msg?.mancante === 'entrambe' ? (
                  <>
                    Non c&apos;è una fascia di consegna in forma <em>ore-ore</em>, quindi il ritiro
                    resta <strong>da concordare</strong>: meglio che un orario inventato.
                  </>
                ) : null}
                {msg?.mancante === 'data' || msg?.mancante === 'entrambe' ? (
                  <>
                    {' '}
                    Manca anche la <strong>data di consegna</strong>: completala prima di mandarlo.
                  </>
                ) : null}
              </p>
            </div>

            {/* I dati dell'ordine. */}
            <div className="card">
              <h3 style={{ marginTop: 0, fontSize: 15 }}>Ordine</h3>
              <dl className="coppie">
                <dt>Cliente</dt>
                <dd>
                  {ordine.clienteNome || '—'}
                  {ordine.clienteTipo ? (
                    <span
                      className="badge"
                      style={{ color: coloreTipoCliente(ordine.clienteTipo), marginLeft: 8 }}
                    >
                      {nomeTipoCliente(ordine.clienteTipo)}
                    </span>
                  ) : null}
                </dd>
                <dt>Recapiti</dt>
                <dd>
                  {ordine.telefono || '—'}
                  {ordine.email ? ` · ${ordine.email}` : ''}
                  {lingua ? (
                    <div className="cella-sub">
                      gli si scrive in <strong>{nomeLingua(lingua.lingua)}</strong>
                    </div>
                  ) : null}
                </dd>
                <dt>Consegna</dt>
                <dd>
                  {ordine.dataConsegna
                    ? new Date(ordine.dataConsegna).toLocaleDateString('it-IT', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                      })
                    : 'non indicata'}
                  {ordine.fasciaConsegna ? ` · ${ordine.fasciaConsegna}` : ''}
                </dd>
                <dt>Indirizzo</dt>
                <dd>
                  {ordine.indirizzo || '—'}
                  {ordine.citta ? `, ${ordine.citta}` : ''}
                  {ordine.paese ? ` (${ordine.paese})` : ''}
                </dd>
                <dt>Totale</dt>
                <dd>
                  {soldi(ordine.totale, ordine.valuta)}
                  {ordine.statoPagamento ? (
                    <span className="cella-sub"> · {ordine.statoPagamento}</span>
                  ) : null}
                </dd>
                <dt>Lavorazione</dt>
                <dd>
                  <span className="badge" style={{ color: coloreGestione(ordine.gestione) }}>
                    {nomeGestione(ordine.gestione)}
                  </span>
                  {ordine.statoNome ? (
                    <span className="badge" style={{ marginLeft: 6 }}>
                      {ordine.statoNome}
                    </span>
                  ) : null}
                </dd>
                {ordine.note ? (
                  <>
                    <dt>Note</dt>
                    <dd style={{ whiteSpace: 'pre-wrap' }}>{ordine.note}</dd>
                  </>
                ) : null}
              </dl>

              {/* Le stesse azioni della scheda, a portata di mano. */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                <a className="btn btn-secondario small" href={`/reclami?ordineId=${ordine.id}&ordine=${encodeURIComponent(ordine.numero)}&cliente=${encodeURIComponent(ordine.clienteNome)}&telefono=${encodeURIComponent(ordine.telefono)}&email=${encodeURIComponent(ordine.email)}&negozio=${encodeURIComponent(ordine.negozioNome)}`}>
                  Apri reclamo
                </a>
                <a className="btn btn-secondario small" href={`/rimborsi?ordineId=${ordine.id}&ordine=${encodeURIComponent(ordine.numero)}&cliente=${encodeURIComponent(ordine.clienteNome)}&totale=${ordine.totale}&pagamento=${encodeURIComponent(ordine.statoPagamento)}&negozio=${encodeURIComponent(ordine.negozioNome)}`}>
                  Chiedi rimborso
                </a>
                {lingua && (ordine.telefono || ordine.email) ? (
                  <a
                    className="btn btn-secondario small"
                    target="_blank"
                    rel="noopener noreferrer"
                    href={
                      ordine.telefono.replace(/[^\d]/g, '').length >= 8
                        ? `https://wa.me/${ordine.telefono.replace(/[^\d]/g, '')}?text=${encodeURIComponent(messaggioCliente(lingua.lingua, ordine.clienteNome, ordine.numero))}`
                        : `mailto:${ordine.email}?body=${encodeURIComponent(messaggioCliente(lingua.lingua, ordine.clienteNome, ordine.numero))}`
                    }
                  >
                    Contatta cliente
                  </a>
                ) : null}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
