'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { proponiPerApp, eseguiInvioApp, cercaPartnerAnagrafiche, type PropostaApp } from '@/lib/actions'
import type { AzioneDescritta, CampoAzione } from '@/lib/appDeluxy'
import { ChiudiModale, useChiudiConEsc } from './ChiudiModale'

type AziendaTrovata = { id: string; nome: string; citta: string | null; categoria: string | null; stato: string | null }

/** Una chiave non dichiarata → un'etichetta leggibile: `valoreAtteso` →
 *  «Valore atteso». Serve perché la tabella non nasconde MAI un dato, nemmeno
 *  quello che nessuno ha previsto. */
function etichettaDaChiave(chiave: string): string {
  const parole = chiave.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim()
  return parole.charAt(0).toUpperCase() + parole.slice(1).toLowerCase()
}

/** Un valore annidato (le righe di una proforma) mostrato per quello che è.
 *  Non si modifica da qui — per quello c'è «Modifica come JSON» — ma almeno
 *  si LEGGE: prima era una riga di JSON in mezzo alle altre. */
function ValoreAnnidato({ valore }: { valore: unknown }) {
  const righe = Array.isArray(valore) ? valore : null
  const oggetti =
    righe && righe.length > 0 && righe.every((r) => r && typeof r === 'object' && !Array.isArray(r))
      ? (righe as Record<string, unknown>[])
      : null

  if (oggetti) {
    const colonne = [...new Set(oggetti.flatMap((o) => Object.keys(o)))]
    return (
      <table className="sotto-tabella">
        <thead>
          <tr>
            {colonne.map((c) => (
              <th key={c}>{etichettaDaChiave(c)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {oggetti.map((o, i) => (
            <tr key={i}>
              {colonne.map((c) => (
                <td key={c}>{o[c] === null || o[c] === undefined ? '—' : String(o[c])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    )
  }
  return <pre className="valore-json">{JSON.stringify(valore, null, 2)}</pre>
}

/**
 * La TABELLA con cui si controllano i dati prima di mandarli all'app: una riga
 * per voce, con l'etichetta a sinistra e il valore modificabile a destra.
 *
 * Prima al suo posto c'era il JSON grezzo — `"valoreAtteso": null,` — che
 * chiede a chi conferma di fare due lavori insieme: capire cosa dice, e non
 * rompere le virgolette mentre lo corregge.
 *
 * ⚠️⚠️ **La tabella mostra TUTTO quello che c'è nel JSON**, non solo i campi
 * dichiarati in `campi`. Una tabella che facesse vedere solo i campi previsti
 * lascerebbe partire in silenzio quelli che non lo sono: chi conferma
 * crederebbe di aver guardato tutto. I campi dichiarati vengono per primi e
 * nel loro ordine; il resto in fondo, con l'etichetta ricavata dalla chiave.
 *
 * Lavora sempre sul JSON (che resta la forma con cui i dati viaggiano): lo
 * legge all'apertura e lo riscrive a ogni modifica.
 */
function FormAzione({
  campi,
  cercaAzienda,
  json,
  onJson,
}: {
  campi: CampoAzione[]
  cercaAzienda?: boolean
  json: string
  onJson: (v: string) => void
}) {
  // Se il JSON non è leggibile si riparte da un oggetto vuoto (meglio di un
  // modulo rotto: i campi restano compilabili a mano).
  const valori = (() => {
    try {
      const v = JSON.parse(json)
      return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
    } catch {
      return {}
    }
  })()

  const scrivi = (nome: string, valore: unknown) => {
    // Campo svuotato = null (è così che il registro capisce "non lo so"),
    // non stringa vuota.
    onJson(JSON.stringify({ ...valori, [nome]: valore === '' ? null : valore }, null, 2))
  }

  /** Un elenco di parole si scrive separato da virgole, e torna un array:
   *  «Eventi, Consegne» → ["Eventi","Consegne"]. Vuoto = null, non []. */
  const scriviElenco = (nome: string, testo: string) => {
    const voci = testo
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)
    scrivi(nome, voci.length ? voci : '')
  }

  // Le righe della tabella: prima i campi dichiarati, nel loro ordine, poi
  // TUTTO il resto che sta nel JSON.
  //
  // ⚠️ `partnerId`/`partnerNome` sono l'eccezione, e non per comodità: non si
  // battono a mano, si scelgono dalla ricerca qui sopra. Un id di Anagrafiche
  // corretto a dita è un aggancio al record sbagliato
  // ([[trappola-numero-non-e-identita]]), e il nome accanto senza il suo id non
  // vuol dire niente.
  const gestitiAltrove = cercaAzienda ? ['partnerId', 'partnerNome'] : []
  const dichiarati = campi.map((c) => c.nome)
  const righe: { campo?: CampoAzione; chiave: string }[] = [
    ...campi.map((campo) => ({ campo, chiave: campo.nome })),
    ...Object.keys(valori)
      .filter((k) => !dichiarati.includes(k) && !gestitiAltrove.includes(k))
      .map((chiave) => ({ chiave })),
  ]

  const [q, setQ] = useState('')
  const [risultati, setRisultati] = useState<AziendaTrovata[] | null>(null)
  const [cercando, setCercando] = useState(false)
  const partnerId = typeof valori.partnerId === 'string' ? valori.partnerId : ''
  const partnerNome = typeof valori.partnerNome === 'string' ? valori.partnerNome : ''

  const cerca = async () => {
    setCercando(true)
    try {
      setRisultati(await cercaPartnerAnagrafiche(q))
    } catch {
      setRisultati([])
    } finally {
      setCercando(false)
    }
  }

  const scegliAzienda = (a: AziendaTrovata | null) => {
    const nuovo = { ...valori }
    if (a) {
      nuovo.partnerId = a.id
      nuovo.partnerNome = a.nome
    } else {
      delete nuovo.partnerId
      delete nuovo.partnerNome
    }
    onJson(JSON.stringify(nuovo, null, 2))
    setRisultati(null)
    setQ('')
  }

  return (
    <div>
      {cercaAzienda && (
        <div className="aggancio-azienda">
          <label className="field-label">Azienda già in Anagrafiche</label>
          {partnerId ? (
            <div className="aggancio-scelto">
              <span className="badge green">
                <span className="dot" />
                {partnerNome || 'Azienda scelta'}
              </span>
              <span className="muted" style={{ fontSize: 12 }}>
                I dati aggiorneranno questa scheda: nessun doppione.
              </span>
              <button type="button" className="azione-riga" onClick={() => scegliAzienda(null)}>
                Togli
              </button>
            </div>
          ) : (
            <>
              <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: '0 0 8px' }}>
                Cercala per agganciare il contatto a un’azienda che c’è già. Se non la scegli, in
                Anagrafiche viene creata una scheda nuova.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      if (q.trim().length >= 2) cerca()
                    }
                  }}
                  placeholder="Nome dell’azienda, città…"
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="btn secondary small"
                  onClick={cerca}
                  disabled={cercando || q.trim().length < 2}
                >
                  {cercando ? 'Cerco…' : 'Cerca'}
                </button>
              </div>
              {risultati && (
                <div style={{ marginTop: 8 }}>
                  {risultati.length === 0 ? (
                    <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
                      Nessuna azienda trovata: confermando si crea una scheda nuova.
                    </div>
                  ) : (
                    risultati.map((a) => (
                      <div key={a.id} className="aggancio-riga">
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>{a.nome}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                            {[a.categoria, a.citta, a.stato].filter(Boolean).join(' · ') || '—'}
                          </div>
                        </div>
                        <button type="button" className="btn secondary small" onClick={() => scegliAzienda(a)}>
                          Aggancia
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      <table className="tabella-dati" style={{ marginTop: cercaAzienda ? 14 : 0 }}>
        <tbody>
          {righe.map(({ campo, chiave }) => {
            const v = valori[chiave]
            const annidato = v !== null && typeof v === 'object' && !(campo?.tipo === 'elenco' && Array.isArray(v))
            const valore = v === null || v === undefined ? '' : Array.isArray(v) ? v.join(', ') : String(v)
            const tipo = campo?.tipo ?? 'testo'
            return (
              <tr key={chiave}>
                <th scope="row">
                  {campo?.etichetta ?? etichettaDaChiave(chiave)}
                  {campo?.obbligatorio && <span className="req"> *</span>}
                  {campo?.aiuto && <span className="aiuto">{campo.aiuto}</span>}
                </th>
                <td>
                  {annidato ? (
                    <ValoreAnnidato valore={v} />
                  ) : tipo === 'lungo' ? (
                    <textarea value={valore} onChange={(e) => scrivi(chiave, e.target.value)} rows={2} />
                  ) : tipo === 'scelta' ? (
                    <select value={valore} onChange={(e) => scrivi(chiave, e.target.value)}>
                      {/* ⚠️ La voce vuota c'è sempre: «non indicato» è una
                          risposta legittima, e senza di essa il primo valore
                          dell'elenco entrerebbe da solo nei dati. */}
                      <option value="">— non indicato —</option>
                      {(campo?.opzioni ?? []).map((o) => (
                        <option key={o.valore} value={o.valore}>
                          {o.etichetta}
                        </option>
                      ))}
                    </select>
                  ) : tipo === 'elenco' ? (
                    <input
                      type="text"
                      value={valore}
                      onChange={(e) => scriviElenco(chiave, e.target.value)}
                      placeholder="non indicato — separa con la virgola"
                    />
                  ) : (
                    <input
                      type={tipo === 'email' ? 'email' : tipo === 'telefono' ? 'tel' : tipo === 'data' ? 'date' : 'text'}
                      // ⚠️ Anche «numero» resta un campo di TESTO: qui un
                      // importo si scrive «1.250,50», e `type="number"` non
                      // può mostrarlo ([[trappola-input-numerico-italiano]]).
                      // Cambia solo la tastiera che compare sul telefono.
                      inputMode={tipo === 'numero' ? 'decimal' : undefined}
                      value={valore}
                      onChange={(e) => scrivi(chiave, e.target.value)}
                      placeholder="non indicato"
                    />
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Il dialogo APP DELUXY, montato una volta sola nella pagina della posta.
 * Si apre con l'evento `aimail:app` (lo lanciano le carte del pannello al
 * drop e il bottone "→ App" sulla riga). Flusso: l'AI prepara i dati dalla
 * mail → l'utente li controlla (e può ritoccarli) → conferma → invio vero.
 */
export function InvioAppDialog({ azioni }: { azioni: AzioneDescritta[] }) {
  const [messaggioId, setMessaggioId] = useState<string | null>(null)
  const [proposta, setProposta] = useState<PropostaApp | null>(null)
  const [dati, setDati] = useState('')
  // Modulo (predefinito) oppure JSON grezzo, per chi lo preferisce.
  const [comeJson, setComeJson] = useState(false)
  const [esito, setEsito] = useState<{
    ok: boolean
    messaggio: string
    link?: string
    campoScelta?: string
    scelte?: { valore: string; etichetta: string }[]
  } | null>(null)
  const [inCorso, start] = useTransition()
  const router = useRouter()

  const prepara = (id: string, azioneId?: string) =>
    start(async () => {
      setEsito(null)
      const p = await proponiPerApp(id, azioneId)
      setProposta(p)
      setDati(p.dati ?? '')
    })

  useEffect(() => {
    const su = (e: Event) => {
      const { messaggioId: id, azioneId } = (e as CustomEvent).detail as {
        messaggioId: string
        azioneId?: string
      }
      setMessaggioId(id)
      setProposta(null)
      setEsito(null)
      setComeJson(false)
      prepara(id, azioneId)
    }
    window.addEventListener('aimail:app', su)
    return () => window.removeEventListener('aimail:app', su)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const invia = (correzione?: { campo: string; valore: string }) =>
    start(async () => {
      if (!messaggioId || !proposta?.azione) return
      // ⚠️ `dati` è la STRINGA json del riquadro, non un oggetto: la correzione
      // si applica sul contenuto, non con uno spread.
      let daMandare = dati
      if (correzione) {
        try {
          const o = JSON.parse(dati || '{}')
          o[correzione.campo] = correzione.valore
          daMandare = JSON.stringify(o, null, 2)
          setDati(daMandare)
        } catch {
          // JSON scritto a mano e rotto: si manda com'è, l'app dirà cosa non va.
        }
      }
      const r = await eseguiInvioApp(messaggioId, proposta.azione.id, daMandare)
      setEsito(r)
      if (r.ok) router.refresh()
    })

  /**
   * L'app non sapeva quale record intendessimo e ci ha dato i candidati: qui si
   * sceglie e si rimanda subito, senza far ricominciare da capo.
   * ⚠️ Il valore scelto entra anche nei dati a schermo (`setDati`): se l'invio
   * fallisse di nuovo, chi guarda deve vedere con COSA ha riprovato.
   */
  const scegliCandidato = (valore: string) => {
    const campo = esito?.campoScelta
    if (!campo) return
    setEsito(null)
    invia({ campo, valore })
  }

  function chiudi() {
    setMessaggioId(null)
    setProposta(null)
    setEsito(null)
  }

  useChiudiConEsc(Boolean(messaggioId), chiudi)

  if (!messaggioId) return null

  return (
    <div className="modal-scrim" onClick={chiudi}>
      <div className="modal" role="dialog" aria-label="APP Deluxy" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">
          <span>{proposta?.azione ? `${proposta.azione.app} — ${proposta.azione.nome}` : 'APP Deluxy'}</span>
          <ChiudiModale onChiudi={chiudi} />
        </div>

        {/* Sto preparando */}
        {inCorso && !esito && (
          <div className="ai-domanda">
            <span className="ai-mark">AI</span>
            <span>Leggo la mail e preparo i dati…</span>
          </div>
        )}

        {/* Nessuna regola: si sceglie l'app a mano */}
        {!inCorso && proposta && !proposta.ok && proposta.scegli && (
          <>
            <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>{proposta.messaggio}</p>
            <div className="scelta-nuova">
              {azioni.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className="scelta-voce"
                  disabled={!a.configurata}
                  title={a.configurata ? undefined : 'Da collegare: manca la chiave API sul server.'}
                  onClick={() => prepara(messaggioId, a.id)}
                >
                  <span className={`badge ${a.colore}`} style={{ flex: '0 0 auto' }}>
                    <span className="dot" />
                    {a.app}
                  </span>
                  <span>
                    <span className="scelta-titolo">{a.nome}</span>
                    <span className="scelta-sub">
                      {a.configurata ? a.descrizione : 'Da collegare (chiave API mancante).'}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {/* Errore secco */}
        {!inCorso && proposta && !proposta.ok && !proposta.scegli && (
          <div style={{ fontSize: 13, color: 'var(--red)' }}>{proposta.messaggio}</div>
        )}

        {/* La proposta: dati estratti, modificabili prima dell'invio */}
        {!inCorso && proposta?.ok && proposta.azione && !esito?.ok && (
          <>
            <div className="ai-domanda">
              <span className="ai-mark">AI</span>
              <span>
                Ho preparato i dati per «{proposta.azione.nome}». Controllali (puoi correggerli):
                parte solo quando confermi tu.
              </span>
            </div>

            {/* La TABELLA è sempre la vista buona, anche per un'azione che non
                dichiara i suoi campi: in quel caso le etichette si ricavano
                dalle chiavi, che è comunque meglio del JSON. Il JSON resta a un
                clic di distanza per i dati annidati. */}
            {!comeJson ? (
              <FormAzione
                campi={proposta.azione.campi ?? []}
                cercaAzienda={proposta.azione.cercaAzienda}
                json={dati}
                onJson={setDati}
              />
            ) : (
              <textarea
                value={dati}
                onChange={(e) => setDati(e.target.value)}
                rows={Math.min(16, Math.max(6, dati.split('\n').length))}
                spellCheck={false}
                style={{ width: '100%', fontFamily: 'ui-monospace, monospace', fontSize: 12.5, lineHeight: 1.5 }}
              />
            )}

            <button
              type="button"
              className="azione-riga"
              style={{ marginTop: 8 }}
              onClick={() => setComeJson((v) => !v)}
            >
              {comeJson ? '← Torna alla tabella' : 'Modifica come JSON'}
            </button>
          </>
        )}

        {/* Esito dell'invio */}
        {esito && (
          <div
            className={esito.ok ? 'ai-domanda' : undefined}
            style={{ marginTop: 10, fontSize: 13, color: esito.ok ? undefined : 'var(--red)' }}
          >
            {esito.ok && <span className="ai-mark">OK</span>}
            <span style={{ whiteSpace: 'pre-wrap' }}>
              {esito.messaggio}
              {esito.link && (
                <>
                  {'\n'}
                  <a href={esito.link} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>
                    Apri l’app
                  </a>
                </>
              )}
            {/* Più record combaciano: si sceglie qui, non nell'altra app. */}
            {!esito.ok && esito.scelte && esito.scelte.length > 0 && (
              <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {esito.scelte.map((s) => (
                  <button
                    key={s.valore}
                    type="button"
                    className="btn secondary small"
                    disabled={inCorso}
                    onClick={() => scegliCandidato(s.valore)}
                  >
                    {s.etichetta}
                  </button>
                ))}
              </div>
            )}
            </span>
          </div>
        )}
        {esito?.ok && (
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            La risposta resta salvata sulla mail, in fondo, sotto «Risposte dalle app».
          </p>
        )}

        <div className="form-footer" style={{ marginTop: 14 }}>
          <button className="btn secondary" type="button" onClick={chiudi} disabled={inCorso}>
            {esito?.ok ? 'Chiudi' : 'Annulla'}
          </button>
          {proposta?.ok && proposta.azione && !esito?.ok && (
            <button className="btn primary" type="button" onClick={() => invia()} disabled={inCorso || !dati.trim()}>
              {inCorso ? 'Invio…' : `Conferma e invia a ${proposta.azione.app}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
