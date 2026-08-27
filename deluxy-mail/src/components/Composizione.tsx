'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { inviaMessaggio, salvaMinuta, chiediARene } from '@/lib/actions'
import { EditorRicco } from './EditorRicco'
import { Allegati } from './Allegati'
import { CampoDestinatari, type ContattoRubrica } from './CampoDestinatari'
import { AgganciaCompose, type ScelraAggancio } from './AgganciaCompose'
import { mettiFlash, mostraFlash } from './Flash'
import { useBozzaAuto } from './useBozzaAuto'
import { useInvioRapido } from './useInvioRapido'
import { caricaAllegatiGrandi, servonoAPezzi, caricaCorpoGrande, corpoTroppoGrande } from './caricaAllegati'
import { PRIORITA } from '@/lib/format'
import type { Modo } from '@/lib/rispondi'

type Props = {
  messaggioId: string
  modo: Modo
  da: string
  /**
   * TUTTE le tue caselle attive: la tendina «Da» c'è sempre, così una risposta
   * si può far partire da qualunque indirizzo, non solo da quello che l'app
   * ha indovinato. Con una sola casella resta il campo di prima — una tendina
   * con una voce sola è rumore.
   */
  daScelte?: { id: string; email: string; nome: string }[]
  /** Quale delle `daScelte` è quella proposta. */
  daId?: string
  /**
   * Le tue caselle che erano DAVVERO fra i destinatari dell'originale.
   *
   * ⚠️ Serve a sapere se, cambiando mittente, il vecchio indirizzo va rimesso
   * in Cc: ha senso solo se era un destinatario vero, tolto perché stava
   * spedendo lui. Se scegli una casella che non c'entrava niente con quella
   * conversazione, non si aggiunge nessuno.
   */
  daIndirizzate?: string[]
  iniziale: { a: string; cc: string; oggetto: string; corpo: string }
  tornaA: string
  /** Valorizzato quando si sta riprendendo una bozza già salvata. */
  bozzaId?: string
  /** La rubrica, per suggerire i destinatari mentre scrivi. */
  contatti?: ContattoRubrica[]
  /** Le sequenze di follow-up disponibili (da agganciare all'invio). */
  sequenze?: { id: string; nome: string }[]
  /** Chiamata quando si è finito (inviato o annullato): la usa la finestra di
   *  scrittura per chiudersi. Se c'è, sostituisce il ritorno a `tornaA`. */
  onFatto?: () => void
}

