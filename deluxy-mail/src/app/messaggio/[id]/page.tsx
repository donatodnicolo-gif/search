import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { dataLunga, FUSO } from '@/lib/format'
import { BozzaEditor } from '@/components/BozzaEditor'
import { AzioniMessaggio } from '@/components/AzioniMessaggio'
import { PrioritaButtons } from '@/components/PrioritaButtons'
import { Rianalizza } from '@/components/Rianalizza'
import { CorpoMessaggio } from '@/components/CorpoMessaggio'
import { RiassuntoConversazione } from '@/components/RiassuntoConversazione'
import { BottoneContattoAI } from '@/components/BottoneContattoAI'
import { EditorIstruzioni } from '@/components/EditorIstruzioni'
import { AgganciaMail } from '@/components/AgganciaMail'
import { sanitizzaHtml } from '@/lib/sanitizzaHtml'
import { richiediUtente } from '@/lib/sessione'
import { messaggiThread, leggiRiassuntoThread } from '@/lib/sync'
import { TraduzioneAllApertura } from '@/components/TraduzioneAllApertura'
import { chiaveThread } from '@/lib/thread'
import { eContattoAI } from '@/lib/contattiAI'
import { azioneDi } from '@/lib/appDeluxy'
import { leggiEventoProposto } from '@/lib/eventoProposto'
import { PropostaEvento } from '@/components/PropostaEvento'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // le azioni AI (analisi, riassunto thread) girano qui

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ ampia?: string }> }

