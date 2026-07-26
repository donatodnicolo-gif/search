import { notFound } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { TabellaProdotti } from "@/components/TabellaProdotti";
import { prisma } from "@/lib/db";
import { cambiaStatoCollezione } from "@/lib/azioni";
import { brandCorrente } from "@/lib/brand";
import {
  calcolaMargine,
  COLORE_STATO_COLLEZIONE,
  ETICHETTA_STATO_COLLEZIONE,
  etichettaStagione,
  euro,
  iso,
  percentuale,
  STATI_COLLEZIONE,
} from "@/lib/dominio";
import { analizzaAssortimento, coloreDelta, delta } from "@/lib/vendite";

export const dynamic = "force-dynamic";

export default async function CollezionePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const collezione = await prisma.collezione.findUnique({
    where: { id },
    include: {
      prodotti: {
        orderBy: [{ priorita: "desc" }, { creatoIl: "desc" }],
        include: { collezione: { select: { nome: true, margineTarget: true } } },
      },
    },
  });
  if (!collezione) notFound();

  // Il venduto di questa collezione, nell'ambito scelto in alto.
  const assortimento = await analizzaAssortimento(90, await brandCorrente());
  const venduto = assortimento.collezioni.find((c) => c.chiave === id) ?? null;

  const conPrezzo = collezione.prodotti.filter((p) => p.prezzoVendita > 0);
  const margineMedio =
    conPrezzo.length > 0
      ? conPrezzo.reduce((s, p) => s + calcolaMargine(p.costoProduzione, p.prezzoVendita).marginePct, 0) / conPrezzo.length
      : null;
  const inVendita = collezione.prodotti.filter((p) => p.fase === "in_vendita").length;

  return (
    <div className="layout">
      <Sidebar attiva="collezioni" collezioneAttiva={id} />
      <main className="main">
        <a className="ritorno" href="/collezioni">← Collezioni</a>
        <div className="page-head">
          <div>
            <div className="prodotto-codice">{etichettaStagione(collezione.stagione)} · {collezione.anno}</div>
            <h1 className="page-title">{collezione.nome}</h1>
            {collezione.tema && <p className="page-sub">{collezione.tema}</p>}
          </div>
          <a className="btn" href={`/prodotti/nuovo`}>Nuovo prodotto</a>
        </div>

        <div className="scheda">
          <div className="scheda-titolo">Stato collezione</div>
          <div className="pill-scelta">
            {STATI_COLLEZIONE.map((s) => {
              const attuale = collezione.stato === s;
              const azione = cambiaStatoCollezione.bind(null, id, s);
              return (
                <form action={azione} key={s}>
                  <button type="submit" className={`pill-opt${attuale ? " attuale" : ""}`} disabled={attuale} style={{ color: attuale ? undefined : COLORE_STATO_COLLEZIONE[s] }}>
                    <span className="dot" style={{ background: COLORE_STATO_COLLEZIONE[s] }} />
                    {ETICHETTA_STATO_COLLEZIONE[s]}
                  </button>
                </form>
              );
            })}
          </div>
        </div>

        <div className="kpi-riga">
          <div className="kpi">
            <div className="kpi-valore">{collezione.prodotti.length}</div>
            <div className="kpi-etichetta">Prodotti</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{inVendita}</div>
            <div className="kpi-etichetta">In vendita</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{margineMedio != null ? percentuale(margineMedio) : "—"}</div>
            <div className="kpi-etichetta">Margine medio {collezione.margineTarget != null ? `· target ${collezione.margineTarget}%` : ""}</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{collezione.dataLancio ? iso(collezione.dataLancio) : "—"}</div>
            <div className="kpi-etichetta">Data di lancio</div>
          </div>
        </div>

        {/* Come ha venduto: gli stessi numeri di «Categorie & collezioni», ma
            solo per questa. Senza, la scheda dice cosa contiene la collezione e
            non come è andata. */}
        <div className="kpi-riga">
          <div className="kpi">
            <div className="kpi-valore">{euro(venduto?.ricavo ?? 0)}</div>
            <div className="kpi-etichetta">Venduto negli ultimi 90 giorni</div>
            <div className="kpi-delta" style={{ color: coloreDelta(venduto?.delta ?? null) }}>
              {delta(venduto?.delta ?? null)} sul periodo precedente
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{venduto?.pezzi ?? 0}</div>
            <div className="kpi-etichetta">Pezzi venduti</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">
              {venduto ? `${venduto.prodottiVenduti}/${venduto.prodottiACatalogo}` : "—"}
            </div>
            <div className="kpi-etichetta">Prodotti che hanno venduto</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">
              {venduto && venduto.ricavoConCosto > 0 ? percentuale(venduto.marginePct) : "n.d."}
            </div>
            <div className="kpi-etichetta">
              {venduto && venduto.ricavoConCosto > 0 ? "Margine sul venduto" : "Margine: manca il costo"}
            </div>
          </div>
        </div>
        {venduto && venduto.top.length > 0 && (
          <p className="page-sub" style={{ marginTop: -8, marginBottom: 18 }}>
            Tirano di più:{" "}
            {venduto.top.map((t, i) => (
              <span key={t.prodottoId}>
                {i > 0 ? " · " : ""}
                <a href={`/prodotti/${t.prodottoId}`}>{t.nome}</a> {euro(t.ricavo)}
              </span>
            ))}
            . Il quadro completo è in <a href="/assortimento">Categorie &amp; collezioni</a>.
          </p>
        )}

        <h2 className="scheda-titolo" style={{ marginBottom: 10 }}>Prodotti della collezione</h2>
        <TabellaProdotti prodotti={collezione.prodotti} mostraCollezione={false} />
      </main>
    </div>
  );
}
