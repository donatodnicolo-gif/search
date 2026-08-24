import Link from "next/link";
import { ANNO_CORRENTE, budgetAdvAnno, caricaAnno, costoPersonaAnno, totaliMaison } from "@/lib/calc";
import { prisma } from "@/lib/db";
import { primoMeseAperto } from "@/lib/periodo";
import { eur } from "@/lib/format";

export const dynamic = "force-dynamic";

// **Il posto unico del budget.** Nato dalla revisione del 24/08/2026: prima
// l'inserimento era sparso su sette pagine di primo livello, e per sapere se il
// budget era completo bisognava aprirle tutte. Qui ogni blocco dice **quanto
// vale e cosa gli manca**, e la pagina di dettaglio si apre da qui — non più
// dalla navigazione, dove faceva solo folla.

type Blocco = {
  titolo: string;
  href: string;
  valore: string;
  descrizione: string;
  // Cosa manca. `null` = a posto: il blocco lo dice con un badge verde.
  daFare: string | null;
};

export default async function Budget() {
  const dati = await caricaAnno(ANNO_CORRENTE);
  const aperto = primoMeseAperto(ANNO_CORRENTE);
  const mesiChiusi = Array.from({ length: Math.min(aperto - 1, 12) }, (_, i) => i + 1);
  const lineeDb = await prisma.lineaCommerciale.findMany({ select: { marginePct: true, vociFinance: true } });

  // ---- Vendite per brand ----
  const totVendite = dati.maisons.reduce((s, m) => s + totaliMaison(m).totale, 0);
  const brandConBuchi = dati.maisons.filter(
    (m) =>
      m.vendutoMesi &&
      mesiChiusi.some(
        (mm) => (m.mesi.find((x) => x.month === mm)?.vendite.D2C ?? 0) === 0 && (m.vendutoMesi![mm - 1] ?? 0) > 0
      )
  );

  // ---- Linee commerciali ----
  const totLinee = dati.linee.reduce((s, l) => s + l.mesi.reduce((a, b) => a + b, 0), 0);
  const lineeSenzaMargine = lineeDb.filter((l) => l.marginePct === null).length;
  const lineeScollegate = lineeDb.filter((l) => !l.vociFinance).length;

  // ---- Pubblicità ----
  const monteAdv = dati.maisons.reduce((s, m) => s + budgetAdvAnno(m, dati.year), 0);
  const quoteRotte = dati.maisons.filter(
    (m) => m.faPubblicita && Math.abs(m.mesi.reduce((s, x) => s + x.advPercent, 0) - 100) > 0.5
  );

  // ---- Personale ----
  const costoPersone = dati.persone.reduce((s, p) => s + costoPersonaAnno(p), 0);

  // ---- Margini ----
  const tipologieSenzaMargine = dati.tipologie.filter((t) => t.marginePct === 0).length;

  const blocchi: Blocco[] = [
    {
      titolo: "Vendite per brand",
      href: "/maison",
      valore: eur(totVendite),
      descrizione: "D2C, Eventi e B2B di ogni maison, mese per mese: è il budget che genera la pubblicità online.",
      daFare:
        brandConBuchi.length > 0
          ? `${brandConBuchi.map((m) => m.nome).join(", ")}: mesi già chiusi senza budget`
          : null,
    },
    {
      titolo: "Linee commerciali",
      href: "/commerciale",
      valore: eur(totLinee),
      descrizione: "Il budget che porta il lavoro del team commerciale: si somma a quello dei brand, non si sovrappone.",
      daFare:
        lineeSenzaMargine > 0 || lineeScollegate > 0
          ? [
              lineeSenzaMargine > 0 ? `${lineeSenzaMargine} senza margine` : null,
              lineeScollegate > 0 ? `${lineeScollegate} senza consuntivo` : null,
            ]
              .filter(Boolean)
              .join(" · ")
          : null,
    },
    {
      titolo: "Pubblicità",
      href: "/spese",
      valore: eur(monteAdv),
      descrizione: "Il monte pubblicitario dell'anno (vendite ÷ ROS) e come si distribuisce fra i mesi e le piattaforme.",
      daFare:
        quoteRotte.length > 0
          ? `${quoteRotte.map((m) => m.nome).join(", ")}: le quote non fanno 100%`
          : null,
    },
    {
      titolo: "Personale",
      href: "/dipendenti",
      valore: eur(costoPersone),
      descrizione: "Dipendenti, stagisti e consulenti con i mesi di competenza, il TFR di chi smette e le squadre.",
      daFare: dati.persone.length === 0 ? "nessuna persona a roster" : null,
    },
    {
      titolo: "Margini",
      href: "/margini",
      valore: dati.tipologie.map((t) => `${t.nome} ${t.marginePct.toLocaleString("it-IT")}%`).join(" · "),
      descrizione: "Il margine per tipologia di servizio e per linea: da qui esce il costo del venduto del conto economico.",
      daFare: tipologieSenzaMargine > 0 ? `${tipologieSenzaMargine} tipologie a margine zero` : null,
    },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Budget {ANNO_CORRENTE}</h1>
          <p className="page-caption">
            Tutto il budget in un posto: ogni blocco dice <strong>quanto vale</strong> e{" "}
            <strong>cosa gli manca</strong>. Si scrive dentro il blocco, si controlla da qui.
          </p>
        </div>
        <div className="page-actions">
          <Link className="btn secondary" href="/pl">Conto economico →</Link>
        </div>
      </div>

      {blocchi.map((b) => (
        <div className="card" key={b.titolo}>
          <div className="page-head" style={{ marginBottom: 0 }}>
            <div>
              <h2 className="section-title" style={{ margin: "0 0 2px" }}>
                <Link href={b.href} style={{ color: "inherit" }}>{b.titolo}</Link>
              </h2>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{b.valore}</div>
              <p className="page-caption" style={{ margin: "4px 0 0" }}>{b.descrizione}</p>
              <p className="page-caption" style={{ margin: "6px 0 0" }}>
                {b.daFare ? (
                  <span className="badge orange"><span className="dot" />{b.daFare}</span>
                ) : (
                  <span className="badge green"><span className="dot" />completo</span>
                )}
              </p>
            </div>
            <div className="page-actions">
              <Link className="btn secondary" href={b.href}>Apri →</Link>
            </div>
          </div>
        </div>
      ))}

      <p className="page-caption" style={{ marginTop: 14 }}>
        La pubblicità per piattaforma sta dentro <Link href="/piattaforme" style={{ color: "var(--blue)" }}>Piattaforme</Link>,
        le squadre dentro <Link href="/team" style={{ color: "var(--blue)" }}>Team</Link>. Le{" "}
        <Link href="/proposte" style={{ color: "var(--blue)" }}>proposte storiche</Link> restano consultabili,
        ma il budget ora si scrive direttamente nei blocchi qui sopra.
      </p>
    </>
  );
}
