'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { inserisciScript } from '@/lib/script-testo'
import { urlScriviAiMail } from '@/lib/ai-mail'

// Il pop-up per scrivere e MANDARE una mail al cliente da dentro l'app.
//
// Prima il bottone di contatto apriva un link `mailto:`, che dipende dal
// programma di posta del computer: dove non è configurato non succede niente, e
// dove lo è la mail parte da un indirizzo personale, fuori da quest'app e senza
// lasciare traccia. Qui invece parte dalla casella aziendale via SMTP e resta
// registrata in inbox.
//
// Il testo arriva già scritto nella lingua del cliente (src/lib/lingua.ts) e si
// può correggere: non parte niente prima di premere Invia.

type Casella = { id: string; indirizzo: string; nome: string; predefinita: boolean }

/** Uno script: una risposta pronta, da richiamare dentro la mail. */
type Script = { id: string; titolo: string; categoria: string; testo: string; quando: string }

export type BozzaMail = {
  a: string
  oggetto: string
  testo: string
  clienteNome?: string
  ordineNumero?: string
  /**
   * La foto del prodotto da allegare (URL del CDN Shopify), e come si chiama.
   *
   * ⚠️ Su una richiesta a un fornitore la foto **è** la richiesta: «un bouquet»
   * non dice niente, la foto sì — ed è quello che si fa a mano su WhatsApp da
   * sempre (Copia foto → incolla). Chi scrive può toglierla con la spunta.
   */
  allegatoUrl?: string
  allegatoNome?: string
}

