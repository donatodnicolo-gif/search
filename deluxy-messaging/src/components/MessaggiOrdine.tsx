'use client'

import { useCallback, useEffect, useState } from 'react'

// I messaggi del cliente, dentro la scheda dell'ordine.
//
// Chi guarda un ordine ha bisogno di sapere se quel cliente ci ha già scritto e
// cosa ha detto: senza, si risponde due volte alla stessa domanda, o si telefona
// a qualcuno che aveva già spiegato tutto per iscritto. E si può rispondere da
// qui: uscire, cercare la conversazione in Inbox e tornare indietro è il modo
// migliore per non rispondere affatto.

type MessaggioOrdine = {
  id: string
  direzione: string
  testo: string
  oggetto: string
  creatoIl: string
  utenteNome: string
}

type ConversazioneOrdine = {
  id: string
  canale: string
  chi: string
  nonLetti: number
  legame: 'numero' | 'email' | 'telefono'
  messaggi: MessaggioOrdine[]
}

const NOMI_CANALE: Record<string, string> = {
  whatsapp: 'WhatsApp',
  messenger: 'Messenger',
  instagram: 'Instagram',
  widget: 'Sito',
  email: 'Email',
}

/** Come l'abbiamo collegata a questo ordine: dice quanto fidarsi. */
const NOMI_LEGAME: Record<string, string> = {
  numero: 'cita questo ordine',
  email: 'stessa email',
  telefono: 'stesso telefono',
}

