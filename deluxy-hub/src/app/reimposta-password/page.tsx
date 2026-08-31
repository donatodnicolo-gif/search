import Link from "next/link";
import { redirect } from "next/navigation";
import { reimpostaPassword } from "@/lib/recupero-actions";
import { leggiTokenRecupero, MIN_PASSWORD } from "@/lib/recupero-password";
import { sessioneCorrente } from "@/lib/sessione-server";
import { CorniceAccesso } from "../login/CorniceAccesso";

// «Ho dimenticato la password», secondo tempo: si arriva col token nell'URL e
// si sceglie la password nuova. Pagina pubblica, esclusa dal middleware.
export const metadata = { title: "Nuova password · Deluxy Hub" };
export const dynamic = "force-dynamic";

const MESSAGGI: Record<string, string> = {
  diverse: "Le due password non coincidono.",
  corta: `Serve una password di almeno ${MIN_PASSWORD} caratteri.`,
  comune: "Questa password è fra le più usate al mondo: scegline un'altra.",
  "contiene-email": "Non usare la tua email dentro la password.",
  "contiene-nome": "Non usare il tuo nome dentro la password.",
};

export default async function ReimpostaPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; errore?: string }>;
}) {
  if (await sessioneCorrente()) redirect("/");
  const sp = await searchParams;
  const token = sp.token ?? "";

  // Il token si controlla PRIMA di mostrare il form: un link vecchio non deve
  // far scrivere una password per poi dire di no alla fine.
  const esito = await leggiTokenRecupero(token);

  if (!esito.valido) {
    return (
      <CorniceAccesso
        titolo="Link non più valido"
        sottotitolo="Succede: i link durano un'ora e si usano una volta sola."
      >
        <div className="avviso errore" style={{ textAlign: "left" }}>
          Questo link è scaduto, è già stato usato, oppure non è corretto.
        </div>
        <p style={{ marginTop: 18, fontSize: 13 }}>
          <Link href="/password-dimenticata" style={{ color: "var(--blue)" }}>
            Chiedine uno nuovo →
          </Link>
        </p>
      </CorniceAccesso>
    );
  }

  return (
    <CorniceAccesso titolo="Scegli la nuova password" sottotitolo={`Per ${esito.nome}.`}>
      <form action={reimpostaPassword} style={{ textAlign: "left" }}>
        <input type="hidden" name="token" value={token} />
        <label className="campo">
          <span>Nuova password (almeno {MIN_PASSWORD} caratteri)</span>
          <input
            type="password"
            name="password"
            required
            minLength={MIN_PASSWORD}
            autoFocus
            autoComplete="new-password"
          />
        </label>
        <label className="campo">
          <span>Ripetila</span>
          <input type="password" name="conferma" required autoComplete="new-password" />
        </label>

        {sp.errore && MESSAGGI[sp.errore] && (
          <p style={{ color: "var(--red)", fontSize: 13, marginTop: 4 }}>{MESSAGGI[sp.errore]}</p>
        )}

        <p className="nota" style={{ marginTop: 10 }}>
          Una frase lunga che ricordi è meglio di otto caratteri strani. Salvando, ogni accesso
          già aperto col tuo account viene chiuso.
        </p>

        <button
          type="submit"
          className="btn primary"
          style={{ width: "100%", marginTop: 10, padding: "12px 18px", justifyContent: "center" }}
        >
          Salva la password
        </button>
      </form>
    </CorniceAccesso>
  );
}
