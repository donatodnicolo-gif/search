import { prisma } from "@/lib/db";
import { dentroOppureFuori } from "@/lib/sessione-server";
import { eliminaTemplateWA, salvaTemplateWA } from "@/lib/actions";
import { dataIt } from "@/lib/etichette";
import { VARIABILI_DISPONIBILI } from "@/lib/variabili";

export const dynamic = "force-dynamic";

type Query = { modifica?: string; esito?: string; errore?: string };

// WHATSAPP — i template dei messaggi (nostri, testo libero con {{variabili}})
// e il registro di ciò che è uscito o è stato preparato. I template approvati
// da Meta, per scrivere a freddo dall'API, sono un'altra cosa e per ora non
// ci sono: a freddo si usa il canale assistito.
export default async function WhatsApp({ searchParams }: { searchParams: Promise<Query> }) {
  await dentroOppureFuori(); // revoca: sessione con password vecchia = fuori
  const sp = await searchParams;
  const [templates, messaggi] = await Promise.all([
    prisma.templateWhatsApp.findMany({ orderBy: { nome: "asc" } }),
    prisma.messaggioWhatsApp.findMany({ orderBy: { inviatoIl: "desc" }, take: 100 }),
  ]);
  const inModifica = sp.modifica ? templates.find((t) => t.id === sp.modifica) : undefined;

  return (
    <>
      <div className="intestazione">
        <div>
          <h1 className="page-title">WhatsApp</h1>
          <p className="page-sub">
            I modelli dei messaggi e il registro di quel che è partito. Dall&apos;API (numero del marchio) arriva solo a
            chi ci ha scritto nelle ultime 24 ore — regola di Meta; per tutti gli altri c&apos;è il canale assistito, dal
            tuo WhatsApp col testo già pronto.
          </p>
        </div>
      </div>

      {sp.esito === "ok" ? <div className="ok-card">Fatto.</div> : null}
      {sp.errore ? <div className="errore-card">{sp.errore}</div> : null}

      <div className="griglia" style={{ gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)", alignItems: "start", marginBottom: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {templates.length === 0 ? (
            <div className="card vuoto">
              <div className="quadratino">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                  <path d="M12 3.5a8.5 8.5 0 0 0-7.4 12.7L3.5 20.5l4.5-1a8.5 8.5 0 1 0 4-16z" />
                </svg>
              </div>
              <h3>Nessun template WhatsApp</h3>
              <p>Breve e caldo: su WhatsApp due frasi valgono più di dieci. Il primo si scrive qui accanto.</p>
            </div>
          ) : (
            templates.map((t) => (
              <div className="card" key={t.id}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                  <div>
                    <div className="card-titolo" style={{ fontSize: 16 }}>{t.nome}</div>
                    <div className="card-sub" style={{ marginBottom: 8 }}>aggiornato {dataIt(t.aggiornatoIl)}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <a className="btn ghost mini" href={`/whatsapp?modifica=${t.id}`}>Modifica</a>
                    <form action={eliminaTemplateWA}>
                      <input type="hidden" name="id" value={t.id} />
                      <button className="btn rosso mini" type="submit">Elimina</button>
                    </form>
                  </div>
                </div>
                <p className="secondario" style={{ fontSize: 13.5, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                  {t.testo.length > 280 ? `${t.testo.slice(0, 280)}…` : t.testo}
                </p>
              </div>
            ))
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card">
            <div className="card-titolo">{inModifica ? `Modifica «${inModifica.nome}»` : "Nuovo template"}</div>
            <div className="card-sub">
              {inModifica ? (
                <a className="link-quieto" href="/whatsapp">Annulla la modifica</a>
              ) : (
                "Le {{variabili}} sono le stesse delle mail."
              )}
            </div>
            <form action={salvaTemplateWA}>
              {inModifica ? <input type="hidden" name="id" value={inModifica.id} /> : null}
              <input type="hidden" name="torna" value="/whatsapp" />
              <div className="campo">
                <label>Nome <span className="ob">*</span></label>
                <input type="text" name="nome" defaultValue={inModifica?.nome ?? ""} placeholder="es. Auguri veloci" required />
              </div>
              <div className="campo">
                <label>Testo <span className="ob">*</span></label>
                <textarea
                  name="testo"
                  rows={6}
                  defaultValue={inModifica?.testo ?? ""}
                  placeholder={"Gentile {{nome}}, oggi è un giorno speciale e ci teniamo a farle i nostri auguri 🌸 Il team Deluxy"}
                  required
                />
              </div>
              <div className="form-piede">
                <button className="btn" type="submit">{inModifica ? "Salva le modifiche" : "Crea il template"}</button>
              </div>
            </form>
          </div>

          <div className="card">
            <div className="card-titolo" style={{ fontSize: 16 }}>Variabili</div>
            <p className="secondario piccolo" style={{ lineHeight: 1.7 }}>
              {VARIABILI_DISPONIBILI.filter((v) => !v.chiave.toLowerCase().includes("evento") && v.chiave !== "dressCode")
                .map((v) => `{{${v.chiave}}}`)
                .join(" · ")}
            </p>
          </div>
        </div>
      </div>

      <div className="card tabella-card">
        <div style={{ padding: "20px 20px 8px" }}>
          <div className="card-titolo">Registro (ultimi 100)</div>
        </div>
        {messaggi.length === 0 ? (
          <p className="secondario piccolo" style={{ padding: "0 20px 20px" }}>Ancora nessun messaggio.</p>
        ) : (
          <div className="tabella-scroll">
            <table>
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Cliente</th>
                  <th>Testo</th>
                  <th>Canale</th>
                  <th>Esito</th>
                </tr>
              </thead>
              <tbody>
                {messaggi.map((m) => (
                  <tr key={m.id}>
                    <td className="secondario piccolo" style={{ whiteSpace: "nowrap" }}>{dataIt(m.inviatoIl, true)}</td>
                    <td>
                      <a href={`/clienti/${encodeURIComponent(m.chiaveCliente)}`}>
                        <div className="cella-principale">{m.nomeCliente || m.telefono}</div>
                        <div className="cella-sotto">{m.telefono}</div>
                      </a>
                    </td>
                    <td title={m.testo}>{m.testo.length > 70 ? `${m.testo.slice(0, 70)}…` : m.testo}</td>
                    <td>
                      <span className="chip">{m.canale === "wame" ? "dal tuo WhatsApp" : "API marchio"}</span>
                    </td>
                    <td>
                      {m.esito === "inviato" ? (
                        <span className="badge colorato" style={{ ["--badge-colore" as string]: "var(--green)" }}>
                          <span className="dot" />Inviato
                        </span>
                      ) : m.esito === "preparato" ? (
                        <span className="badge colorato" style={{ ["--badge-colore" as string]: "var(--blue)" }}>
                          <span className="dot" />Preparato
                        </span>
                      ) : (
                        <span className="badge colorato" style={{ ["--badge-colore" as string]: "var(--red)" }} title={m.errore ?? ""}>
                          <span className="dot" />Rifiutato
                        </span>
                      )}
                    </td>
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
