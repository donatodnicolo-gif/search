import { createHash, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authAttiva, creaSessione, DURATA_SESSIONE_S, SESSION_COOKIE } from "@/lib/auth";

// Login con la PASSWORD DELL'APP (PERSONALE_APP_PASSWORD), come le altre app
// Deluxy. Dal Hub si entra anche senza password via /api/sso. Il confronto è a
// tempo costante: un === esce al primo carattere diverso e dal tempo si
// indovina il prefisso una lettera per volta.

function passwordGiusta(candidata: string): boolean {
  const vera = process.env.PERSONALE_APP_PASSWORD ?? "";
  if (!vera) return false;
  const a = createHash("sha256").update(candidata).digest();
  const b = createHash("sha256").update(vera).digest();
  return timingSafeEqual(a, b);
}

async function login(fd: FormData) {
  "use server";
  if (!authAttiva()) redirect("/"); // sviluppo locale senza segreti: aperto

  const password = String(fd.get("password") ?? "");
  if (!passwordGiusta(password)) redirect("/login?errore=1");

  // La password d'app è quella del team: chi la conosce amministra l'organico.
  const token = await creaSessione({ email: "", nome: "Team Deluxy", ruolo: "admin" });
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
    <div className="login-sfondo">
      <div className="login-card">
        <div className="brand-logo" style={{ width: 52, height: 52, fontSize: 30, margin: "0 auto 16px", borderRadius: 14 }}>
          D
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.022em" }}>Deluxy Personale</h1>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", marginTop: 6, marginBottom: 24 }}>
          Organico, mansioni, inquadramenti e retribuzioni.
        </p>
        <form action={login}>
          <input
            type="password"
            name="password"
            required
            autoFocus
            placeholder="Password dell'app"
            autoComplete="current-password"
            style={{ textAlign: "center" }}
          />
          {sp.errore && (
            <p style={{ color: "var(--red)", fontSize: 13, marginTop: 10 }}>Password non corretta.</p>
          )}
          <button type="submit" className="btn" style={{ width: "100%", marginTop: 16, padding: "12px 18px" }}>
            Entra
          </button>
        </form>
        <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 26 }}>
          Dal Deluxy Hub si entra senza password. Consegne in guanti bianchi, dal 2019.
        </p>
      </div>
    </div>
  );
}
