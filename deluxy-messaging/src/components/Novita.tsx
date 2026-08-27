'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { avvisaSessioneScaduta } from '@/lib/leggi-json'
import { usePathname, useRouter } from 'next/navigation'
import type { Novita as NovitaDto } from '@/lib/novita'

// ── I RIQUADRI IN BASSO A DESTRA ──
//
// ⚠️⚠️ Chiesto dall'utente il 26/08/2026: «genera un pop-up in basso a destra
// ogni volta che viene compiuta un'azione — nuovo messaggio in inbox, nuovo
// ordine, ordine pagato — in modo che l'utente si accorga di ciò che succede
// nell'app».
//
// Quasi tutto quello che succede qui **lo fa qualcun altro**: un cliente che
// scrive, Shopify che manda un ordine, un collega che paga un fornitore. Finché
// non si andava sulla pagina giusta non lo sapeva nessuno — e le pagine sono
// venti.
//
// ⚠️ Sta nel layout di TUTTE le pagine dietro al login, non nella schermata dei
// riassunti: chi lavora sta dentro una conversazione o dentro un ordine, e
// avvisare solo chi è già sui riassunti vuol dire avvisare nessuno.
//
// ⚠️⚠️ NON DOPPIA GLI AVVISI CHE C'ERANO GIÀ. L'inbox ha il suo suono e la sua
// notifica di sistema (`Inbox.tsx`, `avvisa()`), che partono **solo a scheda
// nascosta**. Questi riquadri fanno l'opposto: si fermano quando la scheda è
// nascosta e parlano quando è davanti. I due non si sovrappongono mai — e sulla
// pagina dell'inbox i messaggi non li ripetono affatto (vedi `pathname`).

/** Quanti riquadri a schermo. Oltre, uno solo che li conta. */
const TETTO_A_SCHERMO = 3
const TETTO_TELEFONO = 2
/** Quanto resta a schermo un riquadro, in millisecondi. */
const DURATA = 9000
/** Ogni quanto si chiede «è successo qualcosa?». */
const RESPIRO = 25000
/** Quanto dura il silenzio quando lo si chiede. */
const SILENZIO = 60 * 60 * 1000
const CHIAVE_SILENZIO = 'messaggi-novita-silenzio'

type InCoda = NovitaDto & { scadeA: number }

