import { Sidebar } from "@/components/Sidebar";
import { VenditeAttese } from "@/components/VenditeAttese";
import { BudgetUfficiale } from "@/components/BudgetUfficiale";
import { BudgetQuestoMese } from "@/components/BudgetQuestoMese";
import { prisma } from "@/lib/db";
import { ETICHETTA_SITO, formattaEuro, MESI_IT, SITI } from "@/lib/dominio";

export const dynamic = "force-dynamic";

type Ripartizione = Record<string, { quota: number | null; giorno: number | null }>;

// Budget ADV in stile calendario: mesi in colonna, voci in riga
// (foglio "Budget adv" del Monitoraggio).
export default async function PaginaBudget({
  searchParams,
}: {
  searchParams: Promise<{ anno?: string; mese?: string; salvato?: string }>;
}) {
  const { anno: annoParam, mese: meseParam, salvato } = await searchParams;
  const anno = Number(annoParam) || 2026;
  const adesso = new Date();
  const mese = Number(meseParam) || (anno === adesso.getFullYear() ? adesso.getMonth() + 1 : 1);
  const righe = await prisma.budgetMensile.findMany({
    where: { anno },
    orderBy: [{ sito: "asc" }, { mese: "asc" }],
  });

  return (
    <div className="layout">
      <Sidebar attiva="budget" />
      <main className="main" style={{ maxWidth: 1700 }}>
        <div className="page-head">
          <div>
            <h1 className="page-title">Budget ADV {anno}</h1>
            {/* ⚠️ QUESTA PAGINA MESCOLAVA TRE FONTI SENZA DIRE QUALE COMANDA:
                le attese per canale, il tetto ufficiale di Budgets su dodici
                mesi, e una tabella «calendario» importata a mano dal
                Monitoraggio che copre SOLO giugno-agosto. Tre verità
                affiancate, e nessuna che rispondesse alla domanda per cui si
                apre una pagina che si chiama Budget: stiamo dentro? */}
            <p className="page-sub">
              Quanto si può spendere, quanto si sta spendendo e dove si arriva a fine mese. Il
              tetto lo decide <b>Deluxy Budgets</b> — qui non si scrive, si legge — e la spesa
              arriva dalle campagne. Le tabelle sotto sono il dettaglio: la prima è la fonte
              ufficiale su dodici mesi, l&apos;ultima è la vecchia copia importata dal
              Monitoraggio, tenuta solo come archivio.
            </p>
          </div>
        </div>

        {/* La domanda per cui si apre questa pagina, e la sua risposta:
            consentito, speso, quanto resta, dove si arriva. Tutto il resto è
            dettaglio. */}
        <BudgetQuestoMese anno={anno} />

        <div style={{ margin: "-6px 0 18px" }}>
          {/* Il seguito naturale di quella tabella: vedere lo scarto e non
              poterci fare niente lasciava il lavoro a metà. */}
          <a className="btn small" href="/budget/adatta">
            Adatta i budget delle campagne →
          </a>
        </div>

        {/* Le attese per canale stanno in cima: sono la decisione da cui
            discende tutto il resto della pagina. */}
        {/* Le attese per canale vivono anche in Budget vendite, che è dove si va
            a cercarle: qui restano perché è la pagina della spesa e le due cose
            si guardano insieme. */}
        <VenditeAttese anno={anno} mese={mese} salvato={salvato === "1"} />

        {/* Il tetto ufficiale sta in Budgets, e copre tutti e dodici i mesi:
            sta in cima perché è la cosa da guardare per prima, e perché la
            tabella qui sotto — importata a mano dal Monitoraggio — ne copre
            solo una parte. */}
        <BudgetUfficiale
          anno={anno}
          locali={righe.map((r) => ({ sito: r.sito, mese: r.mese, budgetMese: r.budgetMese }))}
        />

        <div className="pill-scelta" style={{ marginBottom: 18 }}>
          {MESI_IT.map((nome, i) => (
            <a
              key={nome}
              className={`pill-opt${mese === i + 1 ? " attuale" : ""}`}
              href={`/budget?anno=${anno}&mese=${i + 1}`}
            >
              {nome.slice(0, 3)}
            </a>
          ))}
        </div>

        {/* ⚠️ ARCHIVIO, NON FONTE. Questa tabella nasce dal foglio «Budget
            adv» del Monitoraggio, importato a mano: nel 2026 contiene solo
            giugno, luglio e agosto. Affiancata al tetto ufficiale su dodici
            mesi sembrava dire che da settembre non ci sono soldi. Resta
            perché contiene la ripartizione per campagna, che Budgets non ha —
            ma sta chiusa, e dice da dove viene. */}
        {righe.length > 0 && (
          <details className="scheda" style={{ marginBottom: 18 }}>
            <summary className="scheda-titolo" style={{ cursor: "pointer" }}>
              Vecchia copia dal Monitoraggio ({[...new Set(righe.map((r) => r.mese))].length} mesi
              importati) — archivio, non fonte
            </summary>
            <p className="cella-sub" style={{ whiteSpace: "normal", margin: "8px 0 0" }}>
              Importata a mano dal foglio «Budget adv»: copre solo i mesi che erano nel foglio,
              e <b>non sa niente</b> di quello che è stato approvato in Budgets dopo. Serve per
              la ripartizione per campagna, che il tetto ufficiale non ha.
            </p>
            {SITI.map((sito) => {
          const mesi = righe.filter((r) => r.sito === sito);
          if (mesi.length === 0) return null;
          const ripartizioni = mesi.map((m) => (m.ripartizione ? (JSON.parse(m.ripartizione) as Ripartizione) : {}));
          // tutte le voci di ripartizione viste nell'anno, in ordine di apparizione
          const voci: string[] = [];
          for (const rip of ripartizioni) {
            for (const voce of Object.keys(rip)) if (!voci.includes(voce)) voci.push(voce);
          }
          const quotaDi = (voce: string) => {
            for (const rip of ripartizioni) if (rip[voce]?.quota != null) return rip[voce].quota;
            return null;
          };
          const totaleAnno = mesi.reduce((s, m) => s + (m.budgetMese ?? 0), 0);

          return (
            <section className="scheda" key={sito} style={{ padding: 0 }}>
              <div className="scheda-titolo" style={{ padding: "20px 24px 4px" }}>
                {ETICHETTA_SITO[sito]} — {formattaEuro(totaleAnno)} nell&apos;anno
              </div>
              <div style={{ overflowX: "auto", paddingBottom: 8 }}>
                {/* «tab-ancorata»: 802px di tabella in 313px di telefono — il
                    nome della riga scorreva via prima dei campi da compilare. */}
                <table className="tabella-calendario tab-ancorata">
                  <thead>
                    <tr>
                      <th style={{ minWidth: 190 }}>Voce</th>
                      {mesi.map((m) => (
                        <th className="num" key={m.id}>{MESI_IT[m.mese - 1]}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="cella-muta">Vendite previste</td>
                      {mesi.map((m) => (
                        <td className="num cella-muta" key={m.id}>{formattaEuro(m.venditaPrevista)}</td>
                      ))}
                    </tr>
                    <tr>
                      <td className="cella-muta">ROS</td>
                      {mesi.map((m) => (
                        <td className="num cella-muta" key={m.id}>{m.ros ?? "—"}</td>
                      ))}
                    </tr>
                    <tr className="riga-forte">
                      <td className="cella-nome">Budget mese</td>
                      {mesi.map((m) => (
                        <td className="num" key={m.id} style={{ color: "var(--gold-strong)", fontWeight: 600 }}>
                          {formattaEuro(m.budgetMese)}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td className="cella-muta">Budget / giorno</td>
                      {mesi.map((m) => (
                        <td className="num cella-muta" key={m.id}>{formattaEuro(m.budgetGiorno)}</td>
                      ))}
                    </tr>
                    {voci.map((voce) => {
                      const quota = quotaDi(voce);
                      const meta = /meta|awareness|interesse|acquisto|retargeting/i.test(voce);
                      return (
                        <tr key={voce}>
                          <td>
                            <span className="sb-dot" style={{ display: "inline-block", width: 7, height: 7, marginRight: 8, background: meta ? "var(--blue)" : "var(--gold)" }} />
                            {voce}
                            {quota != null && <span className="cella-sub" style={{ display: "inline", marginLeft: 6 }}>{(quota * 100).toFixed(0)}%</span>}
                          </td>
                          {mesi.map((m, i) => {
                            const val = ripartizioni[i][voce]?.giorno;
                            return (
                              <td className="num" key={m.id}>
                                {val != null ? `${formattaEuro(val)}/g` : "—"}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
              );
            })}
          </details>
        )}
        {righe.length === 0 && (
          <div className="vuoto">Nessun budget importato per il {anno}: npm run import:monitoraggio.</div>
        )}
      </main>
    </div>
  );
}
