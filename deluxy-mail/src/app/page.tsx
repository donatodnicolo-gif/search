import Link from 'next/link'
import { db } from '@/lib/db'
import { dataBreve, PRIORITA } from '@/lib/format'
import { PrioritaButtons } from '@/components/PrioritaButtons'
import { ColonnaAttivita } from '@/components/ColonnaAttivita'
import { ArchiviaDefinitivo } from '@/components/ArchiviaDefinitivo'
import { AzioniRiga } from '@/components/AzioniRiga'
import { AssistenteAI } from '@/components/AssistenteAI'
import { NuoveAzioni } from '@/components/NuoveAzioni'
import { CarteApp } from '@/components/CarteApp'
import { InvioAppDialog } from '@/components/InvioAppDialog'
import { BottoneApp } from '@/components/BottoneApp'
import { MailDrag } from '@/components/MailDrag'
import { descriviAzioni } from '@/lib/appDeluxy'
import { leggiChiaviApp } from '@/lib/chiaviApp'
import { RispostaAzioni } from '@/components/RispostaAzioni'
import { richiediUtente } from '@/lib/sessione'
import { raggruppa } from '@/lib/thread'
import { emailContattiAI } from '@/lib/contattiAI'

export const dynamic = 'force-dynamic'
// Le azioni AI (analisi alla priorità) girano su questa route: su Vercel il
// default è 10s e la funzione verrebbe uccisa a metà chiamata OpenAI. 60s è il
// massimo del piano.
export const maxDuration = 60

type Props = {
  searchParams: Promise<{ sezione?: string; stato?: string; p?: string; vista?: string }>
}

