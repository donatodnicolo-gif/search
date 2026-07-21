import { db } from '@/lib/db'
import { creaRegolaApp } from '@/lib/actions'
import { AzioniRegolaApp } from '@/components/AzioniRegolaApp'
import { ChiaveAppForm } from '@/components/ChiaveAppForm'
import { ValoreCondizione } from '@/components/ValoreCondizione'
import { TokenApi } from '@/components/TokenApi'
import { descriviAzioni, statoApp } from '@/lib/appDeluxy'
import { leggiChiaviApp, statoChiaviApp } from '@/lib/chiaviApp'
import { tokenApiConfigurato } from '@/lib/apiAuth'
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
            (<code className="app-var">GET /api/v1/contatto</code>). Va nell’header{' '}
            <code className="app-var">x-api-key</code>, con <code className="app-var">x-utente</code>{' '}
            = l’email dell’utente AI Mail.
          </p>
          <div className="card" style={{ marginBottom: 24 }}>
            <TokenApi token={tokenApi.token} fonte={tokenApi.fonte} />
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
