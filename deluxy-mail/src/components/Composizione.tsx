'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { inviaMessaggio, salvaMinuta } from '@/lib/actions'
import { EditorRicco } from './EditorRicco'
import { Allegati } from './Allegati'
import { CampoDestinatari, type ContattoRubrica } from './CampoDestinatari'
import { AgganciaCompose, type ScelraAggancio } from './AgganciaCompose'
import { mettiFlash } from './Flash'
import { PRIORITA } from '@/lib/format'
import type { Modo } from '@/lib/rispondi'

type Props = {
  messaggioId: string
  modo: Modo
  da: string
  iniziale: { a: string; cc: string; oggetto: string; corpo: string }
  tornaA: string
  /** Valorizzato quando si sta riprendendo una bozza già salvata. */
  bozzaId?: string
  /** La rubrica, per suggerire i destinatari mentre scrivi. */
  contatti?: ContattoRubrica[]
  /** Le sequenze di follow-up disponibili (da agganciare all'invio). */
  sequenze?: { id: string; nome: string }[]
}

export function Composizione({ messaggioId, modo, da, iniziale, tornaA, bozzaId, contatti = [], sequenze = [] }: Props) {
  const [a, setA] = useState(iniziale.a)
  const [cc, setCc] = useState(iniziale.cc)
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
  const [inCorso, startTransition] = useTransition()
  const router = useRouter()

  function campi(conAllegati: boolean) {
    const form = new FormData()
    if (idBozza) form.set('bozzaId', idBozza)
    form.set('messaggioId', messaggioId)
    form.set('modo', modo)
    form.set('a', a)
    form.set('cc', cc)
    form.set('oggetto', oggetto)
    form.set('corpo', corpo)
    if (priorita) form.set('priorita', priorita)
    if (sequenzaId) form.set('sequenzaId', sequenzaId)
    if (aggancio) form.set('agganciaA', aggancio.id)
    // Gli allegati viaggiano solo con l'invio: le bozze non li conservano.
    if (conAllegati) for (const f of allegati) form.append('allegati', f)
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

  function invia() {
    setStato(null)
    startTransition(async () => {
      const esito = await inviaMessaggio(campi(true))
      setStato(esito)
      setConferma(false)
      if (esito.ok) {
        mettiFlash(esito.messaggio)
        router.push(tornaA)
        router.refresh()
      }
    })
  }

  // Gli stessi pulsanti si usano DUE volte: in cima (così non devi scorrere
  // fino in fondo per mandare una mail lunga) e in fondo, dove stavano.
  const azioni = (
    <>
      <button className="btn secondary" onClick={() => router.push(tornaA)} disabled={inCorso} type="button">
        Annulla
      </button>

      <button className="btn secondary" onClick={salva} disabled={inCorso} type="button">
        Salva bozza
      </button>

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
