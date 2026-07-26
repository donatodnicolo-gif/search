"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AccessoEditor({
  obbligatorio,
  daConfermare,
  cifraturaOk,
}: {
  obbligatorio: boolean;
  daConfermare: boolean;
  cifraturaOk: boolean;
}) {
  const router = useRouter();
  const [segreto, setSegreto] = useState<string | null>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [codice, setCodice] = useState("");
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  async function chiama(azione: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    setErrore(null);
    const res = await fetch("/api/accesso", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ azione, ...extra }),
    });
    setBusy(false);
    const b = await res.json().catch(() => null);
    if (!res.ok) {
      setErrore(b?.error ?? "Operazione non riuscita.");
      return null;
    }
    return b;
  }

  async function genera() {
    const b = await chiama("genera");
    if (b) {
      setSegreto(b.segreto);
      setUri(b.uri);
      router.refresh();
    }
  }

  async function conferma() {
    const b = await chiama("conferma", { codice });
    if (b) {
      setSegreto(null);
      setUri(null);
      setCodice("");
      router.refresh();
    }
  }

  async function togli() {
    if (!confirm("Togliere il codice di autenticazione? Per entrare basterà di nuovo la sola password.")) return;
    const b = await chiama("rimuovi", { codice });
    if (b) {
      setCodice("");
      router.refresh();
    }
  }

  if (!cifraturaOk) {
    return (
      <div className="card" style={{ borderColor: "var(--red)" }}>
        <strong>APP_SECRET non configurata.</strong> È il segreto con cui si cifra il codice prima di scriverlo nel
        database, ed è anche quello che rende il cookie di sessione impossibile da fabbricare a mano. Senza,
        registrare un secondo fattore è disabilitato — e sarebbe una protezione finta. Aggiungi{" "}
        <code>APP_SECRET</code> alle variabili d&apos;ambiente dell&apos;app e ricarica.
      </div>
    );
  }

  return (
    <>
      {errore && <div className="avviso-errore" style={{ marginBottom: 12 }}>{errore}</div>}

      {obbligatorio ? (
        <div className="card">
          <div className="badge green" style={{ marginBottom: 10 }}>
            <span className="dot" />
            Codice obbligatorio all&apos;ingresso
          </div>
          <p className="page-caption" style={{ marginTop: 0 }}>
            Per entrare servono la password del team <strong>e</strong> il codice a 6 cifre dell&apos;app di
            autenticazione. Per toglierlo serve un codice valido: se bastasse essere dentro, chi trovasse un
            computer aperto potrebbe disattivarlo in due clic.
          </p>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <label style={{ display: "grid", gap: 4, fontSize: 12.5 }}>
              Codice adesso
              <input
                value={codice}
                onChange={(e) => setCodice(e.target.value)}
                inputMode="numeric"
                maxLength={6}
                placeholder="123456"
                style={{ width: 120, padding: "7px 9px", letterSpacing: "0.2em", textAlign: "center" }}
              />
            </label>
            <button className="btn secondary" style={{ color: "var(--red)" }} disabled={busy} onClick={togli}>
              {busy ? "Attendi…" : "Togli il secondo fattore"}
            </button>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="badge neutral" style={{ marginBottom: 10 }}>
            <span className="dot" />
            Solo password
          </div>
          <p className="page-caption" style={{ marginTop: 0 }}>
            Oggi per entrare basta la password del team. È <strong>una sola e condivisa</strong>: basta che finisca
            in una chat o in uno screenshot e chiunque vede budget, premi e stipendi. Con il codice serve anche il
            telefono.
          </p>

          {!segreto && !daConfermare && (
            <button className="btn" disabled={busy} onClick={genera}>
              {busy ? "Genero…" : "Attiva il codice di autenticazione"}
            </button>
          )}

          {(segreto || daConfermare) && (
            <>
              {segreto ? (
                <>
                  <p style={{ fontSize: 13.5, marginBottom: 6 }}>
                    <strong>1.</strong> Aggiungi questa chiave alla tua app di autenticazione (Google Authenticator,
                    1Password, Authy): «aggiungi account» → «inserisci chiave manualmente».
                  </p>
                  <div
                    style={{
                      font: "15px/1.6 ui-monospace, monospace",
                      letterSpacing: "0.14em",
                      background: "var(--fill)",
                      borderRadius: "var(--radius-m)",
                      padding: "10px 12px",
                      wordBreak: "break-all",
                      margin: "0 0 8px",
                    }}
                  >
                    {segreto}
                  </div>
                  {uri && (
                    <p className="page-caption" style={{ marginTop: 0 }}>
                      Da telefono puoi anche aprire direttamente{" "}
                      <a href={uri} style={{ color: "var(--blue)" }}>questo collegamento</a>. La chiave si vede{" "}
                      <strong>una volta sola</strong>: se chiudi la pagina senza confermare, se ne genera un&apos;altra.
                    </p>
                  )}
                </>
              ) : (
                <p style={{ fontSize: 13.5 }}>
                  Una chiave è già stata generata ma <strong>non è mai stata confermata</strong>, quindi non blocca
                  nessuno. Se non ce l&apos;hai più nell&apos;app di autenticazione, generane una nuova.
                </p>
              )}
              <p style={{ fontSize: 13.5, margin: "10px 0 6px" }}>
                <strong>2.</strong> Scrivi il codice che l&apos;app mostra adesso. Il secondo fattore diventa
                obbligatorio <em>solo</em> dopo questa conferma.
              </p>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                <input
                  value={codice}
                  onChange={(e) => setCodice(e.target.value)}
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="123456"
                  style={{ width: 120, padding: "7px 9px", letterSpacing: "0.2em", textAlign: "center" }}
                />
                <button className="btn" disabled={busy || codice.length < 6} onClick={conferma}>
                  {busy ? "Verifico…" : "Conferma e attiva"}
                </button>
                <button className="btn secondary" disabled={busy} onClick={genera}>
                  Genera un&apos;altra chiave
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
