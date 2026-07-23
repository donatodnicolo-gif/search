import { Badge } from "@/components/Badge";
import { Icona } from "@/components/Icona";
import { Sidebar } from "@/components/Sidebar";
import { prisma } from "@/lib/db";
import { formattaEuro } from "@/lib/dominio";

export const dynamic = "force-dynamic";

// Categoria di prodotto dedotta dal testo della keyword.
function categoriaKeyword(testo: string): string {
  const t = testo.toLowerCase();
  if (/tort|cake|pasticc|dolc/.test(t)) return "torte";
  if (/colazion|breakfast|croissant/.test(t)) return "colazioni";
  if (/palloncin|balloon/.test(t)) return "palloncini";
  if (/regal|gift|box/.test(t)) return "regali";
  if (/rose|fior|flower|bouquet|piant|orchide|girasol|peoni|mazz/.test(t)) return "fiori";
  if (/consegn|domicilio|delivery|spedi|invio|inviare|manda/.test(t)) return "consegna generica";
  return "altro";
}

const CATEGORIE: { chiave: string; nome: string; icona: string; colore: string }[] = [
  { chiave: "fiori", nome: "Fiori", icona: "fiori", colore: "var(--purple)" },
  { chiave: "torte", nome: "Torte", icona: "torta", colore: "var(--orange)" },
  { chiave: "colazioni", nome: "Colazioni", icona: "colazione", colore: "var(--gold-strong)" },
  { chiave: "regali", nome: "Regali", icona: "regalo", colore: "var(--blue)" },
  { chiave: "palloncini", nome: "Palloncini", icona: "palloncino", colore: "var(--red)" },
  { chiave: "consegna generica", nome: "Consegna generica", icona: "destinazioni", colore: "var(--green)" },
  { chiave: "altro", nome: "Altro", icona: "pagina", colore: "var(--text-tertiary)" },
];

const ORDINAMENTI: Record<string, string> = {
  incasso: "Incasso",
  spesa: "Spesa",
  resa: "Resa (incasso/spesa)",
  keyword: "Keyword (A-Z)",
};

type KwAggregata = {
  testo: string;
  categoria: string;
  campagne: string[];
  incasso: number;
  spesa: number;
  resa: number | null;
};

