'use client'

import { useEffect, useState, useTransition } from 'react'
import { useSpostabile } from './useSpostabile'
import { useRouter } from 'next/navigation'
import {
  proponiPerApp,
  eseguiInvioApp,
  cercaPartnerAnagrafiche,
  vociLavoriApp,
  vociAnagraficheApp,
  type PropostaApp,
  type VoceCampo,
} from '@/lib/actions'
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
      <div className="sotto-tabella-wrap">
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
      </div>
    )
  }
  return <pre className="valore-json">{JSON.stringify(valore, null, 2)}</pre>
}

/**
 * Un campo che si compila CERCANDO invece che a memoria: i lavori aperti di
 * Commerciale, le aziende attive di Anagrafiche.
 *
 * ⚠️ Resta un `input` di testo con una `datalist`: la ricerca **suggerisce**,
 * non obbliga. Un lavoro appena nato, o un fornitore che nel registro non c'è
 * ancora, devono essere scrivibili lo stesso — o la scorciatoia diventa un
 * cancello.
 * ⚠️ Scegliendo una voce si scrive anche la sua IDENTITÀ (`campoId`) e, dove
 * previsto, la sua email: due lavori aperti possono chiamarsi uguale, e col
 * solo nome Commerciale risponde «corrisponde a 2 lavori: serve lavoroId».
 * L'id si scrive SOLO su una voce scelta davvero (confronto esatto sul nome).
 */
/**
 * Un campo a SCELTA MULTIPLA: pastiglie che si accendono e si spengono.
 *
 * ⚠️ Non un elenco di caselle di spunta ma delle pastiglie, per la stessa
 * ragione per cui i filtri delle liste lo sono: nove voci in colonna
 * allungherebbero la finestra piu di quanto valga il campo, e questa finestra
 * sta sopra la mail che serve leggere per compilarla.
 *
 * ⚠️ Chi ha scelto si vede a colpo d occhio anche senza leggere: la pastiglia
 * accesa e piena, quella spenta e solo un bordo.
 */
function CampoMulti({
  opzioni,
  scelti,
  onCambia,
}: {
  opzioni: { valore: string; etichetta: string }[]
  scelti: string[]
  onCambia: (nuovi: string[]) => void
}) {
  const acceso = (v: string) => scelti.some((s) => s.toLowerCase() === v.toLowerCase())
  const cambia = (v: string) =>
    onCambia(acceso(v) ? scelti.filter((s) => s.toLowerCase() !== v.toLowerCase()) : [...scelti, v])
  return (
    <div className="multi-pastiglie">
      {opzioni.map((o) => (
        <button
          key={o.valore}
          type="button"
          className={acceso(o.valore) ? "multi-pastiglia accesa" : "multi-pastiglia"}
          aria-pressed={acceso(o.valore)}
          onClick={() => cambia(o.valore)}
        >
          {o.etichetta}
        </button>
      ))}
    </div>
  )
}

