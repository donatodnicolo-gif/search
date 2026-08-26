import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { dataBreve, dataLunga, FUSO } from '@/lib/format'
import { statoRisposta } from '@/lib/statoRisposta'
import { NotaAttivita } from '@/components/NotaAttivita'
import { CheckAttivita } from '@/components/CheckAttivita'
import { anteprimaPulita, oggettoLeggibile } from '@/lib/citato'
import { ConversazioneStack } from '@/components/ConversazioneStack'
import { BozzaEditor } from '@/components/BozzaEditor'
import { AzioniMessaggio } from '@/components/AzioniMessaggio'
import { NavigaMessaggi } from '@/components/NavigaMessaggi'
import { SegnaLettaAllApertura } from '@/components/SegnaLettaAllApertura'
import { ChiediConversazione } from '@/components/ChiediConversazione'
import { PropostaSpam } from '@/components/PropostaSpam'
import { casoMarchio } from '@/lib/spam'
import { mailVicine } from '@/lib/vicine'
import { PrioritaButtons } from '@/components/PrioritaButtons'
import { Rianalizza } from '@/components/Rianalizza'
import { CorpoMessaggio } from '@/components/CorpoMessaggio'
import { RiassuntoConversazione } from '@/components/RiassuntoConversazione'
import { BottoneContattoAI } from '@/components/BottoneContattoAI'
import { BottoneNonSpam } from '@/components/BottoneNonSpam'
import { AgganciaMail } from '@/components/AgganciaMail'
import { sanitizzaHtml } from '@/lib/sanitizzaHtml'
import { richiediUtente } from '@/lib/sessione'
import { messaggiThread, membriThread, righeThread, leggiRiassuntoThread } from '@/lib/sync'
import { TraduzioneAllApertura } from '@/components/TraduzioneAllApertura'
import { AllegatiMessaggio } from '@/components/AllegatiMessaggio'
import { AllegatiInTesta } from '@/components/AllegatiInTesta'
import { IndirizziCliccabili } from '@/components/IndirizziCliccabili'
import { chiaveThread } from '@/lib/thread'
import { nomeDiThread } from '@/lib/nomiThread'
import { NomeThreadBottone, NomeThreadDialog } from '@/components/NomeThreadRiga'
import { AgganciaBottone, AgganciaDialog } from '@/components/AgganciaRiga'
import { ThreadAIToggle } from '@/components/ThreadAIToggle'
import { CestinaThread } from '@/components/CestinaThread'
import { InvitoCalendario } from '@/components/InvitoCalendario'
import { DiagnosiInvito } from '@/components/DiagnosiInvito'
import { CercaAppuntamento } from '@/components/CercaAppuntamento'
import { threadHaAI } from '@/lib/threadAI'
import { threadEChiuso } from '@/lib/threadChiusi'
import { ChiudiThread } from '@/components/ChiudiThread'
import { eContattoAI } from '@/lib/contattiAI'
import { azioneDi, descriviAzioni } from '@/lib/appDeluxy'
import { DatiInviati } from '@/components/DatiInviati'
import { leggiChiaviApp } from '@/lib/chiaviApp'
import { AppSuMessaggio } from '@/components/AppSuMessaggio'
import { BottoneApp } from '@/components/BottoneApp'
import { leggiEventoProposto } from '@/lib/eventoProposto'
import { PropostaEvento } from '@/components/PropostaEvento'
import { EliminaEvento } from '@/components/EliminaEvento'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // le azioni AI (analisi, riassunto thread) girano qui

type Props = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ ampia?: string; diagnosi?: string }>
}

