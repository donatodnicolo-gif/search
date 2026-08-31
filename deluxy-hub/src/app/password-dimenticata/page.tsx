import Link from "next/link";
import { redirect } from "next/navigation";
import { chiediRecupero } from "@/lib/recupero-actions";
import { sessioneCorrente } from "@/lib/sessione-server";
import { statoPosta } from "@/lib/posta";
import { CorniceAccesso } from "../login/CorniceAccesso";

// «Ho dimenticato la password», primo tempo: si chiede l'email e parte il link.
// Pagina pubblica (chi la apre non è loggato): è esclusa dal middleware.
export const metadata = { title: "Password dimenticata · Deluxy Hub" };
export const dynamic = "force-dynamic";

export default async function PasswordDimenticataPage({
  searchParams,
}: {
  searchParams: Promise<{ fatto?: string; errore?: string }>;
}) {
  if (await sessioneCorrente()) redirect("/");
  const sp = await searchParams;
  const posta = await statoPosta();

  return (
    <CorniceAccesso
      titolo="Password dimenticata"
      sottotitolo="Ti mandiamo un link per sceglierne una nuova."
    >
      {sp.fatto ? (
        <>
          {/* La stessa risposta per ogni caso: indirizzo sconosciuto, account
              disattivato, troppe richieste o email davvero partita. Da fuori non
              si distinguono, così il modulo non racconta chi lavora in Deluxy. */}
          <div className="avviso ok" style={{ textAlign: "left" }}>
            Se quell&rsquo;indirizzo corrisponde a un account attivo, il link è appena partito.
            Vale <strong>un&rsquo;ora</strong> e si usa una volta sola.
          </div>
          <p className="nota" style={{ textAlign: "left", marginTop: 14 }}>
            Non è arrivato nulla? Controlla la posta indesiderata, oppure chiedi a un
            amministratore di reimpostarla per te.
          </p>
        </>
      ) : (
        <form action={chiediRecupero} style={{ textAlign: "left" }}>
          <label className="campo">
            <span>La tua email</span>
            <input type="email" name="email" required autoFocus autoComplete="username" />
          </label>

          {sp.errore === "email" && (
            <p style={{ color: "var(--red)", fontSize: 13, marginTop: 4 }}>
              Scrivi un indirizzo email valido.
            </p>
          )}

          {!posta.pronta && (
            // Onestà: senza SMTP il link non può partire. Meglio dirlo prima che
            // lasciar aspettare un'email che non arriverà mai.
            <p className="nota" style={{ marginTop: 10 }}>
              ⚠️ La posta del portale non è ancora configurata: finché non lo è, il link non
              può partire. Chiedi a un amministratore di reimpostare la password dal portale.
            </p>
          )}

          <button
            type="submit"
            className="btn primary"
            style={{ width: "100%", marginTop: 10, padding: "12px 18px", justifyContent: "center" }}
          >
            Mandami il link
          </button>
        </form>
      )}

      <p style={{ marginTop: 22, fontSize: 13 }}>
        <Link href="/login" style={{ color: "var(--blue)" }}>
          ← Torna all&rsquo;accesso
        </Link>
      </p>
    </CorniceAccesso>
  );
}
