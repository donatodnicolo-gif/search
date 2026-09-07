'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

const CHIAVE_AUTO = 'aimail:auto'

/** Quanto deve passare fra due giri fatti scattare dal ritorno sull'app.
 *  `focus`/`visibilitychange` scattano molto spesso: senza questo freno,
 *  lavorare normalmente significa chiedere posta di continuo. */
const RITORNO_MIN_MS = 2 * 60 * 1000

/** Etichetta leggibile dell'intervallo ("30 sec", "1 min", "10 min"). */
function etichetta(sec: number): string {
  return sec < 60 ? `${sec} sec` : `${Math.round(sec / 60)} min`
}

// L'intervallo lo sceglie l'utente in Impostazioni ("Controlla la posta ogni").
// Gira solo mentre la finestra è visibile.
export function SyncButton({ intervalloSec = 300 }: { intervalloSec?: number }) {
  const [stato, setStato] = useState<string | null>(null)
  const [ultimo, setUltimo] = useState<Date | null>(null)
  const [auto, setAuto] = useState(true)
  const [inCorso, setInCorso] = useState(false)
  const router = useRouter()

  // La preferenza vive nel browser: è una scelta di questo dispositivo, non
  // dell'account (sul telefono puoi volerlo spento e sul desktop acceso).
  function cambiaAuto(acceso: boolean) {
    setAuto(acceso)
    window.localStorage.setItem(CHIAVE_AUTO, acceso ? 'on' : 'off')
  }

  // Lettura via FETCH a una rotta (non Server Action): così non entra nella
  // coda navigazioni+azioni di Next e l'app resta cliccabile mentre legge.
  // `inCorsoRef` evita che due giri si sovrappongano.
  const inCorsoRef = useRef(false)
  // Quando è stato l'ultimo giro fatto scattare dal ritorno sull'app: `focus`
  // scatta molto più spesso di quanto si creda (anche cliccando nella pagina).
  const ultimoRitornoRef = useRef(0)

  // Quando abbiamo fatto l'ultimo router.refresh(): ogni refresh ri-renderizza
  // TUTTA la pagina (query + lista), quindi durante un drain lungo va diluito.
  const ultimoRefreshRef = useRef(0)
  const refreshOgniTanto = useCallback(
    (forza = false) => {
      const ora = Date.now()
      if (forza || ora - ultimoRefreshRef.current > 15_000) {
        ultimoRefreshRef.current = ora
        router.refresh()
      }
    },
    [router]
  )

  // Un singolo giro breve: chiede la posta nuova (budget ~7s lato server, il
  // cursore avanza da solo) e torna quanti messaggi ha scaricato.
  // `subito`: se true, un giro con novità aggiorna subito la lista (pulsante e
  // timer); se false (drain), il refresh è diluito e ci pensa il chiamante.
  // L'ultimo arrivo che la LISTA A SCHERMO conosce. Parte vuoto: al primo giro
  // si impara il valore (la pagina è appena stata renderizzata, è aggiornata).
  const ultimoArrivoRef = useRef<string | null>(null)

  const unGiro = useCallback(
    async (subito = true): Promise<number> => {
      const res = await fetch('/api/leggi-posta', { method: 'POST' })
      const esito = (await res.json().catch(() => ({}))) as {
        messaggio?: string
        nuovi?: number
        ultimoArrivo?: string | null
      }
      setStato(esito.messaggio ?? null)
      setUltimo(new Date())
      const nuovi = esito.nuovi ?? 0
      // ⚠️ «Scaricato da ME» non basta: il CRON gira ogni 5 minuti e di solito
      // vince la corsa, quindi qui arrivava sempre 0 e la lista restava ferma
      // per ore («io continuo a vedere questo», 02/09/2026 — 5 mail in
      // archivio, vista ferma alle 14:42). Si aggiorna anche quando è CAMBIATO
      // l'ultimo arrivo nel database, cioè quando qualcun altro — il cron — ha
      // scaricato al posto nostro.
      const arrivatoAltrove =
        typeof esito.ultimoArrivo === 'string' &&
        ultimoArrivoRef.current !== null &&
        esito.ultimoArrivo !== ultimoArrivoRef.current
      if (typeof esito.ultimoArrivo === 'string') ultimoArrivoRef.current = esito.ultimoArrivo
      if (nuovi > 0 || arrivatoAltrove) refreshOgniTanto(subito || arrivatoAltrove)
      return nuovi
    },
    [refreshOgniTanto]
  )

  // Giro singolo (pulsante "Aggiorna posta" e timer): non si sovrappone.
  const vai = useCallback(async () => {
    if (inCorsoRef.current) return
    inCorsoRef.current = true
    setInCorso(true)
    try {
      await unGiro()
    } catch {
      setStato('Lettura non riuscita: riprovo al prossimo giro.')
    } finally {
      inCorsoRef.current = false
      setInCorso(false)
    }
  }, [unGiro])

  // ALL'APERTURA dell'app: scarica TUTTA la posta nuova non ancora scaricata,
  // un blocco alla volta, ripetendo il giro breve finché non arriva più niente.
  // Resta in background (fetch) → l'app è usabile mentre scarica; si ferma se
  // lasci la scheda o quando un giro non porta nulla.
  const drena = useCallback(async () => {
    if (inCorsoRef.current) return
    inCorsoRef.current = true
    setInCorso(true)
    let totale = 0
    try {
      for (let giro = 0; giro < 50; giro++) {
        if (document.visibilityState !== 'visible') break
        // Refresh diluito durante il drain: ri-renderizzare tutto a ogni giro
        // consuma CPU inutilmente. Uno finale allinea la lista.
        const nuovi = await unGiro(false)
        totale += nuovi
        if (nuovi <= 0) break // arretrato esaurito
      }
    } catch {
      setStato('Lettura non riuscita: riprovo al prossimo giro.')
    } finally {
      if (totale > 0) refreshOgniTanto(true)
      inCorsoRef.current = false
      setInCorso(false)
    }
  }, [unGiro, refreshOgniTanto])

  // I giri stanno in ref: rifare gli effetti a ogni render li farebbe ripartire
  // da capo di continuo.
  const vaiRef = useRef(vai)
  vaiRef.current = vai

  // Al montaggio (= apertura dell'app) si legge SOLO la preferenza di questo
  // dispositivo.
  //
  // 🔴 **Qui partiva lo scarico di tutta la posta arretrata** — `drena()`, fino
  // a 50 `POST /api/leggi-posta` in fila — e ripartiva a ogni `focus` e a ogni
  // ritorno sulla scheda. Il 07/09/2026 l'utente l'ha detto così: «è lentissima
  // l'apertura dell'applicazione e il refresh della pagina». Era questo: aprire
  // l'app voleva dire avviarlo, ricaricare voleva dire riavviarlo, e ogni giro
  // impegna una lambda con IMAP + AI + scritture mentre la stessa pagina si sta
  // rendendo sul server (tre `Task timed out after 60 seconds` in produzione
  // quel mattino). La posta arretrata non resta indietro: il cron `/api/sync`
  // gira ogni cinque minuti per conto suo.
  //
  // Cosa resta: il timer periodico, il ritorno sull'app (un giro solo, e non
  // più spesso di RITORNO_MIN_MS) e il pulsante — che ora fa lo scarico
  // completo, perché lì è l'utente a chiederlo.
  useEffect(() => {
    setAuto(window.localStorage.getItem(CHIAVE_AUTO) !== 'off')
  }, [])

  useEffect(() => {
    if (!auto) return
    const id = setInterval(() => {
      // Niente sincronizzazioni a vuoto mentre la finestra è nascosta: si
      // riparte quando torni sull'app.
      if (document.visibilityState === 'visible') vaiRef.current()
    }, Math.max(30, intervalloSec) * 1000)
    return () => clearInterval(id)
  }, [auto, intervalloSec])

  // OGNI VOLTA che torni sull'app (scheda in primo piano o finestra rimessa a
  // fuoco): **un giro solo**, e non più spesso di RITORNO_MIN_MS. Prima era lo
  // scarico completo, e `focus` scatta anche cliccando dentro la pagina dopo
  // aver guardato altrove: bastava lavorare normalmente per rilanciarlo di
  // continuo.
  useEffect(() => {
    if (!auto) return
    const alRitorno = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - ultimoRitornoRef.current < RITORNO_MIN_MS) return
      ultimoRitornoRef.current = Date.now()
      vaiRef.current()
    }
    document.addEventListener('visibilitychange', alRitorno)
    window.addEventListener('focus', alRitorno)
    return () => {
      document.removeEventListener('visibilitychange', alRitorno)
      window.removeEventListener('focus', alRitorno)
    }
  }, [auto])

  return (
    <div style={{ padding: '0 10px 4px' }}>
      {/* Il pulsante fa lo scarico COMPLETO dell'arretrato (era un giro solo):
          lo scarico automatico all'apertura non c'è più, e qui è l'utente a
          chiederlo — nessuna capacità persa, solo spostata su chi decide. */}
      <button className="btn primary" onClick={drena} disabled={inCorso} style={{ width: '100%' }}>
        {inCorso ? 'Leggo la posta…' : 'Aggiorna posta'}
      </button>

      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          fontSize: 12,
          color: 'var(--text-secondary)',
          marginTop: 9,
          cursor: 'pointer',
        }}
      >
        <input
          type="checkbox"
          checked={auto}
          onChange={(e) => cambiaAuto(e.target.checked)}
          style={{ width: 14, height: 14, accentColor: 'var(--ink)' }}
        />
        Automatico ogni {etichetta(Math.max(30, intervalloSec))}
      </label>

      {stato && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8, lineHeight: 1.4 }}>
          {stato}
        </div>
      )}
      {ultimo && !stato && (
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 8 }}>
          Ultimo controllo alle {ultimo.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
        </div>
      )}
    </div>
  )
}
