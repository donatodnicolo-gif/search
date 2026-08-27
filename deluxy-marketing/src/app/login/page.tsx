import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, sessionToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function login(fd: FormData) {
  "use server";
  const password = process.env.MARKETING_APP_PASSWORD;
  const tentativo = String(fd.get("password") ?? "");
  if (!password || tentativo !== password) {
    // ⚠️ Mezzo secondo di attesa sul tentativo sbagliato (27/08/2026,
    // revisione di sicurezza). Qui non si contano i tentativi e non si blocca
    // nessuno: la password è UNA e vale per tutto il team, quindi un blocco
    // per IP chiuderebbe fuori l'ufficio intero, e un contatore condiviso
    // vorrebbe stato sul Postgres di produzione per un'app con un utente.
    //
    // ⚠️ E va detto che questo è mezzo rimedio: su Vercel chi parallelizza su
    // cento invocazioni si riprende quello che il ritardo gli toglie. Serve
    // contro lo script ingenuo, non contro chi ci tiene. La difesa vera è la
    // LUNGHEZZA della password: se è una parola, questa riga non la salva.
    await new Promise((r) => setTimeout(r, 700));
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

export default async function PaginaLogin({
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
        <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.022em" }}>Deluxy Marketing</h1>
        <p style={{ color: "var(--text-secondary)", fontSize: 14, marginTop: 6, marginBottom: 22 }}>
          Analisi, azioni e campagne ADV
        </p>

        <form action={login} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            name="password"
            type="password"
            required
            autoFocus
            placeholder="Password"
            autoComplete="current-password"
            style={{
              font: "inherit",
              padding: "11px 14px",
              borderRadius: 12,
              border: "1px solid var(--hairline-strong)",
              background: "var(--surface)",
              color: "var(--text)",
              outline: "none",
              textAlign: "center",
            }}
          />
          <button className="btn" type="submit" style={{ justifyContent: "center" }}>
            Entra
          </button>
        </form>

        {sp.errore && (
          <p style={{ color: "var(--red)", fontSize: 13, marginTop: 14 }}>
            Password errata: riprova.
          </p>
        )}
      </div>
    </div>
  );
}
