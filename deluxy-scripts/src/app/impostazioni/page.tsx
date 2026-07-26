import { cambiaStatoChiave, eliminaChiave } from "@/app/actions";
import { NuovaChiave } from "@/components/NuovaChiave";
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
          <p className="page-sub">Chiavi delle API e istruzioni per leggere i testi dalle altre app.</p>
        </div>
      </div>

      <div className="scheda">
        <div className="scheda-titolo">Crea una chiave</div>
        <p className="testo-guida" style={{ marginBottom: 14 }}>
          Serve a un&apos;altra app per leggere i testi che le hai abilitato. Compare{" "}
          <strong>una sola volta</strong>: nel database resta solo la sua impronta (SHA-256), quindi da qui non si può
          più rileggere. Se si perde, se ne rigenera una e si aggiorna l&apos;app che la usava. Si può creare anche
          dal terminale: <code className="inline">npm run chiave -- &lt;nome-app&gt;</code>.
        </p>
        <NuovaChiave />
      </div>

      <div className="scheda">
        <div className="scheda-titolo">Chiavi esistenti</div>
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
        <div className="scheda-titolo">Come un&apos;app legge i suoi testi</div>
        <p className="testo-guida">
          Tutte le chiamate vogliono l&apos;header <code className="inline">x-api-key</code>. Il parametro{" "}
          <code className="inline">app</code> è la chiave dell&apos;app che chiede: si ricevono solo i testi abilitati
          per quella, già composti con i suoi valori (firma, tono, recapiti).
        </p>
        <pre className="codice" style={{ marginTop: 12 }}>{`# i testi abilitati per un'app
curl -H "x-api-key: $SCRIPTS_API_KEY" \\
  "$SCRIPTS_URL/api/v1/script?app=deluxy-messaging"

# un testo solo, già composto (con oggetto, se è un'email)
curl -H "x-api-key: $SCRIPTS_API_KEY" \\
  "$SCRIPTS_URL/api/v1/script/invito-evento-privato?app=deluxy-messaging"

# solo il messaggio, pronto da incollare
curl -H "x-api-key: $SCRIPTS_API_KEY" \\
  "$SCRIPTS_URL/api/v1/script/invito-evento-privato/testo?app=deluxy-messaging"

# le app collegate
curl -H "x-api-key: $SCRIPTS_API_KEY" "$SCRIPTS_URL/api/v1/app"`}</pre>
        <p className="testo-guida" style={{ marginTop: 12 }}>
          Le variabili che nessuno può sapere in anticipo — il nome di chi riceve, la data — restano scritte come{" "}
          <code className="inline">{"{{NOME_CLIENTE}}"}</code> e l&apos;elenco{" "}
          <code className="inline">daCompilare</code> dice quali sono: l&apos;app che usa il testo le riempie con i dati
          che ha già (l&apos;ordine, il cliente) prima di mandarlo.
        </p>
      </div>
    </main>
  );
}
