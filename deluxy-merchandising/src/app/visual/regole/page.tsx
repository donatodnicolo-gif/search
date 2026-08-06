import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { prisma } from "@/lib/db";
import { REGOLE } from "@/lib/ordinamento-vetrina";
import { etichettaPassi, parsePassi } from "@/lib/regole-ordine";
import { creaRegolaOrdine, eliminaRegolaOrdine } from "@/lib/azioni-regole-ordine";
import { ritardiPerRegola } from "@/lib/regole-in-ritardo";

export const dynamic = "force-dynamic";

const NOMI_METRICHE = Object.fromEntries(REGOLE.map((r) => [r.chiave, r.nome]));

// Le **regole d'ordine salvate**: si scrivono una volta, hanno un nome e si
// riusano. Prima l'ordine di una vetrina si poteva esprimere solo con le sei
// metriche fisse, da riscegliere ogni volta collezione per collezione.
export default async function RegolePage({
  searchParams,
}: {
  searchParams: Promise<{ esito?: string; messaggio?: string; elimina?: string }>;
}) {
  const sp = await searchParams;
  const ritardi = await ritardiPerRegola();
  const regole = await prisma.regolaOrdine.findMany({
    orderBy: { nome: "asc" },
    include: { _count: { select: { collezioni: true, tipologie: true } } },
  });

  return (
    <div className="layout">
      <Sidebar attiva="visual" />
      <main className="main" style={{ maxWidth: 980 }}>
        <a className="ritorno" href="/visual">← Visual merchandising</a>
        <div className="page-head">
          <div>
            <h1 className="page-title">Regole d&apos;ordine</h1>
            <p className="page-sub">
              Una regola è una <b>sequenza di passi in priorità</b>: il primo decide l&apos;ordine, i successivi
              spezzano i pareggi. Un passo può essere una <b>metrica</b> (più venduti, margine, prezzo…) oppure un{" "}
              <b>attributo del prodotto</b> — categoria, fornitore, tag, risposta al bisogno, prezzo — e in quel caso{" "}
              <b>porta in cima chi corrisponde</b> senza togliere nessuno dalla fila.
            </p>
          </div>
        </div>

        {sp.messaggio && (
          <div className={`nota-info${sp.esito === "errore" ? " nota-errore" : ""}`}>
            <span className="nota-icona">{sp.esito === "errore" ? "△" : "◆"}</span>
            <span>{sp.messaggio}</span>
          </div>
        )}

        <div className="scheda">
          <div className="scheda-titolo">Nuova regola</div>
          <form action={creaRegolaOrdine} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input name="nome" placeholder="Nome della regola (es. Vetrina San Valentino)" required style={{ minWidth: 300 }} />
            <input name="descrizione" placeholder="A cosa serve (facoltativo)" style={{ minWidth: 260 }} />
            <button type="submit" className="btn btn-primario">Crea e scrivila</button>
          </form>
          <p className="page-sub" style={{ marginTop: 10, marginBottom: 0 }}>
            La regola nasce vuota e si apre subito: un nome da solo non ordina niente.
          </p>
        </div>

        {sp.elimina && (
          <div className="nota-info nota-errore">
            <span className="nota-icona">△</span>
            <span>
              Eliminando la regola, le collezioni che la usano tornano <b>«solo a mano»</b>: l&apos;ordine già scritto
              sulle vetrine <b>non si tocca</b> e non viene rimescolato. Quello che si perde sono i passi della regola.
            </span>
          </div>
        )}

        <div className="scheda">
          <div className="scheda-titolo">Le regole salvate ({regole.length})</div>
          {regole.length === 0 ? (
            <div className="vuoto-mini">
              Nessuna regola salvata. Finché non ce n&apos;è una, le collezioni si ordinano con le regole rapide della
              loro scheda, che vanno riscelte ogni volta.
            </div>
          ) : (
            <div className="tabella-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Regola</th>
                    <th>Come ordina</th>
                    <th className="num">Collezioni</th>
                    <th className="num">Da rifare</th>
                    <th className="num">Tipologie</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {regole.map((r) => {
                    const passi = parsePassi(r.passi);
                    return (
                      <tr key={r.id} className="riga-cliccabile">
                        <td>
                          <Link href={`/visual/regole/${r.id}`} className="cella-nome link-riga">
                            {r.nome}
                          </Link>
                          {r.descrizione && <div className="cella-sub">{r.descrizione}</div>}
                        </td>
                        <td>
                          <span className="cella-sub">
                            {passi.length === 0 ? "Da finire di scrivere" : etichettaPassi(passi, NOMI_METRICHE)}
                          </span>
                        </td>
                        {/* Dove è in uso: una regola usata da nessuno è una
                            regola che qualcuno ha scritto e poi dimenticato. */}
                        <td className="num">{r._count.collezioni || "—"}</td>
                        {/* Quante hanno ancora una fila decisa dalla versione
                            precedente della regola: senza questo numero
                            «Riapplica ovunque» si preme alla cieca. */}
                        <td className="num">
                          {ritardi.get(r.id) ? (
                            <span className="pill-ritardo">{ritardi.get(r.id)}</span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="num">{r._count.tipologie || "—"}</td>
                        {/* **Cancellare chiede conferma**, e la conferma dice
                            cosa succede alle collezioni che la usano: tornano
                            «solo a mano» e **l'ordine gia' scritto resta**.
                            Cancellare una regola non e' chiedere di rimescolare
                            le vetrine. */}
                        <td style={{ position: "relative", zIndex: 1 }}>
                          {sp.elimina === r.id ? (
                            <span style={{ display: "flex", gap: 6, alignItems: "center", whiteSpace: "nowrap" }}>
                              <form action={eliminaRegolaOrdine.bind(null, r.id)}>
                                <button type="submit" className="btn btn-secondario" style={{ fontSize: 12, padding: "3px 10px" }}>
                                  Sì, elimina
                                </button>
                              </form>
                              <Link className="icon-btn" href="/visual/regole" title="Annulla">↩</Link>
                            </span>
                          ) : (
                            <Link
                              className="icon-btn"
                              href={`/visual/regole?elimina=${r.id}`}
                              title={
                                r._count.collezioni > 0
                                  ? `Elimina: le ${r._count.collezioni} collezioni che la usano tornano «solo a mano»`
                                  : "Elimina la regola"
                              }
                            >
                              ×
                            </Link>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