export default async function PostaInArrivo({ searchParams }: Props) {
  const { sezione, stato, p, vista } = await searchParams
  const u = await richiediUtente()

  // Due viste: "In arrivo" (predefinita: la posta non ancora smistata in una
  // sezione) e "AI Inbox" (solo i contatti col PLUS AI, in qualunque sezione).
  // Dentro una sezione la distinzione non serve.
  const vistaAI = !sezione && vista === 'ai'
  const emailAI = await emailContattiAI(u.id)
  const setAI = new Set(emailAI)

  const account = await db.account.count({ where: { utenteId: u.id } })
  if (account === 0) {
    return (
      <>
        <div className="page-head">
          <div>
            <h1 className="page-title">Posta in arrivo</h1>
            <p className="page-caption">
              Le mail lette, smistate e riassunte automaticamente dall’AI.
            </p>
          </div>
        </div>
        <div className="card">
          <div className="empty">
            <div className="empty-icon">✉</div>
            <div className="empty-title">Nessuna casella collegata</div>
            <p className="empty-text">
              Collega la tua casella IMAP e AI Mail inizierà a leggere, smistare e
              proporre risposte.
            </p>
            <div style={{ marginTop: 18 }}>
              <Link href="/impostazioni" className="btn primary">
                Collega una casella
              </Link>
            </div>
          </div>
        </div>
      </>
    )
  }

  const sezioneAttiva = sezione
    ? await db.sezione.findFirst({ where: { id: sezione, utenteId: u.id } })
    : null

  // Aprendo una sezione con sottosezioni si vede anche la loro posta: la
  // sezione madre è il contenitore, non una casella parallela.
  let idsSezione: string[] = sezione ? [sezione] : []
  if (sezioneAttiva) {
    try {
      const figlie = await db.sezione.findMany({
        where: { utenteId: u.id, genitoreId: sezioneAttiva.id },
        select: { id: true },
      })
      idsSezione = [sezioneAttiva.id, ...figlie.map((f) => f.id)]
    } catch {
      /* colonna non ancora migrata: solo la sezione stessa */
    }
  }

  // La sezione SPAM si vede solo aprendola: nella posta in arrivo (e nella AI
  // Inbox) la posta indesiderata resta fuori.
  const spamSez = await db.sezione.findFirst({
    where: { utenteId: u.id, nome: 'SPAM' },
    select: { id: true },
  })
  const spamId = spamSez?.id ?? null

  const messaggi = await db.messaggio.findMany({
    where: {
      utenteId: u.id,
      // Il cestino ha una pagina sua: qui non si vede mai, nemmeno fra gli
      // archiviati o filtrando per sezione.
      cestinato: false,
      // Quello che hai inviato tu sta in "Posta inviata".
      direzione: 'entrata',
      archiviato: stato === 'archiviati',
      // Una mail smistata in una sezione sta NELLA SUA SEZIONE, come le
      // cartelle di un client classico: la posta in arrivo mostra solo quella
      // ancora da smistare. Senza questo, una sezione ad alto volume (es. le
      // notifiche degli ordini) replicherebbe sé stessa in posta in arrivo
      // seppellendo il resto. Nella AI Inbox invece si vede tutto il contatto,
      // in qualunque sezione (tranne SPAM).
      ...(sezione
        ? { sezioneId: { in: idsSezione } }
        : vistaAI
          ? spamId
            ? { NOT: { sezioneId: spamId } }
            : {}
          : { sezioneId: null }),
      ...(stato === 'non-letti' ? { letto: false } : {}),
      ...(stato === 'da-rispondere' ? { serveRisposta: true } : {}),
      ...(p ? { priorita: p } : {}),
      // AI Inbox: SOLO le mail dei contatti col PLUS AI. Le mail nuove degli
      // altri restano in "In arrivo".
      ...(vistaAI ? { mittente: { in: emailAI } } : {}),
    },
    // Sempre in ordine di arrivo: una mail appena arrivata non è ancora stata
    // analizzata, e ordinare per priorità la spingerebbe in fondo. Per vedere
    // le urgenze si usano i filtri P0…P3 qui sopra.
    orderBy: { data: 'desc' },
    // Finestra larga: con molte notifiche automatiche (es. gli ordini) le
    // ultime 100 sarebbero quasi tutte quelle, e il resto della posta
    // sparirebbe. Si prende largo (senza i corpi, che pesano) e si taglia
    // DOPO il raggruppamento in conversazioni.
    take: 400,
    omit: { corpoTesto: true, corpoHtml: true },
    include: {
      sezione: true,
      bozze: { where: { inviata: false }, select: { id: true } },
      _count: { select: { attivita: true, inviiApp: true } },
    },
  })

  // Raggruppa la posta in conversazioni: una riga per thread (catena di
  // risposte o stesso oggetto anche con destinatari diversi). Il volto della
  // riga è il messaggio più recente del thread.
  const gruppi = raggruppa(messaggi).slice(0, 100)

  // Il pannello APP DELUXY: le funzioni delle altre app richiamabili da qui.
  // Le chiavi (DB cifrato o env) decidono quali sono già collegate.
  const azioniApp = descriviAzioni(await leggiChiaviApp())

  const filtri = [
    { chiave: '', label: 'Tutti' },
    { chiave: 'non-letti', label: 'Non letti' },
    { chiave: 'da-rispondere', label: 'Da rispondere' },
    { chiave: 'archiviati', label: 'Archiviati' },
  ]

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">
            {sezioneAttiva?.nome ?? (vistaAI ? 'AI Inbox' : 'Posta in arrivo')}
          </h1>
          <p className="page-caption">
            {sezioneAttiva
              ? sezioneAttiva.descrizione
              : vistaAI
                ? 'Solo i contatti col PLUS AI, con tutte le funzioni AI.'
                : 'La posta ancora da smistare. Quella già in una sezione la trovi nella barra a lato.'}
          </p>
        </div>
        <div className="page-actions filters">
          <NuoveAzioni />

          {filtri.map((f) => {
            const params = new URLSearchParams()
            if (sezione) params.set('sezione', sezione)
            if (vistaAI) params.set('vista', 'ai')
            if (p) params.set('p', p)
            if (f.chiave) params.set('stato', f.chiave)
            const attivo = (stato ?? '') === f.chiave
            return (
              <Link
                key={f.label}
                href={`/?${params.toString()}`}
                className={`btn ${attivo ? 'primary' : 'secondary'} small`}
              >
                {f.label}
              </Link>
            )
          })}

          <span style={{ width: 1, height: 22, background: 'var(--hairline-strong)', margin: '0 2px' }} />

          {PRIORITA.map((liv) => {
            const params = new URLSearchParams()
            if (sezione) params.set('sezione', sezione)
            if (vistaAI) params.set('vista', 'ai')
            if (stato) params.set('stato', stato)
            const attivo = p === liv.codice
            // Ripremere il filtro attivo lo toglie.
            if (!attivo) params.set('p', liv.codice)
            return (
              <Link
                key={liv.codice}
                href={`/?${params.toString()}`}
                className={`prio-btn ${liv.colore} ${attivo ? 'attivo' : ''}`}
                title={`Solo ${liv.codice} — ${liv.quando}`}
              >
                {liv.codice}
              </Link>
            )
          })}
        </div>
      </div>

      {/* Le due viste: AI Inbox e Tutte. Dentro una sezione non compaiono. */}
      {!sezione && (
        <div className="vista-tabs">
          {[
            { chiave: 'all', label: 'In arrivo', attivo: !vistaAI },
            { chiave: 'ai', label: 'AI Inbox', attivo: vistaAI },
          ].map((v) => {
            const params = new URLSearchParams()
            if (v.chiave === 'ai') params.set('vista', 'ai')
            if (stato) params.set('stato', stato)
            if (p) params.set('p', p)
            const qs = params.toString()
            return (
              <Link
                key={v.chiave}
                href={qs ? `/?${qs}` : '/'}
                className={`vista-tab ${v.attivo ? 'attivo' : ''}`}
              >
                {v.chiave === 'ai' && <span className="ai-toggle-mark">AI</span>}
                {v.label}
              </Link>
            )
          })}
        </div>
      )}

      {/* Solo nella vista principale: dentro una sezione o un filtro sarebbe
          fuori posto. */}
      {!sezione && !stato && !p && <AssistenteAI />}

      <div className="inbox-split">
        <div className="card tight">
        {messaggi.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">{vistaAI && emailAI.length === 0 ? 'AI' : '✓'}</div>
            <div className="empty-title">
              {vistaAI && emailAI.length === 0 ? 'Nessun contatto col PLUS AI' : 'Niente da vedere qui'}
            </div>
            <p className="empty-text">
              {vistaAI && emailAI.length === 0 ? (
                <>
                  Apri una mail (o una scheda in Rubrica) e premi <strong>+ AI</strong> per
                  seguirne il contatto qui. Intanto trovi la posta in{' '}
                  <Link href="/?vista=all" style={{ textDecoration: 'underline' }}>
                    In arrivo
                  </Link>
                  .
                </>
              ) : (
                'Nessun messaggio con questi filtri. Premi “Aggiorna posta” per leggere le novità.'
              )}
            </p>
          </div>
        ) : (
          <div className="mail-list">
            {gruppi.map((g) => {
              // Il volto della conversazione è il messaggio più recente; i
              // pulsanti agiscono su di esso. La catena è già ordinata dal più
              // vecchio al più recente.
              const m = g[g.length - 1]
              const nel = g.length
              const parti = new Set(g.map((x) => (x.direzione === 'uscita' ? 'me' : x.mittente.toLowerCase()))).size
              const nonLetti = g.some((x) => !x.letto)
              const contattoAI = setAI.has(m.mittente.toLowerCase())
              return (
              // La riga non è più tutta un link: i pulsanti di priorità devono
              // essere cliccabili senza aprire la mail. È trascinabile sulle
              // carte APP DELUXY a destra.
              <MailDrag key={m.id} id={m.id} className={`mail-row ${nonLetti ? 'non-letto' : ''}`}>
                <div className="mail-row-head">
                  <Link href={`/messaggio/${m.id}`} className="mail-row-link">
                  <div className="mail-top">
                    <span className={nonLetti ? 'dot-unread' : 'dot-spacer'} />
                    <span className="mail-mittente">{m.mittenteNome || m.mittente}</span>
                    {contattoAI && (
                      <span className="ai-toggle-mark" title="Contatto AI (PLUS AI attivo)">
                        AI
                      </span>
                    )}
                    {nel > 1 && (
                      <span className="thread-count" title={`${nel} messaggi · ${parti} ${parti === 1 ? 'parte' : 'parti'}`}>
                        {nel}
                      </span>
                    )}
                  </div>
                  <div className="mail-oggetto" style={{ paddingLeft: 17 }}>
                    {m.oggetto}
                  </div>

                  {m.riassunto ? (
                    <div className="mail-riassunto" style={{ paddingLeft: 17 }}>
                      <span className="ai-mark">AI</span>
                      <span>{m.riassunto}</span>
                    </div>
                  ) : (
                    <div className="mail-riassunto" style={{ paddingLeft: 17 }}>
                      {/* Se tradotta, l'anteprima mostra l'italiano, non la lingua originale. */}
                      <span className="muted">
                        {m.corpoTradotto
                          ? m.corpoTradotto.replace(/\s+/g, ' ').slice(0, 200)
                          : m.anteprima}
                      </span>
                    </div>
                  )}

                  {/* Niente badge quando l'AI non ha girato: è la normalità,
                      non un guasto — parte solo se dai una priorità. */}
                  {(m.sezione || m.corpoTradotto || m._count.attivita > 0 || m.bozze.length > 0 || m._count.inviiApp > 0 || m.eventoProposto) && (
                    <div className="mail-tags" style={{ paddingLeft: 17 }}>
                      {m.corpoTradotto && (
                        <span className="badge gold">
                          <span className="dot" />
                          Tradotto{m.lingua ? ` dal ${m.lingua}` : ''}
                        </span>
                      )}
                      {m._count.inviiApp > 0 && (
                        <span className="badge purple">
                          <span className="dot" />
                          Risposta app
                        </span>
                      )}
                      {m.eventoProposto && (
                        <span className="badge blue">
                          <span className="dot" />
                          Appuntamento
                        </span>
                      )}
                      {m.sezione && (
                        <span className={`badge ${m.sezione.colore}`}>
                          <span className="dot" />
                          {m.sezione.nome}
                        </span>
                      )}
                      {m._count.attivita > 0 && (
                        <span className="badge neutral">
                          {m._count.attivita} attività
                        </span>
                      )}
                      {m.bozze.length > 0 && <span className="badge gold">Bozza pronta</span>}
                    </div>
                  )}
                  </Link>

                  <div className="mail-row-side">
                    <span className="mail-data">{dataBreve(m.data)}</span>
                    <RispostaAzioni id={m.id} />
                  </div>
                </div>

                <div style={{ paddingLeft: 17 }}>
                  <PrioritaButtons
                    id={m.id}
                    priorita={m.priorita}
                    prioritaDa={m.prioritaDa}
                    analizzato={m.analizzatoIl !== null}
                  />
                  <div className="riga-azioni">
                    <AzioniRiga id={m.id} archiviato={m.archiviato} cestinato={m.cestinato} />
                    <BottoneApp id={m.id} />
                    <ArchiviaDefinitivo id={m.id} mittente={m.mittente} />
                  </div>
                </div>
              </MailDrag>
              )
            })}
          </div>
        )}
        </div>

        <div className="inbox-lato">
          <CarteApp azioni={azioniApp} />
          <ColonnaAttivita utenteId={u.id} />
        </div>
      </div>

      <InvioAppDialog azioni={azioniApp} />
    </>
  )
}
