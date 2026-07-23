'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { inviaNuovaMail, salvaMinuta } from '@/lib/actions'
import { EditorRicco } from './EditorRicco'
import { Allegati } from './Allegati'
import { CampoDestinatari, type ContattoRubrica } from './CampoDestinatari'
import { AgganciaCompose, type ScelraAggancio } from './AgganciaCompose'
import { mettiFlash } from './Flash'
import { useBozzaAuto } from './useBozzaAuto'
import { caricaAllegatiGrandi, servonoAPezzi } from './caricaAllegati'
import { PRIORITA } from '@/lib/format'

type Props = {
  da: string
  iniziale: { a: string; cc: string; oggetto: string; corpo: string }
  /** Valorizzato quando si sta riprendendo una bozza già salvata. */
  bozzaId?: string
  /** La rubrica, per suggerire i destinatari mentre scrivi. */
  contatti?: ContattoRubrica[]
  /** Le sequenze di follow-up disponibili (da agganciare all'invio). */
  sequenze?: { id: string; nome: string }[]
}

/** Scrittura di una mail da zero (nessun messaggio d'origine). */
export function ComposizioneNuova({ da, iniziale, bozzaId, contatti = [], sequenze = [] }: Props) {
  const [a, setA] = useState(iniziale.a)
  const [cc, setCc] = useState(iniziale.cc)
  const [oggetto, setOggetto] = useState(iniziale.oggetto)
  const [corpo, setCorpo] = useState(iniziale.corpo)
  const [allegati, setAllegati] = useState<File[]>([])
  // Priorità (facoltativa) da dare alla mail che parte: resta sull'inviata.
  const [priorita, setPriorita] = useState('')
  // Sequenza di follow-up da avviare dopo l'invio (facoltativa).
  const [sequenzaId, setSequenzaId] = useState('')
  // Conversazione esistente in cui far finire questa mail (facoltativa).
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
  const [inCorso, startTransition] = useTransition()
  const router = useRouter()

  /** `giaCaricati` = allegati già spediti a pezzi: non vanno rimessi nel form. */
  function campi(conAllegati: boolean, giaCaricati = false) {
    const form = new FormData()
    if (idBozza) form.set('bozzaId', idBozza)
    form.set('modo', 'nuova')
    form.set('a', a)
    form.set('cc', cc)
    form.set('oggetto', oggetto)
    form.set('corpo', corpo)
    if (priorita) form.set('priorita', priorita)
    if (sequenzaId) form.set('sequenzaId', sequenzaId)
    if (aggancio) form.set('agganciaA', aggancio.id)
    if (conAllegati && !giaCaricati) for (const f of allegati) form.append('allegati', f)
    return form
  }

  function salva() {
    setStato(null)
    startTransition(async () => {
      const esito = await salvaMinuta(campi(false))
      setStato(esito)
      if (esito.id) setIdBozza(esito.id)
      router.refresh()
    })
  }

  // Salvataggio automatico: la mail iniziata non si perde anche se cambi pagina
  // senza premere «Salva bozza».
  const cambiato =
    a !== iniziale.a || cc !== iniziale.cc || oggetto !== iniziale.oggetto || corpo !== iniziale.corpo
  const auto = useBozzaAuto({
    // Dopo l'invio MAI più: la bozza è cancellata dal server e risalvarla
    // lascerebbe la copia di una mail già partita.
    attivo: !inCorso && !conferma && !inviato,
    contenuto: `${a} ${cc} ${oggetto} ${corpo}`,
    cambiato,
    salva: async () => {
      const esito = await salvaMinuta(campi(false))
      if (esito.id) setIdBozza(esito.id)
      return esito.id ?? (esito.ok ? (idBozza ?? null) : null)
    },
  })

  function invia() {
    setStato(null)
    startTransition(async () => {
      // Allegati pesanti: caricati PRIMA, a pezzi (il corpo di una richiesta
      // non può superare 4,5 MB, o la mail non parte affatto).
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

      const form = campi(true, gruppo !== null)
      if (gruppo) form.set('allegatiGruppo', gruppo)

      let esito: { ok: boolean; messaggio: string }
      try {
        esito = await inviaNuovaMail(form)
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
        mettiFlash(esito.messaggio)
        router.push('/inviata')
        router.refresh()
      }
    })
  }

  // Gli stessi pulsanti in cima e in fondo: con una mail lunga non si deve
  // scorrere fino in fondo per mandarla.
  const azioni = (
    <>
      <button className="btn secondary" onClick={() => router.push('/')} disabled={inCorso} type="button">
        Annulla
      </button>

      <button className="btn secondary" onClick={salva} disabled={inCorso} type="button">
        Salva bozza
      </button>

      {caricamento && (
        <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{caricamento}</span>
      )}

      {!caricamento && auto.stato !== 'fermo' && (
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
          {auto.stato === 'salvo' ? 'Salvo…' : `Bozza salvata${auto.quando ? ` ${auto.quando}` : ''}`}
        </span>
      )}

      {conferma ? (
        <>
          <button className="btn secondary" onClick={() => setConferma(false)} disabled={inCorso} type="button">
            Torna a modificare
          </button>
          <button className="btn primary" onClick={invia} disabled={inCorso} type="button">
            {inCorso ? 'Invio…' : `Confermi l’invio a ${a || '…'}?`}
          </button>
        </>
      ) : (
        <button
          className="btn primary"
          onClick={() => setConferma(true)}
          disabled={inCorso || !a.trim()}
          type="button"
        >
          Invia
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
          <input type="text" value={da} disabled />
        </div>

        <div className="full">
          <label className="field-label">
            A <span className="req">*</span>
          </label>
          <CampoDestinatari
            value={a}
            onChange={setA}
            contatti={contatti}
            placeholder="Nome o email (dalla rubrica)"
            autoFocus
          />
        </div>

        <div className="full">
          <label className="field-label">Cc</label>
          <CampoDestinatari value={cc} onChange={setCc} contatti={contatti} />
        </div>

        <div className="full">
          <label className="field-label">Oggetto</label>
          <input type="text" value={oggetto} onChange={(e) => setOggetto(e.target.value)} />
        </div>

        {/* Una mail da zero apre una conversazione nuova: da qui la si può
            invece far finire dentro uno scambio già esistente. */}
        <AgganciaCompose scelta={aggancio} onScelta={setAggancio} />

        <div className="full">
          <label className="field-label">Messaggio</label>
          <EditorRicco valoreIniziale={iniziale.corpo} onChange={setCorpo} />
        </div>

        <div className="full">
          <Allegati files={allegati} onChange={setAllegati} />
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
