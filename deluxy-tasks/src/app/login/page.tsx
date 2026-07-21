import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { creaSessione, DURATA_SESSIONE_S, SESSION_COOKIE } from "@/lib/auth";
import { autenticaUtenteHub } from "@/lib/hub-utenti";

async function login(fd: FormData) {
  "use server";
  // Auth disattivata (sviluppo senza segreto): entra e basta.
  if (!process.env.TASKS_SESSION_SECRET) redirect("/");

  const email = String(fd.get("email") ?? "").trim();
  const password = String(fd.get("password") ?? "");
  const utente = await autenticaUtenteHub(email, password);
  if (!utente) redirect("/login?errore=1");

  const token = await creaSessione({ email: utente.email, nome: utente.nome, ruolo: utente.ruolo });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: DURATA_SESSIONE_S,
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
        <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.022em" }}>Deluxy Tasks</h1>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", marginTop: 6, marginBottom: 24 }}>
          Accedi con le tue credenziali del Deluxy Hub.
        </p>
        <form action={login}>
          <input
            type="email"
            name="email"
            required
            autoFocus
            placeholder="Email"
            autoComplete="username"
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
              marginBottom: 10,
            }}
          />
          <input
            type="password"
            name="password"
            required
            placeholder="Password"
            autoComplete="current-password"
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
            <p style={{ color: "var(--red)", fontSize: 13, marginTop: 10 }}>Email o password non corretti.</p>
          )}
          <button type="submit" className="btn" style={{ width: "100%", marginTop: 16, padding: "12px 18px" }}>
            Entra
          </button>
        </form>
        <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 26 }}>
          Stesse credenziali del portale. Le API /api/v1 usano le chiavi delle app.
        </p>
      </div>
    </div>
  );
}
