import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// ENTITÀ COMMERCIALI — il cliente come lo intende chi vende, sopra le sue
// società di fatturazione.
//
// ⚠️ Nasce da una domanda concreta (27/08/2026): «da FINANCE dobbiamo fatturare
// a una ragione sociale che però è parte di un'entità, e Scout deve dirci
// quanto fattura quell'entità con noi in TUTTE le sue società». La catena è
// **negozio → società → entità**, e fino a oggi il terzo anello non esisteva:
// si arrivava alla società e ci si fermava.
//
// Il caso che l'ha fatta nascere, misurato in FINANCE: CHANEL sono tre schede
// (MILANO, ROMA, FIRENZE) per 138.595 € di fatturato. Chiedendo il totale per
// anagrafica se ne vedevano al massimo 85.994 €: CHANEL ROMA non è agganciata
// al registro e spariva. Il numero tornava, ed era sbagliato del 38%.
//
// ⚠️⚠️ Qui NON ci sono importi. Il fatturato lo possiede FINANCE, che è il
// custode dei risultati: questa pagina tiene gli AGGANCI (quali società, quali
// negozi), e chi ha i soldi li somma. Un fatturato ricopiato qui invecchierebbe
// senza che nessuno se ne accorga.
export default async function Gruppi() {
  const gruppi = await prisma.gruppoAziendale.findMany({
    orderBy: { nome: "asc" },
    include: {
      societa: {
        orderBy: { ragioneSociale: "asc" },
        include: {
          sedi: {
            where: { attivo: true },
            select: { id: true, nome: true, citta: true, sede: true },
            orderBy: [{ citta: "asc" }, { nome: "asc" }],
          },
        },
      },
    },
  });
  // Le società che non stanno in nessuna entità: non è un errore (la maggior
  // parte dei clienti è una società sola), ma è da qui che si parte per
  // costruirne una — e vederle conta quanto vedere i gruppi.
  const sciolte = await prisma.soggettoFiscale.count({ where: { gruppoId: null } });

  return (
    <div className="layout">
      <Sidebar gruppiAttivi gruppi={gruppi.length} />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Entità commerciali</h1>
            <p className="page-sub">
              Il cliente come lo intende chi vende, sopra le sue società di fatturazione: la catena è
              negozio → società → entità. Serve quando si fattura a una ragione sociale ma si vuole
              sapere quanto vale il cliente <em>in tutte</em> le sue società.
            </p>
          </div>
        </div>

        <p className="testo-guida">
          {gruppi.length === 0
            ? "Nessuna entità ancora. Si crea dalla scheda di un'anagrafica, nel riquadro Dati finanziari: scrivi il nome dell'entità e la società che fattura quella sede ci entra."
            : `${gruppi.length} entità · ${sciolte} società non in nessuna entità (è normale: la maggior parte dei clienti è una società sola).`}
        </p>

        {gruppi.map((g) => {
          const negozi = g.societa.reduce((n, s) => n + s.sedi.length, 0);
          return (
            <section className="scheda" key={g.id}>
              <h2 className="scheda-titolo">
                {g.nome}{" "}
                <span className="scheda-sub">
                  {g.societa.length} societ{g.societa.length === 1 ? "à" : "à"} · {negozi} negoz
                  {negozi === 1 ? "io" : "i"}
                </span>
              </h2>
              {g.note && <p className="testo-guida">{g.note}</p>}
              {g.societa.map((s) => (
                <div key={s.id} style={{ marginBottom: 12 }}>
                  <p style={{ margin: "0 0 4px", fontWeight: 600 }}>
                    {s.ragioneSociale}{" "}
                    <span className="testo-guida" style={{ fontWeight: 400 }}>
                      {s.pIva ? `P. IVA ${s.pIva}` : "— senza P. IVA"}
                    </span>
                  </p>
                  {s.sedi.length === 0 ? (
                    <p className="testo-guida" style={{ margin: 0 }}>
                      Nessun negozio collegato a questa società.
                    </p>
                  ) : (
                    <p className="testo-guida" style={{ margin: 0 }}>
                      {s.sedi.map((p, i) => (
                        <span key={p.id}>
                          {i > 0 && " · "}
                          <Link href={`/partner/${p.id}`}>
                            {p.nome}
                            {p.sede ? ` (${p.sede})` : ""}
                            {p.citta ? ` — ${p.citta}` : ""}
                          </Link>
                        </span>
                      ))}
                    </p>
                  )}
                </div>
              ))}
            </section>
          );
        })}
      </main>
    </div>
  );
}
