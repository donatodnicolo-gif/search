import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, sessionToken } from "@/lib/auth";

async function login(fd: FormData) {
  "use server";
  const password = process.env.MERCHANDISING_APP_PASSWORD;
  const tentativo = String(fd.get("password") ?? "");
  // Confronto sugli hash, non sulle stringhe: il confronto JS termina al primo
  // byte diverso e in teoria racconta la password un byte alla volta a chi
  // misura i tempi. Passare dagli hash pareggia lunghezze e contenuto.
  const ok =
    Boolean(password) && (await sessionToken(tentativo)) === (await sessionToken(password as string));
  if (!ok) {
    // Un solo tentativo al secondo: non è un lockout, ma contro una password
    // umana provata dalla rete la differenza fra 1.000 e 1 tentativo/s è tutto.
    await new Promise((r) => setTimeout(r, 1000));
    redirect("/login?errore=1");
  }
  const jar = await cookies();
  jar.set(SESSION_COOKIE, await sessionToken(password as string), {
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
        <div
          className="brand-logo"
          style={{ width: 52, height: 52, fontSize: 30, margin: "0 auto 16px", borderRadius: 14 }}
        >
          D
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.022em" }}>
          Deluxy Merchandising
        </h1>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: "6px 0 22px" }}>
          Collezioni, costi e margini
        </p>
        {sp.errore && <div className="avviso-errore">Password non corretta.</div>}
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
          <button className="btn" type="submit" style={{ width: "100%", padding: "11px" }}>
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
      </div>
    </div>
  );
}
