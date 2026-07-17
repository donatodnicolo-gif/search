import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, sessionToken } from "@/lib/auth";

async function login(fd: FormData) {
  "use server";
  const password = process.env.ANAGRAFICHE_APP_PASSWORD;
  const tentativo = String(fd.get("password") ?? "");
  if (!password || tentativo !== password) {
    redirect("/login?errore=1");
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
