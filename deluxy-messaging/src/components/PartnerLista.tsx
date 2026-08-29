'use client'

import { useCallback, useEffect, useState } from 'react'

// I partner attivi, letti dal registro Deluxy Anagrafiche a ogni apertura (non
// ne teniamo copia: è la regola del registro). Qui servono per scrivere a
// un'insegna senza andare a cercare il numero da un'altra parte.

type Contatto = { ruolo: string; nome: string; telefono: string; email: string }

type Partner = {
  id: string
  nome: string
  ragioneSociale: string
  categoria: string
  citta: string
  provincia: string
  indirizzo: string
  telefono: string
  email: string
  statoFinanziario: string
  ultimaVisita: string
  note: string
  contatti: Contatto[]
}

// Come sta con i pagamenti: lo scrive l'amministrazione in Anagrafiche. Qui si
// mostra perché cambia il tono con cui scrivi a un'insegna.
const STATI_FINANZIARI: Record<string, { nome: string; colore: string }> = {
  regolare: { nome: 'Regolare', colore: '#248a3d' },
  da_verificare: { nome: 'Da verificare', colore: '#6e6e73' },
  in_ritardo: { nome: 'In ritardo', colore: '#b25000' },
  insoluto: { nome: 'Insoluto', colore: '#c93400' },
  piano_di_rientro: { nome: 'Piano di rientro', colore: '#0071e3' },
  bloccato: { nome: 'Bloccato', colore: '#c93400' },
}

/**
 * WhatsApp se c'è un numero, altrimenti la mail — come per gli ordini.
 *
 * Il recapito sta quasi sempre sul REFERENTE, non sull'insegna: nel registro di
 * oggi nessuno dei 41 partner attivi ha un telefono proprio, ma 28 hanno un
 * referente con il numero. Guardando solo l'anagrafica il bottone sarebbe spento
 * per 37 partner su 41; con il ripiego sui referenti se ne contattano 38.
 */
/**
 * PERCHÉ QUESTA RIGA È COMPARSA, quando non è ovvio.
 *
 * ⚠️⚠️ Segnalato dall'utente il 27/08/2026: cercando «brescia» compariva
 * «Solbiati Cioccolato · Milano», e cercando «vicenz» «Maryflor di Gerardi
 * Vincenzo · Milano». Non è un errore: il registro cerca dentro **tutti** i
 * campi — le note («Attivi su Milano e Brescia»), la ragione sociale
 * («…Vicenzo», che contiene «vicenz») — e mostra la riga giusta. Ma la parola
 * che ha fatto scattare il risultato sta in un campo che a schermo non si vede,
 * quindi la riga sembra un falso positivo.
 *
 * La correzione non è restringere la ricerca — Solbiati consegna davvero a
 * Brescia, e nasconderlo sarebbe peggio — ma **dire dove ha trovato la parola**.
 *
 * ⚠️ Si mostra SOLO quando la parola non è già nei campi visibili (nome, città,
 * categoria): se compare lì, il perché è sotto gli occhi e una riga in più
 * sarebbe rumore.
 */
function perchePerLaRicerca(p: Partner, q: string): string {
  const parole = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!parole.length) return ''
  const visibile = [p.nome, p.citta, p.provincia, p.categoria].join(' ').toLowerCase()
  // ⚠️ Se OGNI parola è già visibile, il perché è ovvio: niente riga.
  if (parole.every((w) => visibile.includes(w))) return ''

  // I campi nascosti, col nome che l'utente riconosce.
  const campi: { et: string; testo: string }[] = [
    { et: 'ragione sociale', testo: p.ragioneSociale },
    { et: 'indirizzo', testo: p.indirizzo },
    { et: 'note', testo: p.note },
    { et: 'email', testo: p.email },
    { et: 'telefono', testo: p.telefono },
    ...p.contatti.map((c) => ({
      et: 'referente',
      testo: [c.nome, c.ruolo, c.email, c.telefono].filter(Boolean).join(' '),
    })),
  ]
  // La parola non ancora vista: quella che spiega il match.
  const chiave = parole.find((w) => !visibile.includes(w)) ?? parole[0]
  for (const { et, testo } of campi) {
    const t = (testo ?? '').trim()
    const i = t.toLowerCase().indexOf(chiave)
    if (i < 0) continue
    // Un pezzetto attorno alla parola, non tutto il campo: la nota può essere
    // lunga, e qui serve solo far vedere che «brescia» c'è davvero.
    const da = Math.max(0, i - 24)
    const a = Math.min(t.length, i + chiave.length + 24)
    const estratto = (da > 0 ? '…' : '') + t.slice(da, a).trim() + (a < t.length ? '…' : '')
    return `trovato in ${et}: ${estratto}`
  }
  return ''
}