export default async function DettaglioMessaggio({ params, searchParams }: Props) {
  const { id } = await params
  const { ampia: ampiaGrezzo } = await searchParams
  const ampia = ampiaGrezzo === '1'
  const u = await richiediUtente()

  const messaggio = await db.messaggio.findFirst({
    where: { id, utenteId: u.id },
    include: { sezione: true, bozze: true, attivita: true, account: true },
  })
  if (!messaggio) notFound()

  // Il contatto ha il PLUS AI? (solo per la posta in arrivo: il mittente è il
  // contatto). Serve a mostrare il toggle e, se attivo, il quadro della situazione.
  const contattoEmail = messaggio.mittente.toLowerCase()

  // Aprire una mail deve essere ISTANTANEO: tutte le letture indipendenti girano
  // in parallelo (prima erano una dietro l'altra) e la traduzione automatica NON
  // è più qui — la chiamata all'AI bloccava il render. Ora si mostra subito
  // l'originale e, se serve, la traduzione arriva dopo in background
  // (TraduzioneAllApertura).
  type InvioAppRiga = {
    id: string
    azioneId: string
    esito: string
    esitoTesto: string
    link: string | null
    creatoIl: Date
  }
  const [sezioni, conversazione, conversazioneStretta, contattoAI, inviiApp] = await Promise.all([
    db.sezione.findMany({ where: { utenteId: u.id }, orderBy: { ordine: 'asc' } }),
    // La conversazione a cui appartiene questo messaggio. Vista "completa"
    // (ampia): comprende anche le mail scambiate con le stesse persone.
    messaggiThread(u.id, messaggio.id, ampia),
    // Solo in vista "ampia" serve anche il thread stretto (per contare le correlate).
    ampia ? messaggiThread(u.id, messaggio.id, false) : Promise.resolve(null),
    messaggio.direzione === 'entrata' ? eContattoAI(u.id, contattoEmail) : Promise.resolve(false),
    // Le risposte delle APP DELUXY richiamate da questa mail (tabella opzionale).
    db.invioApp
      .findMany({
        where: { utenteId: u.id, messaggioId: messaggio.id },
        orderBy: { creatoIl: 'desc' },
        select: { id: true, azioneId: true, esito: true, esitoTesto: true, link: true, creatoIl: true },
      })
      .catch(() => [] as InvioAppRiga[]),
  ])

  // Traduzione: si usa quella già salvata. Se manca (mail in arrivo mai
  // controllata) e la traduzione automatica è attiva, si calcola dopo il render.
  const lingua = messaggio.lingua
  const corpoTradotto = messaggio.corpoTradotto
  const traduciDopo = lingua === null && messaggio.direzione === 'entrata' && u.traduzioneAuto

  // Quante correlate in più rispetto al thread stretto (per l'etichetta).
  const strette = ampia ? (conversazioneStretta?.length ?? conversazione.length) : conversazione.length
  const chiaveConv = conversazione.length > 1 ? chiaveThread(conversazione) : null

  let riassuntoThread: Awaited<ReturnType<typeof leggiRiassuntoThread>> = null
  let istruzioniThread = ''
  if (chiaveConv) {
    const [rt, it] = await Promise.all([
      leggiRiassuntoThread(u.id, chiaveConv),
      db.istruzioneThread
        .findUnique({
          where: { utenteId_chiave: { utenteId: u.id, chiave: chiaveConv } },
          select: { istruzioni: true },
        })
        .then((r) => r?.istruzioni ?? '')
        .catch(() => ''), // tabella non ancora migrata: nessuna istruzione
    ])
    riassuntoThread = rt
    istruzioniThread = it
  }

  // Qui si mostra solo la proposta dell'AI: le bozze che hai iniziato tu si
  // riprendono dalla schermata di scrittura, dove le stavi scrivendo.
  const bozzaAI = messaggio.bozze.find((b) => b.origine === 'ai' && !b.inviata)

  // L'appuntamento che l'AI ha riconosciuto in questa mail, da accettare.
  const eventoProposto = leggiEventoProposto(messaggio.eventoProposto)

  return (
    <>
      <div className="page-head">
        <div>
          <Link href="/" className="btn secondary small">
            ← Posta in arrivo
          </Link>
        </div>
        <AzioniMessaggio
          id={messaggio.id}
          letto={messaggio.letto}
          archiviato={messaggio.archiviato}
          sezioneId={messaggio.sezioneId}
          sezioni={sezioni.map((s) => ({ id: s.id, nome: s.nome }))}
          mittente={messaggio.mittente}
        />
      </div>

      <div className="card">
        <div className="mail-head">
          <h1 className="mail-subject">{messaggio.oggetto}</h1>
          <div className="mail-meta">
            <Link
              href={`/rubrica/${encodeURIComponent(messaggio.mittente)}`}
              style={{ textDecoration: 'underline' }}
              title="Vedi tutti i messaggi di questo contatto"
            >
              <strong>{messaggio.mittenteNome || messaggio.mittente}</strong>{' '}
              &lt;{messaggio.mittente}&gt;
            </Link>
            <br />
            a {messaggio.destinatari} · {dataLunga(messaggio.data)}
          </div>

          {messaggio.direzione === 'entrata' && (
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <BottoneContattoAI email={contattoEmail} attivo={contattoAI} />
              {contattoAI && (
                <Link href={`/rubrica/${encodeURIComponent(messaggio.mittente)}`} className="btn secondary small">
                  Quadro AI del contatto →
                </Link>
              )}
            </div>
          )}
          <div className="mail-tags">
            {messaggio.sezione && (
              <span className={`badge ${messaggio.sezione.colore}`}>
                <span className="dot" />
                {messaggio.sezione.nome}
              </span>
            )}
            {messaggio.smistatoDa && (
              <span className="badge neutral">
                smistato da{' '}
                {messaggio.smistatoDa === 'ai'
                  ? 'AI'
                  : messaggio.smistatoDa === 'regola'
                    ? 'una regola'
                    : 'te'}
              </span>
            )}
            {messaggio.allegati > 0 && (
              <span className="badge neutral">
                {messaggio.allegati} allegat{messaggio.allegati === 1 ? 'o' : 'i'}
              </span>
            )}
          </div>

          <PrioritaButtons
            id={messaggio.id}
            priorita={messaggio.priorita}
            prioritaDa={messaggio.prioritaDa}
            analizzato={messaggio.analizzatoIl !== null}
          />
        </div>

        {eventoProposto && <PropostaEvento messaggioId={messaggio.id} evento={eventoProposto} />}

        {messaggio.riassunto && (
          <div className="ai-box">
            <div className="ai-box-title">Cosa ha capito l’AI</div>
            <div className="ai-box-text">{messaggio.riassunto}</div>
            {messaggio.attivita.length > 0 && (
              <ul style={{ margin: '10px 0 0 18px', fontSize: 14 }}>
                {messaggio.attivita.map((a) => (
                  <li key={a.id} style={{ marginTop: 4 }}>
                    {a.titolo}
                    {a.scadenza && (
                      <span className="muted">
                        {' '}
                        — entro {a.scadenza.toLocaleDateString('it-IT', { timeZone: FUSO })}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* L'errore si vede solo qui e solo se l'analisi è stata chiesta e non
            è riuscita: nella lista sarebbe rumore su ogni messaggio. */}
        {messaggio.erroreAI && (
          <div
            className="ai-box"
            style={{ background: 'rgba(215,0,21,0.06)', borderColor: 'rgba(215,0,21,0.2)' }}
          >
            <div className="ai-box-title" style={{ color: 'var(--red)' }}>
              Analisi non riuscita
            </div>
            <div className="ai-box-text">{messaggio.erroreAI}</div>
            <div style={{ marginTop: 12 }}>
              <Rianalizza id={messaggio.id} />
            </div>
          </div>
        )}

        {!messaggio.riassunto && !messaggio.erroreAI && (
          <div className="ai-box" style={{ background: 'var(--fill)', borderColor: 'var(--hairline)' }}>
            <div className="ai-box-text" style={{ color: 'var(--text-secondary)' }}>
              L’AI non ha ancora letto questo messaggio. Dagli una priorità qui sopra: te lo
              riassume e crea l’attività da fare.
            </div>
          </div>
        )}

        <CorpoMessaggio
          html={messaggio.corpoHtml ? sanitizzaHtml(messaggio.corpoHtml) : null}
          testo={messaggio.corpoTesto}
          tradotto={corpoTradotto}
          lingua={lingua}
        />
        {traduciDopo && <TraduzioneAllApertura messaggioId={messaggio.id} />}
      </div>

      {conversazione.length === 1 && (
        <div className="card">
          <div className="mail-subject" style={{ fontSize: 18, marginBottom: 10 }}>
            Conversazione
          </div>
          <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', marginBottom: 12 }}>
            Questa mail è da sola. Se un’altra mail parla della stessa cosa, agganciala qui:
            quando dai una priorità, l’AI le legge insieme. Oppure apri la{' '}
            <Link href={`/messaggio/${id}?ampia=1`} style={{ textDecoration: 'underline' }}>
              vista con le mail correlate
            </Link>{' '}
            (scambiate con le stesse persone).
          </p>
          <AgganciaMail messaggioId={messaggio.id} agganciata={Boolean(messaggio.threadManuale)} />
        </div>
      )}

      {conversazione.length > 1 && (
        <div className="card">
          <div
            className="mail-subject"
            style={{ fontSize: 18, marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}
          >
            <span>
              {ampia ? 'Conversazione completa' : 'Conversazione'} · {conversazione.length} messaggi
              {ampia && conversazione.length > strette && (
                <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>
                  {' '}
                  ({conversazione.length - strette} correlate)
                </span>
              )}
            </span>
            {/* Questo thread ⇄ Con le correlate (le mail scambiate con le stesse persone). */}
            <span className="vista-tabs" style={{ margin: 0 }}>
              <Link href={`/messaggio/${id}`} className={`vista-tab ${!ampia ? 'attivo' : ''}`}>
                Questo thread
              </Link>
              <Link href={`/messaggio/${id}?ampia=1`} className={`vista-tab ${ampia ? 'attivo' : ''}`}>
                Con le correlate
              </Link>
            </span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
            {ampia
              ? 'Oltre alla catena di risposte, anche le altre mail scambiate con le stesse persone.'
              : 'Quando dai una priorità, l’AI analizza l’ultima mail avendo letto tutta questa conversazione.'}
          </p>

          <div style={{ marginBottom: 14 }}>
            <AgganciaMail messaggioId={messaggio.id} agganciata={Boolean(messaggio.threadManuale)} />
          </div>

          <EditorIstruzioni tipo="thread" target={messaggio.id} valore={istruzioniThread} />

          <RiassuntoConversazione
            messaggioId={messaggio.id}
            iniziale={
              riassuntoThread
                ? {
                    analisi: riassuntoThread.analisi,
                    partecipanti: riassuntoThread.partecipanti,
                    messaggiVisti: riassuntoThread.messaggiVisti,
                    generatoIl: riassuntoThread.generatoIl,
                  }
                : null
            }
          />

          <div className="thread-list" style={{ marginTop: 14 }}>
            {conversazione.map((c) => {
              const attuale = c.id === messaggio.id
              return (
                <Link
                  key={c.id}
                  href={`/messaggio/${c.id}`}
                  className="thread-item"
                  style={{
                    display: 'flex',
                    gap: 12,
                    alignItems: 'baseline',
                    padding: '8px 10px',
                    borderRadius: 10,
                    background: attuale ? 'var(--fill)' : 'transparent',
                    textDecoration: 'none',
                    color: 'inherit',
                  }}
                >
                  <span style={{ fontWeight: 600, minWidth: 140, flexShrink: 0 }}>
                    {c.direzione === 'uscita' ? 'Tu' : c.mittenteNome || c.mittente}
                  </span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.oggetto}
                  </span>
                  <span className="muted" style={{ fontSize: 12, flexShrink: 0 }}>
                    {dataLunga(c.data)}
                  </span>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {bozzaAI && (
        <div className="card draft-box">
          <BozzaEditor
            bozza={{
              id: bozzaAI.id,
              oggetto: bozzaAI.oggetto,
              corpo: bozzaAI.corpo,
              inviata: bozzaAI.inviata,
              modificata: bozzaAI.modificata,
            }}
            destinatario={messaggio.mittente}
            mittente={messaggio.account.email}
          />
        </div>
      )}

      {inviiApp.length > 0 && (
        <div className="card">
          <div className="mail-subject" style={{ fontSize: 18, marginBottom: 12 }}>
            Risposte dalle app
          </div>
          {inviiApp.map((iv) => {
            const az = azioneDi(iv.azioneId)
            return (
              <div key={iv.id} className="invio-app">
                <div className="invio-app-testa">
                  <span className={`badge ${az?.colore ?? 'neutral'}`}>
                    <span className="dot" />
                    {az ? `${az.app} — ${az.nome}` : iv.azioneId}
                  </span>
                  <span className={`badge ${iv.esito === 'ok' ? 'green' : 'red'}`}>
                    <span className="dot" />
                    {iv.esito === 'ok' ? 'Riuscito' : 'Errore'}
                  </span>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {iv.creatoIl.toLocaleString('it-IT', {
                      timeZone: FUSO,
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <div className="invio-app-testo">{iv.esitoTesto}</div>
                {iv.link && (
                  <a href={iv.link} target="_blank" rel="noreferrer" className="azione-riga" style={{ marginTop: 6, display: 'inline-block' }}>
                    Apri nell’app →
                  </a>
                )}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
