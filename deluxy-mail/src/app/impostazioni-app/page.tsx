import { db } from '@/lib/db'
import { creaRegolaApp } from '@/lib/actions'
import { AzioniRegolaApp } from '@/components/AzioniRegolaApp'
import { ChiaveAppForm } from '@/components/ChiaveAppForm'
import { ValoreCondizione } from '@/components/ValoreCondizione'
import { TokenApi } from '@/components/TokenApi'
import { SincronizzaRegistro } from '@/components/SincronizzaRegistro'
import { descriviAzioni, statoApp } from '@/lib/appDeluxy'
import { leggiChiaviApp, statoChiaviApp } from '@/lib/chiaviApp'
import { tokenApiConfigurato } from '@/lib/apiAuth'
import { statoDrive, configDrive, indirizzoRitornoDrive } from '@/lib/drive'
import { salvaDriveAction } from '@/lib/drive-actions'
import { richiediUtente } from '@/lib/sessione'
import type { RegolaApp } from '@prisma/client'

export const dynamic = 'force-dynamic'

export default async function ImpostazioniApp() {
  const u = await richiediUtente()

  let regoleApp: RegolaApp[] = []
  try {
    regoleApp = await db.regolaApp.findMany({
      where: { utenteId: u.id },
      orderBy: [{ priorita: 'desc' }, { creataIl: 'asc' }],
    })
  } catch {
    regoleApp = []
  }

  const chiavi = await leggiChiaviApp()
  const statoChiavi = await statoChiaviApp()
  const azioniApp = descriviAzioni(chiavi)
  const app = statoApp(chiavi)
  const isAdmin = u.ruolo === 'admin'
  const tokenApi = isAdmin ? await tokenApiConfigurato() : { token: '', fonte: 'nessuno' as const }
  // Chi ha usato la chiave delle API, e con che esito. ⚠️ Difensivo: la
  // tabella nasce con una migrazione che al build è volutamente NON
  // bloccante, quindi può non esserci ancora — e questa pagina non deve
  // cadere per un registro.
  let chiamate: { id: string; quando: Date; rotta: string; metodo: string; utenteChiesto: string; esito: string; ip: string }[] = []
  let rifiutate = 0
  if (isAdmin) {
    try {
      chiamate = await db.chiamataApi.findMany({
        orderBy: { quando: 'desc' },
        take: 25,
        select: { id: true, quando: true, rotta: true, metodo: true, utenteChiesto: true, esito: true, ip: true },
      })
      rifiutate = await db.chiamataApi.count({
        where: {
          esito: { not: 'ok' },
          quando: { gte: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7) },
        },
      })
    } catch {
      chiamate = []
    }
  }
  const statoDr = isAdmin ? await statoDrive() : null
  const confDr = isAdmin ? await configDrive() : null
  // ⚠️ Il segreto NON si rimanda al browser: del client id si mostra solo la
  //    coda, quanto basta a riconoscerlo.
  const drive = {
    ...(statoDr ?? { configurato: false, collegato: false, email: null, errore: null }),
    idParziale: confDr?.id ?? '',
  }
  const ritornoDrive = indirizzoRitornoDrive()
  const nomeAzione = (id: string) => {
    const a = azioniApp.find((x) => x.id === id)
    return a ? `${a.app} — ${a.nome}` : id
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Impostazioni App</h1>
          <p className="page-caption">
            Le app Deluxy che AI Mail può richiamare da una mail: qui vedi cosa è collegato e
            imposti le regole che decidono, quando mandi una mail a un’app, quale funzione usare.
          </p>
        </div>
      </div>

      {/* ---------- Token con cui le ALTRE app chiamano AI Mail ---------- */}
      {isAdmin && (
        <>
          <h2 className="section-title" style={{ marginTop: 0 }}>
            Token API di AI Mail
          </h2>
          <p className="page-caption" style={{ marginBottom: 14 }}>
            La chiave che le altre app (Scout, script, agenti) devono passare per usare le API di
            AI Mail — inviare una mail (<code className="app-var">POST /api/v1/invia</code>) o farsi
            fare da Renè il punto della situazione con un contatto
            (<code className="app-var">GET /api/v1/contatto</code>), oppure leggere la posta di un
            contatto o di un intero cliente
            (<code className="app-var">GET /api/v1/messaggi?cliente=…</code>, stessa associazione
            mail↔cliente della sezione Clienti). Va nell’header{' '}
            <code className="app-var">x-api-key</code>, con <code className="app-var">x-utente</code>{' '}
            = l’email dell’utente AI Mail.
          </p>
          <div className="card" style={{ marginBottom: 24 }}>
            <TokenApi token={tokenApi.token} fonte={tokenApi.fonte} />
          </div>

          {/* ---------- Chi ha usato la chiave ---------- */}
          <h2 className="section-title">Chi ha usato la chiave</h2>
          <p className="page-caption" style={{ marginBottom: 14 }}>
            La chiave qui sopra è <strong>una sola</strong> e vale per tutte le app che ce
            l’hanno: chi la possiede sceglie su quale casella agire scrivendo l’header{' '}
            <code className="app-var">x-utente</code>, e può leggere la posta o mandare una mail
            a nome di chiunque. Finché non c’era questo elenco, di quelle chiamate non restava
            traccia da nessuna parte. <strong>Le ultime 25</strong>, conservate sei mesi.
          </p>
          <div className="card" style={{ marginBottom: 24 }}>
            {rifiutate > 0 && (
              <p style={{ margin: '0 0 12px', fontWeight: 600 }}>
                ⚠️ {rifiutate} {rifiutate === 1 ? 'chiamata rifiutata' : 'chiamate rifiutate'} negli
                ultimi 7 giorni (chiave errata o utente sconosciuto).
              </p>
            )}
            {chiamate.length === 0 ? (
              <p className="page-caption" style={{ margin: 0 }}>
                Nessuna chiamata registrata: o le API non le usa nessuno, o il registro è appena
                nato (segna da oggi in avanti, non all’indietro).
              </p>
            ) : (
              <div className="sotto-tabella-wrap">
                <table className="tabella-dati">
                  <thead>
                    <tr>
                      <th>Quando</th>
                      <th>Rotta</th>
                      <th>Per conto di</th>
                      <th>Esito</th>
                      <th>Da</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chiamate.map((c) => (
                      <tr key={c.id}>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {c.quando.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td><code className="app-var">{c.metodo} {c.rotta}</code></td>
                        <td>{c.utenteChiesto || '—'}</td>
                        <td style={{ fontWeight: c.esito === 'ok' ? 400 : 600 }}>
                          {c.esito === 'ok'
                            ? 'ok'
                            : c.esito === 'chiaveErrata'
                              ? 'chiave errata'
                              : c.esito === 'utenteSconosciuto'
                                ? 'utente sconosciuto'
                                : 'API non configurata'}
                        </td>
                        <td>{c.ip || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ---------- Archivio allegati su Google Drive ---------- */}
      {isAdmin && (
        <>
          <h2 className="section-title">Archivio allegati su Google Drive</h2>
          <p className="page-caption" style={{ marginBottom: 14 }}>
            Dove finiscono gli allegati staccati dalle mail. Il Drive è <strong>uno solo per tutta
            l’azienda</strong> — ogni utente che stacca un allegato scrive qui, in una sottocartella
            col nome della sua casella. ⚠️ In AI Mail ognuno vede solo la propria posta, ma su Drive
            chi ha accesso alla cartella vede i file di tutti.
          </p>
          <div className="card" style={{ marginBottom: 24 }}>
            {drive.collegato ? (
              <p style={{ margin: '0 0 12px' }}>
                <span className="badge badge-ok">● Collegato</span>{' '}
                {drive.email ? <>scrive nel Drive di <strong>{drive.email}</strong></> : null}
              </p>
            ) : drive.configurato ? (
              <p style={{ margin: '0 0 12px' }}>
                <span className="badge">○ Da collegare</span> le credenziali ci sono, manca il
                consenso.{drive.errore ? <> — {drive.errore}</> : null}
              </p>
            ) : (
              <p style={{ margin: '0 0 12px' }}>
                <span className="badge">○ Non configurato</span> servono le credenziali del client
                OAuth.
              </p>
            )}

            <p className="page-caption" style={{ marginBottom: 12 }}>
              In Google Cloud Console: crea un client OAuth di tipo «Applicazione web» e fra gli URI
              di reindirizzamento autorizzati incolla <strong>esattamente</strong> questo:{' '}
              <code className="app-var">{ritornoDrive}</code>. Se non combacia carattere per
              carattere Google risponde <code className="app-var">redirect_uri_mismatch</code>.
            </p>

            <form action={salvaDriveAction} className="form-riga">
              <input className="input" name="clientId" placeholder="Client ID" defaultValue={drive.idParziale} />
              <input className="input" name="clientSegreto" type="password" placeholder="Client secret" />
              <button className="btn primary" type="submit">Salva credenziali</button>
            </form>

            {drive.configurato && (
              <p style={{ marginTop: 12 }}>
                <a className="btn primary" href="/api/interno/drive/oauth">
                  {drive.collegato ? 'Ricollega Drive' : 'Collega Drive'}
                </a>
              </p>
            )}
          </div>
        </>
      )}

      {/* ---------- Stato collegamento (chiavi API) ---------- */}
      <h2 className="section-title" style={{ marginTop: 0 }}>
        App collegate
      </h2>
      <p className="page-caption" style={{ marginBottom: 14 }}>
        {isAdmin
          ? 'Incolla qui la chiave di ogni app: viene cifrata sul server e vale per tutta l’azienda. In alternativa puoi impostarla come variabile d’ambiente su Vercel.'
          : 'Lo stato di collegamento delle app. Le chiavi le imposta un amministratore.'}
      </p>

      <div className="app-stato-griglia">
        {app.map((a) => (
          <div key={a.app} className="card app-stato">
            <div className="app-stato-testa">
              <span className={`badge ${a.colore}`}>
                <span className="dot" />
                {a.app}
              </span>
              <span className={`badge ${a.configurata ? 'green' : 'neutral'}`}>
                <span className="dot" />
                {a.configurata ? 'Collegata' : 'Da collegare'}
              </span>
            </div>

            <ul className="app-stato-funzioni">
              {a.azioni.map((az) => (
                <li key={az.nome}>
                  <strong>{az.nome}</strong> — {az.descrizione}
                </li>
              ))}
            </ul>

            <div className="app-stato-chiave">
              <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginBottom: 10 }}>
                {a.comeSiOttiene}
              </div>
              {isAdmin ? (
                <ChiaveAppForm
                  nome={a.nomeChiave}
                  etichetta={a.app}
                  impostataDaApp={statoChiavi[a.nomeChiave].daApp}
                  daHub={statoChiavi[a.nomeChiave].daHub}
                  daEnv={statoChiavi[a.nomeChiave].daEnv}
                  variabileEnv={a.variabileEnv}
                />
              ) : (
                <div style={{ fontSize: 12.5, color: 'var(--text-tertiary)' }}>
                  {a.configurata ? 'Collegata.' : 'Non ancora collegata.'}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ---------- Registro centralizzato delle attività ---------- */}
      <h2 className="section-title">Registro Attività (Deluxy Tasks)</h2>
      <p className="page-caption" style={{ marginBottom: 14 }}>
        Le attività create qui (dall’AI, dalle regole o a mano) vivono anche nel registro
        centralizzato <strong>Attività</strong>, dove ogni persona vede in un posto solo le cose da
        fare che arrivano da tutte le app Deluxy. L’allineamento va nei <strong>due sensi</strong>:
        chiudere un’attività qui la chiude anche là (subito), e una task chiusa o modificata dentro
        Attività — o da un’altra app — torna qui al giro di sincronizzazione successivo. Parte solo
        ciò che è cambiato, e un’attività cancellata qui viene archiviata anche là.
        Serve una chiave di <strong>scrittura</strong> del registro.
      </p>
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
          <span className={`badge ${chiavi.tasks ? 'green' : 'neutral'}`}>
            <span className="dot" />
            {chiavi.tasks ? 'Collegato' : 'Da collegare'}
          </span>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginBottom: 10 }}>
          Chiave di SCRITTURA generata dal registro Attività (comando «npm run chiave -- mail
          --scrittura» nell’app deluxy-tasks).
        </div>
        {isAdmin ? (
          <ChiaveAppForm
            nome="tasks"
            etichetta="Registro Attività"
            impostataDaApp={statoChiavi.tasks.daApp}
            daHub={statoChiavi.tasks.daHub}
            daEnv={statoChiavi.tasks.daEnv}
            variabileEnv="TASKS_API_KEY"
          />
        ) : (
          <div style={{ fontSize: 12.5, color: 'var(--text-tertiary)' }}>
            {chiavi.tasks ? 'Collegato.' : 'Non ancora collegato.'}
          </div>
        )}
        {/* Poter sincronizzare a mano e vedere il conto è ciò che rende
            verificabile il collegamento, invece di doversi fidare. */}
        {isAdmin && chiavi.tasks && <SincronizzaRegistro />}
      </div>

      {/* ---------- Calendario condiviso ---------- */}
      <h2 className="section-title">Calendario condiviso (Deluxy Calendario)</h2>
      <p className="page-caption" style={{ marginBottom: 14 }}>
        Gli appuntamenti presi qui — a mano, accettando un invito o accogliendo una proposta
        dell’AI — vivono anche nel <strong>Calendario</strong> centralizzato, insieme a consegne e
        scadenze delle altre app. Come per le attività l’allineamento va nei{' '}
        <strong>due sensi</strong>: quello che sposti o cancelli qui si sposta anche là (subito), e
        un appuntamento modificato o annullato nel calendario condiviso torna qui al giro di
        sincronizzazione successivo. Serve una chiave di <strong>scrittura</strong>.
      </p>
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
          <span className={`badge ${chiavi.calendario ? 'green' : 'neutral'}`}>
            <span className="dot" />
            {chiavi.calendario ? 'Collegato' : 'Da collegare'}
          </span>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginBottom: 10 }}>
          Chiave di SCRITTURA generata dal Calendario (comando «npm run chiave -- mail
          --scrittura» nell’app deluxy-calendario).
        </div>
        {isAdmin ? (
          <ChiaveAppForm
            nome="calendario"
            etichetta="Calendario condiviso"
            impostataDaApp={statoChiavi.calendario.daApp}
            daHub={statoChiavi.calendario.daHub}
            daEnv={statoChiavi.calendario.daEnv}
            variabileEnv="CALENDARIO_API_KEY"
          />
        ) : (
          <div style={{ fontSize: 12.5, color: 'var(--text-tertiary)' }}>
            {chiavi.calendario ? 'Collegato.' : 'Non ancora collegato.'}
          </div>
        )}
        {isAdmin && chiavi.calendario && <SincronizzaRegistro quale="calendario" />}
      </div>

      {/* ---------- Testi pronti ---------- */}
      <h2 className="section-title">Testi pronti (Deluxy Scripts)</h2>
      <p className="page-caption" style={{ marginBottom: 14 }}>
        I copioni aziendali — offerte, inviti, presentazioni, solleciti, risposte ai reclami —
        scritti una volta sola nell’app <strong>Scripts</strong> e richiamabili mentre si scrive una
        mail: compare «Usa un testo pronto», si sceglie, e oggetto e messaggio arrivano già composti
        con la firma e i recapiti della posta. Dalla sezione <strong>Risposte rapide</strong> se ne
        possono anche scrivere di nuovi: nascono direttamente <em>dentro</em> Scripts, non se ne
        tiene una copia qui — due versioni dello stesso testo aziendale divergerebbero. Per leggere
        basta una chiave qualsiasi; per <strong>scrivere</strong> serve una chiave di scrittura
        («npm run chiave -- deluxy-mail --scrittura»).
      </p>
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
          <span className={`badge ${chiavi.scripts ? 'green' : 'neutral'}`}>
            <span className="dot" />
            {chiavi.scripts ? 'Collegato' : 'Da collegare'}
          </span>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginBottom: 10 }}>
          Chiave generata dai Testi pronti (comando «npm run chiave -- deluxy-mail» nell’app
          deluxy-scripts). I singoli testi vanno poi <strong>accesi per AI Mail</strong> da lì:
          quelli spenti non compaiono.
        </div>
        {isAdmin ? (
          <ChiaveAppForm
            nome="scripts"
            etichetta="Testi pronti"
            impostataDaApp={statoChiavi.scripts.daApp}
            daHub={statoChiavi.scripts.daHub}
            daEnv={statoChiavi.scripts.daEnv}
            variabileEnv="SCRIPTS_API_KEY"
          />
        ) : (
          <div style={{ fontSize: 12.5, color: 'var(--text-tertiary)' }}>
            {chiavi.scripts ? 'Collegato.' : 'Non ancora collegato.'}
          </div>
        )}
      </div>

      {/* ---------- Regole: quando una mail va a un'app ---------- */}
      <h2 className="section-title">Regole di smistamento verso le app</h2>
      <p className="page-caption" style={{ marginBottom: 14 }}>
        Quando trascini una mail sul riquadro «Automatico» del pannello APP Deluxy (o premi «→ App»
        su una mail), queste regole decidono quale funzione richiamare. Stessa logica delle regole
        della posta: contano le condizioni esatte, vince la priorità più alta. L’AI prepara i dati,
        tu confermi sempre prima dell’invio.
      </p>

      {regoleApp.length === 0 ? (
        <div className="card">
          <div className="empty">
            <div className="empty-icon">⤳</div>
            <div className="empty-title">Nessuna regola verso le app</div>
            <p className="empty-text">
              Senza regole puoi comunque mandare una mail a un’app scegliendo la funzione a mano
              (bottone «→ App»). Le regole servono per farlo in automatico.
            </p>
          </div>
        </div>
      ) : (
        regoleApp.map((r) => (
          <div key={r.id} className="rule-card">
            <div className="rule-head">
              <div>
                <div className="rule-name">{r.nome}</div>
                <div className="mail-tags" style={{ marginTop: 6 }}>
                  <span className="badge gold">
                    <span className="dot" />
                    {nomeAzione(r.azioneId)}
                  </span>
                  <span className="badge neutral">priorità {r.priorita}</span>
                </div>
              </div>
              <AzioniRegolaApp id={r.id} attiva={r.attiva} />
            </div>
            <div className="rule-cond">
              {r.seMittente || r.seOggetto || r.seContiene ? (
                <>
                  Quando{' '}
                  {[
                    r.seMittente && (
                      <>
                        il mittente contiene <ValoreCondizione valore={r.seMittente} />
                      </>
                    ),
                    r.seOggetto && (
                      <>
                        l’oggetto contiene <ValoreCondizione valore={r.seOggetto} />
                      </>
                    ),
                    r.seContiene && (
                      <>
                        il testo contiene <ValoreCondizione valore={r.seContiene} />
                      </>
                    ),
                  ]
                    .filter(Boolean)
                    .map((frammento, i, arr) => (
                      <span key={i}>
                        {frammento}
                        {i < arr.length - 1 ? ' e ' : ''}
                      </span>
                    ))}
                </>
              ) : (
                <span className="muted">Nessuna condizione: da agganciare solo a mano.</span>
              )}
              {r.istruzioni && (
                <div style={{ marginTop: 6 }}>
                  <span className="ai-mark" style={{ color: 'var(--gold-strong)', fontWeight: 600 }}>
                    AI
                  </span>{' '}
                  {r.istruzioni}
                </div>
              )}
            </div>
          </div>
        ))
      )}

      <h2 className="section-title">Nuova regola verso un’app</h2>
      <div className="card">
        <form action={creaRegolaApp}>
          <div className="form-grid">
            <div className="full">
              <label className="field-label">
                Nome <span className="req">*</span>
              </label>
              <input type="text" name="nome" required placeholder="Preventivi hotel → Anagrafiche" />
            </div>

            <div>
              <label className="field-label">Se il mittente contiene</label>
              <input type="text" name="seMittente" placeholder="@hotel.it" />
            </div>
            <div>
              <label className="field-label">Se l’oggetto contiene</label>
              <input type="text" name="seOggetto" placeholder="[DELUXY], [DELUXYFLOWERS]" />
            </div>
            <div>
              <label className="field-label">Se il testo contiene</label>
              <input type="text" name="seContiene" />
            </div>
            <div className="full" style={{ marginTop: -6 }}>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                Più alternative: separale con una virgola. La condizione vale se ne trova almeno una
                (es. oggetto «[DELUXY], [DELUXYFLOWERS]» scatta su tutt’e due).
              </div>
            </div>

            <div>
              <label className="field-label">
                Funzione da richiamare <span className="req">*</span>
              </label>
              <select name="azioneId" required defaultValue={azioniApp[0]?.id}>
                {azioniApp.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.app} — {a.nome}
                    {a.configurata ? '' : ' (da collegare)'}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">Priorità della regola</label>
              <input type="number" name="priorita" defaultValue={0} />
            </div>

            <div className="full">
              <label className="field-label">Nota per l’AI (opzionale, in italiano)</label>
              <input
                type="text"
                name="istruzioni"
                placeholder="Es. la categoria è sempre “hotel”; la città se manca è Milano"
              />
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6 }}>
                È l’istruzione che l’AI segue mentre prepara i dati per l’app: cosa dare per
                scontato, come compilare i campi ambigui.
              </div>
            </div>
          </div>
          <div className="form-footer">
            <button className="btn primary" type="submit">
              Crea regola
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
