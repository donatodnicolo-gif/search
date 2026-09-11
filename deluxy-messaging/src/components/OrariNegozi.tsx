'use client'
import { useCallback, useEffect, useState } from 'react'
import { chiediJson, frasePerEsito } from '@/lib/leggi-json'
import { Conferma } from '@/components/Conferma'
import {
  adessoRoma,
  calendarioConsegna,
  etichettaFascia,
  leggiFasceTesto,
  scriviFasceTesto,
  GIORNI_IN_ORDINE,
  NOMI_GIORNI,
  NOMI_GIORNI_CORTI,
  REGOLE_CAKE,
  REGOLE_DELUXY,
  REGOLE_FLOWERS,
  scriviDataBreve,
  validaOrario,
  type OrarioNegozioDati,
  type RegoleConsegna,
} from '@/lib/orari-regole'

// ⭐ 10/09/2026 — ORARI NEGOZI (richiesta dell'utente: «crea una sezione ORARI
// NEGOZI dove impostiamo per i negozi shopify apertura del negozio (quindi se
// la data è selezionabile), fasce orarie di consegna con orario minimo e
// massimo, giorni di chiusura»; poi, la sera: «prepara le version to work di
// Shopify in modo tale che tutte le tabelle recepiscano le date da te»).
//
// Una scheda per negozio, tre blocchi: i giorni della settimana in cui è
// aperto, le REGOLE delle fasce (finestra della giornata, durata per oggi /
// domani / oltre, quante fasce saltare dopo quella in corso, ora limite per
// oggi), i giorni di chiusura (data, motivo, «ogni anno»). Sotto, l'anteprima
// dei prossimi 14 giorni CALCOLATA ADESSO: le stesse fasce che vedono il
// cliente sul sito e l'operatore in Nuovo ordine.
//
// ⚠️ Le regole (validazione, «si può scegliere?», quali fasce) NON stanno qui:
// stanno in src/lib/orari-regole.ts, usate anche dal server e dall'API
// pubblica dei siti. Qui si chiamano soltanto.

type Riga = {
  negozio: { id: string; nome: string; dominio: string; attivo: boolean }
  orario: OrarioNegozioDati
  configurato: boolean
  modificatoDa: string | null
  aggiornatoIl: string | null
}

export function OrariNegozi({ amministratore }: { amministratore: boolean }) {
  const [righe, setRighe] = useState<Riga[] | null>(null)
  const [nota, setNota] = useState('')
  const carica = useCallback(async () => {
    const e = await chiediJson<{ negozi: Riga[] }>('/api/orari-negozi')
    if (e.stato !== 'ok') return setNota(frasePerEsito(e))
    setRighe(e.dati.negozi)
    setNota(e.dati.negozi.length ? '' : 'Nessun negozio: si aggiungono dalla pagina Negozi.')
  }, [])
  useEffect(() => {
    carica()
  }, [carica])

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Orari negozi</h1>
          <p className="page-sub">
            Quando si può consegnare, negozio per negozio: i giorni in cui è aperto (cioè quali date si
            possono scegliere), le regole delle fasce orarie (finestra, durata, anticipo, ora limite) e i
            giorni di chiusura. Le stesse regole le legge il sito Shopify per il suo calendario e il modulo
            «Nuovo ordine». Un negozio senza orari salvati non ha regole: il sito tiene le sue.
          </p>
        </div>
      </div>
      {!amministratore ? (
        <p className="descrizione" style={{ marginTop: 0 }}>
          Puoi leggere gli orari; a cambiarli è un amministratore.
        </p>
      ) : null}
      {nota ? <div className="avviso-errore">{nota}</div> : null}
      {righe === null && !nota ? <p style={{ color: 'var(--text-secondary)' }}>Carico…</p> : null}
      <div style={{ display: 'grid', gap: 18 }}>
        {(righe ?? []).map((r) => (
          <SchedaNegozio key={r.negozio.id} riga={r} amministratore={amministratore} onSalvata={carica} />
        ))}
      </div>
    </div>
  )
}

