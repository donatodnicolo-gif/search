import { notFound } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { CostruttorePassi } from "@/components/CostruttorePassi";
import { prisma } from "@/lib/db";
import { corrisponde, parsePassi } from "@/lib/regole-ordine";
import { vociPassi } from "@/lib/voci-passi";
import { FILTRO_IN_SCENA, ordinaPerPassi } from "@/lib/ordinamento-vetrina";
import { collezioniInRitardo } from "@/lib/regole-in-ritardo";
import { eliminaRegolaOrdine, impostaRotazioneRegola, riapplicaRegolaOvunque, rinominaRegolaOrdine } from "@/lib/azioni-regole-ordine";

export const dynamic = "force-dynamic";

// Quanti prodotti viaggiano al browser per l'anteprima dal vivo: sopra questo
// numero il peso della pagina conta piu' della precisione del conto.
const MAX_ANTEPRIMA = 900;

// La scheda di una regola: qui si scrive la sequenza di passi. Ogni passo dice
// **cosa conta**, e l'ordine dei passi **è** la priorità: il primo decide, gli
// altri spezzano i pareggi. Lo stesso costruttore sta anche dentro la scheda di
// una collezione, così le condizioni si possono scrivere davanti alla fila.
export default async function RegolaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ modifica?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
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
  // I prodotti su cui si vede l'anteprima mentre si costruisce la cella. Qui non
  // c'e' una collezione davanti, quindi si guarda il catalogo **in vendita**,
  // tagliato: il conto viaggia al browser, e mandarne quattromila per un numero
  // che cambia a ogni spunta non vale il peso. Il taglio e' dichiarato in pagina.
  const perAnteprima = await prisma.prodotto.findMany({
    where: FILTRO_IN_SCENA,
    take: MAX_ANTEPRIMA,
    orderBy: { nome: "asc" },
    select: {
      id: true, nome: true, immagine: true, prezzoVendita: true, categoria: true,
      tipoShopify: true, vendorShopify: true, lineaId: true, tagShopify: true,
              zoneConsegna: true,
              cittaShopify: true, occasioniShopify: true, tipologiaShopify: true, classificazioneShopify: true, dataShopify: true, orarioShopify: true, bestSellerShopify: true, ggDispMin: true,
      costoProduzione: true, creatoIl: true,
              pubblicatoIlShopify: true,
              creatoIlShopify: true,
    },
  });
  const totaleInVendita = await prisma.prodotto.count({ where: FILTRO_IN_SCENA });
  if (!r) notFound();
  // Quante collezioni mostrano ancora una fila decisa dalla regola vecchia.
  const indietro = await collezioniInRitardo(id);
  const passi = parsePassi(r.passi);
  // La fila che la regola produrrebbe sul campione, col motore vero: e' l'unico
  // modo di giudicare una regola senza applicarla a una vetrina.
  const presiDaiPassi = perAnteprima.filter((p) => passi.some((x) => x.t !== "metrica" && corrisponde(p, x)));
  const filaRegola = presiDaiPassi.length
    ? await ordinaPerPassi(presiDaiPassi.map((p) => ({ ...p, prodottoId: p.id })), passi)
    : [];

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
          <CostruttorePassi
            regolaId={r.id}
            passi={passi}
            voci={voci}
            perAnteprima={perAnteprima}
            suCosa={`in vendita su ${totaleInVendita}`}
            campione={perAnteprima.length < totaleInVendita}
            fila={filaRegola}
            modifica={Number.isFinite(Number(sp.modifica)) && sp.modifica ? Number(sp.modifica) : undefined}
            indirizzoBase={`/visual/regole/${id}`}
          />
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

        {/* **A turno tocca a un altro.** Una regola a celle mette in cima sempre
            gli stessi: la cella prende venti prodotti e il primo e' sempre
            quello. Qui si dice ogni quanto, dentro lo stesso gruppo, passa
            avanti un'alternativa. */}
        <div className="scheda">
          <div className="scheda-titolo">Ogni quanto ruota</div>
          <p className="page-sub" style={{ marginTop: -4 }}>
            Le <b>condizioni non cambiano</b>: cambia <b>chi</b>, fra quelli che una cella prende, sta davanti. Chi
            nessun passo prende ruota fra sé.
          </p>
          <form
            action={impostaRotazioneRegola.bind(null, r.id)}
            style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}
          >
            <select name="rotazioneGiorni" defaultValue={String(r.rotazioneGiorni ?? 0)} style={{ minWidth: 220 }}>
              <option value="0">— non ruota —</option>
              <option value="1">ogni giorno</option>
              <option value="7">ogni settimana</option>
              <option value="14">ogni due settimane</option>
              <option value="30">ogni mese</option>
            </select>
            <button type="submit" className="btn btn-primario">Salva</button>
          </form>
          <p className="page-sub" style={{ marginTop: 10, marginBottom: 0 }}>
            Il turno si conta <b>dalla data</b>, quindi salvare qui non riscrive nessuna vetrina: la fila nuova si vede
            <b> quando la regola si riapplica</b> — con «Riapplica ovunque», dalla scheda di una collezione, oppure da
            sola se la collezione è iscritta a un ritmo in <a href="/visual/rotazioni">Rotazioni</a>.
          </p>
        </div>

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
