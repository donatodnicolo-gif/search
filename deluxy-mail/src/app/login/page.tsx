import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import { EMAIL_COOKIE } from '@/lib/auth'
import { accedi, creaPrimoAdmin } from '@/lib/auth-actions'

export const dynamic = 'force-dynamic'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ errore?: string }>
}) {
  const sp = await searchParams
  // Primo avvio: se non c'è nessun utente, la login diventa "crea il primo
  // amministratore". Così il sistema parte senza porte di servizio.
  const nessunUtente = (await db.utente.count().catch(() => 1)) === 0
  const emailRicordata = (await cookies()).get(EMAIL_COOKIE)?.value ?? ''

  const messaggioErrore =
    sp.errore === 'dati'
      ? 'Controlla i dati: email valida e password di almeno 6 caratteri.'
      : sp.errore
        ? 'Email o password non corretti.'
        : null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background:
          'radial-gradient(600px 400px at 18% 12%, rgba(184,150,62,0.14), transparent 60%), radial-gradient(700px 500px at 85% 90%, rgba(17,19,24,0.10), transparent 60%), var(--bg)',
        padding: 20,
        zIndex: 50,
      }}
    >
      <div
        style={{
          width: 380,
          maxWidth: '100%',
          background: 'var(--surface-translucent)',
          backdropFilter: 'blur(30px) saturate(180%)',
          WebkitBackdropFilter: 'blur(30px) saturate(180%)',
          border: '1px solid var(--hairline)',
          borderRadius: 24,
          boxShadow: 'var(--shadow-float)',
          padding: '40px 36px 30px',
          textAlign: 'center',
        }}
      >
        <div
          className="brand-logo"
          style={{ width: 52, height: 52, fontSize: 30, margin: '0 auto 16px', borderRadius: 14 }}
        >
          D
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-0.022em' }}>AI Mail</h1>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 6, marginBottom: 24 }}>
          {nessunUtente
            ? 'Primo avvio: crea l’amministratore.'
            : 'La posta aziendale, letta e ordinata.'}
        </p>

        <form action={nessunUtente ? creaPrimoAdmin : accedi}>
          {nessunUtente && (
            <input
              type="text"
              name="nome"
              required
              placeholder="Il tuo nome"
              style={{ textAlign: 'center', marginBottom: 10 }}
            />
          )}
          <input
            type="email"
            name="email"
            required
            autoFocus={!emailRicordata || nessunUtente}
            defaultValue={nessunUtente ? '' : emailRicordata}
            placeholder="Email"
            autoComplete="email"
            style={{ textAlign: 'center' }}
          />
          <input
            type="password"
            name="password"
            required
            autoFocus={!!emailRicordata && !nessunUtente}
            placeholder={nessunUtente ? 'Scegli una password (min 6)' : 'Password'}
            autoComplete={nessunUtente ? 'new-password' : 'current-password'}
            style={{ textAlign: 'center', marginTop: 10 }}
          />
          {messaggioErrore && (
            <p style={{ color: 'var(--red)', fontSize: 13, marginTop: 10 }}>{messaggioErrore}</p>
          )}
          <button
            type="submit"
            className="btn primary"
            style={{ width: '100%', marginTop: 16, padding: '12px 18px', justifyContent: 'center' }}
          >
            {nessunUtente ? 'Crea amministratore' : 'Entra'}
          </button>
        </form>
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 26 }}>Deluxy · 2.0</p>
      </div>
    </div>
  )
}