function linkContatto(p: Partner): { url: string; come: string; chi: string } | null {
  const persona = p.contatti.find(
    (c) => (c.telefono ?? '').replace(/[^\d]/g, '').length >= 8 || c.email
  )
  const telefono = p.telefono || persona?.telefono || ''
  const email = p.email || persona?.email || ''
  // chi risponderà: se scriviamo al referente, va detto
  const chi = p.telefono || p.email ? p.nome : persona?.nome || p.nome
  const saluto = chi ? ' ' + chi.split('(')[0].trim().split(' ')[0] : ''
  const testo = `Buongiorno${saluto}, vi scriviamo da Deluxy.`

  const cifre = telefono.replace(/[^\d]/g, '')
  if (cifre.length >= 8) {
    return {
      url: `https://wa.me/${cifre}?text=${encodeURIComponent(testo)}`,
      come: 'WhatsApp',
      chi,
    }
  }
  if (email) {
    const q = new URLSearchParams({ subject: 'Deluxy', body: testo })
    return { url: `mailto:${email}?${q.toString()}`, come: 'email', chi }
  }
  return null
}

/**
 * L'elenco dei partner attivi del registro.
 *
 * ⚠️ `dentroLaPagina`: quando questa lista sta nella pagina a due sezioni, la
 * cornice `<main>` e il titolo li mette il contenitore. Se li mettesse anche
 * questa, la pagina avrebbe due `<main>` annidati e due titoli uno sotto
 * l'altro — e un `<main>` dentro un `<main>` non è solo brutto: i lettori di
 * schermo cercano «il contenuto principale» e ne troverebbero due.
 */
