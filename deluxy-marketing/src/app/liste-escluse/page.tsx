import { Sidebar } from "@/components/Sidebar";
import { ContaSelezionate, SelezionaTutte } from "@/components/SelezioneRighe";
import { prisma } from "@/lib/db";
import { ETICHETTA_BRAND, formattaDataOra, testoKeywordGoogle } from "@/lib/dominio";
import {
  aggiungiParoleALista,
  applicaListaACampagne,
  creaListaNegative,
  eliminaListaNegative,
  togliParolaDaLista,
} from "@/lib/azioni-liste";

export const dynamic = "force-dynamic";

// Le liste di parole escluse: si scrivono una volta, si applicano a più
// campagne.
//
// ⚠️ È il seguito naturale di «Escludi parole» sulla campagna: quello serve per
// una parola che riguarda QUELLA campagna, questo per le esclusioni che valgono
// dappertutto — i concorrenti, «gratis», «lavoro», «fai da te». Ricopiarle a
// mano su venti campagne è il lavoro che nessuno finisce mai, e soprattutto che
// nessuno aggiorna quando cambia.
export default async function ListeEscluse({
  searchParams,
}: {
  searchParams: Promise<{ aperta?: string; esito?: string; errore?: string }>;
}) {
  const sp = await searchParams;

  const [liste, campagne, applicazioni] = await Promise.all([
    prisma.listaNegative.findMany({
      include: { parole: { orderBy: { testo: "asc" } } },
      orderBy: { nome: "asc" },
    }),
    prisma.campagna.findMany({
      where: { canale: "google_ads", stato: { notIn: ["defunta", "conclusa"] } },
      select: { id: true, nome: true, brand: true, account: true, statoPiattaforma: true },
      orderBy: [{ brand: "asc" }, { nome: "asc" }],
    }),
    // Dove ogni lista è già arrivata: si legge dalle operazioni, che sono il
    // registro di quello che è stato scritto davvero su Google.
    prisma.operazioneAdv.findMany({
      where: { tipo: "lista_negative" },
      select: { campagnaId: true, stato: true, parametri: true, eseguitaIl: true, creataIl: true },
      orderBy: { creataIl: "desc" },
      take: 500,
    }),
  ]);

  // nome lista → campagnaId → stato
  const dove = new Map<string, Map<string, { stato: string; quando: Date }>>();
  for (const o of applicazioni) {
    if (!o.campagnaId) continue;
    let nome = "";
    try {
      nome = String(JSON.parse(o.parametri ?? "{}").nome ?? "");
    } catch {
      continue;
    }
    if (!nome) continue;
    const per = dove.get(nome) ?? new Map();
    // La prima che si incontra è la più recente (ordinate per data desc).
    if (!per.has(o.campagnaId)) per.set(o.campagnaId, { stato: o.stato, quando: o.eseguitaIl ?? o.creataIl });
    dove.set(nome, per);
  }

  const aperta = sp.aperta ?? liste[0]?.id ?? null;

  return (
    <div className="layout">
      <Sidebar attiva="liste-escluse" />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Liste di parole escluse</h1>
            <p className="page-sub">
              Le esclusioni che valgono per più campagne — concorrenti, «gratis», «lavoro», «fai da
              te» — scritte <b>una volta sola</b> e applicate dove servono.
            </p>
          </div>
        </div>

        {sp.esito && <div className="nota-ok">{sp.esito}</div>}
        {sp.errore && <div className="nota-avviso">{sp.errore}</div>}

        {/* ⚠️ Come funziona davvero, detto prima di tutto: chi non lo sa
            crederebbe che «applica» scriva subito, o che la lista sia una sola
            per tutti i brand. Sono le due cose che, sbagliate, costano di più. */}
        <div className="nota-info">
          <span className="nota-icona">◈</span>
          <span>
            Su Google queste sono <b>liste condivise</b>: esistono una volta e le campagne ci si
            agganciano, quindi correggere una parola vale ovunque — non c&apos;è niente da ripassare.
            Ma <b>vivono dentro un account</b>: applicare la stessa lista alle campagne di un altro
            brand ne crea una <b>copia</b> in quell&apos;account, e da lì in poi sono due liste da
            tenere allineate. Da qui non si scrive niente su Google: si mette in coda, e si approva
            in <a href="/operazioni">Operazioni</a>.
          </span>
        </div>

        {/* ── Una lista nuova ─────────────────────────────────────────── */}
        <section className="scheda">
          <div className="scheda-titolo">Nuova lista</div>
          <form className="modulo" action={creaListaNegative}>
            <div className="campo-modulo">
              <label>Nome</label>
              {/* ⚠️ Il nome è la chiave con cui lo script ritrova la lista dentro
                  Google Ads: rinominarla qui vuol dire crearne una nuova là. */}
              <input name="nome" required maxLength={80} placeholder="es. Concorrenti — Flowers" />
            </div>
            <div className="campo-modulo">
              <label>Corrispondenza delle parole</label>
              <select name="corrispondenza" defaultValue="exact">
                <option value="exact">Esatta — spegne quella ricerca e basta</option>
                <option value="phrase">Frase — le ricerche che la contengono in quell&apos;ordine</option>
                <option value="broad">Generica — tutte le ricerche con quelle parole</option>
              </select>
            </div>
            <div className="campo-modulo largo">
              <label>A cosa serve</label>
              <input name="descrizione" maxLength={200} placeholder="Una riga per ricordarselo fra sei mesi" />
            </div>
            <div className="campo-modulo largo">
              <label>Parole, una per riga</label>
              <textarea name="parole" rows={5} placeholder={"interflora\nfloraqueen\ngratis\nlavoro"} />
            </div>
            <div className="campo-modulo largo">
              <button className="btn small" type="submit">
                Crea la lista
              </button>
            </div>
          </form>
        </section>

        {liste.length === 0 ? (
          <div className="vuoto-mini">
            Nessuna lista. La prima che di solito serve è quella dei <b>concorrenti</b>: sono le
            ricerche che costano di più e convertono di meno, e valgono per tutte le campagne del
            brand.
          </div>
        ) : (
          liste.map((l) => {
            const applicata = dove.get(l.nome) ?? new Map();
            const eseguite = [...applicata.values()].filter((v) => v.stato === "eseguita").length;
            const inCoda = [...applicata.values()].filter((v) => ["in_attesa", "approvata"].includes(v.stato)).length;
            const apertaQui = aperta === l.id;

            return (
              <section className="scheda" key={l.id} id={l.id}>
                <div
                  className="scheda-titolo"
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}
                >
                  <span>
                    {l.nome} <span className="cella-sub">({l.parole.length} parole)</span>
                  </span>
                  <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    {eseguite > 0 && (
                      <span className="tag-salute" style={{ color: "var(--green)" }}>
                        <span className="dot" />
                        su {eseguite} campagne
                      </span>
                    )}
                    {inCoda > 0 && (
                      <span className="tag-salute" style={{ color: "var(--orange)" }}>
                        <span className="dot" />
                        {inCoda} in coda
                      </span>
                    )}
                    {!apertaQui && (
                      <a className="btn small btn-secondario" href={`/liste-escluse?aperta=${l.id}#${l.id}`}>
                        Apri
                      </a>
                    )}
                  </span>
                </div>
                {l.descrizione && (
                  <p className="cella-sub" style={{ whiteSpace: "normal", marginBottom: 10 }}>{l.descrizione}</p>
                )}

                {!apertaQui ? (
                  <p className="cella-sub">
                    {l.parole
                      .slice(0, 8)
                      .map((p) => testoKeywordGoogle(p.testo, p.corrispondenza))
                      .join(" · ")}
                    {l.parole.length > 8 && ` … e altre ${l.parole.length - 8}`}
                  </p>
                ) : (
                  <>
                    {/* ── Le parole ─────────────────────────────────── */}
                    <div className="brief-blocco" style={{ marginBottom: 14 }}>
                      <div className="brief-sotto">Parole ({l.parole.length})</div>
                      {l.parole.length === 0 ? (
                        <div className="vuoto-mini">Ancora vuota.</div>
                      ) : (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                          {l.parole.map((p) => (
                            <span
                              key={p.id}
                              className="pill-opt"
                              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                            >
                              {testoKeywordGoogle(p.testo, p.corrispondenza)}
                              {/* ⚠️ Togliere una parola QUI non la toglie da
                                  Google: gli Script non sanno rimuovere una
                                  parola da una lista condivisa. Serve a non
                                  ripeterla nelle prossime applicazioni. */}
                              <form action={togliParolaDaLista} style={{ display: "inline" }}>
                                <input type="hidden" name="id" value={p.id} />
                                <button
                                  type="submit"
                                  className="link-come-testo"
                                  title="Toglila dalla lista dell'app. ⚠️ Su Google resta: gli Script non sanno rimuoverla da una lista condivisa."
                                  style={{ color: "var(--text-tertiary)", lineHeight: 1 }}
                                >
                                  ✕
                                </button>
                              </form>
                            </span>
                          ))}
                        </div>
                      )}

                      <form className="modulo" action={aggiungiParoleALista} style={{ marginTop: 12 }}>
                        <input type="hidden" name="listaId" value={l.id} />
                        <div className="campo-modulo largo">
                          <label>Aggiungine altre, una per riga</label>
                          <textarea name="parole" rows={3} />
                        </div>
                        <div className="campo-modulo">
                          <label>Corrispondenza</label>
                          <select name="corrispondenza" defaultValue="exact">
                            <option value="exact">Esatta</option>
                            <option value="phrase">Frase</option>
                            <option value="broad">Generica</option>
                          </select>
                        </div>
                        <div className="campo-modulo">
                          <label>&nbsp;</label>
                          <button className="btn small btn-secondario" type="submit">
                            Aggiungi
                          </button>
                        </div>
                      </form>
                    </div>

                    {/* ── Dove applicarla ───────────────────────────── */}
                    <form action={applicaListaACampagne}>
                      <input type="hidden" name="listaId" value={l.id} />
                      <div className="brief-sotto" style={{ marginBottom: 8 }}>
                        Applicala alle campagne{" "}
                        <span className="cella-sub" style={{ fontWeight: 400 }}>
                          — una operazione per campagna, così puoi dire sì a cinque e no a una
                        </span>
                      </div>
                      <div style={{ overflowX: "auto" }}>
                        <table>
                          <thead>
                            <tr>
                              <th style={{ width: 34 }}>
                                <SelezionaTutte nome="campagne" titolo="Spunta tutte le campagne" />
                              </th>
                              <th>Campagna</th>
                              <th>Brand</th>
                              <th>Su Google</th>
                              <th>Questa lista</th>
                            </tr>
                          </thead>
                          <tbody>
                            {campagne.map((c) => {
                              const stato = applicata.get(c.id);
                              return (
                                <tr key={c.id}>
                                  <td>
                                    <input type="checkbox" name="campagne" value={c.id} aria-label={`Scegli ${c.nome}`} />
                                  </td>
                                  <td className="cella-nome" style={{ maxWidth: 320 }}>
                                    <a href={`/campagne/${c.id}`}>{c.nome}</a>
                                  </td>
                                  <td className="cella-muta">{ETICHETTA_BRAND[c.brand ?? ""] ?? c.brand}</td>
                                  <td className="cella-muta">
                                    {c.statoPiattaforma === "PAUSED" ? "in pausa" : "attiva"}
                                  </td>
                                  <td className="cella-muta">
                                    {!stato ? (
                                      "—"
                                    ) : stato.stato === "eseguita" ? (
                                      <span style={{ color: "var(--green)" }}>
                                        applicata il {formattaDataOra(stato.quando)}
                                      </span>
                                    ) : ["in_attesa", "approvata"].includes(stato.stato) ? (
                                      <span style={{ color: "var(--orange)" }}>in coda</span>
                                    ) : (
                                      stato.stato
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                        <ContaSelezionate
                          nome="campagne"
                          vuoto="Applica alle selezionate"
                          uno="Applica a 1 campagna"
                          molte="Applica a {n} campagne"
                        />
                        <span className="cella-sub" style={{ whiteSpace: "normal" }}>
                          Riapplicarla a una campagna che ce l&apos;ha già serve a portarle le parole
                          aggiunte dopo: lo script salta quello che c&apos;è e scrive solo il resto.
                        </span>
                      </div>
                    </form>

                    <div style={{ marginTop: 14 }}>
                      <form action={eliminaListaNegative}>
                        <input type="hidden" name="id" value={l.id} />
                        <button
                          className="btn small btn-secondario"
                          type="submit"
                          title="Toglie la lista dall'app. ⚠️ Su Google resta com'è, con le campagne agganciate: gli Script non sanno cancellarla."
                        >
                          Togli la lista dall&apos;app
                        </button>
                      </form>
                    </div>
                  </>
                )}
              </section>
            );
          })
        )}
      </main>
    </div>
  );
}
