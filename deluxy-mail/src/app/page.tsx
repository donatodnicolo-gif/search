import { Suspense } from 'react'
import Link from 'next/link'
import { db } from '@/lib/db'
import { PRIORITA } from '@/lib/format'
import { ColonnaAttivita } from '@/components/ColonnaAttivita'
import { ColonnaCalendario } from '@/components/ColonnaCalendario'
import { ColonnaTopThread } from '@/components/ColonnaTopThread'
import { AnalisiAIInbox } from '@/components/AnalisiAIInbox'
import { NuoveAzioni } from '@/components/NuoveAzioni'
import { RicercaMail } from '@/components/RicercaMail'
import { CercaServer } from '@/components/CercaServer'
import { CarteApp } from '@/components/CarteApp'
import { InvioAppDialog } from '@/components/InvioAppDialog'
import { DelegaReneDialog } from '@/components/DelegaRene'
import { AgganciaDialog } from '@/components/AgganciaRiga'
import { NomeThreadDialog } from '@/components/NomeThreadRiga'
import { FinestraScrivi } from '@/components/FinestraScrivi'
import { ListaPosta, ListaPostaInCorso } from '@/components/ListaPosta'
import { descriviAzioni } from '@/lib/appDeluxy'
import { leggiChiaviApp } from '@/lib/chiaviApp'
import { richiediUtente } from '@/lib/sessione'
import { emailContattiAI } from '@/lib/contattiAI'
import { idsThreadAI } from '@/lib/threadAI'
import { accountAttivoId } from '@/lib/accountAttivo'

export const dynamic = 'force-dynamic'
// Le azioni AI (analisi alla priorità) girano su questa route: su Vercel il
// default è 10s e la funzione verrebbe uccisa a metà chiamata OpenAI. 60s è il
// massimo del piano.
export const maxDuration = 60

type Props = {
  searchParams: Promise<{ sezione?: string; stato?: string; p?: string; vista?: string; q?: string }>
}

