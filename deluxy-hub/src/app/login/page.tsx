import { redirect } from "next/navigation";
import { accedi } from "@/lib/actions";
import { sessioneCorrente } from "@/lib/sessione-server";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ errore?: string; da?: string }>;
}) {
  if (await sessioneCorrente()) redirect("/");
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
        <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.022em" }}>Deluxy Hub</h1>
        <p
          style={{
            fontSize: 14,
            color: "var(--text-secondary)",
            marginTop: 6,
            marginBottom: 24,
          }}
        >
          Accedi per vedere le app abilitate per te.
        </p>

        <form action={accedi} style={{ textAlign: "left" }}>
          <input type="hidden" name="da" value={sp.da ?? ""} />
          <label className="campo">
            <span>Email</span>
            <input type="email" name="email" required autoFocus autoComplete="username" />
          </label>
          <label className="campo">
            <span>Password</span>
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
            />
          </label>

          {sp.errore && (
            <p style={{ color: "var(--red)", fontSize: 13, marginTop: 4 }}>
              Email o password non corrette.
            </p>
          )}

          <button
            type="submit"
            className="btn primary"
            style={{ width: "100%", marginTop: 10, padding: "12px 18px", justifyContent: "center" }}
          >
            Entra
          </button>
        </form>

        <p
          style={{
            fontSize: 12,
            color: "var(--text-tertiary)",
            marginTop: 26,
            textAlign: "center",
          }}
        >
          Consegne in guanti bianchi, dal 2019.
        </p>
      </div>
    </div>
  );
}
