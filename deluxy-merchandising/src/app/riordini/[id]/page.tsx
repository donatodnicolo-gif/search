import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/Badge";
import { Sidebar } from "@/components/Sidebar";
import { cambiaQuantita, cambiaStatoPiano, eliminaPiano, eliminaRigaPiano } from "@/lib/azioni-vendite";
import { prisma } from "@/lib/db";
import { euro, iso } from "@/lib/dominio";
import { ETICHETTA_CONFIDENZA, type Confidenza } from "@/lib/riordino";

export const dynamic = "force-dynamic";

const STATI: { chiave: string; nome: string; colore: string }[] = [
  { chiave: "bozza", nome: "Bozza", colore: "var(--orange)" },
  { chiave: "confermato", nome: "Confermato", colore: "var(--green)" },
  { chiave: "archiviato", nome: "Archiviato", colore: "var(--text-tertiary)" },
];

export default async function PianoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const piano = await prisma.pianoRiordino.findUnique({
    where: { id },
    include: { righe: { orderBy: { quantitaSuggerita: "desc" } } },
  });
  if (!piano) notFound();

  const scelte = piano.righe.filter((r) => r.quantitaScelta > 0);
  const costo = scelte.reduce((s, r) => s + r.quantitaScelta * r.costoUnitario, 0);
  // Il margine si somma solo dove il costo c'è: a costo zero non è "tutto
  // margine", è un costo che nessuno ha ancora inserito.
  const conCosto = scelte.filter((r) => r.costoUnitario > 0);
  const margine = conCosto.reduce((s, r) => s + r.quantitaScelta * (r.prezzoUnitario - r.costoUnitario), 0);
  const suggeriti = piano.righe.reduce((s, r) => s + r.quantitaSuggerita, 0);
  const decisi = piano.righe.reduce((s, r) => s + r.quantitaScelta, 0);
  const statoCorrente = STATI.find((s) => s.chiave === piano.stato) ?? STATI[0];

  return (
    <div className="layout">
      <Sidebar attiva="riordini" />
      <main className="main">
        <Link href="/riordini" className="ritorno">
          ← Ipotesi di ordinativo
        </Link>
        <div className="page-head">
          <div>
            <h1 className="page-title">{piano.nome}</h1>
            <p className="page-sub">
              Ambito: <b>{piano.canale ?? "tutti i brand"}</b>. Congelata il {iso(piano.creatoIl)} su{" "}
              {piano.giorniStorico} giorni di storico, lead time{" "}
              {piano.leadTimeGiorni} gg, copertura {piano.coperturaGiorni} gg, scorta{" "}
              {piano.scortaSicurezzaPct}%. Le quantità qui sotto sono modificabili: resta traccia sia della
              proposta sia della decisione.
            </p>
          </div>
          <div className="riga-azione">
            <Badge testo={statoCorrente.nome} colore={statoCorrente.colore} />
            <a className="btn btn-secondario" href={`/riordini/${piano.id}/csv`}>
              Scarica CSV
            </a>
          </div>
        </div>

        <div className="kpi-riga">
          <div className="kpi">
            <div className="kpi-valore">{decisi}</div>
            <div className="kpi-etichetta">Pezzi decisi</div>
            <div className="kpi-sotto">proposti {suggeriti}</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{scelte.length}</div>
            <div className="kpi-etichetta">Articoli nell&apos;ordine</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{euro(costo)}</div>
            <div className="kpi-etichetta">Valore dell&apos;ordine</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{conCosto.length > 0 ? euro(margine) : "n.d."}</div>
            <div className="kpi-etichetta">
              {conCosto.length > 0
                ? `Margine atteso su ${conCosto.length} articoli con costo`
                : "Margine atteso: nessun costo inserito"}
            </div>
          </div>
        </div>

        <div className="scheda">
          <div className="scheda-titolo">Stato</div>
          <div className="pill-scelta">
            {STATI.map((s) => {
              const azione = cambiaStatoPiano.bind(null, piano.id, s.chiave);
              return (
                <form action={azione} key={s.chiave}>
                  <button
                    className={`pill-opt${piano.stato === s.chiave ? " attuale" : ""}`}
                    type="submit"
                    disabled={piano.stato === s.chiave}
                    style={{ color: piano.stato === s.chiave ? undefined : s.colore }}
                  >
                    <span className="dot" />
                    {s.nome}
                  </button>
                </form>
              );
            })}
          </div>
        </div>

        <div className="tabella-wrap">
          <table>
            <thead>
              <tr>
                <th>Prodotto</th>
                <th className="num">Ritmo</th>
                <th className="num">Giacenza</th>
                <th className="num">Proposti</th>
                <th className="num">Da ordinare</th>
                <th className="num">Costo</th>
                <th>Affidabilità</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {piano.righe.map((r) => {
                const salva = cambiaQuantita.bind(null, r.id, piano.id);
                const rimuovi = eliminaRigaPiano.bind(null, r.id, piano.id);
                return (
                  <tr key={r.id}>
                    <td>
                      {r.prodottoId ? (
                        <Link href={`/prodotti/${r.prodottoId}`} className="cella-nome">
                          {r.descrizione}
                        </Link>
                      ) : (
                        <span className="cella-nome">{r.descrizione}</span>
                      )}
                      <div className="cella-motivo">{r.motivo}</div>
                    </td>
                    <td className="num">{r.venditeGiorno.toFixed(2)} pz/g</td>
                    <td className="num">{r.giacenza}</td>
                    <td className="num cella-muta">{r.quantitaSuggerita}</td>
                    <td className="num">
                      <form action={salva} className="riga-quantita">
                        <input
                          type="number"
                          name="quantita"
                          min={0}
                          defaultValue={r.quantitaScelta}
                          aria-label={`Quantità per ${r.descrizione}`}
                        />
                        <button className="btn small" type="submit">
                          Salva
                        </button>
                      </form>
                    </td>
                    <td className="num">{euro(r.quantitaScelta * r.costoUnitario)}</td>
                    <td className="cella-muta">{ETICHETTA_CONFIDENZA[r.confidenza as Confidenza]}</td>
                    <td>
                      <form action={rimuovi}>
                        <button className="icon-btn" type="submit" title="Togli dalla lista">
                          ×
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="scheda" style={{ marginTop: 18 }}>
          <div className="scheda-titolo">Elimina</div>
          <p className="page-sub" style={{ marginBottom: 12 }}>
            L&apos;ipotesi sparisce con tutte le sue righe. Le vendite e le giacenze non vengono toccate.
          </p>
          <form action={eliminaPiano.bind(null, piano.id)}>
            <button className="btn btn-secondario" type="submit">
              Elimina questa ipotesi
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
