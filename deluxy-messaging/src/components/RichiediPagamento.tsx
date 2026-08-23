'use client'

import { useCallback, useEffect, useState } from 'react'

// Richiedi pagamento: IBAN e intestatario si inseriscono a mano, oppure si
// fanno leggere all'AI da un messaggio incollato o da un'immagine (schermata
// di chat, foto di un bonifico). L'IBAN viene sempre verificato col checksum.

type Richiesta = {
  id: string
  iban: string
  intestatario: string
  importo: number
  valuta: string
  causale: string
  ibanValido: boolean
  origine: string
  creatoIl: string
  stringa: string
  inviataIl: string | null
  partnerStato: string
  esitoInvio: string
}

const STATI_PARTNER: Record<string, string> = {
  in_attesa: 'in attesa',
  approvata: 'approvata',
  rifiutata: 'rifiutata',
  pagata: 'pagata',
}

const ORIGINI: Record<string, string> = {
  manuale: 'a mano',
  testo: 'da messaggio',
  immagine: 'da immagine',
}

export function RichiediPagamento() {
  const [richieste, setRichieste] = useState<Richiesta[]>([])
  const [caricato, setCaricato] = useState(false)

  // campi del modulo
  const [iban, setIban] = useState('')
  const [intestatario, setIntestatario] = useState('')
  const [importo, setImporto] = useState('')
  const [causale, setCausale] = useState('')
  const [origine, setOrigine] = useState('manuale')

  // lettura AI
  const [testo, setTesto] = useState('')
  const [immagine, setImmagine] = useState<{ dati: string; tipo: string; nome: string } | null>(null)
  const [leggo, setLeggo] = useState(false)

  const [avviso, setAvviso] = useState('')
  const [errore, setErrore] = useState('')
  const [ibanNota, setIbanNota] = useState('')
  const [copiato, setCopiato] = useState('')

  // Arrivando dal bottone "Richiedi pagamento" di un ordine, i campi si
  // precompilano da soli con numero, cliente e importo.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const ordine = p.get('ordine')
    if (!ordine) return
    setCausale(`Ordine ${ordine}`)
    const cliente = p.get('cliente')

    // ⚠️⚠️ CHI VA PAGATO È IL FORNITORE, NON IL CLIENTE.
    //
    // Finora questa pagina si apriva con l'importo del VENDUTO e l'intestatario
    // vuoto: bisognava ricordarsi chi aveva preparato l'ordine — un fatto che
    // non era scritto da nessuna parte — e ricopiarlo a mano insieme alla cifra
    // giusta. Adesso l'ordine sa a chi è stato dato, e la richiesta parte con
    // il nome e con **quanto gli è stato promesso**.
    const fornitore = p.get('fornitore')
    const costo = p.get('costo')
    if (fornitore) setIntestatario(fornitore)
    // ⚠️ Il costo concordato vince sull'importo dell'ordine: quello è quanto ha
    // pagato il cliente, e mandarlo al fornitore vorrebbe dire pagargli il
    // prezzo di vendita. È l'errore che questa riga esiste per impedire.
    if (costo && Number(costo) > 0) setImporto(costo)
    else {
      const imp = p.get('importo')
      if (imp && Number(imp) > 0) setImporto(imp)
    }

    setAvviso(
      fornitore
        ? `Pagamento a ${fornitore}, che ha preparato l'ordine ${ordine}` +
            (cliente ? ` per ${cliente}` : '') +
            (costo && Number(costo) > 0
              ? '.'
              : '. ⚠️ Il costo non era concordato: controlla l’importo prima di mandare.')
        : `Richiesta per l'ordine ${ordine}${cliente ? ` — cliente ${cliente}` : ''}. ` +
            '⚠️ Su quest’ordine non è registrato nessun fornitore: l’importo qui sotto è quello ' +
            'del venduto, non quello da pagare. Registra chi lo prepara dalla scheda dell’ordine.'
    )
  }, [])

  const carica = useCallback(async () => {
    try {
      const res = await fetch('/api/pagamenti')
      if (!res.ok) return
      const d = (await res.json()) as { richieste: Richiesta[] }
      setRichieste(d.richieste)
    } catch {
      // rete assente
    } finally {
      setCaricato(true)
    }
  }, [])

  useEffect(() => {
    carica()
  }, [carica])

  function scegliImmagine(file: File | null) {
    if (!file) {
      setImmagine(null)
      return
    }
    const lettore = new FileReader()
    lettore.onload = () => {
      const risultato = String(lettore.result)
      // data:image/png;base64,XXXX → teniamo solo la parte dopo la virgola
      const dati = risultato.slice(risultato.indexOf(',') + 1)
      setImmagine({ dati, tipo: file.type, nome: file.name })
    }
    lettore.readAsDataURL(file)
  }

  async function leggiConAi() {
    if (!testo.trim() && !immagine) {
      setErrore('Incolla un messaggio o carica un’immagine.')
      return
    }
    setLeggo(true)
    setErrore('')
    setAvviso('')
    setIbanNota('')
    try {
      const res = await fetch('/api/pagamenti/estrai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testo: testo.trim() || undefined,
          immagine: immagine ? { dati: immagine.dati, tipo: immagine.tipo } : undefined,
        }),
      })
      const d = (await res.json().catch(() => ({}))) as {
        dati?: { iban: string; intestatario: string; importo: number; causale: string }
        ibanValido?: boolean
        motivoIban?: string
        stringa?: string
        fornitore?: string
        errore?: string
      }
      if (!res.ok || !d.dati) {
        setErrore(d.errore || 'Lettura non riuscita.')
        return
      }
      // I campi si compilano da soli: restano modificabili prima di salvare.
      setIban(d.dati.iban)
      setIntestatario(d.dati.intestatario)
      setImporto(d.dati.importo ? String(d.dati.importo) : '')
      setCausale(d.dati.causale)
      setOrigine(immagine ? 'immagine' : 'testo')
      setAvviso(
        (d.stringa ? `Letto: ${d.stringa}` : 'Letto.') +
          (d.fornitore ? ` (${d.fornitore})` : '')
      )
      if (!d.ibanValido) {
        setIbanNota(
          d.motivoIban || 'L’IBAN letto non supera la verifica: controllalo prima di usarlo.'
        )
      }
    } catch {
      setErrore('Lettura non riuscita: problema di rete.')
    } finally {
      setLeggo(false)
    }
  }

  async function salva() {
    setErrore('')
    setAvviso('')
    try {
      const res = await fetch('/api/pagamenti', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          iban,
          intestatario,
          importo: Number(importo.replace(',', '.')) || 0,
          causale,
          origine,
        }),
      })
      const d = (await res.json().catch(() => ({}))) as {
        richiesta?: Richiesta
        motivoIban?: string
        invio?: { ok: boolean; messaggio: string } | null
        errore?: string
      }
      if (!res.ok) {
        setErrore(d.errore || 'Salvataggio non riuscito.')
        return
      }
      setAvviso(`Salvata: ${d.richiesta?.stringa ?? ''}`)
      // L'inoltro a Partner può fallire senza far fallire il salvataggio: lo si dice.
      if (d.invio && !d.invio.ok) setErrore(d.invio.messaggio)
      else if (d.invio?.ok) setAvviso(`Salvata e inviata a Partner: ${d.richiesta?.stringa ?? ''}`)
      if (d.motivoIban) setIbanNota(d.motivoIban)
      setIban('')
      setIntestatario('')
      setImporto('')
      setCausale('')
      setTesto('')
      setImmagine(null)
      setOrigine('manuale')
      await carica()
    } catch {
      setErrore('Salvataggio non riuscito: problema di rete.')
    }
  }

  // Rimanda a Partner (idempotente) oppure ne aggiorna lo stato.
  async function versoPartner(id: string, azione: 'invia' | 'stato') {
    setErrore('')
    setAvviso('')
    try {
      const res = await fetch(`/api/pagamenti/${id}/invia`, {
        method: azione === 'invia' ? 'POST' : 'GET',
      })
      const d = (await res.json().catch(() => ({}))) as { stato?: string; errore?: string }
      if (!res.ok) setErrore(d.errore || 'Operazione non riuscita.')
      else setAvviso(azione === 'invia' ? 'Inviata a Partner.' : `Stato: ${d.stato ?? '—'}`)
      await carica()
    } catch {
      setErrore('Operazione non riuscita: problema di rete.')
    }
  }

  async function elimina(id: string) {
    await fetch('/api/pagamenti?id=' + encodeURIComponent(id), { method: 'DELETE' })
    await carica()
  }

  async function copia(testoDaCopiare: string, id: string) {
    try {
      await navigator.clipboard.writeText(testoDaCopiare)
      setCopiato(id)
      setTimeout(() => setCopiato(''), 2500)
    } catch {
      setErrore('Copia non riuscita: copia a mano dal riquadro.')
    }
  }

  return (
    <main>
      <div className="page-head">
        <div>
          <h1 className="page-title">Paga fornitore</h1>
          <p className="page-sub">
            Le coordinate del fornitore <strong>da pagare</strong>. Puoi scriverle a mano oppure
            farle leggere all&apos;AI da un messaggio o da un&apos;immagine: l&apos;IBAN viene
            sempre <strong>verificato</strong> col codice di controllo, e se non torna te lo dico.
            La richiesta parte poi verso Deluxy Partner, che approva e paga — da qui non esce
            denaro.
          </p>
        </div>
      </div>

      {avviso ? <div className="avviso-ok">{avviso}</div> : null}
      {errore ? <div className="avviso-errore">{errore}</div> : null}

      <div className="griglia-impostazioni">
        {/* Lettura AI */}
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Leggi da messaggio o immagine</h2>
          <p className="descrizione">
            Incolla il messaggio del cliente, oppure carica la schermata della chat o la foto del
            bonifico. L&apos;AI compila i campi qui accanto; tu li controlli prima di salvare.
          </p>
          <label className="campo">
            <span>Messaggio</span>
            <textarea
              rows={5}
              value={testo}
              onChange={(e) => setTesto(e.target.value)}
              placeholder="Es: Le lascio l'IBAN IT60 X054 2811 1010 0000 0123 456 intestato a Mario Rossi, sono 150 euro"
            />
          </label>
          <label className="campo">
            <span>Immagine (schermata o foto)</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={(e) => scegliImmagine(e.target.files?.[0] ?? null)}
            />
          </label>
          {immagine ? (
            <p className="descrizione" style={{ marginTop: -6 }}>
              Immagine pronta: <strong>{immagine.nome}</strong>
            </p>
          ) : null}
          <button className="btn" onClick={leggiConAi} disabled={leggo}>
            {leggo ? 'Leggo…' : 'Leggi con l’AI'}
          </button>
        </div>

        {/* Modulo */}
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Coordinate</h2>
          <label className="campo">
            <span>IBAN</span>
            <input
              value={iban}
              onChange={(e) => setIban(e.target.value)}
              placeholder="IT60X0542811101000000123456"
            />
          </label>
          {ibanNota ? <div className="avviso-errore">{ibanNota}</div> : null}
          <label className="campo">
            <span>Intestatario del conto</span>
            <input
              value={intestatario}
              onChange={(e) => setIntestatario(e.target.value)}
              placeholder="Mario Rossi"
            />
          </label>
          <div style={{ display: 'flex', gap: 10 }}>
            <label className="campo" style={{ flex: 1 }}>
              <span>Importo</span>
              <input
                value={importo}
                onChange={(e) => setImporto(e.target.value)}
                placeholder="150,00"
              />
            </label>
            <label className="campo" style={{ flex: 2 }}>
              <span>Causale</span>
              <input
                value={causale}
                onChange={(e) => setCausale(e.target.value)}
                placeholder="Ordine #1042"
              />
            </label>
          </div>
          <button className="btn" onClick={salva} disabled={!iban || !intestatario}>
            Salva la richiesta
          </button>
        </div>
      </div>

      <h2 style={{ fontSize: 17, marginTop: 26 }}>Richieste salvate</h2>
      {!caricato ? (
        <div className="vuoto">Carico…</div>
      ) : richieste.length === 0 ? (
        <div className="vuoto">Nessuna richiesta salvata.</div>
      ) : (
        <div className="tabella-wrap">
          <table>
            <thead>
              <tr>
                <th>IBAN</th>
                <th>Intestatario</th>
                <th className="num">Importo</th>
                <th>Causale</th>
                <th>Origine</th>
                <th>Verifica</th>
                <th>Partner</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {richieste.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12.5 }}>{r.iban}</td>
                  <td className="cella-nome">{r.intestatario}</td>
                  <td className="cella-num">
                    {r.importo
                      ? r.importo.toLocaleString('it-IT', { style: 'currency', currency: r.valuta })
                      : '—'}
                  </td>
                  <td className="cella-muta">{r.causale || '—'}</td>
                  <td className="cella-muta">{ORIGINI[r.origine] ?? r.origine}</td>
                  <td>
                    {r.ibanValido ? (
                      <span className="badge verde">valido</span>
                    ) : (
                      <span className="badge rosso">da controllare</span>
                    )}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {r.inviataIl ? (
                      <span className="badge verde" title={`Inviata il ${new Date(r.inviataIl).toLocaleString('it-IT')}`}>
                        {STATI_PARTNER[r.partnerStato] ?? r.partnerStato ?? 'inviata'}
                      </span>
                    ) : (
                      <span className="badge rosso" title={r.esitoInvio || 'Non ancora inviata'}>
                        non inviata
                      </span>
                    )}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button
                      className="btn btn-secondario small"
                      onClick={() => versoPartner(r.id, r.inviataIl ? 'stato' : 'invia')}
                      title={
                        r.inviataIl
                          ? 'Chiedi a Partner a che punto è'
                          : 'Manda la richiesta a Partner'
                      }
                    >
                      {r.inviataIl ? 'Aggiorna' : 'Invia'}
                    </button>{' '}
                    <button
                      className="btn btn-secondario small"
                      onClick={() => copia(r.stringa, r.id)}
                    >
                      {copiato === r.id ? 'Copiato ✓' : 'Copia'}
                    </button>{' '}
                    <button
                      className="btn btn-secondario small"
                      style={{ color: 'var(--red)' }}
                      onClick={() => elimina(r.id)}
                    >
                      Elimina
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