export default async function PostaInArrivo({ searchParams }: Props) {
  const { sezione, stato, p, vista, q: qGrezzo } = await searchParams
  const q = (qGrezzo ?? '').trim()
  const ricerca = q.length >= 2
  const u = await richiediUtente()
  // Multi-account: la casella scelta (null = tutte). Filtra la posta in arrivo.
  const accountAttivo = await accountAttivoId(u.id)

  // Due viste: "In arrivo" (predefinita: la posta non ancora smistata in una
  // sezione) e "AI Inbox" (solo i contatti col PLUS AI, in qualunque sezione).
  // Dentro una sezione la distinzione non serve.
  const vistaAI = !sezione && vista === 'ai'
  // "Non smistate": la posta ancora grezza, che l'AI non ha ancora letto (nessuna
  // priorità/analisi) e non è in una sezione. È il sottoinsieme di "In arrivo"
  // che aspetta di essere gestito.
  const vistaNonSmistate = !sezione && vista === 'nonsmistate'
  // ⚠️ PRESTAZIONI — tutto ciò che non dipende da altro parte INSIEME.
  // Vercel gira negli USA e il database è in Europa: ogni query in fila costa
  // un viaggio di andata e ritorno, e in serie erano quasi dieci. Qui si fa
  // una sola ondata; restano poi solo la query della posta (che ha bisogno di
  // questi risultati) e quella delle risposte.
  const [emailAI, idsAI, tutteLeSezioni, account, storicoIncompleto, chiaviApp, sezioneAttiva, figlieSezione] =
    await Promise.all([
      emailContattiAI(u.id),
      // Le mail delle conversazioni col PLUS AI (per la vista AI Inbox).
      vista === 'ai' && !sezione ? idsThreadAI(u.id) : Promise.resolve([] as string[]),
      db.sezione.findMany({ where: { utenteId: u.id }, orderBy: { ordine: 'asc' }, select: { id: true, nome: true } }),
      db.account.count({ where: { utenteId: u.id } }),
      // C'è ancora storico non scaricato? Allora in fondo alla lista si può
      // andare a prendere on-demand la posta più vecchia dal server.
      db.account
        .count({
          where: {
            utenteId: u.id,
            attivo: true,
            OR: [{ storicoFinito: false }, { storicoInviataFinito: false }],
          },
        })
        .then((n) => n > 0)
        .catch(() => false), // colonne non ancora migrate: niente ricerca on-demand
      // Le chiavi delle APP DELUXY (in cache 5 minuti: non è una fetch a ogni giro).
      leggiChiaviApp(),
      sezione ? db.sezione.findFirst({ where: { id: sezione, utenteId: u.id } }) : Promise.resolve(null),
      // Le sottosezioni: si chiedono subito insieme al resto e si usano solo se
      // la sezione aperta esiste davvero.
      sezione
        ? db.sezione.findMany({ where: { utenteId: u.id, genitoreId: sezione }, select: { id: true } }).catch(() => [])
        : Promise.resolve([]),
    ])

  // Le sezioni per lo spostamento rapido dalla riga (SPAM esclusa: da lì si esce
  // con «Non è spam», non ci si sposta a mano).
  const sezioniPerSposta = tutteLeSezioni.filter((s) => s.nome !== 'SPAM')

  // ⚠️ ESCLUDERE LO SPAM SENZA PAGARE UNA SOTTOQUERY PER RIGA.
  //
  // Prima si filtrava sulla RELAZIONE — `NOT: { sezione: { nome: 'SPAM' } }` —
  // e Prisma lo traduce in una sottoquery su Sezione valutata per ogni riga
  // candidata. In posta in arrivo si nota poco (le righe buone stanno in cima e
  // se ne guardano 800); negli ARCHIVIATI le candidate sono migliaia, e lì
  // quella sottoquery costa davvero.
  //
  // Il filtro scalare secco `NOT sezioneId = spamId` NON si può usare: per le
  // righe con `sezioneId` NULL (tutta la posta non smistata) dà NULL invece di
  // TRUE e le ESCLUDE — è la trappola che il commento qui sotto ricordava, ed è
  // vera. La forma corretta è dirlo per esteso: «senza sezione, OPPURE in una
  // sezione che non è lo SPAM». I NULL rientrano dal primo ramo.
  //
  // L'id dello SPAM ce l'abbiamo già: le sezioni sono state lette nell'ondata
  // parallela qui sopra, quindi non costa nessuna query in più.
  const spamId = tutteLeSezioni.find((s) => s.nome === 'SPAM')?.id ?? null

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

  // Aprendo una sezione con sottosezioni si vede anche la loro posta: la
  // sezione madre è il contenitore, non una casella parallela. (Sezione e
  // sottosezioni sono già state chieste nell'ondata parallela qui sopra.)
  const idsSezione: string[] = sezioneAttiva
    ? [sezioneAttiva.id, ...figlieSezione.map((f) => f.id)]
    : sezione
      ? [sezione]
      : []

  // Il pannello APP DELUXY: le funzioni delle altre app richiamabili da qui.
  // Le chiavi (già lette nell'ondata parallela) decidono quali sono collegate.
  const azioniApp = descriviAzioni(chiaviApp)

  const filtri = [
    { chiave: '', label: 'Tutti' },
    { chiave: 'non-letti', label: 'Non letti' },
    { chiave: 'da-rispondere', label: 'Da rispondere' },
    { chiave: 'archiviati', label: 'Archiviati' },
  ]

  return (
    <>
      <div className="page-head">
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1 className="page-title">
            {ricerca
              ? 'Ricerca'
              : (sezioneAttiva?.nome ??
                (vistaAI ? 'AI Inbox' : vistaNonSmistate ? 'Non smistate' : 'Posta in arrivo'))}
          </h1>
          <p className="page-caption">
            {ricerca
              ? `Risultati per «${q}» — ricevute e inviate.`
              : sezioneAttiva
                ? sezioneAttiva.descrizione
                : vistaAI
                  ? 'Solo i contatti col PLUS AI, con tutte le funzioni AI.'
                  : vistaNonSmistate
                    ? 'La posta in arrivo non ancora messa in una sezione: il grezzo da smistare.'
                    : 'Tutta la posta in arrivo: quella già in una sezione porta il badge della sezione. SPAM e Cestino esclusi.'}
          </p>
          <div style={{ marginTop: 12, maxWidth: 460 }}>
            <RicercaMail iniziale={ricerca ? q : ''} />
            {/* In ricerca: il server IMAP cerca anche nella posta mai scaricata
                e importa quel che trova (la lista si aggiorna da sola). */}
            {ricerca && <CercaServer q={q} />}
          </div>
        </div>
        <div className="page-actions filters">
          <NuoveAzioni />

          {!ricerca && filtri.map((f) => {
            const params = new URLSearchParams()
            if (sezione) params.set('sezione', sezione)
            if (vistaAI) params.set('vista', 'ai')
            if (vistaNonSmistate) params.set('vista', 'nonsmistate')
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

          {!ricerca && <span style={{ width: 1, height: 22, background: 'var(--hairline-strong)', margin: '0 2px' }} />}

          {!ricerca && PRIORITA.map((liv) => {
            const params = new URLSearchParams()
            if (sezione) params.set('sezione', sezione)
            if (vistaAI) params.set('vista', 'ai')
            if (vistaNonSmistate) params.set('vista', 'nonsmistate')
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

      {/* Le due viste: AI Inbox e Tutte. Dentro una sezione o in ricerca no. */}
      {!sezione && !ricerca && (
        <div className="vista-tabs">
          {[
            { chiave: 'all', label: 'In arrivo', attivo: !vistaAI && !vistaNonSmistate },
            { chiave: 'nonsmistate', label: 'Non smistate', attivo: vistaNonSmistate },
            { chiave: 'ai', label: 'AI Inbox', attivo: vistaAI },
          ].map((v) => {
            const params = new URLSearchParams()
            if (v.chiave === 'ai') params.set('vista', 'ai')
            if (v.chiave === 'nonsmistate') params.set('vista', 'nonsmistate')
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

      {/* L'analisi periodica vive nella pagina di Renè AI (sidebar →
          Applicazioni): la posta in arrivo resta solo posta. */}

      {/* L'AI legge in sottofondo le mail col PLUS AI non ancora lette. Gira
          SOLO nella AI Inbox (è la sua vista) e nelle conversazioni AI+: aprire
          la posta «In arrivo» non deve chiamare l'AI a ogni volta. */}
      {vistaAI && !ricerca && <AnalisiAIInbox />}

      <div className="inbox-split">
        {/* ⚠️ PRIMA LA PAGINA, POI LA POSTA. L'elenco stava qui dentro, e Next
            non manda una riga di HTML finché il componente non ha finito:
            aprire la posta in arrivo voleva dire restare sul bianco per tutto
            il tempo delle query (800 mail, raggruppamento, nomi, risposte,
            clienti). Ora titolo, filtri e schede escono subito e l'elenco
            arriva un attimo dopo. Il lavoro è lo stesso: non è più veloce, è
            non bloccante — ed è quello che si sente. */}
        <Suspense fallback={<ListaPostaInCorso />}>
          <ListaPosta
            utenteId={u.id}
            accountAttivo={accountAttivo}
            q={q}
            ricerca={ricerca}
            sezione={sezione}
            idsSezione={idsSezione}
            spamId={spamId}
            vistaAI={vistaAI}
            vistaNonSmistate={vistaNonSmistate}
            stato={stato}
            p={p}
            emailAI={emailAI}
            idsAI={idsAI}
            sezioniPerSposta={sezioniPerSposta}
            storicoIncompleto={storicoIncompleto}
          />
        </Suspense>

        <div className="inbox-lato">
          {/* ⚠️ La colonna di destra sta DENTRO un Suspense. Senza, la pagina non
              partiva finché non avevano finito anche queste letture — e i «Top
              thread» da soli rastrellano 1500 mail degli ultimi 30 giorni: si
              aspettava quella query anche solo per aprire la cartella SPAM.
              Ora la posta si vede subito e la colonna si riempie dopo. */}
          <Suspense fallback={null}>
            {/* Le conversazioni più corpose del mese: sopra l'agenda. */}
            <ColonnaTopThread utenteId={u.id} />
          </Suspense>
          <Suspense fallback={null}>
            {/* L'agenda: i prossimi appuntamenti si vedono appena si apre la posta. */}
            <ColonnaCalendario utenteId={u.id} />
          </Suspense>
          <CarteApp azioni={azioniApp} />
          <Suspense fallback={null}>
            <ColonnaAttivita utenteId={u.id} />
          </Suspense>
        </div>
      </div>

      <InvioAppDialog azioni={azioniApp} />
      <DelegaReneDialog />
      <AgganciaDialog />
      <NomeThreadDialog />
      {/* Rispondi/Inoltra dalle righe aprono qui, senza cambiare pagina. */}
      <FinestraScrivi />
    </>
  )
}
