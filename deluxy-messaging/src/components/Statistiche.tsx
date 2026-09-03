'use client'

import { useCallback, useEffect, useState } from 'react'
import { chiediJson, frasePerEsito } from '@/lib/leggi-json'
import type { Statistiche as Dati, Tasso, Tempo } from '@/lib/statistiche'

// I NUMERI DELL'APP, IN UNA PAGINA.
//
// ⚠️⚠️ Chiesto dall'utente il 02/09/2026. Le tre regole della pagina — e sono
// scelte di sostanza, non di stile:
//
// 1. **Ogni percentuale mostra la sua base.** «1,8%» da solo non si può
//    giudicare; «1,8% — 8 reclami su 445 ordini» sì.
// 2. **Sui tempi si legge la MEDIANA**, con la media accanto in piccolo. Se le
//    due sono lontane, la distanza è essa stessa il dato: la risposta in chat
//    ha mediana 2 minuti e media 72, cioè quasi tutto è immediato e qualcosa
//    resta indietro un giorno.
// 3. **Quello che i numeri non dicono sta scritto in fondo**, non lasciato
//    intuire: il tempo di risposta conta anche la notte, i reclami sono contati
//    per data di apertura, e così via.

const PERIODI = [
  { giorni: 7, nome: '7 giorni' },
  { giorni: 30, nome: '30 giorni' },
  { giorni: 90, nome: '90 giorni' },
  { giorni: 365, nome: '12 mesi' },
]

function numero(v: number): string {
  return v.toLocaleString('it-IT')
}

function euro(v: number): string {
  return v.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
}

/**
 * Minuti scritti come li direbbe una persona.
 *
 * ⚠️ «899 minuti» non lo legge nessuno: 15 ore sì. E sotto l'ora si tengono i
 * minuti, perché è lì che la differenza si sente.
 */
function durata(minuti: number | null): string {
  if (minuti == null) return '—'
  if (minuti < 1) return 'meno di un minuto'
  if (minuti < 90) return `${Math.round(minuti)} min`
  const ore = minuti / 60
  if (ore < 48) return `${Math.round(ore * 10) / 10} ore`
  return `${Math.round(ore / 24)} giorni`
}

/** Un numero grande con la sua etichetta. */
function Riquadro({
  titolo,
  valore,
  sotto,
}: {
  titolo: string
  valore: string
  sotto?: string
}) {
  return (
    <div className="card" style={{ padding: 12 }}>
      <div className="cella-sub">{titolo}</div>
      <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em', margin: '2px 0' }}>
        {valore}
      </div>
      {sotto ? <div className="cella-sub">{sotto}</div> : null}
    </div>
  )
}

/** Una percentuale che porta con sé numeratore e denominatore. */
function RiquadroTasso({ titolo, t, unita = '' }: { titolo: string; t: Tasso; unita?: string }) {
  return (
    <Riquadro
      titolo={titolo}
      valore={t.percento == null ? '—' : `${t.percento.toLocaleString('it-IT')}%`}
      sotto={
        t.percento == null
          ? 'niente da contare nel periodo'
          : `${unita === '€' ? euro(t.quanti) : numero(t.quanti)} su ${
              unita === '€' ? euro(t.suQuanti) : numero(t.suQuanti)
            }`
      }
    />
  )
}

/** Un tempo: mediana grande, media e casi sotto. */
function RiquadroTempo({ titolo, t }: { titolo: string; t: Tempo }) {
  return (
    <Riquadro
      titolo={titolo}
      valore={durata(t.mediana)}
      sotto={
        t.casi
          ? `media ${durata(t.media)} · su ${numero(t.casi)} casi`
          : 'nessun caso misurabile nel periodo'
      }
    />
  )
}

function Griglia({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gap: 10,
        gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
        marginBottom: 18,
      }}
    >
      {children}
    </div>
  )
}

