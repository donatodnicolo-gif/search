import { db } from '@/lib/db'
import { creaPrimoAdmin, entra } from './actions'

export const dynamic = 'force-dynamic'

export default async function PaginaLogin({
  searchParams,
}: {
  searchParams: Promise<{ errore?: string }>
}) {
  const { errore } = await searchParams
  const nessunUtente = (await db.utente.count()) === 0

  return (
    <div className="login-sfondo">
      <div className="login-card card">
        <div className="logo">
          Deluxy <span style={{ color: 'var(--gold)' }}>Messaggi</span>
        </div>
        <div className="sotto">
          {nessunUtente
            ? 'Prima apertura: crea l’amministratore.'
            : 'WhatsApp, Messenger, Instagram e chat del sito in un posto solo.'}
        </div>

        {errore ? <div className="avviso-errore">{errore}</div> : null}

        {nessunUtente ? (
          <form action={creaPrimoAdmin}>
            <label className="campo">
              <span>Nome</span>
              <input name="nome" required autoComplete="name" />
            </label>
            <label className="campo">
              <span>Email</span>
              <input name="email" type="email" required autoComplete="email" />
            </label>
            <label className="campo">
              <span>Password (minimo 8 caratteri)</span>
              <input name="password" type="password" required minLength={8} autoComplete="new-password" />
            </label>
            <button className="bottone" style={{ width: '100%', justifyContent: 'center' }}>
              Crea e accedi
            </button>
          </form>
        ) : (
          <form action={entra}>
            <label className="campo">
              <span>Email</span>
              <input name="email" type="email" required autoComplete="email" />
            </label>
            <label className="campo">
              <span>Password</span>
              <input name="password" type="password" required autoComplete="current-password" />
            </label>
            <button className="bottone" style={{ width: '100%', justifyContent: 'center' }}>
              Accedi
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
