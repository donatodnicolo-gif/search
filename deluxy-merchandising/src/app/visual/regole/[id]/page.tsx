import { notFound } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { CostruttorePassi } from "@/components/CostruttorePassi";
import { prisma } from "@/lib/db";
import { parsePassi } from "@/lib/regole-ordine";
import { vociPassi } from "@/lib/voci-passi";
import { collezioniInRitardo } from "@/lib/regole-in-ritardo";
import { eliminaRegolaOrdine, riapplicaRegolaOvunque, rinominaRegolaOrdine } from "@/lib/azioni-regole-ordine";

export const dynamic = "force-dynamic";

// La scheda di una regola: qui si scrive la sequenza di passi. Ogni passo dice
// **cosa conta**, e l'ordine dei passi **è** la priorità: il primo decide, gli
// altri spezzano i pareggi. Lo stesso costruttore sta anche dentro la scheda di
// una collezione, così le condizioni si possono scrivere davanti alla fila.
export default async function RegolaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [r, voci] = await Promise.all([
    prisma.regolaOrdine.findUnique({
      where: { id },
      include: {
        collezioni: { select: { id: true, titolo: true, negozio: true }, orderBy: { titolo: "asc" }, take: 40 },
        _count: { select: { collezioni: true, tipologie: true } },
      },
    }),
    vociPassi(),
  ]);
  if (!r) notFound();
  // Quante collezioni mostrano ancora una fila decisa dalla regola vecchia.
  const indietro = await collezioniInRitardo(id);
  const passi = parsePassi(r.passi);

  return (
    <div className="layout">
      <Sidebar attiva="visual" />
      <main className="main" style={{ maxWidth: 980 }}>
        <a className="ritorno" href="/visual/regole">← Regole d&apos;ordine</a>
        <div className="page-head">
          <div>
            <h1 className="page-title">{r.nome}</h1>
            <p className="page-sub">
              {passi.length === 0 ? (
                <>Nessun passo: questa regola non ordina ancora niente.</>
              ) : (
                <>
                  <b>{passi.length}</b> passi in priorità · usata da <b>{r._count.collezioni}</b> collezioni e{" "}
                  <b>{r._count.tipologie}</b> tipologie
                </>
              )}
            </p>
          </div>
          {r._count.collezioni > 0 && (
            <form action={riapplicaRegolaOvunque.bind(null, r.id)}>
              <button type="submit" className={`btn ${indietro.length > 0 ? "btn-primario" : "btn-secondario"}`}>
                {indietro.length > 0
                  ? `Riapplica alle ${indietro.length} rimaste indietro`
                  : `Riapplica alle ${r._count.collezioni} collezioni`}
              </button>
            </form>
          )}
        </div>

        {indietro.length > 0 && (
          <div className="nota-info">
            <span className="nota-icona">◆</span>
            <span>
              <b>{indietro.length}</b> {indietro.length === 1 ? "collezione mostra" : "collezioni mostrano"} ancora una
              fila decisa da una versione precedente di questa regola. Non le tocchiamo da sole: rimescolare vetrine che
              nessuno stava guardando sarebbe peggio. Si rifanno col pulsante qui sopra.
            </span>
          </div>
        )}

        <div className="scheda">
          <div className="scheda-titolo">Come ordina</div>
          <CostruttorePassi regolaId={r.id} passi={passi} voci={voci} />
        </div>

        {r.collezioni.length > 0 && (
          <div className="scheda">
            <div className="scheda-titolo">Collezioni che la usano ({r._count.collezioni})</div>
            <div className="tabella-wrap">
              <table>
                <tbody>
                  {r.collezioni.map((c) => (
                    <tr key={c.id} className="riga-cliccabile">
                      <td>
                        <a href={`/visual/${c.id}`} className="cella-nome link-riga">{c.titolo}</a>
                        <div className="cella-sub">
                          {c.negozio}
                          {indietro.includes(c.id) && (
                            <span className="pill-ritardo" style={{ marginLeft: 8 }}>ordine da rifare</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {r._count.collezioni > r.collezioni.length && (
              <p className="page-sub" style={{ marginTop: 12 }}>
                Mostrate le prime {r.collezioni.length} di {r._count.collezioni}.
              </p>
            )}
          </div>
        )}

        <div className="scheda">
          <div className="scheda-titolo">Nome e descrizione</div>
          <form action={rinominaRegolaOrdine.bind(null, r.id)} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input name="nome" defaultValue={r.nome} required style={{ minWidth: 260 }} />
            <input name="descrizione" defaultValue={r.descrizione ?? ""} placeholder="A cosa serve" style={{ minWidth: 280 }} />
            <button type="submit" className="btn btn-secondario">Salva</button>
          </form>
          <form action={eliminaRegolaOrdine.bind(null, r.id)} style={{ marginTop: 14 }}>
            <button type="submit" className="btn btn-secondario">Elimina la regola</button>
            <span className="page-sub" style={{ marginLeft: 10 }}>
              Le collezioni che la usano tornano «solo a mano»: <b>l&apos;ordine già scritto non si tocca</b>.
            </span>
          </form>
        </div>
      </main>
    </div>
  );
}
