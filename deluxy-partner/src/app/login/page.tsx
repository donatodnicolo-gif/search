import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { SESSION_COOKIE, sessionToken } from "@/lib/auth";
import { registraAccesso } from "@/lib/accessi";

async function login(fd: FormData) {
  "use server";
  const password = process.env.PARTNER_APP_PASSWORD;
  const readonly = process.env.PARTNER_APP_PASSWORD_READONLY;
  const tentativo = String(fd.get("password") ?? "");
  // accetta la password piena o quella di sola lettura; il cookie codifica il ruolo
  const usata = password && tentativo === password ? password : readonly && tentativo === readonly ? readonly : null;
  const intestazioni = await headers();
  if (!usata) {
    // Anche i tentativi sbagliati finiscono nel registro accessi: sono il solo
    // segnale che qualcuno sta provando a entrare. Non si annota la password
    // tentata — servirebbe a niente e sarebbe un segreto scritto nel database.
    await registraAccesso({ utente: "Sconosciuto", via: "password", esito: "fallito" }, intestazioni);
    redirect("/login?errore=1");
  }
  const ruolo = usata === password ? "admin" : "sola_lettura";
  await registraAccesso(
    { utente: ruolo === "admin" ? "Accesso a password" : "Accesso sola lettura", ruolo, via: "password" },
    intestazioni
  );
  const jar = await cookies();
  jar.set(SESSION_COOKIE, await sessionToken(usata), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 giorni
    path: "/",
  });
  // Login a password: non c'è un nome persona. Rimuovi un eventuale nome SSO
  // rimasto, così il registro modifiche non attribuisce le azioni a chi non è.
  jar.delete("dp_utente");
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
        <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.022em" }}>Deluxy Partner</h1>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", marginTop: 6, marginBottom: 24 }}>
          Gestione finanziaria partner. Accesso riservato al team.
        </p>
        <form action={login}>
          <input
            type="password"
            name="password"
            required
            autoFocus
            placeholder="Password"
            style={{ textAlign: "center" }}
          />
          {sp.errore && (
            <p style={{ color: "var(--red)", fontSize: 13, marginTop: 10 }}>Password non corretta.</p>
          )}
          <button type="submit" className="btn primary" style={{ width: "100%", marginTop: 16, padding: "12px 18px", justifyContent: "center" }}>
            Entra
          </button>
        </form>
        <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 26 }}>
          Consegne in guanti bianchi, dal 2019.
        </p>
      </div>
    </div>
  );
}
