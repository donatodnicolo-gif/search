import Link from "next/link";
import { redirect } from "next/navigation";
import { authAttiva } from "@/lib/auth";
import { reimpostaPasswordConLink } from "@/lib/password-actions";
import { leggiTokenReset, MIN_PASSWORD } from "@/lib/password-team";

// «Password dimenticata?», secondo tempo: si arriva col token nell'URL e si
// sceglie la password nuova del team. Pagina pubblica, esclusa dal
// middleware: la sua unica porta è il token.
export const metadata = { title: "Nuova password · Deluxy CRM" };
export const dynamic = "force-dynamic";

const MESSAGGI: Record<string, string> = {
  diverse: "Le due password non coincidono.",
  corta: `Serve una password di almeno ${MIN_PASSWORD} caratteri.`,
  comune: "Questa password è fra le più usate al mondo: scegline un'altra.",
};

export default async function ReimpostaPassword({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; errore?: string }>;
}) {
  if (!authAttiva()) redirect("/"); // sviluppo locale: la porta è già aperta
  const sp = await searchParams;
  const token = sp.token ?? "";

  // Il token si controlla PRIMA di mostrare il form: un link vecchio non deve
  // far scrivere una password per poi dire di no alla fine.
  const esito = await leggiTokenReset(token);

  return (
    <div className="login-sfondo">
      <div className="login-card">
        <div className="brand-logo">D</div>
        {!esito.valido ? (
          <>
            <h1>Link non più valido</h1>
            <p className="sotto">Succede: i link durano un&rsquo;ora e si usano una volta sola.</p>
            <div className="errore-card" style={{ textAlign: "left" }}>
              Questo link è scaduto, è già stato usato, oppure non è corretto.
            </div>
            <p style={{ fontSize: 13 }}>
              <Link href="/login">← Torna all&rsquo;accesso e chiedine uno nuovo</Link>
            </p>
          </>
        ) : (
          <>
            <h1>Nuova password del team</h1>
            <p className="sotto">Vale per tutti: chi è dentro adesso dovrà rientrare con questa.</p>
            <form action={reimpostaPasswordConLink}>
              <input type="hidden" name="token" value={token} />
              <div className="campo">
                <label htmlFor="password">Nuova password (almeno {MIN_PASSWORD} caratteri)</label>
                <input
                  id="password"
                  type="password"
                  name="password"
                  required
                  minLength={MIN_PASSWORD}
                  autoFocus
                  autoComplete="new-password"
                />
              </div>
              <div className="campo">
                <label htmlFor="conferma">Ripetila</label>
                <input id="conferma" type="password" name="conferma" required autoComplete="new-password" />
              </div>
              {sp.errore && MESSAGGI[sp.errore] ? (
                <p style={{ color: "var(--red)", fontSize: 13, marginBottom: 12 }}>{MESSAGGI[sp.errore]}</p>
              ) : null}
              <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginBottom: 12, lineHeight: 1.5 }}>
                Una frase lunga che il team ricorda è meglio di otto caratteri strani. Poi comunicala a chi usa il
                CRM.
              </p>
              <button className="btn" type="submit" style={{ width: "100%" }}>
                Salva la password
              </button>
            </form>
          </>
        )}
        <p className="footnote">Consegne in guanti bianchi, dal 2019.</p>
      </div>
    </div>
  );
}
