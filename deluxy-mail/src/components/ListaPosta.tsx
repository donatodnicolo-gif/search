import Link from 'next/link'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { ListaMail } from './ListaMail'
import type { RigaData } from './RigaMail'
import { raggruppa } from '@/lib/thread'
import { nomiPerGruppi } from '@/lib/nomiThread'
import { indiceClienti } from '@/lib/anagrafiche'

/**
 * L'ELENCO della posta: la parte pesante della schermata principale.
 *
 * ⚠️ Sta in un componente a parte per una ragione sola: perché la pagina possa
 * **comparire prima di lui**. Prima tutto stava dentro `page.tsx`, e Next non
 * manda una riga di HTML finché il componente non ha finito: aprire la posta in
 * arrivo voleva dire restare sul bianco per tutto il tempo delle query — la
 * finestra di 800 mail, il raggruppamento in conversazioni, i nomi, le
 * risposte, i clienti. Ora la pagina (titolo, filtri, schede, colonna di
 * destra) esce subito e l'elenco arriva dentro un `<Suspense>` un attimo dopo.
 *
 * Il lavoro è lo stesso: non è diventato più veloce, è diventato **non
 * bloccante**. Che è quello che si sente.
 */

/**
 * In ricerca: estrae un pezzetto di testo attorno alla PRIMA occorrenza del
 * termine cercato, così la riga fa vedere DOVE compare (di solito nel corpo,
 * non nell'oggetto). Scandisce i campi nell'ordine in cui è più utile vederlo.
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

/** Il posto che l'elenco occuperà: si vede subito, così la pagina non "salta". */
export function ListaPostaInCorso() {
  return (
    <div className="card tight">
      <div className="empty">
        <div className="empty-icon">✉</div>
        <div className="empty-title">Carico la posta…</div>
        <p className="empty-text">Un istante: le conversazioni si stanno mettendo in fila.</p>
      </div>
    </div>
  )
}

type Props = {
  utenteId: string
  accountAttivo: string | null
  q: string
  ricerca: boolean
  sezione?: string
  idsSezione: string[]
  /** L'id della sezione SPAM, se esiste: serve a escluderla senza sottoquery. */
  spamId: string | null
  vistaAI: boolean
  vistaNonSmistate: boolean
  stato?: string
  p?: string
  emailAI: string[]
  idsAI: string[]
  sezioniPerSposta: { id: string; nome: string }[]
  storicoIncompleto: boolean
}