function quando(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('it-IT', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Data per esteso: nel pop-up c'è lo spazio, e «25 ago» non dice l'anno. */
function quandoPerEsteso(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Il messaggio aperto per intero.
 *
 * Nell'elenco ogni battuta è tagliata a 400 caratteri e sta in un riquadro alto
 * 260px: va bene per capire di cosa si parlava, non per LEGGERE. Una mail vera
 * — con la richiesta del cliente, l'indirizzo, gli orari — lì dentro si vede a
 * metà, e per il resto bisognava uscire dall'ordine e cercarla in Inbox.
 */
export function MailAperta({
  messaggio,
  conversazione,
  onChiudi,
}: {
  messaggio: MessaggioOrdine
  conversazione: ConversazioneOrdine
  onChiudi: () => void
}) {
  useEffect(() => {
    function suTasto(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      // ⚠️ La scheda dell'ordine ascolta Esc anche lei, sullo STESSO document:
      // senza fermare l'evento qui, un solo Esc chiuderebbe il pop-up **e**
      // l'ordine sotto — e chi voleva solo tornare all'elenco dei messaggi si
      // ritroverebbe fuori da tutto.
      // In cattura, così questo arriva prima di quello della scheda (che è in
      // risalita): stopPropagation basta a non farglielo vedere.
      e.stopPropagation()
      onChiudi()
    }
    document.addEventListener('keydown', suTasto, true)
    return () => document.removeEventListener('keydown', suTasto, true)
  }, [onChiudi])

  const nostra = messaggio.direzione === 'out'
  const testo = messaggio.testo.trim()

  return (
    // ⚠️ `velo-sopra`: questo pop-up nasce DENTRO la scheda dell'ordine, che è
    // già una finestra col suo velo. Allo stesso livello lo ordinerebbe il DOM,
    // e finirebbe dietro.
    // ⚠️ E il clic sul velo va fermato: il velo della scheda dell'ordine è un
    // nostro antenato e ha anche lui un onClick che chiude — senza
    // stopPropagation, chiudere il pop-up chiuderebbe pure l'ordine.
    <div
      className="velo velo-sopra"
      role="presentation"
      onClick={(e) => {
        e.stopPropagation()
        onChiudi()
      }}
    >
      <div
        className="pannello mail-aperta"
        role="dialog"
        aria-label={messaggio.oggetto || 'Messaggio del cliente'}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pannello-testa">
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>
              {messaggio.oggetto || (nostra ? 'La nostra risposta' : 'Messaggio del cliente')}
            </h2>
            <div className="cella-sub" style={{ marginTop: 2 }}>
              <span className={`badge canale-${conversazione.canale}`}>
                {NOMI_CANALE[conversazione.canale] ?? conversazione.canale}
              </span>{' '}
              {nostra
                ? `Inviato da ${messaggio.utenteNome || 'noi'} a ${conversazione.chi}`
                : `Da ${conversazione.chi}`}{' '}
              · {quandoPerEsteso(messaggio.creatoIl)}
            </div>
          </div>
          {/* ✕ obbligatoria (Libro v1.7 §9): stesso handler del velo. */}
          <button className="pannello-chiudi" aria-label="Chiudi" title="Chiudi" onClick={onChiudi}>
            ✕
          </button>
        </div>

        {testo ? (
          <div className="mail-aperta-corpo">{testo}</div>
        ) : (
          // ⚠️ Un pop-up vuoto sembra rotto. Se il corpo non c'è si dice
          // perché: è una mail scritta solo in HTML, entrata prima del
          // 25/08/2026 quando lo scarico teneva solo la parte in testo
          // semplice. Il cron della posta lo ripesca da solo se la mail è
          // ancora sul server (ultimi 2 giorni).
          <p className="descrizione mail-aperta-corpo vuoto">
            Questa mail è arrivata senza testo semplice — era scritta solo in HTML, e allora il
            corpo non veniva conservato. Se è degli ultimi due giorni il corpo torna da solo al
            prossimo scarico della posta; altrimenti si legge dalla casella, con «Apri in Inbox».
          </p>
        )}

        <div className="mail-aperta-piede">
          <a className="btn btn-secondario small" href={`/inbox?c=${conversazione.id}`}>
            Apri in Inbox
          </a>
        </div>
      </div>
    </div>
  )
}

export function MessaggiOrdine({ ordineId }: { ordineId: string }) {
  const [conversazioni, setConversazioni] = useState<ConversazioneOrdine[] | null>(null)
  const [bozze, setBozze] = useState<Record<string, string>>({})
  const [inviando, setInviando] = useState('')
  const [errore, setErrore] = useState('')
  // Quale messaggio è aperto nel pop-up. Si tengono gli ID e non l'oggetto:
  // dopo una risposta la lista si ricarica, e un oggetto congelato mostrerebbe
  // una copia vecchia di quello che c'è sotto.
  const [aperto, setAperto] = useState<{ conversazioneId: string; messaggioId: string } | null>(
    null
  )

  const carica = useCallback(async () => {
    try {
      const res = await fetch(`/api/ordini/${ordineId}/messaggi`)
      if (!res.ok) return
      const d = (await res.json()) as { conversazioni: ConversazioneOrdine[] }
      setConversazioni(d.conversazioni ?? [])
    } catch {
      setConversazioni([])
    }
  }, [ordineId])

  useEffect(() => {
    carica()
  }, [carica])

  async function rispondi(conversazioneId: string) {
    const testo = (bozze[conversazioneId] ?? '').trim()
    if (!testo || inviando) return
    setInviando(conversazioneId)
    setErrore('')
    try {
      // La stessa rotta dell'Inbox: la risposta esce dal canale della
      // conversazione e dall'account che aveva ricevuto, senza scorciatoie.
      const res = await fetch(`/api/conversazioni/${conversazioneId}/messaggi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testo }),
      })
      const d = (await res.json().catch(() => ({}))) as { errore?: string }
      if (!res.ok) {
        setErrore(d.errore || 'Invio non riuscito.')
        return
      }
      setBozze((p) => ({ ...p, [conversazioneId]: '' }))
      await carica()
    } catch {
      setErrore('Invio non riuscito: problema di rete.')
    } finally {
      setInviando('')
    }
  }

  // ⚠️ Mentre carica si tiene il posto invece di sparire: il dettaglio è a tre
  // colonne fisse, e un riquadro che non c'è fa slittare a sinistra quello dopo
  // — per mezzo secondo la colonna «Ordine» finisce dove ci si aspetta i
  // messaggi, e l'occhio deve ricominciare da capo.
  if (conversazioni === null) {
    return (
      <div className="card">
        <h3 style={{ marginTop: 0, fontSize: 15 }}>Messaggi del cliente</h3>
        <p className="cella-sub" style={{ marginBottom: 0 }}>
          Cerco…
        </p>
      </div>
    )
  }
  if (!conversazioni.length) {
    return (
      <div className="card">
        <h3 style={{ marginTop: 0, fontSize: 15 }}>Messaggi del cliente</h3>
        <p className="descrizione" style={{ marginBottom: 0 }}>
          Nessun messaggio collegato a questo ordine. Si collegano da soli quando la mail cita il
          numero d&apos;ordine, o quando il cliente scrive dalla stessa email o dallo stesso numero.
        </p>
      </div>
    )
  }

  // Il messaggio aperto si ripesca ogni volta dai dati freschi: se dopo un
  // ricarico non c'è più (ne teniamo le ultime sei), il pop-up sparisce invece
  // di mostrare un fantasma.
  const conversazioneAperta = aperto
    ? (conversazioni.find((c) => c.id === aperto.conversazioneId) ?? null)
    : null
  const messaggioAperto = conversazioneAperta
    ? (conversazioneAperta.messaggi.find((m) => m.id === aperto?.messaggioId) ?? null)
    : null

  return (
    <div className="card">
      <h3 style={{ marginTop: 0, fontSize: 15 }}>
        Messaggi del cliente{' '}
        <span className="cella-sub">
          {conversazioni.length} conversazion{conversazioni.length === 1 ? 'e' : 'i'}
        </span>
      </h3>

      {errore ? <div className="avviso-errore">{errore}</div> : null}

      {conversazioni.map((c) => (
        <div className="conversazione-ordine" key={c.id}>
          <div className="testa">
            <span className={`badge canale-${c.canale}`}>{NOMI_CANALE[c.canale] ?? c.canale}</span>
            <strong>{c.chi}</strong>
            {/* Perché è collegata: «cita questo ordine» vale più di «stessa
                email», e chi legge deve poterlo sapere. */}
            <span className="cella-sub">{NOMI_LEGAME[c.legame]}</span>
            {c.nonLetti > 0 ? <span className="pill-nonletti">{c.nonLetti}</span> : null}
            <a className="btn btn-secondario small" href={`/inbox?c=${c.id}`}>
              Apri in Inbox
            </a>
          </div>

          <div className="battute">
            {c.messaggi.map((m) => (
              // Cliccabile: l'elenco taglia a 400 caratteri, il pop-up mostra
              // tutto. È un <button> e non un <div> con onClick perché si deve
              // poter arrivare col Tab e aprire con Invio — qui dentro ci sono
              // mail di clienti, e chi lavora in tastiera non deve prendere il
              // mouse per leggerne una.
              <button
                type="button"
                key={m.id}
                className={`battuta ${m.direzione === 'out' ? 'nostra' : 'sua'}`}
                onClick={() => setAperto({ conversazioneId: c.id, messaggioId: m.id })}
                title="Apri il messaggio"
              >
                {m.oggetto ? <span className="oggetto">{m.oggetto}</span> : null}
                <span className="testo">
                  {m.testo.trim().slice(0, 400) || <span className="senza-testo">(senza testo)</span>}
                </span>
                <span className="quando">
                  {quando(m.creatoIl)}
                  {m.direzione === 'out' && m.utenteNome ? ` · ${m.utenteNome}` : ''}
                </span>
              </button>
            ))}
          </div>

          <div className="rispondi">
            <textarea
              rows={2}
              placeholder={`Rispondi su ${NOMI_CANALE[c.canale] ?? c.canale}…`}
              value={bozze[c.id] ?? ''}
              onChange={(e) => setBozze((p) => ({ ...p, [c.id]: e.target.value }))}
            />
            <button
              className="btn"
              onClick={() => rispondi(c.id)}
              disabled={inviando === c.id || !(bozze[c.id] ?? '').trim()}
            >
              {inviando === c.id ? 'Invio…' : 'Invia'}
            </button>
          </div>
        </div>
      ))}

      {messaggioAperto && conversazioneAperta ? (
        <MailAperta
          messaggio={messaggioAperto}
          conversazione={conversazioneAperta}
          onChiudi={() => setAperto(null)}
        />
      ) : null}
    </div>
  )
}
