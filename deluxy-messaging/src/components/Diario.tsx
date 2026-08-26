'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { linkOrdine } from '@/lib/link-ordine'
import { correggiRiga } from '@/lib/diario'
import { CampoRigaDiario } from './CampoRigaDiario'

// Il diario di lavoro: le righe che ci si scrive per ricordare cosa c'è da fare
// su un ordine.
//
// ⚠️ Si scrive come sul quaderno di prima — «12562 da fare 16 luglio» — e il
// numero d'ordine viene staccato da solo: chiedere due campi invece di uno
// vorrebbe dire che le righe si continuano a scrivere altrove.

export type NotaDiario = {
  id: string
  ordineNumero: string
  /** La chat da cui la nota e nata, e di chi era: vedi lo schema. */
  conversazioneId: string
  conversazioneChi: string
  testo: string
  fatta: boolean
  fattaIl: string | null
  autoreNome: string
  fattaDaNome: string
  /** L'id della nota che questa riga cita ('' = riga a sé). */
  rispostaA?: string
  creatoIl: string
}

/**
 * Capofila e seguiti in una lista sola, dalla più recente.
 *
 * ⚠️ Serve alle viste già dentro un contesto (un ordine, una chat): lì il
 * rientro non aggiunge niente, ma **lasciar fuori i seguiti** farebbe sparire
 * righe vere senza un errore da nessuna parte.
 */
export function insieme(note: NotaDiario[], seguiti?: NotaDiario[]): NotaDiario[] {
  return [...note, ...(seguiti ?? [])].sort((a, b) => b.creatoIl.localeCompare(a.creatoIl))
}

function quando(iso: string): string {
  const d = new Date(iso)
  const oggi = new Date()
  const stessoGiorno = d.toDateString() === oggi.toDateString()
  const ora = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
  if (stessoGiorno) return ora
  return `${d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })} · ${ora}`
}

type OrdineAperto = {
  numero: string
  clienteNome: string
  negozioNome: string
  dataConsegna: string | null
  fasciaConsegna: string
  note: number
}

/** «oggi», «domani», «16 lug»: come si dice una consegna in due parole. */
function consegnaBreve(iso: string | null): string {
  if (!iso) return 'senza data'
  const d = new Date(iso)
  const giorni = Math.round(
    (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() -
      new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime()) /
      86400000
  )
  if (giorni === 0) return 'oggi'
  if (giorni === 1) return 'domani'
  if (giorni < 0) return `scaduta da ${-giorni}g`
  return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
}

