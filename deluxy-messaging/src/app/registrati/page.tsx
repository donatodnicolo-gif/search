import Link from 'next/link'
import { db } from '@/lib/db'
import { registrati } from '../login/actions'

export const dynamic = 'force-dynamic'

export default async function PaginaRegistrati({
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
            ? 'Prima apertura: il primo account creato è l’amministratore.'
            : 'Crea il tuo account operatore.'}
        </div>

        {errore ? <div className="avviso-errore">{errore}</div> : null}

        <form action={registrati}>
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
            <input
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </label>
          <button className="bottone" style={{ width: '100%', justifyContent: 'center' }}>
            {nessunUtente ? 'Crea l’amministratore e accedi' : 'Crea l’account e accedi'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 0 }}>
          Hai già un account?{' '}
          <Link href="/login" style={{ color: 'var(--text)', textDecoration: 'underline' }}>
            Accedi
          </Link>
        </p>
      </div>
    </div>
  )
}
