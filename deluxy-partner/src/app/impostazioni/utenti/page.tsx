import Link from "next/link";
import { prisma } from "@/lib/db";
import { RUOLI } from "@/lib/utenti";
import { creaUtente, aggiornaUtente, reimpostaPassword, eliminaUtente } from "@/lib/utenti-actions";

export const dynamic = "force-dynamic";

// Account personali: chi entra con email e password invece della password di
// team. È il presupposto perché i registri (accessi e modifiche) portino un
// nome vero al posto dell'etichetta «Accesso a password».

function quando(d: Date | null): string {
  if (!d) return "mai";
  return new Date(d).toLocaleString("it-IT", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default async function UtentiPage({
  searchParams,
}: {
  searchParams: Promise<{ errore?: string; ok?: string }>;
}) {
  const sp = await searchParams;
  const utenti = await prisma.utenteApp.findMany({ orderBy: [{ attivo: "desc" }, { nome: "asc" }] });
  const adminAttivi = utenti.filter((u) => u.ruolo === "admin" && u.attivo).length;

  return (
    <>
      <div className="page-head">
        <div>
          <Link href="/impostazioni" className="btn secondary small" style={{ marginBottom: 10 }}>← Impostazioni</Link>
          <h1 className="page-title">Utenti</h1>
          <p className="page-caption">
            Chi entra con <strong>email e password</strong> personali. Il nome di queste persone compare nel
            registro accessi e accanto a ogni modifica: la password di team, no.
          </p>
        </div>
        <div className="page-actions">
          <Link href="/impostazioni/accessi" className="btn secondary">Chi ha avuto accesso →</Link>
        </div>
      </div>

      {sp.errore && (
        <div className="card" style={{ padding: 14, marginBottom: 16, borderLeft: "3px solid var(--red)" }}>
          <span style={{ color: "var(--red)", fontSize: 14 }}>{sp.errore}</span>
        </div>
      )}
      {sp.ok && (
        <div className="card" style={{ padding: 14, marginBottom: 16 }}>
          <span className="badge green"><span className="dot" />{sp.ok}</span>
        </div>
      )}

      {utenti.length === 0 && (
        <div className="card" style={{ padding: 14, marginBottom: 16, borderLeft: "3px solid var(--orange)" }}>
          <strong style={{ fontSize: 14 }}>Non c&apos;è ancora nessun account</strong>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 6, marginBottom: 0 }}>
            Finché questa lista è vuota si entra solo con la password di team, che non ha un nome. Crea il primo
            account qui sotto: da quel momento chi lo usa comparirà con nome e cognome nei registri.
          </p>
        </div>
      )}

      <h2 className="section-title" style={{ marginTop: 0 }}>Nuovo utente</h2>
      <div className="card" style={{ marginBottom: 20 }}>
        <form action={creaUtente}>
          <div className="form-grid">
            <div>
              <label className="field-label">Nome e cognome</label>
              <input type="text" name="nome" required placeholder="es. Giulia Rossi" />
            </div>
            <div>
              <label className="field-label">Email</label>
              <input type="email" name="email" required placeholder="nome@deluxy.it" autoComplete="off" />
            </div>
            <div>
              <label className="field-label">Cosa può fare</label>
              <select name="ruolo" defaultValue="sola_lettura">
                {RUOLI.map((r) => <option key={r.valore} value={r.valore}>{r.etichetta} — {r.descrizione}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">Password iniziale</label>
              <input type="password" name="password" required autoComplete="new-password" placeholder="almeno 10 caratteri, con una cifra" />
            </div>
          </div>
          <div className="form-footer" style={{ marginTop: 16 }}>
            <span className="muted" style={{ marginRight: "auto", fontSize: 12.5, alignSelf: "center" }}>
              La password la scegli tu e gliela comunichi: l&apos;app non manda email.
            </span>
            <button type="submit" className="btn primary small">Crea utente</button>
          </div>
        </form>
      </div>

      <h2 className="section-title">
        Utenti ({utenti.length})
        {adminAttivi > 0 && <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}> · {adminAttivi} con accesso pieno</span>}
      </h2>

      {utenti.length === 0 ? (
        <div className="card">
          <div className="empty">
            <div className="empty-icon">◎</div>
            <div className="empty-title">Nessun utente</div>
            <div className="empty-text">Crea il primo account qui sopra.</div>
          </div>
        </div>
      ) : (
        utenti.map((u) => (
          <details className="card tight" key={u.id} style={{ marginBottom: 12 }}>
            <summary
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                gap: 12, padding: "14px 20px", cursor: "pointer", listStyle: "none", flexWrap: "wrap",
              }}
            >
              <span style={{ fontWeight: 600, fontSize: 14 }}>
                {u.nome}
                <span className="muted" style={{ fontWeight: 400, marginLeft: 8, fontSize: 13 }}>{u.email}</span>
              </span>
              <span style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13, flexWrap: "wrap" }}>
                <span className={`badge ${u.ruolo === "admin" ? "purple" : "neutral"}`}>
                  <span className="dot" />{u.ruolo === "admin" ? "Accesso pieno" : "Sola lettura"}
                </span>
                {u.attivo ? (
                  <span className="badge green"><span className="dot" />Attivo</span>
                ) : (
                  <span className="badge red"><span className="dot" />Disattivato</span>
                )}
                <span className="muted">Ultimo accesso: {quando(u.ultimoAccesso)}</span>
              </span>
            </summary>

            <div style={{ borderTop: "1px solid var(--hairline)", padding: "18px 20px" }}>
              <form action={aggiornaUtente.bind(null, u.id)}>
                <div className="form-grid">
                  <div>
                    <label className="field-label">Nome e cognome</label>
                    <input type="text" name="nome" defaultValue={u.nome} required />
                  </div>
                  <div>
                    <label className="field-label">Cosa può fare</label>
                    <select name="ruolo" defaultValue={u.ruolo}>
                      {RUOLI.map((r) => <option key={r.valore} value={r.valore}>{r.etichetta}</option>)}
                    </select>
                  </div>
                  <div className="checkbox-row">
                    <input type="checkbox" id={`att-${u.id}`} name="attivo" defaultChecked={u.attivo} />
                    <label htmlFor={`att-${u.id}`}>Può entrare</label>
                  </div>
                </div>
                <div className="form-footer" style={{ marginTop: 14 }}>
                  <span className="muted" style={{ marginRight: "auto", fontSize: 12, alignSelf: "center" }}>
                    L&apos;email non si cambia: è la chiave dell&apos;account e lega gli accessi già registrati.
                  </span>
                  <button type="submit" className="btn primary small">Salva</button>
                </div>
              </form>

              <div style={{ borderTop: "1px solid var(--hairline)", marginTop: 18, paddingTop: 18, display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-end" }}>
                <form action={reimpostaPassword.bind(null, u.id)} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                  <div>
                    <label className="field-label">Nuova password</label>
                    <input type="password" name="password" required autoComplete="new-password" placeholder="almeno 10 caratteri, con una cifra" style={{ width: 260 }} />
                  </div>
                  <button type="submit" className="btn secondary small">Reimposta password</button>
                </form>
                <form action={eliminaUtente.bind(null, u.id)} style={{ marginLeft: "auto" }}>
                  <button type="submit" className="btn secondary small" style={{ color: "var(--red)" }}>
                    Elimina utente
                  </button>
                </form>
              </div>
              <p className="muted" style={{ fontSize: 12, marginTop: 12, marginBottom: 0 }}>
                Disattivando o eliminando un utente gli si impedisce di <strong>rientrare</strong>. Una sessione
                già aperta resta valida fino alla scadenza (7 giorni): per chiuderla subito bisogna cambiare
                <code> PARTNER_APP_PASSWORD</code> su Vercel, che scollega tutti.
              </p>
            </div>
          </details>
        ))
      )}
    </>
  );
}
