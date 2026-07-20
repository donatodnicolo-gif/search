import { aggiornaUtente, creaUtente, eliminaUtente } from "@/lib/actions";
import { appPerIds, appPerRuolo, catalogoApp } from "@/lib/apps";
import { prisma } from "@/lib/db";
import { RUOLI, RUOLO_INFO, type Ruolo } from "@/lib/ruoli";
import { richiediAdmin } from "@/lib/sessione-server";

// Spunte "quali app può aprire questo utente". Gli id spuntati arrivano alla
// server action come campi "app" ripetuti. `selezionate` pre-spunta quelle giuste
// (i default del ruolo su un nuovo utente, le app già assegnate in modifica).
function ScelteApp({ selezionate }: { selezionate: readonly string[] }) {
  const scelti = new Set(selezionate);
  return (
    <div className="campo" style={{ marginBottom: 0, gridColumn: "1 / -1" }}>
      <span>App visibili nella home</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 2 }}>
        {catalogoApp().map((a) => (
          <label
            key={a.id}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              fontSize: 13,
              padding: "7px 13px",
              border: "1px solid var(--hairline-strong)",
              borderRadius: "var(--radius-pill)",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              name="app"
              value={a.id}
              defaultChecked={scelti.has(a.id)}
              style={{ width: "auto", margin: 0 }}
            />
            {a.nome}
          </label>
        ))}
      </div>
      <span
        style={{
          fontSize: 11.5,
          color: "var(--text-tertiary)",
          fontWeight: 400,
          marginTop: 7,
          display: "block",
        }}
      >
        Gli amministratori vedono comunque tutte le app, a prescindere da queste spunte.
      </span>
    </div>
  );
}

const MESSAGGI_OK: Record<string, string> = {
  creato: "Utente creato.",
  aggiornato: "Utente aggiornato.",
  eliminato: "Utente eliminato.",
};

const MESSAGGI_ERRORE: Record<string, string> = {
  dati: "Dati non validi: controlla nome, email, ruolo e password (almeno 8 caratteri).",
  esiste: "Esiste già un utente con questa email.",
  password: "La nuova password deve avere almeno 8 caratteri.",
  "se-stesso": "Non puoi eliminare il tuo stesso account.",
};

function dataIt(d: Date | null) {
  if (!d) return "mai";
  return new Intl.DateTimeFormat("it-IT", { dateStyle: "short", timeStyle: "short" }).format(d);
}

export default async function UtentiPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; errore?: string }>;
}) {
  const sessione = await richiediAdmin();
  const sp = await searchParams;

  const utenti = await prisma.utente.findMany({ orderBy: [{ ruolo: "asc" }, { nome: "asc" }] });

  return (
    <main className="main">
      <div className="page-head">
        <h1 className="page-title">Utenti</h1>
        <p className="page-sub">
          Chi può entrare nel portale e, app per app, cosa vede nella home.
        </p>
      </div>

      {sp.ok && MESSAGGI_OK[sp.ok] && <div className="avviso ok">{MESSAGGI_OK[sp.ok]}</div>}
      {sp.errore && MESSAGGI_ERRORE[sp.errore] && (
        <div className="avviso errore">{MESSAGGI_ERRORE[sp.errore]}</div>
      )}

      <div className="section-label">Nuovo utente</div>
      <div className="card">
        <form
          action={creaUtente}
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, alignItems: "end" }}
        >
          <label className="campo" style={{ marginBottom: 0 }}>
            <span>Nome</span>
            <input name="nome" required placeholder="Maria Rossi" />
          </label>
          <label className="campo" style={{ marginBottom: 0 }}>
            <span>Email</span>
            <input name="email" type="email" required placeholder="maria@deluxy.it" />
          </label>
          <label className="campo" style={{ marginBottom: 0 }}>
            <span>Password (min 8)</span>
            <input name="password" type="password" required minLength={8} autoComplete="new-password" />
          </label>
          <label className="campo" style={{ marginBottom: 0 }}>
            <span>Ruolo</span>
            <select name="ruolo" defaultValue="commerciale">
              {RUOLI.map((r) => (
                <option key={r} value={r}>
                  {RUOLO_INFO[r].etichetta}
                </option>
              ))}
            </select>
          </label>
          <ScelteApp selezionate={appPerRuolo("commerciale").map((a) => a.id)} />
          <button
            type="submit"
            className="btn primary"
            style={{ justifyContent: "center", padding: "10px 18px", gridColumn: "1 / -1" }}
          >
            Crea utente
          </button>
        </form>
      </div>

      <div className="section-label">{utenti.length} utenti</div>
      <div className="card" style={{ padding: "20px 12px" }}>
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Ruolo</th>
              <th>Stato</th>
              <th>Ultimo accesso</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {utenti.map((u) => (
              <tr key={u.id}>
                <td>
                  <div style={{ fontWeight: 500 }}>{u.nome}</div>
                  <div style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>{u.email}</div>
                </td>
                <td>
                  <span className="badge gold">
                    <span className="dot" />
                    {RUOLO_INFO[u.ruolo as Ruolo]?.etichetta ?? u.ruolo}
                  </span>
                  <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 4 }}>
                    {u.ruolo === "admin"
                      ? "tutte le app"
                      : appPerIds(u.appAbilitate)
                          .map((a) => a.nome)
                          .join(" · ") || "nessuna app"}
                  </div>
                </td>
                <td>
                  <span className={`badge ${u.attivo ? "green" : "red"}`}>
                    <span className="dot" />
                    {u.attivo ? "Attivo" : "Disattivato"}
                  </span>
                </td>
                <td style={{ color: "var(--text-secondary)", fontSize: 13 }}>
                  {dataIt(u.ultimoAccesso)}
                </td>
                <td>
                  <details>
                    <summary
                      className="btn ghost"
                      style={{ listStyle: "none", display: "inline-flex" }}
                    >
                      Modifica
                    </summary>
                    <form
                      action={aggiornaUtente}
                      style={{ marginTop: 12, display: "grid", gap: 10, minWidth: 240 }}
                    >
                      <input type="hidden" name="id" value={u.id} />
                      <label className="campo" style={{ marginBottom: 0 }}>
                        <span>Nome</span>
                        <input name="nome" defaultValue={u.nome} required />
                      </label>
                      <label className="campo" style={{ marginBottom: 0 }}>
                        <span>Ruolo</span>
                        <select name="ruolo" defaultValue={u.ruolo}>
                          {RUOLI.map((r) => (
                            <option key={r} value={r}>
                              {RUOLO_INFO[r].etichetta}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="campo" style={{ marginBottom: 0 }}>
                        <span>Nuova password (vuoto = invariata)</span>
                        <input name="password" type="password" autoComplete="new-password" />
                      </label>
                      <ScelteApp selezionate={u.appAbilitate} />
                      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
                        <input
                          type="checkbox"
                          name="attivo"
                          defaultChecked={u.attivo}
                          style={{ width: "auto" }}
                        />
                        Può accedere
                      </label>
                      <button type="submit" className="btn primary" style={{ justifyContent: "center" }}>
                        Salva
                      </button>
                    </form>

                    {u.id !== sessione.uid && (
                      <form action={eliminaUtente} style={{ marginTop: 8 }}>
                        <input type="hidden" name="id" value={u.id} />
                        <button type="submit" className="btn danger" style={{ width: "100%", justifyContent: "center" }}>
                          Elimina utente
                        </button>
                      </form>
                    )}
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
