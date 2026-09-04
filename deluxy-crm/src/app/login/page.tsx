import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authAttiva, creaSessione, DURATA_SESSIONE_S, SESSION_COOKIE } from "@/lib/auth";
import { configurazioneMail } from "@/lib/mail";
import { chiediResetPassword } from "@/lib/password-actions";
import { generazionePassword, verificaPasswordSquadra } from "@/lib/password-team";

export const dynamic = "force-dynamic";

// La porta dell'app: la password di squadra (nata in CRM_APP_PASSWORD, poi
// nel database da quando qualcuno la cambia dall'app). Dal Deluxy Hub si
// entra senza digitarla (SSO su /api/sso). Il CRM non tiene utenti propri:
// gli utenti vivono nel Hub.
async function login(fd: FormData) {
  "use server";
  if (!authAttiva()) redirect("/");

  const password = String(fd.get("password") ?? "");
  if (!(await verificaPasswordSquadra(password))) redirect("/login?errore=1");

  // La sessione porta la versione della password con cui nasce: un cambio
  // di password la chiude (sessione-server.ts).
  const token = await creaSessione({
    nome: "Team Deluxy",
    ruolo: "admin",
    via: "password",
    gen: await generazionePassword(),
  });
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

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ errore?: string; reset?: string; reimpostata?: string }>;
}) {
  const sp = await searchParams;
  // Onestà sul modulo di recupero: senza la posta del CRM il link non può
  // partire, e va detto PRIMA di far aspettare una mail che non arriverà.
  const posta = authAttiva() ? await configurazioneMail() : { pronta: true, manca: [] as string[] };

  return (
    <div className="login-sfondo">
      <div className="login-card">
        <div className="brand-logo">D</div>
        <h1>Deluxy CRM</h1>
        <p className="sotto">Il libro dei clienti: entra con la password del team, o direttamente dal Deluxy Hub.</p>

        {sp.reimpostata ? (
          <div className="ok-card" style={{ textAlign: "left" }}>
            Password del team aggiornata. Ogni accesso aperto è stato chiuso: si rientra con quella nuova.
          </div>
        ) : null}

        <form action={login}>
          <div className="campo">
            <input
              type="password"
              name="password"
              placeholder="Password del team"
              autoFocus
              required
              autoComplete="current-password"
            />
          </div>
          {sp.errore ? (
            <p style={{ color: "var(--red)", fontSize: 13, marginBottom: 12 }}>Password sbagliata: riprova.</p>
          ) : null}
          <button className="btn" type="submit" style={{ width: "100%" }}>
            Entra
          </button>
        </form>

        {/* Una sola password di squadra, nessun account personale: il link di
            recupero va SEMPRE alla casella di amministrazione di Deluxy, non a
            un indirizzo scritto qui (un modulo pubblico non deve dire a chi). */}
        <details style={{ marginTop: 14, textAlign: "left" }} open={Boolean(sp.reset)}>
          <summary style={{ fontSize: 13, color: "var(--text-secondary)", cursor: "pointer" }}>
            Password dimenticata?
          </summary>
          {sp.reset ? (
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 8, lineHeight: 1.5 }}>
              Se la posta del CRM è configurata, il link è appena partito alla casella di amministrazione di
              Deluxy. Vale <strong>un&rsquo;ora</strong> e si usa una volta sola. Non arriva nulla? Controlla la
              posta indesiderata, oppure chiedi a chi amministra le app Deluxy.
            </p>
          ) : (
            <>
              <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginTop: 8, lineHeight: 1.5 }}>
                Qui si entra con una sola password, valida per tutto il team, non legata a un indirizzo email
                personale. Il link per sceglierne una nuova arriva alla casella di amministrazione di Deluxy.
              </p>
              {!posta.pronta ? (
                <p style={{ fontSize: 13, color: "var(--orange)", marginTop: 8, lineHeight: 1.5 }}>
                  ⚠️ La posta del CRM non è configurata: finché non lo è, il link non può partire. La password
                  si legge o si sostituisce dalle variabili del progetto Vercel.
                </p>
              ) : null}
              <form action={chiediResetPassword} style={{ marginTop: 10 }}>
                <button className="btn ghost" type="submit" style={{ width: "100%" }}>
                  Mandami il link di recupero
                </button>
              </form>
            </>
          )}
        </details>
        <p className="footnote">Consegne in guanti bianchi, dal 2019.</p>
      </div>
    </div>
  );
}
