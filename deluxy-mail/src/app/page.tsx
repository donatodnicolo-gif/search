import Link from 'next/link'
import { db } from '@/lib/db'
import { PRIORITA } from '@/lib/format'
import { ColonnaAttivita } from '@/components/ColonnaAttivita'
import { ColonnaCalendario } from '@/components/ColonnaCalendario'
import { NuoveAzioni } from '@/components/NuoveAzioni'
import { RicercaMail } from '@/components/RicercaMail'
import { CercaServer } from '@/components/CercaServer'
import { CarteApp } from '@/components/CarteApp'
import { InvioAppDialog } from '@/components/InvioAppDialog'
import { DelegaReneDialog } from '@/components/DelegaRene'
import { AgganciaDialog } from '@/components/AgganciaRiga'
import { NomeThreadDialog } from '@/components/NomeThreadRiga'
import { ListaMail } from '@/components/ListaMail'
import type { RigaData } from '@/components/RigaMail'
import { descriviAzioni } from '@/lib/appDeluxy'
import { leggiChiaviApp } from '@/lib/chiaviApp'
import { richiediUtente } from '@/lib/sessione'
import { raggruppa, chiaveThread } from '@/lib/thread'
import { emailContattiAI } from '@/lib/contattiAI'
import { nomiPerChiavi } from '@/lib/nomiThread'
import { indiceClienti } from '@/lib/anagrafiche'

export const dynamic = 'force-dynamic'
// Le azioni AI (analisi alla priorità) girano su questa route: su Vercel il
// default è 10s e la funzione verrebbe uccisa a metà chiamata OpenAI. 60s è il
// massimo del piano.
export const maxDuration = 60

type Props = {
  searchParams: Promise<{ sezione?: string; stato?: string; p?: string; vista?: string; q?: string }>
}

/**
 * In ricerca: estrae un pezzetto di testo attorno alla PRIMA occorrenza del
 * termine cercato, così la riga fa vedere DOVE compare (di solito nel corpo,
 * non nell'oggetto). Scandisce i campi nell'ordine in cui è più utile vederlo;
 * torna null solo se il termine non è in nessuno (non dovrebbe succedere: la
 * mail è nei risultati proprio perché lo contiene).
 */
function snippetRicerca(campi: (string | null | undefined)[], termine: string, contorno = 90): string | null {
  const t = termine.toLowerCase()
  for (const campo of campi) {
    if (!campo) continue
    const i = campo.toLowerCase().indexOf(t)
    if (i === -1) continue
    const inizio = Math.max(0, i - contorno)
    const fine = Math.min(campo.length, i + termine.length + contorno)
    let s = campo.slice(inizio, fine).replace(/\s+/g, ' ').trim()
    if (inizio > 0) s = '… ' + s
    if (fine < campo.length) s = s + ' …'
    return s
  }
  return null
}

