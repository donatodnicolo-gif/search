'use client'

import { useState } from 'react'
import Link from 'next/link'
import { dataBreve } from '@/lib/format'
import { PrioritaButtons } from './PrioritaButtons'
import { AzioniRiga } from './AzioniRiga'
import { ArchiviaDefinitivo } from './ArchiviaDefinitivo'
import { BottoneNonSpam } from './BottoneNonSpam'
import { SpostaSezione } from './SpostaSezione'
import { RispostaAzioni } from './RispostaAzioni'
import { BottoneApp } from './BottoneApp'
import { DelegaReneBottone } from './DelegaRene'
import { AgganciaBottone } from './AgganciaRiga'
import { MailDrag } from './MailDrag'

/** I dati (leggeri, già raggruppati) che servono a disegnare una riga. */
export type RigaData = {
  id: string
  mittente: string
  mittenteNome: string | null
  oggetto: string
  data: Date
  riassunto: string | null
  anteprima: string
  corpoTradotto: string | null
  lingua: string | null
  sezione: { nome: string; colore: string } | null
  bozze: number
  attivita: number
  inviiApp: number
  eventoProposto: boolean
  archiviato: boolean
  cestinato: boolean
  priorita: string | null
  prioritaDa: string | null
  analizzato: boolean
  nel: number
  parti: number
  nonLetti: boolean
  contattoAI: boolean
  /** True se a questa conversazione abbiamo già risposto (c'è una mail in uscita). */
  risposto?: boolean
  /** Solo nei risultati di ricerca: true se è una mail che hai inviato tu. */
  inviata?: boolean
  destinatari?: string
  /** Solo in ricerca: pezzetto di testo attorno alla parola cercata. */
  snippet?: string | null
  /** Solo in ricerca: la parola da evidenziare nello snippet. */
  evidenzia?: string | null
  /** Id della sezione attuale (per lo spostamento rapido). */
  sezioneId?: string | null
}

// Rende un testo con la parola cercata evidenziata (<mark>).
function evidenzia(testo: string, termine?: string | null) {
  const t = (termine ?? '').trim()
  if (!t) return testo
  const re = new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig')
  return testo.split(re).map((p, i) =>
    p.toLowerCase() === t.toLowerCase() ? (
      <mark key={i} className="ricerca-hit">{p}</mark>
    ) : (
      <span key={i}>{p}</span>
    )
  )
}

