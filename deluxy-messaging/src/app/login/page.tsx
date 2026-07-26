import Link from 'next/link'
import { db } from '@/lib/db'
import { entra } from './actions'

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
          Deluxy <span style={{ color: 'var(--gold)' }}>Customer Service</span>
        </div>
        <div className="sotto">
          Reclami, ordini e messaggi dei clienti in un posto solo.
        </div>

        {errore ? <div className="avviso-errore">{errore}</div> : null}
        {nessunUtente ? (
          <div className="avviso-ok">
            Prima apertura: non esiste ancora nessun utente.{' '}
            <Link href="/registrati" style={{ textDecoration: 'underline' }}>
              Registrati
            </Link>{' '}
            per creare l&apos;amministratore.
          </div>
        ) : null}

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

        <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 0 }}>
          Non hai un account?{' '}
          <Link href="/registrati" style={{ color: 'var(--text)', textDecoration: 'underline' }}>
            Registrati
          </Link>
        </p>
      </div>
    </div>
  )
}