// Keywords per categoria di prodotto: stessa keyword su più campagne = una
// riga sola con le campagne raggruppate. Ordinabile, con performance.
export default async function PaginaKeywords({
  searchParams,
}: {
  searchParams: Promise<{ ordina?: string; q?: string; campagna?: string }>;
}) {
  const { ordina: ordinaParam, q, campagna } = await searchParams;
  const ordina = Object.keys(ORDINAMENTI).includes(ordinaParam ?? "") ? ordinaParam! : "incasso";

  const keyword = await prisma.copyAnnuncio.findMany({
    where: {
      tipo: "keyword",
      ...(q ? { testo: { contains: q } } : {}),
      ...(campagna ? { campagna } : {}),
    },
  });
  const campagneDisponibili = await prisma.copyAnnuncio.groupBy({
    by: ["campagna"],
    where: { tipo: "keyword" },
    orderBy: { campagna: "asc" },
  });

  // stessa keyword in più campagne → una riga aggregata
  const perTesto = new Map<string, KwAggregata>();
  for (const k of keyword) {
    const chiave = k.testo.trim().toLowerCase();
    const agg = perTesto.get(chiave) ?? {
      testo: k.testo.trim(),
      categoria: categoriaKeyword(k.testo),
      campagne: [],
      incasso: 0,
      spesa: 0,
      resa: null,
    };
    if (!agg.campagne.includes(k.campagna)) agg.campagne.push(k.campagna);
    agg.incasso += k.incasso ?? 0;
    agg.spesa += k.spesa ?? 0;
    perTesto.set(chiave, agg);
  }
  const tutte = [...perTesto.values()].map((k) => ({
    ...k,
    resa: k.spesa > 0 ? k.incasso / k.spesa : null,
  }));

  const confronta = (a: KwAggregata, b: KwAggregata) => {
    if (ordina === "keyword") return a.testo.localeCompare(b.testo);
    if (ordina === "spesa") return b.spesa - a.spesa;
    if (ordina === "resa") return (b.resa ?? -1) - (a.resa ?? -1);
    return b.incasso - a.incasso;
  };

  const totIncasso = tutte.reduce((s, k) => s + k.incasso, 0);
  const totSpesa = tutte.reduce((s, k) => s + k.spesa, 0);

  const linkOrdina = (chiave: string) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (campagna) p.set("campagna", campagna);
    p.set("ordina", chiave);
    return `/keywords?${p.toString()}`;
  };

  return (
    <div className="layout">
      <Sidebar attiva="keywords" />
      <main className="main" style={{ maxWidth: 1700 }}>
        <div className="page-head">
          <div>
            <h1 className="page-title">Keywords</h1>
            <p className="page-sub">
              Le parole chiave per categoria di prodotto, con incasso e spesa dal Monitoraggio. La
              stessa keyword usata da più campagne è una riga sola: le campagne sono nella colonna
              dedicata. Clicca le intestazioni per ordinare.
            </p>
          </div>
        </div>

        <div className="kpi-riga">
          <div className="kpi">
            <div className="kpi-valore">{tutte.length}</div>
            <div className="kpi-etichetta">Keyword uniche</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{formattaEuro(totIncasso)}</div>
            <div className="kpi-etichetta">Incasso attribuito</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{formattaEuro(totSpesa)}</div>
            <div className="kpi-etichetta">Spesa</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{totSpesa > 0 ? `${(totIncasso / totSpesa).toFixed(1)}×` : "—"}</div>
            <div className="kpi-etichetta">Resa complessiva</div>
          </div>
        </div>

        <form className="filtri" method="get">
          <input type="search" name="q" placeholder="Cerca una keyword…" defaultValue={q ?? ""} />
          <select name="campagna" defaultValue={campagna ?? ""}>
            <option value="">Tutte le campagne</option>
            {campagneDisponibili.map((c) => (
              <option key={c.campagna} value={c.campagna}>{c.campagna}</option>
            ))}
          </select>
          <select name="ordina" defaultValue={ordina}>
            {Object.entries(ORDINAMENTI).map(([v, e]) => (
              <option key={v} value={v}>Ordina per {e}</option>
            ))}
          </select>
          <button className="btn small" type="submit">Applica</button>
        </form>

        {CATEGORIE.map((cat) => {
          const del = tutte.filter((k) => k.categoria === cat.chiave).sort(confronta);
          if (del.length === 0) return null;
          const incassoCat = del.reduce((s, k) => s + k.incasso, 0);
          const spesaCat = del.reduce((s, k) => s + k.spesa, 0);
          return (
            <section className="scheda" key={cat.chiave} style={{ padding: 0 }}>
              <div className="scheda-titolo" style={{ display: "flex", alignItems: "center", gap: 10, padding: "18px 24px 0" }}>
                <span className="card-landing-icona" style={{ color: cat.colore, width: 32, height: 32 }}>
                  <Icona nome={cat.icona} />
                </span>
                {cat.nome} ({del.length})
                <span style={{ marginLeft: "auto", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
                  {formattaEuro(incassoCat)} incasso · {formattaEuro(spesaCat)} spesa ·{" "}
                  {spesaCat > 0 ? `${(incassoCat / spesaCat).toFixed(1)}×` : "—"}
                </span>
              </div>
              <div style={{ overflowX: "auto", paddingBottom: 6 }}>
                <table>
                  <thead>
                    <tr>
                      <th><a href={linkOrdina("keyword")}>Keyword {ordina === "keyword" ? "↓" : ""}</a></th>
                      <th>Campagne</th>
                      <th className="num"><a href={linkOrdina("incasso")}>Incasso {ordina === "incasso" ? "↓" : ""}</a></th>
                      <th className="num"><a href={linkOrdina("spesa")}>Spesa {ordina === "spesa" ? "↓" : ""}</a></th>
                      <th className="num"><a href={linkOrdina("resa")}>Resa {ordina === "resa" ? "↓" : ""}</a></th>
                    </tr>
                  </thead>
                  <tbody>
                    {del.map((k) => (
                      <tr key={k.testo}>
                        <td className="cella-nome">{k.testo}</td>
                        <td>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {k.campagne.map((c) => (
                              <Badge key={c} testo={c} colore="var(--text-secondary)" />
                            ))}
                          </div>
                        </td>
                        <td className="num" style={{ color: k.incasso > 0 ? "var(--green)" : "var(--text-tertiary)", fontWeight: k.incasso > 0 ? 600 : 400 }}>
                          {formattaEuro(k.incasso)}
                        </td>
                        <td className="num cella-muta">{formattaEuro(k.spesa)}</td>
                        <td className="num" style={k.resa != null && k.resa < 1 && k.spesa > 30 ? { color: "var(--red)", fontWeight: 600 } : undefined}>
                          {k.resa != null ? `${k.resa.toFixed(1)}×` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </main>
    </div>
  );
}
