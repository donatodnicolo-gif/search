import { prisma } from "@/lib/db";
import { dentroOppureFuori } from "@/lib/sessione-server";
import { configurazioneMail } from "@/lib/mail";
import { dataIt } from "@/lib/etichette";

export const dynamic = "force-dynamic";

// MAIL — il registro di quello che è uscito dal CRM. L'invio vero passa da
// AI Mail (la casella aziendale), quindi ogni mail resta anche negli
// «Inviati» della posta: qui si vede il filo per cliente.
export default async function Mail({ searchParams }: { searchParams: Promise<{ esito?: string; errore?: string }> }) {
  await dentroOppureFuori(); // revoca: sessione con password vecchia = fuori
  const sp = await searchParams;
  const [inviate, config] = await Promise.all([
    prisma.mailInviata.findMany({ orderBy: { inviataIl: "desc" }, take: 100 }),
    configurazioneMail(),
  ]);

  const ultimi7 = inviate.filter(
    (m) => m.esito === "inviata" && m.inviataIl >= new Date(Date.now() - 7 * 86_400_000),
  ).length;
  const errori = inviate.filter((m) => m.esito === "errore").length;

  return (
    <>
      <div className="intestazione">
        <div>
          <h1 className="page-title">Mail</h1>
          <p className="page-sub">
            Le mail personalizzate uscite dal CRM. Partono dalla casella aziendale via AI Mail: la copia resta negli
            «Inviati» della posta, qui resta il filo per cliente.
          </p>
        </div>
        <div className="azioni">
          <a className="btn ghost" href="/mail/template">Template</a>
          <a className="btn" href="/mail/componi">Scrivi una mail</a>
        </div>
      </div>

      {sp.esito === "ok" ? <div className="ok-card">Mail inviata.</div> : null}
      {sp.errore ? <div className="errore-card">{sp.errore}</div> : null}

      {!config.pronta ? (
        <div className="errore-card">
          L&apos;invio non è ancora configurato: manca {config.manca.join(" e ")}. Il token si genera da AI Mail →
          Impostazioni App → «Token API di AI Mail»; i dettagli in <a className="link-quieto" href="/impostazioni">Impostazioni</a>.
        </div>
      ) : null}

      <div className="griglia tre" style={{ marginBottom: 16 }}>
        <div className="card stretta stat">
          <span className="valore">{ultimi7}</span>
          <span className="etichetta">Inviate negli ultimi 7 giorni</span>
        </div>
        <div className="card stretta stat">
          <span className="valore">{inviate.length}</span>
          <span className="etichetta">Nel registro (ultime 100)</span>
        </div>
        <div className="card stretta stat">
          <span className="valore">{errori}</span>
          <span className="etichetta">Non partite</span>
          <span className="nota">{errori ? "da riprovare dalla scheda cliente" : "tutto liscio"}</span>
        </div>
      </div>

      {inviate.length === 0 ? (
        <div className="card vuoto">
          <div className="quadratino">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
              <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
              <path d="m3.6 7 8.4 6.3L20.4 7" />
            </svg>
          </div>
          <h3>Nessuna mail, per ora</h3>
          <p>La prima si scrive dalla scheda di un cliente, da una ricorrenza o da un invito a evento.</p>
          <p style={{ marginTop: 12 }}>
            <a className="btn" href="/mail/componi">Scrivi una mail</a>
          </p>
        </div>
      ) : (
        <div className="card tabella-card">
          <div className="tabella-scroll">
            <table>
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Cliente</th>
                  <th>Oggetto</th>
                  <th>Esito</th>
                  <th>Da</th>
                </tr>
              </thead>
              <tbody>
                {inviate.map((m) => (
                  <tr key={m.id}>
                    <td className="secondario piccolo" style={{ whiteSpace: "nowrap" }}>{dataIt(m.inviataIl, true)}</td>
                    <td>
                      <a href={`/clienti/${m.chiaveCliente}`}>
                        <div className="cella-principale">{m.nomeCliente || m.destinatario}</div>
                        <div className="cella-sotto">{m.destinatario}</div>
                      </a>
                    </td>
                    <td title={m.corpo.slice(0, 400)}>{m.oggetto}</td>
                    <td>
                      {m.esito === "inviata" ? (
                        <span className="badge colorato" style={{ ["--badge-colore" as string]: "var(--green)" }}>
                          <span className="dot" />
                          Inviata
                        </span>
                      ) : (
                        <span
                          className="badge colorato"
                          style={{ ["--badge-colore" as string]: "var(--red)" }}
                          title={m.errore ?? ""}
                        >
                          <span className="dot" />
                          Non partita
                        </span>
                      )}
                    </td>
                    <td className="secondario piccolo">{m.autore || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
