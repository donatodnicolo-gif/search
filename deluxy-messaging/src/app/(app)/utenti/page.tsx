import { db } from '@/lib/db'
import { utenteCorrente } from '@/lib/sessione'
import { RUOLI, MIN_PASSWORD, nomeRuolo } from '@/lib/utenti'
import { creaUtente, cambiaRuolo, cambiaPassword, eliminaUtente } from './actions'

export const dynamic = 'force-dynamic'

// Chi può entrare nell'app. Solo gli amministratori vedono e usano questa
// pagina; il controllo vero però sta nelle server action (actions.ts), perché
// nascondere un bottone non impedisce di chiamare la funzione che ci sta sotto.

export default async function PaginaUtenti({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; errore?: string }>
}) {
  const { ok, errore } = await searchParams
  const io = await utenteCorrente()
  const amministratore = io?.ruolo === 'admin'

  const utenti = await db.utente.findMany({
    orderBy: [{ ruolo: 'asc' }, { nome: 'asc' }],
    select: { id: true, nome: true, email: true, ruolo: true, creatoIl: true },
  })
  const quantiAdmin = utenti.filter((u) => u.ruolo === 'admin').length

  if (!amministratore) {
    return (
      <main>
        <h1 className="page-title">Utenti</h1>
        <div className="card" style={{ maxWidth: 640 }}>
          <p className="descrizione" style={{ marginBottom: 0 }}>
            Gli account di accesso li gestisce un <strong>amministratore</strong>. Il tuo è un
            account operatore: puoi usare tutta l&apos;app, ma non aprire o chiudere accessi. Se ti
            serve un account per un collega, chiedilo a chi amministra.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main>
      <div className="page-head">
        <div>
          <h1 className="page-title">Utenti</h1>
          <p className="page-sub">
            Chi può entrare in Deluxy Customer Service. Da qui si aprono gli account dei colleghi,
            si cambia la password a chi l&apos;ha persa e si chiude l&apos;accesso a chi non
            lavora più con noi.
          </p>
        </div>
      </div>

      {ok ? <div className="avviso-ok">{ok}</div> : null}
      {errore ? <div className="avviso-errore">{errore}</div> : null}

      <div className="card" style={{ maxWidth: 760 }}>
        <h2 style={{ marginTop: 0 }}>Apri un account</h2>
        <p className="descrizione">
          La password la scegli tu e <strong>gliela comunichi di persona</strong>: l&apos;app non
          manda email. Chi entra può cambiarla chiedendotela di nuovo.
        </p>
        <form action={creaUtente}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label className="campo">
              <span>Nome e cognome</span>
              <input name="nome" placeholder="Giulia Rossi" required />
            </label>
            <label className="campo">
              <span>Email (è con questa che accede)</span>
              <input name="email" type="email" placeholder="giulia@deluxy.it" required />
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label className="campo">
              <span>Password (almeno {MIN_PASSWORD} caratteri)</span>
              <input
                name="password"
                type="text"
                minLength={MIN_PASSWORD}
                placeholder="scegline una e comunicagliela"
                autoComplete="off"
                required
              />
            </label>
            <label className="campo">
              <span>Ruolo</span>
              <select name="ruolo" defaultValue="operatore">
                {RUOLI.map((r) => (
                  <option key={r.chiave} value={r.chiave}>
                    {r.nome}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="descrizione" style={{ marginTop: -4 }}>
            {RUOLI.map((r) => `${r.nome}: ${r.spiega}`).join(' ')}
          </p>
          <button className="btn">Apri l’account</button>
        </form>
      </div>

      <div className="tabella-wrap" style={{ marginTop: 20 }}>
        <table>
          <thead>
            <tr>
              <th>Persona</th>
              <th>Ruolo</th>
              <th>Dal</th>
              <th>Password</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {utenti.map((u) => {
              const ultimoAdmin = u.ruolo === 'admin' && quantiAdmin === 1
              const sonoIo = u.id === io?.id
              return (
                <tr key={u.id}>
                  <td>
                    <div className="cella-nome">
                      {u.nome}
                      {sonoIo ? (
                        <span className="cella-sub" style={{ display: 'inline', marginLeft: 8 }}>
                          (sei tu)
                        </span>
                      ) : null}
                    </div>
                    <div className="cella-sub">{u.email}</div>
                  </td>
                  <td>
                    <form action={cambiaRuolo} style={{ display: 'flex', gap: 6 }}>
                      <input type="hidden" name="id" value={u.id} />
                      <select name="ruolo" defaultValue={u.ruolo} disabled={ultimoAdmin}>
                        {RUOLI.map((r) => (
                          <option key={r.chiave} value={r.chiave}>
                            {r.nome}
                          </option>
                        ))}
                      </select>
                      <button className="btn btn-secondario small" disabled={ultimoAdmin}>
                        Salva
                      </button>
                    </form>
                    {ultimoAdmin ? (
                      <div className="cella-sub" style={{ maxWidth: 220 }}>
                        Unico amministratore: il ruolo non si può cambiare, altrimenti nessuno
                        potrebbe più aprire account.
                      </div>
                    ) : null}
                  </td>
                  <td className="cella-muta" style={{ whiteSpace: 'nowrap' }}>
                    {u.creatoIl.toLocaleDateString('it-IT', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </td>
                  <td>
                    <form action={cambiaPassword} style={{ display: 'flex', gap: 6 }}>
                      <input type="hidden" name="id" value={u.id} />
                      <input
                        name="password"
                        type="text"
                        minLength={MIN_PASSWORD}
                        placeholder="nuova password"
                        autoComplete="off"
                        style={{ width: 170 }}
                      />
                      <button className="btn btn-secondario small">Cambia</button>
                    </form>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {sonoIo || ultimoAdmin ? (
                      <span className="cella-sub">
                        {sonoIo ? 'non puoi togliere te stesso' : 'ultimo amministratore'}
                      </span>
                    ) : (
                      <form action={eliminaUtente}>
                        <input type="hidden" name="id" value={u.id} />
                        <button className="btn btn-secondario small" style={{ color: 'var(--red)' }}>
                          Togli l’accesso
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginTop: 18, maxWidth: 760 }}>
        <h2 style={{ marginTop: 0, fontSize: 15 }}>La registrazione libera è chiusa</h2>
        <p className="descrizione" style={{ marginBottom: 0 }}>
          Fino a poco fa chiunque conoscesse l&apos;indirizzo di questa app poteva crearsi un
          account da solo ed entrare: dentro ci sono nomi, indirizzi, telefoni ed email dei
          clienti, i reclami e i rimborsi. Ora la pagina di registrazione funziona{' '}
          <strong>solo su un&apos;installazione senza nessun utente</strong>, per creare il primo
          amministratore. Tutti gli altri accessi si aprono da qui.
        </p>
      </div>
    </main>
  )
}
