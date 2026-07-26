'use client'

import { useCallback, useEffect, useState } from 'react'

type OrdineDto = {
  id: string
  negozioId: string
  negozioNome: string
  numero: string
  data: string
  totale: number
  valuta: string
  statoPagamento: string
  clienteNome: string
  telefono: string
  email: string
  indirizzo: string
  citta: string
  contattoSalvato: boolean
  contattoEsito: string
}

type NegozioDto = {
  id: string
  nome: string
  brandRicerca: string
  conteggio: number
  valore: number
}

type OrdineArchivio = {
  id: string
  brand: string
  brandRicerca: string
  numero: string
  data: string
  totale: number
  valuta: string
  clienteNome: string
  telefono: string
  email: string
  citta: string
}

/** Link semplice all'app Ricerca fornitori (ripiego, senza accesso automatico). */
function linkFornitoreSemplice(brandRicerca: string, numero: string): string {
  const p = new URLSearchParams({ brand: brandRicerca, ordine: numero.replace(/^#/, '').trim() })
  return `https://search-deluxy.vercel.app/?${p}`
}

/**
 * Apre Ricerca fornitori sull'ordine. La scheda si apre SUBITO (altrimenti il
 * browser la blocca come popup) e poi ci portiamo dentro il link firmato che
 * chiediamo al nostro server.
 */
async function apriFornitore(brandRicerca: string, numero: string) {
  const scheda = window.open('about:blank', '_blank', 'noopener,noreferrer')
  const ripiego = linkFornitoreSemplice(brandRicerca, numero)
  try {
    const p = new URLSearchParams({ brand: brandRicerca, ordine: numero })
    const res = await fetch('/api/fornitore/link?' + p.toString())
    const d = (await res.json()) as { url?: string }
    const url = d.url || ripiego
    if (scheda) scheda.location.href = url
    else window.open(url, '_blank', 'noopener,noreferrer')
  } catch {
    if (scheda) scheda.location.href = ripiego
    else window.open(ripiego, '_blank', 'noopener,noreferrer')
  }
}

function soldi(v: number, valuta: string): string {
  return v.toLocaleString('it-IT', { style: 'currency', currency: valuta || 'EUR' })
}

type EsitoContatti = {
  collegato?: boolean
  aggiunti?: number
  aggiornati?: number
  presenti?: number
  errori?: number
  rimasti?: number
  errore?: string
}

function dataBreve(iso: string): string {
  return new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Frase leggibile sull'esito del salvataggio automatico dei contatti. */
function riepilogoContatti(c: EsitoContatti | undefined): string {
  if (!c) return ''
  if (c.errore) return ` Contatti non salvati: ${c.errore}`
  if (!c.collegato) return ' Contatti non salvati: Google non è collegato.'
  const parti: string[] = []
  if (c.aggiunti) parti.push(`${c.aggiunti} aggiunti`)
  if (c.aggiornati) parti.push(`${c.aggiornati} aggiornati`)
  if (c.presenti) parti.push(`${c.presenti} già in rubrica`)
  if (c.errori) parti.push(`${c.errori} errori`)
  if (!parti.length) return ' Nessun contatto nuovo da salvare.'
  const coda = c.rimasti ? ` — ne restano ${c.rimasti}, ripremi per continuare.` : ''
  return ` Contatti: ${parti.join(', ')}.${coda}`
}

export function OrdiniLista() {
  const [ordini, setOrdini] = useState<OrdineDto[]>([])
  const [negozi, setNegozi] = useState<NegozioDto[]>([])
  // Vista: colonne per brand (come Deluxy Orders) o elenco in tabella.
  const [vista, setVista] = useState<'colonne' | 'elenco'>('colonne')
  const [totale, setTotale] = useState(0)
  const [googleCollegato, setGoogleCollegato] = useState(false)
  const [caricato, setCaricato] = useState(false)
  const [occupato, setOccupato] = useState('') // 'sync' | 'tutti' | id ordine
  const [avviso, setAvviso] = useState('')
  const [errore, setErrore] = useState('')

  // Ricerca e filtri (la ricerca vera avviene sul server: cerca su TUTTI gli
  // ordini, non solo quelli già in pagina).
  const [q, setQ] = useState('')
  const [qCercata, setQCercata] = useState('') // `q` ritardata, per non chiamare a ogni tasto
  const [negozio, setNegozio] = useState('')
  const [filtroContatto, setFiltroContatto] = useState('')

  const carica = useCallback(async () => {
    try {
      const p = new URLSearchParams()
      if (qCercata) p.set('q', qCercata)
      if (negozio) p.set('negozio', negozio)
      if (filtroContatto) p.set('contatto', filtroContatto)
      const res = await fetch('/api/ordini?' + p.toString())
      if (!res.ok) return
      const dati = (await res.json()) as {
        ordini: OrdineDto[]
        totale: number
        negozi: NegozioDto[]
        googleCollegato: boolean
      }
      setOrdini(dati.ordini)
      setTotale(dati.totale)
      setNegozi(dati.negozi)
      setGoogleCollegato(dati.googleCollegato)
    } catch {
      // rete assente
    } finally {
      setCaricato(true)
    }
  }, [qCercata, negozio, filtroContatto])

  // Aspetta che l'utente smetta di digitare prima di interrogare il server.
  useEffect(() => {
    const t = setTimeout(() => setQCercata(q.trim()), 300)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    carica()
  }, [carica])

  // Archivio storico (app Deluxy Orders): interrogato solo quando si cerca.
  const [archivio, setArchivio] = useState<OrdineArchivio[]>([])
  const [archivioTotale, setArchivioTotale] = useState(0)
  const [archivioNota, setArchivioNota] = useState('')

  useEffect(() => {
    if (!qCercata) {
      setArchivio([])
      setArchivioTotale(0)
      setArchivioNota('')
      return
    }
    let annullato = false
    ;(async () => {
      try {
        const res = await fetch('/api/ordini/archivio?q=' + encodeURIComponent(qCercata))
        const d = (await res.json()) as {
          stato: string
          totale?: number
          ordini?: OrdineArchivio[]
          messaggio?: string
        }
        if (annullato) return
        if (d.stato === 'ok') {
          setArchivio(d.ordini ?? [])
          setArchivioTotale(d.totale ?? 0)
          setArchivioNota('')
        } else {
          setArchivio([])
          setArchivioTotale(0)
          setArchivioNota(
            d.stato === 'non-configurato'
              ? '' // niente rumore finché la chiave non è impostata
              : d.messaggio || 'Archivio non raggiungibile.'
          )
        }
      } catch {
        if (!annullato) setArchivioNota('Archivio non raggiungibile.')
      }
    })()
    return () => {
      annullato = true
    }
  }, [qCercata])

  const filtriAttivi = !!(qCercata || negozio || filtroContatto)

  async function scarica() {
    setOccupato('sync')
    setAvviso('')
    setErrore('')
    try {
      const res = await fetch('/api/ordini/sync', { method: 'POST' })
      const dati = (await res.json().catch(() => ({}))) as {
        scaricati?: number
        nuovi?: number
        errore?: string
        risultati?: { negozio: string; ok: boolean; scaricati: number; errore: string }[]
        contatti?: EsitoContatti
      }
      if (!res.ok) {
        setErrore(dati.errore || 'Scarico non riuscito.')
      } else {
        setAvviso(
          `Scaricati ${dati.scaricati ?? 0} ordini (${dati.nuovi ?? 0} nuovi).` +
            riepilogoContatti(dati.contatti)
        )
        // Se qualche negozio è andato in errore, lo mostriamo negozio per negozio.
        const falliti = (dati.risultati ?? []).filter((r) => !r.ok)
        if (falliti.length) {
          setErrore(falliti.map((r) => `${r.negozio}: ${r.errore}`).join(' — '))
        }
      }
      await carica()
    } catch {
      setErrore('Scarico non riuscito: problema di rete.')
    } finally {
      setOccupato('')
    }
  }

  async function salvaContatto(id: string) {
    setOccupato(id)
    setErrore('')
    try {
      const res = await fetch(`/api/ordini/${id}/contatto`, { method: 'POST' })
      const dati = (await res.json().catch(() => ({}))) as { errore?: string }
      if (!res.ok) setErrore(dati.errore || 'Salvataggio non riuscito.')
      await carica()
    } catch {
      setErrore('Salvataggio non riuscito: problema di rete.')
    } finally {
      setOccupato('')
    }
  }

  async function salvaTutti() {
    setOccupato('tutti')
    setAvviso('')
    setErrore('')
    try {
      const res = await fetch('/api/ordini/contatti-tutti', { method: 'POST' })
      const dati = (await res.json().catch(() => ({}))) as EsitoContatti
      if (!res.ok) setErrore(dati.errore || 'Operazione non riuscita.')
      else setAvviso(riepilogoContatti(dati).trim())
      await carica()
    } catch {
      setErrore('Operazione non riuscita: problema di rete.')
    } finally {
      setOccupato('')
    }
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, flex: 1 }}>Ordini</h1>
        <button className="bottone secondario" onClick={scarica} disabled={!!occupato}>
          {occupato === 'sync' ? 'Scarico…' : 'Scarica da Shopify'}
        </button>
        <button
          className="bottone"
          onClick={salvaTutti}
          disabled={!!occupato || !googleCollegato}
          title={googleCollegato ? '' : 'Collega Google Contacts nelle Impostazioni'}
        >
          {occupato === 'tutti' ? 'Salvo…' : 'Salva tutti i contatti'}
        </button>
      </div>

      <div className="barra-ricerca">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cerca per numero ordine, cliente, telefono, email o indirizzo…"
          aria-label="Cerca ordini"
        />
        <select value={negozio} onChange={(e) => setNegozio(e.target.value)} aria-label="Negozio">
          <option value="">Tutti i negozi</option>
          {negozi.map((n) => (
            <option key={n.id} value={n.id}>
              {n.nome}
            </option>
          ))}
        </select>
        <select
          value={filtroContatto}
          onChange={(e) => setFiltroContatto(e.target.value)}
          aria-label="Stato contatto"
        >
          <option value="">Contatto: tutti</option>
          <option value="no">Da salvare</option>
          <option value="si">Salvati</option>
        </select>
        {filtriAttivi ? (
          <button
            className="bottone secondario"
            onClick={() => {
              setQ('')
              setNegozio('')
              setFiltroContatto('')
            }}
          >
            Azzera
          </button>
        ) : null}
        <button
          className="bottone secondario"
          onClick={() => setVista(vista === 'colonne' ? 'elenco' : 'colonne')}
          title="Cambia vista"
        >
          {vista === 'colonne' ? 'Elenco' : 'Colonne'}
        </button>
      </div>

      {caricato && filtriAttivi ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '0 0 12px' }}>
          {totale === 0
            ? 'Nessun ordine corrisponde alla ricerca.'
            : `${totale} ${totale === 1 ? 'ordine trovato' : 'ordini trovati'}` +
              (totale > ordini.length ? ` — mostrati i ${ordini.length} più recenti` : '')}
        </p>
      ) : null}

      {!googleCollegato && caricato ? (
        <div className="avviso-errore">
          Google Contacts non è collegato: vai in Impostazioni → Google Contacts per collegarlo.
        </div>
      ) : null}
      {avviso ? <div className="avviso-ok">{avviso}</div> : null}
      {errore ? <div className="avviso-errore">{errore}</div> : null}

      {!caricato ? (
        <p style={{ color: 'var(--text-secondary)' }}>Carico…</p>
      ) : ordini.length === 0 ? (
        <div className="card">
          {filtriAttivi ? (
            <>
              Nessun ordine corrisponde ai filtri. Prova con un altro testo o premi{' '}
              <strong>Azzera</strong>.
            </>
          ) : (
            <>
              Nessun ordine ancora. Premi <strong>Scarica da Shopify</strong> per portare qui gli
              ordini recenti.
            </>
          )}
        </div>
      ) : vista === 'colonne' ? (
        <div className="colonne-brand">
          {negozi
            .filter((n) => !negozio || n.id === negozio)
            .map((n) => {
              const suoi = ordini.filter((o) => o.negozioId === n.id)
              return (
                <div className="colonna" key={n.id}>
                  <div className="colonna-testata">
                    <span className="pallino" aria-hidden="true" />
                    <span className="nome">{n.nome}</span>
                    <span className="conteggio">{n.conteggio.toLocaleString('it-IT')}</span>
                  </div>
                  <div className="colonna-valore">{soldi(n.valore, 'EUR')}</div>

                  {suoi.length === 0 ? (
                    <p className="colonna-vuota">Nessun ordine.</p>
                  ) : (
                    suoi.map((o) => (
                      <div className="scheda-ordine" key={o.id}>
                        <div className="riga-alta">
                          <span className="numero">{o.numero}</span>
                          <span className="importo">{soldi(o.totale, o.valuta)}</span>
                        </div>
                        <div className="cliente">
                          {o.clienteNome || '—'}
                          {o.citta ? ` · ${o.citta}` : ''}
                        </div>
                        <div className="riga-bassa">
                          <span className="quando">ordine {dataBreve(o.data)}</span>
                          {o.contattoSalvato ? (
                            <span className="badge verde" title={o.contattoEsito}>
                              in rubrica
                            </span>
                          ) : (
                            <button
                              className="bottone secondario mini"
                              onClick={() => salvaContatto(o.id)}
                              disabled={!!occupato || !googleCollegato || (!o.telefono && !o.email)}
                              title={
                                !o.telefono && !o.email
                                  ? 'Ordine senza telefono né email'
                                  : googleCollegato
                                    ? 'Salva il contatto in rubrica'
                                    : 'Collega Google Contacts nelle Impostazioni'
                              }
                            >
                              {occupato === o.id ? 'Salvo…' : 'Contatto'}
                            </button>
                          )}
                          {/* Bottone rapido: apre Ricerca fornitori sull'ordine */}
                          {n.brandRicerca ? (
                            <button
                              className="bottone secondario mini"
                              onClick={() => apriFornitore(n.brandRicerca, o.numero)}
                              title={`Cerca il fornitore per ${o.numero} su Ricerca fornitori`}
                            >
                              Fornitore ↗
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )
            })}
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="tabella">
            <thead>
              <tr>
                <th>Ordine</th>
                <th>Negozio</th>
                <th>Data</th>
                <th>Cliente</th>
                <th>Telefono</th>
                <th style={{ textAlign: 'right' }}>Totale</th>
                <th>Contatto</th>
                <th>Fornitore</th>
              </tr>
            </thead>
            <tbody>
              {ordini.map((o) => (
                <tr key={o.id}>
                  <td>{o.numero}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{o.negozioNome || '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{dataBreve(o.data)}</td>
                  <td>{o.clienteNome || '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{o.telefono || '—'}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {o.totale.toLocaleString('it-IT', { style: 'currency', currency: o.valuta })}
                  </td>
                  <td>
                    {o.contattoSalvato ? (
                      <span className="badge verde" title={o.contattoEsito}>
                        {o.contattoEsito?.replace(/^(Aggiunto|Aggiornato|Già in rubrica): /, '') ||
                          'salvato'}
                      </span>
                    ) : (
                      <button
                        className="bottone secondario"
                        style={{ padding: '4px 12px', fontSize: 13 }}
                        onClick={() => salvaContatto(o.id)}
                        disabled={!!occupato || !googleCollegato || (!o.telefono && !o.email)}
                        title={
                          !o.telefono && !o.email
                            ? 'Ordine senza telefono né email'
                            : googleCollegato
                              ? ''
                              : 'Collega Google Contacts nelle Impostazioni'
                        }
                      >
                        {occupato === o.id ? 'Salvo…' : 'Salva contatto'}
                      </button>
                    )}
                  </td>
                  <td>
                    {(() => {
                      const brand = negozi.find((n) => n.id === o.negozioId)?.brandRicerca
                      return brand ? (
                        <button
                          className="bottone secondario mini"
                          onClick={() => apriFornitore(brand, o.numero)}
                          title={`Cerca il fornitore per ${o.numero}`}
                        >
                          Cerca ↗
                        </button>
                      ) : (
                        <span style={{ color: 'var(--text-tertiary)' }}>—</span>
                      )
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Ordini storici: vivono nell'app Ordini, qui si cercano soltanto. */}
      {qCercata && (archivio.length > 0 || archivioNota) ? (
        <div style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 17, marginBottom: 4 }}>Archivio storico</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 0 }}>
            {archivioNota
              ? archivioNota
              : `${archivioTotale.toLocaleString('it-IT')} ordini nell'app Ordini` +
                (archivioTotale > archivio.length ? ` — mostrati i primi ${archivio.length}` : '') +
                '. Qui trovi anche gli ordini più vecchi di quelli scaricati da Shopify.'}
          </p>
          {archivio.length > 0 ? (
            <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
              <table className="tabella">
                <thead>
                  <tr>
                    <th>Ordine</th>
                    <th>Brand</th>
                    <th>Data</th>
                    <th>Cliente</th>
                    <th>Telefono</th>
                    <th style={{ textAlign: 'right' }}>Totale</th>
                    <th>Fornitore</th>
                  </tr>
                </thead>
                <tbody>
                  {archivio.map((o) => (
                    <tr key={o.id}>
                      <td>{o.numero}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{o.brand}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{dataBreve(o.data)}</td>
                      <td>
                        {o.clienteNome || '—'}
                        {o.citta ? ` · ${o.citta}` : ''}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>{o.telefono || '—'}</td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {soldi(o.totale, o.valuta)}
                      </td>
                      <td>
                        <button
                          className="bottone secondario mini"
                          onClick={() => apriFornitore(o.brandRicerca || o.brand, o.numero)}
                          title={`Cerca il fornitore per ${o.numero}`}
                        >
                          Cerca ↗
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  )
}
