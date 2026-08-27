import { creaUtente } from "@/lib/actions";
import { appPerIds, appPerRuolo, catalogoApp } from "@/lib/apps";
import { prisma } from "@/lib/db";
import { nomeNormalizzato, organicoDaBudgets, type PersonaBudgets } from "@/lib/organico";
import { RUOLI, RUOLO_INFO, type Ruolo } from "@/lib/ruoli";
import { richiediAdmin } from "@/lib/sessione-server";
import { OrganicoBudgets } from "./OrganicoBudgets";
import { RigaUtente } from "./RigaUtente";
import { ScelteApp } from "./ScelteApp";

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
  // Il server è in UTC: senza il fuso l'«ultimo accesso» era due ore indietro.
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}

export default async function UtentiPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; errore?: string; nome?: string }>;
}) {
  const sessione = await richiediAdmin();
  const sp = await searchParams;

  // Serve al form «Nuovo utente» e a ogni riga (che è un componente client):
  // catalogoApp() legge process.env e non può attraversare il confine, i suoi
  // dati sì.
  const appElenco = catalogoApp().map((a) => ({ id: a.id, nome: a.nome }));

  // L'organico arriva da Budgets in parallelo alla lista utenti: due fonti,
  // nessuna delle due deve aspettare l'altra.
  const [utenti, organico] = await Promise.all([
    prisma.utente.findMany({ orderBy: [{ ruolo: "asc" }, { nome: "asc" }] }),
    organicoDaBudgets(),
  ]);

  // Chi dell'organico ha già un account? Si riconosce dal nome (normalizzato):
  // l'email in Budgets non esiste, il nome è l'unica lingua comune.
  const utentePerNome = new Map<string, { email: string; attivo: boolean }>();
  for (const u of utenti)
    utentePerNome.set(nomeNormalizzato(u.nome), { email: u.email, attivo: u.attivo });
  const accountDi = (p: PersonaBudgets) => utentePerNome.get(nomeNormalizzato(p.nome)) ?? null;

  // E al contrario: la squadra di ogni utente, da mostrare nella lista.
  const teamPerNome = new Map<string, string>();
  if (organico.stato === "ok") {
    for (const t of organico.team)
      for (const p of t.persone) teamPerNome.set(nomeNormalizzato(p.nome), t.nome);
  }

  // Il nome può arrivare precompilato dal bottone "Crea account" dell'organico.
  const nomePrecompilato = typeof sp.nome === "string" ? sp.nome : "";

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
      <div className="card" id="nuovo-utente">
        <form
          action={creaUtente}
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14, alignItems: "end" }}
        >
          <label className="campo" style={{ marginBottom: 0 }}>
            <span>Nome</span>
            <input name="nome" required placeholder="Maria Rossi" defaultValue={nomePrecompilato} />
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
          <ScelteApp app={appElenco} selezionate={appPerRuolo("commerciale").map((a) => a.id)} />
          <button
            type="submit"
            className="btn primary"
            style={{ justifyContent: "center", padding: "10px 18px", gridColumn: "1 / -1" }}
          >
            Crea utente
          </button>
        </form>
      </div>

      <div className="section-label">
        Squadre e persone
        {organico.stato === "ok" ? ` — organico ${organico.anno} da Budgets` : " — da Budgets"}
      </div>
      <OrganicoBudgets organico={organico} accountDi={accountDi} />

      <div className="section-label">{utenti.length} utenti</div>
      <div className="card" style={{ padding: "20px 12px" }}>
        {/* Sotto i ~768px la tabella misura più della card: senza questo
            contenitore le colonne Stato, Ultimo accesso e il comando «Modifica»
            venivano disegnate FUORI dal riquadro, e non c'era nulla da scorrere. */}
        <div className="tabella-scroll">
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
              <RigaUtente
                key={u.id}
                utente={{
                  id: u.id,
                  nome: u.nome,
                  email: u.email,
                  ruolo: u.ruolo,
                  attivo: u.attivo,
                  appAbilitate: u.appAbilitate,
                }}
                team={teamPerNome.get(nomeNormalizzato(u.nome)) ?? null}
                appElenco={appElenco}
                appAbilitateTesto={
                  u.ruolo === "admin"
                    ? "tutte le app"
                    : appPerIds(u.appAbilitate)
                        .map((a) => a.nome)
                        .join(" · ") || "nessuna app"
                }
                ultimoAccesso={dataIt(u.ultimoAccesso)}
                puoEliminare={u.id !== sessione.uid}
              />
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </main>
  );
}