function SchedaNegozio({ riga, amministratore, onSalvata }: { riga: Riga; amministratore: boolean; onSalvata: () => void }) {
  const [dati, setDati] = useState<OrarioNegozioDati>(riga.orario)
  const [sporco, setSporco] = useState(false)
  const [errori, setErrori] = useState<string[]>([])
  const [esito, setEsito] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [chiediAzzera, setChiediAzzera] = useState(false)
  const [oraProva, setOraProva] = useState('')

  useEffect(() => {
    if (!sporco) setDati(riga.orario)
  }, [riga.orario, sporco])

  const cambia = (f: (d: OrarioNegozioDati) => OrarioNegozioDati) => {
    setDati((d) => f(d))
    setSporco(true)
    setEsito('')
  }
  const cambiaRegole = (f: (r: RegoleConsegna) => RegoleConsegna) => cambia((d) => ({ ...d, regole: f(d.regole) }))
  const soloLettura = !amministratore

  async function salva(daSalvare: OrarioNegozioDati = dati) {
    const controllo = validaOrario(daSalvare)
    if (!controllo.ok) return setErrori(controllo.errori)
    setErrori([])
    setSalvando(true)
    try {
      const r = await fetch('/api/orari-negozi', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ negozioId: riga.negozio.id, ...controllo.dati }),
      })
      const d = (await r.json().catch(() => ({}))) as { errore?: string; errori?: string[] }
      if (!r.ok) return setErrori(d.errori?.length ? d.errori : [d.errore ?? 'Non salvato.'])
      setDati(controllo.dati)
      setSporco(false)
      setEsito('Salvato: il sito e Nuovo ordine leggono già queste regole.')
      onSalvata()
    } catch {
      setErrori(['Non salvato: problema di rete.'])
    } finally {
      setSalvando(false)
    }
  }

  async function azzera() {
    setChiediAzzera(false)
    setSalvando(true)
    try {
      const r = await fetch('/api/orari-negozi?negozio=' + encodeURIComponent(riga.negozio.id), { method: 'DELETE' })
      if (!r.ok) {
        const d = (await r.json().catch(() => ({}))) as { errore?: string }
        return setErrori([d.errore ?? 'Non ripristinato.'])
      }
      setSporco(false)
      setErrori([])
      setEsito('Orari cancellati: il negozio è di nuovo senza regole.')
      onSalvata()
    } finally {
      setSalvando(false)
    }
  }

  // L'anteprima si calcola con l'ora italiana di ADESSO, oppure con un'ora di
  // prova scritta dall'amministratore («cosa vede un cliente alle 19:30?»).
  const adesso = adessoRoma()
  const adessoProva = /^([01]\d|2[0-3]):([0-5]\d)$/.test(oraProva)
    ? { data: adesso.data, minuti: Number(oraProva.slice(0, 2)) * 60 + Number(oraProva.slice(3, 5)) }
    : adesso
  const anteprima = calendarioConsegna(dati, adessoProva, {}, 14)
  const aperti = anteprima.filter((g) => g.ok).length
  const r = dati.regole
  const campoNum = (etichetta: string, valore: number, onChange: (n: number) => void, min: number, max: number) => (
    <label className="campo">
      <span title={etichetta}>{etichetta}</span>
      <input type="number" min={min} max={max} value={Number.isFinite(valore) ? valore : ''} disabled={soloLettura} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  )
  const campoOra = (etichetta: string, valore: string, onChange: (s: string) => void) => (
    <label className="campo">
      <span title={etichetta}>{etichetta}</span>
      <input type="time" value={valore} disabled={soloLettura} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
  const stesseRegole = (a: RegoleConsegna, b: RegoleConsegna) => JSON.stringify(a) === JSON.stringify(b)
  const copia = (x: RegoleConsegna): RegoleConsegna => ({ ...x, oggi: { ...x.oggi }, domani: { ...x.domani }, oltre: { ...x.oltre } })
  // ⭐ «CHIUDI IL NEGOZIO OGGI» (utente, 10/09/2026: «consenti sempre in app di
  // chiudere il negozio oggi e così dire ai clienti che possono ordinare da
  // giorno dopo»): oggi entra fra le chiusure e si salva SUBITO — il sito e
  // Nuovo ordine spengono oggi col motivo, la prima data diventa domani.
  const oggiIso = adesso.data
  const chiusuraOggi = dati.giorniChiusura.find((c) => (c.ogniAnno ? c.data.slice(5) === oggiIso.slice(5) : c.data === oggiIso))
  const [chiediChiudiOggi, setChiediChiudiOggi] = useState(false)
  const MOTIVO_CHIUSURA_OGGI = 'chiusura di oggi: si ordina per domani'
  async function chiudiOggi() {
    setChiediChiudiOggi(false)
    await salva({ ...dati, giorniChiusura: [...dati.giorniChiusura, { data: oggiIso, motivo: MOTIVO_CHIUSURA_OGGI, ogniAnno: false }] })
  }
  async function riapriOggi() {
    await salva({ ...dati, giorniChiusura: dati.giorniChiusura.filter((c) => !(c.data === oggiIso && !c.ogniAnno)) })
  }

  // ⭐ 11/09/2026 — LAYOUT SECONDO IL VERDETTO DELL'ARCHITETTO UX&UI (Libro §4
  // «form lunghi»: una colonna, sezioni con titolo, CTA in fondo a destra):
  // · niente due colonne (8 controlli a sinistra e 16 a destra lasciavano 500 px
  //   di vuoto); l'ANTEPRIMA è il feedback del form e sta in una colonna laterale
  //   fissa (sticky) da 360 px sopra i 1100 px, sotto si impila;
  // · i campi sono larghi quanto il valore (ora 112 px, numero 88 px), etichetta
  //   su UNA riga (≤ 22 caratteri), input allineati in basso; la spiegazione è un
  //   solo testo-guida per blocco;
  // · i preset sono un segmented control (valori mutuamente esclusivi), con
  //   «Personalizzato» che si accende da solo quando nessun preset coincide;
  // · «Chiudi il negozio oggi» è secondario (l'unica primaria è Salva) e non
  //   rosso (è reversibile); «Cancella gli orari» è l'azione pericolosa a sinistra.
  const preset = stesseRegole(r, REGOLE_DELUXY) ? 'deluxy' : stesseRegole(r, REGOLE_FLOWERS) ? 'flowers' : stesseRegole(r, REGOLE_CAKE) ? 'cake' : 'personalizzato'
  const oraDiProva = `${String(Math.floor(adessoProva.minuti / 60)).padStart(2, '0')}:${String(adessoProva.minuti % 60).padStart(2, '0')}`

  return (
    <div className="card orari-scheda">
      <div className="orari-testata">
        <div className="orari-titolo">
          <h2>{riga.negozio.nome || riga.negozio.dominio}</h2>
          <span className={`badge ${riga.configurato ? 'verde' : ''}`}>{riga.configurato ? 'impostato' : 'senza orari'}</span>
          {!riga.negozio.attivo ? <span className="badge">negozio sospeso</span> : null}
          {chiusuraOggi ? <span className="badge rosso">oggi chiuso</span> : null}
        </div>
        {amministratore ? (
          chiusuraOggi && !chiusuraOggi.ogniAnno && chiusuraOggi.motivo === MOTIVO_CHIUSURA_OGGI ? (
            <button type="button" className="bottone secondario" disabled={salvando} onClick={riapriOggi}>
              Riapri oggi
            </button>
          ) : !chiusuraOggi ? (
            <button type="button" className="bottone secondario" disabled={salvando} onClick={() => setChiediChiudiOggi(true)} title="Oggi si spegne sul sito e in Nuovo ordine: i clienti ordinano da domani">
              Chiudi il negozio oggi
            </button>
          ) : null
        ) : null}
      </div>
      <p className="orari-sub">
        {riga.negozio.dominio}
        {riga.configurato && riga.aggiornatoIl
          ? ` · ultima modifica ${new Date(riga.aggiornatoIl).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })}${riga.modificatoDa ? ` di ${riga.modificatoDa}` : ''}`
          : ' · nessuno ha ancora impostato niente: finché non salvi, il sito tiene le sue regole e Nuovo ordine usa le fasce storiche del marchio. Qui sotto un punto di partenza da correggere.'}
      </p>

      <div className="orari-corpo">
        <div className="orari-form">
          {/* ── 1. GIORNI DI APERTURA ── */}
          <section className="blocco">
            <h3 className="blocco-titolo">Giorni di apertura</h3>
            <p className="blocco-sub">Nei giorni spenti la data non si può scegliere.</p>
            <div className="giorni-settimana" role="group" aria-label="Giorni della settimana">
              {GIORNI_IN_ORDINE.map((g) => {
                const acceso = dati.giorniApertura.includes(g)
                return (
                  <button
                    key={g}
                    type="button"
                    aria-pressed={acceso}
                    disabled={soloLettura}
                    className={`bottone mini ${acceso ? '' : 'secondario'}`}
                    title={NOMI_GIORNI[g]}
                    onClick={() =>
                      cambia((d) => ({
                        ...d,
                        giorniApertura: acceso ? d.giorniApertura.filter((x) => x !== g) : [...d.giorniApertura, g].sort(),
                      }))
                    }
                  >
                    {NOMI_GIORNI_CORTI[g]}
                  </button>
                )
              })}
            </div>
          </section>

          {/* ── 2. GIORNI DI CHIUSURA ── */}
          <section className="blocco">
            <h3 className="blocco-titolo">Giorni di chiusura</h3>
            <p className="blocco-sub">Una data e il motivo. «Ogni anno» per le feste fisse (Natale, Ferragosto).</p>
            <div className="chiusure">
              {dati.giorniChiusura.map((c, i) => (
                <div key={i} className="chiusura-riga">
                  <input
                    type="date"
                    value={c.data}
                    disabled={soloLettura}
                    aria-label={`Chiusura ${i + 1}: data`}
                    onChange={(e) => cambia((d) => ({ ...d, giorniChiusura: d.giorniChiusura.map((x, j) => (j === i ? { ...x, data: e.target.value } : x)) }))}
                  />
                  <input
                    value={c.motivo}
                    disabled={soloLettura}
                    placeholder="motivo (es. Natale)"
                    aria-label={`Chiusura ${i + 1}: motivo`}
                    className="chiusura-motivo"
                    onChange={(e) => cambia((d) => ({ ...d, giorniChiusura: d.giorniChiusura.map((x, j) => (j === i ? { ...x, motivo: e.target.value } : x)) }))}
                  />
                  <label className="spunta compatta">
                    <input
                      type="checkbox"
                      checked={c.ogniAnno}
                      disabled={soloLettura}
                      onChange={(e) => cambia((d) => ({ ...d, giorniChiusura: d.giorniChiusura.map((x, j) => (j === i ? { ...x, ogniAnno: e.target.checked } : x)) }))}
                    />
                    ogni anno
                  </label>
                  {!soloLettura ? (
                    <button type="button" className="bottone secondario mini" aria-label={`Togli la chiusura ${i + 1}`} onClick={() => cambia((d) => ({ ...d, giorniChiusura: d.giorniChiusura.filter((_, j) => j !== i) }))}>
                      ✕
                    </button>
                  ) : null}
                </div>
              ))}
              {!dati.giorniChiusura.length ? <p className="testo-guida" style={{ margin: 0 }}>Nessun giorno di chiusura.</p> : null}
              {!soloLettura ? (
                <button type="button" className="bottone secondario mini" style={{ alignSelf: 'flex-start' }} onClick={() => cambia((d) => ({ ...d, giorniChiusura: [...d.giorniChiusura, { data: '', motivo: '', ogniAnno: false }] }))}>
                  + Aggiungi giorno
                </button>
              ) : null}
            </div>
          </section>

          {/* ── 2b. GIORNI CON FASCE SPECIALI (utente, 11/09/2026) ── */}
          <section className="blocco">
            <h3 className="blocco-titolo">Giorni con fasce speciali</h3>
            <p className="blocco-sub">
              Quel giorno valgono solo queste fasce, non le regole: la vigilia solo la mattina, una domenica aperta per
              eccezione. Scrivile come «08-12, 14-18».
            </p>
            <div className="chiusure">
              {(dati.giorniSpeciali ?? []).map((g, i) => {
                const capite = leggiFasceTesto(g.testo ?? scriviFasceTesto(g.fasce))
                return (
                  <div key={i} className="speciale-riga">
                    <div className="chiusura-riga">
                      <input
                        type="date"
                        value={g.data}
                        disabled={soloLettura}
                        aria-label={`Giorno speciale ${i + 1}: data`}
                        onChange={(e) => cambia((d) => ({ ...d, giorniSpeciali: (d.giorniSpeciali ?? []).map((x, j) => (j === i ? { ...x, data: e.target.value } : x)) }))}
                      />
                      <input
                        value={g.testo ?? scriviFasceTesto(g.fasce)}
                        disabled={soloLettura}
                        placeholder="fasce, es. 08-12, 14-18"
                        aria-label={`Giorno speciale ${i + 1}: fasce`}
                        className="chiusura-motivo"
                        onChange={(e) => {
                          const testo = e.target.value
                          cambia((d) => ({ ...d, giorniSpeciali: (d.giorniSpeciali ?? []).map((x, j) => (j === i ? { ...x, testo, fasce: leggiFasceTesto(testo) } : x)) }))
                        }}
                      />
                      <label className="spunta compatta">
                        <input
                          type="checkbox"
                          checked={g.ogniAnno}
                          disabled={soloLettura}
                          onChange={(e) => cambia((d) => ({ ...d, giorniSpeciali: (d.giorniSpeciali ?? []).map((x, j) => (j === i ? { ...x, ogniAnno: e.target.checked } : x)) }))}
                        />
                        ogni anno
                      </label>
                      {!soloLettura ? (
                        <button type="button" className="bottone secondario mini" aria-label={`Togli il giorno speciale ${i + 1}`} onClick={() => cambia((d) => ({ ...d, giorniSpeciali: (d.giorniSpeciali ?? []).filter((_, j) => j !== i) }))}>
                          ✕
                        </button>
                      ) : null}
                    </div>
                    {/* Quello che è stato capito, subito sotto: chi scrive «9-11, 15:30-17» vede le pillole e sa se torna. */}
                    <div className="pillole-fasce speciale-capite">
                      {capite.length ? (
                        capite.map((f) => (
                          <span key={f.da} className="pillola-fascia">
                            {etichettaFascia(f)}
                          </span>
                        ))
                      ) : (
                        <span className="motivo-chiuso">nessuna fascia leggibile: scrivi ad esempio «08-12, 14-18»</span>
                      )}
                    </div>
                  </div>
                )
              })}
              {!(dati.giorniSpeciali ?? []).length ? <p className="testo-guida" style={{ margin: 0 }}>Nessun giorno con fasce speciali.</p> : null}
              {!soloLettura ? (
                <button type="button" className="bottone secondario mini" style={{ alignSelf: 'flex-start' }} onClick={() => cambia((d) => ({ ...d, giorniSpeciali: [...(d.giorniSpeciali ?? []), { data: '', ogniAnno: false, fasce: [], testo: '' }] }))}>
                  + Aggiungi giorno speciale
                </button>
              ) : null}
            </div>
          </section>

          {/* ── 3. REGOLE DELLE FASCE ── */}
          <section className="blocco">
            <h3 className="blocco-titolo">Regole delle fasce orarie</h3>
            <p className="blocco-sub">
              Le fasce si calcolano da queste regole, per oggi, domani e i giorni dopo. Sull&apos;ordine si scrivono come le
              scrivono i siti (es. «14-16»).
            </p>
            {!soloLettura ? (
              <div className="segmenti" role="group" aria-label="Regole di partenza">
                <button type="button" className="segmento" aria-pressed={preset === 'deluxy'} onClick={() => cambiaRegole(() => copia(REGOLE_DELUXY))} title="Oggi a 2 ore dalla seconda fascia dopo quella in corso, drop-off 20:00 (18–20 solo 20-22), di notte dalle 10; domani a 1 ora dall'orario minimo del carrello, e dopo le 20 la prima fascia di domani dura 2 ore (08-10 poi 10-11, 11-12…); oltre a 1 ora; finestra 08-22">
                  deluxy.it / business
                </button>
                <button type="button" className="segmento" aria-pressed={preset === 'flowers'} onClick={() => cambiaRegole(() => copia(REGOLE_FLOWERS))} title="Tre fasce 08-12 · 12-16 · 16-20, drop-off 16:00, di notte tutte, dalle 22 domani dalle 12">
                  Flowers
                </button>
                <button type="button" className="segmento" aria-pressed={preset === 'cake'} onClick={() => cambiaRegole(() => copia(REGOLE_CAKE))} title="Tre fasce 08-12 · 12-16 · 16-20, drop-off 14:00, di notte dalle 12, dalle 20 domani dalle 12">
                  Cake
                </button>
                {/* Si accende da solo quando i numeri qui sotto non coincidono con nessun
                    preset: prima quel caso non aveva nome. Non è un comando. */}
                <button type="button" className="segmento" aria-pressed={preset === 'personalizzato'} disabled={preset !== 'personalizzato'} title="Regole scritte a mano, diverse da ogni preset">
                  Personalizzato
                </button>
              </div>
            ) : null}
            <div className="riga-campi">
              {campoOra('Consegna dalle', r.finestraDa, (s) => cambiaRegole((x) => ({ ...x, finestraDa: s })))}
              {campoOra('alle', r.finestraA, (s) => cambiaRegole((x) => ({ ...x, finestraA: s })))}
            </div>

            <div className="sotto-blocco">
              <h4>Oggi (consegna in giornata)</h4>
              <label className="spunta">
                <input type="checkbox" checked={r.oggi.attivo} disabled={soloLettura} onChange={(e) => cambiaRegole((x) => ({ ...x, oggi: { ...x.oggi, attivo: e.target.checked } }))} />
                si consegna anche in giornata
              </label>
              {r.oggi.attivo ? (
                <>
                  <div className="riga-campi">
                    {campoNum('Durata fascia (ore)', r.oggi.durataOre, (n) => cambiaRegole((x) => ({ ...x, oggi: { ...x.oggi, durataOre: n } })), 1, 12)}
                    {campoNum('Fasce da saltare', r.oggi.saltaFasce, (n) => cambiaRegole((x) => ({ ...x, oggi: { ...x.oggi, saltaFasce: n } })), 0, 6)}
                    {campoOra('Ultimo ordine alle', r.oggi.limiteOra, (s) => cambiaRegole((x) => ({ ...x, oggi: { ...x.oggi, limiteOra: s } })))}
                    {campoOra('Di notte, prima dalle', r.oggi.notteDalle, (s) => cambiaRegole((x) => ({ ...x, oggi: { ...x.oggi, notteDalle: s } })))}
                  </div>
                  <label className="spunta" style={{ marginTop: 12 }}>
                    <input type="checkbox" checked={r.oggi.ultimaFasciaFinoAlLimite} disabled={soloLettura} onChange={(e) => cambiaRegole((x) => ({ ...x, oggi: { ...x.oggi, ultimaFasciaFinoAlLimite: e.target.checked } }))} />
                    l&apos;ultima fascia della giornata resta ordinabile fino all&apos;ultimo ordine
                  </label>
                  <p className="testo-guida">
                    Alle 10:30 la fascia in corso è 10-12: con 2 da saltare la prima è 14-16. Dall&apos;ora dell&apos;ultimo
                    ordine (drop-off) si ordina solo per domani; di notte l&apos;anticipo si conta dall&apos;apertura.
                  </p>
                </>
              ) : null}
            </div>

            <div className="sotto-blocco">
              <h4>Domani</h4>
              <div className="riga-campi">
                {campoNum('Durata fascia (ore)', r.domani.durataOre, (n) => cambiaRegole((x) => ({ ...x, domani: { ...x.domani, durataOre: n } })), 1, 12)}
                {campoNum('Fasce da saltare', r.domani.dopoLimiteSaltaFasce, (n) => cambiaRegole((x) => ({ ...x, domani: { ...x.domani, dopoLimiteSaltaFasce: n } })), 0, 6)}
                {campoOra('…se ordina dopo le', r.domani.saltaDopoOra, (s) => cambiaRegole((x) => ({ ...x, domani: { ...x.domani, saltaDopoOra: s } })))}
                {campoNum('Prima fascia (ore)', r.domani.primaFasciaOre, (n) => cambiaRegole((x) => ({ ...x, domani: { ...x.domani, primaFasciaOre: n } })), 0, 12)}
              </div>
              <p className="testo-guida">
                Le fasce partono dall&apos;orario minimo dei prodotti in carrello (dalle 9 → 09-10, 10-11…). Dopo la soglia la
                prima fascia può durare di più (deluxy.it: 2 ore, poi orarie; 0 = come le altre) o saltare (Flowers e Cake: «dalle 12»).
              </p>
            </div>

            <div className="sotto-blocco">
              <h4>Dopodomani e oltre</h4>
              <div className="riga-campi">
                {campoNum('Durata fascia (ore)', r.oltre.durataOre, (n) => cambiaRegole((x) => ({ ...x, oltre: { durataOre: n } })), 1, 12)}
                {campoNum('Giorni sul sito', r.giorniMostrati, (n) => cambiaRegole((x) => ({ ...x, giorniMostrati: n })), 7, 365)}
              </div>
              <p className="testo-guida">
                L&apos;orario minimo dei prodotti (metafield <code>minimo_orario</code>) e il loro preavviso li passa il sito:
                tolgono le fasce che cominciano prima e i giorni troppo vicini.
              </p>
            </div>
          </section>

          <section className="blocco">
            <label className="campo" style={{ margin: 0 }}>
              <span>Nota (facoltativa, la legge chi apre questa pagina)</span>
              <input value={dati.nota} disabled={soloLettura} maxLength={500} placeholder="es. d'estate si consegna solo la mattina" onChange={(e) => cambia((d) => ({ ...d, nota: e.target.value }))} />
            </label>
          </section>
        </div>

        {/* ── ANTEPRIMA: il feedback del form, sempre in vista ── */}
        <aside className="orari-anteprima" aria-label="Anteprima dei prossimi 14 giorni">
          <h3 className="blocco-titolo">Anteprima</h3>
          <p className="blocco-sub">
            <strong>{aperti}</strong> giorni su 14 in cui si consegna, calcolati alle <strong>{oraDiProva}</strong> (ora italiana).
          </p>
          <label className="spunta compatta" style={{ marginBottom: 12 }}>
            prova come se fossero le
            <input type="time" value={oraProva} onChange={(e) => setOraProva(e.target.value)} aria-label="Ora di prova" className="ora-prova" />
            {oraProva ? (
              <button type="button" className="bottone secondario mini" onClick={() => setOraProva('')}>
                adesso
              </button>
            ) : null}
          </label>
          <table className="tabella tabella-anteprima">
            <thead>
              <tr>
                <th>Giorno</th>
                <th>Stato</th>
                <th>Fasce</th>
              </tr>
            </thead>
            <tbody>
              {anteprima.map((g) => (
                <tr key={g.data}>
                  <td className="giorno">
                    {g.quando === 'oggi' ? 'Oggi ' : g.quando === 'domani' ? 'Domani ' : ''}
                    {scriviDataBreve(g.data).slice(0, 9)}
                  </td>
                  <td>
                    <span className={`badge ${g.ok ? 'verde' : 'rosso'}`}>{g.ok ? (g.speciale ? 'speciale' : 'aperto') : 'chiuso'}</span>
                  </td>
                  <td>
                    {g.ok ? (
                      <div className="pillole-fasce">
                        {g.etichette.map((f) => (
                          <span key={f} className="pillola-fascia">
                            {f}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="motivo-chiuso">{g.motivo}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </aside>
      </div>

      {errori.length ? (
        <div className="avviso-errore" style={{ marginTop: 14 }}>
          {errori.map((e) => (
            <div key={e}>{e}</div>
          ))}
        </div>
      ) : null}
      {esito ? <div className="avviso-ok" style={{ marginTop: 14 }}>{esito}</div> : null}

      {amministratore ? (
        <div className="orari-azioni">
          {riga.configurato ? (
            <button type="button" className="bottone pericoloso" disabled={salvando} onClick={() => setChiediAzzera(true)}>
              Cancella gli orari
            </button>
          ) : null}
          <div className="destra">
            {sporco ? (
              <button
                type="button"
                className="bottone secondario"
                disabled={salvando}
                onClick={() => {
                  setDati(riga.orario)
                  setSporco(false)
                  setErrori([])
                }}
              >
                Annulla le modifiche
              </button>
            ) : null}
            <button type="button" className="bottone" disabled={salvando || !sporco} onClick={() => salva()}>
              {salvando ? 'Salvataggio…' : 'Salva'}
            </button>
          </div>
        </div>
      ) : null}

      {chiediChiudiOggi ? (
        <Conferma titolo={`Chiudere ${riga.negozio.nome || riga.negozio.dominio} per oggi (${scriviDataBreve(oggiIso)})?`} verbo="Chiudi per oggi" pericoloso onConferma={chiudiOggi} onAnnulla={() => setChiediChiudiOggi(false)}>
          Da subito il sito e Nuovo ordine spengono la data di oggi e dicono ai clienti che si ordina da domani. Gli
          ordini già presi non cambiano. Domani il negozio riapre da solo.
          {!riga.configurato ? ' Salverà anche le regole mostrate in questa scheda (finora il negozio era senza orari).' : ''}
          {sporco ? ' Le modifiche non ancora salvate in questa scheda verranno salvate insieme.' : ''}
        </Conferma>
      ) : null}
      {chiediAzzera ? (
        <Conferma titolo={`Cancellare gli orari di ${riga.negozio.nome || riga.negozio.dominio}?`} verbo="Cancella gli orari" pericoloso onConferma={azzera} onAnnulla={() => setChiediAzzera(false)}>
          Si cancellano i giorni di apertura, le regole delle fasce e le chiusure scritte per questo negozio. Il negozio
          resta senza regole: il sito torna alle sue e Nuovo ordine alle fasce storiche del marchio.
        </Conferma>
      ) : null}
    </div>
  )
}