export async function ListaPosta({
  utenteId,
  accountAttivo,
  q,
  ricerca,
  sezione,
  idsSezione,
  spamId,
  vistaAI,
  vistaNonSmistate,
  stato,
  p,
  emailAI,
  idsAI,
  sezioniPerSposta,
  storicoIncompleto,
}: Props) {
  const setAI = new Set(emailAI)
  const senzaAI = emailAI.length === 0 && idsAI.length === 0

  // ⚠️ ESCLUDERE LO SPAM SENZA PAGARE UNA SOTTOQUERY PER RIGA. Il filtro sulla
  // RELAZIONE (`NOT: { sezione: { nome: 'SPAM' } }`) Prisma lo traduce in una
  // sottoquery valutata per ogni riga candidata. Il filtro scalare secco `NOT
  // sezioneId = spamId` però NON si può usare: sulle righe con `sezioneId` NULL
  // (tutta la posta non smistata) dà NULL invece di TRUE e le ESCLUDE. La forma
  // giusta è dirlo per esteso: «senza sezione, OPPURE in una sezione che non è
  // lo SPAM» — i NULL rientrano dal primo ramo.
  const fuoriSpam = spamId
    ? { AND: [{ OR: [{ sezioneId: null }, { sezioneId: { not: spamId } }] }] }
    : {}

  // Riconciliazione coi CLIENTI di Anagrafiche (come in /clienti): si avvia
  // subito e si aspetta solo alla fine. L'indice sta in memoria (30 min) e non
  // blocca mai la pagina: se non è pronto si va avanti senza badge.
  const clientiPromise = indiceClienti().catch(() => null)

  // In RICERCA la posta si guarda tutta: ricevute e inviate, in qualunque
  // sezione (tranne il cestino). I filtri sezione/vista non si applicano.
  const whereRicerca = {
    utenteId,
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
    where: ricerca
      ? whereRicerca
      : {
          utenteId,
          // Casella attiva (multi-account): se scelta, si vede solo la sua posta.
          ...(accountAttivo ? { accountId: accountAttivo } : {}),
          // Il cestino ha una pagina sua: qui non si vede mai, nemmeno fra gli
          // archiviati o filtrando per sezione.
          cestinato: false,
          // Quello che hai inviato tu sta in "Posta inviata".
          direzione: 'entrata',
          archiviato: stato === 'archiviati',
          // Una mail smistata in una sezione sta NELLA SUA SEZIONE, come le
          // cartelle di un client classico: la posta in arrivo mostra solo
          // quella ancora da smistare. Senza questo, una sezione ad alto volume
          // (es. le notifiche degli ordini) replicherebbe sé stessa in posta in
          // arrivo seppellendo il resto. Nella AI Inbox invece si vede tutto il
          // contatto, in qualunque sezione (tranne SPAM).
          ...(sezione
            ? { sezioneId: { in: idsSezione } }
            : vistaAI
              ? fuoriSpam
              : vistaNonSmistate
                // "Non smistate" = la posta in arrivo MENO quella già in una
                // sezione: tutto ciò che non ha ancora una sezione.
                ? { sezioneId: null }
                : fuoriSpam),
          ...(stato === 'non-letti' ? { letto: false } : {}),
          ...(stato === 'da-rispondere' ? { serveRisposta: true } : {}),
          ...(p ? { priorita: p } : {}),
          // AI Inbox: SOLO le mail dei contatti col PLUS AI. Confronto
          // CASE-INSENSITIVE: il mittente è salvato com'è nell'indirizzo (la
          // parte prima della @ può avere maiuscole), i contatti AI sono
          // minuscoli — un "in" secco non aggancerebbe. …e ANCHE le mail delle
          // conversazioni col PLUS AI (il segno sta su ogni mail del thread).
          ...(vistaAI
            ? {
                OR: [
                  ...emailAI.map((e) => ({ mittente: { equals: e, mode: 'insensitive' as const } })),
                  ...(idsAI.length ? [{ id: { in: idsAI } }] : []),
                ],
              }
            : {}),
        },
    // Sempre in ordine di arrivo: una mail appena arrivata non è ancora stata
    // analizzata, e ordinare per priorità la spingerebbe in fondo.
    orderBy: { data: 'desc' },
    // Finestra larga: con molte notifiche automatiche le ultime 100 sarebbero
    // quasi tutte quelle. Si prende largo e si taglia DOPO il raggruppamento.
    take: 800,
    // ⚠️ PESO DELLA RISPOSTA: `select` esplicito, non `omit`. Con "tutto tranne
    // due campi" restava dentro `corpoTradotto`, che è TEXT e per 800 righe
    // significa megabyte trasportati dall'Europa agli Stati Uniti a ogni
    // apertura. Della traduzione servono 200 caratteri: si prendono più sotto.
    select: {
      id: true,
      thread: true,
      messageId: true,
      threadManuale: true,
      scollegato: true,
      direzione: true,
      mittente: true,
      mittenteNome: true,
      destinatari: true,
      oggetto: true,
      data: true,
      anteprima: true,
      riassunto: true,
      lingua: true,
      letto: true,
      archiviato: true,
      cestinato: true,
      sezioneId: true,
      priorita: true,
      prioritaDa: true,
      analizzatoIl: true,
      dimensione: true,
      // Piccolo (di solito NULL, altrimenti un JSON di poche righe): resta qui.
      eventoProposto: true,
      sezione: { select: { nome: true, colore: true } },
      bozze: { where: { inviata: false }, select: { id: true } },
      _count: { select: { attivita: true, inviiApp: true } },
    },
  })

  if (messaggi.length === 0) {
    return (
      <div className="card tight">
        <div className="empty">
          <div className="empty-icon">{ricerca ? '⌕' : vistaAI && senzaAI ? 'AI' : '✓'}</div>
          <div className="empty-title">
            {ricerca ? 'Nessun risultato' : vistaAI && senzaAI ? 'Nessun contatto col PLUS AI' : 'Niente da vedere qui'}
          </div>
          <p className="empty-text">
            {ricerca ? (
              <>Nessuna mail (ricevuta o inviata) contiene «{q}».</>
            ) : vistaAI && senzaAI ? (
              <>
                Apri una mail (o una scheda in Rubrica) e premi <strong>+ AI</strong> per seguirne il
                contatto qui. Intanto trovi la posta in{' '}
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
      </div>
    )
  }

  // Raggruppa la posta in conversazioni: una riga per thread. Il volto della
  // riga è il messaggio più recente. 300 conversazioni: oltre, si spediva al
  // browser un elenco enorme che nessuno scorre.
  const gruppi = raggruppa(messaggi).slice(0, 300)

  // Iconcina "risposto": una mail ha una nostra risposta se nel suo thread c'è
  // un messaggio in USCITA. Deduplicate: in un thread di 30 mail la radice è
  // sempre la stessa, e senza il Set finiva 30 volte dentro l'`IN (…)`.
  const rootsVisti = [
    ...new Set(messaggi.map((m) => m.thread || m.messageId).filter((x): x is string => Boolean(x))),
  ]
  // I codici di aggancio manuale: ritrovano gli INOLTRI, che non hanno la
  // radice del thread e sono legati all'originale solo dall'aggancio.
  const codiciManuali = [...new Set(messaggi.map((m) => m.threadManuale).filter((x): x is string => Boolean(x)))]

  const [uscite, inoltri, nomiConv] = await Promise.all([
    rootsVisti.length
      ? db.messaggio.findMany({
          where: { utenteId, direzione: 'uscita', thread: { in: rootsVisti } },
          select: { thread: true },
        })
      : Promise.resolve([]),
    rootsVisti.length || codiciManuali.length
      ? db.messaggio.findMany({
          where: {
            utenteId,
            direzione: 'uscita',
            modoInvio: 'inoltra',
            OR: [{ thread: { in: rootsVisti } }, { threadManuale: { in: codiciManuali } }],
          },
          select: { thread: true, threadManuale: true },
        })
      : Promise.resolve([]),
    nomiPerGruppi(utenteId, gruppi),
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
      nomeThread: nomiConv[i] ?? null,
      id: m.id,
      mittente: m.mittente,
      mittenteNome: m.mittenteNome,
      oggetto: m.oggetto,
      data: m.data,
      riassunto: m.riassunto,
      anteprima: m.anteprima,
      // L'anteprima della traduzione arriva dalla query mirata più sotto: il
      // corpo tradotto INTERO non si trasporta, né dal database né al browser.
      corpoTradotto: null,
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
      // Gli id del gruppo: «✓ Letto» deve agire su quello che la riga MOSTRA,
      // non su una conversazione ricalcolata a parte (vedi RigaData.ids).
      ids: g.map((x) => x.id),
      contattoAI: setAI.has(m.mittente.toLowerCase()),
      risposto: threadRisposti.has(m.thread || m.messageId || ''),
      inoltrato:
        radiciInoltrate.has(m.thread || m.messageId || '') ||
        g.some((x) => x.threadManuale && agganciInoltrati.has(x.threadManuale)),
      // In ricerca compaiono anche le mail INVIATE: le mostriamo col "a …".
      inviata: m.direzione === 'uscita',
      destinatari: m.destinatari,
      clienteNome: m.direzione === 'uscita' ? null : clienteDi(m.mittente),
      dimensione: m.dimensione ?? 0,
    }
  })

  // ⚠️ I CAMPI PESANTI, presi SOLO per le righe davvero mostrate e SOLO nella
  // misura che serve: la dimensione per l'ordinamento (le mail vecchie l'hanno
  // a 0) e i 200 caratteri di traduzione, tagliati nel database. Si interrogano
  // solo le righe che hanno qualcosa da chiedere.
  const daCompletare = righe.filter((r) => !r.dimensione || r.lingua)
  if (daCompletare.length > 0) {
    try {
      const extra = await db.$queryRaw<{ id: string; peso: number; tradotto: string | null }[]>(
        Prisma.sql`SELECT "id",
                          (octet_length("corpoTesto") + COALESCE(octet_length("corpoHtml"), 0))::int AS peso,
                          left("corpoTradotto", 400) AS tradotto
                     FROM "Messaggio"
                    WHERE "id" IN (${Prisma.join(daCompletare.map((r) => r.id))})`
      )
      const perId = new Map(extra.map((e) => [e.id, e]))
      for (const r of daCompletare) {
        const e = perId.get(r.id)
        if (!e) continue
        if (!r.dimensione) r.dimensione = Number(e.peso) || 0
        r.corpoTradotto = e.tradotto ? e.tradotto.replace(/\s+/g, ' ').slice(0, 200) : null
      }
    } catch {
      /* niente: si ordina e si mostra con quello che c'è */
    }
  }

  // In ricerca: per far vedere DOVE compare la parola cercata, prendo il corpo
  // delle sole mail mostrate e ne ricavo uno snippet evidenziato.
  if (ricerca) {
    const corpi = await db.messaggio.findMany({
      where: { id: { in: righe.map((r) => r.id) }, utenteId },
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

  return (
    <div className="card tight">
      <ListaMail
        righe={righe}
        sezioni={sezioniPerSposta}
        // In ricerca no: scaricare blocchi vecchi a caso non c'entra coi risultati.
        cercaVecchie={!ricerca && storicoIncompleto}
      />
    </div>
  )
}
