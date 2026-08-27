"use client";

import { useMemo, useState } from "react";
import { AppIcon } from "./AppIcon";
import type { AppDeluxy } from "@/lib/apps";

// Le tessere delle app, con un campo per cercarle.
//
// Perché la ricerca: il Hub esiste per essere una scorciatoia — «entro, trovo,
// apro» — ma trovare era l'unica cosa non progettata. Con 19 app la home era un
// muro di tessere identiche senza raggruppamenti: 6 visibili sopra la piega su
// un monitor grande, e 4 schermate di scorrimento da telefono. Il campo filtra
// nome, sottotitolo e descrizione, così «fatture» trova Finance anche se la
// parola non è nel nome.
export function GrigliaApp({ app }: { app: AppDeluxy[] }) {
  const [cerca, setCerca] = useState("");

  const filtrate = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    if (!q) return app;
    return app.filter((a) =>
      `${a.nome} ${a.sottotitolo} ${a.descrizione}`.toLowerCase().includes(q),
    );
  }, [app, cerca]);

  return (
    <>
      <div className="cerca-app">
        <input
          type="search"
          value={cerca}
          onChange={(e) => setCerca(e.target.value)}
          placeholder={`Cerca fra le ${app.length} app…`}
          aria-label="Cerca fra le app"
        />
        {cerca.trim() !== "" && (
          <span className="cerca-esito">
            {filtrate.length === 0
              ? "nessuna app"
              : `${filtrate.length} ${filtrate.length === 1 ? "app" : "app"} su ${app.length}`}
          </span>
        )}
      </div>

      {filtrate.length === 0 ? (
        <div className="vuoto">
          Nessuna app con «{cerca.trim()}». Prova con una parola del nome o di cosa fa.
        </div>
      ) : (
        <div className="app-grid">
          {filtrate.map((a) => (
            <a
              key={a.id}
              className="app-card"
              href={a.sso ? `/vai/${a.id}` : a.url}
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
              {/* Il testo è tagliato a tre righe dal CSS perché le tessere siano
                  alte uguali: il `title` lo tiene per intero al passaggio. */}
              <p className="app-desc" title={a.descrizione}>
                {a.descrizione}
              </p>
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
    </>
  );
}