export function Novita() {
  const router = useRouter()
  const pathname = usePathname()
  const [coda, setCoda] = useState<InCoda[]>([])
  const [silenzioFinoA, setSilenzioFinoA] = useState(0)
  const [fermo, setFermo] = useState(false)
  const [tetto, setTetto] = useState(TETTO_A_SCHERMO)

  // ⚠️ In un ref e non nello stato: il cursore cambia a ogni giro e non deve
  // ridisegnare niente. Nello stato farebbe ripartire il ciclo delle chiamate a
  // ogni risposta, cioè un secondo ciclo dentro il primo.
  const da = useRef<string>('')
  const viste = useRef<Set<string>>(new Set())
  const spento = useRef(false)
  // ⚠️ Anche la pagina in un ref: `chiedi` non deve rinascere a ogni cambio di
  // schermata, o il giro delle chiamate ripartirebbe da capo — e con lui il
  // primo giro, che azzera il cursore e non mostra niente.
  const dove = useRef(pathname)
  useEffect(() => {
    dove.current = pathname
  }, [pathname])

  // Silenzio: si ricorda fra le pagine.
  useEffect(() => {
    try {
      const v = Number(localStorage.getItem(CHIAVE_SILENZIO) ?? '0')
      if (v > Date.now()) setSilenzioFinoA(v)
    } catch {
      // finestra privata, o dati del sito bloccati: pazienza, non si silenzia
    }
  }, [])

  // Sul telefono i riquadri sono più larghi: tre coprirebbero mezza pagina.
  useEffect(() => {
    const m = window.matchMedia('(max-width: 640px)')
    const applica = () => setTetto(m.matches ? TETTO_TELEFONO : TETTO_A_SCHERMO)
    applica()
    m.addEventListener('change', applica)
    return () => m.removeEventListener('change', applica)
  }, [])

  const chiedi = useCallback(async () => {
    if (spento.current) return
    try {
      const url = da.current ? `/api/novita?da=${encodeURIComponent(da.current)}` : '/api/novita'
      const res = await fetch(url, { cache: 'no-store' })
      // ── LA SESSIONE È SCADUTA MENTRE LA SCHEDA ERA APERTA ──
      //
      // ⚠️⚠️ NON ARRIVA UN 401. Provato sul server vero: senza cookie
      // `/api/novita` risponde **307 verso /login**, perché il middleware la
      // intercetta prima che la rotta esista. `fetch` segue il redirect da solo,
      // e quello che torna è **la pagina di login: HTML, con stato 200**. Cioè
      // `res.ok` è vero, `res.json()` esplode, il `catch` qui sotto se lo mangia
      // — e questo ciclo continua a bussare a una porta chiusa ogni 25 secondi,
      // per sempre, senza che nessuno se ne accorga.
      //
      // Si guardano quindi le tre cose che lo dicono davvero: il redirect, il
      // tipo di contenuto, e il 401 (che resta il caso giusto se un giorno la
      // rotta venisse tolta dal middleware).
      const ct = res.headers.get('content-type') ?? ''
      if (res.status === 401 || res.redirected || !ct.includes('application/json')) {
        avvisaSessioneScaduta()
        spento.current = true
        return
      }
      if (!res.ok) return
      const d = (await res.json()) as { adesso: string; novita: NovitaDto[]; troncato: boolean }
      // ⚠️⚠️ Il cursore è l'ora del SERVER, rimandata indietro tale e quale. Con
      // `Date.now()` del browser un computer avanti di un minuto salterebbe le
      // novità di quel minuto e uno indietro le ripeterebbe per sempre.
      da.current = d.adesso

      // Doppia cintura: il cursore già basta, ma un id già visto non si rifà
      // vedere nemmeno se due chiamate si accavallano.
      let nuove = (d.novita ?? []).filter((a) => !viste.current.has(a.id))
      for (const a of nuove) viste.current.add(a.id)

      // ⚠️⚠️ SULL'INBOX, I MESSAGGI NON SI RIPETONO. Chi sta guardando l'inbox
      // vede la conversazione salire in cima da sola: un riquadro che dice
      // «messaggio da Mario» sopra la riga «Mario» appena comparsa è rumore, ed
      // è la stessa regola che l'inbox applica già alla notifica di sistema. Le
      // altre novità restano: un ordine o un pagamento, lì, non li vede.
      // ⚠️ Il cursore è già avanzato: non tornano dopo, e va bene così — le si
      // è viste dove succedono.
      if ((dove.current ?? '').startsWith('/inbox')) {
        nuove = nuove.filter((a) => a.tipo !== 'messaggio')
      }
      if (!nuove.length) return

      const adesso = Date.now()
      setCoda((c) => {
        // ⚠️⚠️ SE SONO TANTE, UNA SOLA CHE LE CONTA. Sette riquadri in colonna
        // coprono la pagina e non li legge nessuno: chi torna dopo un'ora vuole
        // sapere QUANTE cose sono successe, non rileggerle una per una.
        if (nuove.length > tetto) {
          const per = new Map<string, number>()
          for (const a of nuove) per.set(a.gruppo, (per.get(a.gruppo) ?? 0) + 1)
          const pezzi = [...per.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([g, n]) => `${n} ${n === 1 ? g.replace(/i$/, 'o') : g}`)
          return [
            {
              id: `riassunto:${adesso}`,
              tipo: 'riassunto',
              gruppo: 'novità',
              titolo: `${nuove.length}${d.troncato ? '+' : ''} novità`,
              dettaglio: pezzi.join(' · '),
              quando: new Date().toISOString(),
              // ⚠️ Porta alla schermata dei riassunti: è l'unica che le mostra
              // tutte insieme. Mandare a una delle venti pagine vorrebbe dire
              // sceglierne una a caso.
              link: '/',
              gravita: nuove.some((a) => a.gravita === 'attenzione')
                ? ('attenzione' as const)
                : ('info' as const),
              scadeA: adesso + DURATA,
            },
            ...c,
          ].slice(0, tetto)
        }
        // ⚠️ Le nuove in cima e il taglio in fondo: quando ne arriva una mentre
        // ce ne sono già tre, a sparire è la più vecchia — che è anche quella
        // già letta.
        const conNuove = nuove.map((a) => ({ ...a, scadeA: adesso + DURATA }))
        return [...conNuove, ...c].slice(0, tetto)
      })
    } catch {
      // rete assente: al giro dopo. Il cursore non si muove, quindi non si
      // perde niente.
    }
  }, [tetto])

  // ⚠️⚠️ IL SILENZIO SCADE DA SOLO. Prima l'effetto qui sotto usciva subito e
  // **non aveva niente che lo risvegliasse**: allo scadere dell'ora nessuna
  // dipendenza cambiava, non c'era nessun timer, e gli avvisi restavano spenti
  // fino a un ricaricamento della pagina. «Silenzia per un'ora» voleva dire «fino
  // a quando ricarichi», che è una cosa diversa da quella scritta sul bottone.
  useEffect(() => {
    const manca = silenzioFinoA - Date.now()
    if (manca <= 0) return
    const t = setTimeout(() => setSilenzioFinoA(0), manca + 500)
    return () => clearTimeout(t)
  }, [silenzioFinoA])

  // ── IL GIRO DELLE CHIAMATE ──
  useEffect(() => {
    if (silenzioFinoA > Date.now()) return
    let vivo = true
    let t: ReturnType<typeof setTimeout> | null = null

    const giro = async () => {
      // ⚠️⚠️ SCHEDA NASCOSTA: non si chiede niente. Nessuno sta guardando, e i
      // riquadri si accumulerebbero per una pagina che non è a schermo (di
      // quello si occupa la notifica di sistema dell'inbox). Al ritorno si
      // chiede subito con lo STESSO cursore: quindi non si perde niente, e ciò
      // che è successo nel frattempo arriva come un riassunto solo — che è
      // esattamente quello che serve a chi torna.
      if (!document.hidden) await chiedi()
      if (vivo) t = setTimeout(giro, RESPIRO)
    }
    // La prima chiamata prende solo il segnaposto: non mostra niente.
    giro()

    const alRitorno = () => {
      if (!document.hidden) chiedi()
    }
    document.addEventListener('visibilitychange', alRitorno)
    return () => {
      vivo = false
      if (t) clearTimeout(t)
      document.removeEventListener('visibilitychange', alRitorno)
    }
  }, [chiedi, silenzioFinoA])

  // ── CHI SPARISCE DA SOLO ──
  //
  // ⚠️ Un orologio solo per tutti, e non un timer per riquadro: col mouse sopra
  // la pila si FERMA — leggere un avviso e vederselo sparire a metà frase è il
  // modo di far cliccare a caso pur di non perderlo.
  useEffect(() => {
    if (!coda.length) return
    const t = setInterval(() => {
      if (fermo) {
        // Fermo: si sposta la scadenza in avanti, così al rilascio ognuno ha
        // ancora il suo tempo.
        setCoda((c) => c.map((a) => ({ ...a, scadeA: a.scadeA + 500 })))
        return
      }
      const ora = Date.now()
      setCoda((c) => (c.some((a) => a.scadeA <= ora) ? c.filter((a) => a.scadeA > ora) : c))
    }, 500)
    return () => clearInterval(t)
  }, [coda.length, fermo])

  const silenzia = () => {
    const fino = Date.now() + SILENZIO
    setSilenzioFinoA(fino)
    setCoda([])
    try {
      localStorage.setItem(CHIAVE_SILENZIO, String(fino))
    } catch {
      // se non si può ricordare, vale solo per questa pagina: meglio di niente
    }
  }

  const riaccendi = () => {
    setSilenzioFinoA(0)
    try {
      localStorage.removeItem(CHIAVE_SILENZIO)
    } catch {
      // niente
    }
    // ⚠️ Il cursore NON si azzera: riaccendendo si vuole sapere cosa succede da
    // adesso, non rivedere l'ora di silenzio appena chiesta.
  }

  // ── IN PAUSA ──
  //
  // ⚠️ Resta una pillola, non il nulla: un interruttore che si spegne e scompare
  // non lo ritrova nessuno, e fra un'ora i riquadri tornerebbero senza che chi
  // li ha zittiti capisca perché.
  if (silenzioFinoA > Date.now()) {
    return (
      <div className="novita-pila novita-pila-muta">
        <button type="button" className="novita-muta" onClick={riaccendi}>
          🔕 Avvisi in pausa fino alle{' '}
          {new Date(silenzioFinoA).toLocaleTimeString('it-IT', {
            hour: '2-digit',
            minute: '2-digit',
          })}{' '}
          · riaccendi
        </button>
      </div>
    )
  }

  if (!coda.length) return null

  return (
    <div
      className="novita-pila"
      role="status"
      aria-live="polite"
      onMouseEnter={() => setFermo(true)}
      onMouseLeave={() => setFermo(false)}
    >
      <button type="button" className="novita-silenzia" onClick={silenzia}>
        🔕 Silenzia per un&apos;ora
      </button>
      {coda.map((a) => (
        <div key={a.id} className={`novita novita-${a.gravita}`}>
          {/* ⚠️ Tutto il riquadro porta alla cosa di cui parla: un avviso che
              dice «è arrivato un messaggio» e poi lascia cercare in quale delle
              seicento conversazioni fa perdere più tempo del silenzio. */}
          <button
            type="button"
            className="novita-corpo"
            onClick={() => {
              setCoda((c) => c.filter((x) => x.id !== a.id))
              router.push(a.link)
            }}
          >
            <span className={`novita-dot novita-dot-${a.tipo}`} aria-hidden />
            <span className="novita-testo">
              <strong>{a.titolo}</strong>
              {a.dettaglio ? <span className="novita-dettaglio">{a.dettaglio}</span> : null}
            </span>
            <span className="novita-ora">
              {new Date(a.quando).toLocaleTimeString('it-IT', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </button>
          <button
            type="button"
            className="novita-chiudi"
            aria-label="Chiudi l'avviso"
            title="Chiudi"
            onClick={() => setCoda((c) => c.filter((x) => x.id !== a.id))}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
