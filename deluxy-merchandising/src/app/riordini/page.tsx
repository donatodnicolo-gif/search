import Link from "next/link";
import { Badge } from "@/components/Badge";
import { Sidebar } from "@/components/Sidebar";
import { salvaPiano } from "@/lib/azioni-vendite";
import { brandCorrente } from "@/lib/brand";
import { prisma } from "@/lib/db";
import { etichettaCategoria, euro, iso } from "@/lib/dominio";
import {
  calcolaIpotesi,
  COLORE_URGENZA,
  ETICHETTA_CONFIDENZA,
  ETICHETTA_URGENZA,
  parametriDaQuery,
  type Confidenza,
  type Urgenza,
} from "@/lib/riordino";
import { COLORE_TENDENZA, ETICHETTA_TENDENZA, type Tendenza } from "@/lib/vendite";

export const dynamic = "force-dynamic";

export default async function RiordiniPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const parametri = parametriDaQuery(sp);
  const soloDaOrdinare = sp.tutti !== "1";

  const brand = await brandCorrente();

  const [ipotesi, piani] = await Promise.all([
    calcolaIpotesi({ ...parametri, canale: brand }),
    prisma.pianoRiordino.findMany({
      orderBy: { creatoIl: "desc" },
      take: 8,
      include: { _count: { select: { righe: true } } },
    }),
  ]);

  const selezionate = soloDaOrdinare ? ipotesi.righe.filter((r) => r.quantitaSuggerita > 0) : ipotesi.righe;
  // Con migliaia di prodotti la tabella intera rende la pagina inservibile: si
  // mostrano le prime per urgenza e valore, dicendo quante restano fuori.
  // Il "congela ipotesi" prende comunque TUTTE le righe, non solo queste.
  const LIMITE = 80;
  const righe = sp.elenco === "tutto" ? selezionate : selezionate.slice(0, LIMITE);
  const nascoste = selezionate.length - righe.length;

  return (
    <div className="layout">
      <Sidebar attiva="riordini" />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Ipotesi di ordinativo{brand ? ` — ${brand}` : ""}</h1>
            <p className="page-sub">
              Quanto conviene riordinare di ogni prodotto, partendo dal ritmo di vendita reale e dalla
              giacenza. È una proposta da leggere e correggere: nessun fornitore viene contattato da qui.
            </p>
          </div>
          <form action={salvaPiano} className="riga-azione">
            <input type="hidden" name="storico" value={parametri.giorniStorico} />
            <input type="hidden" name="lead" value={parametri.leadTimeGiorni} />
            <input type="hidden" name="copertura" value={parametri.coperturaGiorni} />
            <input type="hidden" name="scorta" value={parametri.scortaSicurezzaPct} />
            <input name="nome" placeholder="Nome dell'ipotesi" aria-label="Nome dell'ipotesi" />
            <button className="btn" type="submit" disabled={ipotesi.daRiordinare === 0}>
              Congela ipotesi
            </button>
          </form>
        </div>

        {sp.esito === "vuoto" && (
          <div className="avviso-errore">
            Non c&apos;è niente da riordinare con questi parametri: nessuna riga da congelare.
          </div>
        )}

        <form method="get" className="filtri">
          <label className="campo-inline">
            <span>Storico osservato</span>
            <input type="number" name="storico" min={14} max={365} defaultValue={parametri.giorniStorico} />
            <em>giorni</em>
          </label>
          <label className="campo-inline">
            <span>Lead time fornitore</span>
            <input type="number" name="lead" min={0} max={120} defaultValue={parametri.leadTimeGiorni} />
            <em>giorni</em>
          </label>
          <label className="campo-inline">
            <span>Copertura richiesta</span>
            <input type="number" name="copertura" min={1} max={180} defaultValue={parametri.coperturaGiorni} />
            <em>giorni</em>
          </label>
          <label className="campo-inline">
            <span>Scorta di sicurezza</span>
            <input type="number" name="scorta" min={0} max={100} defaultValue={parametri.scortaSicurezzaPct} />
            <em>%</em>
          </label>
          <label className="campo-inline">
            <span>Mostra</span>
            <select name="tutti" defaultValue={soloDaOrdinare ? "" : "1"}>
              <option value="">Solo da riordinare</option>
              <option value="1">Tutto l&apos;assortimento</option>
            </select>
          </label>
          <button className="btn btn-secondario" type="submit">
            Ricalcola
          </button>
        </form>

        <div className="kpi-riga">
          <div className="kpi">
            <div className="kpi-valore">{ipotesi.totali.articoli}</div>
            <div className="kpi-etichetta">Articoli da riordinare</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{ipotesi.totali.pezzi}</div>
            <div className="kpi-etichetta">Pezzi proposti</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{euro(ipotesi.totali.costo)}</div>
            <div className="kpi-etichetta">Valore dell&apos;ordine (costo)</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">
              {ipotesi.totali.articoliConCosto > 0 ? euro(ipotesi.totali.margine) : "n.d."}
            </div>
            <div className="kpi-etichetta">
              {ipotesi.totali.articoliConCosto > 0
                ? `Margine atteso su ${ipotesi.totali.articoliConCosto} articoli con costo`
                : "Margine atteso: nessun costo inserito"}
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-valore" style={{ color: ipotesi.inRottura ? "var(--red)" : "var(--green)" }}>
              {ipotesi.inRottura}
            </div>
            <div className="kpi-etichetta">Sotto il lead time</div>
          </div>
        </div>

        {ipotesi.avvisi.length > 0 && (
          <div className="nota-info">
            <span className="nota-icona">◆</span>
            <span>
              {ipotesi.avvisi.map((a, i) => (
                <div key={i}>{a}</div>
              ))}
            </span>
          </div>
        )}

        {righe.length === 0 ? (
          <div className="vuoto">
            Nessun prodotto da riordinare con questi parametri. Senza vendite registrate l&apos;ipotesi non ha
            base: importa il venduto dalla pagina <Link href="/vendite">Vendite &amp; trend</Link>.
          </div>
        ) : (
          <div className="tabella-wrap">
            <table>
              <thead>
                <tr>
                  <th>Prodotto</th>
                  <th>Fornitore</th>
                  <th className="num">Giacenza</th>
                  <th className="num">Ritmo</th>
                  <th className="num">Copertura</th>
                  <th>Stato</th>
                  <th className="num">Da ordinare</th>
                  <th className="num">Costo</th>
                  <th>Affidabilità</th>
                </tr>
              </thead>
              <tbody>
                {righe.map((r) => (
                  <tr key={r.prodottoId} className="riga-cliccabile">
                    <td>
                      <Link href={`/prodotti/${r.prodottoId}`} className="cella-nome link-riga">
                        {r.nome}
                      </Link>
                      <div className="cella-sub">
                        {r.codice} · {etichettaCategoria(r.categoria)}
                        {r.collezione ? ` · ${r.collezione}` : ""}
                      </div>
                      <div className="cella-motivo">{r.motivo}</div>
                    </td>
                    <td className="cella-muta">{r.fornitore ?? "—"}</td>
                    <td className="num">
                      {r.giacenza}
                      {r.varianti.length > 0 && (
                        <div className="cella-sub">
                          {r.varianti.map((v) => `${v.nome} ${v.giacenza}`).join(" · ")}
                        </div>
                      )}
                    </td>
                    <td className="num">
                      {r.ritmo.toFixed(2)} pz/g
                      <div className="cella-sub">
                        <span style={{ color: COLORE_TENDENZA[r.tendenza as Tendenza] }}>
                          {ETICHETTA_TENDENZA[r.tendenza as Tendenza]}
                        </span>
                      </div>
                    </td>
                    <td className="num">
                      {r.coperturaAttuale != null ? `${Math.round(r.coperturaAttuale)} gg` : "—"}
                    </td>
                    <td>
                      <Badge
                        testo={ETICHETTA_URGENZA[r.urgenza as Urgenza]}
                        colore={COLORE_URGENZA[r.urgenza as Urgenza]}
                      />
                    </td>
                    <td className="num">
                      <b style={{ fontSize: 15 }}>{r.quantitaSuggerita}</b>
                    </td>
                    <td className="num">{euro(r.costoTotale)}</td>
                    <td className="cella-muta">{ETICHETTA_CONFIDENZA[r.confidenza as Confidenza]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {nascoste > 0 && (
          <p className="page-sub" style={{ marginTop: 12 }}>
            Mostrate le prime {righe.length} righe per urgenza e valore; altre {nascoste} non sono in tabella
            (ci sono comunque tutte se congeli l&apos;ipotesi).{" "}
            <Link
              href={`/riordini?storico=${parametri.giorniStorico}&lead=${parametri.leadTimeGiorni}&copertura=${parametri.coperturaGiorni}&scorta=${parametri.scortaSicurezzaPct}${soloDaOrdinare ? "" : "&tutti=1"}&elenco=tutto`}
            >
              Mostrale tutte
            </Link>{" "}
            (la pagina diventa molto pesante).
          </p>
        )}

        <div className="scheda" style={{ marginTop: 18 }}>
          <div className="scheda-titolo">Come nasce la quantità</div>
          <p className="page-sub">
            Contano solo le <b>vendite andate a buon fine</b> (ordini pagati e non rimborsati): un reso non è
            domanda, e comprarci sopra vuol dire comprare merce che nessuno ha davvero voluto. Ritmo di vendita
            = pezzi al giorno negli ultimi {parametri.giorniStorico} giorni, con la metà
            recente pesata di più (65/35) e una correzione di tendenza limitata a ±35%: su poche settimane
            un&apos;accelerazione può essere un caso. Da lì: fabbisogno = ritmo × ({parametri.leadTimeGiorni} gg
            di lead time + {parametri.coperturaGiorni} gg di copertura) + {parametri.scortaSicurezzaPct}% di
            scorta − giacenza. Il calcolo è per prodotto, non per variante: la giacenza delle varianti si
            somma, ma il venduto non arriva sempre con la variante riconosciuta e spalmarlo a occhio
            produrrebbe quantità inventate.
          </p>
        </div>

        {piani.length > 0 && (
          <div className="scheda">
            <div className="scheda-titolo">Ipotesi congelate</div>
            <table>
              <tbody>
                {piani.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link href={`/riordini/${p.id}`} className="cella-nome">
                        {p.nome}
                      </Link>
                      <div className="cella-sub">
                        {iso(p.creatoIl)} · {p._count.righe} righe · copertura {p.coperturaGiorni} gg
                      </div>
                    </td>
                    <td style={{ width: 140 }}>
                      <Badge
                        testo={p.stato === "confermato" ? "Confermato" : p.stato === "archiviato" ? "Archiviato" : "Bozza"}
                        colore={
                          p.stato === "confermato"
                            ? "var(--green)"
                            : p.stato === "archiviato"
                              ? "var(--text-tertiary)"
                              : "var(--orange)"
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
