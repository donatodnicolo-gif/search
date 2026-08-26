'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { riassumiConversazione } from '@/lib/actions'
import type { AzioneDescritta } from '@/lib/appDeluxy'
import { ChiediConversazione } from './ChiediConversazione'

/** Le domande che si fanno DOPO aver letto un riassunto. Sono generiche
 *  apposta: valgono su qualunque scambio, e servono a far partire il gesto —
 *  la domanda vera la si scrive dopo, quando si è visto che risponde. */
const SUGGERIMENTI = ['Sai per quando?', 'Che prezzo hanno fatto?', 'Cosa aspettano da me?']

// I riassunti nuovi hanno msgId (per il link "apri") e, in sospeso, "chi".
// I vecchi possono avere inSospeso come semplici stringhe: si gestiscono entrambi.
type Parte = { chi: string; punto: string; msgId?: string | null }
type Sospeso = string | { cosa: string; chi?: string; msgId?: string | null }
/** Un'azione app che il riassunto propone: «Apri trattativa» se qualcuno
 *  chiede un preventivo, «Registra il preventivo» se un fornitore manda un
 *  prezzo. `msgId` è la mail che PORTA i dati. */
type AzioneProposta = { azioneId: string; perche: string; msgId?: string | null }
/** Un prezzo o un valore dello scambio, con la mail in cui sta scritto. */
type Cifra = { voce: string; valore: string; msgId?: string | null }
type Analisi = {
  sintesi: string
  parti: Parte[]
  inSospeso: Sospeso[]
  cifre?: Cifra[]
  azioni?: AzioneProposta[]
  livello?: Livello
}

/** Quanto a fondo leggere la conversazione. */
type Livello = 'veloce' | 'medio' | 'profondo'

/** ⚠️ Le etichette dicono cosa ottieni, non «quanto è potente»: chi sceglie sta
 *  decidendo quanto tempo dare a una lettura, non che modello usare. */
const LIVELLI: { codice: Livello; etichetta: string; titolo: string }[] = [
  { codice: 'veloce', etichetta: 'Veloce', titolo: 'Due righe: a che punto siamo e chi aspetta cosa' },
  { codice: 'medio', etichetta: 'Medio', titolo: 'Il quadro per punti di vista, con le questioni aperte' },
  {
    codice: 'profondo',
    etichetta: 'Profondo',
    titolo:
      'Tutta la vicenda: come è nata, cosa è stato deciso, cifre e date, e ogni cosa rimasta in sospeso. Ci mette di più',
  },
]

/** Il link "→ apri" al messaggio dove sta il passaggio (se lo conosciamo). */
function ApriMsg({ msgId }: { msgId?: string | null }) {
  if (!msgId) return null
  return (
    <Link
      href={`/messaggio/${msgId}`}
      style={{ marginLeft: 6, fontSize: 12.5, textDecoration: 'underline', whiteSpace: 'nowrap' }}
      title="Apri la mail dove c’è questo passaggio"
    >
      → apri
    </Link>
  )
}
type Salvato = {
  analisi: Analisi
  partecipanti: number
  messaggiVisti: number
  generatoIl: string | Date
}

/**
 * Il quadro "per punti di vista" di una conversazione. L'AI legge tutti i
 * messaggi del thread e dice cosa vuole/dice ogni parte. Generato a richiesta,
 * poi salvato: riaprendo si rivede senza rispendere.
 */
