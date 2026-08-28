import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { prisma } from "@/lib/db";
import { AggiungiAziendaCapogruppo } from "@/components/AggiungiAziendaCapogruppo";

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
  const capogruppi = await prisma.capogruppo.findMany({
    orderBy: { nome: "asc" },
    include: {
      aziende: {
        where: { attivo: true },
        select: { id: true, nome: true, citta: true, sede: true, pagaDaSe: true },
        orderBy: [{ citta: "asc" }, { nome: "asc" }],
      },
    },
  });

  return (
    <div className="layout">
      <Sidebar gruppiAttivi gruppi={capogruppi.length} />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Capogruppo</h1>
            <p className="page-sub">
              Un capogruppo ha dentro le sue aziende. Ognuna <strong>paga da sé</strong> (ha la sua
              P.&nbsp;IVA e il suo IBAN) oppure <strong>paga la capogruppo</strong> (usa la
              fatturazione del gruppo). È l&apos;unico raggruppamento del registro.
            </p>
          </div>
        </div>

        <p className="testo-guida">
          {capogruppi.length === 0
            ? "Nessun capogruppo ancora. Si crea dalla scheda di un'azienda, nel riquadro Capogruppo: scrivi il nome del gruppo e l'azienda ci entra."
            : `${capogruppi.length} capogruppo. La maggior parte delle aziende non sta in nessun capogruppo, ed è normale: un capogruppo serve solo quando un cliente ha più aziende.`}
        </p>

        {capogruppi.map((g) => {
          const centrale = g.aziende.filter((a) => !a.pagaDaSe).length;
          return (
            <section className="scheda" key={g.id}>
              <h2 className="scheda-titolo">
                {g.nome}{" "}
                <span className="scheda-sub">
                  {g.aziende.length} aziend{g.aziende.length === 1 ? "a" : "e"}
                  {centrale > 0 ? ` · ${centrale} paga${centrale === 1 ? "" : "no"} la capogruppo` : ""}
                </span>
              </h2>
              {g.note && <p className="testo-guida">{g.note}</p>}
              {g.pIva && (
                <p className="testo-guida" style={{ marginTop: 0 }}>
                  Fattura lei per chi «paga la capogruppo» — P.&nbsp;IVA {g.pIva}.
                </p>
              )}
              {g.aziende.length === 0 ? (
                <p className="testo-guida" style={{ margin: 0 }}>Nessuna azienda ancora.</p>
              ) : (
                <p className="testo-guida" style={{ margin: 0 }}>
                  {g.aziende.map((a, i) => (
                    <span key={a.id}>
                      {i > 0 && " · "}
                      <Link href={`/partner/${a.id}`}>
                        {a.nome}
                        {a.sede ? ` (${a.sede})` : ""}
                        {a.citta ? ` — ${a.citta}` : ""}
                      </Link>
                      {!a.pagaDaSe && <span className="cella-fonte"> · paga la capogruppo</span>}
                    </span>
                  ))}
                </p>
              )}
              <AggiungiAziendaCapogruppo capogruppoId={g.id} giaDentro={g.aziende.map((a) => a.id)} />
            </section>
          );
        })}
      </main>

    </div>
  );
}
