'use client'

import Link from 'next/link'
import { avvisaSessioneScaduta } from '@/lib/leggi-json'
import { usePathname } from 'next/navigation'
import { decidiPallini, type Visto } from '@/lib/pallini'
import { useCallback, useEffect, useState } from 'react'

// Menu laterale (stesso impianto di Deluxy Orders). È un client component per
// evidenziare la voce attiva e per richiudersi da solo su mobile.
export function Sidebar({
  amministratore = false,
  utente = '',
}: {
  amministratore?: boolean
  /**
   * Chi ha fatto l'accesso. Si mostra SOLO sul telefono, in fondo al menu.
   *
   * ⚠️ Su uno schermo da 375px la barra in alto ha spazio per il nome dell'app
   * O per il nome della persona, non per tutti e due: a 19px «Deluxy Customer
   * Service» andava a capo tre volte e la barra diventava alta 81px — con il
   * pannello del menu, ancorato a 63px, che ci finiva SOTTO. Il nome dell'app
   * dice dove sei e resta in alto; chi sei si legge qui, dove si va comunque
   * per spostarsi.
   */
  utente?: string
}) {
  const path = usePathname()

  // Su mobile il menu è un pannello che copre la pagina: appena hai scelto dove
  // andare deve togliersi di mezzo. Chiuderlo al cambio di PERCORSO — e non nel
  // click del link — copre anche le navigazioni che partono da altrove (tasto
  // indietro, redirect dopo un'azione): il pannello non resta mai davanti a una
  // pagina che non c'entra più.
  useEffect(() => {
    document.documentElement.removeAttribute('data-menu-aperto')
  }, [path])

  // ⚠️ L'ORDINE DI QUESTO MENU È UNA SCELTA, non un elenco alfabetico.
  //
  // Il lavoro di un operatore, in ordine: rispondere a chi aspetta, portare a
  // casa gli ordini di oggi, chiudere i reclami aperti. Le MISURE — punteggi,
  // giudizi, pagelle dei valet — servono a chi guarda indietro una volta a
  // settimana, non a chi ha un cliente al telefono adesso: stanno in fondo, in
  // «Qualità», e non più in mezzo alle cose da fare.
  //
  // ⚠️ L'UNICA ECCEZIONE a quell'ordine è «Turni», in cima. Non è lavoro
  // quotidiano, ma la vede **solo un amministratore**: per lui la giornata
  // comincia da chi c'è, e per l'operatore quel gruppo non esiste proprio —
  // quindi non gli sposta niente più in basso.
  const gruppi = [
    ...(amministratore
      ? [{ titolo: 'Turni', voci: [{ href: '/turni', nome: 'Turni', icona: iconaCalendario }] }]
      : []),
    {
      titolo: 'Lavoro',
      voci: [
        { href: '/', nome: 'Oggi', icona: iconaOggi },
        { href: '/inbox', nome: 'Inbox', icona: iconaChat },
        // Subito sotto Inbox: e' l'altro canale in entrata, e l'unico che si
        // cancella da solo. Una mail resta li' finche' qualcuno la apre; una
        // chiamata persa, se nessuno la registra, non e' mai esistita.
        { href: '/chiamate', nome: 'Chiamate', icona: iconaChiamate },
        { href: '/ordini', nome: 'Ordini aperti', icona: iconaLista },
        { href: '/calendario', nome: 'Calendario', icona: iconaCalendario },
        // Il quaderno di lavoro: sta in «Lavoro» perche' e' quello che si
        // apre insieme a Oggi e Inbox, non un archivio da consultare.
        { href: '/diario', nome: 'Diario', icona: iconaCalendario },
      ],
    },
    {
      titolo: 'Ordini',
      voci: [
        // ⚠️ PRIMO del gruppo, prima ancora di «Nuovo ordine»: un preventivo e
        // il momento in cui un ordine puo nascere o non nascere. Se sta in
        // fondo lo si guarda quando ci si ricorda, e un prezzo chiesto e mai
        // mandato non fa rumore — il cliente compra altrove, e basta.
        { href: '/preventivi', nome: 'Preventivi', icona: iconaPreventivo },
        // Subito dopo: e' quello che CREA un ordine senza passare da un
        // preventivo, quando il prezzo e' gia' stato concordato a voce.
        { href: '/nuovo-ordine', nome: 'Nuovo ordine', icona: iconaArchivio },
        { href: '/ordini-globali', nome: 'Ordini globali', icona: iconaArchivio },
        { href: '/clienti', nome: 'Clienti', icona: iconaClienti },
        { href: '/pagamenti', nome: 'Pagamenti', icona: iconaPagamenti },
        // Subito sotto Pagamenti perche' e' la sua conseguenza: legge i
        // pagamenti gia' fatti e li porta sugli ordini.
        { href: '/riconciliazione', nome: 'Riconciliazione', icona: iconaRiconcilia },
        { href: '/partner', nome: 'Partner', icona: iconaPartner },
      ],
    },
    {
      titolo: 'Reclami',
      voci: [
        { href: '/reclami', nome: 'Reclami', icona: iconaReclamo },
        { href: '/rimborsi', nome: 'Rimborsi', icona: iconaRimborso },
        // I chargeback stanno coi rimborsi perché sono la stessa domanda vista
        // dall'altra parte: qui i soldi tornano indietro per decisione di una
        // banca, e c'è una scadenza per dire la nostra.
        { href: '/chargeback', nome: 'Chargeback', icona: iconaRimborso },
      ],
    },
    {
      titolo: 'Qualità',
      voci: [
        // Primo del gruppo: le altre voci misurano chi consegna (valet,
        // partner), questa misura NOI. È la sola che parli delle persone che
        // usano l'app, e la vede solo un amministratore — come i Turni.
        ...(amministratore
          ? [{ href: '/operatori', nome: 'Operatori', icona: iconaUtenti }]
          : []),
        // ⚠️ Sta in Qualità e non fra gli ordini: qui non si LAVORA niente, si
        // legge come è andata. Chiesta dall'utente il 02/09/2026.
        { href: '/statistiche', nome: 'Statistiche', icona: iconaPunteggi },
        { href: '/reclami/punteggi', nome: 'Punteggi', icona: iconaPunteggi },
        { href: '/reclami/feedback', nome: 'Feedback e orari', icona: iconaFeedback },
        { href: '/reclami/giudizi', nome: 'Giudizi', icona: iconaGiudizi },
        { href: '/reclami/valet', nome: 'Valet', icona: iconaValet },
      ],
    },
    {
      titolo: 'Messaggi',
      voci: [
        // Primo del gruppo: e' quello che si legge PRIMA di scrivere. Le
        // risposte pronte sono il testo, il glossario e' quello che devi
        // sapere per scegliere il testo giusto.
        { href: '/glossario', nome: 'Glossario', icona: iconaScript },
        { href: '/script', nome: 'Risposte pronte', icona: iconaScript },
        { href: '/cs-ai', nome: 'CS AI', icona: iconaCsAi },
      ],
    },
    {
      titolo: 'Configurazione',
      voci: [
        // ⚠️ «Casistiche» stava in «Reclami», in mezzo alle cose da fare. Ma non
        // è lavoro: è il CATALOGO dei tipi di reclamo con le azioni da eseguire,
        // e lo si tocca quando se ne aggiunge uno — cioè quasi mai. In mezzo al
        // lavoro quotidiano una voce che non si apre mai non è neutra: sposta
        // più in basso quelle che si aprono ogni giorno, e insegna a scorrere il
        // gruppo invece di leggerlo.
        { href: '/reclami/casistiche', nome: 'Casistiche', icona: iconaCasistiche },
        // ── LA CONFIGURAZIONE È DELL'AMMINISTRATORE ──
        //
        // ⚠️⚠️ Fino al 27/08/2026 queste sette voci erano nel menu di TUTTI, e
        // le pagine non chiedevano il ruolo: un operatore apriva Impostazioni e
        // riscriveva gli indirizzi delle app sorelle, le caselle di posta e i
        // token di Meta. Il cancello vero adesso sta nelle pagine e nelle
        // azioni (`soloAmministratore`, src/lib/sessione.ts) — questo qui è
        // solo la coerenza: mostrare una voce che poi rimanda indietro è un
        // invito a sbattere contro una porta.
        //
        // ⚠️ `/utenti` il cancello ce l'aveva già da sempre: era l'unica delle
        // sette, ed è quella che ha insegnato la regola alle altre sei.
        ...(amministratore
          ? [
              { href: '/utenti', nome: 'Utenti', icona: iconaUtenti },
              { href: '/negozi', nome: 'Negozi', icona: iconaNegozi },
              { href: '/numeri-whatsapp', nome: 'Numeri WhatsApp', icona: iconaChat },
              { href: '/account-meta', nome: 'Facebook e Instagram', icona: iconaChat },
              { href: '/aspetto-widget', nome: 'Widget dei siti', icona: iconaChat },
              { href: '/caselle', nome: 'Caselle', icona: iconaBusta },
              { href: '/impostazioni', nome: 'Impostazioni', icona: iconaImpostazioni },
            ]
          : []),
      ],
    },
  ]

  const { accesi, carichi } = usaPallini(path)

  // La voce attiva è quella il cui href è il prefisso PIÙ LUNGO del percorso:
  // così su /reclami/casistiche si accende "Casistiche", non "Reclami".
  const tutteLeVoci = gruppi.flatMap((g) => g.voci)
  const combacia = (href: string) =>
    href === '/' ? path === '/' : path === href || path.startsWith(href + '/')
  const hrefAttivo = tutteLeVoci
    .filter((v) => combacia(v.href))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href

  return (
    // L'id serve al bottone del menu (aria-controls): chi usa un lettore di
    // schermo deve poter sapere che cosa apre quel tasto.
    <nav className="sidebar" id="menu-laterale">
      {gruppi.map((g) => (
        <div className="sb-sezione" key={g.titolo}>
          <div className="sb-label">{g.titolo}</div>
          {g.voci.map((v) => {
            const attiva = v.href === hrefAttivo
            return (
              <Link key={v.href} href={v.href} className={`sb-item${attiva ? ' attiva' : ''}`}>
                <span className="sb-icona">{v.icona}</span>
                <span className="sb-nome">{v.nome}</span>
                {/* ⚠️ Il pallino sta in FONDO alla riga, non davanti al nome: le
                    voci sono ventotto e devono restare allineate: un segno che
                    entra ed esce a sinistra le farebbe ballare tutte. */}
                {/* ⚠️⚠️ IL NUMERO E IL PALLINO DICONO COSE DIVERSE, e per questo
                    ci sono tutti e due: il numero è **quanto lavoro c'è**, il
                    pallino è **è arrivato qualcosa da quando hai guardato**. Una
                    sezione può avere venti cose ferme da ieri (numero, niente
                    pallino) o una novità che un collega ha già preso (pallino,
                    niente numero): con un segnale solo, uno dei due casi
                    sparisce. */}
                {carichi[v.href]?.quanti ? (
                  <span
                    className={`sb-quanti${carichi[v.href]?.urgente ? ' urgente' : ''}`}
                    title={
                      carichi[v.href]?.urgente
                        ? `${carichi[v.href]?.quanti} da fare, e qualcuna scade entro una settimana`
                        : `${carichi[v.href]?.quanti} da fare`
                    }
                  >
                    {carichi[v.href]!.quanti}
                  </span>
                ) : null}
                {accesi.has(v.href) ? (
                  <span
                    className="sb-pallino"
                    title="È arrivato qualcosa di nuovo da quando l'hai guardata"
                    aria-label="novità"
                  />
                ) : null}
              </Link>
            )
          })}
        </div>
      ))}
      {utente ? <div className="sb-utente">Accesso: {utente}</div> : null}
    </nav>
  )
}

