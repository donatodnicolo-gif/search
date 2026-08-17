'use client'

import { memo, useEffect, useState } from 'react'
import Link from 'next/link'
import { dataBreve } from '@/lib/format'
import { ripulisciAnteprima } from '@/lib/citato'
import { PrioritaButtons } from './PrioritaButtons'
import { AzioniRiga } from './AzioniRiga'
import { SegnaLettoRiga } from './SegnaLettoRiga'
import { BottoneNonSpam } from './BottoneNonSpam'
import { SpostaSezione } from './SpostaSezione'
import { RispostaAzioni } from './RispostaAzioni'
import { BottoneApp } from './BottoneApp'
import { DelegaReneBottone } from './DelegaRene'
import { AgganciaBottone } from './AgganciaRiga'
import { NomeThreadBottone } from './NomeThreadRiga'
import { MailDrag } from './MailDrag'
import { pesoLeggibile } from './Ordinamento'

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
  /**
   * Gli id di TUTTE le mail che questa riga rappresenta.
   * ⚠️ Servono perché «✓ Letto» agisca esattamente su quello che la riga
   * mostra. Prima si passava il solo id di testa a `segnaLettoThread`, che la
   * conversazione se la ricalcola per conto suo (finestra di 400 candidati,
   * radice della catena, oggetto): quando i due raggruppamenti non coincidono
   * resta indietro una mail non letta, e la riga **torna blu** — segnalato il
   * 7/08/2026. La riga sa già quali mail sono sue: non c'è motivo di indovinarlo
   * una seconda volta.
   */
  ids: string[]
  contattoAI: boolean
  /** True se a questa conversazione abbiamo già risposto (c'è una mail in uscita). */
  risposto?: boolean
  /** True se questa conversazione è stata INOLTRATA a qualcuno. */
  inoltrato?: boolean
  /** Solo nei risultati di ricerca: true se è una mail che hai inviato tu. */
  inviata?: boolean
  destinatari?: string
  /** Solo in ricerca: pezzetto di testo attorno alla parola cercata. */
  snippet?: string | null
  /** Solo in ricerca: la parola da evidenziare nello snippet. */
  evidenzia?: string | null
  /** Id della sezione attuale (per lo spostamento rapido). */
  sezioneId?: string | null
  /** Se il mittente è un CLIENTE del registro Anagrafiche: il nome dell'azienda. */
  clienteNome?: string | null
  /** Il nome dato a mano alla conversazione (null se non ne ha). */
  nomeThread?: string | null
  /** Byte del messaggio (per l'ordinamento per dimensione). */
  dimensione?: number
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

/** Una riga della posta in arrivo. Client: monta i pulsanti interattivi.
 *  MEMOIZZATA: con centinaia di righe montate, ogni cambio di stato della lista
 *  (una spunta, il caricamento di un blocco) ri-renderizzerebbe tutte le righe;
 *  così si ridisegnano solo quelle davvero cambiate. */
