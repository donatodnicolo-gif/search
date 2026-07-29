import Link from "next/link";
import { Badge } from "@/components/Badge";
import { FormFiltri } from "@/components/FormFiltri";
import { BarraQuota } from "@/components/Grafico";
import { Sidebar } from "@/components/Sidebar";
import { brandCorrente } from "@/lib/brand";
import { etichettaCategoria, euro, percentuale } from "@/lib/dominio";
import {
  analizzaAssortimento,
  coloreDelta,
  COLORE_TENDENZA,
  delta,
  ETICHETTA_FINESTRA,
  ETICHETTA_TENDENZA,
  FINESTRE,
  type RigaAssortimento,
  type Tendenza,
} from "@/lib/vendite";

export const dynamic = "force-dynamic";

export default async function AssortimentoPage({
  searchParams,
}: {
  searchParams: Promise<{ giorni?: string }>;
}) {
  const sp = await searchParams;
  const giorni = FINESTRE.includes(Number(sp.giorni) as (typeof FINESTRE)[number])
    ? Number(sp.giorni)
    : 90;
  const brand = await brandCorrente();
  const a = await analizzaAssortimento(giorni, brand);

  const daClassificare = a.categorie.find((c) => c.chiave === "DA_CLASSIFICARE");
  const senzaCollezione = a.collezioni.find((c) => c.chiave === "—");

  return (
    <div className="layout">
      <Sidebar attiva="assortimento" />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Categorie &amp; collezioni{brand ? ` — ${brand}` : ""}</h1>
            <p className="page-sub">
              Il venduto letto con le informazioni del prodotto: quanto pesa ogni famiglia, quanti prodotti
              tirano davvero rispetto a quanti ne ha a catalogo, e con che margine.
            </p>
          </div>
        </div>

        <FormFiltri>
          <select name="giorni" defaultValue={String(giorni)} aria-label="Periodo">
            {FINESTRE.map((g) => (
              <option key={g} value={g}>
                {ETICHETTA_FINESTRA[g]}
              </option>
            ))}
          </select>
        </FormFiltri>

        <div className="kpi-riga">
          <div className="kpi">
            <div className="kpi-valore">{euro(a.totale.ricavo)}</div>
            <div className="kpi-etichetta">Venduto nel periodo</div>
            <div className="kpi-sotto">solo vendite andate a buon fine</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{a.totale.pezzi}</div>
            <div className="kpi-etichetta">Pezzi</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{a.totale.prodottiVenduti}</div>
            <div className="kpi-etichetta">Prodotti che hanno venduto</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore" style={{ color: a.senzaCosto ? "var(--orange)" : undefined }}>
              {a.senzaCosto}
            </div>
            <div className="kpi-etichetta">Venduti senza costo inserito</div>
            <div className="kpi-sotto">il loro margine non si calcola</div>
          </div>
        </div>

        {daClassificare && daClassificare.ricavo > 0 && (
          <div className="nota-info">
            <span className="nota-icona">◆</span>
            <span>
              <b>{percentuale(daClassificare.quota)}</b> del venduto sta ancora in «Da classificare» come
              <b> categoria interna</b> ({daClassificare.prodottiVenduti} prodotti): quella lente (in fondo alla
              pagina) e la linea si riempiono in{" "}
              <Link href="/classificazione">Imposta categorie e linee</Link>. Nel frattempo le lenti qui sotto —
              categoria del negozio e fornitore, <b>lette da Shopify</b> — hanno già dati veri.
            </span>
          </div>
        )}

        {/* Prima le lenti importate da Shopify: hanno dati veri anche prima che
            qualcuno tocchi la categoria interna. */}
        <Tabellone
          titolo="Per categoria del negozio"
          righe={a.tipi}
          etichettaGruppo="Tipo (Shopify)"
          nota='Il «Tipo» del prodotto letto da Shopify — la categoria del negozio, non dedotta dal titolo.'
        />

        <Tabellone titolo="Per fornitore" righe={a.fornitori} etichettaGruppo="Fornitore (Shopify vendor)" />

        <Tabellone
          titolo="Per linea"
          righe={a.linee}
          etichettaGruppo="Linea"
          nota={
            a.linee.every((r) => r.chiave === "—")
              ? "Nessuna linea assegnata: si decidono in «Imposta categorie e linee», poi compaiono qui."
              : undefined
          }
        />

        <Tabellone
          titolo="Per collezione"
          righe={a.collezioni}
          etichettaGruppo="Collezione"
          nota={
            senzaCollezione && senzaCollezione.prodottiACatalogo > 0
              ? `${senzaCollezione.prodottiACatalogo} prodotti non appartengono a nessuna collezione: compaiono nella riga «Senza collezione».`
              : undefined
          }
        />

        {/* La categoria interna resta in fondo: oggi è quasi tutta «Da
            classificare», ma una volta assegnata diventa la lente nostra. */}
        <Tabellone
          titolo="Per categoria interna"
          righe={a.categorie.map((r) => ({ ...r, nome: etichettaCategoria(r.chiave) }))}
          etichettaGruppo="Categoria interna"
        />
      </main>
    </div>
  );
}