export function Diario() {
  const [note, setNote] = useState<NotaDiario[]>([])
  /** I seguiti di tutte le note a schermo, da appendere sotto la loro capofila. */
  const [seguiti, setSeguiti] = useState<NotaDiario[]>([])
  /** Su quale nota si sta scrivendo un seguito ('' = nessuna). */
  const [scrivoSu, setScrivoSu] = useState('')
  /** Il testo del seguito, per nota: chi ne apre due non perde il primo. */
  const [seguito, setSeguito] = useState<Record<string, string>>({})
  const [aperte, setAperte] = useState(0)
  const [stato, setStato] = useState<'aperte' | 'fatte' | 'tutte'>('aperte')
  const [q, setQ] = useState('')
  /** Quello che si sta davvero cercando: `q` dopo che si è smesso di scrivere. */
  const [qCercata, setQCercata] = useState('')
  const [testo, setTesto] = useState('')
  const campo = useRef<HTMLInputElement>(null)
  /** Gli ordini aperti da suggerire sopra il campo. */
  const [ordiniAperti, setOrdiniAperti] = useState<OrdineAperto[]>([])
  const [soloScoperti, setSoloScoperti] = useState(false)
  const [caricato, setCaricato] = useState(false)
  // ⚠️⚠️ QUALE RIGA SI STA CORREGGENDO, e cosa c'è scritto nel campo mentre la
  // si corregge. Chiesto dall'utente il 26/08/2026: «consenti la modifica di
  // singole note». Prima una riga sbagliata si poteva solo **cancellare e
  // riscrivere** — perdendo chi l'aveva scritta, quando, il filo dei suoi
  // seguiti e la spunta di chi l'aveva già chiusa. Per un refuso.
  //
  // ⚠️ La bozza sta in una mappa per id e non in una variabile sola: aprendo una
  // seconda riga in correzione, con una variabile sola il testo della prima
  // sparirebbe senza dire niente.
  const [modificoId, setModificoId] = useState('')
  const [bozza, setBozza] = useState<Record<string, string>>({})
  const [errore, setErrore] = useState('')

  const carica = useCallback(async () => {
    const p = new URLSearchParams({ stato })
    if (qCercata.trim()) p.set('q', qCercata.trim())
    // ⚠️⚠️ Senza `try/catch` e senza `finally`, una lettura fallita lasciava la
    // pagina su «Carico…»: `setCaricato(true)` non veniva mai raggiunto e non
    // compariva nessun errore. Col 307 verso /login `res.ok` è addirittura vero
    // ed è `res.json()` a esplodere, quindi non bastava guardare lo stato.
    try {
      const res = await fetch('/api/diario?' + p.toString())
      const ct = res.headers.get('content-type') ?? ''
      if (!res.ok || res.redirected || !ct.includes('application/json')) {
        setErrore('Non sono riuscito a leggere il diario. Ricarica la pagina.')
        return
      }
      const d = (await res.json()) as {
        note: NotaDiario[]
        seguiti?: NotaDiario[]
        aperte: number
      }
      setNote(d.note)
      setSeguiti(d.seguiti ?? [])
      setAperte(d.aperte)
      setErrore('')
    } catch {
      setErrore('Non sono riuscito a leggere il diario: problema di rete.')
    } finally {
      setCaricato(true)
    }
  }, [stato, qCercata])

  // ⚠️⚠️ Si aspetta che uno smetta di scrivere. Prima `carica` dipendeva da `q`
  // grezzo: scrivendo «biglietto» partivano otto richieste, senza `AbortController`
  // e senza guardia di sequenza — e la risposta di «bigliett», arrivando per
  // ultima, si sovrascriveva a quella di «biglietto». (La bacheca degli ordini
  // questa attesa ce l'aveva già; il diario no.)
  useEffect(() => {
    const t = setTimeout(() => setQCercata(q), 300)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    void carica()
  }, [carica])

  // Gli ordini aperti: si rileggono quando cambia il diario, perché il numero
  // di note per ordine cambia insieme.
  useEffect(() => {
    fetch('/api/diario/ordini')
      .then((r) => (r.ok ? r.json() : { ordini: [] }))
      .then((d: { ordini?: OrdineAperto[] }) => setOrdiniAperti(d.ordini ?? []))
      .catch(() => setOrdiniAperti([]))
  }, [note])

  async function aggiungi() {
    const riga = testo.trim()
    if (!riga) return
    setErrore('')
    const res = await fetch('/api/diario', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ testo: riga }),
    })
    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as { errore?: string }
      setErrore(d.errore || 'Riga non salvata.')
      return
    }
    setTesto('')
    await carica()
  }

  /**
   * Scrive il SEGUITO di una nota: una riga nuova che cita quella.
   *
   * ⚠️ Il seguito è una nota come le altre — si spunta, porta l'ordine, ha un
   * autore — e non un commento: il caso vero è «richiamare il cliente domani» →
   * «richiamato, vuole il biglietto riscritto» → «riscritto», e le ultime due
   * righe sono cose fatte, non note a margine della prima.
   */
  async function aggiungiSeguito(capofila: NotaDiario) {
    const riga = (seguito[capofila.id] ?? '').trim()
    if (!riga) return
    setErrore('')
    const res = await fetch('/api/diario', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ testo: riga, rispostaA: capofila.id }),
    })
    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as { errore?: string }
      setErrore(d.errore || 'Seguito non salvato.')
      return
    }
    // ⚠️ Si svuota solo dopo il sì del server: svuotare prima vorrebbe dire far
    // sparire quello che uno ha scritto proprio quando la rete non c'era.
    setSeguito((s) => ({ ...s, [capofila.id]: '' }))
    setScrivoSu('')
    await carica()
  }

  /** I seguiti di una nota, nell'ordine in cui sono stati scritti. */
  const seguitiDi = (id: string) => seguiti.filter((s) => s.rispostaA === id)

  async function segna(n: NotaDiario, fatta: boolean) {
    await fetch(`/api/diario/${n.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fatta }),
    })
    await carica()
  }

  function apriModifica(n: NotaDiario) {
    // ⚠️ Il numero d'ordine torna IN TESTA al testo, com'era stato scritto: è
    // così che si corregge una riga sbagliata di ordine — riscrivendo il numero
    // davanti. Senza, il numero sarebbe l'unica cosa della riga che non si può
    // toccare, e per cambiarlo bisognerebbe cancellare e rifare.
    setBozza((b) => ({
      ...b,
      [n.id]: n.ordineNumero ? `${n.ordineNumero.replace('#', '')} ${n.testo}` : n.testo,
    }))
    setModificoId(n.id)
  }

  async function salvaModifica(n: NotaDiario) {
    const grezzo = (bozza[n.id] ?? '').trim()
    // ⚠️ Vuoto non si salva: la rotta lo ignorerebbe e la riga tornerebbe com'era
    // — cioè sembrerebbe che il salvataggio non abbia funzionato. Cancellare una
    // riga si fa col suo bottone, che chiede conferma.
    if (!grezzo) return
    setErrore('')
    // ── IL NUMERO IN TESTA, MA SOLO SE CE L'AVEVA GIÀ ──
    //
    // ⚠️⚠️ Correggendo, il numero in testa vale come ordine **solo per le righe
    // che un ordine ce l'hanno già** — cioè quelle in cui il numero l'ha messo
    // lì `apriModifica`. Su quelle, cambiarlo sposta la riga e toglierlo la
    // stacca: due gesti che prima si potevano fare solo cancellando e
    // riscrivendo.
    //
    // ⚠️⚠️ Sulle righe SENZA ordine, invece, il numero in testa resta TESTO. È il
    // caso che questa regola esiste per non rovinare: «100 rose da consegnare»
    // comincia con tre cifre, e trattarle come un numero d'ordine farebbe
    // sparire la riga dentro l'ordine #100 — **in silenzio**, mentre chi
    // scriveva stava solo correggendo un refuso più avanti. Quando la riga
    // NASCE quella scommessa si può fare (la si vede subito, ed è il modo in cui
    // si scrive sul quaderno); su una riga già esistente e già letta da altri,
    // no. Fra due sbagli si sceglie quello che si VEDE: chi voleva legarla e non
    // ci riesce se ne accorge subito, perché il numero resta scritto e il badge
    // dell'ordine non compare.
    // ⚠️ La regola sta in libreria (`correggiRiga`) perché è la parte che si
    // può sbagliare in silenzio: si prova con dei casi, senza aprire un browser.
    // ⚠️ `ordineNumero: ''` è voluto e vuol dire «staccala»: non mandarlo
    // affatto lascerebbe la riga attaccata a un ordine che dal testo è appena
    // sparito.
    const dati = correggiRiga(grezzo, !!n.ordineNumero)
    try {
      const res = await fetch(`/api/diario/${n.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dati),
      })
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { errore?: string }
        setErrore(d.errore || 'Modifica non salvata.')
        return
      }
      setModificoId('')
      await carica()
    } catch {
      setErrore('Modifica non salvata: problema di rete.')
    }
  }

  async function cancella(n: NotaDiario) {
    if (!window.confirm(`Cancello «${n.testo.slice(0, 60)}»?`)) return
    await fetch(`/api/diario/${n.id}`, { method: 'DELETE' })
    await carica()
  }

  return (
    <>
      <div className="testa-pagina">
        <h1>Diario</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="badge">{aperte} da fare</span>
          <select value={stato} onChange={(e) => setStato(e.target.value as typeof stato)}>
            <option value="aperte">Da fare</option>
            <option value="fatte">Fatte</option>
            <option value="tutte">Tutte</option>
          </select>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cerca nel diario…"
            aria-label="Cerca nel diario"
          />
        </div>
      </div>

      {/* ⚠️ Un campo solo, e si scrive come si è sempre scritto: «12562 da fare
          16 luglio». Il numero d'ordine si stacca da solo — chiedere due campi
          vorrebbe dire che le righe continuano a finire in una chat. */}
      {/* ── GLI ORDINI APERTI, SOPRA IL CAMPO ──
          ⚠️ Chi scrive il diario ha in testa «quello di Bolzano», non «#12562»:
          l'elenco davanti evita di andarselo a cercare in un'altra schermata e
          di riportarlo a mano — dove si sbaglia una cifra e la nota finisce su
          un ordine di un altro.
          ⚠️ Ogni ordine dice quante righe ha già: la domanda della mattina non
          è «quali ordini ci sono», è **quali sono ancora scoperti**. */}
      {ordiniAperti.length ? (
        <div className="card" style={{ paddingBottom: 8 }}>
          <div
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              flexWrap: 'wrap',
              marginBottom: 8,
            }}
          >
            <span className="cella-nome">Ordini aperti</span>
            <span className="cella-sub">
              clicca per scrivere una riga su quell&apos;ordine
            </span>
            <button
              className={soloScoperti ? 'bottone mini' : 'bottone secondario mini'}
              onClick={() => setSoloScoperti(!soloScoperti)}
              title="Solo quelli che non hanno ancora nessuna riga nel diario"
            >
              {soloScoperti ? 'Solo senza note ✓' : 'Solo senza note'}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {ordiniAperti
              .filter((o) => !soloScoperti || o.note === 0)
              .map((o) => (
                <button
                  key={o.numero}
                  className={o.note ? 'bottone secondario mini' : 'bottone mini'}
                  onClick={() => {
                    // Il numero va in testa, come si scrive a mano: il resto
                    // della riga lo continua chi sta scrivendo.
                    setTesto((t) => `${o.numero.replace('#', '')} ${t}`.trimEnd() + ' ')
                    campo.current?.focus()
                  }}
                  title={`${o.clienteNome || 'senza nome'} · ${o.negozioNome} · consegna ${consegnaBreve(o.dataConsegna)}${o.note ? ` · ${o.note} righe nel diario` : ' · nessuna riga'}`}
                >
                  {o.numero} · {consegnaBreve(o.dataConsegna)}
                  {o.note ? ` · ${o.note}` : ''}
                </button>
              ))}
          </div>
        </div>
      ) : null}

      <div className="card">
        <label className="campo">
          <span>Scrivi una riga — comincia col numero d&apos;ordine, se ce l&apos;ha</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <CampoRigaDiario
              campoRef={campo}
              value={testo}
              onChange={setTesto}
              onInvio={() => void aggiungi()}
              placeholder="12562 da fare 16 luglio · «/» per il calendario"
            />
            <button className="bottone" onClick={() => void aggiungi()} disabled={!testo.trim()}>
              Aggiungi
            </button>
          </div>
        </label>
        {errore ? <div className="avviso-errore">{errore}</div> : null}
      </div>

      {!caricato ? (
        <p className="descrizione">Carico…</p>
      ) : note.length === 0 ? (
        <p className="colonna-vuota">
          {stato === 'aperte' ? 'Niente da fare: il diario è pulito.' : 'Nessuna riga.'}
        </p>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <ul className="elenco-diario">
            {note.map((n) => (
              <li key={n.id} className={n.fatta ? 'fatta' : ''}>
                <input
                  type="checkbox"
                  checked={n.fatta}
                  onChange={(e) => void segna(n, e.target.checked)}
                  aria-label={n.fatta ? 'Riapri' : 'Segna fatta'}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* ⚠️ Mentre si corregge, la riga vecchia NON resta a schermo:
                      si sta cambiando quella frase, e vederla due volte — vecchia
                      sopra e nuova nel campo — fa dubitare di quale delle due
                      varrà. Anche il numero d'ordine sparisce da qui, perché in
                      correzione sta in testa al campo. */}
                  <div style={{ display: modificoId === n.id ? 'none' : undefined }}>
                    {/* Il numero è un link: da una riga del diario si arriva
                        all'ordine, che è quello che si vuole fare dopo averla
                        letta. */}
                    {n.ordineNumero ? (
                      <Link
                        href={linkOrdine(n.ordineNumero)}
                        className="badge"
                        style={{ marginRight: 6 }}
                      >
                        {n.ordineNumero}
                      </Link>
                    ) : null}
                    {/* La chat da cui la nota è nata. Il nome è una COPIA presa
                        quando la nota è stata scritta, e regge anche se poi la
                        conversazione finisce nel cestino. */}
                    {n.conversazioneId ? (
                      <Link
                        href={`/inbox?c=${encodeURIComponent(n.conversazioneId)}`}
                        className="badge"
                        style={{ marginRight: 6 }}
                        title="Apri la conversazione da cui è nata questa nota"
                      >
                        {n.conversazioneChi || 'dalla chat'}
                      </Link>
                    ) : null}
                    <span>{n.testo}</span>
                  </div>
                  {/* ⚠️ Il campo di correzione prende il posto della riga, non
                      si apre sotto: si sta cambiando QUELLA frase, e vederla
                      due volte — vecchia sopra e nuova sotto — fa dubitare di
                      quale delle due varrà. */}
                  {modificoId === n.id ? (
                    <div className="modifica-riga">
                      <CampoRigaDiario
                        value={bozza[n.id] ?? ''}
                        onChange={(v) => setBozza((b) => ({ ...b, [n.id]: v }))}
                        onInvio={() => void salvaModifica(n)}
                        onEsc={() => setModificoId('')}
                        placeholder="Correggi la riga · «/» per il calendario"
                        ariaLabel="Correggi questa nota"
                        autoFocus
                      />
                      <button
                        className="bottone mini"
                        onClick={() => void salvaModifica(n)}
                        disabled={!(bozza[n.id] ?? '').trim()}
                      >
                        Salva
                      </button>
                      <button className="bottone secondario mini" onClick={() => setModificoId('')}>
                        Annulla
                      </button>
                    </div>
                  ) : null}
                  {/* ⚠️ Si dice a schermo, non nel codice: il numero in testa non
                      è testo, è l'ordine su cui sta la riga. Chi lo cancella la
                      stacca dall'ordine, chi ne scrive un altro la sposta — e
                      senza questa riga se ne accorgerebbe solo dopo. */}
                  {modificoId === n.id ? (
                    <div className="cella-sub" style={{ marginTop: 4 }}>
                      {n.ordineNumero
                        ? "Il numero in testa è l'ordine su cui sta la riga: cambialo per spostarla, toglilo per staccarla."
                        : 'Questa riga non è legata a un ordine, e un numero in testa resta testo.'}{' '}
                      Invio salva, Esc annulla.
                    </div>
                  ) : null}
                  <div className="cella-sub">
                    {[
                      n.autoreNome ? `scritta da ${n.autoreNome}` : '',
                      quando(n.creatoIl),
                      n.fatta && n.fattaDaNome ? `completata da ${n.fattaDaNome}` : '',
                      n.fatta && !n.fattaDaNome ? 'completata' : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>

                  {/* ── IL FILO DELLA NOTA ──
                      ⚠️⚠️ Un seguito è una NOTA, non un commento: si spunta,
                      porta l'ordine, ha un autore. Il caso vero è «richiamare il
                      cliente domani» → «richiamato, vuole il biglietto
                      riscritto» → «riscritto»: tre righe sulla stessa cosa, che
                      separate diventano tre cose da fare e non si capisce più
                      che le ultime due chiudono la prima. */}
                  {seguitiDi(n.id).map((s) => (
                    <div key={s.id} className={`seguito-diario${s.fatta ? ' fatta' : ''}`}>
                      <input
                        type="checkbox"
                        checked={s.fatta}
                        onChange={(e) => void segna(s, e.target.checked)}
                        aria-label={s.fatta ? 'Riapri il seguito' : 'Segna fatto il seguito'}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {modificoId === s.id ? (
                          <div className="modifica-riga" style={{ marginTop: 0 }}>
                            <CampoRigaDiario
                              value={bozza[s.id] ?? ''}
                              onChange={(v) => setBozza((b) => ({ ...b, [s.id]: v }))}
                              onInvio={() => void salvaModifica(s)}
                              onEsc={() => setModificoId('')}
                              placeholder="Correggi il seguito · «/» per il calendario"
                              ariaLabel="Correggi questo seguito"
                              autoFocus
                            />
                            <button
                              className="bottone mini"
                              onClick={() => void salvaModifica(s)}
                              disabled={!(bozza[s.id] ?? '').trim()}
                            >
                              Salva
                            </button>
                            <button
                              className="bottone secondario mini"
                              onClick={() => setModificoId('')}
                            >
                              Annulla
                            </button>
                          </div>
                        ) : (
                          <div>{s.testo}</div>
                        )}
                        <div className="cella-sub">
                          {[
                            s.autoreNome ? `scritta da ${s.autoreNome}` : '',
                            quando(s.creatoIl),
                            s.fatta && s.fattaDaNome ? `completata da ${s.fattaDaNome}` : '',
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </div>
                      </div>
                      <button
                        className="bottone secondario mini"
                        onClick={() => apriModifica(s)}
                        title="Correggi il testo di questo seguito"
                      >
                        Modifica
                      </button>
                      <button className="bottone secondario mini" onClick={() => void cancella(s)}>
                        Cancella
                      </button>
                    </div>
                  ))}

                  {/* ⚠️ Una capofila già completata con un seguito ancora aperto
                      resta nella vista di lavoro: altrimenti spuntando la prima
                      riga si farebbero sparire in silenzio le cose che restano
                      da fare. Qui si dice PERCHÉ è ancora lì. */}
                  {n.fatta && seguitiDi(n.id).some((s) => !s.fatta) ? (
                    <div className="cella-sub" style={{ color: 'var(--red)' }}>
                      Questa riga è completata, ma il suo seguito no.
                    </div>
                  ) : null}

                  {scrivoSu === n.id ? (
                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                      <CampoRigaDiario
                        value={seguito[n.id] ?? ''}
                        onChange={(v) => setSeguito((s) => ({ ...s, [n.id]: v }))}
                        onInvio={() => void aggiungiSeguito(n)}
                        onEsc={() => setScrivoSu('')}
                        placeholder="Che cosa è successo dopo · «/» per il calendario"
                        ariaLabel="Scrivi il seguito di questa nota"
                        autoFocus
                      />
                      <button
                        className="bottone secondario mini"
                        onClick={() => void aggiungiSeguito(n)}
                        disabled={!(seguito[n.id] ?? '').trim()}
                      >
                        Aggiungi
                      </button>
                      <button className="bottone secondario mini" onClick={() => setScrivoSu('')}>
                        Annulla
                      </button>
                    </div>
                  ) : (
                    <button
                      className="bottone secondario mini"
                      style={{ marginTop: 6 }}
                      onClick={() => setScrivoSu(n.id)}
                      title="Aggiungi una riga che continua questa"
                    >
                      Aggiungi seguito
                    </button>
                  )}
                </div>
                {/* ⚠️ Correggere prima di cancellare: nove volte su dieci quello
                    che serve è cambiare una parola, e finché c'era solo
                    «Cancella» quello era l'unico modo — buttando via autore,
                    data, filo dei seguiti e spunta. */}
                <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                  <button
                    className="bottone secondario mini"
                    onClick={() => apriModifica(n)}
                    title="Correggi il testo di questa riga"
                  >
                    Modifica
                  </button>
                  <button className="bottone secondario mini" onClick={() => void cancella(n)}>
                    Cancella
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}