export function ComponiMail({
  bozza,
  onChiudi,
  onInviata,
}: {
  bozza: BozzaMail
  onChiudi: () => void
  onInviata?: () => void
}) {
  const [a, setA] = useState(bozza.a)
  const [oggetto, setOggetto] = useState(bozza.oggetto)
  const [testo, setTesto] = useState(bozza.testo)
  const [caselle, setCaselle] = useState<Casella[]>([])
  const [casellaId, setCasellaId] = useState('')
  // Gli script (risposte pronte) da richiamare nel testo.
  const [script, setScript] = useState<Script[]>([])
  const [cercaScript, setCercaScript] = useState('')
  const [scriptAperti, setScriptAperti] = useState(false)
  // Serve per sapere DOVE sta il cursore: lo script si inserisce lì.
  const areaTesto = useRef<HTMLTextAreaElement | null>(null)
  // ⚠️ L'ultima posizione del cursore va RICORDATA. Un riquadro di testo che non
  // è mai stato cliccato riporta `selectionStart = 0`, che è indistinguibile da
  // «il cursore è all'inizio»: senza questo, chi apre il pop-up e prende subito
  // uno script se lo vede infilato PRIMA del saluto, e il saluto esce doppio.
  // `null` = non l'ha ancora toccato, quindi si aggiunge in fondo.
  const cursore = useRef<number | null>(null)

  function ricordaCursore() {
    const area = areaTesto.current
    if (area) cursore.current = area.selectionStart
  }
  const [inviando, setInviando] = useState(false)
  /** La foto del prodotto parte insieme alla mail, se c'è: si può togliere. */
  const [allega, setAllega] = useState(true)
  const [inviata, setInviata] = useState('')
  const [avviso, setAvviso] = useState('')
  const [errore, setErrore] = useState('')

  const caricaCaselle = useCallback(async () => {
    try {
      const res = await fetch('/api/caselle')
      if (!res.ok) return
      const d = (await res.json()) as { caselle: Casella[] }
      setCaselle(d.caselle)
      setCasellaId(d.caselle.find((c) => c.predefinita)?.id ?? d.caselle[0]?.id ?? '')
    } catch {
      // se non si caricano, il server usa la predefinita da solo
    }
  }, [])

  useEffect(() => {
    caricaCaselle()
  }, [caricaCaselle])

  const caricaScript = useCallback(async () => {
    try {
      const res = await fetch('/api/script?' + new URLSearchParams(cercaScript ? { q: cercaScript } : {}))
      if (!res.ok) return
      const d = (await res.json()) as { script: Script[] }
      // Solo quelli attivi: uno script spento è spento anche qui.
      setScript(d.script.filter((x) => (x as Script & { attivo?: boolean }).attivo !== false))
    } catch {
      // rete assente: l'elenco resta vuoto e lo si dice
    }
  }, [cercaScript])

  useEffect(() => {
    if (!scriptAperti) return
    const t = setTimeout(caricaScript, 200)
    return () => clearTimeout(t)
  }, [scriptAperti, caricaScript])

  /**
   * Mette il testo dello script nella mail, alla posizione del cursore.
   *
   * Il saluto doppio si evita in `inserisciScript`: ogni script comincia con
   * «Buongiorno,» e il corpo ce l'ha già. E si segna che lo script è stato usato,
   * così l'elenco tiene in cima quelli che si usano davvero.
   */
  function usaScript(x: Script) {
    const area = areaTesto.current
    // Il cursore vale solo se il riquadro è davvero a fuoco o se ci si è già
    // scritto dentro; altrimenti lo script va in fondo al testo.
    const aFuoco = !!area && document.activeElement === area
    const da = aFuoco ? area!.selectionStart : (cursore.current ?? testo.length)
    const a = aFuoco ? area!.selectionEnd : (cursore.current ?? testo.length)
    const { testo: nuovo, nuovoCursore } = inserisciScript(testo, x.testo, da, a)
    setTesto(nuovo)
    setScriptAperti(false)
    // Il cursore va dove finisce quello che si è appena inserito, non a capo.
    requestAnimationFrame(() => {
      if (!area) return
      area.focus()
      area.setSelectionRange(nuovoCursore, nuovoCursore)
    })
    fetch(`/api/script/${x.id}/usato`, { method: 'POST' }).catch(() => {})
  }

  // Esc chiude, ma non mentre sta partendo: chiudere a metà invio lascerebbe il
  // dubbio se la mail è uscita.
  useEffect(() => {
    const tasto = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !inviando) onChiudi()
    }
    document.addEventListener('keydown', tasto)
    return () => document.removeEventListener('keydown', tasto)
  }, [onChiudi, inviando])

  async function invia() {
    setErrore('')
    setAvviso('')
    setInviando(true)
    try {
      const res = await fetch('/api/email/invia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          a,
          oggetto,
          testo,
          casellaId,
          clienteNome: bozza.clienteNome ?? '',
          ordineNumero: bozza.ordineNumero ?? '',
          // La foto parte solo se la spunta è rimasta accesa.
          allegatoUrl: allega ? (bozza.allegatoUrl ?? '') : '',
          allegatoNome: bozza.allegatoNome ?? '',
        }),
      })
      const d = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        da?: string
        avviso?: string
        nota?: string
        errore?: string
      }
      if (!res.ok || !d.ok) {
        setErrore(d.errore || 'Invio non riuscito.')
        return
      }
      setInviata(d.da ? `Mail inviata da ${d.da}.` : 'Mail inviata.')
      // ⚠️ Se la foto non è partita va detto: chi ha scritto «come da foto»
      // deve sapere che il fornitore quella foto non ce l'ha.
      if (d.avviso || d.nota) setAvviso([d.avviso, d.nota].filter(Boolean).join(' '))
      onInviata?.()
    } catch {
      setErrore('Invio non riuscito: problema di rete.')
    } finally {
      setInviando(false)
    }
  }

  return (
    <div className="velo" onClick={() => !inviando && onChiudi()} role="presentation">
      <div
        className="pannello pannello-mail"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Scrivi una mail al cliente"
      >
        <div className="pannello-testa">
          <div>
            <h2 style={{ margin: 0, fontSize: 19 }}>Scrivi al cliente</h2>
            <div className="cella-sub">
              {bozza.ordineNumero ? `Ordine ${bozza.ordineNumero} · ` : ''}
              parte dalla casella aziendale, non dal tuo programma di posta
            </div>
          </div>
          {/* ✕ obbligatoria (Libro v1.7 §9): stesso handler di Esc e del velo. */}
          <button className="pannello-chiudi" aria-label="Chiudi" title="Chiudi (Esc)" onClick={onChiudi} disabled={inviando}>
            ✕
          </button>
        </div>

        {errore ? <div className="avviso-errore">{errore}</div> : null}
        {inviata ? <div className="avviso-ok">{inviata}</div> : null}
        {avviso ? <div className="avviso-errore">{avviso}</div> : null}

        {caselle.length === 0 ? (
          <div className="avviso-errore">
            Nessuna casella di posta configurata: aggiungila in{' '}
            <a href="/caselle" style={{ textDecoration: 'underline' }}>
              Caselle
            </a>
            .
          </div>
        ) : null}

        {caselle.length > 1 ? (
          <label className="campo">
            <span>Da</span>
            <select value={casellaId} onChange={(e) => setCasellaId(e.target.value)}>
              {caselle.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome ? `${c.nome} — ${c.indirizzo}` : c.indirizzo}
                </option>
              ))}
            </select>
          </label>
        ) : caselle.length === 1 ? (
          <div className="campo">
            <span>Da</span>
            <div style={{ padding: '9px 0', fontSize: 14 }}>{caselle[0].indirizzo}</div>
          </div>
        ) : null}

        <label className="campo">
          <span>A</span>
          <input value={a} onChange={(e) => setA(e.target.value)} type="email" />
        </label>
        <label className="campo">
          <span>Oggetto</span>
          <input value={oggetto} onChange={(e) => setOggetto(e.target.value)} />
        </label>
        {/* RICHIAMA UNO SCRIPT: le risposte pronte finiscono nel testo, dove sta
            il cursore. Il saluto non esce doppio (vedi src/lib/script-testo.ts). */}
        <div className="campo">
          <span>
            Messaggio
            <button
              className="btn btn-secondario small"
              onClick={() => setScriptAperti(!scriptAperti)}
              style={{ marginLeft: 10 }}
              title="Inserisci una risposta pronta nel punto in cui sei"
            >
              {scriptAperti ? 'Chiudi gli script' : 'Usa uno script'}
            </button>
          </span>
        </div>

        {scriptAperti ? (
          <div className="script-scelta">
            <input
              type="search"
              value={cercaScript}
              onChange={(e) => setCercaScript(e.target.value)}
              placeholder="Cerca fra le risposte pronte…"
              aria-label="Cerca script"
            />
            {script.length === 0 ? (
              <p className="descrizione" style={{ margin: '8px 0 0' }}>
                {cercaScript ? (
                  <>Nessuno script per «{cercaScript}».</>
                ) : (
                  <>
                    Nessuno script disponibile: si scrivono in{' '}
                    <a href="/script" style={{ textDecoration: 'underline' }}>
                      Script
                    </a>
                    .
                  </>
                )}
              </p>
            ) : (
              <ul className="script-elenco">
                {script.map((x) => (
                  <li key={x.id}>
                    <button
                      className="script-voce"
                      onClick={() => usaScript(x)}
                      title={x.quando || 'Inserisci questo testo'}
                    >
                      <span className="script-titolo">{x.titolo}</span>
                      <span className="script-cat">{x.categoria}</span>
                      <span className="script-anteprima">
                        {x.testo.length > 90 ? x.testo.slice(0, 90) + '…' : x.testo}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        <label className="campo">
          <span className="solo-lettori-schermo">Messaggio</span>
          <textarea
            ref={areaTesto}
            rows={9}
            value={testo}
            onChange={(e) => {
              setTesto(e.target.value)
              ricordaCursore()
            }}
            onSelect={ricordaCursore}
            onKeyUp={ricordaCursore}
            onClick={ricordaCursore}
          />
        </label>

        {/* ── La foto del prodotto ──
            Su una richiesta a un fornitore la foto **è** la richiesta: «un
            bouquet» non dice niente, la foto sì — ed è quello che si fa a mano
            su WhatsApp da sempre (Copia foto → incolla). Parte da sola, e la
            spunta serve a chi non la vuole.
            ⚠️ Si vede l'anteprima di QUELLO che si sta per mandare: allegare
            una foto senza guardarla è il modo migliore per mandare al fornitore
            il prodotto di un altro ordine. */}
        {bozza.allegatoUrl ? (
          <label
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              margin: '4px 0 10px',
              cursor: 'pointer',
            }}
          >
            <input type="checkbox" checked={allega} onChange={(e) => setAllega(e.target.checked)} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={bozza.allegatoUrl}
              alt=""
              style={{
                width: 40,
                height: 40,
                objectFit: 'cover',
                borderRadius: 6,
                opacity: allega ? 1 : 0.35,
              }}
            />
            <span className="cella-sub">
              {allega ? 'Allega la foto del prodotto' : 'Foto non allegata'}
            </span>
          </label>
        ) : null}

        {/* Piede sticky (Libro v1.7 §9): «Invia» resta in vista anche con la
            mail lunga scorrata. */}
        <div className="pannello-piede">
          <button
            className="btn"
            onClick={invia}
            disabled={inviando || !a.trim() || !testo.trim() || !!inviata}
          >
            {inviando ? 'Invio…' : inviata ? 'Inviata ✓' : 'Invia'}
          </button>
          {/* La stessa mail, ma scritta dal programma di posta vero. Serve
              quando c'è da allegare, formattare o rileggere un thread lungo —
              cose che questo riquadro non fa. ⚠️ Quello che parte da lì NON
              finisce nella conversazione qui: sta scritto accanto al bottone,
              non si scopre dopo. */}
          <a
            className="btn btn-secondario"
            href={urlScriviAiMail({
              a,
              oggetto,
              corpo: testo,
              rif: bozza.ordineNumero ? `ordine ${bozza.ordineNumero}` : bozza.clienteNome ?? '',
            })}
            target="_blank"
            rel="noreferrer noopener"
          >
            Apri in AI Mail
          </a>
          <button className="btn btn-secondario" onClick={onChiudi} disabled={inviando}>
            {inviata ? 'Chiudi' : 'Annulla'}
          </button>
          <span className="descrizione" style={{ margin: 0 }}>
            {inviata
              ? 'La trovi in Inbox, nella conversazione del cliente.'
              : 'Rileggi prima di inviare: parte davvero. Da AI Mail parte dalla casella collegata là, e in Inbox non resta traccia.'}
          </span>
        </div>
      </div>
    </div>
  )
}
