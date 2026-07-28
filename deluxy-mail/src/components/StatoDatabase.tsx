import { db } from '@/lib/db'

/**
 * QUALE DATABASE È COLLEGATO, e sta bene?
 *
 * ⚠️ Nasce da un'ora persa a rispondere alla domanda «ma quale database usa
 * l'app?». Da fuori non si può sapere: su Vercel le variabili sono marcate
 * «Sensitive» e non si rileggono nemmeno da chi le ha messe. L'unico che lo sa
 * con certezza è il programma stesso, mentre gira — e finché non glielo si
 * chiedeva, non c'era modo di saperlo se non a memoria.
 *
 * ⚠️ E soprattutto: quando il database va in SOLA LETTURA (su Supabase succede
 * a disco pieno) l'app smette di ricevere posta e da fuori sembra soltanto
 * «inchiodata». La differenza fra «l'app è rotta» e «il disco è pieno» è tutta
 * qui, e prima bisognava andarla a cercare nei log di produzione.
 *
 * La password NON si mostra mai: dell'indirizzo si tengono host, porta e utente.
 */

function indirizzoSenzaPassword(url: string | undefined): {
  host: string
  porta: string
  utente: string
  database: string
} | null {
  if (!url) return null
  try {
    const u = new URL(url)
    return {
      host: u.hostname,
      porta: u.port || '5432',
      utente: u.username,
      database: u.pathname.replace(/^\//, '') || 'postgres',
    }
  } catch {
    return null
  }
}

type Tabella = { tabella: string; totale: string; morte: number }

export async function StatoDatabase() {
  const indirizzo = indirizzoSenzaPassword(process.env.DATABASE_URL)

  let scrivibile: boolean | null = null
  let dimensione: string | null = null
  let tabelle: Tabella[] = []
  let errore: string | null = null

  try {
    const [ro] = await db.$queryRaw<{ ro: string }[]>`SELECT current_setting('transaction_read_only') AS ro`
    scrivibile = ro?.ro !== 'on'
    const [size] = await db.$queryRaw<{ d: string }[]>`SELECT pg_size_pretty(pg_database_size(current_database())) AS d`
    dimensione = size?.d ?? null
    tabelle = await db.$queryRaw<Tabella[]>`
      SELECT c.relname AS tabella,
             pg_size_pretty(pg_total_relation_size(c.oid)) AS totale,
             coalesce(s.n_dead_tup, 0)::int AS morte
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
       WHERE n.nspname = 'public' AND c.relkind = 'r'
       ORDER BY pg_total_relation_size(c.oid) DESC
       LIMIT 6`
  } catch (e) {
    errore = e instanceof Error ? e.message.slice(0, 200) : 'non raggiungibile'
  }

  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        {scrivibile === null ? (
          <span className="badge red">
            <span className="dot" />
            Non raggiungibile
          </span>
        ) : scrivibile ? (
          <span className="badge green">
            <span className="dot" />
            Funzionante
          </span>
        ) : (
          <span className="badge red">
            <span className="dot" />
            SOLA LETTURA
          </span>
        )}
        {dimensione && <span className="badge neutral">occupa {dimensione}</span>}
      </div>

      {scrivibile === false && (
        <p style={{ fontSize: 13.5, marginBottom: 12 }}>
          <strong>Il database non accetta scritture.</strong> Su Supabase succede quando lo spazio è
          esaurito: l’app continua a mostrare la posta già scaricata, ma non ne riceve di nuova e
          non salva più niente. <strong>Nessuna mail va persa</strong> — la lettura riprende da dove
          si è fermata appena si libera spazio. Si risolve dal pannello Supabase, aumentando il
          disco; poi si può alleggerire (vedi <code>scripts/libera-spazio.sql</code>).
        </p>
      )}

      {indirizzo ? (
        <div style={{ fontSize: 13, display: 'grid', gap: 4, marginBottom: tabelle.length ? 14 : 0 }}>
          <div>
            <span className="muted">Server: </span>
            <code>{indirizzo.host}</code>
          </div>
          <div>
            <span className="muted">Porta: </span>
            <code>{indirizzo.porta}</code>
            <span className="muted"> · Utente: </span>
            <code>{indirizzo.utente}</code>
            <span className="muted"> · Database: </span>
            <code>{indirizzo.database}</code>
          </div>
        </div>
      ) : (
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Indirizzo del database non leggibile (variabile <code>DATABASE_URL</code> assente o in un
          formato inatteso).
        </p>
      )}

      {errore && (
        <p style={{ fontSize: 12.5, color: 'var(--red)' }}>{errore}</p>
      )}

      {tabelle.length > 0 && (
        <>
          <div className="field-label" style={{ marginBottom: 6 }}>
            Le tabelle più grosse
          </div>
          <div style={{ fontSize: 12.5, display: 'grid', gap: 3 }}>
            {tabelle.map((t) => (
              <div key={t.tabella} style={{ display: 'flex', gap: 10 }}>
                <code style={{ minWidth: 150 }}>{t.tabella}</code>
                <span>{t.totale}</span>
                {t.morte > 0 && (
                  <span className="muted" title="Righe cancellate che occupano ancora spazio finché non passa un VACUUM">
                    {t.morte.toLocaleString('it-IT')} righe morte
                  </span>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
