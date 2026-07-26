import { notFound } from "next/navigation";
import {
  aggiungiVariabile,
  cambiaAbilitazione,
  eliminaScript,
  eliminaVariabile,
  salvaScript,
  salvaValori,
  salvaVariabile,
} from "@/app/actions";
import { CopiaScript, type VersioneApp } from "@/components/CopiaScript";
import { EditorCorpo } from "@/components/EditorCorpo";
import { prisma } from "@/lib/db";
import { componi, daCompilare, LINGUAGGI, risolviValori, TIPI_VARIABILE } from "@/lib/variabili";

export const dynamic = "force-dynamic";

export default async function DettaglioScript({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const script = await prisma.script.findUnique({
    where: { slug },
    include: {
      variabili: { orderBy: [{ ordine: "asc" }, { chiave: "asc" }] },
      abilitazioni: { include: { app: true, valori: true } },
    },
  });
  if (!script) notFound();

  const app = await prisma.appCollegata.findMany({ orderBy: [{ ordine: "asc" }, { nome: "asc" }] });

  // Per ogni app: l'abilitazione (se esiste) e i valori già impostati.
  const perApp = app.map((a) => {
    const abilitazione = script.abilitazioni.find((ab) => ab.appId === a.id) ?? null;
    const valori = new Map((abilitazione?.valori ?? []).map((v) => [v.variabileId, v.valore]));
    return { app: a, abilitazione, valori };
  });

  // Le versioni offerte nel riquadro «Script pronto da copiare»: quella coi soli
  // valori predefiniti, più una per ogni app dove lo script è acceso.
  const soloPredefiniti = risolviValori(script.variabili, {});
  const versioni: VersioneApp[] = [
    {
      chiave: "",
      nome: "Valori predefiniti (nessuna app)",
      corpo: componi(script.corpo, soloPredefiniti),
      segreti: script.variabili
        .filter((v) => v.tipo === "segreto")
        .map((v) => ({ chiave: v.chiave, etichetta: v.etichetta })),
      mancanti: soloPredefiniti.filter((v) => v.origine === "mancante" && v.obbligatoria).map((v) => v.chiave),
    },
    ...perApp
      .filter((p) => p.abilitazione?.attiva)
      .map((p) => {
        const valoriApp: Record<string, string> = {};
        for (const v of script.variabili) {
          const valore = p.valori.get(v.id);
          if (valore != null) valoriApp[v.chiave] = valore;
        }
        const risolte = risolviValori(script.variabili, valoriApp);
        return {
          chiave: p.app.chiave,
          nome: `Per ${p.app.nome}`,
          corpo: componi(script.corpo, risolte),
          segreti: script.variabili
            .filter((v) => v.tipo === "segreto")
            .map((v) => ({ chiave: v.chiave, etichetta: v.etichetta })),
          mancanti: risolte.filter((v) => v.origine === "mancante" && v.obbligatoria).map((v) => v.chiave),
        };
      }),
  ];

  const senzaValore = daCompilare(soloPredefiniti);

  return (
    <main className="main">
      <a className="ritorno" href="/">← Tutti gli script</a>
      <div className="page-head">
        <div>
          <h1 className="page-title">{script.nome}</h1>
          <p className="page-sub">
            <code className="inline">{script.slug}</code>{" "}
            {script.attivo ? (
              <span className="badge ok"><span className="dot" />attivo</span>
            ) : (
              <span className="badge spento">archiviato</span>
            )}{" "}
            <span className="badge neutro">
              {LINGUAGGI.find((l) => l.valore === script.linguaggio)?.nome ?? script.linguaggio}
            </span>
          </p>
        </div>
        <form action={eliminaScript}>
          <input type="hidden" name="id" value={script.id} />
          <button className="btn btn-pericolo" type="submit">Elimina</button>
        </form>
      </div>

      <CopiaScript versioni={versioni} />

      {/* ---------- Contenuto ----------
          La `key` cambia a ogni salvataggio: senza, React riuserebbe i campi già
          in pagina e i `defaultValue` resterebbero quelli di prima (il classico
          modulo che dopo il salvataggio mostra ancora il vecchio valore). */}
      <form action={salvaScript} key={script.aggiornatoIl.toISOString()}>
        <input type="hidden" name="id" value={script.id} />
        <div className="scheda">
          <div className="scheda-titolo">Contenuto dello script</div>
          <div className="modulo">
            <div className="campo-modulo">
              <label htmlFor="nome">Nome</label>
              <input id="nome" name="nome" defaultValue={script.nome} required />
            </div>
            <div className="campo-modulo">
              <label htmlFor="linguaggio">Linguaggio</label>
              <select id="linguaggio" name="linguaggio" defaultValue={script.linguaggio}>
                {LINGUAGGI.map((l) => (
                  <option key={l.valore} value={l.valore}>{l.nome}</option>
                ))}
              </select>
            </div>
            <div className="campo-modulo largo">
              <label htmlFor="descrizione">Cosa fa</label>
              <input id="descrizione" name="descrizione" defaultValue={script.descrizione ?? ""} />
            </div>
            <div className="campo-modulo">
              <label htmlFor="tag">Etichette (separate da virgola)</label>
              <input id="tag" name="tag" defaultValue={script.tag.join(", ")} placeholder="shopify, import, cron" />
            </div>
            <div className="campo-modulo">
              <label htmlFor="autore">Chi lo cura</label>
              <input id="autore" name="autore" defaultValue={script.autore ?? ""} />
            </div>
            <div className="campo-modulo largo">
              <label htmlFor="note">Istruzioni d&apos;uso e trappole</label>
              <textarea id="note" name="note" rows={3} defaultValue={script.note ?? ""} placeholder="Dove si incolla, ogni quanto si lancia, cosa NON fare…" />
            </div>
            <div className="campo-modulo largo">
              <label htmlFor="corpo">Testo dello script</label>
              <EditorCorpo valoreIniziale={script.corpo} dichiarate={script.variabili.map((v) => v.chiave)} />
            </div>
          </div>
          <div className="azioni-modulo">
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: "var(--text-secondary)", marginRight: "auto" }}>
              <input type="checkbox" name="attivo" defaultChecked={script.attivo} />
              Attivo (se lo spegni sparisce dalle API di tutte le app)
            </label>
            <button className="btn" type="submit">Salva</button>
          </div>
        </div>
      </form>

      {/* ---------- Variabili ---------- */}
      <div className="scheda">
        <div className="scheda-testa">
          <div>
            <div className="scheda-titolo" style={{ marginBottom: 4 }}>Variabili</div>
            <p className="campo-aiuto">
              Nel testo si richiamano con <code className="inline">{"{{NOME}}"}</code>. Il valore si prende da quello
              impostato per l&apos;app; se manca, dal predefinito qui sotto.
            </p>
          </div>
        </div>

        {script.variabili.length === 0 ? (
          <p className="campo-aiuto">Nessuna variabile: lo script è uguale per tutte le app.</p>
        ) : (
          <div className="var-lista">
            {script.variabili.map((v) => (
              <form className="var-riga" action={salvaVariabile} key={`${v.id}-${v.tipo}-${v.chiave}`}>
                <input type="hidden" name="id" value={v.id} />
                <input type="hidden" name="slug" value={script.slug} />
                <input className="var-chiave" name="chiave" defaultValue={v.chiave} aria-label="Nome della variabile" />
                <select name="tipo" defaultValue={v.tipo} aria-label="Tipo">
                  {TIPI_VARIABILE.map((t) => (
                    <option key={t.valore} value={t.valore}>{t.nome}</option>
                  ))}
                </select>
                <input
                  name="valorePredefinito"
                  defaultValue={v.valorePredefinito ?? ""}
                  placeholder={v.tipo === "segreto" ? "i segreti non si salvano" : "valore predefinito"}
                  disabled={v.tipo === "segreto"}
                  aria-label="Valore predefinito"
                />
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                    <input type="checkbox" name="obbligatoria" defaultChecked={v.obbligatoria} />
                    serve
                  </label>
                  <button className="btn btn-secondario small" type="submit">Salva</button>
                  <button className="btn btn-pericolo small" type="submit" formAction={eliminaVariabile}>Togli</button>
                </div>
                <div className="campo-modulo largo" style={{ gridColumn: "1 / -1" }}>
                  <input
                    name="etichetta"
                    defaultValue={v.etichetta ?? ""}
                    placeholder="A cosa serve questa variabile (aiuto per chi la compila)"
                    style={{ fontSize: 13 }}
                    aria-label="Descrizione della variabile"
                  />
                  {v.tipo === "scelta" && (
                    <input
                      name="opzioni"
                      defaultValue={v.opzioni.join(", ")}
                      placeholder="Opzioni ammesse, separate da virgola"
                      style={{ fontSize: 13, marginTop: 6 }}
                      aria-label="Opzioni"
                    />
                  )}
                  {v.tipo !== "scelta" && <input type="hidden" name="opzioni" value={v.opzioni.join(", ")} />}
                </div>
              </form>
            ))}
          </div>
        )}

        <form action={aggiungiVariabile} style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
          <input type="hidden" name="scriptId" value={script.id} />
          <input type="hidden" name="slug" value={script.slug} />
          <input
            name="chiave"
            placeholder="NOME_NUOVA_VARIABILE"
            className="var-chiave"
            style={{
              flex: "1 1 240px",
              font: "inherit",
              background: "var(--fill)",
              border: "1px solid transparent",
              borderRadius: "var(--radius-m)",
              padding: "9px 12px",
            }}
          />
          <button className="btn btn-secondario" type="submit">Aggiungi variabile</button>
        </form>
        {senzaValore.length > 0 && (
          <p className="campo-aiuto" style={{ marginTop: 10 }}>
            Senza un valore predefinito: {senzaValore.join(", ")} — vanno compilate app per app (o al momento della copia,
            se sono segreti).
          </p>
        )}
      </div>

      {/* ---------- Abilitazioni ---------- */}
      <div className="scheda">
        <div className="scheda-testa">
          <div>
            <div className="scheda-titolo" style={{ marginBottom: 4 }}>Abilitato per</div>
            <p className="campo-aiuto">
              Un&apos;app riceve questo script dalle API solo se l&apos;interruttore è acceso. Spegnendolo la
              configurazione resta: si può riaccendere senza rifare i valori.
            </p>
          </div>
          <a className="btn btn-secondario small" href="/app">Gestisci le app</a>
        </div>

        {app.length === 0 ? (
          <p className="campo-aiuto">
            Nessuna app collegata. <a href="/app" style={{ color: "var(--blue)" }}>Aggiungine una</a>.
          </p>
        ) : (
          perApp.map(({ app: a, abilitazione, valori }) => {
            const accesa = !!abilitazione?.attiva;
            return (
              <div className={`app-riga${accesa ? "" : " spenta"}`} key={a.id}>
                <form action={cambiaAbilitazione}>
                  <input type="hidden" name="scriptId" value={script.id} />
                  <input type="hidden" name="appId" value={a.id} />
                  <input type="hidden" name="slug" value={script.slug} />
                  <input type="hidden" name="attiva" value={accesa ? "0" : "1"} />
                  <button
                    type="submit"
                    className="interruttore"
                    role="switch"
                    aria-checked={accesa}
                    aria-label={`${accesa ? "Disabilita" : "Abilita"} per ${a.nome}`}
                    title={accesa ? "Disabilita per questa app" : "Abilita per questa app"}
                  />
                </form>
                <div className="cresci">
                  <div className="app-nome">
                    <span className="sb-dot" style={{ display: "inline-block", background: a.colore, marginRight: 8 }} />
                    {a.nome}
                    {!a.attiva && <span className="badge spento" style={{ marginLeft: 8 }}>app disattivata</span>}
                  </div>
                  <div className="app-chiave">{a.chiave}</div>
                </div>

                {accesa && abilitazione && (
                  <form action={salvaValori} style={{ width: "100%" }} key={abilitazione.aggiornataIl.toISOString()}>
                    <input type="hidden" name="abilitazioneId" value={abilitazione.id} />
                    <input type="hidden" name="slug" value={script.slug} />
                    {script.variabili.length > 0 && (
                      <div className="valori-app">
                        {script.variabili.map((v) => (
                          <div className="valore-campo" key={v.id}>
                            <label htmlFor={`v-${abilitazione.id}-${v.id}`}>{v.chiave}</label>
                            {v.tipo === "segreto" ? (
                              <input id={`v-${abilitazione.id}-${v.id}`} value="segreto: si compila alla copia" disabled readOnly />
                            ) : v.tipo === "scelta" && v.opzioni.length > 0 ? (
                              <select id={`v-${abilitazione.id}-${v.id}`} name={`valore-${v.id}`} defaultValue={valori.get(v.id) ?? ""}>
                                <option value="">— predefinito —</option>
                                {v.opzioni.map((o) => (
                                  <option key={o} value={o}>{o}</option>
                                ))}
                              </select>
                            ) : v.tipo === "booleano" ? (
                              <select id={`v-${abilitazione.id}-${v.id}`} name={`valore-${v.id}`} defaultValue={valori.get(v.id) ?? ""}>
                                <option value="">— predefinito —</option>
                                <option value="true">true</option>
                                <option value="false">false</option>
                              </select>
                            ) : (
                              <input
                                id={`v-${abilitazione.id}-${v.id}`}
                                name={`valore-${v.id}`}
                                type={v.tipo === "numero" ? "number" : "text"}
                                defaultValue={valori.get(v.id) ?? ""}
                                placeholder={v.valorePredefinito ?? "nessun valore"}
                              />
                            )}
                            {v.etichetta && <span className="campo-aiuto">{v.etichetta}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="azioni-modulo">
                      <input
                        name="note"
                        defaultValue={abilitazione.note ?? ""}
                        placeholder="Nota per questa app (facoltativa)"
                        style={{
                          flex: 1,
                          font: "inherit",
                          fontSize: 13,
                          background: "var(--fill)",
                          border: "1px solid transparent",
                          borderRadius: "var(--radius-m)",
                          padding: "8px 12px",
                        }}
                      />
                      <button className="btn btn-secondario small" type="submit">Salva i valori</button>
                    </div>
                  </form>
                )}
              </div>
            );
          })
        )}
      </div>

      {script.note && (
        <div className="scheda">
          <div className="scheda-titolo">Istruzioni</div>
          <p className="testo-guida" style={{ whiteSpace: "pre-wrap" }}>{script.note}</p>
        </div>
      )}
    </main>
  );
}