/** Una riga della posta in arrivo. Client: monta i pulsanti interattivi. */
export function RigaMail({
  r,
  sezioni = [],
  selezionato = false,
  onSelezione,
}: {
  r: RigaData
  sezioni?: { id: string; nome: string }[]
  /** Selezione multipla: la riga è spuntata. */
  selezionato?: boolean
  /** Chiamato quando si spunta/despunta la casella della riga. */
  onSelezione?: (id: string, valore: boolean) => void
}) {
  // Rimozione ottimistica: appena archivi/cestini la riga sparisce all'istante,
  // il server si riallinea al refresh successivo.
  const [nascosto, setNascosto] = useState(false)
  if (nascosto) return null
  return (
    <MailDrag id={r.id} className={`mail-row ${r.nonLetti ? 'non-letto' : ''} ${selezionato ? 'selezionato' : ''}`}>
      <div className="mail-row-head">
        {onSelezione && (
          <label
            className="mail-check"
            title="Seleziona"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={selezionato}
              onChange={(e) => onSelezione(r.id, e.target.checked)}
              aria-label="Seleziona questa mail"
            />
          </label>
        )}
        <Link href={`/messaggio/${r.id}`} className="mail-row-link">
          <div className="mail-top">
            <span className={r.nonLetti ? 'dot-unread' : 'dot-spacer'} />
            <span className="mail-mittente">
              {r.inviata ? `a ${r.destinatari || '—'}` : r.mittenteNome || r.mittente}
            </span>
            {r.inviata && <span className="badge neutral">inviata</span>}
            {r.contattoAI && (
              <span className="ai-toggle-mark" title="Contatto AI (PLUS AI attivo)">
                AI
              </span>
            )}
            {r.nel > 1 && (
              <span className="thread-count" title={`${r.nel} messaggi · ${r.parti} ${r.parti === 1 ? 'parte' : 'parti'}`}>
                {r.nel}
              </span>
            )}
            {!r.inviata && r.risposto && (
              <span className="risposto-mark" title="Hai già risposto a questa conversazione" aria-label="Risposto">
                ↩
              </span>
            )}
          </div>
          <div className="mail-oggetto" style={{ paddingLeft: 17 }}>
            {r.oggetto}
          </div>

          {r.snippet ? (
            // In ricerca: lo snippet col termine evidenziato, così si vede DOVE
            // compare la parola cercata (di solito nel corpo, non nell'oggetto).
            <div className="mail-riassunto" style={{ paddingLeft: 17 }}>
              <span className="muted">{evidenzia(r.snippet, r.evidenzia)}</span>
            </div>
          ) : r.riassunto ? (
            <div className="mail-riassunto" style={{ paddingLeft: 17 }}>
              <span className="ai-mark">AI</span>
              <span>{r.riassunto}</span>
            </div>
          ) : (
            <div className="mail-riassunto" style={{ paddingLeft: 17 }}>
              <span className="muted">
                {r.corpoTradotto ? r.corpoTradotto.replace(/\s+/g, ' ').slice(0, 200) : r.anteprima}
              </span>
            </div>
          )}

          {(r.sezione || r.corpoTradotto || r.attivita > 0 || r.bozze > 0 || r.inviiApp > 0 || r.eventoProposto) && (
            <div className="mail-tags" style={{ paddingLeft: 17 }}>
              {r.corpoTradotto && (
                <span className="badge gold">
                  <span className="dot" />
                  Tradotto{r.lingua ? ` dal ${r.lingua}` : ''}
                </span>
              )}
              {r.inviiApp > 0 && (
                <span className="badge purple">
                  <span className="dot" />
                  Risposta app
                </span>
              )}
              {r.eventoProposto && (
                <span className="badge blue">
                  <span className="dot" />
                  Appuntamento
                </span>
              )}
              {r.sezione && (
                <span className={`badge ${r.sezione.colore}`}>
                  <span className="dot" />
                  {r.sezione.nome}
                </span>
              )}
              {r.attivita > 0 && <span className="badge neutral">{r.attivita} attività</span>}
              {r.bozze > 0 && <span className="badge gold">Bozza pronta</span>}
            </div>
          )}
        </Link>

        <div className="mail-row-side">
          <span className="mail-data">{dataBreve(r.data)}</span>
          <RispostaAzioni id={r.id} />
        </div>
      </div>

      <div style={{ paddingLeft: 17 }}>
        <PrioritaButtons id={r.id} priorita={r.priorita} prioritaDa={r.prioritaDa} analizzato={r.analizzato} />
        <div className="riga-azioni">
          <AzioniRiga id={r.id} archiviato={r.archiviato} cestinato={r.cestinato} onFatto={() => setNascosto(true)} />
          <DelegaReneBottone id={r.id} />
          <AgganciaBottone id={r.id} />
          {r.nel > 1 && (
            <Link href={`/messaggio/${r.id}?ampia=1`} className="azione-riga" title="Apri la conversazione con anche le mail correlate">
              Apri completo
            </Link>
          )}
          <BottoneApp id={r.id} />
          {r.sezione?.nome === 'SPAM' && <BottoneNonSpam id={r.id} />}
          {!r.inviata && <SpostaSezione id={r.id} sezioneAttuale={r.sezioneId ?? null} sezioni={sezioni} />}
          <ArchiviaDefinitivo id={r.id} mittente={r.mittente} />
        </div>
      </div>
    </MailDrag>
  )
}