function Tabellone({
  titolo,
  righe,
  etichettaGruppo,
  nota,
}: {
  titolo: string;
  righe: RigaAssortimento[];
  etichettaGruppo: string;
  nota?: string;
}) {
  return (
    <div className="scheda">
      <div className="scheda-titolo">{titolo}</div>
      {nota && (
        <p className="page-sub" style={{ marginBottom: 12 }}>
          {nota}
        </p>
      )}
      {righe.length === 0 ? (
        <div className="vuoto-mini">Nessun dato nel periodo.</div>
      ) : (
        <div className="tabella-wrap">
          <table>
            <thead>
              <tr>
                <th>{etichettaGruppo}</th>
                <th className="num">Prodotti</th>
                <th className="num">Pezzi</th>
                <th className="num">Ricavo</th>
                <th className="num">Δ</th>
                <th>Quota</th>
                <th className="num">Prezzo medio</th>
                <th className="num">Margine</th>
                <th>Tendenza</th>
              </tr>
            </thead>
            <tbody>
              {righe.map((r) => (
                <tr key={r.chiave}>
                  <td>
                    <span className="cella-nome">{r.nome}</span>
                    {r.top.length > 0 && (
                      <div className="cella-sub">
                        {r.top.map((t, i) => (
                          <span key={t.prodottoId}>
                            {i > 0 ? " · " : ""}
                            <Link href={`/prodotti/${t.prodottoId}`}>{t.nome}</Link> {euro(t.ricavo)}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="num">
                    {r.prodottiVenduti}
                    <span className="cella-muta"> / {r.prodottiACatalogo}</span>
                    {r.prodottiACatalogo > 0 && (
                      <div className="cella-sub">
                        {percentuale(r.prodottiVenduti / r.prodottiACatalogo)} ha venduto
                      </div>
                    )}
                  </td>
                  <td className="num">{r.pezzi}</td>
                  <td className="num">{euro(r.ricavo)}</td>
                  <td className="num" style={{ color: coloreDelta(r.delta) }}>
                    {delta(r.delta)}
                  </td>
                  <td style={{ width: 120 }}>
                    <BarraQuota quota={r.quota} />
                  </td>
                  <td className="num">{euro(r.prezzoMedio)}</td>
                  <td className="num" title={r.ricavoConCosto > 0 ? undefined : "Nessun prodotto con costo inserito"}>
                    {r.ricavoConCosto > 0 ? percentuale(r.marginePct) : "—"}
                  </td>
                  <td>
                    <Badge
                      testo={ETICHETTA_TENDENZA[r.tendenza as Tendenza]}
                      colore={COLORE_TENDENZA[r.tendenza as Tendenza]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
