import { etichettaMesi, type Organico, type PersonaBudgets } from "@/lib/organico";

// La sezione "Squadre e persone" di /utenti: l'organico letto da Budgets, con
// accanto a ogni persona lo stato del suo accesso al portale. Vive in un file
// suo perché la pagina la usa dentro la sessione admin e l'anteprima di
// verifica la usa fuori: lo stesso markup deve servire a tutt'e due.

type Account = { email: string; attivo: boolean } | null;

// I colori delle squadre arrivano da Budgets (green|gold|blue|purple|orange|
// neutral); i badge del Hub conoscono solo gold/green/red/neutro. Si mappa
// quello che c'è e il resto degrada su neutro: meglio un grigio onesto che un
// colore inventato qui.
function classeBadgeTeam(colore: string | null): string {
  if (colore === "green") return "green";
  if (colore === "gold") return "gold";
  return "neutro";
}

// La riga di una persona dell'organico: chi è, e se può già entrare nel portale.
function RigaPersona({ persona, account }: { persona: PersonaBudgets; account: Account }) {
  const mesi = etichettaMesi(persona.mesi);
  const dettagli = [persona.ruolo, persona.tipoNome, persona.maison].filter(Boolean).join(" · ");
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
        <div style={{ fontWeight: 500, fontSize: 13.5 }}>
          {persona.nome}
          {mesi && (
            <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}> · {mesi}</span>
          )}
        </div>
        {dettagli && <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{dettagli}</div>}
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
        <a
          className="btn"
          href={`/utenti?nome=${encodeURIComponent(persona.nome)}#nuovo-utente`}
        >
          Crea account
        </a>
      )}
    </div>
  );
}

export function OrganicoBudgets({
  organico,
  accountDi,
}: {
  organico: Organico;
  accountDi: (p: PersonaBudgets) => Account;
}) {
  return (
    <div className="card">
      {organico.stato === "senza-chiave" && (
        <p style={{ fontSize: 13.5, color: "var(--text-secondary)", margin: 0 }}>
          Le squadre e le persone vivono in Budgets, e per leggerle serve una sua chiave.
          Generane una per il Hub da Budgets → Configurazione → Chiavi (basta lo scope
          «lettura») e incollala nella <a href="/chiavi">cassaforte</a> come{" "}
          <code>BUDGETS_API_KEY</code>, progetto «deluxy-budgets» (va bene anche «budgets»):
          è la cassaforte a comandare, la variabile d&rsquo;ambiente fa solo da ripiego.
        </p>
      )}
      {organico.stato === "errore" && (
        <p style={{ fontSize: 13.5, color: "var(--text-secondary)", margin: 0 }}>
          L&rsquo;organico non si legge: {organico.motivo}. Le squadre e le persone
          ricompariranno da sole appena Budgets risponde.
        </p>
      )}
      {organico.stato === "ok" && organico.totalePersone === 0 && (
        <p style={{ fontSize: 13.5, color: "var(--text-secondary)", margin: 0 }}>
          In Budgets non ci sono ancora persone: l&rsquo;organico si compila lì, in
          Personale → Dipendenti.
        </p>
      )}
      {organico.stato === "ok" && organico.totalePersone > 0 && (
        <div style={{ display: "grid", gap: 18 }}>
          {organico.team
            .filter((t) => t.persone.length > 0)
            .map((t) => (
              <section key={t.id}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 2 }}>
                  <span className={`badge ${classeBadgeTeam(t.colore)}`}>
                    <span className="dot" />
                    {t.nome}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                    {t.persone.length} {t.persone.length === 1 ? "persona" : "persone"}
                    {t.responsabile ? ` · ne risponde ${t.responsabile}` : ""}
                  </span>
                </div>
                {t.persone.map((p) => (
                  <RigaPersona key={p.nome} persona={p} account={accountDi(p)} />
                ))}
              </section>
            ))}
          {organico.senzaTeam.length > 0 && (
            <section>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 2 }}>
                <span className="badge neutro">
                  <span className="dot" />
                  Senza squadra
                </span>
                <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                  {organico.senzaTeam.length}{" "}
                  {organico.senzaTeam.length === 1 ? "persona" : "persone"} · la squadra si
                  assegna in Budgets
                </span>
              </div>
              {organico.senzaTeam.map((p) => (
                <RigaPersona key={p.nome} persona={p} account={accountDi(p)} />
              ))}
            </section>
          )}
          <p style={{ fontSize: 11.5, color: "var(--text-tertiary)", margin: 0 }}>
            L&rsquo;organico è quello del budget del personale di Budgets: squadre, ruoli e
            responsabili si correggono là, qui si creano solo gli accessi. Una persona si
            riconosce dal nome: se qui risulta senza account ma l&rsquo;account esiste con un
            nome scritto diverso, allinea il nome da «Modifica».
          </p>
        </div>
      )}
    </div>
  );
}
