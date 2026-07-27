import Link from 'next/link'
import { registrati } from '../login/actions'
import { installazioneVergine, MIN_PASSWORD } from '@/lib/utenti'

export const dynamic = 'force-dynamic'

// ⚠️ Questa pagina serve UNA VOLTA SOLA: a creare il primo amministratore di
// un'installazione nuova. Prima invece restava aperta per sempre, e chiunque
// conoscesse l'indirizzo dell'app poteva farsi un account ed entrare fra gli
// ordini, gli indirizzi e i telefoni dei clienti.
//
// Il cancello vero è nella server action `registrati`, non qui: nascondere il
// modulo non basta, perché la funzione si può chiamare lo stesso. Questo
// controllo serve a non far compilare un form che verrebbe respinto.

export default async function PaginaRegistrati({
  searchParams,
}: {
  searchParams: Promise<{ errore?: string }>
}) {
  const { errore } = await searchParams
  const nessunUtente = await installazioneVergine()

  return (
    <div className="login-sfondo">
      <div className="login-card card">
        <div className="logo">
          Deluxy <span style={{ color: 'var(--gold)' }}>Customer Service</span>
        </div>
        <div className="sotto">
          {nessunUtente
            ? 'Prima apertura: il primo account creato è l’amministratore.'
            : 'Gli accessi li apre un amministratore.'}
        </div>

        {errore ? <div className="avviso-errore">{errore}</div> : null}

        {nessunUtente ? (
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
              <span>Password (minimo {MIN_PASSWORD} caratteri)</span>
              <input
                name="password"
                type="password"
                required
                minLength={MIN_PASSWORD}
                autoComplete="new-password"
              />
            </label>
            <button className="bottone" style={{ width: '100%', justifyContent: 'center' }}>
              Crea l’amministratore e accedi
            </button>
          </form>
        ) : (
          <>
            <p className="descrizione">
              Questa pagina serve una volta sola, per creare il primo amministratore di
              un&apos;installazione nuova. Qui gli utenti ci sono già: per avere un accesso
              chiedilo a chi amministra l&apos;app, che te lo apre dalla pagina <em>Utenti</em>.
            </p>
            <Link
              className="bottone"
              href="/login"
              style={{ width: '100%', justifyContent: 'center' }}
            >
              Torna all’accesso
            </Link>
          </>
        )}

        <p
          style={{
            textAlign: 'center',
            fontSize: 13,
            color: 'var(--text-secondary)',
            marginBottom: 0,
          }}
        >
          Hai già un account?{' '}
          <Link href="/login" style={{ color: 'var(--text)', textDecoration: 'underline' }}>
            Accedi
          </Link>
        </p>
      </div>
    </div>
  )
}
