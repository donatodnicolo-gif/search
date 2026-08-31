import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authAttiva, creaSessione, DURATA_SESSIONE_S, SESSION_COOKIE, verificaPasswordTeam } from "@/lib/auth";

export const dynamic = "force-dynamic";

// La porta dell'app: la password di team (CRM_APP_PASSWORD), come Orders e
// Scripts. Dal Deluxy Hub si entra senza digitarla (SSO su /api/sso). Il CRM
// non tiene utenti propri: gli utenti vivono nel Hub.
async function login(fd: FormData) {
  "use server";
  if (!authAttiva()) redirect("/");

  const password = String(fd.get("password") ?? "");
  if (!(await verificaPasswordTeam(password))) redirect("/login?errore=1");

  const token = await creaSessione({ nome: "Team Deluxy", ruolo: "admin", via: "password" });
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

export default async function Login({ searchParams }: { searchParams: Promise<{ errore?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="login-sfondo">
      <div className="login-card">
        <div className="brand-logo">D</div>
        <h1>Deluxy CRM</h1>
        <p className="sotto">Il libro dei clienti: entra con la password del team, o direttamente dal Deluxy Hub.</p>
        <form action={login}>
          <div className="campo">
            <input type="password" name="password" placeholder="Password del team" autoFocus required />
          </div>
          {sp.errore ? (
            <p style={{ color: "var(--red)", fontSize: 13, marginBottom: 12 }}>Password sbagliata: riprova.</p>
          ) : null}
          <button className="btn" type="submit" style={{ width: "100%" }}>
            Entra
          </button>
        </form>

        {/* Non c'e' un link da mandare: questa app ha UNA password di squadra,
            non account personali. Dirlo e' l'unica risposta onesta - un
            «recupera password» qui potrebbe soltanto fingere. */}
        <details style={{ marginTop: 14, textAlign: "left" }}>
          <summary style={{ fontSize: 13, color: "var(--text-secondary)", cursor: "pointer" }}>
            Password dimenticata?
          </summary>
          <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginTop: 8, lineHeight: 1.5 }}>
            Qui si entra con una sola password, valida per tutto il team: non è legata a un
            indirizzo email, quindi non esiste un link da mandarti. Chiedila a chi amministra
            le app Deluxy.
          </p>
        </details>
        <p className="footnote">Consegne in guanti bianchi, dal 2019.</p>
      </div>
    </div>
  );
}