const T = {
  width: 17,
  height: 17,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
}

const iconaArchivio = (
  <svg {...T}>
    <rect x="3" y="4" width="18" height="5" rx="1.5" />
    <path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9" />
    <path d="M10 13h4" />
  </svg>
);
// «Oggi»: un sole basso. La schermata iniziale è il turno che comincia.
const iconaOggi = (
  <svg {...T}>
    <circle cx="12" cy="12" r="4" />
    <line x1="12" y1="3" x2="12" y2="5" />
    <line x1="12" y1="19" x2="12" y2="21" />
    <line x1="3" y1="12" x2="5" y2="12" />
    <line x1="19" y1="12" x2="21" y2="12" />
    <line x1="5.6" y1="5.6" x2="7" y2="7" />
    <line x1="17" y1="17" x2="18.4" y2="18.4" />
    <line x1="5.6" y1="18.4" x2="7" y2="17" />
    <line x1="17" y1="7" x2="18.4" y2="5.6" />
  </svg>
)

const iconaLista = (
  <svg {...T}>
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <circle cx="3.5" cy="6" r="1" />
    <circle cx="3.5" cy="12" r="1" />
    <circle cx="3.5" cy="18" r="1" />
  </svg>
)
const iconaCalendario = (
  <svg {...T}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <line x1="3" y1="10" x2="21" y2="10" />
    <line x1="8" y1="3" x2="8" y2="7" />
    <line x1="16" y1="3" x2="16" y2="7" />
  </svg>
)
const iconaPagamenti = (
  <svg {...T} strokeLinejoin="round">
    <rect x="2.5" y="6" width="19" height="12" rx="2" />
    <path d="M2.5 10h19" />
    <path d="M6 14.5h3" />
  </svg>
)
// Due frecce che si incontrano: due cose che si rimettono insieme.
const iconaRiconcilia = (
  <svg {...T} strokeLinejoin="round">
    <path d="M3 8h13l-3-3" />
    <path d="M21 16H8l3 3" />
  </svg>
)
const iconaClienti = (
  <svg {...T} strokeLinejoin="round">
    <path d="M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20" />
    <circle cx="9.5" cy="7.5" r="3.5" />
    <path d="M21 20v-1.5a4 4 0 0 0-3-3.87" />
    <path d="M16.5 4.13a4 4 0 0 1 0 7.75" />
  </svg>
)
const iconaPartner = (
  <svg {...T} strokeLinejoin="round">
    <path d="M3 20V9l6-4 6 4v11" />
    <path d="M15 20V12h6v8" />
    <path d="M7 13h4M7 16.5h4M18 15.5v1" />
  </svg>
)
const iconaChat = (
  <svg {...T} strokeLinejoin="round">
    <path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.3 8.9 8.9 0 0 1-3.2-.6L3 21l1.8-5.2a8 8 0 0 1-.8-3.5A8.4 8.4 0 0 1 12.5 4 8.4 8.4 0 0 1 21 11.5z" />
  </svg>
)
const iconaPreventivo = (
  // Un foglio con un prezzo: la richiesta prima che diventi ordine.
  <svg {...T} strokeLinejoin="round">
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
    <path d="M9 13h6" />
    <path d="M9 17h3" />
  </svg>
)
const iconaChiamate = (
  // Una cornetta: il canale che non lascia traccia da solo.
  <svg {...T} strokeLinejoin="round">
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />
  </svg>
)
const iconaCsAi = (
  // Una scintilla dentro un fumetto: l'AI che parla ai clienti.
  <svg {...T} strokeLinejoin="round">
    <path d="M20.5 11.5a7.9 7.9 0 0 1-8 7.8 8.4 8.4 0 0 1-3-.6L3.5 20.5l1.7-4.9a7.6 7.6 0 0 1-.7-3.3 7.9 7.9 0 0 1 8-7.8" />
    <path d="M17.5 2.5l.9 2 2 .9-2 .9-.9 2-.9-2-2-.9 2-.9z" />
  </svg>
)
const iconaScript = (
  <svg {...T} strokeLinejoin="round">
    <path d="M5 3.5h10l4 4v13H5z" />
    <path d="M15 3.5v4h4" />
    <path d="M8.5 12h7M8.5 16h4.5" />
  </svg>
)
const iconaUtenti = (
  // Due persone: gli account di chi entra nell'app.
  <svg {...T} strokeLinejoin="round">
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 20v-1a5.5 5.5 0 0 1 11 0v1" />
    <path d="M16.5 5.2a3.2 3.2 0 0 1 0 6.1" />
    <path d="M17.5 14.2A5.5 5.5 0 0 1 20.5 19v1" />
  </svg>
)
const iconaNegozi = (
  <svg {...T} strokeLinejoin="round">
    <path d="M4 9h16l-1 11H5z" />
    <path d="M8 9V6.5a4 4 0 0 1 8 0V9" />
  </svg>
)
const iconaBusta = (
  <svg {...T} strokeLinejoin="round">
    <rect x="3" y="5.5" width="18" height="13" rx="2" />
    <path d="m3.5 7 8.5 6 8.5-6" />
  </svg>
)
const iconaReclamo = (
  <svg {...T} strokeLinejoin="round">
    <path d="M10.3 3.9 2.6 17.5A1.7 1.7 0 0 0 4 20h16a1.7 1.7 0 0 0 1.4-2.5L13.7 3.9a1.7 1.7 0 0 0-3 0z" />
    <line x1="12" y1="9" x2="12" y2="13.5" />
    <circle cx="12" cy="16.7" r="0.6" fill="currentColor" />
  </svg>
)
const iconaCasistiche = (
  <svg {...T} strokeLinejoin="round">
    <path d="M4 6h4v4H4zM4 14h4v4H4z" />
    <line x1="11" y1="8" x2="20" y2="8" />
    <line x1="11" y1="16" x2="20" y2="16" />
  </svg>
)
const iconaRimborso = (
  // Banconota che torna indietro: soldi che rientrano al cliente.
  <svg {...T} strokeLinejoin="round">
    <rect x="2.5" y="7" width="19" height="11" rx="2" />
    <circle cx="12" cy="12.5" r="2.4" />
    <path d="M9 3.5 6.2 6.3 9 9.1" />
  </svg>
)
const iconaPunteggi = (
  <svg {...T} strokeLinejoin="round">
    <line x1="4" y1="20" x2="20" y2="20" />
    <rect x="5.5" y="12" width="3.5" height="6" />
    <rect x="10.5" y="8" width="3.5" height="10" />
    <rect x="15.5" y="4.5" width="3.5" height="13.5" />
  </svg>
)
const iconaFeedback = (
  <svg {...T} strokeLinejoin="round">
    <path d="M20 13.5a7.6 7.6 0 0 1-7.7 7.5 8 8 0 0 1-2.9-.5L4 22l1.6-4.7A7.3 7.3 0 0 1 4.9 14a7.6 7.6 0 0 1 7.6-7.5" />
    <path d="M17 2.5l1.3 2.7 3 .45-2.15 2.1.5 3L17 9.4l-2.65 1.35.5-3L12.7 5.65l3-.45z" />
  </svg>
)
const iconaGiudizi = (
  <svg {...T} strokeLinejoin="round">
    <path d="M12 3.5l2.6 5.3 5.9.86-4.25 4.14 1 5.86L12 17l-5.25 2.76 1-5.86L3.5 9.66l5.9-.86z" />
  </svg>
)
const iconaValet = (
  <svg {...T} strokeLinejoin="round">
    <circle cx="12" cy="6" r="2.6" />
    <path d="M6 20v-1a6 6 0 0 1 12 0v1" />
  </svg>
)
const iconaImpostazioni = (
  <svg {...T}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
)


