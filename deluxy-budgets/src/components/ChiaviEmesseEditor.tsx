"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Le chiavi che **questa app dà alle altre**. L'opposto del riquadro qui sopra,
// e la pagina lo deve dire chiaramente: sono due elenchi di chiavi affiancati
// che vanno in direzioni opposte, e scambiarli è facilissimo.

type Riga = {
  id: string;
  nome: string;
  prefisso: string;
  scope: string;
  creata: string;
  ultimoUso: string | null;
  revocata: string | null;
  note: string | null;
};

// Ora di Roma decisa qui e non dal server: su Vercel il runtime è UTC, e una
// data «di ieri sera» scritta in UTC confonde chi guarda l'ultimo uso.
const quando = (s: string | null) =>
  s
    ? new Date(s).toLocaleString("it-IT", {
        timeZone: "Europe/Rome",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

export function ChiaviEmesseEditor({ chiavi }: { chiavi: Riga[] }) {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [scope, setScope] = useState<"lettura" | "scrittura">("lettura");
  const [note, setNote] = useState("");
  const [creo, setCreo] = useState(false);
  const [esito, setEsito] = useState<string | null>(null);
  // La chiave appena creata, in chiaro. Vive **solo** in questo stato: chiuso
  // il riquadro non la può più rileggere nessuno, nemmeno dal database.
  const [nuova, setNuova] = useState<{ chiaro: string; nome: string; scope: string } | null>(null);
  const [copiata, setCopiata] = useState(false);
  const [lavoro, setLavoro] = useState<string | null>(null);

  async function crea() {
    const n = nome.trim();
    if (!n) return;
    setCreo(true);
    setEsito(null);
    const res = await fetch("/api/chiavi-emesse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: n, scope, note }),
    });
    const body = await res.json().catch(() => null);
    setCreo(false);
    if (!res.ok) {
      setEsito(body?.error ?? "Chiave non creata, riprova.");
      return;
    }
    setNuova({ chiaro: body.chiaro, nome: body.nome, scope: body.scope });
    setCopiata(false);
    setNome("");
    setNote("");
    router.refresh();
  }

  async function cambiaStato(r: Riga) {
    const revoca = !r.revocata;
    if (revoca) {
      const uso = r.ultimoUso
        ? `L'ultima chiamata con questa chiave è del ${quando(r.ultimoUso)}.`
        : "Questa chiave non è mai stata usata.";
      if (!window.confirm(`Revoco la chiave di «${r.nome}»? ${uso} Da subito le sue chiamate riceveranno 401.`))
        return;
    }
    setLavoro(r.id);
    const res = await fetch("/api/chiavi-emesse", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: r.id, riattiva: !revoca }),
    });
    setLavoro(null);
    if (!res.ok) {
      setEsito("Operazione non riuscita, riprova.");
      return;
    }
    setEsito(revoca ? `Chiave di «${r.nome}» revocata.` : `Chiave di «${r.nome}» riattivata.`);
    router.refresh();
  }

  const attive = chiavi.filter((c) => !c.revocata);

  return (
    <div className="card">
      <h2 className="section-title" style={{ marginTop: 0 }}>Chiavi che questa app dà alle altre</h2>
      <p className="page-caption" style={{ marginTop: 0 }}>
        Una chiave <strong>per app</strong>, con il suo permesso, revocabile da sola. Si mandano nell&apos;header{" "}
        <code>X-API-Key</code> sulle rotte <code>/api/v1/…</code>.{" "}
        <strong>La chiave si vede una volta sola</strong>: a database resta solo la sua impronta, quindi non
        la può rileggere nessuno — nemmeno chi ha accesso al database. Se si perde si revoca e se ne fa
        un&apos;altra, che è più sicuro di un elenco da cui si possono ricopiare.
      </p>

      {nuova && (
        <div
          className="card"
          style={{ borderColor: "var(--green)", background: "rgba(0,122,58,0.05)", marginBottom: 14 }}
        >
          <strong>Chiave per «{nuova.nome}» ({nuova.scope}) — copiala adesso.</strong>
          <p className="page-caption" style={{ margin: "6px 0 10px" }}>
            Non comparirà più. Incollala nella cassaforte del Hub o nell&apos;env dell&apos;app che la deve
            usare.
          </p>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <code
              style={{
                flex: "1 1 340px",
                padding: "9px 12px",
                background: "var(--surface)",
                border: "1px solid var(--hairline-strong)",
                borderRadius: "var(--radius-m)",
                fontSize: 13,
                wordBreak: "break-all",
              }}
            >
              {nuova.chiaro}
            </code>
            <button
              className="btn secondary"
              onClick={() => {
                navigator.clipboard.writeText(nuova.chiaro).then(
                  () => setCopiata(true),
                  // Se la clipboard è negata non si finge il successo: la chiave
                  // è a schermo e si seleziona a mano.
                  () => setEsito("Copia non riuscita: selezionala e copiala a mano.")
                );
              }}
            >
              {copiata ? "Copiata ✓" : "Copia"}
            </button>
            <button className="btn" onClick={() => setNuova(null)}>
              Fatto, l&apos;ho salvata
            </button>
          </div>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>App</th>
              <th>Permesso</th>
              <th>Chiave</th>
              <th>Creata</th>
              <th>Ultimo uso</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {chiavi.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  Nessuna chiave emessa. Le altre app oggi entrano con la vecchia{" "}
                  <code>BUDGETS_API_KEY</code>, che vale solo in lettura.
                </td>
              </tr>
            )}
            {chiavi.map((c) => (
              <tr key={c.id} style={c.revocata ? { opacity: 0.55 } : undefined}>
                <td style={{ fontWeight: 500 }}>
                  {c.nome}
                  {c.note && (
                    <div className="muted" style={{ fontSize: 11, fontWeight: 400 }}>{c.note}</div>
                  )}
                </td>
                <td>
                  <span className={`badge ${c.scope === "scrittura" ? "orange" : "neutral"}`}>
                    <span className="dot" />
                    {c.scope === "scrittura" ? "lettura e scrittura" : "sola lettura"}
                  </span>
                </td>
                <td>
                  <code style={{ fontSize: 12 }}>{c.prefisso}…</code>
                </td>
                <td className="muted">{quando(c.creata)}</td>
                <td className={c.ultimoUso ? "muted" : undefined}>
                  {/* ⚠️ «Mai usata» è un'informazione, non un difetto: senza,
                      revocare fa paura e non si revoca mai. */}
                  {c.ultimoUso ? quando(c.ultimoUso) : <span className="muted">mai usata</span>}
                </td>
                <td className="num">
                  {c.revocata ? (
                    <>
                      <span className="muted" style={{ fontSize: 11, marginRight: 8 }}>
                        revocata il {quando(c.revocata)}
                      </span>
                      <button
                        className="btn secondary small"
                        onClick={() => cambiaStato(c)}
                        disabled={lavoro === c.id}
                      >
                        Riattiva
                      </button>
                    </>
                  ) : (
                    <button
                      className="btn secondary small"
                      onClick={() => cambiaStato(c)}
                      disabled={lavoro === c.id}
                    >
                      {lavoro === c.id ? "…" : "Revoca"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginTop: 16 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 200px" }}>
          <span className="muted" style={{ fontSize: 12.5 }}>A quale app</span>
          <input
            type="text"
            value={nome}
            placeholder="Marketing, Scout, Anagrafiche…"
            maxLength={60}
            onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") crea();
            }}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="muted" style={{ fontSize: 12.5 }}>Permesso</span>
          <select value={scope} onChange={(e) => setScope(e.target.value as "lettura" | "scrittura")}>
            <option value="lettura">Sola lettura</option>
            <option value="scrittura">Lettura e scrittura</option>
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 200px" }}>
          <span className="muted" style={{ fontSize: 12.5 }}>Nota (facoltativa)</span>
          <input
            type="text"
            value={note}
            placeholder="a cosa serve"
            maxLength={120}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <button className="btn primary" onClick={crea} disabled={creo || !nome.trim()}>
          {creo ? "Genero…" : "Genera chiave"}
        </button>
      </div>

      {scope === "scrittura" && (
        <p className="page-caption" style={{ marginTop: 10 }}>
          <strong style={{ color: "var(--orange)" }}>Lettura e scrittura</strong> vuol dire che quell&apos;app
          potrà <strong>cambiare il budget</strong>, non solo leggerlo. Dalla se ne hai bisogno davvero:{" "}
          {attive.length > 0 && `oggi ci sono ${attive.length} chiavi attive, e `}una chiave in più è una porta
          in più.
        </p>
      )}

      {esito && (
        <p className="page-caption" style={{ marginTop: 10 }}>
          {esito}
        </p>
      )}
    </div>
  );
}
