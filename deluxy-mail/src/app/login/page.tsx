import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import { EMAIL_COOKIE } from '@/lib/auth'
import { accedi, creaPrimoAdmin } from '@/lib/auth-actions'

export const dynamic = 'force-dynamic'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ errore?: string; dopo?: string }>
}) {
  const sp = await searchParams
  // Solo un percorso interno: un `dopo` che punta fuori sarebbe un redirect
  // aperto (stesso controllo del middleware, ripetuto qui perché questo valore
  // finisce in un form e chiunque può cambiarlo).
  const dopo = sp.dopo && sp.dopo.startsWith('/') && !sp.dopo.startsWith('//') ? sp.dopo : ''
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
    <div className="login-scrim">
      <div className="login-card">
        <div className="brand-logo login-logo">D</div>
        <h1 className="login-titolo">AI Mail</h1>
        <p className="login-sub">
          {nessunUtente
            ? 'Primo avvio: crea l’amministratore.'
            : 'La posta aziendale, letta e ordinata.'}
        </p>

        <form action={nessunUtente ? creaPrimoAdmin : accedi}>
          {/* Dove tornare dopo il login: lo mette il middleware quando ti ha
              fermato su una pagina precisa (es. una mail già compilata aperta
              da un'altra app Deluxy). */}
          {dopo && <input type="hidden" name="dopo" value={dopo} />}
          {/* Campi raggruppati in un contenitore unico con divisori hairline
              (Libro §11): l'anello oro nasce sul gruppo, non sul singolo campo. */}
          <div className="login-campi">
            {nessunUtente && (
              <input type="text" name="nome" required placeholder="Il tuo nome" autoComplete="name" />
            )}
            <input
              type="email"
              name="email"
              required
              autoFocus={!emailRicordata || nessunUtente}
              defaultValue={nessunUtente ? '' : emailRicordata}
              placeholder="Email"
              autoComplete="email"
            />
            <input
              type="password"
              name="password"
              required
              autoFocus={!!emailRicordata && !nessunUtente}
              placeholder={nessunUtente ? 'Scegli una password (min 6)' : 'Password'}
              autoComplete={nessunUtente ? 'new-password' : 'current-password'}
            />
          </div>
          {messaggioErrore && <p className="login-errore">{messaggioErrore}</p>}
          <button type="submit" className="btn primary login-cta">
            {nessunUtente ? 'Crea amministratore' : 'Entra'}
          </button>
        </form>
        <p className="login-footnote">Consegne in guanti bianchi, dal 2019.</p>
      </div>
    </div>
  )
}
