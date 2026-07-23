import Link from "next/link";
import { catalogoApp } from "@/lib/apps";
import { decifra } from "@/lib/cifratura";
import { aggiornaChiave, creaChiave, eliminaChiave, revocaToken } from "@/lib/chiavi-actions";
import { prisma } from "@/lib/db";
import { richiediAdmin } from "@/lib/sessione-server";
import { TokenForm } from "./TokenForm";

// Cassaforte delle chiavi dei progetti, solo admin. I valori stanno sul database
// cifrati (AES-256-GCM); qui si vedono mascherati e si rivelano uno alla volta.

const MESSAGGI_OK: Record<string, string> = {
  creata: "Chiave salvata.",
  aggiornata: "Chiave aggiornata.",
  eliminata: "Chiave eliminata.",
  "token-creato": "Token creato. Se non l'hai copiato, revocalo e generane un altro.",
  "token-revocato": "Token revocato.",
};

const MESSAGGI_ERRORE: Record<string, string> = {
  dati: "Dati non validi: servono progetto, nome e valore.",
  esiste: "Questo progetto ha già una chiave con questo nome: modificala dalla lista.",
  segreto:
    "HUB_CHIAVI_SECRET manca (o è troppo corto) nell'ambiente: senza, i valori non si possono cifrare.",
  token: "Token non valido: dai un nome e premi «Genera token» prima di salvare.",
  "token-esiste": "Questo token esiste già: generane un altro.",
};

function dataIt(d: Date) {
  return new Intl.DateTimeFormat("it-IT", { dateStyle: "short", timeStyle: "short" }).format(d);
}