function CampoConRicerca({
  campo,
  valore,
  scriviMolti,
}: {
  campo: CampoAzione
  valore: string
  scriviMolti: (patch: Record<string, unknown>) => void
}) {
  const [voci, setVoci] = useState<VoceCampo[]>([])
  const [cercando, setCercando] = useState(false)
  const idLista = `voci-${campo.nome}`

  // I LAVORI si chiedono una volta sola all'apertura: sono pochi e non
  // dipendono da quel che si scrive.
  useEffect(() => {
    if (campo.ricerca !== 'lavori') return
    let vivo = true
    setCercando(true)
    vociLavoriApp()
      .then((v) => {
        if (vivo) setVoci(v)
      })
      .catch(() => {})
      .finally(() => {
        if (vivo) setCercando(false)
      })
    return () => {
      vivo = false
    }
  }, [campo.ricerca])

  // Le AZIENDE si cercano mentre si scrive, con un respiro di 300ms: una
  // chiamata per tasto sarebbe una chiamata sprecata su nove.
  useEffect(() => {
    if (campo.ricerca !== 'anagrafiche') return
    const testo = valore.trim()
    if (testo.length < 2) {
      setVoci([])
      return
    }
    let vivo = true
    setCercando(true)
    const t = setTimeout(() => {
      vociAnagraficheApp(testo)
        .then((v) => {
          if (vivo) setVoci(v)
        })
        .catch(() => {})
        .finally(() => {
          if (vivo) setCercando(false)
        })
    }, 300)
    return () => {
      vivo = false
      clearTimeout(t)
    }
  }, [valore, campo.ricerca])

  const scrivi = (testo: string) => {
    const scelta = voci.find((v) => v.valore.trim().toLowerCase() === testo.trim().toLowerCase())
    const patch: Record<string, unknown> = { [campo.nome]: testo === '' ? null : testo }
    // L'id vale solo per la voce scelta: cambiando il testo a mano, decade.
    if (campo.campoId) patch[campo.campoId] = scelta?.id ?? undefined
    // ⚠️ L'email si scrive solo QUANDO si sceglie: se il testo non combacia con
    // nessuna voce non si cancella quella che c'era (il codice può averla messa
    // dal mittente), e resta comunque nella sua riga, visibile e correggibile.
    if (campo.campoEmail && scelta?.email) patch[campo.campoEmail] = scelta.email
    scriviMolti(patch)
  }

  return (
    <>
      <input
        type="text"
        list={idLista}
        value={valore}
        onChange={(e) => scrivi(e.target.value)}
        placeholder={campo.ricerca === 'lavori' ? 'scegli o scrivi il lavoro' : 'scrivi due lettere e scegli'}
      />
      <datalist id={idLista}>
        {voci.map((v) => (
          <option key={`${v.id ?? ''}-${v.valore}`} value={v.valore}>
            {v.nota}
          </option>
        ))}
      </datalist>
      {/* Quel che l'elenco NON dice va detto: un campo che sembra una tendina e
          resta vuoto fa credere che non ci sia niente da scegliere. */}
      {campo.ricerca === 'lavori' && !cercando && voci.length === 0 && (
        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
          Nessun lavoro aperto da Commerciale (o app non collegata): scrivilo a mano.
        </div>
      )}
      {campo.ricerca === 'anagrafiche' && !cercando && valore.trim().length >= 2 && voci.length === 0 && (
        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
          Nessuna azienda attiva con questo nome in Anagrafiche: puoi scriverlo lo stesso.
        </div>
      )}
    </>
  )
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

  /**
   * Più chiavi in un colpo solo: scegliendo una voce da un campo ricercabile
   * si scrivono insieme il nome, l'id e (dove previsto) l'email.
   * ⚠️ Non si può fare con tre `scrivi` di fila: ognuno riparte da `valori`,
   * che è la fotografia di PRIMA, e i primi due si perderebbero.
   * `undefined` toglie la chiave (l'id decade se il testo non combacia più),
   * stringa vuota = `null` (è così che il registro capisce «non lo so»).
   */
  const scriviMolti = (patch: Record<string, unknown>) => {
    const nuovo: Record<string, unknown> = { ...valori }
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete nuovo[k]
      else nuovo[k] = v === '' ? null : v
    }
    onJson(JSON.stringify(nuovo, null, 2))
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
                  ) : campo?.ricerca ? (
                    <CampoConRicerca campo={campo} valore={valore} scriviMolti={scriviMolti} />
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
                  ) : tipo === 'multi' ? (
                    <CampoMulti
                      opzioni={campo?.opzioni ?? []}
                      scelti={Array.isArray(v) ? v.map(String) : valore ? valore.split(',').map((x) => x.trim()).filter(Boolean) : []}
                      onCambia={(nuovi) => scrivi(chiave, nuovi.length ? nuovi : '')}
                    />
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
      const { messaggioId: id, azioneId, scegli } = (e as CustomEvent).detail as {
        messaggioId: string
        azioneId?: string
        /** Salta le regole e mostra subito l'elenco delle app: chi preme
         *  «Altra azione…» ha già deciso di scegliere lui, e una regola
         *  che lo dirotta su un'altra azione gli toglierebbe la scelta. */
        scegli?: boolean
      }
      setMessaggioId(id)
      setProposta(null)
      setEsito(null)
      setComeJson(false)
      if (scegli) {
        setProposta({ ok: false, scegli: true, messaggio: 'Scegli l’azione da preparare su questa mail.' })
        return
      }
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

  // ⚠️ Questa finestra chiede di compilare campi che stanno scritti NELLA
  // mail sotto (partita IVA, PEC, codice destinatario: vivono nel piè di
  // pagina del messaggio). Poterla spostare non è un vezzo: prima l'unico
  // modo di leggere quei dati era chiuderla e riaprirla.
  const sposta = useSpostabile(Boolean(messaggioId))

  if (!messaggioId) return null

  return (
    <div className="modal-scrim" onClick={chiudi}>
      <div
        className="modal"
        role="dialog"
        aria-label="APP Deluxy"
        ref={sposta.ref}
        style={sposta.stile}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-title trascinabile" {...sposta.maniglia}>
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

        {/* LA CATENA: aperta la trattativa, chi ce l'ha chiesta di solito non è
            ancora in Anagrafiche — si propone il passo dopo, sulla STESSA mail.
            È un invito, non un automatismo: apre questo stesso dialogo da capo,
            con l'AI che prepara e la persona che conferma. */}
        {esito?.ok && proposta?.azione?.dopo && messaggioId && (
          <button
            type="button"
            className="btn secondary small"
            style={{ marginTop: 10 }}
            disabled={inCorso}
            onClick={() => {
              const dopo = proposta.azione!.dopo!
              setEsito(null)
              prepara(messaggioId, dopo.azioneId)
            }}
          >
            → {proposta.azione.dopo.invito}
          </button>
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
