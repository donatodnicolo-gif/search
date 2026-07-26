import { cambiaStatoChiave, eliminaChiave } from "@/app/actions";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function quando(d: Date | null): string {
  if (!d) return "mai";
  return d.toLocaleString("it-IT", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default async function Impostazioni() {
  const chiavi = await prisma.apiKey.findMany({ orderBy: { creataIl: "desc" } });

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1 className="page-title">Impostazioni</h1>
          <p className="page-sub">Chiavi delle API e istruzioni per leggere gli script dalle altre app.</p>
        </div>
      </div>

      <div className="scheda">
        <div className="scheda-titolo">Chiavi API</div>
        <p className="testo-guida" style={{ marginBottom: 14 }}>
          Una chiave si crea dal terminale, nella cartella dell&apos;app:{" "}
          <code className="inline">npm run chiave -- &lt;nome-app&gt;</code>. Viene stampata una sola volta (nel
          database resta solo lo SHA-256): va copiata subito nel <code className="inline">.env</code> dell&apos;app
          client come <code className="inline">SCRIPTS_API_KEY</code>. Qui si possono solo revocare o riattivare — la
          chiave in chiaro non passa mai da una pagina web.
        </p>
        {chiavi.length === 0 ? (
          <div className="vuoto">Nessuna chiave creata.</div>
        ) : (
          <div className="tabella-wrap">
            <table>
              <thead>
                <tr>
                  <th>App</th>
                  <th>Permessi</th>
                  <th>Ultimo uso</th>
                  <th>Stato</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {chiavi.map((c) => (
                  <tr key={c.id}>
                    <td className="cella-nome">{c.nome}</td>
                    <td className="cella-muta">{c.scrittura ? "lettura + scrittura" : "sola lettura"}</td>
                    <td className="cella-muta">{quando(c.ultimoUso)}</td>
                    <td>
                      {c.attiva ? (
                        <span className="badge ok"><span className="dot" />attiva</span>
                      ) : (
                        <span className="badge spento">revocata</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        <form action={cambiaStatoChiave}>
                          <input type="hidden" name="id" value={c.id} />
                          <input type="hidden" name="attiva" value={c.attiva ? "0" : "1"} />
                          <button className="btn btn-secondario small" type="submit">
                            {c.attiva ? "Revoca" : "Riattiva"}
                          </button>
                        </form>
                        <form action={eliminaChiave}>
                          <input type="hidden" name="id" value={c.id} />
                          <button className="btn btn-pericolo small" type="submit">Elimina</button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="scheda">
        <div className="scheda-titolo">Come un&apos;app legge i suoi script</div>
        <p className="testo-guida">
          Tutte le chiamate vogliono l&apos;header <code className="inline">x-api-key</code>. Il parametro{" "}
          <code className="inline">app</code> è la chiave dell&apos;app che chiede: si ricevono solo gli script
          abilitati per quella, già composti con i suoi valori.
        </p>
        <pre className="codice" style={{ marginTop: 12 }}>{`# gli script abilitati per un'app
curl -H "x-api-key: $SCRIPTS_API_KEY" \\
  "$SCRIPTS_URL/api/v1/script?app=deluxy-marketing"

# uno script solo, già composto
curl -H "x-api-key: $SCRIPTS_API_KEY" \\
  "$SCRIPTS_URL/api/v1/script/import-ordini-shopify?app=deluxy-marketing"

# solo il testo, pronto da eseguire o incollare
curl -H "x-api-key: $SCRIPTS_API_KEY" \\
  "$SCRIPTS_URL/api/v1/script/import-ordini-shopify/testo?app=deluxy-marketing"

# le app collegate
curl -H "x-api-key: $SCRIPTS_API_KEY" "$SCRIPTS_URL/api/v1/app"`}</pre>
        <p className="testo-guida" style={{ marginTop: 12 }}>
          Le variabili di tipo <strong>segreto</strong> non escono mai dalle API: nel testo restano come{" "}
          <code className="inline">{"{{NOME}}"}</code> e l&apos;elenco <code className="inline">daCompilare</code> dice
          quali sono. I token stanno nella cassaforte del Hub, non qui.
        </p>
      </div>
    </main>
  );
}