export default async function ChiaviPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; errore?: string; mostra?: string }>;
}) {
  await richiediAdmin();
  const sp = await searchParams;

  const chiavi = await prisma.chiave.findMany({
    orderBy: [{ progetto: "asc" }, { nome: "asc" }],
  });
  const token = await prisma.tokenApi.findMany({ orderBy: [{ nome: "asc" }] });

  // Il valore si rivela una chiave alla volta (?mostra=id): si decifra solo
  // quella, le altre restano mascherate.
  let rivelata: { id: string; valore: string } | null = null;
  let erroreDecifra = false;
  if (sp.mostra) {
    const c = chiavi.find((x) => x.id === sp.mostra);
    if (c) {
      try {
        rivelata = { id: c.id, valore: decifra(c.valoreCifrato) };
      } catch {
        erroreDecifra = true; // HUB_CHIAVI_SECRET assente o cambiato dopo il salvataggio
      }
    }
  }

  // Suggerimenti per il campo "progetto": le app del catalogo + i progetti già usati.
  const progetti = [...new Set([...catalogoApp().map((a) => a.id), ...chiavi.map((c) => c.progetto)])].sort();

  return (
    <main className="main">
      <div className="page-head">
        <h1 className="page-title">Chiavi</h1>
        <p className="page-sub">
          I segreti di tutti i progetti in un posto solo, cifrati sul database. Solo gli
          amministratori arrivano qui.
        </p>
      </div>

      {sp.ok && MESSAGGI_OK[sp.ok] && <div className="avviso ok">{MESSAGGI_OK[sp.ok]}</div>}
      {sp.errore && MESSAGGI_ERRORE[sp.errore] && (
        <div className="avviso errore">{MESSAGGI_ERRORE[sp.errore]}</div>
      )}
      {erroreDecifra && (
        <div className="avviso errore">
          Impossibile decifrare: HUB_CHIAVI_SECRET manca o è cambiato dopo il salvataggio di
          questa chiave.
        </div>
      )}

      <div className="section-label">Nuova chiave</div>
      <div className="card">
        <form
          action={creaChiave}
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, alignItems: "end" }}
        >
          <label className="campo" style={{ marginBottom: 0 }}>
            <span>Progetto</span>
            <input name="progetto" required list="progetti" placeholder="deluxy-mail" />
            <datalist id="progetti">
              {progetti.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </label>
          <label className="campo" style={{ marginBottom: 0 }}>
            <span>Nome</span>
            <input name="nome" required placeholder="OPENAI_API_KEY" style={{ fontFamily: "ui-monospace, monospace" }} />
          </label>
          <label className="campo" style={{ marginBottom: 0, gridColumn: "1 / -1" }}>
            <span>Valore (salvato cifrato)</span>
            <input name="valore" required autoComplete="off" spellCheck={false} style={{ fontFamily: "ui-monospace, monospace" }} />
          </label>
          <label className="campo" style={{ marginBottom: 0, gridColumn: "1 / -1" }}>
            <span>Note (facoltative: a cosa serve, dove si rigenera)</span>
            <input name="note" placeholder="Console OpenAI → API keys" />
          </label>
          <button
            type="submit"
            className="btn primary"
            style={{ justifyContent: "center", padding: "10px 18px", gridColumn: "1 / -1" }}
          >
            Salva chiave
          </button>
        </form>
      </div>

      <div className="section-label">{chiavi.length} chiavi</div>
      <div className="card" style={{ padding: "20px 12px" }}>
        {chiavi.length === 0 ? (
          <p style={{ color: "var(--text-tertiary)", fontSize: 13.5, margin: "4px 8px" }}>
            Nessuna chiave salvata: aggiungi la prima qui sopra.
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Progetto</th>
                <th>Nome</th>
                <th>Valore</th>
                <th>Aggiornata</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {chiavi.map((c) => (
                <tr key={c.id}>
                  <td>
                    <span className="badge gold">
                      <span className="dot" />
                      {c.progetto}
                    </span>
                  </td>
                  <td>
                    <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 13 }}>{c.nome}</div>
                    {c.note && (
                      <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 3 }}>
                        {c.note}
                      </div>
                    )}
                  </td>
                  <td>
                    {rivelata?.id === c.id ? (
                      <div>
                        <code
                          style={{
                            fontSize: 12.5,
                            wordBreak: "break-all",
                            userSelect: "all",
                            display: "block",
                            maxWidth: 360,
                          }}
                        >
                          {rivelata.valore}
                        </code>
                        <Link href="/chiavi" style={{ fontSize: 12.5 }}>
                          Nascondi
                        </Link>
                      </div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 13, color: "var(--text-secondary)" }}>
                          ••••{c.suffisso}
                        </span>
                        <Link href={`/chiavi?mostra=${c.id}`} style={{ fontSize: 12.5 }}>
                          Mostra
                        </Link>
                      </div>
                    )}
                  </td>
                  <td style={{ color: "var(--text-secondary)", fontSize: 13 }}>
                    {dataIt(c.aggiornatoIl)}
                  </td>
                  <td>
                    <details>
                      <summary className="btn ghost" style={{ listStyle: "none", display: "inline-flex" }}>
                        Modifica
                      </summary>
                      <form
                        action={aggiornaChiave}
                        style={{ marginTop: 12, display: "grid", gap: 10, minWidth: 240 }}
                      >
                        <input type="hidden" name="id" value={c.id} />
                        <label className="campo" style={{ marginBottom: 0 }}>
                          <span>Nuovo valore (vuoto = invariato)</span>
                          <input name="valore" autoComplete="off" spellCheck={false} style={{ fontFamily: "ui-monospace, monospace" }} />
                        </label>
                        <label className="campo" style={{ marginBottom: 0 }}>
                          <span>Note</span>
                          <input name="note" defaultValue={c.note} />
                        </label>
                        <button type="submit" className="btn primary" style={{ justifyContent: "center" }}>
                          Salva
                        </button>
                      </form>
                      <form action={eliminaChiave} style={{ marginTop: 8 }}>
                        <input type="hidden" name="id" value={c.id} />
                        <button type="submit" className="btn danger" style={{ width: "100%", justifyContent: "center" }}>
                          Elimina chiave
                        </button>
                      </form>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="page-head" style={{ marginTop: 40 }}>
        <h1 className="page-title">Token di servizio</h1>
        <p className="page-sub">
          Le altre app leggono le proprie chiavi da{" "}
          <code>GET /api/chiavi?progetto=…</code> con uno di questi token
          (header <code>x-api-key</code> o <code>Authorization: Bearer</code>). Ogni
          token vede solo i progetti che gli assegni.
        </p>
      </div>

      <div className="section-label">Nuovo token</div>
      <div className="card">
        <TokenForm progetti={progetti} />
      </div>

      <div className="section-label">{token.length} token</div>
      <div className="card" style={{ padding: "20px 12px" }}>
        {token.length === 0 ? (
          <p style={{ color: "var(--text-tertiary)", fontSize: 13.5, margin: "4px 8px" }}>
            Nessun token: generane uno qui sopra e mettilo nell'ambiente dell'app che deve leggere.
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Progetti</th>
                <th>Ultimo uso</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {token.map((t) => (
                <tr key={t.id}>
                  <td style={{ fontWeight: 500 }}>{t.nome}</td>
                  <td style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
                    {t.progetti.length === 0 ? (
                      <span className="badge gold">
                        <span className="dot" />
                        tutti i progetti
                      </span>
                    ) : (
                      <span style={{ fontFamily: "ui-monospace, monospace" }}>
                        {t.progetti.join(" · ")}
                      </span>
                    )}
                  </td>
                  <td style={{ color: "var(--text-secondary)", fontSize: 13 }}>
                    {t.ultimoUso ? dataIt(t.ultimoUso) : "mai"}
                  </td>
                  <td>
                    <form action={revocaToken}>
                      <input type="hidden" name="id" value={t.id} />
                      <button type="submit" className="btn danger" style={{ justifyContent: "center" }}>
                        Revoca
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