export function RiassuntoConversazione({
  messaggioId,
  iniziale,
  messaggiOra,
  autoAggiorna = false,
  azioniApp = [],
}: {
  messaggioId: string
  iniziale: Salvato | null
  /** Il catalogo delle azioni app (nome, colore, se collegata): serve a
   *  vestire le azioni che il riassunto propone. */
  azioniApp?: AzioneDescritta[]
  /** Quanti messaggi ha ORA la conversazione: se sono più di quelli su cui il
   *  riassunto è stato fatto, quel riassunto è vecchio e va detto. */
  messaggiOra?: number
  /** True se il thread è AI+ e il riassunto è vecchio: lo rigenera da solo
   *  all'apertura, SOLO per questa conversazione (niente conteggi globali). */
  autoAggiorna?: boolean
}) {
  const [dati, setDati] = useState<Salvato | null>(iniziale)
  // Quale livello si sta generando adesso: serve a far capire QUALE dei tre
  // tasti sta lavorando — su «profondo» l'attesa è reale.
  const [ultimo, setUltimo] = useState<Livello | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [autoInCorso, setAutoInCorso] = useState(false)
  const [inCorso, start] = useTransition()

  const genera = (livello: Livello) =>
    start(async () => {
      setErrore(null)
      setUltimo(livello)
      const esito = await riassumiConversazione(messaggioId, livello)
      if (esito.ok && esito.riassunto) setDati(esito.riassunto)
      else setErrore(esito.messaggio)
    })

  // Aggiornamento automatico all'apertura, una volta sola: il thread è AI+ e il
  // riassunto è vecchio (o manca). Riguarda SOLO questa conversazione.
  const fatto = useRef(false)
  useEffect(() => {
    if (!autoAggiorna || fatto.current) return
    fatto.current = true
    let vivo = true
    setAutoInCorso(true)
    riassumiConversazione(messaggioId)
      .then((esito) => {
        if (vivo && esito.ok && esito.riassunto) setDati(esito.riassunto)
      })
      .catch(() => {})
      .finally(() => {
        if (vivo) setAutoInCorso(false)
      })
    return () => {
      vivo = false
    }
  }, [autoAggiorna, messaggioId])

  const lavora = inCorso || autoInCorso

  return (
    <div className="ai-box">
      <div className="ai-box-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <span>Punti di vista della conversazione</span>
        {/* TRE livelli invece di un tasto solo: una conversazione di tre mail
            si legge in dieci secondi e un riassunto lungo è tempo perso; una
            da trenta, prima di una riunione, va sviscerata. */}
        <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
          {LIVELLI.map((l) => {
            // ⚠️ Il tasto del livello ATTIVO deve dire che si può ripremere:
            // acceso e basta sembra uno stato, non un comando — e infatti è
            // stato chiesto «come posso rilanciare il riassunto?» (9/08/2026).
            const corrente = Boolean(dati) && dati?.analisi.livello === l.codice
            return (
              <button
                key={l.codice}
                type="button"
                className={`btn ${corrente ? 'primary' : 'secondary'} small`}
                disabled={lavora}
                title={corrente ? `Rifai la lettura ${l.etichetta.toLowerCase()} da capo` : l.titolo}
                onClick={() => genera(l.codice)}
              >
                {lavora && ultimo === l.codice ? 'Leggo…' : corrente ? `↻ ${l.etichetta}` : l.etichetta}
              </button>
            )
          })}
        </span>
      </div>

      {autoInCorso && (
        <div className="ai-box-text" style={{ color: 'var(--text-tertiary)' }}>
          L’AI sta aggiornando il riassunto di questa conversazione…
        </div>
      )}

      {errore && <div className="ai-box-text" style={{ color: 'var(--red)' }}>{errore}</div>}

      {!dati && !errore && (
        <div className="ai-box-text" style={{ color: 'var(--text-secondary)' }}>
          Più persone in questo scambio. Fai leggere all’AI tutta la conversazione: ti dice
          cosa chiede ogni parte e cosa resta in sospeso. <strong>Veloce</strong> sono due
          righe, <strong>Medio</strong> il quadro completo, <strong>Profondo</strong> tutta
          la vicenda con cifre e date — ci mette di più.
        </div>
      )}

      {dati && (
        <div className="ai-box-text">
          <p style={{ margin: 0 }}>{dati.analisi.sintesi}</p>

          {dati.analisi.parti.length > 0 && (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {dati.analisi.parti.map((p, i) => (
                <div key={i}>
                  <strong>{p.chi}</strong>: {p.punto}
                  <ApriMsg msgId={p.msgId} />
                </div>
              ))}
            </div>
          )}

          {/* LE CIFRE, ESPLICITE. «Ha fornito dettagli sul budget» e «ha
              chiesto conferme sui costi» senza i numeri non dicono niente:
              i prezzi sono la ragione per cui si rilegge uno scambio. Ogni
              valore è copiato ESATTO dalla mail (mai dedotto) e porta il
              link alla mail in cui sta scritto: un numero senza fonte non
              si può verificare, quindi non si può usare. */}
          {(dati.analisi.cifre ?? []).length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 600 }}>Cifre e prezzi</div>
              <table className="cifre-riassunto">
                <tbody>
                  {(dati.analisi.cifre ?? []).map((c, i) => (
                    <tr key={i}>
                      <td className="voce">{c.voce}</td>
                      <td className="valore">
                        {c.valore}
                        <ApriMsg msgId={c.msgId} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {dati.analisi.inSospeso.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 600 }}>In sospeso</div>
              <ul style={{ margin: '4px 0 0 18px' }}>
                {dati.analisi.inSospeso.map((s, i) => {
                  // Vecchi riassunti: stringa. Nuovi: { cosa, chi, msgId }.
                  if (typeof s === 'string') {
                    return <li key={i} style={{ marginTop: 2 }}>{s}</li>
                  }
                  return (
                    <li key={i} style={{ marginTop: 2 }}>
                      {s.cosa}
                      {s.chi && (
                        <span className="muted">
                          {' '}— si aspetta da <strong>{s.chi}</strong>
                        </span>
                      )}
                      <ApriMsg msgId={s.msgId} />
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {/* ⚠️ VECCHIO si dice, non si lascia indovinare: un riassunto fatto
              su 10 messaggi quando ora sono 17 non è sbagliato, è indietro — e
              chi lo legge deve saperlo prima di fidarsene. */}
          {typeof messaggiOra === 'number' && messaggiOra > dati.messaggiVisti && (
            <div style={{ marginTop: 12, fontSize: 12.5 }}>
              <span className="badge neutral">
                <span className="dot" />
                Da aggiornare
              </span>{' '}
              Questa lettura è stata fatta su {dati.messaggiVisti} messaggi, adesso la
              conversazione ne ha {messaggiOra}. Ripremi un livello qui sopra per rifarla.
            </div>
          )}

          {/* LE AZIONI CHE QUESTA CONVERSAZIONE CHIAMA («Apri trattativa» se
              qualcuno chiede un preventivo, «Registra il preventivo» se un
              fornitore manda un prezzo). Il bottone apre lo STESSO dialogo di
              sempre (`aimail:app`): l'AI prepara i dati e la persona conferma
              — qui non parte niente da solo.
              ⚠️ I dati si preparano dalla mail che li PORTA (msgId), non da
              quella che si sta guardando: il prezzo sta nella mail del
              fornitore anche se sei sull'ultima della conversazione. */}
          {(
            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 600 }}>Si può fare da qui</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                {(dati.analisi.azioni ?? []).map((a) => {
                  // L'azione va vestita dal catalogo: se non c'è più (o non è
                  // stato passato), meglio niente che un bottone rotto.
                  const az = azioniApp.find((x) => x.id === a.azioneId)
                  if (!az) return null
                  return (
                    <div key={a.azioneId} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn secondary small"
                        disabled={!az.configurata}
                        title={
                          az.configurata
                            ? `${az.app} — ${az.descrizione} L’AI prepara i dati e confermi tu.`
                            : `${az.app}: chiave non ancora inserita (Impostazioni → App Deluxy).`
                        }
                        onClick={() =>
                          window.dispatchEvent(
                            new CustomEvent('aimail:app', {
                              detail: { messaggioId: a.msgId ?? messaggioId, azioneId: a.azioneId },
                            })
                          )
                        }
                      >
                        <span className={`badge ${az.colore}`} style={{ marginRight: 6 }}>
                          <span className="dot" />
                          {az.app}
                        </span>
                        {az.nome}
                      </button>
                      <span className="muted" style={{ fontSize: 12.5 }}>{a.perche}</span>
                    </div>
                  )
                })}
                {/* ⚠️⚠️ LA PORTA CHE NON DIPENDE DAL MODELLO. I bottoni qui
                    sopra li propone l'AI, e l'AI può tacere: su questo
                    scambio proponeva «Registra il preventivo» e NON «Apri
                    trattativa», perché la giudicava non più «nuova» — e
                    l'utente restava senza strada (26/08/2026, tre volte di
                    seguito). Un elenco suggerito è una scorciatoia: accanto
                    ci vuole sempre l'accesso completo, o la scorciatoia
                    diventa un cancello.
                    Apre lo stesso dialogo con la LISTA delle app, saltando le
                    regole (`scegli: true`): qui l'utente ha già deciso di
                    scegliere lui. */}
                <div>
                  <button
                    type="button"
                    className="azione-riga"
                    title="Scegli tu l'azione fra tutte le app collegate"
                    onClick={() =>
                      window.dispatchEvent(
                        new CustomEvent('aimail:app', { detail: { messaggioId, scegli: true } })
                      )
                    }
                  >
                    ＋ Altra azione…
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ⚠️ La domanda nasce QUI, non in fondo alla pagina.
              Un riassunto risponde a «di cosa si parla» e apre subito la
              domanda dopo — «sai per quando?», «che prezzo hanno fatto?» — e
              finché per farla bisognava scorrere fino in fondo alla mail (dove
              «Chiedi a questa conversazione» c'era già), quella domanda
              finiva rileggendosi le nove mail a mano.
              ⚠️ Non è un doppione da togliere di là: là si arriva dopo aver
              letto la mail, qui dopo aver letto il quadro — sono due momenti
              diversi ([[feedback-non-togliere-azioni]]). */}
          <div style={{ marginTop: 14, borderTop: '1px solid var(--hairline)', paddingTop: 12 }}>
            <ChiediConversazione
              messaggioId={messaggioId}
              quante={messaggiOra ?? dati.messaggiVisti}
              invito="Chiedi qualcosa su questo scambio — es. «Sai per quando?»"
              suggerimenti={SUGGERIMENTI}
            />
          </div>

          <div className="muted" style={{ marginTop: 12, fontSize: 12 }}>
            Su {dati.messaggiVisti} messaggi · {dati.partecipanti}{' '}
            {dati.partecipanti === 1 ? 'parte' : 'parti'}
            {/* Quale livello si sta guardando: se no, riaprendo la pagina, due
                righe possono sembrare un riassunto povero invece che veloce. */}
            {dati.analisi.livello && ` · lettura ${dati.analisi.livello}`}
          </div>
        </div>
      )}
    </div>
  )
}
