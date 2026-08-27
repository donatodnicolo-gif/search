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
          {/* Empty-state canonico (Libro cap.6): icona gold-soft + titolo + frase */}
          <div className="vuoto-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22">
              <g
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="4" y="4" width="7" height="7" rx="2" />
                <rect x="13" y="4" width="7" height="7" rx="2" />
                <rect x="4" y="13" width="7" height="7" rx="2" />
                <rect x="13" y="13" width="7" height="7" rx="2" />
              </g>
            </svg>
          </div>
          <div className="vuoto-title">Nessuna app abilitata</div>
          <p>
            Il tuo profilo non ha ancora app assegnate: chiedile a un amministratore
            dalla pagina Utenti.
          </p>
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
