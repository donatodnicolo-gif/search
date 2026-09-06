import { NOME_CHIAVE_PERSONALE, type Organico, type PersonaOrganico } from "@/lib/organico";

// La sezione "Squadre e persone" di /utenti: l'organico letto da Personale,
// con accanto a ogni persona lo stato del suo accesso al portale. Vive in un
// file suo perché la pagina la usa dentro la sessione admin e un'anteprima di
// verifica può usarla fuori: lo stesso markup deve servire a tutt'e due.

type Account = { email: string; attivo: boolean } | null;

// La riga di una persona dell'organico: chi è, e se può già entrare nel portale.
function RigaPersona({ persona, account }: { persona: PersonaOrganico; account: Account }) {
  const partTime = persona.partTimePct && persona.partTimePct < 100 ? `part-time ${persona.partTimePct}%` : null;
  const dettagli = [persona.ruolo, persona.tipoNome, partTime].filter(Boolean).join(" · ");
  // Il form «Nuovo utente» riceve nome ed email già compilati: l'email è quella
  // che Personale conosce, e diventa la lingua comune fra le due app.
  const parametri = new URLSearchParams({ nome: persona.nome });
  if (persona.email) parametri.set("email", persona.email);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "9px 0",
        borderTop: "1px solid var(--hairline)",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500, fontSize: 13.5 }}>{persona.nome}</div>
        {(dettagli || persona.email) && (
          <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
            {dettagli}
            {dettagli && persona.email ? " · " : ""}
            {persona.email}
          </div>
        )}
      </div>
      {account ? (
        <div style={{ textAlign: "right" }}>
          <span className={`badge ${account.attivo ? "green" : "red"}`}>
            <span className="dot" />
            {account.attivo ? "Ha l'account" : "Account disattivato"}
          </span>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 3 }}>
            {account.email}
          </div>
        </div>
      ) : (
        <a className="btn" href={`/utenti?${parametri.toString()}#nuovo-utente`}>
          Crea account
        </a>
      )}
    </div>
  );
}

export function OrganicoPersonale({
  organico,
  accountDi,
}: {
  organico: Organico;
  accountDi: (p: PersonaOrganico) => Account;
}) {
  return (
    <div className="card">
      {organico.stato === "senza-chiave" && (
        <p style={{ fontSize: 13.5, color: "var(--text-secondary)", margin: 0 }}>
          Le squadre e le persone vivono in Personale, e per leggerle serve una sua chiave.
          Generane una per il Hub da Personale → Chiavi delle app (basta la sola lettura) e
          incollala nella <a href="/chiavi">cassaforte</a> come <code>{NOME_CHIAVE_PERSONALE}</code>,
          progetto «personale»: è la cassaforte a comandare, la variabile d&rsquo;ambiente fa
          solo da ripiego.
        </p>
      )}
      {organico.stato === "errore" && (
        <p style={{ fontSize: 13.5, color: "var(--text-secondary)", margin: 0 }}>
          L&rsquo;organico non si legge: {organico.motivo}. Le squadre e le persone
          ricompariranno da sole appena Personale risponde.
        </p>
      )}
      {organico.stato === "ok" && organico.totalePersone === 0 && (
        <p style={{ fontSize: 13.5, color: "var(--text-secondary)", margin: 0 }}>
          In Personale non ci sono ancora persone attive: l&rsquo;organico si compila lì, in
          Persone.
        </p>
      )}
      {organico.stato === "ok" && organico.totalePersone > 0 && (
        <div style={{ display: "grid", gap: 18 }}>
          {organico.team
            .filter((t) => t.persone.length > 0)
            .map((t) => (
              <section key={t.id}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 2 }}>
                  <span className="badge neutro">
                    <span className="dot" />
                    {t.nome}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                    {t.persone.length} {t.persone.length === 1 ? "persona" : "persone"}
                    {t.responsabile ? ` · ne risponde ${t.responsabile}` : ""}
                  </span>
                </div>
                {t.persone.map((p) => (
                  <RigaPersona key={p.id} persona={p} account={accountDi(p)} />
                ))}
              </section>
            ))}
          {organico.senzaTeam.length > 0 && (
            <section>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 2 }}>
                <span className="badge neutro">
                  <span className="dot" />
                  Senza funzione
                </span>
                <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                  {organico.senzaTeam.length}{" "}
                  {organico.senzaTeam.length === 1 ? "persona" : "persone"} · la funzione si
                  assegna in Personale
                </span>
              </div>
              {organico.senzaTeam.map((p) => (
                <RigaPersona key={p.id} persona={p} account={accountDi(p)} />
              ))}
            </section>
          )}
          <p style={{ fontSize: 11.5, color: "var(--text-tertiary)", margin: 0 }}>
            L&rsquo;organico è quello di Personale: funzioni, ruoli e responsabili si
            correggono là, qui si creano solo gli accessi. Una persona si riconosce
            dall&rsquo;email che Personale conosce, o in mancanza dal nome: se qui risulta
            senza account ma l&rsquo;account esiste con un&rsquo;altra email o un nome scritto
            diverso, allinea l&rsquo;email in Personale o il nome da «Modifica».
          </p>
        </div>
      )}
    </div>
  );
}