export default async function PostaInArrivo({ searchParams }: Props) {
  const { sezione, stato, p, vista, q: qGrezzo } = await searchParams
  const q = (qGrezzo ?? '').trim()
  const ricerca = q.length >= 2
  const u = await richiediUtente()

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
  const [emailAI, tutteLeSezioni, account, storicoIncompleto, chiaviApp, sezioneAttiva, figlieSezione] =
    await Promise.all([
      emailContattiAI(u.id),
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

  const setAI = new Set(emailAI)

  // Riconciliazione coi CLIENTI di Anagrafiche (come in /clienti): si avvia
  // subito e si aspetta solo alla fine. L'indice sta in memoria (30 min) e non
  // blocca mai la pagina: se non è pronto si va avanti senza badge.
  const clientiPromise = indiceClienti().catch(() => null)

  // Le sezioni per lo spostamento rapido dalla riga (SPAM esclusa: da lì si esce
  // con «Non è spam», non ci si sposta a mano).
  const sezioniPerSposta = tutteLeSezioni.filter((s) => s.nome !== 'SPAM')

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

  // La sezione SPAM si vede solo aprendola: nella posta in arrivo (e nella AI
  // Inbox) la posta indesiderata resta fuori — escluso col filtro sulla
  // relazione sezione.nome più sotto (NON con l'id, per non perdere i NULL).

  // In RICERCA la posta si guarda tutta: ricevute e inviate, in qualunque
  // sezione (tranne il cestino). I filtri sezione/vista non si applicano.
  const whereRicerca = {
    utenteId: u.id,
    cestinato: false,
    OR: [
      { oggetto: { contains: q, mode: 'insensitive' as const } },
      { mittente: { contains: q, mode: 'insensitive' as const } },
      { mittenteNome: { contains: q, mode: 'insensitive' as const } },
      { destinatari: { contains: q, mode: 'insensitive' as const } },
      { corpoTesto: { contains: q, mode: 'insensitive' as const } },
      { corpoTradotto: { contains: q, mode: 'insensitive' as const } },
    ],
  }

  const messaggi = await db.messaggio.findMany({
    where: ricerca ? whereRicerca : {
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
        // ⚠️ Lo SPAM si esclude col filtro sulla RELAZIONE (sezione.nome), NON
        // con "NOT sezioneId = spamId" su campo scalare: quest'ultimo, per le
        // righe con sezioneId NULL (la posta NON smistata), dà NULL invece di
        // TRUE e le ESCLUDE — nascondendo così quasi tutta la posta in arrivo.
        // Il filtro-relazione include correttamente anche le mail senza sezione.
        : vistaAI
          // AI Inbox: le mail dei contatti AI+, SPAM escluso.
          ? { NOT: { sezione: { nome: 'SPAM' } } }
          : vistaNonSmistate
            // "Non smistate" = la posta in arrivo MENO quella già in una sezione:
            // tutto ciò che non ha ancora una sezione. Nessun vincolo sull'analisi AI.
            ? { sezioneId: null }
            // "In arrivo": TUTTA la posta (anche quella già smistata, che in riga
            // mostra il badge della sua sezione), tranne lo SPAM. Il Cestino è
            // già escluso a monte (cestinato: false).
            : { NOT: { sezione: { nome: 'SPAM' } } }),
      ...(stato === 'non-letti' ? { letto: false } : {}),
      ...(stato === 'da-rispondere' ? { serveRisposta: true } : {}),
      ...(p ? { priorita: p } : {}),
      // AI Inbox: SOLO le mail dei contatti col PLUS AI. Le mail nuove degli
      // altri restano in "In arrivo". Confronto CASE-INSENSITIVE: il mittente è
      // salvato com'è nell'indirizzo (la parte prima della @ può avere maiuscole,
      // es. "Martina.Calia@…"), mentre i contatti AI sono minuscoli — un "in"
      // secco non aggancerebbe.
      ...(vistaAI
        ? { OR: emailAI.map((e) => ({ mittente: { equals: e, mode: 'insensitive' as const } })) }
        : {}),
    },
    // Sempre in ordine di arrivo: una mail appena arrivata non è ancora stata
    // analizzata, e ordinare per priorità la spingerebbe in fondo. Per vedere
    // le urgenze si usano i filtri P0…P3 qui sopra.
    orderBy: { data: 'desc' },
    // Finestra larga: con molte notifiche automatiche (es. gli ordini) le
    // ultime 100 sarebbero quasi tutte quelle, e il resto della posta
    // sparirebbe. Si prende largo (senza i corpi, che pesano) e si taglia
    // DOPO il raggruppamento in conversazioni.
    // 800 basta: con 2000 si pagava il trasporto dal database (e il tempo di
    // raggruppamento) di mail che nessuno arriva mai a scorrere.
    take: 800,
    omit: { corpoTesto: true, corpoHtml: true },
    include: {
      sezione: { select: { nome: true, colore: true } },
      bozze: { where: { inviata: false }, select: { id: true } },
      _count: { select: { attivita: true, inviiApp: true } },
    },
  })

  // Raggruppa la posta in conversazioni: una riga per thread (catena di
  // risposte o stesso oggetto anche con destinatari diversi). Il volto della
  // riga è il messaggio più recente del thread. La lista si carica poi 25 alla
  // volta lato client, così l'apertura resta leggera anche con molta posta.
  // 300 conversazioni: oltre, si spediva al browser un elenco enorme che
  // nessuno scorre (in fondo alla lista c'è comunque «Carica altre» e, per la
  // posta vecchia, la ricerca sul server).
  const gruppi = raggruppa(messaggi).slice(0, 300)

  // Iconcina "risposto": una mail ha una nostra risposta se nel suo thread c'è
  // un messaggio in USCITA. (Gli inoltri aprono una conversazione nuova, quindi
  // non risultano legati all'originale: qui si segna solo "risposto".)
  const rootsVisti = messaggi
    .map((m) => m.thread || m.messageId)
    .filter((x): x is string => Boolean(x))
  const chiaviGruppi = gruppi.map((g) => chiaveThread(g))
  // I codici di aggancio manuale presenti: servono a ritrovare gli INOLTRI, che
  // non hanno la radice del thread (aprono una catena nuova) e sono legati
  // all'originale solo dall'aggancio.
  const codiciManuali = [...new Set(messaggi.map((m) => m.threadManuale).filter((x): x is string => Boolean(x)))]

  // Le letture che dipendono dai gruppi vanno insieme, non in fila.
  const [uscite, inoltri, nomiConv] = await Promise.all([
    rootsVisti.length
      ? db.messaggio.findMany({
          where: { utenteId: u.id, direzione: 'uscita', thread: { in: rootsVisti } },
          select: { thread: true },
        })
      : Promise.resolve([]),
    rootsVisti.length || codiciManuali.length
      ? db.messaggio.findMany({
          where: {
            utenteId: u.id,
            direzione: 'uscita',
            modoInvio: 'inoltra',
            OR: [{ thread: { in: rootsVisti } }, { threadManuale: { in: codiciManuali } }],
          },
          select: { thread: true, threadManuale: true },
        })
      : Promise.resolve([]),
    // Il nome dato a mano alle conversazioni (badge oro nella riga).
    nomiPerChiavi(u.id, chiaviGruppi),
  ])
  const threadRisposti = new Set<string>()
  for (const o of uscite) if (o.thread) threadRisposti.add(o.thread)
  const radiciInoltrate = new Set<string>()
  const agganciInoltrati = new Set<string>()
  for (const o of inoltri) {
    if (o.thread) radiciInoltrate.add(o.thread)
    if (o.threadManuale) agganciInoltrati.add(o.threadManuale)
  }

  // Il cliente (azienda attiva in Anagrafiche) del mittente, per email esatta
  // o per dominio aziendale — stessa regola della pagina /clienti.
  const idxClienti = await clientiPromise
  const clienteDi = (mittente: string): string | null => {
    if (!idxClienti) return null
    const e = mittente.toLowerCase()
    const cli = idxClienti.perEmail.get(e) || idxClienti.perDominio.get(e.split('@')[1] || '')
    return cli ? cli.nome : null
  }

  const righe: RigaData[] = gruppi.map((g, i) => {
    const m = g[g.length - 1] // il volto: il messaggio più recente del thread
    return {
      nomeThread: nomiConv.get(chiaviGruppi[i]) ?? null,
      id: m.id,
      mittente: m.mittente,
      mittenteNome: m.mittenteNome,
      oggetto: m.oggetto,
      data: m.data,
      riassunto: m.riassunto,
      anteprima: m.anteprima,
      // Solo l'anteprima della traduzione: la riga ne mostra 200 caratteri, e
      // spedire al browser il corpo tradotto INTERO di ogni riga pesava.
      corpoTradotto: m.corpoTradotto ? m.corpoTradotto.replace(/\s+/g, ' ').slice(0, 200) : null,
      lingua: m.lingua,
      sezione: m.sezione ? { nome: m.sezione.nome, colore: m.sezione.colore } : null,
      sezioneId: m.sezioneId,
      bozze: m.bozze.length,
      attivita: m._count.attivita,
      inviiApp: m._count.inviiApp,
      eventoProposto: Boolean(m.eventoProposto),
      archiviato: m.archiviato,
      cestinato: m.cestinato,
      priorita: m.priorita,
      prioritaDa: m.prioritaDa,
      analizzato: m.analizzatoIl !== null,
      nel: g.length,
      parti: new Set(g.map((x) => (x.direzione === 'uscita' ? 'me' : x.mittente.toLowerCase()))).size,
      nonLetti: g.some((x) => !x.letto),
      contattoAI: setAI.has(m.mittente.toLowerCase()),
      risposto: threadRisposti.has(m.thread || m.messageId || ''),
      // Inoltrata: c'è una nostra mail d'inoltro nella stessa conversazione
      // (per radice o per aggancio manuale).
      inoltrato:
        radiciInoltrate.has(m.thread || m.messageId || '') ||
        g.some((x) => x.threadManuale && agganciInoltrati.has(x.threadManuale)),
      // In ricerca compaiono anche le mail INVIATE: le mostriamo col "a …".
      inviata: m.direzione === 'uscita',
      destinatari: m.destinatari,
      // Badge verde col nome dell'azienda se il mittente è un cliente.
      clienteNome: m.direzione === 'uscita' ? null : clienteDi(m.mittente),
    }
  })

  // In ricerca: per far vedere DOVE compare la parola cercata, prendo il corpo
  // delle sole mail mostrate (i corpi sono esclusi dalla query leggera) e ne
  // ricavo uno snippet evidenziato. Così ogni risultato mostra la parola.
  if (ricerca) {
    const corpi = await db.messaggio.findMany({
      where: { id: { in: righe.map((r) => r.id) }, utenteId: u.id },
      select: {
        id: true,
        corpoTesto: true,
        corpoTradotto: true,
        oggetto: true,
        destinatari: true,
        mittenteNome: true,
        mittente: true,
      },
    })
    const perId = new Map(corpi.map((c) => [c.id, c]))
    for (const r of righe) {
      const c = perId.get(r.id)
      r.snippet = c
        ? snippetRicerca([c.corpoTesto, c.corpoTradotto, c.oggetto, c.destinatari, c.mittenteNome, c.mittente], q)
        : null
      r.evidenzia = q
    }
  }

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

      <div className="inbox-split">
        <div className="card tight">
        {messaggi.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">{ricerca ? '⌕' : vistaAI && emailAI.length === 0 ? 'AI' : '✓'}</div>
            <div className="empty-title">
              {ricerca
                ? 'Nessun risultato'
                : vistaAI && emailAI.length === 0
                  ? 'Nessun contatto col PLUS AI'
                  : 'Niente da vedere qui'}
            </div>
            <p className="empty-text">
              {ricerca ? (
                <>Nessuna mail (ricevuta o inviata) contiene «{q}».</>
              ) : vistaAI && emailAI.length === 0 ? (
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
          <ListaMail
            righe={righe}
            sezioni={sezioniPerSposta}
            // In ricerca no: scaricare blocchi vecchi a caso non c'entra coi risultati.
            cercaVecchie={!ricerca && storicoIncompleto}
          />
        )}
        </div>

        <div className="inbox-lato">
          {/* L'agenda in cima: i prossimi appuntamenti si vedono appena si apre la posta. */}
          <ColonnaCalendario utenteId={u.id} />
          <CarteApp azioni={azioniApp} />
          <ColonnaAttivita utenteId={u.id} />
        </div>
      </div>

      <InvioAppDialog azioni={azioniApp} />
      <DelegaReneDialog />
      <AgganciaDialog />
      <NomeThreadDialog />
    </>
  )
}