export const RigaMail = memo(function RigaMail({
  r,
  sezioni = [],
  selezionato = false,
  onSelezione,
  mostraPeso = false,
  idsDaTrascinare,
}: {
  r: RigaData
  sezioni?: { id: string; nome: string }[]
  /** Selezione multipla: la riga è spuntata. */
  selezionato?: boolean
  /** Chiamato quando si spunta/despunta la casella della riga. */
  onSelezione?: (id: string, valore: boolean) => void
  /** Ordinando per dimensione si mostra il peso: così si vede il criterio. */
  mostraPeso?: boolean
  /** Gli id da trascinare: con la riga selezionata è l'intera selezione. */
  idsDaTrascinare?: string[]
}) {
  // Rimozione ottimistica: appena archivi/cestini la riga sparisce all'istante,
  // il server si riallinea al refresh successivo.
  const [nascosto, setNascosto] = useState(false)
  // Il pallino «non letta» si spegne al clic su «Letto», non al giro dopo.
  // ⚠️ Ma resta ALLINEATO al server: `useState` da solo tiene il valore del
  // primo render per sempre, e tornando in elenco dopo aver aperto la mail il
  // pallino restava blu anche se il server diceva ormai il contrario — mentre
  // il contatore lassù, che stato locale non ha, calava. I due si
  // contraddicevano a schermo, ed è così che è stato segnalato.
  const [nonLetti, setNonLetti] = useState(r.nonLetti)
  useEffect(() => setNonLetti(r.nonLetti), [r.nonLetti])
  if (nascosto) return null
  // Si trascina la CONVERSAZIONE (`r.ids`), non la mail di testa: in elenco una
  // riga è un thread. Se la riga fa parte di una selezione, si trascina tutta
  // la selezione (`idsDaTrascinare`, passati dalla lista).
  return (
    <MailDrag
      id={r.id}
      ids={idsDaTrascinare?.length ? idsDaTrascinare : r.ids?.length ? r.ids : [r.id]}
      className={`mail-row ${nonLetti ? 'non-letto' : ''} ${selezionato ? 'selezionato' : ''}`}
    >
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
            <span className={nonLetti ? 'dot-unread' : 'dot-spacer'} />
            <span className="mail-mittente">
              {r.inviata ? `a ${r.destinatari || '—'}` : r.mittenteNome || r.mittente}
            </span>
            {r.inviata && <span className="badge neutral">inviata</span>}
            {r.contattoAI && (
              <span className="ai-toggle-mark" title="Contatto AI (PLUS AI attivo)">
                AI
              </span>
            )}
            {r.clienteNome && (
              <span className="badge green" title="Cliente del registro Anagrafiche">
                <span className="dot" />
                {r.clienteNome}
              </span>
            )}
            {r.nomeThread && (
              <span className="badge gold" title="Nome dato alla conversazione">
                <span className="dot" />
                {r.nomeThread}
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
            {!r.inviata && r.inoltrato && (
              <span className="risposto-mark" title="Hai inoltrato questa conversazione" aria-label="Inoltrato">
                ↪
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
            /* ⚠️ L'anteprima passa dal ripulitore: il «testo» di una mail HTML
               è la conversione del server, e senza questo la riga mostrava
               l'indirizzo del logo attaccato a quello del link invece delle
               parole. Se non resta niente da leggere, riga vuota: l'oggetto la
               mail la racconta già. */
            <div className="mail-riassunto" style={{ paddingLeft: 17 }}>
              <span className="muted">
                {ripulisciAnteprima(
                  r.corpoTradotto ? r.corpoTradotto.slice(0, 400) : r.anteprima
                ).slice(0, 200)}
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
          {mostraPeso && (
            <span className="mail-data" title="Dimensione della mail">
              {pesoLeggibile(r.dimensione)}
            </span>
          )}
          <span className="mail-data">{dataBreve(r.data)}</span>
          <RispostaAzioni id={r.id} />
        </div>
      </div>

      <div style={{ paddingLeft: 17 }}>
        <PrioritaButtons id={r.id} priorita={r.priorita} prioritaDa={r.prioritaDa} analizzato={r.analizzato} />
        <div className="riga-azioni">
          <AzioniRiga
            id={r.id}
            archiviato={r.archiviato}
            cestinato={r.cestinato}
            mittente={r.mittente}
            giaInSpam={r.sezione?.nome === 'SPAM'}
            // In posta in arrivo la riga è una CONVERSAZIONE: archivia/cestina/
            // spam agiscono su tutte le mail del thread (se no ricompare).
            perThread
            onFatto={() => setNascosto(true)}
          />
          {/* «Letto» sulla riga: la richiesta più semplice e più usata —
              togliere il pallino senza aprire la mail. */}
          <SegnaLettoRiga
            ids={r.ids?.length ? r.ids : [r.id]}
            nonLetto={nonLetti}
            onCambio={(letto) => setNonLetti(!letto)}
          />
          <DelegaReneBottone id={r.id} />
          <AgganciaBottone id={r.id} />
          {/* Dai (o cambi) il nome alla conversazione senza aprirla. */}
          <NomeThreadBottone id={r.id} nome={r.nomeThread} />
          {r.nel > 1 && (
            <Link href={`/messaggio/${r.id}?ampia=1`} className="azione-riga" title="Apri la conversazione con anche le mail correlate">
              Apri completo
            </Link>
          )}
          <BottoneApp id={r.id} />
          {r.sezione?.nome === 'SPAM' && <BottoneNonSpam id={r.id} />}
          {!r.inviata && <SpostaSezione id={r.id} sezioneAttuale={r.sezioneId ?? null} sezioni={sezioni} />}
        </div>
      </div>
    </MailDrag>
  )
})
