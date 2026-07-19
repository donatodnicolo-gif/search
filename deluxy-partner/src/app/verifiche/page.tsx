import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomBytes } from "crypto";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { dataIt } from "@/lib/format";

export const dynamic = "force-dynamic";

const BASE_URL = "https://deluxy-partner.vercel.app";

async function generaChiave() {
  "use server";
  const chiave = "dlxv_" + randomBytes(24).toString("hex");
  await prisma.impostazione.upsert({
    where: { chiave: "api.verificheKey" },
    create: { chiave: "api.verificheKey", valore: chiave },
    update: { valore: chiave },
  });
  revalidatePath("/verifiche");
  redirect("/verifiche?generata=1");
}

async function svuotaStorico() {
  "use server";
  await prisma.richiestaVerifica.deleteMany();
  revalidatePath("/verifiche");
  redirect("/verifiche");
}

function ora(d: Date): string {
  return `${dataIt(d)} ${d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`;
}

export default async function VerifichePage({
  searchParams,
}: {
  searchParams: Promise<{ generata?: string }>;
}) {
  const sp = await searchParams;
  const [imp, richieste, conteggio] = await Promise.all([
    prisma.impostazione.findUnique({ where: { chiave: "api.verificheKey" } }),
    prisma.richiestaVerifica.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.richiestaVerifica.count(),
  ]);
  const chiave = imp?.valore ?? null;

  const trovate = richieste.filter((r) => r.esito === "trovato").length;
  const nonTrovate = richieste.filter((r) => r.esito === "non_trovato").length;
  const negate = richieste.filter((r) => r.esito === "non_autorizzato").length;

  const esempioChiave = chiave ?? "LA_TUA_CHIAVE";
  const curl = `curl -s "${BASE_URL}/api/verifiche?partner=CHANEL%20MILANO" \\
  -H "X-API-Key: ${esempioChiave}" \\
  -H "X-App: deluxy-hub"`;
  const fetchJs = `const res = await fetch(
  "${BASE_URL}/api/verifiche?partner=" + encodeURIComponent(nomePartner),
  { headers: { "X-API-Key": process.env.DELUXY_PARTNER_KEY, "X-App": "deluxy-hub" } }
);
const dati = await res.json();
// dati.trovato, dati.partner, dati.situazione.daIncassare, ...`;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">API di verifica</h1>
          <p className="page-caption">
            Altri progetti Deluxy possono chiedere la situazione finanziaria di un partner o lo stato
            di pagamento di una fattura. Ogni richiesta viene registrata nello storico qui sotto.
          </p>
        </div>
      </div>

      {sp.generata && (
        <div className="card" style={{ padding: 14, marginBottom: 16 }}>
          <span className="badge green"><span className="dot" />Nuova chiave generata — le chiavi precedenti non funzionano più</span>
        </div>
      )}

      <h2 className="section-title" style={{ marginTop: 0 }}>Chiave API</h2>
      <div className="card">
        {chiave ? (
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <code style={{ flex: "1 1 320px", padding: "10px 12px", background: "var(--bg)", borderRadius: "var(--radius-m)", border: "1px solid var(--hairline)", fontSize: 13, wordBreak: "break-all" }}>
              {chiave}
            </code>
            <form action={generaChiave}>
              <button className="btn secondary" type="submit" title="Genera una nuova chiave (invalida quella attuale)">Rigenera</button>
            </form>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
            <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>
              Nessuna chiave attiva: l&apos;API rifiuta tutte le richieste finché non ne generi una.
            </p>
            <form action={generaChiave}>
              <button className="btn primary" type="submit">Genera chiave API</button>
            </form>
          </div>
        )}
        <p className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>
          Trattala come una password: dà accesso in sola lettura alla situazione finanziaria dei partner.
          Va inviata nell&apos;header <code>X-API-Key</code> di ogni richiesta.
        </p>
      </div>

      <h2 className="section-title">Come richiamarla da un altro progetto</h2>
      <div className="card">
        <p style={{ fontSize: 14, marginBottom: 6 }}>
          <strong>Endpoint:</strong> <code>GET {BASE_URL}/api/verifiche?partner=&lt;nome o id&gt;</code>
        </p>
        <p style={{ fontSize: 13.5, color: "var(--text-secondary)", marginBottom: 14 }}>
          Header obbligatorio <code>X-API-Key</code>; facoltativo <code>X-App</code> (nome del progetto
          chiamante, finisce nello storico). Il partner si cerca per id o nome (anche parziale).
        </p>

        <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginBottom: 4 }}>Esempio curl</div>
        <pre style={{ background: "var(--bg)", border: "1px solid var(--hairline)", borderRadius: "var(--radius-m)", padding: 14, overflowX: "auto", fontSize: 12.5, lineHeight: 1.5 }}>{curl}</pre>

        <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", margin: "14px 0 4px" }}>Esempio JavaScript / Node</div>
        <pre style={{ background: "var(--bg)", border: "1px solid var(--hairline)", borderRadius: "var(--radius-m)", padding: 14, overflowX: "auto", fontSize: 12.5, lineHeight: 1.5 }}>{fetchJs}</pre>

        <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", margin: "14px 0 4px" }}>Risposta (200 se trovato)</div>
        <pre style={{ background: "var(--bg)", border: "1px solid var(--hairline)", borderRadius: "var(--radius-m)", padding: 14, overflowX: "auto", fontSize: 12.5, lineHeight: 1.5 }}>{`{
  "trovato": true,
  "partner": { "id": "...", "nome": "CHANEL MILANO", "categoria": "Boutique",
               "citta": "Milano", "stato": "P.P.", "feePercent": null, "attivo": true },
  "situazione": {
    "anno": 2026,
    "venditeYtd": 0, "serviziFatturatiYtd": 47521.4, "commissioniYtd": 0,
    "dovutoAlPartner": 0,
    "daIncassare": 5468.5,     // il partner deve a Deluxy (fatture aperte)
    "daBonificare": 0,         // Deluxy deve al partner
    "residuo": 5468.5,
    "fattureAperte": { "numero": 3, "totaleIvato": 5468.5, "scaduto": 0 },
    "debiti2025": 0, "crediti2025": 0
  },
  "aggiornatoAl": "2026-07-18T..."
}`}</pre>
        <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
          Esiti: <code>200</code> trovato · <code>404</code> non trovato (con eventuali <code>candidati</code>) ·
          <code>401</code> chiave assente/errata · <code>400</code> parametro mancante.
        </p>
      </div>

      <h2 className="section-title">Verifica se una fattura è pagata</h2>
      <div className="card">
        <p style={{ fontSize: 14, marginBottom: 6 }}>
          <strong>Endpoint:</strong> <code>GET {BASE_URL}/api/fatture?numero=&lt;numero&gt;</code> (oppure <code>?id=&lt;idFattura&gt;</code>)
        </p>
        <p style={{ fontSize: 13.5, color: "var(--text-secondary)", marginBottom: 14 }}>
          Stessa chiave (<code>X-API-Key</code>). Il numero può essere raggruppato (es. <code>68-69-70/2026</code>):
          cercando <code>69/2026</code> la trova. Risponde con lo stato di pagamento.
        </p>

        <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginBottom: 4 }}>Esempio curl</div>
        <pre style={{ background: "var(--bg)", border: "1px solid var(--hairline)", borderRadius: "var(--radius-m)", padding: 14, overflowX: "auto", fontSize: 12.5, lineHeight: 1.5 }}>{`curl -s "${BASE_URL}/api/fatture?numero=181/2026" \\
  -H "X-API-Key: ${esempioChiave}" -H "X-App: deluxy-mail"`}</pre>

        <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", margin: "14px 0 4px" }}>Risposta (200 se trovata)</div>
        <pre style={{ background: "var(--bg)", border: "1px solid var(--hairline)", borderRadius: "var(--radius-m)", padding: 14, overflowX: "auto", fontSize: 12.5, lineHeight: 1.5 }}>{`{
  "trovata": true,
  "numero": "181/2026",
  "partner": { "id": "...", "nome": "MAZZETTI D'ALTAVILLA" },
  "pagata": true,
  "dataPagamento": "2026-07-15",   // null se non pagata
  "scaduta": false,
  "scadenza": "2026-04-04",
  "competenza": "Febbraio 2026",
  "imponibile": 30.32, "aliquotaIva": 22, "totale": 36.99,
  "tipologia": "Consegne",
  "aggiornatoAl": "2026-07-18T..."
}`}</pre>
        <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
          Il campo chiave è <code>pagata</code> (true/false); <code>dataPagamento</code> dà la data dell&apos;incasso.
        </p>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h2 className="section-title">
          Storico richieste ({conteggio}) · {trovate} trovate · {nonTrovate} non trovate · {negate} negate
        </h2>
        {conteggio > 0 && (
          <form action={svuotaStorico}>
            <button className="btn secondary small" type="submit" title="Cancella lo storico delle richieste">Svuota storico</button>
          </form>
        )}
      </div>
      <div className="card tight">
        {richieste.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">↩</div>
            <div className="empty-title">Nessuna richiesta ricevuta</div>
            <div className="empty-text">Le chiamate all&apos;API compariranno qui, con app chiamante ed esito.</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Quando</th><th>App</th><th>Partner cercato</th><th>Esito</th><th>Sintesi risposta</th>
                </tr>
              </thead>
              <tbody>
                {richieste.map((r) => (
                  <tr key={r.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{ora(r.createdAt)}</td>
                    <td>{r.origine ?? <span className="muted">—</span>}</td>
                    <td>
                      {r.partnerId ? (
                        <Link href={`/partner/${r.partnerId}`} style={{ fontWeight: 500 }}>{r.partnerNome ?? r.queryPartner}</Link>
                      ) : (
                        r.queryPartner
                      )}
                    </td>
                    <td>
                      {r.esito === "trovato" ? (
                        <span className="badge green"><span className="dot" />Trovato</span>
                      ) : r.esito === "non_trovato" ? (
                        <span className="badge orange"><span className="dot" />Non trovato</span>
                      ) : (
                        <span className="badge red"><span className="dot" />Non autorizzato</span>
                      )}
                    </td>
                    <td className="muted" style={{ fontSize: 12.5, maxWidth: 340 }}>{r.rispostaSintesi ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
