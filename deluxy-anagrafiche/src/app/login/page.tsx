import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DURATA_SESSIONE_MS, SESSION_COOKIE, passwordCorretta, sessionToken } from "@/lib/auth";

async function login(fd: FormData) {
  "use server";
  const password = process.env.ANAGRAFICHE_APP_PASSWORD;
  const tentativo = String(fd.get("password") ?? "");
  // ⚠️ Confronto a tempo costante: vedi `passwordCorretta` in lib/auth.
  if (!password || !passwordCorretta(tentativo, password)) {
    // ⚠️ Un piccolo ritardo su OGNI tentativo sbagliato. Non è un vero freno
    // — quello richiede uno stato condiviso, e qui le funzioni sono
    // indipendenti — ma alza il costo di chi prova a raffica, e non si nota
    // quando si sbaglia a digitare. Il freno vero è il login dall'Hub.
    await new Promise((r) => setTimeout(r, 400));
    redirect("/login?errore=1");
  }
  const jar = await cookies();
  jar.set(SESSION_COOKIE, await sessionToken(password), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    // La scadenza vera è dentro il valore firmato: questa è solo la pulizia
    // lato browser, e deve dire la stessa cosa.
    maxAge: DURATA_SESSIONE_MS / 1000,
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
        <div className="brand-logo" style={{ width: 52, height: 52, fontSize: 30, margin: "0 auto 16px", borderRadius: 14 }}>
          D
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.022em" }}>Deluxy Anagrafiche</h1>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", marginTop: 6, marginBottom: 24 }}>
          Registro centralizzato partner B2B. Accesso riservato al team.
        </p>
        <form action={login}>
          <input
            type="password"
            name="password"
            required
            autoFocus
            placeholder="Password"
            style={{
              width: "100%",
              textAlign: "center",
              font: "inherit",
              color: "var(--text)",
              background: "var(--fill)",
              border: "1px solid transparent",
              borderRadius: "var(--radius-m)",
              padding: "10px 12px",
              outline: "none",
            }}
          />
          {sp.errore && (
            <p style={{ color: "var(--red)", fontSize: 13, marginTop: 10 }}>Password non corretta.</p>
          )}
          <button type="submit" className="btn" style={{ width: "100%", marginTop: 16, padding: "12px 18px" }}>
            Entra
          </button>
        </form>
        <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 26 }}>
          Le API /api/v1 usano le chiavi delle app, non questa password.
        </p>
      </div>
    </div>
  );
}
