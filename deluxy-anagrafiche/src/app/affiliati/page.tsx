import { Sidebar } from "@/components/Sidebar";
import { StelleD2C } from "@/components/StelleD2C";
import { prisma } from "@/lib/db";
import {
  ETICHETTE_GRAVITA,
  ETICHETTE_ORIGINE,
  SOGLIA_AFFIDABILE,
  valutazioneD2C,
} from "@/lib/feedback-d2c";
import { INTERESSI_AFFILIAZIONE } from "@/lib/interessi";

export const dynamic = "force-dynamic";

// Affiliati e re-seller: sono loro che servono le consegne D2C, quindi sono
// loro che una pagella ce l'hanno davvero. Questa vista risponde a una domanda
// operativa — «chi sta lavorando male?» — e per questo l'ordine è dal peggiore
// al migliore, con i mai valutati in fondo: un partner senza giudizi non è un
// partner scarso, e messo in cima sembrerebbe il problema più grave.
export default async function Affiliati() {
  const [righe, ultimiReclami] = await Promise.all([
    prisma.partner.findMany({
      where: { attivo: true, interessi: { hasSome: [...INTERESSI_AFFILIAZIONE] } },
      select: {
        id: true,
        nome: true,
        citta: true,
        provincia: true,
        categoria: true,
        interessi: true,
        votoD2C: true,
        numeroFeedbackD2C: true,
        ultimoFeedbackD2C: true,
        votoD2CAggiornatoIl: true,
      },
      orderBy: [
        // I mai valutati in fondo: nulls last, non "zero".
        { votoD2C: { sort: "asc", nulls: "last" } },
        { numeroFeedbackD2C: "desc" },
        { nome: "asc" },
      ],
    }),
    // Gli ultimi giudizi arrivati dai reclami, per vedere cosa sta succedendo
    // senza aprire venti schede.
    prisma.feedbackD2C.findMany({
      where: { origine: "reclamo", partner: { attivo: true, interessi: { hasSome: [...INTERESSI_AFFILIAZIONE] } } },
      orderBy: { dataFeedback: "desc" },
      take: 15,
      select: {
        id: true,
        voto: true,
        gravita: true,
        reclamoRisolto: true,
        casistica: true,
        ordine: true,
        autore: true,
        commento: true,
        dataFeedback: true,
        sistema: true,
        partner: { select: { id: true, nome: true, citta: true } },
      },
    }),
  ]);

  const valutazioni = righe.map((r) => ({ r, v: valutazioneD2C(r) }));
  const conFeedback = valutazioni.filter((x) => x.v.feedback > 0);
  const critici = conFeedback.filter((x) => x.v.etichetta === "Critico");
  const daValutare = valutazioni.length - conFeedback.length;

  const data = (d: Date | null) => (d ? d.toLocaleDateString("it-IT") : "—");

  return (
    <div className="layout">
      <Sidebar affiliatiAttivi />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Affiliati e re-seller</h1>
            <p className="page-sub">
              Come lavorano sulle consegne D2C. I giudizi arrivano da Deluxy Customer Service —
              un reclamo chiuso con colpa al partner diventa un feedback — e da chi segue gli ordini
            </p>
          </div>
        </div>

        <div className="dash-grid" style={{ marginBottom: 20 }}>
          <div className="scheda">
            <div className="scheda-titolo">Affiliati e re-seller</div>
            <div className="sync-kpi-valore">{valutazioni.length}</div>
            <div className="sync-kpi-etichetta">anagrafiche attive con linea Affiliazioni o Re-seller</div>
          </div>
          <div className="scheda">
            <div className="scheda-titolo">Con una pagella</div>
            <div className="sync-kpi-valore">{conFeedback.length}</div>
            <div className="sync-kpi-etichetta">
              {daValutare > 0 ? `${daValutare} ancora da valutare (non è uno zero)` : "tutti valutati"}
            </div>
          </div>
          <div className="scheda">
            <div className="scheda-titolo">Critici</div>
            <div className="sync-kpi-valore" style={{ color: critici.length ? "var(--red)" : undefined }}>
              {critici.length}
            </div>
            <div className="sync-kpi-etichetta">
              sotto 3 di media · {critici.filter((c) => !c.v.affidabile).length} con meno di {SOGLIA_AFFIDABILE} feedback
            </div>
          </div>
        </div>

        <section className="scheda">
          <h2 className="scheda-titolo">
            Pagella <span className="scheda-sub">dal peggiore al migliore · i mai valutati in fondo</span>
          </h2>
          {valutazioni.length === 0 ? (
            <p className="testo-guida" style={{ margin: 0 }}>
              Nessuna anagrafica con linea Affiliazioni o Re-seller.
            </p>
          ) : (
            <div className="tabella-wrap" style={{ boxShadow: "none", border: "1px solid var(--hairline)" }}>
              <table>
                <thead>
                  <tr>
                    <th>Partner</th>
                    <th>Città</th>
                    <th>Linee</th>
                    <th>Valutazione D2C</th>
                    <th>Feedback</th>
                    <th>Ultimo</th>
                  </tr>
                </thead>
                <tbody>
                  {valutazioni.map(({ r, v }) => (
                    <tr key={r.id}>
                      <td>
                        <a href={`/partner/${r.id}`}>
                          <div className="cella-nome">{r.nome}</div>
                          <div className="cella-sub">{r.categoria}</div>
                        </a>
                      </td>
                      <td className="cella-muta">
                        {[r.citta, r.provincia].filter(Boolean).join(" · ") || "—"}
                      </td>
                      <td className="cella-muta">
                        {r.interessi.filter((i) => (INTERESSI_AFFILIAZIONE as readonly string[]).includes(i)).join(", ")}
                      </td>
                      <td>
                        <StelleD2C voto={r.votoD2C} feedback={r.numeroFeedbackD2C} />
                      </td>
                      <td className="cella-muta">{v.feedback || "—"}</td>
                      <td className="cella-muta">{data(v.ultimoFeedback)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="scheda">
          <h2 className="scheda-titolo">
            Ultimi reclami arrivati{" "}
            <span className="scheda-sub">giudizi con origine «{ETICHETTE_ORIGINE.reclamo}»</span>
          </h2>
          {ultimiReclami.length === 0 ? (
            <p className="testo-guida" style={{ margin: 0 }}>
              Nessun reclamo ancora arrivato. Customer Service li manda a{" "}
              <code>POST /api/v1/feedback</code> con la gravità: serve una chiave di tipologia
              «Feedback D2C» (si crea da <a href="/chiavi">Chiavi API</a>).
            </p>
          ) : (
            <div className="tabella-wrap" style={{ boxShadow: "none", border: "1px solid var(--hairline)" }}>
              <table>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Partner</th>
                    <th>Casistica</th>
                    <th>Gravità</th>
                    <th>Voto</th>
                    <th>Ordine</th>
                    <th>Da</th>
                  </tr>
                </thead>
                <tbody>
                  {ultimiReclami.map((f) => (
                    <tr key={f.id}>
                      <td className="cella-muta">{f.dataFeedback.toLocaleDateString("it-IT")}</td>
                      <td>
                        <a href={`/partner/${f.partner.id}`}>{f.partner.nome}</a>
                        {f.partner.citta && <div className="cella-sub">{f.partner.citta}</div>}
                      </td>
                      <td className="cella-muta">
                        {f.casistica ?? "—"}
                        {f.commento && <div className="cella-sub">{f.commento}</div>}
                      </td>
                      <td className="cella-muta">
                        {f.gravita ? ETICHETTE_GRAVITA[f.gravita] : "—"}
                        {f.reclamoRisolto != null && (
                          <div className="cella-sub">{f.reclamoRisolto ? "risolto" : "aperto"}</div>
                        )}
                      </td>
                      <td>
                        <StelleD2C voto={f.voto} feedback={1} soloStelle />
                      </td>
                      <td className="cella-muta">{f.ordine ?? "—"}</td>
                      <td className="cella-muta">{f.sistema === "ui" ? "dal registro" : f.sistema}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
