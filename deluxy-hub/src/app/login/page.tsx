import Link from "next/link";
import { redirect } from "next/navigation";
import { accedi } from "@/lib/actions";
import { sessioneCorrente } from "@/lib/sessione-server";
import { CorniceAccesso } from "./CorniceAccesso";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ errore?: string; da?: string; reimpostata?: string }>;
}) {
  if (await sessioneCorrente()) redirect("/");
  const sp = await searchParams;

  return (
    <CorniceAccesso titolo="Deluxy Hub" sottotitolo="Accedi per vedere le app abilitate per te.">
      {/* Chi arriva dal recupero password deve capire che è andata bene, e che
          ora deve entrare con quella nuova. */}
      {sp.reimpostata && (
        <div className="avviso ok" style={{ textAlign: "left" }}>
          Password aggiornata. Entra con quella nuova.
        </div>
      )}

      <form action={accedi} style={{ textAlign: "left" }}>
        <input type="hidden" name="da" value={sp.da ?? ""} />
        <label className="campo">
          <span>Email</span>
          <input type="email" name="email" required autoFocus autoComplete="username" />
        </label>
        <label className="campo">
          <span>Password</span>
          <input type="password" name="password" required autoComplete="current-password" />
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

      {/* La via d'uscita quando la password non si ricorda: prima non c'era e
          l'unica strada era chiedere a un amministratore. */}
      <p style={{ marginTop: 18, fontSize: 13 }}>
        <Link href="/password-dimenticata" style={{ color: "var(--blue)" }}>
          Password dimenticata?
        </Link>
      </p>
    </CorniceAccesso>
  );
}
