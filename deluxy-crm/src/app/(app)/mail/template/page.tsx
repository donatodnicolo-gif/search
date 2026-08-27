import { prisma } from "@/lib/db";
import { creaTemplateDiPartenza, eliminaTemplate, salvaTemplate } from "@/lib/actions";
import { dataIt } from "@/lib/etichette";
import { VARIABILI_DISPONIBILI } from "@/lib/variabili";

export const dynamic = "force-dynamic";

type Query = { modifica?: string; esito?: string; errore?: string };

// TEMPLATE — i modelli delle mail personalizzate. Le {{variabili}} si
// riempiono da sole coi dati del cliente (e dell'evento) al momento della
// composizione: si scrive una volta, si personalizza sempre.
export default async function Template({ searchParams }: { searchParams: Promise<Query> }) {
  const sp = await searchParams;
  const templates = await prisma.templateMail.findMany({ orderBy: { nome: "asc" } });
  const inModifica = sp.modifica ? templates.find((t) => t.id === sp.modifica) : undefined;

  return (
    <>
      <div className="intestazione">
        <div>
          <h1 className="page-title">Template</h1>
          <p className="page-sub">
            I modelli delle mail: auguri, inviti, riattivazioni. Le variabili come {"{{nome}}"} si riempiono da sole al
            momento della composizione — e si rilegge sempre prima di inviare.
          </p>
        </div>
        <a className="btn ghost" href="/mail">← Registro mail</a>
      </div>

      {sp.esito === "ok" ? <div className="ok-card">Template salvato.</div> : null}
      {sp.errore ? <div className="errore-card">{sp.errore}</div> : null}

      <div className="griglia" style={{ gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {templates.length === 0 ? (
            <div className="card vuoto">
              <div className="quadratino">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                  <path d="M6 3.5h7.5L18 8v12.5H6zM12.5 3.5V8H17M8 12h6M8 15.5h6" />
                </svg>
              </div>
              <h3>Nessun template</h3>
              <p>Parti dai tre modelli Deluxy — auguri, invito, ben ritrovare — e falli tuoi.</p>
              <form action={creaTemplateDiPartenza} style={{ marginTop: 12 }}>
                <button className="btn" type="submit">Crea i template di partenza</button>
              </form>
            </div>
          ) : (
            templates.map((t) => (
              <div className="card" key={t.id}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                  <div>
                    <div className="card-titolo" style={{ fontSize: 16 }}>{t.nome}</div>
                    <div className="card-sub" style={{ marginBottom: 8 }}>
                      Oggetto: {t.oggetto} · aggiornato {dataIt(t.aggiornatoIl)}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <a className="btn ghost mini" href={`/mail/template?modifica=${t.id}`}>Modifica</a>
                    <form action={eliminaTemplate}>
                      <input type="hidden" name="id" value={t.id} />
                      <button className="btn rosso mini" type="submit">Elimina</button>
                    </form>
                  </div>
                </div>
                <p className="secondario" style={{ fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                  {t.corpo.length > 350 ? `${t.corpo.slice(0, 350)}…` : t.corpo}
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
                <a className="link-quieto" href="/mail/template">Annulla la modifica</a>
              ) : (
                "Un nome chiaro, un oggetto che si riconosce, un testo che sembra scritto a mano."
              )}
            </div>
            <form action={salvaTemplate}>
              {inModifica ? <input type="hidden" name="id" value={inModifica.id} /> : null}
              <input type="hidden" name="torna" value="/mail/template" />
              <div className="campo">
                <label>Nome <span className="ob">*</span></label>
                <input type="text" name="nome" defaultValue={inModifica?.nome ?? ""} placeholder="es. Auguri di compleanno" required />
              </div>
              <div className="campo">
                <label>Oggetto <span className="ob">*</span></label>
                <input type="text" name="oggetto" defaultValue={inModifica?.oggetto ?? ""} placeholder="es. I nostri auguri, {{nome}}" required />
              </div>
              <div className="campo">
                <label>Testo <span className="ob">*</span></label>
                <textarea name="corpo" rows={10} defaultValue={inModifica?.corpo ?? ""} placeholder={"Gentile {{nome}},\n\n…"} required />
              </div>
              <div className="form-piede">
                <button className="btn" type="submit">{inModifica ? "Salva le modifiche" : "Crea il template"}</button>
              </div>
            </form>
          </div>

          <div className="card">
            <div className="card-titolo">Variabili disponibili</div>
            <div className="card-sub">Si scrivono così: {"{{nome}}"} — e si riempiono coi dati veri del cliente.</div>
            <table>
              <tbody>
                {VARIABILI_DISPONIBILI.map((v) => (
                  <tr key={v.chiave}>
                    <td style={{ padding: "6px 0", width: 130 }}>
                      <code className="chip">{"{{" + v.chiave + "}}"}</code>
                    </td>
                    <td className="secondario piccolo" style={{ padding: "6px 0" }}>{v.descrizione}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
