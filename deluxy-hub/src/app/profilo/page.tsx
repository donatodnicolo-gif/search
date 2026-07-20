import { cambiaMiaPassword } from "@/lib/actions";
import { prisma } from "@/lib/db";
import { RUOLO_INFO } from "@/lib/ruoli";
import { appVisibili } from "@/lib/permessi";
import { richiediSessione } from "@/lib/sessione-server";

const MESSAGGI_ERRORE: Record<string, string> = {
  attuale: "La password attuale non è corretta.",
  corta: "La nuova password deve avere almeno 8 caratteri.",
};

export default async function ProfiloPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; errore?: string }>;
}) {
  const sessione = await richiediSessione();
  const sp = await searchParams;
  const utente = await prisma.utente.findUnique({ where: { id: sessione.uid } });
  const app = await appVisibili(sessione);

  return (
    <main className="main" style={{ maxWidth: 620 }}>
      <div className="page-head">
        <h1 className="page-title">Il tuo profilo</h1>
        <p className="page-sub">{utente?.email}</p>
      </div>

      {sp.ok && <div className="avviso ok">Password aggiornata.</div>}
      {sp.errore && MESSAGGI_ERRORE[sp.errore] && (
        <div className="avviso errore">{MESSAGGI_ERRORE[sp.errore]}</div>
      )}

      <div className="card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 16 }}>{sessione.nome}</div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>
              {RUOLO_INFO[sessione.ruolo].descrizione}
            </div>
          </div>
          <span className="badge gold">
            <span className="dot" />
            {RUOLO_INFO[sessione.ruolo].etichetta}
          </span>
        </div>
        <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginTop: 14 }}>
          App abilitate: {app.map((a) => a.nome).join(" · ") || "nessuna"}
        </p>
      </div>

      <div className="section-label">Cambia password</div>
      <div className="card">
        <form action={cambiaMiaPassword}>
          <label className="campo">
            <span>Password attuale</span>
            <input type="password" name="attuale" required autoComplete="current-password" />
          </label>
          <label className="campo">
            <span>Nuova password (min 8 caratteri)</span>
            <input type="password" name="nuova" required minLength={8} autoComplete="new-password" />
          </label>
          <button type="submit" className="btn primary">
            Aggiorna password
          </button>
        </form>
      </div>
    </main>
  );
}