// ── IL PALLINO GIALLO: «qui è arrivato qualcosa» ──
//
// ⚠️⚠️ Chiesto dall'utente il 27/08/2026: «metti un pallino giallo se arriva
// qualcosa di nuovo: esempio in Inbox un messaggio nuovo o in ordini aperti un
// nuovo ordine». È il fratello lento dei riquadri in basso a destra: quelli
// dicono cosa è appena successo e spariscono dopo nove secondi, questo **resta
// finché non sei andato a guardare**. Un richiamo e un segnalibro.
//
// ⚠️⚠️ NON SI CONFRONTANO OROLOGI. Il server dice, per ogni sezione, la data
// della cosa più recente **che c'è**; qui ci si ricorda **l'ultima già vista** e
// si accende il pallino se le due sono diverse. Se invece si segnasse «visto» con
// `Date.now()` del browser, un computer avanti di un minuto avrebbe il pallino
// sempre acceso e uno indietro non l'avrebbe mai.
//
// ⚠️ «Visto» è una cosa del browser di quella persona, e sta in `localStorage`:
// tenerlo sul server vorrebbe dire una tabella in più per un pallino, e
// «l'ho guardato io» non è un fatto dell'azienda.
const CHIAVE_VISTO = 'messaggi-sezioni-viste'
// ⚠️ Novanta secondi e non sessanta: questa chiamata fa DICIANNOVE query (nove
// date più nove conteggi più le contestazioni in scadenza) e gira su ogni
// pagina, per ogni persona. Misurata: 1,2 s. L'immediatezza ce l'hanno già i
// riquadri in basso a destra, che chiedono ogni 25 secondi una cosa molto più
// leggera; qui basta essere aggiornati, non istantanei.
const RESPIRO = 90000

