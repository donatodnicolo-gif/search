import { cambiaPasswordDaImpostazioni } from "@/lib/password-actions";
import { MIN_PASSWORD, type StatoPasswordTeam } from "@/lib/password-team";

// La card «Password del team» di Impostazioni: dice dove vive la password
// (nascita in env, o database da quando è stata cambiata dall'app) e la fa
// cambiare a chi è dentro, con quella attuale. A cambio fatto escono tutti.

const MESSAGGI: Record<string, string> = {
  attuale: "La password attuale non è giusta.",
  diverse: "Le due password nuove non coincidono.",
  corta: `Serve una password di almeno ${MIN_PASSWORD} caratteri.`,
  comune: "Questa password è fra le più usate al mondo: scegline un'altra.",
  vietato: "Dal Hub solo gli amministratori possono cambiare la password del team.",
};

export default function CardPasswordTeam({
  stato,
  esito,
  soloLettura,
  adminHub,
}: {
  stato: StatoPasswordTeam;
  esito?: string;
  soloLettura: boolean;
  adminHub: boolean; // entrato dal Hub come admin: cambia senza la password attuale
}) {
  const quando = stato.cambiataIl
    ? stato.cambiataIl.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" })
    : null;

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div className="card-titolo">Password del team</div>
        <span
          className="badge colorato"
          style={{ ["--badge-colore" as string]: stato.inDatabase ? "var(--green)" : "var(--orange)" }}
        >
          <span className="dot" />
          {stato.inDatabase ? `Cambiata dall'app il ${quando}` : "Password di nascita (variabile Vercel)"}
        </span>
      </div>
      <div className="card-sub">
        Una sola password per tutto il team. Cambiandola escono tutti, anche tu: si rientra con quella nuova.
      </div>
      <p className="secondario piccolo" style={{ lineHeight: 1.6 }}>
        {stato.inDatabase ? (
          <>
            Vive nel database del CRM (hash, mai in chiaro), cambiata da <strong>{stato.cambiataDa || "—"}</strong>.
            La variabile <code className="chip">CRM_APP_PASSWORD</code> non conta più: resta solo come porta di
            configurazione.
          </>
        ) : (
          <>
            Vale ancora quella impostata alla nascita in <code className="chip">CRM_APP_PASSWORD</code>. Dal primo
            cambio qui sotto (o dal link «Password dimenticata?» del login) si sposta nel database.
          </>
        )}
        <br />
        Il link di recupero arriva alla casella <code className="chip">CRM_RESET_EMAIL</code> (o, se manca,{" "}
        <code className="chip">MAIL_UTENTE</code>) via AI Mail: senza <code className="chip">MAIL_API_KEY</code> non
        parte. Chi legge quella casella può reimpostare la password: deve essere una casella di chi amministra.
        <br />
        Richieste «password dimenticata» nelle ultime 24 ore: <strong>{stato.richieste24h}</strong> (tetto: 3 all&apos;ora
        in tutto). Se il numero sale senza che nessuno abbia chiesto, qualcuno sta insistendo sul modulo pubblico.
      </p>

      {soloLettura ? (
        <p className="secondario piccolo">{MESSAGGI.vietato}</p>
      ) : (
        <form action={cambiaPasswordDaImpostazioni} style={{ marginTop: 12, maxWidth: 380 }}>
          {adminHub ? (
            <p className="secondario piccolo" style={{ marginBottom: 12 }}>
              Sei entrato dal Hub come amministratore: puoi cambiarla senza conoscere quella attuale.
            </p>
          ) : (
            <div className="campo">
              <label htmlFor="pw-attuale">Password attuale</label>
              <input id="pw-attuale" type="password" name="attuale" required autoComplete="current-password" />
            </div>
          )}
          <div className="campo">
            <label htmlFor="pw-nuova">Nuova password (almeno {MIN_PASSWORD} caratteri)</label>
            <input id="pw-nuova" type="password" name="nuova" required minLength={MIN_PASSWORD} autoComplete="new-password" />
          </div>
          <div className="campo">
            <label htmlFor="pw-conferma">Ripetila</label>
            <input id="pw-conferma" type="password" name="conferma" required autoComplete="new-password" />
          </div>
          {esito && MESSAGGI[esito] ? (
            <p style={{ color: "var(--red)", fontSize: 13, marginBottom: 12 }}>{MESSAGGI[esito]}</p>
          ) : null}
          <button className="btn" type="submit">
            Cambia la password del team
          </button>
        </form>
      )}
    </div>
  );
}