export function Statistiche() {
  const [dati, setDati] = useState<Dati | null>(null)
  const [giorni, setGiorni] = useState(30)
  const [caricando, setCaricando] = useState(true)
  const [errore, setErrore] = useState('')

  const carica = useCallback(async (g: number) => {
    setCaricando(true)
    setErrore('')
    const e = await chiediJson<Dati>(`/api/statistiche?giorni=${g}`)
    if (e.stato !== 'ok') {
      setErrore(frasePerEsito(e))
      setCaricando(false)
      return
    }
    setDati(e.dati)
    setCaricando(false)
  }, [])

  useEffect(() => {
    void carica(giorni)
  }, [carica, giorni])

  return (
    <main className="contenuto">
      <div
        style={{
          display: 'flex',
          gap: 10,
          alignItems: 'baseline',
          flexWrap: 'wrap',
          marginBottom: 12,
        }}
      >
        <h1 style={{ margin: 0 }}>Statistiche</h1>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {PERIODI.map((p) => (
            <button
              key={p.giorni}
              className={`bottone secondario mini${giorni === p.giorni ? ' attivo' : ''}`}
              onClick={() => setGiorni(p.giorni)}
            >
              {p.nome}
            </button>
          ))}
        </div>
        {caricando ? <span className="cella-sub">calcolo…</span> : null}
      </div>

      {errore ? <div className="avviso-errore">{errore}</div> : null}

      {dati ? (
        <>
          <h2 style={{ fontSize: 15 }}>Ordini</h2>
          <Griglia>
            <Riquadro
              titolo="Ordini nel periodo"
              valore={numero(dati.ordini.totale)}
              sotto={dati.ordini.perMarchio.map((m) => `${m.nome} ${m.quanti}`).join(' · ')}
            />
            <Riquadro
              titolo="Venduto"
              valore={euro(dati.ordini.venduto)}
              sotto={
                dati.ordini.scontrinoMedio == null
                  ? undefined
                  : `scontrino medio ${euro(dati.ordini.scontrinoMedio)}`
              }
            />
            <RiquadroTempo titolo="Tempo di gestione" t={dati.ordini.tempoDiGestione} />
            <RiquadroTasso titolo="Ordini chiusi" t={dati.ordini.gestiti} />
            <RiquadroTasso titolo="Passati in app" t={dati.ordini.inApp} />
            <RiquadroTasso titolo="Consegne spostate" t={dati.ordini.consegneSpostate} />
          </Griglia>

          <h2 style={{ fontSize: 15 }}>Servizio</h2>
          <Griglia>
            <RiquadroTempo titolo="Risposta in chat" t={dati.servizio.tempoDiRisposta} />
            <Riquadro
              titolo="Conversazioni"
              valore={numero(dati.servizio.conversazioni)}
              sotto={`${numero(dati.servizio.messaggiRicevuti)} ricevuti · ${numero(
                dati.servizio.messaggiInviati
              )} inviati`}
            />
            {/* ⚠️⚠️ Il numero che la mediana NASCONDE: una conversazione a cui
                nessuno ha risposto non ha un tempo di risposta, quindi dalla
                mediana sparisce. Senza questo riquadro, «2 minuti» sembrerebbe
                la storia completa. */}
            <RiquadroTasso titolo="Senza nessuna risposta" t={dati.servizio.senzaRisposta} />
            <Riquadro titolo="Chiamate registrate" valore={numero(dati.servizio.chiamate)} />
            <RiquadroTasso
              titolo="Chiamate non di clienti"
              t={dati.servizio.chiamateSenzaOrdine}
            />
          </Griglia>

          <h2 style={{ fontSize: 15 }}>Qualità</h2>
          <Griglia>
            <RiquadroTasso titolo="Reclami sugli ordini" t={dati.qualita.reclami} />
            <RiquadroTasso titolo="Reclami gravi" t={dati.qualita.reclamiGravi} />
            <Riquadro
              titolo="Rimborsi"
              valore={numero(dati.qualita.rimborsiChiesti)}
              sotto={`${numero(dati.qualita.rimborsiEseguiti)} eseguiti · ${euro(
                dati.qualita.rimborsatoEuro
              )}`}
            />
            <RiquadroTasso titolo="Reso sul venduto" t={dati.qualita.rimborsatoSuVenduto} unita="€" />
          </Griglia>

          <h2 style={{ fontSize: 15 }}>Pagamenti e preventivi</h2>
          <Griglia>
            <Riquadro
              titolo="Richieste di pagamento"
              valore={numero(dati.soldi.richiestePagamento)}
            />
            <RiquadroTasso titolo="Richieste pagate" t={dati.soldi.richiestePagate} />
            <RiquadroTempo titolo="Tempo di pagamento" t={dati.soldi.tempoDiPagamento} />
            <Riquadro titolo="Preventivi" valore={numero(dati.soldi.preventivi)} />
            <RiquadroTasso titolo="Preventivi inviati" t={dati.soldi.preventiviInviati} />
          </Griglia>

          <h2 style={{ fontSize: 15 }}>Lavorazione</h2>
          <div className="card" style={{ padding: 12, marginBottom: 18 }}>
            <div className="cella-sub" style={{ marginBottom: 6 }}>
              Dove stanno gli ordini del periodo
            </div>
            {dati.ordini.perStato.map((s) => (
              <div
                key={s.stato}
                style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 4 }}
              >
                <span style={{ width: 150 }}>{s.stato}</span>
                {/* Una barra e non un grafico: si legge in un colpo d'occhio e
                    non porta dentro una libreria per cinque righe. */}
                <span
                  style={{
                    height: 8,
                    borderRadius: 4,
                    background: 'var(--gold, #B8963E)',
                    width: `${dati.ordini.totale ? (s.quanti / dati.ordini.totale) * 100 : 0}%`,
                    minWidth: 2,
                  }}
                />
                <span className="cella-sub">{numero(s.quanti)}</span>
              </div>
            ))}
          </div>

          {/* ── QUELLO CHE I NUMERI NON DICONO ──
              ⚠️⚠️ Sta in fondo ma non è una nota a piè di pagina: un numero
              letto senza sapere che cosa NON conta è peggio di nessun numero. */}
          <div className="card" style={{ padding: 12 }}>
            <div className="cella-nome">Come leggere questi numeri</div>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {dati.avvertenze.map((x) => (
                <li key={x} className="cella-sub" style={{ marginBottom: 4 }}>
                  {x}
                </li>
              ))}
              <li className="cella-sub">
                Sui tempi si legge la <strong>mediana</strong> (la metà dei casi sta sotto): la
                media è scritta accanto, e quando è molto più alta vuol dire che qualche caso è
                rimasto indietro parecchio.
              </li>
            </ul>
          </div>
        </>
      ) : null}
    </main>
  )
}