type Carico = { ultimo: string; quanti: number; urgente: boolean }

function usaPallini(path: string): { accesi: Set<string>; carichi: Record<string, Carico> } {
  const [accesi, setAccesi] = useState<Set<string>>(new Set())
  const [carichi, setCarichi] = useState<Record<string, Carico>>({})

  const guarda = useCallback(async () => {
    try {
      const res = await fetch('/api/novita/sezioni', { cache: 'no-store' })
      // ⚠️ Sessione scaduta: la rotta non risponde 401 ma un 307 verso /login
      // che `fetch` segue da solo, tornando HTML con stato 200. Si guardano il
      // redirect e il tipo di contenuto, o si continuerebbe a bussare.
      const ct = res.headers.get('content-type') ?? ''
      if (!res.ok || res.redirected || !ct.includes('application/json')) {
        // ⚠️⚠️ QUESTO È IL PUNTO CHE SE NE ACCORGE SEMPRE: la barra laterale c'è
        // su ogni pagina e chiede i carichi a intervalli, quindi qualunque
        // schermata si stia guardando la fascia compare entro un giro — anche
        // se la schermata in questione i suoi errori se li mangia.
        avvisaSessioneScaduta()
        return
      }
      const d = (await res.json()) as { sezioni: Record<string, Carico> }
      setCarichi(d.sezioni)
      // ⚠️ Il segnalibro sta nel browser di quella persona: «l'ho guardato io»
      // non è un fatto dell'azienda, e tenerlo sul server vorrebbe dire una
      // tabella in più per un pallino.
      let visto: Visto = {}
      let mai = false
      try {
        const grezzo = localStorage.getItem(CHIAVE_VISTO)
        if (grezzo) visto = JSON.parse(grezzo) as Visto
        else mai = true
      } catch {
        // finestra privata o dati bloccati: si fa come la prima volta, cioè
        // niente pallini. Meglio muti che tutti accesi.
        mai = true
      }
      // La regola sta in `src/lib/pallini.ts`, che si prova con dei casi.
      const esito = decidiPallini(d.sezioni, visto, path, mai)
      try {
        localStorage.setItem(CHIAVE_VISTO, JSON.stringify(esito.visto))
      } catch {
        // niente da ricordare: i pallini valgono per questa pagina e basta
      }
      setAccesi(new Set(esito.accesi))
    } catch {
      // rete assente: i pallini restano come stanno
    }
  }, [path])

  useEffect(() => {
    // ⚠️ Si guarda a ogni cambio di pagina, non solo a tempo: entrando in una
    // sezione il suo pallino deve spegnersi subito, non dopo un minuto.
    void guarda()
    const t = setInterval(() => {
      // Scheda nascosta: non si chiede niente. Al ritorno si chiede subito.
      if (!document.hidden) void guarda()
    }, RESPIRO)
    const alRitorno = () => {
      if (!document.hidden) void guarda()
    }
    document.addEventListener('visibilitychange', alRitorno)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', alRitorno)
    }
  }, [guarda])

  return { accesi, carichi }
}
