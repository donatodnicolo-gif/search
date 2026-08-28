'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

// Stessa grafica della pagina Clienti di Deluxy Orders (page-head, KPI, ricerca
// a pillola, pillole di ordinamento, tabella): le due app sono gemelle e
// devono somigliarsi.

type ClienteDto = {
  chiave: string
  nome: string
  telefono: string
  email: string
  citta: string
  negozi: string[]
  ordini: number
  speso: number
  ultimoNumero: string
  ultimaData: string
  inRubrica: boolean
  uniti: { telefono: string; email: string; nome: string }[]
  assorbite: number
  doppione: '' | 'email' | 'nome'
}

const ORDINAMENTI = [
  { chiave: 'speso', nome: 'Più spesa' },
  { chiave: 'ordini', nome: 'Più ordini' },
  { chiave: 'recenti', nome: 'Più recenti' },
  { chiave: 'nome', nome: 'Nome' },
]

function dataBreve(iso: string): string {
  return new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: '2-digit' })
}

function euro(v: number): string {
  return v.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })
}

export function ClientiLista() {
  const router = useRouter()
  const [clienti, setClienti] = useState<ClienteDto[]>([])
  const [totale, setTotale] = useState(0)
  const [inRubrica, setInRubrica] = useState(0)
  const [spesoTotale, setSpesoTotale] = useState(0)
  const [googleCollegato, setGoogleCollegato] = useState(false)
  const [caricato, setCaricato] = useState(false)
  const [q, setQ] = useState('')
  const [qCercata, setQCercata] = useState('')
  const [ordina, setOrdina] = useState('recenti')
  const [soloDaSalvare, setSoloDaSalvare] = useState(false)
  const [soloDoppioni, setSoloDoppioni] = useState(false)
  const [occupato, setOccupato] = useState(false)
  const [avviso, setAvviso] = useState('')
  const [errore, setErrore] = useState('')
  // Le righe spuntate per l'unione. Restano fra un caricamento e l'altro finché
  // l'unione non è fatta: si sceglie il primo, si cerca il secondo, e una
  // selezione che si azzera durante la ricerca renderebbe il gesto impossibile.
  const [scelti, setScelti] = useState<string[]>([])
  // Le righe unite in questa sessione: restano a schermo anche se il filtro
  // «Possibili doppioni» le escluderebbe — appena unite non sono più doppioni,
  // e vederle sparire subito dopo averle unite sembra di averle perse.
  const [appenaUniti, setAppenaUniti] = useState<string[]>([])
  // Quale riga sta lavorando, e com'è andata: il riscontro va dove si è
  // cliccato, non solo in cima alla pagina.
  const [rigaOccupata, setRigaOccupata] = useState('')
  const [esitoRiga, setEsitoRiga] = useState<{ chiave: string; testo: string } | null>(null)

  const carica = useCallback(async () => {
    try {
      const p = new URLSearchParams()
      if (qCercata) p.set('q', qCercata)
      if (soloDaSalvare) p.set('rubrica', 'no')
      if (soloDoppioni) p.set('doppioni', 'si')
      if (appenaUniti.length) p.set('tieni', appenaUniti.join(','))
      p.set('ordina', ordina)
      const res = await fetch('/api/clienti?' + p.toString())
      if (!res.ok) return
      const d = (await res.json()) as {
        clienti: ClienteDto[]
        totale: number
        inRubrica: number
        spesoTotale: number
        googleCollegato: boolean
      }
      setClienti(d.clienti)
      setTotale(d.totale)
      setInRubrica(d.inRubrica)
      setSpesoTotale(d.spesoTotale)
      setGoogleCollegato(d.googleCollegato)
    } catch {
      // rete assente
    } finally {
      setCaricato(true)
    }
  }, [qCercata, soloDaSalvare, soloDoppioni, ordina, appenaUniti])

  useEffect(() => {
    const t = setTimeout(() => setQCercata(q.trim()), 300)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    carica()
  }, [carica])

  async function salvaTuttiInRubrica() {
    setOccupato(true)
    setAvviso('')
    setErrore('')
    try {
      const res = await fetch('/api/ordini/contatti-tutti', { method: 'POST' })
      const d = (await res.json().catch(() => ({}))) as {
        aggiunti?: number
        aggiornati?: number
        presenti?: number
        rimasti?: number
        errore?: string
      }
      if (!res.ok) setErrore(d.errore || 'Operazione non riuscita.')
      else
        setAvviso(
          `Rubrica: ${d.aggiunti ?? 0} aggiunti, ${d.aggiornati ?? 0} aggiornati, ${d.presenti ?? 0} già presenti` +
            (d.rimasti ? ` — ne restano ${d.rimasti}, ripremi per continuare.` : '.')
        )
      await carica()
    } catch {
      setErrore('Operazione non riuscita: problema di rete.')
    } finally {
      setOccupato(false)
    }
  }

  function spunta(chiave: string) {
    setScelti((p) => (p.includes(chiave) ? p.filter((k) => k !== chiave) : [...p, chiave]))
  }

  // I selezionati, nell'ordine in cui compaiono nell'elenco.
  //
  // ⚠️ Da qui nasce la NUMERAZIONE, e non è cosmetica: gli omonimi sono
  // esattamente il caso in cui si usa questa funzione, quindi i bottoni «Tieni
  // Adhiraj singh rathore» e «Tieni Adhiraj singh rathore» erano identici e
  // sceglierne uno era tirare a sorte. Il numero compare sulla riga e sul
  // bottone: è l'unica cosa che li distingue davvero.
  const selezionati = clienti.filter((c) => scelti.includes(c.chiave))

  /** Il numero d'ordine di una riga fra le selezionate; 0 se non è selezionata. */
  const numeroScelta = (chiave: string) =>
    selezionati.findIndex((c) => c.chiave === chiave) + 1

  /** «2», oppure «2 e 3»: le righe che spariscono tenendo la numero `i + 1`. */
  const numeriDaTogliere = (i: number) => {
    const altri = selezionati.map((_, j) => j + 1).filter((n) => n !== i + 1)
    return altri.length > 1
      ? `${altri.slice(0, -1).join(', ')} e ${altri[altri.length - 1]}`
      : String(altri[0] ?? '')
  }

  /**
   * Unisce i selezionati in `principale`.
   *
   * ⚠️ La riga principale non è un dettaglio: il suo telefono e la sua email
   * restano quelli «buoni» del cliente, ed è a quelli che si scrive.
   */
  async function unisci(principale: string) {
    setOccupato(true)
    setAvviso('')
    setErrore('')
    try {
      const res = await fetch('/api/clienti/unisci', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chiavi: scelti, principale }),
      })
      const d = (await res.json().catch(() => ({}))) as { uniti?: number; errore?: string }
      if (!res.ok) {
        setErrore(d.errore || 'Unione non riuscita.')
        return
      }
      setAvviso(
        `Uniti: ${(d.uniti ?? 0) + 1} clienti ora sono uno solo` +
          (soloDoppioni ? ' — non è più un doppione, ma resta qui sotto.' : '.')
      )
      setScelti([])
      // Basta segnarla: cambia le dipendenze di `carica`, che riparte da sola
      // coi parametri nuovi. Ricaricare anche qui la farebbe sparire per un
      // istante, che è proprio la cosa che stiamo evitando.
      setAppenaUniti((p) => [...new Set([...p, principale])])
    } catch {
      setErrore('Unione non riuscita: problema di rete.')
    } finally {
      setOccupato(false)
    }
  }

  async function separa(chiave: string) {
    setOccupato(true)
    setAvviso('')
    setErrore('')
    try {
      const res = await fetch('/api/clienti/unisci?chiave=' + encodeURIComponent(chiave), {
        method: 'DELETE',
      })
      if (!res.ok) setErrore('Non sono riuscito a separarli.')
      else setAvviso('Separati: tornano righe distinte.')
      await carica()
    } catch {
      setErrore('Operazione non riuscita: problema di rete.')
    } finally {
      setOccupato(false)
    }
  }

  /** Porta il cliente unito in rubrica Google come UN contatto con tutti i recapiti. */
  async function allineaGoogle(chiave: string) {
    setOccupato(true)
    setAvviso('')
    setErrore('')
    // ⚠️ L'esito si scrive ANCHE sulla riga, non solo in cima alla pagina: con
    // 800 clienti si clicca a metà elenco, e un avviso comparso in testa —
    // fuori schermo — si legge come «non fa niente».
    setRigaOccupata(chiave)
    setEsitoRiga(null)
    try {
      const res = await fetch('/api/clienti/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chiave }),
      })
      const d = (await res.json().catch(() => ({}))) as {
        esito?: string
        doppioni?: string[]
        errore?: string
      }
      if (!res.ok) {
        setErrore(d.errore || 'Rubrica non aggiornata.')
        setEsitoRiga({ chiave, testo: d.errore || 'Non riuscito.' })
        return
      }
      // I doppioni rimasti si dicono per nome: è l'elenco che serve per finire
      // il lavoro dentro Google, dove la fusione va fatta a mano.
      const testo =
        (d.esito ?? '') +
        (d.doppioni?.length
          ? ` In rubrica restano i contatti ${d.doppioni.join(', ')}: Google non ha un comando per fondere i contatti da fuori, si fa da contacts.google.com → «Unisci e correggi».`
          : '')
      setAvviso(testo)
      setEsitoRiga({ chiave, testo })
      await carica()
    } catch {
      setErrore('Rubrica non aggiornata: problema di rete.')
      setEsitoRiga({ chiave, testo: 'Non riuscito: problema di rete.' })
    } finally {
      setOccupato(false)
      setRigaOccupata('')
    }
  }

  return (
    <main>
      <div className="page-head">
        <div>
          <h1 className="page-title">Clienti</h1>
          <p className="page-sub">
            Chi ha ordinato, ricavato dagli ordini: un cliente per telefono (o email), con tutti i
            suoi ordini in un posto solo. Se la stessa persona compare due volte — due numeri, due
            email — spunta le righe e uniscile.
          </p>
        </div>
        <button
          className="btn"
          onClick={salvaTuttiInRubrica}
          disabled={occupato || !googleCollegato}
          title={googleCollegato ? '' : 'Collega Google Contacts nelle Impostazioni'}
        >
          {occupato ? 'Salvo…' : 'Porta tutti in rubrica Google'}
        </button>
      </div>

      <div className="kpi-riga">
        <div className="kpi">
          <div className="kpi-valore">{totale.toLocaleString('it-IT')}</div>
          <div className="kpi-etichetta">{qCercata ? 'Clienti trovati' : 'Clienti totali'}</div>
        </div>
        <div className="kpi">
          <div className="kpi-valore">{euro(spesoTotale)}</div>
          <div className="kpi-etichetta">Valore totale</div>
        </div>
        <div className="kpi">
          <div className="kpi-valore">{inRubrica.toLocaleString('it-IT')}</div>
          <div className="kpi-etichetta">In rubrica Google</div>
        </div>
      </div>

      <div className="ricerca">
        <span className="ricerca-icona" aria-hidden="true">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          >
            <circle cx="10.5" cy="10.5" r="6.5" />
            <path d="M15.4 15.4 20 20" />
          </svg>
        </span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cerca un cliente: nome, email, telefono, città…"
          aria-label="Cerca clienti"
        />
        {q ? (
          <button className="btn btn-secondario" onClick={() => setQ('')}>
            Annulla
          </button>
        ) : null}
      </div>

      {/* Su mobile le pillole scorrono su UNA riga (Libro §8.9): qui dentro ci
          sono solo chip di filtro e le loro etichette («Ordina per», «Rubrica»,
          che fanno da separatori fra i gruppi) — la ricerca sta nella barra
          sopra e resta fuori dalla corsia. */}
      <div className="filtri riga-chips-scorri">
        <span className="etichetta-ordina">Ordina per</span>
        {ORDINAMENTI.map((o) => (
          <button
            key={o.chiave}
            className={`stato-pill${ordina === o.chiave ? ' attuale' : ''}`}
            onClick={() => setOrdina(o.chiave)}
          >
            {o.nome}
          </button>
        ))}
        <span className="etichetta-ordina" style={{ marginLeft: 8 }}>
          Rubrica
        </span>
        <button
          className={`stato-pill${!soloDaSalvare ? ' attuale' : ''}`}
          onClick={() => setSoloDaSalvare(false)}
        >
          Tutti
        </button>
        <button
          className={`stato-pill${soloDaSalvare ? ' attuale' : ''}`}
          onClick={() => setSoloDaSalvare(true)}
        >
          Da salvare
        </button>
        {/* Il filtro che rende l'unione un lavoro finito e non una caccia: mostra
            solo le righe che hanno un gemello, ordinate per nome così stanno
            una sotto l'altra. */}
        <button
          className={`stato-pill${soloDoppioni ? ' attuale' : ''}`}
          onClick={() => setSoloDoppioni(!soloDoppioni)}
          style={{ marginLeft: 8 }}
          title="Righe che potrebbero essere la stessa persona: stessa email, o stesso nome"
        >
          Possibili doppioni
        </button>
      </div>

      {/* La barra compare solo quando c'è qualcosa da unire: chi sceglie deve
          dire QUALE riga resta, perché è quella a cui si scriverà. */}
      {selezionati.length > 0 ? (
        <div className="barra-unione">
          <span>
            {selezionati.length === 1
              ? 'Selezionato 1 cliente: scegline un altro da unire.'
              : `${selezionati.length} righe selezionate — le trovi numerate qui sotto. Quale resta?`}
          </span>
          {selezionati.length > 1
            ? selezionati.map((c, i) => (
                <button
                  key={c.chiave}
                  className="btn"
                  disabled={occupato}
                  onClick={() => unisci(c.chiave)}
                  // Nel titolo i dati che distinguono davvero due omonimi: il
                  // numero da solo dice quale riga, non chi è.
                  title={
                    `Resta la riga ${i + 1} (${c.telefono || c.email || 'senza recapito'}` +
                    `${c.citta ? `, ${c.citta}` : ''}): telefono ed email del cliente restano i suoi. ` +
                    `La riga ${numeriDaTogliere(i)} sparisce dall'elenco e i suoi ordini si sommano a questa. ` +
                    `Nessun ordine viene toccato: si può separare.`
                  }
                >
                  <span className="numero-scelta chiaro">{i + 1}</span>
                  Tieni {i + 1} — togli {numeriDaTogliere(i)}
                </button>
              ))
            : null}
          <button className="btn btn-secondario" onClick={() => setScelti([])}>
            Annulla
          </button>
          {selezionati.length > 1 ? (
            <span className="cella-sub" style={{ flexBasis: '100%' }}>
              La riga che togli sparisce dall&apos;elenco: i suoi ordini, la sua spesa e i suoi
              recapiti passano a quella che tieni. Nessun ordine viene toccato — «Separa» rimette
              tutto com&apos;era.
            </span>
          ) : null}
        </div>
      ) : null}

      {!googleCollegato && caricato ? (
        <div className="avviso-errore">
          Google Contacts non è collegato: vai in Impostazioni → Google Contacts per collegarlo.
        </div>
      ) : null}
      {avviso ? <div className="avviso-ok">{avviso}</div> : null}
      {errore ? <div className="avviso-errore">{errore}</div> : null}

      {!caricato ? (
        <div className="vuoto">Carico…</div>
      ) : clienti.length === 0 ? (
        <div className="vuoto">
          {qCercata
            ? `Nessun cliente per «${qCercata}».`
            : 'Nessun cliente: scarica prima gli ordini da Shopify.'}
        </div>
      ) : (
        <>
          <div className="tabella-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 34 }} aria-label="Selezione" />
                  <th>Cliente</th>
                  <th>Contatti</th>
                  <th>Negozi</th>
                  <th className="num">Ordini</th>
                  <th className="num">Speso</th>
                  <th>Ultimo</th>
                  <th>Rubrica</th>
                </tr>
              </thead>
              <tbody>
                {clienti.map((c) => {
                  // «La riga si apre col click» (Libro v1.6 §8): tutta la riga
                  // porta alla scheda — ma SOLO se il cliente ne ha una (serve
                  // un'email o un telefono: senza, la scheda non si apre e la
                  // riga non deve promettere niente). La casella da spuntare e
                  // i bottoni dentro la riga restano loro: il click su
                  // a/button/input/select/label non naviga.
                  const hrefScheda =
                    c.email || c.telefono
                      ? `/clienti/scheda?email=${encodeURIComponent(c.email)}&telefono=${encodeURIComponent(c.telefono)}`
                      : null
                  return (
                  <tr
                    key={c.chiave}
                    className={[scelti.includes(c.chiave) ? 'riga-scelta' : '', hrefScheda ? 'riga-link' : '']
                      .filter(Boolean)
                      .join(' ')}
                    onClick={
                      hrefScheda
                        ? (e) => {
                            if ((e.target as HTMLElement).closest('a,button,input,select,label')) return
                            router.push(hrefScheda)
                          }
                        : undefined
                    }
                  >
                    <td>
                      <span className="cella-scelta">
                        <input
                          type="checkbox"
                          checked={scelti.includes(c.chiave)}
                          onChange={() => spunta(c.chiave)}
                          aria-label={`Seleziona ${c.nome || c.chiave}`}
                        />
                        {/* Il numero della riga fra le selezionate: è quello
                            che compare sui bottoni «Tieni 1 — togli 2». */}
                        {numeroScelta(c.chiave) ? (
                          <span className="numero-scelta">{numeroScelta(c.chiave)}</span>
                        ) : null}
                      </span>
                    </td>
                    <td>
                      {/* Il nome apre la SCHEDA: ordini passati, reclami,
                          rimborsi, messaggi. Il link resta anche ora che la
                          riga intera naviga (Libro v1.6 §8): da tastiera ci si
                          arriva solo da qui. La chiave passa in query string:
                          contiene @ e +, che in un pezzo di percorso si
                          incastrano. */}
                      <a
                        className="cella-nome link-scheda"
                        href={`/clienti/scheda?email=${encodeURIComponent(c.email)}&telefono=${encodeURIComponent(c.telefono)}`}
                        title="Apri la scheda: ordini passati, reclami, rimborsi e messaggi"
                      >
                        {c.nome || c.telefono || c.email || '—'}
                      </a>
                      {c.citta ? <div className="cella-sub">{c.citta}</div> : null}
                      {/* Perché questa riga è qui: «stessa email» è quasi una
                          certezza, «stesso nome» è solo un indizio, e chi
                          decide deve vedere la differenza. */}
                      {c.doppione ? (
                        <span className="badge" title="Potrebbe essere la stessa persona di un'altra riga">
                          {c.doppione === 'email' ? 'stessa email' : 'stesso nome'}
                        </span>
                      ) : null}
                    </td>
                    <td className="cella-muta">
                      {c.email ? <div>{c.email}</div> : null}
                      {c.telefono ? <div className="cella-sub">{c.telefono}</div> : null}
                      {!c.email && !c.telefono ? '—' : null}
                      {/* Gli altri recapiti della persona: sono numeri a cui
                          risponde davvero, non si nascondono dopo l'unione. */}
                      {c.uniti.map((u, i) => (
                        <div key={i} className="cella-sub" style={{ opacity: 0.75 }}>
                          + {u.telefono || u.email}
                        </div>
                      ))}
                    </td>
                    <td>
                      <span className="etichette">
                        {c.negozi.map((n) => (
                          <span key={n} className="tag">
                            <span className="dot" style={{ color: 'var(--gold)' }} />
                            <span className="tag-label">{n}</span>
                          </span>
                        ))}
                      </span>
                    </td>
                    <td className="cella-num">{c.ordini.toLocaleString('it-IT')}</td>
                    <td className="cella-num">{euro(c.speso)}</td>
                    <td className="cella-muta" style={{ whiteSpace: 'nowrap' }}>
                      {c.ultimoNumero} · {dataBreve(c.ultimaData)}
                    </td>
                    <td>
                      {c.inRubrica ? (
                        <span className="badge verde">salvato</span>
                      ) : (
                        <span className="badge">da salvare</span>
                      )}
                      {c.assorbite ? (
                        <div className="azioni-unito">
                          <span className="badge" title="Quante righe della rubrica stanno dentro questa">unito · {c.assorbite + 1}</span>
                          <button
                            className="btn btn-secondario small"
                            disabled={occupato || !googleCollegato}
                            onClick={() => allineaGoogle(c.chiave)}
                            title={
                              googleCollegato
                                ? 'Un contatto solo in rubrica, con tutti i numeri e tutte le email'
                                : 'Collega Google Contacts nelle Impostazioni'
                            }
                          >
                            {rigaOccupata === c.chiave ? 'Allineo…' : 'Allinea in Google'}
                          </button>
                          <button
                            className="btn btn-secondario small"
                            disabled={occupato}
                            onClick={() => separa(c.chiave)}
                          >
                            Separa
                          </button>
                          {/* L'esito accanto al bottone che l'ha prodotto. */}
                          {esitoRiga?.chiave === c.chiave ? (
                            <div className="cella-sub" style={{ flexBasis: '100%' }}>
                              {esitoRiga.testo}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="paginazione">
            <span>
              {totale.toLocaleString('it-IT')} clienti
              {totale > clienti.length ? ` · mostrati i primi ${clienti.length}` : ''}
            </span>
          </div>
        </>
      )}
    </main>
  )
}