export function PartnerLista({ dentroLaPagina = false }: { dentroLaPagina?: boolean } = {}) {
  const [partner, setPartner] = useState<Partner[]>([])
  const [categorie, setCategorie] = useState<string[]>([])
  const [citta, setCitta] = useState<string[]>([])
  const [totale, setTotale] = useState(0)
  const [caricato, setCaricato] = useState(false)
  const [errore, setErrore] = useState('')
  const [aperto, setAperto] = useState('') // id del partner con la scheda aperta

  const [q, setQ] = useState('')
  const [qCercata, setQCercata] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [filtroCitta, setFiltroCitta] = useState('')

  // la ricerca vera la fa il registro: cerca su tutti i campi, referenti inclusi
  useEffect(() => {
    const t = setTimeout(() => setQCercata(q.trim()), 300)
    return () => clearTimeout(t)
  }, [q])

  const carica = useCallback(async () => {
    setErrore('')
    try {
      const p = new URLSearchParams()
      if (qCercata) p.set('q', qCercata)
      if (filtroCategoria) p.set('categoria', filtroCategoria)
      if (filtroCitta) p.set('citta', filtroCitta)
      const res = await fetch('/api/partner?' + p.toString())
      const d = (await res.json().catch(() => ({}))) as {
        partner?: Partner[]
        totale?: number
        categorie?: string[]
        citta?: string[]
        errore?: string
      }
      if (!res.ok) {
        setErrore(d.errore || 'Elenco non disponibile.')
        setPartner([])
        return
      }
      setPartner(d.partner ?? [])
      setTotale(d.totale ?? 0)
      // le tendine si riempiono col primo giro senza filtri, poi restano
      if (!filtroCategoria && !filtroCitta && !qCercata) {
        setCategorie(d.categorie ?? [])
        setCitta(d.citta ?? [])
      }
    } catch {
      setErrore('Registro non raggiungibile: problema di rete.')
    } finally {
      setCaricato(true)
    }
  }, [qCercata, filtroCategoria, filtroCitta])

  useEffect(() => {
    carica()
  }, [carica])

  const contattabili = partner.filter((p) => linkContatto(p)).length
  const conReferenti = partner.filter((p) => p.contatti.length).length

  const Cornice = dentroLaPagina ? Frammento : Principale
  return (
    <Cornice>
      <div className="page-head">
        <div>
          {dentroLaPagina ? null : <h1 className="page-title">Partner</h1>}
          <p className="page-sub">
            I partner <strong>attivi</strong> letti dal registro{' '}
            <strong>Deluxy Anagrafiche</strong>, la fonte di verità delle anagrafiche. Non ne
            teniamo una copia: l&apos;elenco è quello di adesso, e un partner dismesso là sparisce
            subito anche di qui. Per modificarli si va in Anagrafiche.
          </p>
        </div>
      </div>

      {errore ? <div className="avviso-errore">{errore}</div> : null}

      {/* Il registro dà al massimo 200 per pagina: se un giorno i partner attivi
          fossero di più, va detto invece di mostrarne una parte in silenzio. */}
      {caricato && totale > partner.length ? (
        <div className="avviso-errore">
          Il registro ne conta {totale}, qui ne stanno {partner.length}: restringi con la
          ricerca o i filtri per vedere gli altri.
        </div>
      ) : null}

      <div className="kpi-riga">
        <div className="kpi">
          <span className="kpi-etichetta">Partner attivi</span>
          <span className="kpi-valore">{totale}</span>
        </div>
        <div className="kpi">
          <span className="kpi-etichetta">Contattabili</span>
          <span className="kpi-valore">{contattabili}</span>
        </div>
        <div className="kpi">
          <span className="kpi-etichetta">Con referenti</span>
          <span className="kpi-valore">{conReferenti}</span>
        </div>
        <div className="kpi">
          <span className="kpi-etichetta">Categorie</span>
          <span className="kpi-valore">{categorie.length}</span>
        </div>
      </div>

      <div className="barra-ricerca">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cerca per nome, città, referente, telefono…"
          aria-label="Cerca partner"
        />
        <select
          value={filtroCategoria}
          onChange={(e) => setFiltroCategoria(e.target.value)}
          aria-label="Categoria"
        >
          <option value="">Tutte le categorie</option>
          {categorie.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={filtroCitta}
          onChange={(e) => setFiltroCitta(e.target.value)}
          aria-label="Città"
        >
          <option value="">Tutte le città</option>
          {citta.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        {q || filtroCategoria || filtroCitta ? (
          <button
            className="btn btn-secondario"
            onClick={() => {
              setQ('')
              setFiltroCategoria('')
              setFiltroCitta('')
            }}
          >
            Azzera
          </button>
        ) : null}
      </div>

      {!caricato ? (
        <div className="vuoto">Carico dal registro…</div>
      ) : partner.length === 0 ? (
        <div className="vuoto">
          {errore
            ? 'Nessun elenco da mostrare.'
            : q || filtroCategoria || filtroCitta
              ? 'Nessun partner attivo con questi filtri.'
              : 'Nessun partner attivo nel registro.'}
        </div>
      ) : (
        <div className="tabella-wrap">
          <table>
            <thead>
              <tr>
                <th>Partner</th>
                <th>Categoria</th>
                <th>Dove</th>
                <th>Pagamenti</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {partner.map((p) => {
                const c = linkContatto(p)
                const fin = STATI_FINANZIARI[p.statoFinanziario]
                const schedaAperta = aperto === p.id
                const perche = qCercata ? perchePerLaRicerca(p, qCercata) : ''
                return (
                  // ⚠️⚠️ TUTTA LA RIGA APRE IL DETTAGLIO (Libro UX&UI): segnalato
                  // dall'utente il 27/08/2026, era l'unica tabella dell'app dove
                  // il dettaglio si apriva solo dal bottone. `role`/`tabIndex`/
                  // Invio-Spazio perché una riga cliccabile deve esserlo anche
                  // da tastiera, non solo col mouse.
                  <tr
                    key={p.id}
                    className="riga-click"
                    role="button"
                    tabIndex={0}
                    aria-expanded={schedaAperta}
                    onClick={() => setAperto(schedaAperta ? '' : p.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setAperto(schedaAperta ? '' : p.id)
                      }
                    }}
                  >
                    <td>
                      <div className="cella-nome">{p.nome}</div>
                      {p.ragioneSociale && p.ragioneSociale !== p.nome ? (
                        <div className="cella-sub">{p.ragioneSociale}</div>
                      ) : null}
                      {/* ⚠️ Perché la riga è comparsa, quando la parola cercata
                          non è nel nome né nella città: senza, un match sulle
                          note sembra un errore. */}
                      {perche ? (
                        <div className="cella-sub" style={{ color: 'var(--gold, #B8963E)' }}>
                          {perche}
                        </div>
                      ) : null}
                      {schedaAperta ? (
                        <div className="cella-sub" style={{ marginTop: 6, lineHeight: 1.6 }}>
                          {p.indirizzo ? <div>{p.indirizzo}</div> : null}
                          {p.telefono ? <div>Tel. {p.telefono}</div> : null}
                          {p.email ? <div>{p.email}</div> : null}
                          {p.contatti.map((r, i) => (
                            <div key={i}>
                              {r.ruolo ? `${r.ruolo}: ` : ''}
                              {r.nome}
                              {r.telefono ? ` · ${r.telefono}` : ''}
                              {r.email ? ` · ${r.email}` : ''}
                            </div>
                          ))}
                          {p.note ? <div style={{ marginTop: 4 }}>{p.note}</div> : null}
                        </div>
                      ) : null}
                    </td>
                    <td className="cella-muta">{p.categoria}</td>
                    <td className="cella-muta">
                      {p.citta}
                      {p.provincia ? ` (${p.provincia})` : ''}
                    </td>
                    <td>
                      {fin ? (
                        <span className="stato-pill">
                          <span className="dot" style={{ background: fin.colore }} />
                          {fin.nome}
                        </span>
                      ) : (
                        <span className="cella-muta">—</span>
                      )}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {/* ⚠️ `stopPropagation`: scrivere al fornitore NON deve
                          anche aprire il dettaglio della riga — è un'altra
                          azione, e aprendo una scheda al volo sembrerebbe un
                          clic andato storto. */}
                      <a
                        className="btn btn-secondario small"
                        href={c?.url ?? '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-disabled={!c}
                        onClick={(e) => e.stopPropagation()}
                        style={c ? undefined : { opacity: 0.45, pointerEvents: 'none' }}
                        title={
                          c
                            ? `Scrivi a ${c.chi} su ${c.come}`
                            : 'Né l’insegna né i referenti hanno un recapito nel registro'
                        }
                      >
                        {c ? `Scrivi su ${c.come}` : 'Nessun contatto'}
                      </a>{' '}
                      {/* ⚠️ Il bottone resta (è l'indizio visibile che la riga
                          si apre), ma ferma la propagazione: senza, il clic
                          aprirebbe dalla riga e richiuderebbe dal bottone, e non
                          succederebbe niente. */}
                      <button
                        className="btn btn-secondario small"
                        onClick={(e) => {
                          e.stopPropagation()
                          setAperto(schedaAperta ? '' : p.id)
                        }}
                      >
                        {schedaAperta ? 'Chiudi' : 'Dettagli'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Cornice>
  )
}

// ⚠️ Due cornici invece di un ternario dentro il JSX: React vuole un componente
// (maiuscolo) per poterlo usare come tag, e definirlo qui fuori evita che venga
// ricreato a ogni render — cosa che smonterebbe e rimonterebbe tutto l'albero
// sotto, perdendo lo stato delle schede aperte a ogni battuta nella ricerca.
function Principale({ children }: { children: React.ReactNode }) {
  return <main>{children}</main>
}
function Frammento({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