export default async function DettaglioMessaggio({ params, searchParams }: Props) {
  const { id } = await params
  const { ampia: ampiaGrezzo, diagnosi } = await searchParams
  const ampia = ampiaGrezzo === '1'
  // ?diagnosi=1 → mostra com'è fatta la mail secondo il server (parti MIME).
  const conDiagnosi = diagnosi === '1'
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
    /** I dati effettivamente mandati all'app, in JSON: è il log di cosa è
     *  uscito di casa (quale azienda, quale email). */
    dati: string
    link: string | null
    creatoIl: Date
  }
  const [sezioni, conversazione, conversazioneStretta, contattoAI, inviiApp, chiaviApp, vicine, rispostaData] = await Promise.all([
    db.sezione.findMany({ where: { utenteId: u.id }, orderBy: { ordine: 'asc' } }),
    // La conversazione a cui appartiene questo messaggio, in forma LEGGERA:
    // la pila mostra mittente, anteprima e data, e il corpo di un messaggio se
    // lo chiede quando lo apri. Con `messaggiThread` si trasportavano testo,
    // HTML e traduzione di OGNI mail del thread — per non mostrarli.
    // ⚠️ La vista «ampia» (con le correlate) resta su `messaggiThread`: lì il
    // raggruppamento guarda anche i partecipanti.
    ampia ? messaggiThread(u.id, messaggio.id, true) : righeThread(u.id, messaggio.id),
    // Solo in vista "ampia" serve anche il thread stretto (per contare le correlate).
    ampia ? membriThread(u.id, messaggio.id) : Promise.resolve(null),
    messaggio.direzione === 'entrata' ? eContattoAI(u.id, contattoEmail) : Promise.resolve(false),
    // Le risposte delle APP DELUXY richiamate da questa mail (tabella opzionale).
    db.invioApp
      .findMany({
        where: { utenteId: u.id, messaggioId: messaggio.id },
        orderBy: { creatoIl: 'desc' },
        select: { id: true, azioneId: true, esito: true, esitoTesto: true, dati: true, link: true, creatoIl: true },
      })
      .catch(() => [] as InvioAppRiga[]),
    // Quali APP DELUXY sono collegate: decide cosa si può richiamare da qui.
    // (In cache 5 minuti: non è una fetch a ogni apertura di mail.)
    leggiChiaviApp(),
    // Le mail confinanti, per «Precedente / Successiva»: due findFirst con
    // indice, dentro l'ondata parallela — non aggiungono un'attesa in fila.
    mailVicine(u.id, messaggio),
    // ⚠️ Dentro l ondata, non dopo: due findFirst in coda alla pagina
    //    aggiungerebbero un giro di rete a ogni apertura di mail.
    statoRisposta(u.id, messaggio),
  ])

  const azioniApp = descriviAzioni(chiaviApp)

  // Traduzione: si usa quella già salvata. Se manca (mail in arrivo mai
  // controllata) e la traduzione automatica è attiva, si calcola dopo il render.
  const lingua = messaggio.lingua
  const corpoTradotto = messaggio.corpoTradotto
  const traduciDopo = lingua === null && messaggio.direzione === 'entrata' && u.traduzioneAuto

  // Quante correlate in più rispetto al thread stretto (per l'etichetta).
  const strette = ampia ? (conversazioneStretta?.length ?? conversazione.length) : conversazione.length
  // La chiave si calcola anche per una mail sola: nome, PLUS AI e «chiusa» ora
  // si possono dare pure a lei (vedi la scheda «Conversazione» più sotto).
  const chiaveConv = conversazione.length > 0 ? chiaveThread(conversazione) : null

  let riassuntoThread: Awaited<ReturnType<typeof leggiRiassuntoThread>> = null
  let nomeConv = ''
  let threadAI = false
  let threadChiuso = false
  if (chiaveConv) {
    // Le istruzioni AI del thread non si leggono più qui: il form è stato
    // tolto (si usa «Delega Renè») e chi le applica le rilegge da sé.
    const [rt, nt, tai, tch] = await Promise.all([
      // Il riassunto ha senso solo se c'è davvero uno scambio da riassumere.
      conversazione.length > 1 ? leggiRiassuntoThread(u.id, chiaveConv) : Promise.resolve(null),
      // Il nome può essere finito su un'altra mail della conversazione (le
      // chiavi cambiano agganciando mail vecchie): si cerca su tutte.
      nomeDiThread(u.id, chiaveConv, conversazione.map((m) => m.id)),
      // PLUS AI sulla conversazione (segnato su tutte le sue mail).
      threadHaAI(u.id, conversazione.map((m) => m.id)),
      // Conversazione chiusa (stessa logica: segno su tutte le sue mail).
      threadEChiuso(u.id, conversazione.map((m) => m.id)),
    ])
    riassuntoThread = rt
    nomeConv = nt ?? ''
    threadAI = tai
    threadChiuso = tch
  }

  // Qui si mostra solo la proposta dell'AI: le bozze che hai iniziato tu si
  // riprendono dalla schermata di scrittura, dove le stavi scrivendo.
  const bozzaAI = messaggio.bozze.find((b) => b.origine === 'ai' && !b.inviata)

  // L'appuntamento che l'AI ha riconosciuto in questa mail, da accettare.
  const eventoProposto = leggiEventoProposto(messaggio.eventoProposto)
  // Gli appuntamenti nati da questa mail: da quando l AI li mette in agenda
  // da sola, la mail DEVE dirlo. Una scrittura che non si vede e una
  // scrittura di cui non ci si fida.
  const eventiInAgenda = await db.evento
    .findMany({ where: { messaggioId: messaggio.id, utenteId: u.id }, orderBy: { inizio: 'asc' } })
    .catch(() => [])

  // «Questa sembra falsa»: il controllo è segnato all'arrivo (`spamCaso`), ma
  // si rifà anche QUI, al volo, per le mail arrivate PRIMA che la regola
  // esistesse — altrimenti varrebbe solo per il futuro e proprio quella che hai
  // sotto gli occhi resterebbe senza avviso. È una funzione pura, non costa una
  // query. Non si mostra su ciò che è già in SPAM o nel cestino: lì la domanda
  // ha già una risposta.
  const propostaSpam =
    messaggio.direzione === 'entrata' && !messaggio.cestinato && messaggio.sezione?.nome !== 'SPAM'
      ? (messaggio.spamCaso
          ? messaggio.spamMotivo || 'il mittente non è chi dice di essere'
          : casoMarchio(messaggio.mittente, messaggio.mittenteNome)?.descrizione) ?? null
      : null

  return (
    <>
      <div className="page-head testa-mail">
        <div className="naviga-testa">
          <Link href="/" className="btn secondary small">
            ← Posta in arrivo
          </Link>
          {/* Scorrere la posta senza tornare in elenco a ogni mail. */}
          <NavigaMessaggi precedente={vicine.precedente} successivo={vicine.successivo} />
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

      {/* Chi si finge un marchio noto: la proposta sta PRIMA della mail, non
          in fondo — è l'unica cosa che va letta prima del contenuto, perché il
          contenuto è esattamente ciò che vuole ingannarti. */}
      {propostaSpam && <PropostaSpam messaggioId={messaggio.id} motivo={propostaSpam} />}

      {/* CONVERSAZIONE IN UNA RIGA. Prima qui c'erano due schede piene di
          spiegazioni e la mail partiva sotto la piega: per LEGGERLA bisognava
          scorrere. Le stesse azioni — nessuna tolta — stanno ora in una riga
          sottile (i moduli si aprono a richiesta nei dialoghi di pagina), e il
          dettaglio della conversazione (riassunto, elenco messaggi, stacca) è
          SOTTO la mail: prima si legge, poi si guarda il contesto. */}
      <div className="card tight" style={{ padding: '6px 12px', marginBottom: 10 }}>
        <div className="riga-azioni" style={{ marginTop: 0 }}>
          <span className="muted" style={{ fontSize: 12.5 }}>
            {conversazione.length > 1
              ? `Conversazione · ${conversazione.length} messaggi`
              : 'Mail singola'}
          </span>
          {nomeConv && (
            <span className="badge gold">
              <span className="dot" />
              {nomeConv}
            </span>
          )}
          <NomeThreadBottone id={messaggio.id} nome={nomeConv || null} />
          <ThreadAIToggle messaggioId={messaggio.id} attivo={threadAI} variante="riga" />
          <ChiudiThread messaggioId={messaggio.id} chiuso={threadChiuso} variante="riga" />
          <AgganciaBottone id={messaggio.id} />
          {conversazione.length > 1 ? (
            <a href="#conversazione" className="azione-riga" title="Riassunto ed elenco dei messaggi, sotto la mail">
              Messaggi ↓
            </a>
          ) : (
            <Link
              href={`/messaggio/${id}?ampia=1`}
              className="azione-riga"
              title="Le altre mail scambiate con le stesse persone"
            >
              Correlate
            </Link>
          )}
          <CestinaThread messaggioId={messaggio.id} quante={conversazione.length} />
        </div>
      </div>


      {/* ⚠️ TESTATA COMPATTA. Prima erano cinque blocchi impilati (oggetto,
          mittente, destinatario+data, AI del contatto, etichette, priorità) e
          il corpo della mail partiva sotto la piega: per LEGGERE bisognava
          scorrere. Nessuna azione è stata tolta — si è stretta la cornice:
          etichette corte, una riga sola per i recapiti, e tutto il resto in
          una striscia che va a capo da sé. */}
      <div className="card">
        <div className="mail-head compatta">
          {/* «Re: R: R: R: R: R: R: R: Richiesta catering» → «Re: Richiesta
              catering»: la scala di prefissi si accorcia SOLO a schermo,
              l'oggetto vero resta nel title (e ovunque nei dati). */}
          <h1 className="mail-subject" title={messaggio.oggetto}>
            {oggettoLeggibile(messaggio.oggetto)}
          </h1>
          <div className="mail-meta una-riga" title={`da ${messaggio.mittente} · a ${messaggio.destinatari}`}>
            <Link
              href={`/rubrica/${encodeURIComponent(messaggio.mittente)}`}
              style={{ textDecoration: 'underline' }}
              title="Vedi tutti i messaggi di questo contatto"
            >
              <strong>{messaggio.mittenteNome || messaggio.mittente}</strong>{' '}
              &lt;{messaggio.mittente}&gt;
            </Link>
            {' · a '}
            {/* Anche i destinatari portano alla loro scheda: su una mail
                INVIATA la controparte è qui, non nel mittente. */}
            <IndirizziCliccabili testo={messaggio.destinatari} />
            {' · '}
            {dataLunga(messaggio.data)}
          </div>

          <div className="mail-strip">
            {messaggio.direzione === 'entrata' && (
              <BottoneContattoAI email={contattoEmail} attivo={contattoAI} />
            )}
            {messaggio.direzione === 'entrata' && contattoAI && (
              <Link
                href={`/rubrica/${encodeURIComponent(messaggio.mittente)}`}
                className="azione-riga"
                title="Il quadro della situazione con questo contatto"
              >
                Quadro AI →
              </Link>
            )}
            {messaggio.sezione && (
              <span className={`badge ${messaggio.sezione.colore}`}>
                <span className="dot" />
                {messaggio.sezione.nome}
              </span>
            )}
            {messaggio.sezione?.nome === 'SPAM' && <BottoneNonSpam id={messaggio.id} />}
            {messaggio.smistatoDa && (
              <span className="badge neutral">
                da{' '}
                {messaggio.smistatoDa === 'ai'
                  ? 'AI'
                  : messaggio.smistatoDa === 'regola'
                    ? 'regola'
                    : 'te'}
              </span>
            )}
            {/* La graffetta si APRE e mostra i file: prima diceva solo quanti
                erano, e per prenderli bisognava scorrere sotto tutta la mail. */}
            {messaggio.allegati > 0 && (
              <AllegatiInTesta messaggioId={messaggio.id} quanti={messaggio.allegati} />
            )}

            <PrioritaButtons
              id={messaggio.id}
              priorita={messaggio.priorita}
              prioritaDa={messaggio.prioritaDa}
              analizzato={messaggio.analizzatoIl !== null}
            />

            {/* Le mail che invitano A PAROLE non hanno un invito iCalendar:
                la data la si fa cercare all'AI. Sta qui, in linea, invece di
                occupare una riga sua. */}
            {!eventoProposto && messaggio.direzione === 'entrata' && (
              <CercaAppuntamento messaggioId={messaggio.id} />
            )}

            {/* ⚠️ «→ App» anche IN TESTA. La scheda «Manda a un'app Deluxy»
                c'è da sempre, ma sta in fondo alla pagina — sotto il corpo e
                sotto la conversazione — quindi su una catena di risposte non la
                si trova (segnalato il 17/08/2026: «Come richiamo una app da
                qui?»). È lo stesso rimedio della graffetta degli allegati: il
                comando dove si guarda, la scheda resta dov'era per chi la usa. */}
            <BottoneApp id={messaggio.id} />
          </div>
        </div>

        {/* Invito di calendario vero (Outlook/Google): Accetta / Forse /
            Rifiuta. Si legge dal server dopo il render, come gli allegati. */}
        {messaggio.direzione === 'entrata' && <InvitoCalendario messaggioId={messaggio.id} />}

        {/* Strumento, non funzione: si chiede con ?diagnosi=1 quando i tasti
            Accetta/Rifiuta non compaiono e serve sapere perché. */}
        {conDiagnosi && <DiagnosiInvito messaggioId={messaggio.id} />}

        {eventoProposto && <PropostaEvento messaggioId={messaggio.id} evento={eventoProposto} />}

        {/* Gia in agenda: titolo, quando, dove — e come toglierlo. */}
        {eventiInAgenda.length > 0 && (
          <div className="ai-box">
            <div className="ai-box-title">
              {eventiInAgenda.length === 1 ? 'In agenda' : `In agenda (${eventiInAgenda.length})`}
            </div>
            {eventiInAgenda.map((ev) => (
              <div key={ev.id} className="task-row" style={{ padding: '6px 0' }}>
                <div style={{ minWidth: 0 }}>
                  <div className="task-titolo">{ev.titolo}</div>
                  <div className="task-sub">
                    {ev.inizio.toLocaleString('it-IT', {
                      timeZone: FUSO,
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      ...(ev.giornataIntera ? {} : { hour: '2-digit', minute: '2-digit' }),
                    })}
                    {ev.luogo ? ` · ${ev.luogo}` : ''}
                    {ev.creatoDaAI ? ' · messo in agenda dall’AI' : ''}
                  </div>
                </div>
                <div className="task-side">
                  <Link href="/calendario" className="azione-riga">Calendario →</Link>
                  <EliminaEvento id={ev.id} />
                </div>
              </div>
            ))}
          </div>
        )}

        {messaggio.riassunto && (
          <div className="ai-box">
            <div className="ai-box-title">Cosa ha capito l’AI</div>
            <div className="ai-box-text">{messaggio.riassunto}</div>
          </div>
        )}

        {/* LE COSE DA FARE nate da questa mail, con le loro note.
            ⚠️ Fuori dal riquadro dell'AI, e non è un dettaglio: prima stavano
            DENTRO, quindi comparivano solo se l'AI aveva già letto la mail — e
            un'attività creata a mano su una mail mai analizzata era invisibile
            proprio dalla pagina della mail da cui nasce. */}
        {messaggio.attivita.length > 0 && (
          <div className="ai-box">
            <div className="ai-box-title">Da fare su questa mail ({messaggio.attivita.length})</div>
            {messaggio.attivita.map((a) => (
              <div key={a.id} className="task-row" style={{ padding: '8px 0' }}>
                <CheckAttivita id={a.id} fatta={a.fatta} riallinea />
                <div style={{ minWidth: 0 }}>
                  <div className="task-titolo">{a.titolo}</div>
                  {a.dettaglio && <div className="task-sub">{a.dettaglio}</div>}
                  {/* La nota si scrive anche da qui: è spesso leggendo la mail
                      che si scopre la cosa da annotare. */}
                  <NotaAttivita
                    id={a.id}
                    nota={a.note}
                    autore={a.noteAutore}
                    quando={a.noteIl ? a.noteIl.toISOString() : null}
                  />
                </div>
                <div className="task-side">
                  {a.scadenza && (
                    <span className="badge neutral">
                      entro {a.scadenza.toLocaleDateString('it-IT', { timeZone: FUSO, day: 'numeric', month: 'short' })}
                    </span>
                  )}
                </div>
              </div>
            ))}
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

        {/* «L'ho già risposta?» — la domanda che ci si fa aprendo una mail.
            Compare solo quando c'è qualcosa da dire: su una mail mai toccata
            non si scrive «non hai risposto», che sarebbe rumore su ogni riga. */}
        {rispostaData.dopo && (
          <div className="nota-sottile nota-risposto">
            ↩ <strong>{rispostaData.soloInoltro ? 'Hai inoltrato' : 'Hai già risposto'}</strong>
            {' · '}
            {dataLunga(rispostaData.dopo)}
          </div>
        )}
        {!rispostaData.dopo && rispostaData.prima && (
          <div className="nota-sottile">
            ↩ Hai scritto in questa conversazione, ma <strong>prima</strong> di questo messaggio:
            resta da rispondere.
          </div>
        )}

        {/* Una riga sottile, senza riquadro: questa nota compare su OGNI mail
            non analizzata, e un box con bordo e padding rubava altezza alla
            mail su tutte quante. */}
        {!messaggio.riassunto && !messaggio.erroreAI && (
          <div className="nota-sottile">
            L’AI non ha ancora letto questa mail: dalle una priorità qui sopra e te la riassume.
          </div>
        )}

        <CorpoMessaggio
          html={messaggio.corpoHtml ? sanitizzaHtml(messaggio.corpoHtml) : null}
          testo={messaggio.corpoTesto}
          tradotto={corpoTradotto}
          lingua={lingua}
          // HTML non in casa ma mail ancora sul server: l'impaginato si
          // riprende da lì dopo il render (le mail vecchie vengono alleggerite
          // per tenere il database piccolo — vedi lib/htmlServer.ts).
          htmlDalServerDi={!messaggio.corpoHtml && messaggio.uid > 0 ? messaggio.id : undefined}
        />
        {traduciDopo && <TraduzioneAllApertura messaggioId={messaggio.id} />}
        {messaggio.allegati > 0 && (
          <AllegatiMessaggio messaggioId={messaggio.id} quanti={messaggio.allegati} />
        )}

        {/* Una DOMANDA su questo scambio, con la risposta qui e la mail da cui
            viene. Sta in fondo alla mail, dove uno arriva dopo averla letta e
            si accorge che gli manca un dato. Non è «Delega Renè»: quella
            prepara sempre una mail da mandare, non una risposta per te. */}
        <div style={{ marginTop: 14 }}>
          <ChiediConversazione messaggioId={messaggio.id} quante={conversazione.length} />
        </div>
      </div>

      {/* IL DETTAGLIO DELLA CONVERSAZIONE sta DOPO la mail: prima si legge,
          poi si guarda il contesto (riassunto, elenco, stacca). Le azioni
          rapide sono nella riga sottile in cima; da lì «Messaggi ↓» porta qui. */}
      {conversazione.length > 1 && (
        <div className="card" id="conversazione">
          <div
            className="mail-subject"
            style={{ fontSize: 17, marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}
          >
            <span>
              {ampia ? 'Conversazione completa' : 'Conversazione'} · {conversazione.length} messaggi
              {ampia && conversazione.length > strette && (
                <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>
                  {' '}({conversazione.length - strette} correlate)
                </span>
              )}
            </span>
            {/* Questo thread ⇄ Con le correlate (stesse persone). */}
            <span className="vista-tabs" style={{ margin: 0 }}>
              <Link href={`/messaggio/${id}#conversazione`} className={`vista-tab ${!ampia ? 'attivo' : ''}`}>
                Questo thread
              </Link>
              <Link href={`/messaggio/${id}?ampia=1#conversazione`} className={`vista-tab ${ampia ? 'attivo' : ''}`}>
                Con le correlate
              </Link>
            </span>
          </div>

          <div style={{ margin: '10px 0 14px' }}>
            <AgganciaMail
              messaggioId={messaggio.id}
              agganciata={Boolean(messaggio.threadManuale)}
              staccabile={conversazione.length > 1}
            />
          </div>

          <RiassuntoConversazione
            messaggioId={messaggio.id}
            // Il catalogo delle azioni app: serve a dare nome, colore e stato
            // di collegamento alle azioni che il riassunto propone.
            azioniApp={azioniApp}
            // Quanti messaggi ha ORA: serve a dire in chiaro quando il
            // riassunto è vecchio (fatto su 10, adesso sono 17).
            messaggiOra={conversazione.length}
            // Riassunto VECCHIO = generato quando la conversazione aveva meno
            // messaggi di adesso (o mai generato). Se il thread è AI+ e il
            // riassunto è vecchio, il componente lo rigenera da solo — SOLO per
            // QUESTA conversazione (non il conteggio globale della casella, che
            // confondeva: "ne restano 189" mentre il thread ne ha 65).
            autoAggiorna={
              threadAI &&
              (!riassuntoThread || riassuntoThread.messaggiVisti < conversazione.length)
            }
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

          <p style={{ fontSize: 12.5, color: 'var(--text-tertiary)', margin: '14px 0 6px' }}>
            Ogni messaggio si apre QUI sotto, senza cambiare pagina. Una mail non
            c’entra? «Stacca» la toglie dalla conversazione (anche quando è unita
            dalla catena di risposte).
          </p>
          {/* La conversazione si LEGGE, non si naviga: prima era un elenco di
              link e per il quinto messaggio si cambiava pagina perdendo il
              segno. Vedi components/ConversazioneStack.tsx. */}
          <ConversazioneStack
            correnteId={messaggio.id}
            oggetto={messaggio.oggetto}
            righe={conversazione.map((c) => ({
              id: c.id,
              mittente: c.mittente,
              mittenteNome: c.mittenteNome,
              destinatari: c.destinatari,
              direzione: c.direzione,
              oggetto: c.oggetto,
              // La PRIMA RIGA scritta davvero: in un thread l'oggetto è uguale
              // per tutti e non aiuta a trovare niente. Si usa `anteprima` (200
              // caratteri già salvati) e non il corpo intero: il corpo non
              // viene più caricato apposta.
              anteprima: anteprimaPulita(c.anteprima || ''),
              quando: dataBreve(c.data),
              quandoLungo: dataLunga(c.data),
              letto: c.letto,
              allegati: c.allegati,
              priorita: c.priorita,
            }))}
          />
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

      {/* Richiamare le app DA QUI: prima si poteva solo dalla riga in posta in
          arrivo, cioè prima di aver letto la mail. Il dialogo è lo stesso. */}
      <AppSuMessaggio messaggioId={messaggio.id} azioni={azioniApp} />

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
                  <span
                    className={`badge ${
                      iv.esito === 'ok' ? 'green' : iv.esito === 'saltato' ? 'neutral' : 'red'
                    }`}
                  >
                    <span className="dot" />
                    {/* «Saltato» non è un errore dell'app: è un controllo
                        nostro che ha detto di no PRIMA di mandare. */}
                    {iv.esito === 'ok' ? 'Riuscito' : iv.esito === 'saltato' ? 'Non mandato' : 'Errore'}
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
                {/* COSA è stato mandato. Era già salvato ma non si vedeva: e
                    senza, «contatto registrato» non permette di controllare
                    niente — quale azienda, quale email, quale città. */}
                <DatiInviati json={iv.dati} />
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

      {/* Aprire una mail la segna letta (prima toccava farlo a mano) — e con
          lei tutta la conversazione: in elenco una riga È un thread, quindi
          lasciarne indietro una terrebbe acceso il pallino blu. */}
      <SegnaLettaAllApertura
        id={messaggio.id}
        daSegnare={!messaggio.letto || conversazione.some((c) => !c.letto)}
      />

      {/* Il dialogo di conferma delle app ora sta nel LAYOUT: risponde
          all'evento `aimail:app` da qualunque pagina (montato qui e in posta
          in arrivo, da «Posta inviata» non esisteva). */}
      {/* I dialoghi di nome e aggancio: li aprono i bottoni della riga sottile. */}
      <NomeThreadDialog />
      <AgganciaDialog />
      {/* Su telefono la barra delle azioni è fissa in basso: senza questo
          spazio coprirebbe l ultima card della pagina. Sul desktop è alto zero. */}
      <div className="fondo-mobile" aria-hidden="true" />
    </>
  )
}
