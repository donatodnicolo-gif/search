'use client'

import { useCallback, useEffect, useState } from 'react'

type OrdineDto = {
  id: string
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
  contattoSalvato: boolean
  contattoEsito: string
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
  const [negozi, setNegozi] = useState<{ id: string; nome: string }[]>([])
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
        negozi: { id: string; nome: string }[]
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
