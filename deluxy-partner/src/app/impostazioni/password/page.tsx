import Link from "next/link";
import { cookies } from "next/headers";
import { SESSION_COOKIE, sessioneCorrente } from "@/lib/auth";
import { cambiaPasswordPropria } from "@/lib/utenti-actions";

export const dynamic = "force-dynamic";

// Cambio della PROPRIA password. Serve soprattutto dopo il primo accesso: la
// password iniziale la sceglie l'amministratore e gliela dice a voce, quindi
// finché non la si cambia la conoscono in due.

export default async function PasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ errore?: string; ok?: string }>;
}) {
  const sp = await searchParams;
  const jar = await cookies();
  const s = await sessioneCorrente(jar.get(SESSION_COOKIE)?.value);
  const conAccount = s?.tipo === "utente" && s.via === "email";

  return (
    <>
      <div className="page-head">
        <div>
          <Link href="/impostazioni" className="btn secondary small" style={{ marginBottom: 10 }}>← Impostazioni</Link>
          <h1 className="page-title">La mia password</h1>
          <p className="page-caption">
            {conAccount
              ? `Account ${s.email}. La nuova password vale solo per te: nessun altro accesso cambia.`
              : "Cambio della password del proprio account personale."}
          </p>
        </div>
      </div>

      {sp.errore && (
        <div className="card" style={{ padding: 14, marginBottom: 16, borderLeft: "3px solid var(--red)" }}>
          <span style={{ color: "var(--red)", fontSize: 14 }}>{sp.errore}</span>
        </div>
      )}
      {sp.ok && (
        <div className="card" style={{ padding: 14, marginBottom: 16 }}>
          <span className="badge green"><span className="dot" />{sp.ok}</span>
        </div>
      )}

      {!conAccount ? (
        // Chi entra dal Hub ha la password lì; chi usa quella di team non ha
        // proprio un account. Dirlo è più utile di un form che non può funzionare.
        <div className="card" style={{ padding: 18, borderLeft: "3px solid var(--orange)" }}>
          <strong style={{ fontSize: 14 }}>Qui non c&apos;è una password da cambiare</strong>
          <p style={{ fontSize: 13.5, color: "var(--text-secondary)", marginTop: 8, marginBottom: 0, lineHeight: 1.6 }}>
            {s?.tipo === "utente" && s.via === "sso" ? (
              <>
                Sei entrato dal <strong>portale Hub</strong>: la tua password è quella del portale e si cambia da lì.
              </>
            ) : (
              <>
                Sei entrato con la <strong>password di team</strong>, che non appartiene a una persona: si cambia su
                Vercel (<code>PARTNER_APP_PASSWORD</code>) e cambiarla scollega tutti. Per avere una password tua,
                fatti creare un account in <Link href="/impostazioni/utenti" style={{ color: "var(--blue)" }}>Impostazioni → Utenti</Link>.
              </>
            )}
          </p>
        </div>
      ) : (
        <div className="card" style={{ maxWidth: 520 }}>
          <form action={cambiaPasswordPropria}>
            <input type="hidden" name="username" value={s.email} autoComplete="username" />
            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <label className="field-label">Password attuale</label>
                <input type="password" name="attuale" required autoComplete="current-password" autoFocus />
              </div>
              <div>
                <label className="field-label">Nuova password</label>
                <input type="password" name="nuova" required autoComplete="new-password" placeholder="almeno 10 caratteri, con una cifra" />
              </div>
              <div>
                <label className="field-label">Ripeti la nuova password</label>
                <input type="password" name="conferma" required autoComplete="new-password" />
              </div>
            </div>
            <div className="form-footer" style={{ marginTop: 18 }}>
              <button type="submit" className="btn primary small">Cambia password</button>
            </div>
          </form>
          <p className="muted" style={{ fontSize: 12, marginTop: 14, marginBottom: 0, lineHeight: 1.6 }}>
            Le sessioni già aperte (anche su altri dispositivi) <strong>restano valide</strong> fino alla loro
            scadenza: la password non è dentro il cookie. Se temi che qualcuno sia entrato col tuo account,
            cambia la password e avvisa un amministratore, che può disattivarlo.
          </p>
        </div>
      )}
    </>
  );
}
