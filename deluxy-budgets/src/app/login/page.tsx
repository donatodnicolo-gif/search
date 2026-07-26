import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, sessionToken } from "@/lib/auth";
import { segretoAccesso, statoAccesso } from "@/lib/accesso";
import { codiceTotpValido } from "@/lib/totp";

async function login(fd: FormData) {
  "use server";
  const password = process.env.BUDGETS_APP_PASSWORD;
  const tentativo = String(fd.get("password") ?? "");
  if (!password || tentativo !== password) {
    redirect("/login?errore=1");
  }

  // Secondo fattore, se è stato registrato. Lo stato si rilegge qui e non si
  // passa dal modulo: chi manda la richiesta a mano non deve poter dichiarare
  // «da me il codice non serve».
  const stato = await statoAccesso();
  if (stato.obbligatorio) {
    const segreto = await segretoAccesso();
    const codice = String(fd.get("codice") ?? "");
    // Segreto illeggibile (APP_SECRET cambiata): si lascia entrare con la sola
    // password invece di chiudere fuori tutti. È scritto in Configurazione →
    // Accesso, che in quel caso mostra il secondo fattore come non attivo.
    if (segreto && !codiceTotpValido(segreto, codice)) {
      redirect("/login?errore=codice");
    }
  }
  const jar = await cookies();
  jar.set(SESSION_COOKIE, await sessionToken(password), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 giorni
    path: "/",
  });
  redirect("/");
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ errore?: string }>;
}) {
  const sp = await searchParams;
  // Il campo del codice compare solo se il secondo fattore e stato registrato:
  // chiederlo a vuoto insegnerebbe a ignorarlo.
  const stato = await statoAccesso();
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background:
          "radial-gradient(600px 400px at 18% 12%, rgba(184,150,62,0.14), transparent 60%), radial-gradient(700px 500px at 85% 90%, rgba(17,19,24,0.10), transparent 60%), var(--bg)",
        padding: 20,
        zIndex: 50,
      }}
    >
      <div
        style={{
          width: 380,
          maxWidth: "100%",
          background: "var(--surface-translucent)",
          backdropFilter: "blur(30px) saturate(180%)",
          WebkitBackdropFilter: "blur(30px) saturate(180%)",
          border: "1px solid var(--hairline)",
          borderRadius: 24,
          boxShadow: "var(--shadow-float)",
          padding: "40px 36px 30px",
          textAlign: "center",
        }}
      >
        <div
          className="brand-logo"
          style={{ width: 52, height: 52, fontSize: 30, margin: "0 auto 16px", borderRadius: 14 }}
        >
          D
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.022em" }}>Deluxy Budgets</h1>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: "6px 0 22px" }}>
          Budget, P&amp;L e premi
        </p>
        {sp.errore === "codice" ? (
          <div className="avviso-errore">Codice non valido. Controlla l&apos;app di autenticazione: cambia ogni 30 secondi.</div>
        ) : sp.errore ? (
          <div className="avviso-errore">Password non corretta.</div>
        ) : null}
        <form action={login} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            type="password"
            name="password"
            placeholder="Password del team"
            autoFocus
            required
            style={{
              font: "inherit",
              fontSize: 15,
              color: "var(--text)",
              background: "var(--fill)",
              border: "1px solid transparent",
              borderRadius: "var(--radius-m)",
              padding: "11px 14px",
              outline: "none",
            }}
          />
          {stato.obbligatorio && (
            <input
              name="codice"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="Codice a 6 cifre"
              maxLength={6}
              required
              style={{
                font: "inherit",
                fontSize: 15,
                letterSpacing: "0.25em",
                textAlign: "center",
                color: "var(--text)",
                background: "var(--fill)",
                border: "1px solid transparent",
                borderRadius: "var(--radius-m)",
                padding: "11px 14px",
                outline: "none",
              }}
            />
          )}
          <button className="btn" type="submit" style={{ width: "100%", padding: "11px" }}>
            Entra
          </button>
        </form>
      </div>
    </div>
  );
}
