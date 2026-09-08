import { db } from '@/lib/db'
import { utenteCorrente } from '@/lib/sessione'
import { esci } from '@/lib/auth-actions'
import { iniziali } from '@/lib/contatti'
import { SyncButton } from './SyncButton'
import { PrimoCarico } from './PrimoCarico'
import { PiuAzione } from './PiuAzione'
import type { TipoAzione } from './AzioneRapida'
import { SelettoreAccount } from './SelettoreAccount'
import { accountAttivoId, caselleUtente } from '@/lib/accountAttivo'
import { VoceMenu, VoceSezione, DropMail, type Bersaglio } from './VoceMenu'
import { iconaPerVoce } from './iconeNav'

type Voce = {
  href: string
  label: string
  badge?: number
  /** Se presente, si possono TRASCINARE qui le mail per spostarle. */
  bersaglio?: Bersaglio
  /** Se presente, accanto alla voce compare un «+» che apre l'azione rapida in
   *  un popup (desktop), senza cambiare pagina. */
  azione?: TipoAzione
  azioneTitolo?: string
}

/** Un gruppo di voci del menu. Prima lo stesso blocco era ricopiato per ogni
 *  gruppo: cambiare una riga voleva dire cambiarla in tre punti. */
function Gruppo({ titolo, voci }: { titolo: string; voci: Voce[] }) {
  if (voci.length === 0) return null
  return (
    <nav className="nav-section">
      <div className="nav-label">{titolo}</div>
      {voci.map((v) => (
        <VoceMenu key={v.href} href={v.href} label={v.label} badge={v.badge} bersaglio={v.bersaglio} icona={iconaPerVoce(v.label)}>
          {v.azione && <PiuAzione tipo={v.azione} titolo={v.azioneTitolo || `Nuovo — ${v.label}`} />}
        </VoceMenu>
      ))}
    </nav>
  )
}

async function datiSidebar(utenteId: string, accountAttivo: string | null) {
  // Con una casella attiva, i conteggi della POSTA si riferiscono a quella
  // (non alla somma di tutte): «switch» significa guardare quella casella.
  const perCasella = accountAttivo ? { accountId: accountAttivo } : {}

  // ⚠️⚠️ I PALLINI DELLE SEZIONI SI CONTANO CON UNA groupBy, NON CON _count.
  // (08/09/2026, custode delle prestazioni — misurato con EXPLAIN in produzione.)
  //
  // Qui c'era un `_count` con un `where` dentro il `select` delle sezioni.
  // Prisma lo traduce in un LEFT JOIN su una sotto-aggregazione, e quella
  // sotto-aggregazione **non porta il filtro per utente**: il `utenteId` resta
  // sulla Sezione di fuori, mentre dentro si conta su TUTTA la tabella
  // `Messaggio`. Misurato: Index Only Scan su **46.645 righe e ~80 MB di
  // buffer per chiamata**, per calcolare i conteggi di 19 sezioni in tutto.
  //
  // Non è una pagina di rado: questa è la SIDEBAR, quindi gira su OGNI pagina
  // dell'app. In `pg_stat_statements` erano 4.878 chiamate e 4.195.851 ms —
  // circa **17 minuti di CPU al giorno, in crescita** — con una media di 860 ms
  // e punte di 62 secondi sotto contesa. Era la voce più cara rimasta di questa
  // app dopo che la pulizia HTML è stata messa a dormire.
  //
  // La groupBy filtra per `utenteId` prima di aggregare, e l'indice
  // `Messaggio_posta_idx` copre esattamente queste colonne. Da tutta la tabella
  // ai messaggi di una persona sola.
  //
  // ⚠️ La forma del risultato resta identica (`s._count.messaggi`): il resto
  // del componente non cambia, e non deve.
  const nonLetteInSezione = {
    utenteId,
    archiviato: false,
    letto: false,
    cestinato: false,
    direzione: 'entrata',
    ...perCasella,
  }
  try {
    const [sezioniNude, conteggiPerSezione, daFare, nonLette, cestinati, bozze, riassunti] = await Promise.all([
      db.sezione.findMany({
        where: { utenteId },
        orderBy: { ordine: 'asc' },
        select: {
          id: true,
          nome: true,
          colore: true,
          genitoreId: true,
        },
      }),
      db.messaggio.groupBy({
        by: ['sezioneId'],
        where: { ...nonLetteInSezione, sezioneId: { not: null } },
        _count: { _all: true },
      }),
      db.attivita.count({ where: { utenteId, fatta: false } }),
      db.messaggio.count({
        where: {
          utenteId,
          letto: false,
          archiviato: false,
          cestinato: false,
          direzione: 'entrata',
          ...perCasella,
          // La posta indesiderata non gonfia il contatore della posta in arrivo.
          NOT: { sezione: { nome: 'SPAM' } },
        },
      }),
      db.messaggio.count({ where: { utenteId, cestinato: true, ...perCasella } }),
      db.bozza.count({ where: { utenteId, inviata: false } }),
      // La tabella dei riassunti potrebbe non esistere ancora: in caso, 0.
      db.riassuntoThread.count({ where: { utenteId } }).catch(() => 0),
    ])
    // Si ricuce qui: una Map per id di sezione, e la stessa forma di prima.
    const perSezione = new Map(conteggiPerSezione.map((r) => [r.sezioneId, r._count._all]))
    const sezioni = sezioniNude.map((s) => ({
      ...s,
      _count: { messaggi: perSezione.get(s.id) ?? 0 },
    }))
    return { sezioni, daFare, nonLette, cestinati, bozze, riassunti }
  } catch {
    return { sezioni: [], daFare: 0, nonLette: 0, cestinati: 0, bozze: 0, riassunti: 0 }
  }
}

