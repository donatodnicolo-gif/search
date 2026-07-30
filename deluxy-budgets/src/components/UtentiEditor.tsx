"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RUOLI, type UtenteEsposto } from "@/lib/ruoli";

export function UtentiEditor({ utenti }: { utenti: UtenteEsposto[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [nuovo, setNuovo] = useState<{ email: string; nome: string; password: string; ruolo: string } | null>(null);
  const [cambiaPwd, setCambiaPwd] = useState<Record<string, string>>({});

  async function chiama(metodo: "POST" | "PUT", corpo: unknown) {
    setBusy(true);
    setErrore(null);
    const res = await fetch("/api/utenti", {
      method: metodo,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    setBusy(false);
    if (!res.ok) {
      const b = await res.json().catch(() => null);
      setErrore(b?.error ?? "Operazione non riuscita.");
      return false;
    }
    router.refresh();
    return true;
  }

  return (
    <>
      {errore && <div className="avviso-errore" style={{ marginBottom: 12 }}>{errore}</div>}

      <div className="page-head" style={{ marginBottom: 12 }}>
        <h2 className="section-title" style={{ margin: 0 }}>Chi può entrare</h2>
        <div className="page-actions">
          <button
            className="btn secondary"
            onClick={() => { setErrore(null); setNuovo({ email: "", nome: "", password: "", ruolo: "lettura" }); }}
          >
            Aggiungi persona
          </button>
        </div>
      </div>

      {nuovo && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="form-grid">
            <div>
              <label className="field-label">Email</label>
              <input type="email" value={nuovo.email} onChange={(e) => setNuovo({ ...nuovo, email: e.target.value })} placeholder="nome@studio.it" />
            </div>
            <div>
              <label className="field-label">Nome e cognome</label>
              <input value={nuovo.nome} onChange={(e) => setNuovo({ ...nuovo, nome: e.target.value })} />
            </div>
            <div>
              <label className="field-label">Password (almeno 10 caratteri)</label>
              <input type="password" value={nuovo.password} onChange={(e) => setNuovo({ ...nuovo, password: e.target.value })} />
            </div>
            <div>
              <label className="field-label">Ruolo</label>
              <select value={nuovo.ruolo} onChange={(e) => setNuovo({ ...nuovo, ruolo: e.target.value })}>
                {RUOLI.map((r) => (<option key={r.key} value={r.key}>{r.label}</option>))}
              </select>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
                {RUOLI.find((r) => r.key === nuovo.ruolo)?.aiuto}
              </div>
            </div>
          </div>
          <div className="form-footer">
            <button className="btn secondary" onClick={() => setNuovo(null)}>Annulla</button>
            <button
              className="btn primary"
              disabled={busy}
              onClick={async () => { if (await chiama("POST", nuovo)) setNuovo(null); }}
            >
              {busy ? "Creo…" : "Crea utente"}
            </button>
          </div>
          <p className="page-caption" style={{ marginTop: 10 }}>
            La password la scegli tu e la comunichi alla persona: non viene salvata in chiaro da nessuna parte, e
            nemmeno un amministratore può rileggerla — si può solo sostituire.
          </p>
        </div>
      )}

      <div className="card tight">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Persona</th>
                <th>Ruolo</th>
                <th>Ultimo accesso</th>
                <th>Nuova password</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {utenti.map((u) => (
                <tr key={u.id} style={{ opacity: u.attivo ? 1 : 0.5 }}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{u.nome}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{u.email}</div>
                  </td>
                  <td>
                    <select
                      value={u.ruolo}
                      disabled={busy}
                      onChange={(e) => chiama("PUT", { id: u.id, ruolo: e.target.value })}
                      style={{ padding: "4px 6px", fontSize: 13 }}
                      title={RUOLI.find((r) => r.key === u.ruolo)?.aiuto}
                    >
                      {RUOLI.map((r) => (<option key={r.key} value={r.key}>{r.label}</option>))}
                    </select>
                  </td>
                  <td className="muted" style={{ fontSize: 12.5 }}>
                    {u.ultimoAccesso ? new Date(u.ultimoAccesso).toLocaleString("it-IT") : "mai entrato"}
                  </td>
                  <td>
                    <input
                      type="password"
                      placeholder="almeno 10 caratteri"
                      value={cambiaPwd[u.id] ?? ""}
                      onChange={(e) => setCambiaPwd((p) => ({ ...p, [u.id]: e.target.value }))}
                      style={{ width: 150, padding: "4px 6px", fontSize: 13 }}
                    />
                    {(cambiaPwd[u.id]?.length ?? 0) >= 10 && (
                      <button
                        className="btn primary small"
                        style={{ marginLeft: 6 }}
                        disabled={busy}
                        onClick={async () => {
                          if (await chiama("PUT", { id: u.id, password: cambiaPwd[u.id] })) {
                            setCambiaPwd((p) => ({ ...p, [u.id]: "" }));
                          }
                        }}
                      >
                        Cambia
                      </button>
                    )}
                  </td>
                  <td>
                    <button
                      className="btn secondary small"
                      disabled={busy}
                      onClick={() => chiama("PUT", { id: u.id, attivo: !u.attivo })}
                      style={u.attivo ? { color: "var(--red)" } : undefined}
                    >
                      {u.attivo ? "Disattiva" : "Riattiva"}
                    </button>
                  </td>
                </tr>
              ))}
              {utenti.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    Nessun utente: si entra solo con la password del team, che è una sola e condivisa.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <p className="page-caption" style={{ marginTop: 12 }}>
        Chi si disattiva <strong>non si cancella</strong>: resta lo storico di chi aveva accesso, che è la domanda
        che ci si fa dopo, non prima. L&apos;<strong>ultimo amministratore attivo</strong> non si può disattivare
        né degradare — un&apos;app in cui nessuno può più entrare non è più sicura, è solo rotta.
      </p>
    </>
  );
}