export function Composizione({
  messaggioId,
  modo,
  da,
  daScelte = [],
  daId = '',
  daIndirizzate = [],
  iniziale,
  tornaA,
  bozzaId,
  contatti = [],
  sequenze = [],
  onFatto,
}: Props) {
  const [a, setA] = useState(iniziale.a)
  const [cc, setCc] = useState(iniziale.cc)
  // Da quale casella parte. Vale solo quando c'è più di una candidata.
  const [daSceltaId, setDaSceltaId] = useState(daId)
  const sceltaMultipla = daScelte.length > 1
  const [oggetto, setOggetto] = useState(iniziale.oggetto)
  const [corpo, setCorpo] = useState(iniziale.corpo)
  const [allegati, setAllegati] = useState<File[]>([])
  // Priorità (facoltativa) da dare alla mail che parte: resta sull'inviata.
  const [priorita, setPriorita] = useState('')
  // Sequenza di follow-up da avviare dopo l'invio (facoltativa).
  const [sequenzaId, setSequenzaId] = useState('')
  // Conversazione a cui agganciare la mail che parte (solo per l'INOLTRO: una
  // risposta sta già nel thread dell'originale).
  const [aggancio, setAggancio] = useState<ScelraAggancio>(null)
  const [stato, setStato] = useState<{ ok: boolean; messaggio: string } | null>(null)
  // L'invio è irreversibile: prima di partire si conferma.
  const [conferma, setConferma] = useState(false)
  // Salvando due volte non si devono creare due bozze: dal primo salvataggio
  // in poi si aggiorna quella.
  const [idBozza, setIdBozza] = useState(bozzaId)
  // Inviata: da qui in poi niente più salvataggi automatici.
  const [inviato, setInviato] = useState(false)
  // Avanzamento del caricamento degli allegati pesanti.
  const [caricamento, setCaricamento] = useState<string | null>(null)
  // «Chiedi a Renè» dentro la scrittura: pannello, istruzione ed esito.
  const [reneAperto, setReneAperto] = useState(false)
  const [istruzioneRene, setIstruzioneRene] = useState('')
  const [esitoRene, setEsitoRene] = useState<string | null>(null)
  // Cambia quando Renè riscrive: fa rimontare l'editor col testo nuovo.
  const [versioneCorpo, setVersioneCorpo] = useState(0)
  const [inCorso, startTransition] = useTransition()
  const router = useRouter()

  /** `giaCaricati` = gli allegati sono già stati spediti a pezzi: non vanno
   *  rimessi nel form, o si sfonderebbe di nuovo il limite della richiesta. */
  function campi(conAllegati: boolean, giaCaricati = false) {
    const form = new FormData()
    if (idBozza) form.set('bozzaId', idBozza)
    form.set('messaggioId', messaggioId)
    form.set('modo', modo)
    form.set('a', a)
    form.set('cc', cc)
    form.set('oggetto', oggetto)
    form.set('corpo', corpo)
    // ⚠️ Il server NON si fida di questo id: controlla che sia una casella
    // ATTIVA DI CHI STA SCRIVENDO prima di usarlo. Un id qualsiasi infilato
    // qui non fa partire niente da caselle altrui.
    if (sceltaMultipla && daSceltaId) form.set('daCasellaId', daSceltaId)
    if (priorita) form.set('priorita', priorita)
    if (sequenzaId) form.set('sequenzaId', sequenzaId)
    if (aggancio) form.set('agganciaA', aggancio.id)
    // Gli allegati viaggiano solo con l'invio: le bozze non li conservano.
    if (conAllegati && !giaCaricati) for (const f of allegati) form.append('allegati', f)
    return form
  }

  /**
   * Cambiare mittente non è solo cambiare l'etichetta: sistema anche i
   * destinatari.
   *
   * ⚠️⚠️ In «rispondi a tutti» il tuo indirizzo va TOLTO, altrimenti ti
   * rispondi da solo a ogni giro — è la ragione per cui la casella scelta
   * entra nel calcolo dei destinatari, non solo nell'intestazione. Quando
   * passi da `cs@` a `nicolo.donato@`, `nicolo.donato@` deve uscire da A e Cc
   * e `cs@` deve RIENTRARE in Cc: era un destinatario vero di quella mail, ed
   * era sparito solo perché stava spedendo lui.
   */
  function cambiaMittente(id: string) {
    const nuova = daScelte.find((c) => c.id === id)
    const vecchia = daScelte.find((c) => c.id === daSceltaId)
    setDaSceltaId(id)
    if (!nuova) return
    const voci = (v: string) => v.split(',').map((x) => x.trim()).filter(Boolean)
    const senza = (v: string, email: string) =>
      voci(v).filter((x) => !x.toLowerCase().includes(email.toLowerCase()))
    const aNuovo = senza(a, nuova.email)
    const ccNuovo = senza(cc, nuova.email)
    // ⚠️ Il vecchio mittente rientra in Cc SOLO se era un destinatario vero
    // dell'originale. Altrimenti, cambiando casella per un motivo qualsiasi,
    // ci si trascinerebbe dietro un indirizzo che in quella conversazione non
    // era mai comparso.
    // ⚠️⚠️ E solo in «rispondi a TUTTI». Negli altri modi il Cc nasce vuoto per
    // costruzione — «rispondi» risponde al solo mittente, l'inoltro parte
    // senza destinatari — quindi lì la vecchia casella non era «sparita
    // perché stava spedendo lei»: non c'era proprio, e rimetterla dentro
    // significa mandare al cliente una copia che nessuno aveva chiesto.
    const eraDestinatario =
      modo === 'tutti' &&
      vecchia !== undefined &&
      daIndirizzate.some((e) => e.toLowerCase() === vecchia.email.toLowerCase())
    if (vecchia && eraDestinatario) {
      const giaCe = [...aNuovo, ...ccNuovo].some((x) =>
        x.toLowerCase().includes(vecchia.email.toLowerCase())
      )
      if (!giaCe) ccNuovo.push(vecchia.email)
    }
    setA(aNuovo.join(', '))
    setCc(ccNuovo.join(', '))
  }

  /** Il form pronto da spedire: se il CORPO è troppo grande per stare in una
   *  richiesta (inoltri con immagini incorporate) lo si carica prima a pezzi.
   *  Senza questo, né l'invio né il salvataggio della bozza arrivavano. */
  async function formPronto(conAllegati: boolean, giaCaricati = false): Promise<FormData> {
    const form = campi(conAllegati, giaCaricati)
    if (corpoTroppoGrande(corpo)) {
      const gruppo = await caricaCorpoGrande(corpo)
      form.set('corpoGruppo', gruppo)
      form.set('corpo', '')
    }
    return form
  }

  function salva() {
    setStato(null)
    startTransition(async () => {
      try {
        const esito = await salvaMinuta(await formPronto(false))
        setStato(esito)
        if (esito.id) setIdBozza(esito.id)
      } catch (e) {
        setStato({
          ok: false,
          messaggio: `Bozza non salvata: ${e instanceof Error ? e.message.slice(0, 140) : 'errore'}`,
        })
      }
      router.refresh()
    })
  }

  // Salvataggio automatico: quello che inizi a scrivere non si perde, anche se
  // chiudi la finestra o cambi pagina senza premere «Salva bozza».
  const cambiato =
    a !== iniziale.a || cc !== iniziale.cc || oggetto !== iniziale.oggetto || corpo !== iniziale.corpo
  const auto = useBozzaAuto({
    // Dopo l'invio MAI più: la bozza è stata cancellata dal server e
    // risalvarla lascerebbe in giro una copia di una mail già partita.
    attivo: !inCorso && !conferma && !inviato,
    contenuto: `${a} ${cc} ${oggetto} ${corpo}`,
    cambiato,
    salva: async () => {
      const esito = await salvaMinuta(await formPronto(false))
      if (esito.id) setIdBozza(esito.id)
      return esito.id ?? (esito.ok ? (idBozza ?? null) : null)
    },
  })

  function chiediRene() {
    setEsitoRene(null)
    startTransition(async () => {
      try {
        const r = await chiediARene(messaggioId, istruzioneRene, corpo)
        if (r.ok && r.corpo) {
          setCorpo(r.corpo)
          setVersioneCorpo((v) => v + 1) // rimonta l'editor col testo nuovo
          setEsitoRene('Renè ha scritto: controlla e correggi pure prima di inviare.')
          setIstruzioneRene('')
        } else {
          setEsitoRene(r.messaggio)
        }
      } catch (e) {
        setEsitoRene(`Non riuscito: ${e instanceof Error ? e.message.slice(0, 120) : 'errore'}`)
      }
    })
  }

  // `Ctrl+Invio` fa quello che fa il clic su «Invia»: chiede conferma, e alla
  // seconda volta spedisce. Vedi useInvioRapido.ts.
  useInvioRapido({
    attivo: !inCorso && !inviato,
    pronto: Boolean(a.trim()),
    conferma,
    chiediConferma: () => setConferma(true),
    invia: () => invia(),
  })

  function invia() {
    setStato(null)
    startTransition(async () => {
      // Allegati pesanti: si caricano PRIMA, a pezzi. Se andassero dentro
      // l'invio, la piattaforma rifiuterebbe la richiesta (max 4,5 MB) e la
      // mail non partirebbe, con una schermata d'errore e basta.
      let gruppo: string | null = null
      if (servonoAPezzi(allegati)) {
        try {
          setCaricamento('Carico gli allegati… 0%')
          gruppo = await caricaAllegatiGrandi(allegati, (fatti, totali) =>
            setCaricamento(`Carico gli allegati… ${Math.round((fatti / totali) * 100)}%`)
          )
        } catch (e) {
          setCaricamento(null)
          setConferma(false)
          setStato({ ok: false, messaggio: e instanceof Error ? e.message : 'Caricamento non riuscito.' })
          return
        }
        setCaricamento(null)
      }

      let form: FormData
      try {
        form = await formPronto(true, gruppo !== null)
      } catch (e) {
        setConferma(false)
        setStato({
          ok: false,
          messaggio: `Non riesco a caricare il testo della mail: ${e instanceof Error ? e.message.slice(0, 120) : 'errore'}`,
        })
        return
      }
      if (gruppo) form.set('allegatiGruppo', gruppo)

      // Se anche così l'invio fallisce, l'errore si MOSTRA: prima l'eccezione
      // risaliva fino a Next e l'utente vedeva solo una pagina bianca.
      let esito: { ok: boolean; messaggio: string }
      try {
        esito = await inviaMessaggio(form)
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e)
        esito = {
          ok: false,
          messaggio: /body|413|payload|too large|limit/i.test(m)
            ? 'La mail è troppo pesante per essere inviata in un colpo solo: togli qualche allegato e riprova.'
            : `Invio non riuscito: ${m.slice(0, 160)}`,
        }
      }
      setStato(esito)
      setConferma(false)
      if (esito.ok) {
        setInviato(true)
        // Nella finestra si resta dove si è: niente navigazione, solo il
        // banner e la lista che si aggiorna.
        if (onFatto) {
          mostraFlash(esito.messaggio)
          onFatto()
        } else {
          mettiFlash(esito.messaggio)
          router.push(tornaA)
        }
        router.refresh()
      }
    })
  }

  // Gli stessi pulsanti si usano DUE volte: in cima (così non devi scorrere
  // fino in fondo per mandare una mail lunga) e in fondo, dove stavano.
  const azioni = (
    <>
      <button
        className="btn secondary"
        onClick={() => (onFatto ? onFatto() : router.push(tornaA))}
        disabled={inCorso}
        type="button"
      >
        Annulla
      </button>

      <button className="btn secondary" onClick={salva} disabled={inCorso} type="button">
        Salva bozza
      </button>

      {caricamento && (
        <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{caricamento}</span>
      )}

      {/* Stato del salvataggio automatico, discreto accanto ai pulsanti. */}
      {!caricamento && auto.stato !== 'fermo' && (
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
          {auto.stato === 'salvo' ? 'Salvo…' : auto.stato === 'errore' ? '⚠ Bozza NON salvata' : `Bozza salvata${auto.quando ? ` ${auto.quando}` : ''}`}
        </span>
      )}

      {conferma ? (
        <>
          <button className="btn secondary" onClick={() => setConferma(false)} disabled={inCorso} type="button">
            Torna a modificare
          </button>
          <button className="btn primary" onClick={invia} disabled={inCorso} type="button">
            {inCorso ? 'Invio…' : `Confermi l’invio a ${a || '…'}?`}
            {!inCorso && <kbd className="tasto">Ctrl+Invio</kbd>}
          </button>
        </>
      ) : (
        <button
          className="btn primary"
          onClick={() => setConferma(true)}
          disabled={inCorso || !a.trim()}
          type="button"
          title="Invia (Ctrl+Invio, poi Ctrl+Invio per confermare)"
        >
          Invia <kbd className="tasto">Ctrl+Invio</kbd>
        </button>
      )}
    </>
  )

  return (
    <div className="card">
      {/* Barra azioni in alto: identica a quella in fondo. */}
      <div className="form-azioni-alto">{azioni}</div>

      <div className="form-grid">
        <div className="full">
          <label className="field-label">Da</label>
          {sceltaMultipla ? (
            <>
              <select
                value={daSceltaId}
                onChange={(e) => cambiaMittente(e.target.value)}
                aria-label="Da quale casella inviare"
              >
                {daScelte.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome} &lt;{c.email}&gt;
                  </option>
                ))}
              </select>
              <p className="page-caption" style={{ margin: '6px 0 0' }}>
                {daIndirizzate.length > 1
                  ? `Questa mail è arrivata a ${daIndirizzate.length} delle tue caselle: scegli da quale rispondere.`
                  : 'Da quale casella parte.'}{' '}
                Cambiando, l’indirizzo scelto esce dai destinatari (non ti rispondi da solo).
              </p>
            </>
          ) : (
            <input type="text" value={da} disabled />
          )}
        </div>

        <div className="full">
          <label className="field-label">
            A <span className="req">*</span>
          </label>
          <CampoDestinatari
            value={a}
            onChange={setA}
            contatti={contatti}
            placeholder={modo === 'inoltra' ? 'A chi lo inoltri? (scrivi un nome per cercarlo in rubrica)' : 'Nome o email (dalla rubrica)'}
            autoFocus={modo === 'inoltra'}
          />
        </div>

        {/* Il Cc c'è sempre, anche nella risposta singola: prima compariva solo
            in "rispondi a tutti"/inoltro e non si poteva aggiungere nessuno. */}
        <div className="full">
          <label className="field-label">Cc</label>
          <CampoDestinatari value={cc} onChange={setCc} contatti={contatti} />
        </div>

        <div className="full">
          <label className="field-label">Oggetto</label>
          <input type="text" value={oggetto} onChange={(e) => setOggetto(e.target.value)} />
        </div>

        {/* Solo per l'INOLTRO: aprirebbe una conversazione nuova, e spesso lo si
            vuole invece dentro uno scambio esistente. Una risposta no: sta già
            nel thread dell'originale. */}
        {modo === 'inoltra' && <AgganciaCompose scelta={aggancio} onScelta={setAggancio} />}

        {/* Chiedi a Renè: scrive (o riscrive) il testo qui dentro, senza
            cambiare pagina. Il destinatario l'hai già scelto tu sopra. */}
        <div className="full">
          {!reneAperto ? (
            <button type="button" className="azione-riga" onClick={() => setReneAperto(true)}>
              <span className="ai-toggle-mark">AI</span> Chiedi a Renè di scrivere
            </button>
          ) : (
            <div className="ai-box" style={{ marginBottom: 4 }} data-senza-invio-rapido>
              <div className="ai-box-title">Il brief per Renè</div>
              <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: '0 0 8px' }}>
                Buttagli giù i punti — anche a elenco, anche sgrammaticati: prezzi, date,
                condizioni, cosa concedere e cosa no. Scrive lui, col tuo stile e la tua firma,
                e legge tutta la conversazione. Se hai già scritto qualcosa la tiene presente
                («rendila più formale», «aggiungi i prezzi»).
              </p>
              {/* ⚠️ Una RIGA SOLA non era un brief: ci stava «confermo per
                  giovedì», non cinque condizioni con i prezzi. Qui si scrive
                  come si scriverebbe a un collega, e a capo si va davvero
                  (niente invio col tasto Invio: manda il tasto «Scrivi»). */}
              <textarea
                value={istruzioneRene}
                onChange={(e) => setIstruzioneRene(e.target.value)}
                placeholder={
                  'Es.\n- confermiamo per giovedì 14, consegna entro le 11\n- prezzo 380 € + iva, trasporto incluso\n- se chiedono lo sconto: massimo 5%, non oltre\n- chiedi conferma dell’indirizzo di fatturazione'
                }
                rows={5}
                style={{ width: '100%', minHeight: 110, lineHeight: 1.55, resize: 'vertical' }}
                autoFocus
              />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                <button
                  type="button"
                  className="btn primary small"
                  onClick={chiediRene}
                  disabled={inCorso || !istruzioneRene.trim()}
                >
                  {inCorso ? 'Scrivo…' : 'Scrivi'}
                </button>
                <button
                  type="button"
                  className="btn secondary small"
                  onClick={() => setReneAperto(false)}
                  disabled={inCorso}
                >
                  Chiudi
                </button>
              </div>
              {esitoRene && (
                <div style={{ fontSize: 12.5, marginTop: 8, color: 'var(--text-secondary)' }}>{esitoRene}</div>
              )}
            </div>
          )}
        </div>

        <div className="full">
          <label className="field-label">Messaggio</label>
          {/* `key`: l'editor prende il contenuto una volta sola (se no il
              cursore salterebbe a ogni tasto). Quando Renè riscrive il testo si
              rimonta, ed è l'unico modo per sostituirlo davvero. */}
          <EditorRicco key={versioneCorpo} valoreIniziale={corpo} onChange={setCorpo} idAllegati="allegati-risposta" />
        </div>

        <div className="full">
          <Allegati files={allegati} onChange={setAllegati} idInput="allegati-risposta" />
        </div>

        <div className="full">
          <label className="field-label">Priorità (opzionale)</label>
          <div className="prio-group" style={{ marginTop: 4 }}>
            {PRIORITA.map((l) => (
              <button
                key={l.codice}
                type="button"
                className={`prio-btn ${l.colore} ${priorita === l.codice ? 'attivo' : ''}`}
                title={l.quando}
                // Ripremere quella attiva la toglie.
                onClick={() => setPriorita((p) => (p === l.codice ? '' : l.codice))}
              >
                {l.codice}
              </button>
            ))}
          </div>
        </div>

        {sequenze.length > 0 && (
          <div className="full">
            <label className="field-label">Sequenza dopo l’invio (opzionale)</label>
            <select
              value={sequenzaId}
              onChange={(e) => setSequenzaId(e.target.value)}
              style={{ width: 'auto', minWidth: 220 }}
            >
              <option value="">Nessuna</option>
              {sequenze.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </select>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6 }}>
              Se il destinatario non risponde, partono da soli i follow-up della sequenza
              (si gestiscono in Posta → Sequenze).
            </div>
          </div>
        )}
      </div>

      {stato && (
        <div
          style={{
            fontSize: 13,
            marginTop: 14,
            color: stato.ok ? 'var(--green)' : 'var(--red)',
          }}
        >
          {stato.messaggio}
        </div>
      )}

      <div className="form-footer">{azioni}</div>
    </div>
  )
}