export async function Sidebar() {
  const utente = await utenteCorrente()
  if (!utente) return null // la pagina reindirizza al login; niente sidebar

  const [accountAttivo, caselle] = await Promise.all([
    accountAttivoId(utente.id),
    caselleUtente(utente.id),
  ])
  const { sezioni, daFare, nonLette, cestinati, bozze, riassunti } = await datiSidebar(utente.id, accountAttivo)

  // Il menu in cinque gruppi, ognuno con un criterio chiaro:
  //   POSTA        — dove STA la posta (le caselle: in arrivo, bozze, inviata…)
  //   STRUMENTI    — altri MODI di guardare la stessa posta (thread, clienti…)
  //   APPLICAZIONI — cose che lavorano PER TE (Renè, attività, calendario…)
  //   SEZIONI      — le colonne in cui smisti la posta (dinamiche)
  //   GESTIONE     — come si configura l'app
  // Dentro ogni gruppo l'ordine è per frequenza d'uso, non alfabetico.
  // ⚠️ Lo SPAM è una CARTELLA, non una sezione tua: lo crea l'app da sola e
  // sta con Cestino e Archivio. Finché stava in fondo, insieme alle sezioni,
  // su telefono finiva sotto quattordici voci — dentro un cassetto, cioè
  // introvabile. Qui è al suo posto, e più sotto viene tolto dall'elenco delle
  // sezioni per non averlo due volte.
  const spam = sezioni.find((s) => s.nome === 'SPAM')

  // ⚠️ `bersaglio` = si possono TRASCINARE qui le mail. Bozze e Posta inviata
  // non ce l'hanno: non sono stati in cui si può mettere una mail ricevuta.
  const posta: Voce[] = [
    { href: '/', label: 'Posta in arrivo', badge: nonLette, bersaglio: { tipo: 'posta' } },
    { href: '/bozze', label: 'Bozze', badge: bozze },
    { href: '/inviata', label: 'Posta inviata' },
    // Archiviata = messa via ma tenuta (non è nel Cestino). È il filtro
    // "Archiviati" della posta in arrivo, qui come voce a sé per ritrovarla.
    { href: '/?stato=archiviati', label: 'Archivio', bersaglio: { tipo: 'archivio' } },
    ...(spam
      ? [
          {
            href: `/?sezione=${spam.id}`,
            label: 'Spam',
            badge: spam._count.messaggi,
            bersaglio: { tipo: 'spam' } as const,
          },
        ]
      : []),
    { href: '/cestino', label: 'Cestino', badge: cestinati, bersaglio: { tipo: 'cestino' } },
  ]

  const strumenti: Voce[] = [
    // Tutte le conversazioni raggruppate in thread.
    { href: '/thread', label: 'Thread' },
    // La posta dei clienti del registro Anagrafiche (per email o dominio).
    { href: '/clienti', label: 'Clienti' },
    // Le cose da fare ricavate dalla posta: è materiale di lavoro sulla posta.
    { href: '/attivita', label: 'Attività', badge: daFare, azione: 'attivita', azioneTitolo: 'Nuova attività' },
    // I quadri conversazione fatti dall'AI, col link al thread.
    { href: '/riassunti', label: 'Riassunti', badge: riassunti },
    { href: '/rubrica', label: 'Rubrica' },
    // I testi pronti per rispondere. Vivono nell'app Scripts, non qui: questa
    // voce li mostra e permette di scriverne mentre si lavora sulla posta.
    { href: '/script', label: 'Risposte rapide' },
  ]

  const applicazioni: Voce[] = [
    { href: '/rene', label: 'Renè AI', azione: 'rene', azioneTitolo: 'Chiedi a Renè' },
    { href: '/calendario', label: 'Calendario', azione: 'evento', azioneTitolo: 'Nuovo appuntamento' },
    // I modelli di follow-up da agganciare all'invio di una mail.
    { href: '/sequenze', label: 'Sequenze' },
  ]

  const gestione: Voce[] = [
    { href: '/regole', label: 'Regole' },
    { href: '/sezioni', label: 'Sezioni' },
    { href: '/statistiche', label: 'Statistiche' },
    { href: '/impostazioni-app', label: 'Impostazioni App' },
    { href: '/impostazioni', label: 'Impostazioni' },
    ...(utente.ruolo === 'admin' ? [{ href: '/utenti', label: 'Utenti' }] : []),
  ]

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-logo">D</div>
        <div>
          <div className="brand-name">AI Mail</div>
          <div className="brand-sub">Deluxy · 2.0</div>
        </div>
      </div>

      <SyncButton intervalloSec={utente.sincronizzaOgniSec ?? 300} />
      {/* Primo carico: su una casella appena collegata scarica in background le
          ultime 500 ricevute + 500 inviate, poi si spegne da solo. Il resto
          dello storico è on-demand (fondo lista / ricerca sul server). */}
      <PrimoCarico />

      {/* Con più caselle collegate: da qui si sceglie quale guardare e da quale
          inviare (il selettore non compare con una sola casella). */}
      <SelettoreAccount caselle={caselle.map((c) => ({ id: c.id, email: c.email }))} attivo={accountAttivo} />

      <Gruppo titolo="Posta" voci={posta} />
      <Gruppo titolo="Strumenti" voci={strumenti} />
      <Gruppo titolo="Applicazioni" voci={applicazioni} />

      {sezioni.some((s) => s.nome !== 'SPAM') && (
        <nav className="nav-section">
          <div className="nav-label">Sezioni</div>
          {/* Prima le principali, e sotto a ognuna le sue sottosezioni rientrate. */}
          {sezioni
            // Lo SPAM sta con le cartelle, qui sopra: non si ripete.
            .filter((s) => s.nome !== 'SPAM')
            .filter((s) => !s.genitoreId)
            .flatMap((s) => [s, ...sezioni.filter((f) => f.genitoreId === s.id)])
            .map((s) => (
              // Anche le sezioni accettano le mail trascinate: è il caso più
              // usato («spostale in Commerciale»), ed è lo stesso gesto del
              // menu «Sposta in…» sulla riga.
              <DropMail
                key={s.id}
                bersaglio={{ tipo: 'sezione', sezioneId: s.id }}
                label={s.nome}
                className="nav-drop"
              >
                <VoceSezione
                  href={`/?sezione=${s.id}`}
                  nome={s.nome}
                  colore={s.colore}
                  badge={s._count.messaggi}
                  sotto={!!s.genitoreId}
                />
              </DropMail>
            ))}
        </nav>
      )}

      <Gruppo titolo="Gestione" voci={gestione} />

      <div className="sidebar-footer">
        <span className="avatar">{iniziali(utente.nome, utente.email)}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {utente.nome}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            {utente.ruolo === 'admin' ? 'Amministratore' : 'Utente'}
          </div>
        </div>
        {/* M10 — 27/08/2026: il logout era un link di testo sottolineato (la
            sottolineatura promette navigazione, non un'azione; e 12px sono un
            bersaglio minuscolo). Ora è un'icona «esci», come da Libro §1. */}
        <form action={esci}>
          <button type="submit" className="logout-btn" title="Esci" aria-label="Esci">
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="M16 17l5-5-5-5" />
              <path d="M21 12H9" />
            </svg>
          </button>
        </form>
      </div>
    </aside>
  )
}
