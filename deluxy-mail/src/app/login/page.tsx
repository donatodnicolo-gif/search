import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { SESSION_COOKIE, EMAIL_COOKIE, sessionToken, emailAmmessa } from '@/lib/auth'

async function login(fd: FormData) {
  'use server'
  const password = process.env.APP_PASSWORD
  const email = String(fd.get('email') ?? '').trim()
  const tentativo = String(fd.get('password') ?? '')

  // Servono entrambi: email autorizzata E password giusta.
  if (!password || tentativo !== password) {
    redirect('/login?errore=password')
  }
  if (!emailAmmessa(email)) {
    redirect('/login?errore=email')
  }

  const jar = await cookies()
  jar.set(SESSION_COOKIE, await sessionToken(password), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 giorni
    path: '/',
  })
  // L'email non è un segreto: la ricordiamo per riproporla al prossimo accesso.
  jar.set(EMAIL_COOKIE, email, {
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 180,
    path: '/',
  })
  redirect('/')
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ errore?: string }>
}) {
  const sp = await searchParams
  const emailRicordata = (await cookies()).get(EMAIL_COOKIE)?.value ?? ''
  const messaggioErrore =
    sp.errore === 'email'
      ? 'Questa email non è abilitata all’accesso.'
      : sp.errore === 'password'
        ? 'Password non corretta.'
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
          La tua posta, letta e ordinata. Accesso riservato.
        </p>
        <form action={login}>
          <input
            type="email"
            name="email"
            required
            autoFocus={!emailRicordata}
            defaultValue={emailRicordata}
            placeholder="La tua email"
            autoComplete="email"
            style={{ textAlign: 'center' }}
          />
          <input
            type="password"
            name="password"
            required
            autoFocus={!!emailRicordata}
            placeholder="Password"
            autoComplete="current-password"
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
            Entra
          </button>
        </form>
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 26 }}>
          Deluxy · 2.0
        </p>
      </div>
    </div>
  )
}
