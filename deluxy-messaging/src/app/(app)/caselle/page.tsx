import { db } from '@/lib/db'
import { IMAP_DEFAULT, SMTP_DEFAULT } from '@/lib/email'
import { ProvaCasella } from '@/components/ProvaCasella'
import { eliminaCasellaAction, salvaCasellaAction } from './actions'

export const dynamic = 'force-dynamic'

export default async function PaginaCaselle() {
  const caselle = await db.casellaEmail.findMany({
    orderBy: [{ predefinita: 'desc' }, { indirizzo: 'asc' }],
  })

  return (
    <main>
      <div className="page-head">
        <div>
          <h1 className="page-title">Caselle di posta</h1>
          <p className="page-sub">
            Le caselle email collegate: le mail arrivano in inbox come gli altri canali e la
            risposta parte dalla casella che ha ricevuto. Parametri register.it:{' '}
            <code>{IMAP_DEFAULT}</code> porta 993 e <code>{SMTP_DEFAULT}</code> porta 465, utente =
            indirizzo completo.
          </p>
        </div>
      </div>

      <div className="griglia-impostazioni">
        {caselle.map((c) => (
          <div className="card" key={c.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <h2 style={{ margin: 0, flex: 1 }}>{c.nome || c.indirizzo}</h2>
              {c.predefinita ? <span className="badge verde">predefinita</span> : null}
              <span className={`badge${c.attiva ? ' verde' : ''}`}>
                {c.attiva ? 'attiva' : 'sospesa'}
              </span>
              <span className={`badge${c.password ? ' verde' : ' rosso'}`}>
                {c.password ? 'password ok' : 'password mancante'}
              </span>
            </div>

            <form action={salvaCasellaAction}>
              <input type="hidden" name="id" value={c.id} />
              <label className="campo">
                <span>Etichetta</span>
                <input name="nome" defaultValue={c.nome} placeholder="Servizio clienti" />
              </label>
              <label className="campo">
                <span>Indirizzo (è anche l&apos;utente)</span>
                <input name="indirizzo" type="email" defaultValue={c.indirizzo} required />
              </label>
              <label className="campo">
                <span>Nome mittente</span>
                <input name="nomeMittente" defaultValue={c.nomeMittente} />
              </label>
              <label className="campo">
                <span>Password della casella</span>
                <input
                  name="password"
                  type="password"
                  placeholder={c.password ? 'salvata — incolla per sostituire' : ''}
                  autoComplete="new-password"
                />
              </label>
              <div style={{ display: 'flex', gap: 10 }}>
                <label className="campo" style={{ flex: 2 }}>
                  <span>Server IMAP</span>
                  <input name="imapHost" defaultValue={c.imapHost} />
                </label>
                <label className="campo" style={{ flex: 1 }}>
                  <span>Porta</span>
                  <input name="imapPort" type="number" defaultValue={c.imapPort} />
                </label>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <label className="campo" style={{ flex: 2 }}>
                  <span>Server SMTP</span>
                  <input name="smtpHost" defaultValue={c.smtpHost} />
                </label>
                <label className="campo" style={{ flex: 1 }}>
                  <span>Porta</span>
                  <input name="smtpPort" type="number" defaultValue={c.smtpPort} />
                </label>
              </div>
              <label
                style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginBottom: 12 }}
              >
                <input type="checkbox" name="predefinita" value="1" defaultChecked={c.predefinita} />
                Casella predefinita (per le mail nuove)
              </label>
              <button className="btn">Salva</button>
            </form>

            <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
              <ProvaCasella id={c.id} />
              <form action={eliminaCasellaAction}>
                <input type="hidden" name="id" value={c.id} />
                <button className="btn btn-secondario small" style={{ color: 'var(--red)' }}>
                  Elimina
                </button>
              </form>
            </div>
          </div>
        ))}

        <div className="card" style={{ borderStyle: 'dashed' }}>
          <h2 style={{ marginTop: 0 }}>Aggiungi una casella</h2>
          <form action={salvaCasellaAction}>
            <label className="campo">
              <span>Etichetta</span>
              <input name="nome" placeholder="Servizio clienti" />
            </label>
            <label className="campo">
              <span>Indirizzo</span>
              <input name="indirizzo" type="email" placeholder="cs@deluxy.it" required />
            </label>
            <label className="campo">
              <span>Nome mittente</span>
              <input name="nomeMittente" placeholder="Deluxy" />
            </label>
            <label className="campo">
              <span>Password della casella</span>
              <input name="password" type="password" autoComplete="new-password" />
            </label>
            <div style={{ display: 'flex', gap: 10 }}>
              <label className="campo" style={{ flex: 2 }}>
                <span>Server IMAP</span>
                <input name="imapHost" defaultValue={IMAP_DEFAULT} />
              </label>
              <label className="campo" style={{ flex: 1 }}>
                <span>Porta</span>
                <input name="imapPort" type="number" defaultValue={993} />
              </label>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <label className="campo" style={{ flex: 2 }}>
                <span>Server SMTP</span>
                <input name="smtpHost" defaultValue={SMTP_DEFAULT} />
              </label>
              <label className="campo" style={{ flex: 1 }}>
                <span>Porta</span>
                <input name="smtpPort" type="number" defaultValue={465} />
              </label>
            </div>
            <label
              style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginBottom: 12 }}
            >
              <input type="checkbox" name="predefinita" value="1" />
              Casella predefinita
            </label>
            <button className="btn">Aggiungi casella</button>
          </form>
        </div>
      </div>
    </main>
  )
}
