import Link from 'next/link'
import { ripulisciAnteprima } from '@/lib/citato'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { coloreDiPriorita, dataBreve, FUSO } from '@/lib/format'
import { iniziali, indirizziIn, nomeNeiDestinatari } from '@/lib/contatti'
import { MessaggiContatto } from '@/components/MessaggiContatto'
import { BottoneAI } from '@/components/BottoneAI'
import { BottoneContattoAI } from '@/components/BottoneContattoAI'
import { CheckAttivita } from '@/components/CheckAttivita'
import { richiediUtente } from '@/lib/sessione'
import { datiContattoAI } from '@/lib/contattiAI'
import { EditorIstruzioni } from '@/components/EditorIstruzioni'
import { partnerPerEmail } from '@/lib/anagrafiche'
import { AnagraficheContatto } from '@/components/AnagraficheContatto'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // il quadro AI del contatto gira qui

type Props = { params: Promise<{ email: string }> }

export default async function Contatto({ params }: Props) {
  const { email: grezza } = await params
  const email = decodeURIComponent(grezza)
  const u = await richiediUtente()

  // ⚠️ Lo SCAMBIO, non la sola posta ricevuta. Fino al 17/08/2026 qui c'era
  // `mittente: email` e basta: per un contatto a cui abbiamo solo SCRITTO la
  // pagina dava 404 — pur essendo linkato dalla rubrica, che i destinatari li
  // conta da sempre (`elencoContatti`) — e per gli altri mancavano le nostre
  // risposte, cioè metà della conversazione.
  //
  // ⚠️⚠️ E il destinatario si cerca in TUTTE le direzioni, non solo in uscita:
  // `direzione` dice in quale CARTELLA è stata trovata la mail (INBOX o
  // Inviata), NON chi l'ha scritta. Una mail partita da un indirizzo Deluxy con
  // la casella in copia è marcata `entrata` — misurato sul database: le due mail
  // per `linn_mp@hotmail.com` sono `entrata` da `martina.calia@deluxy.it`, e col
  // filtro `direzione: 'uscita'` la scheda restava un 404.
  const messaggi = await db.messaggio.findMany({
    where: {
      utenteId: u.id,
      OR: [
        { mittente: { equals: email, mode: 'insensitive' } },
        // `contains` è largo per forza (il campo è testo libero): la precisione
        // la mette il filtro qui sotto, che confronta gli indirizzi estratti.
        { destinatari: { contains: email, mode: 'insensitive' } },
      ],
    },
    orderBy: { data: 'desc' },
    take: 200,
    // ⚠️ La scheda mostra solo l'anteprima (riga ~202): i corpi interi —
    // testo, HTML e traduzione — non servono, e per 200 mail sono megabyte
    // trasportati dal database per niente.
    omit: { corpoTesto: true, corpoHtml: true, corpoTradotto: true },
    include: {
      sezione: true,
      bozze: { where: { inviata: false }, select: { id: true } },
      _count: { select: { attivita: true } },
    },
  })
  // ⚠️ `contains` prenderebbe anche un indirizzo che CONTIENE il nostro
  // (`altrolinn_mp@hotmail.com` contiene `linn_mp@hotmail.com`): sui destinatari
  // si tiene solo chi combacia per intero.
  const scambio = messaggi.filter(
    (m) =>
      m.mittente.toLowerCase() === email.toLowerCase() ||
      indirizziIn(m.destinatari).includes(email.toLowerCase())
  )
  if (scambio.length === 0) notFound()

  // ⚠️ Il verso si legge dal MITTENTE, non da `direzione` (che è la cartella):
  // «da lei» = l'ha scritta lei, «a lei» = era indirizzata a lei, chiunque
  // dell'azienda l'abbia mandata. Per questo le etichette non dicono «inviate
  // da te»: non è sempre vero.
  const daLei = scambio.filter((m) => m.mittente.toLowerCase() === email.toLowerCase()).length
  const aLei = scambio.length - daLei

  // Il nome: da chi ci ha scritto, o — per chi non ci ha mai scritto — da come
  // l'abbiamo indirizzato noi (`Linn Persson <linn_mp@hotmail.com>`).
  const nome =
    scambio.find((m) => m.mittente.toLowerCase() === email.toLowerCase() && m.mittenteNome)?.mittenteNome ??
    scambio.map((m) => nomeNeiDestinatari(m.destinatari, email)).find(Boolean) ??
    null
  const daRispondere = scambio.filter((m) => m.serveRisposta && !m.archiviato).length
  const attivitaAperte = await db.attivita.count({
    where: {
      utenteId: u.id,
      fatta: false,
      OR: [{ messaggio: { mittente: email } }, { contattoEmail: email }],
    },
  })
  const riassunto = await db.riassuntoContatto.findUnique({
    where: { utenteId_email: { utenteId: u.id, email } },
  })
  const { attivo: contattoAI, istruzioni: istruzioniContatto } = await datiContattoAI(u.id, email)
  const azioni = await db.attivita.findMany({
    where: { utenteId: u.id, contattoEmail: email, fatta: false },
    orderBy: [{ scadenza: 'asc' }, { priorita: 'asc' }],
  })

  // Questo contatto è un'azienda in Anagrafiche? (e un cliente?)
  const partnerAnagrafiche = await partnerPerEmail(email).catch(() => null)

  return (
    <>
      <div className="page-head">
        <div>
          <Link href="/rubrica" className="btn secondary small" style={{ marginBottom: 14 }}>
            ← Contatti
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span className="avatar" style={{ width: 44, height: 44, fontSize: 15 }}>
              {iniziali(nome, email)}
            </span>
            <div>
              <h1 className="page-title">{nome || email.split('@')[0]}</h1>
              <p className="page-caption" style={{ marginTop: 2 }}>
                {email}
              </p>
            </div>
          </div>
        </div>
        <div className="page-actions" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <BottoneContattoAI email={email.toLowerCase()} attivo={contattoAI} />
          <BottoneAI email={email} aggiornatoIl={riassunto?.aggiornatoIl ?? null} />
        </div>
      </div>

      <AnagraficheContatto
        email={email.toLowerCase()}
        nome={nome}
        partner={
          partnerAnagrafiche
            ? { nome: partnerAnagrafiche.nome, stato: partnerAnagrafiche.stato, citta: partnerAnagrafiche.citta, link: partnerAnagrafiche.link }
            : null
        }
        link={partnerAnagrafiche?.link ?? ''}
      />

      <div className="card" style={{ marginBottom: 18 }}>
        <EditorIstruzioni tipo="contatto" target={email.toLowerCase()} valore={istruzioniContatto} />
      </div>

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Messaggi</div>
          <div className="kpi-value">{scambio.length}</div>
          <div className="kpi-sub">
            {daLei} da lui/lei · {aLei} a lui/lei · l’ultimo {dataBreve(scambio[0].data)}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Da rispondere</div>
          <div className={`kpi-value ${daRispondere > 0 ? 'neg' : ''}`}>{daRispondere}</div>
          <div className="kpi-sub">secondo l’AI</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Attività aperte</div>
          <div className="kpi-value">{attivitaAperte}</div>
          <div className="kpi-sub">nate dalle sue mail</div>
        </div>
      </div>

      {riassunto ? (
        <div className="ai-box">
          <div className="ai-box-title">
            La situazione secondo l’AI · {riassunto.messaggiVisti} messaggi letti il{' '}
            {riassunto.aggiornatoIl.toLocaleDateString('it-IT', { timeZone: FUSO })}
          </div>
          <div className="ai-box-text">{riassunto.situazione}</div>

          {riassunto.taskAperti.trim() && (
            <>
              <div className="ai-box-title" style={{ marginTop: 14 }}>
                Rimasto in sospeso
              </div>
              <ul style={{ margin: '0 0 0 18px', fontSize: 14 }}>
                {riassunto.taskAperti
                  .split('\n')
                  .filter(Boolean)
                  .map((t, i) => (
                    <li key={i} style={{ marginTop: 4 }}>
                      {t}
                    </li>
                  ))}
              </ul>
            </>
          )}

          {azioni.length > 0 && (
            <>
              <div className="ai-box-title" style={{ marginTop: 14 }}>
                Azioni proposte · le trovi anche in Attività
              </div>
              {azioni.map((a) => (
                <div key={a.id} className="col-task" style={{ padding: '10px 0', border: 'none' }}>
                  <CheckAttivita id={a.id} fatta={a.fatta} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14 }}>{a.titolo}</div>
                    {a.dettaglio && (
                      <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 2 }}>
                        {a.dettaglio}
                      </div>
                    )}
                  </div>
                  <span className={`badge ${coloreDiPriorita(a.priorita)}`}>{a.priorita}</span>
                  {a.scadenza && (
                    <span className="muted" style={{ fontSize: 12 }}>
                      entro {a.scadenza.toLocaleDateString('it-IT', { timeZone: FUSO, day: 'numeric', month: 'short' })}
                    </span>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      ) : (
        <div className="ai-box" style={{ background: 'var(--fill)', borderColor: 'var(--hairline)' }}>
          <div className="ai-box-text" style={{ color: 'var(--text-secondary)' }}>
            Premi <strong>AI</strong> qui sopra: legge le ultime 10 mail scambiate con questo
            contatto, ti dice a che punto siete e propone cosa fare.
          </div>
        </div>
      )}

      <h2 className="section-title">Tutti i messaggi · ricevuti e inviati</h2>
      <MessaggiContatto
        messaggi={scambio.map((m) => ({
          id: m.id,
          // Chi ha scritto: senza questo, in un elenco che ora contiene tutti e
          // due i versi, la propria mail e quella del contatto sono identiche.
          // ⚠️ Dal mittente, non da `direzione`: vedi il commento sopra.
          alContatto: m.mittente.toLowerCase() !== email.toLowerCase(),
          oggetto: m.oggetto,
          letto: m.letto,
          riassunto: m.riassunto,
          anteprima: ripulisciAnteprima(m.anteprima),
          data: m.data.toISOString(),
          dataBreve: dataBreve(m.data),
          sezione: m.sezione ? { nome: m.sezione.nome, colore: m.sezione.colore } : null,
          archiviato: m.archiviato,
          attivita: m._count.attivita,
          bozze: m.bozze.length,
          priorita: m.priorita,
          prioritaDa: m.prioritaDa,
          analizzato: m.analizzatoIl !== null,
        }))}
      />
    </>
  )
}
