import { prisma } from "@/lib/db";
import { dentroOppureFuori } from "@/lib/sessione-server";
import { archiviaTemplate, creaTemplateDiPartenza, eliminaTemplate, salvaTemplate } from "@/lib/actions";
import { dataIt } from "@/lib/etichette";
import { VARIABILI_DISPONIBILI } from "@/lib/variabili";
import ConfermaElimina from "@/components/ConfermaElimina";

export const dynamic = "force-dynamic";

type Query = { modifica?: string; esito?: string; errore?: string; archivio?: string };

// TEMPLATE — i modelli delle mail personalizzate. Le {{variabili}} si
// riempiono da sole coi dati del cliente (e dell'evento) al momento della
// composizione: si scrive una volta, si personalizza sempre.
//
// Gli esistenti stanno in TABELLA (richiesta dell'utente 10/09): una riga per
// template, «Modifica» apre il form a destra, «Archivia» lo toglie da Componi
// senza perderlo, «Elimina» lo cancella davvero.
export default async function Template({ searchParams }: { searchParams: Promise<Query> }) {
  await dentroOppureFuori(); // revoca: sessione con password vecchia = fuori
  const sp = await searchParams;
  const mostraArchivio = sp.archivio === "1";
  const [templates, quantiArchiviati] = await Promise.all([
    prisma.templateMail.findMany({
      where: mostraArchivio ? { archiviatoIl: { not: null } } : { archiviatoIl: null },
      orderBy: { nome: "asc" },
    }),
    prisma.templateMail.count({ where: { archiviatoIl: { not: null } } }),
  ]);
  const inModifica = sp.modifica ? await prisma.templateMail.findUnique({ where: { id: sp.modifica } }) : null;

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

      {sp.esito === "ok" ? <div className="ok-card">Fatto.</div> : null}
      {sp.errore ? <div className="errore-card">{sp.errore}</div> : null}

      <div className="filtri riga-chips-scorri">
        <a className={`filtro-pillola${!mostraArchivio ? " attivo" : ""}`} href="/mail/template">In uso</a>
        <a className={`filtro-pillola${mostraArchivio ? " attivo" : ""}`} href="/mail/template?archivio=1">
          Archivio{quantiArchiviati ? ` (${quantiArchiviati})` : ""}
        </a>
      </div>

      <div className="griglia lavoro" style={{ alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {templates.length === 0 ? (
            <div className="card vuoto">
              <div className="quadratino">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                  <path d="M6 3.5h7.5L18 8v12.5H6zM12.5 3.5V8H17M8 12h6M8 15.5h6" />
                </svg>
              </div>
              <h3>{mostraArchivio ? "Nessun template in archivio" : "Nessun template"}</h3>
              {mostraArchivio ? (
                <p>Quelli archiviati compaiono qui, e si possono ripristinare.</p>
              ) : (
                <>
                  <p>Parti dai tre modelli Deluxy — auguri, invito, ben ritrovare — e falli tuoi.</p>
                  <form action={creaTemplateDiPartenza} style={{ marginTop: 12 }}>
                    <button className="btn" type="submit">Crea i template di partenza</button>
                  </form>
                </>
              )}
            </div>
          ) : (
            <div className="card tabella-card">
              <div className="tabella-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Template</th>
                      <th>Oggetto</th>
                      <th>Aggiornato</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {templates.map((t) => (
                      <tr key={t.id} style={inModifica?.id === t.id ? { background: "var(--gold-soft)" } : undefined}>
                        <td>
                          <a href={`/mail/template?modifica=${t.id}${mostraArchivio ? "&archivio=1" : ""}`}>
                            <div className="cella-principale">{t.nome}</div>
                            <div className="cella-sotto">{t.corpo.length > 90 ? `${t.corpo.slice(0, 90)}…` : t.corpo}</div>
                          </a>
                        </td>
                        <td className="piccolo">{t.oggetto}</td>
                        <td className="secondario piccolo">
                          {dataIt(t.aggiornatoIl)}
                          {t.archiviatoIl ? <div className="cella-sotto">archiviato {dataIt(t.archiviatoIl)}</div> : null}
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
                            <a className="btn ghost mini" href={`/mail/template?modifica=${t.id}${mostraArchivio ? "&archivio=1" : ""}`}>
                              Modifica
                            </a>
                            <form action={archiviaTemplate}>
                              <input type="hidden" name="id" value={t.id} />
                              {t.archiviatoIl ? <input type="hidden" name="ripristina" value="1" /> : null}
                              <button className="btn ghost mini" type="submit">{t.archiviatoIl ? "Ripristina" : "Archivia"}</button>
                            </form>
                            <ConfermaElimina
                              mini
                              titolo={`Elimino il template «${t.nome}»?`}
                              conseguenza="Il testo va perso per sempre; le mail già inviate con questo template restano nel registro. Se può servire ancora, meglio archiviarlo."
                            >
                              <form action={eliminaTemplate}>
                                <input type="hidden" name="id" value={t.id} />
                                <button className="btn rosso" type="submit">Elimina il template</button>
                              </form>
                            </ConfermaElimina>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
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
                    <td style={{ padding: "6px 0 6px", paddingRight: 10 }}>
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
