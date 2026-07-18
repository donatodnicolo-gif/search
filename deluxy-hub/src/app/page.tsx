import { AppIcon } from "@/components/AppIcon";
import { RUOLO_INFO } from "@/lib/ruoli";
import { appVisibili } from "@/lib/permessi";
import { richiediSessione } from "@/lib/sessione-server";

export default async function HomePage() {
  const sessione = await richiediSessione();
  const app = await appVisibili(sessione);
  const nome = sessione.nome.split(" ")[0];

  return (
    <main className="main">
      <div className="page-head">
        <h1 className="page-title">Ciao {nome}</h1>
        <p className="page-sub">{RUOLO_INFO[sessione.ruolo].descrizione}</p>
      </div>

      <div className="section-label">Le tue app</div>

      {app.length === 0 ? (
        <div className="vuoto">
          Nessuna app abilitata per il tuo profilo. Scrivi a un amministratore.
        </div>
      ) : (
        <div className="app-grid">
          {app.map((a) => (
            <a
              key={a.id}
              className="app-card"
              href={a.url}
              target="_blank"
              rel="noreferrer noopener"
            >
              <div className="app-icon">
                <AppIcon icona={a.icona} />
              </div>
              <div>
                <div className="app-name">{a.nome}</div>
                <div className="app-role">{a.sottotitolo}</div>
              </div>
              <p className="app-desc">{a.descrizione}</p>
              <div className="app-foot">
                <span className="app-open">Apri ↗</span>
                {a.mobile && (
                  <span className="badge">
                    <span className="dot" />
                    Mobile
                  </span>
                )}
              </div>
            </a>
          ))}
        </div>
      )}
    </main>
  );
}
