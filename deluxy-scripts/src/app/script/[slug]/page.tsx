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
import { CopiaTesto, type VersioneApp } from "@/components/CopiaTesto";
import { EditorCorpo } from "@/components/EditorCorpo";
import { prisma } from "@/lib/db";
import { CANALI, CATEGORIE, componi, daCompilare, risolviValori, TIPI_VARIABILE } from "@/lib/variabili";

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

  // Le versioni offerte nel riquadro «Usa questo testo»: quella coi soli valori
  // predefiniti, più una per ogni app dove il testo è acceso. `daCompilare` sono
  // le variabili senza valore: si compilano lì, al momento di mandarlo.
  const dettagli = new Map(script.variabili.map((v) => [v.chiave, v]));
  const scoperte = (risolte: ReturnType<typeof risolviValori>) =>
    risolte
      .filter((r) => r.origine === "mancante")
      .map((r) => {
        const v = dettagli.get(r.chiave);
        return {
          chiave: r.chiave,
          etichetta: v?.etichetta ?? null,
          tipo: v?.tipo ?? "testo",
          opzioni: v?.opzioni ?? [],
        };
      });

  const soloPredefiniti = risolviValori(script.variabili, {});
  const versioni: VersioneApp[] = [
    {
      chiave: "",
      nome: "Valori predefiniti (nessuna app)",
      canale: script.canale,
      oggetto: script.oggetto ? componi(script.oggetto, soloPredefiniti) : null,
      corpo: componi(script.corpo, soloPredefiniti),
      daCompilare: scoperte(soloPredefiniti),
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
          canale: script.canale,
          oggetto: script.oggetto ? componi(script.oggetto, risolte) : null,
          corpo: componi(script.corpo, risolte),
          daCompilare: scoperte(risolte),
        };
      }),
  ];

  const senzaValore = daCompilare(soloPredefiniti);

  return (
    <main className="main">
      <a className="ritorno" href="/">← Tutti i testi</a>
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
              {CATEGORIE.find((c) => c.valore === script.categoria)?.nome ?? script.categoria}
            </span>{" "}
            <span className="badge neutro">
              {CANALI.find((c) => c.valore === script.canale)?.nome ?? script.canale}
            </span>
          </p>
        </div>
        <form action={eliminaScript}>
          <input type="hidden" name="id" value={script.id} />
          <button className="btn btn-pericolo" type="submit">Elimina</button>
        </form>
      </div>

      <CopiaTesto versioni={versioni} />

      {/* ---------- Contenuto ----------
          La `key` cambia a ogni salvataggio: senza, React riuserebbe i campi già
          in pagina e i `defaultValue` resterebbero quelli di prima (il classico
          modulo che dopo il salvataggio mostra ancora il vecchio valore). */}
      <form action={salvaScript} key={script.aggiornatoIl.toISOString()}>
        <input type="hidden" name="id" value={script.id} />
        <div className="scheda">
          <div className="scheda-titolo">Il testo</div>
          <div className="modulo">
            <div className="campo-modulo">
              <label htmlFor="nome">Titolo</label>
              <input id="nome" name="nome" defaultValue={script.nome} required />
            </div>
            <div className="campo-modulo">
              <label htmlFor="descrizione">Quando si usa</label>
              <input id="descrizione" name="descrizione" defaultValue={script.descrizione ?? ""} />
            </div>
            <div className="campo-modulo">
              <label htmlFor="categoria">Categoria</label>
              <select id="categoria" name="categoria" defaultValue={script.categoria}>
                {CATEGORIE.map((c) => (
                  <option key={c.valore} value={c.valore}>{c.nome}</option>
                ))}
              </select>
            </div>
            <div className="campo-modulo">
              <label htmlFor="canale">Canale</label>
              <select id="canale" name="canale" defaultValue={script.canale}>
                {CANALI.map((c) => (
                  <option key={c.valore} value={c.valore}>{c.nome}</option>
                ))}
              </select>
            </div>
            <div className="campo-modulo largo">
              <label htmlFor="oggetto">Oggetto (per le email)</label>
              <input
                id="oggetto"
                name="oggetto"
                defaultValue={script.oggetto ?? ""}
                placeholder="Anche qui valgono le variabili"
              />
            </div>
            <div className="campo-modulo">
              <label htmlFor="tag">Etichette (separate da virgola)</label>
              <input id="tag" name="tag" defaultValue={script.tag.join(", ")} placeholder="natale, b2b, hotel" />
            </div>
            <div className="campo-modulo">
              <label htmlFor="autore">Chi lo cura</label>
              <input id="autore" name="autore" defaultValue={script.autore ?? ""} />
            </div>
            <div className="campo-modulo largo">
              <label htmlFor="note">Come si usa</label>
              <textarea
                id="note"
                name="note"
                rows={3}
                defaultValue={script.note ?? ""}
                placeholder="A chi si manda, in che momento, cosa NON scrivere…"
              />
            </div>
            <div className="campo-modulo largo">
              <label htmlFor="corpo">Testo</label>
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
              impostato per l&apos;app; se manca, dal predefinito qui sotto; se manca anche quello, si compila al
              momento di mandare il messaggio.
            </p>
          </div>
        </div>

        {script.variabili.length === 0 ? (
          <p className="campo-aiuto">Nessuna variabile: il testo è identico per tutti.</p>
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
                  placeholder="valore fisso (vuoto = si compila ogni volta)"
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
                    placeholder="Che cosa ci va (aiuto per chi la compila): «il nome di chi riceve»"
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
            Senza un valore fisso: {senzaValore.join(", ")} — si compilano app per app qui sotto, oppure una per una nel
            riquadro «Usa questo testo», prima di mandare il messaggio.
          </p>
        )}
      </div>

      {/* ---------- Abilitazioni ---------- */}
      <div className="scheda">
        <div className="scheda-testa">
          <div>
            <div className="scheda-titolo" style={{ marginBottom: 4 }}>Abilitato per</div>
            <p className="campo-aiuto">
              Un&apos;app vede questo testo solo se l&apos;interruttore è acceso, e con i valori che imposti qui: la
              firma di Customer Service non è quella del commerciale. Spegnendolo la configurazione resta.
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
                            {v.tipo === "scelta" && v.opzioni.length > 0 ? (
                              <select id={`v-${abilitazione.id}-${v.id}`} name={`valore-${v.id}`} defaultValue={valori.get(v.id) ?? ""}>
                                <option value="">— predefinito —</option>
                                {v.opzioni.map((o) => (
                                  <option key={o} value={o}>{o}</option>
                                ))}
                              </select>
                            ) : (
                              <input
                                id={`v-${abilitazione.id}-${v.id}`}
                                name={`valore-${v.id}`}
                                type={v.tipo === "numero" ? "number" : v.tipo === "data" ? "date" : "text"}
                                defaultValue={valori.get(v.id) ?? ""}
                                placeholder={v.valorePredefinito ?? "si compila al momento"}
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
          <div className="scheda-titolo">Come si usa</div>
          <p className="testo-guida" style={{ whiteSpace: "pre-wrap" }}>{script.note}</p>
        </div>
      )}
    </main>
  );
}
