import { Sidebar } from "@/components/Sidebar";
import { prisma } from "@/lib/db";
import {
  COLORE_BRAND,
  ETICHETTA_SCOPE,
  formattaEuro,
  formattaNumero,
  formattaPercento,
  MESI_IT,
  SCOPE_MKT,
} from "@/lib/dominio";

export const dynamic = "force-dynamic";

const VISTE = ["settimane", "mesi", "trimestri", "anno"] as const;
type Vista = (typeof VISTE)[number];
const ETICHETTA_VISTA: Record<Vista, string> = {
  settimane: "Settimane",
  mesi: "Mesi",
  trimestri: "Trimestri",
  anno: "Anno intero",
};

function settimanaIso(d: Date): number {
  const data = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const giorno = data.getUTCDay() || 7;
  data.setUTCDate(data.getUTCDate() + 4 - giorno);
  const inizioAnno = new Date(Date.UTC(data.getUTCFullYear(), 0, 1));
  return Math.ceil(((data.getTime() - inizioAnno.getTime()) / 86_400_000 + 1) / 7);
}

const pad = (n: number) => String(n).padStart(2, "0");

type Riga = {
  google: number | null;
  meta: number | null;
  vendite: number | null;
  ordini: number | null;
  nuoviClienti: number | null;
  note: string | null;
};
type Settimana = Riga & { inizio: Date };

// Ogni settimana confluisce nella sua colonna, nel totale del mese, del
// trimestre e dell'anno: una passata sola, tutte le granularità pronte.
function aggregaTutto(settimane: Settimana[]): Map<string, Riga> {
  const mappa = new Map<string, Riga>();
  const somma = (chiave: string, s: Settimana) => {
    const b = mappa.get(chiave) ?? {
      google: null, meta: null, vendite: null, ordini: null, nuoviClienti: null, note: null,
    };
    const piu = (a: number | null, v: number | null) => (v == null ? a : (a ?? 0) + v);
    b.google = piu(b.google, s.google);
    b.meta = piu(b.meta, s.meta);
    b.vendite = piu(b.vendite, s.vendite);
    b.ordini = piu(b.ordini, s.ordini);
    b.nuoviClienti = piu(b.nuoviClienti, s.nuoviClienti);
    if (s.note) b.note = b.note ? `${b.note} · ${s.note}` : s.note;
    mappa.set(chiave, b);
  };
  for (const s of settimane) {
    const m = s.inizio.getUTCMonth();
    somma(`W${pad(settimanaIso(s.inizio))}`, s);
    somma(`M${pad(m)}`, s);
    somma(`Q${Math.floor(m / 3) + 1}`, s);
    somma("TOT", s);
  }
  return mappa;
}

type Colonna = { chiave: string; etichetta: string; sotto?: string; tipo: "periodo" | "mese" | "totale" };

const spesaMkt = (r: Riga | undefined) =>
  r == null || (r.google == null && r.meta == null) ? null : (r.google ?? 0) + (r.meta ?? 0);

function Cella({
  valore,
  prima,
  formato,
  tipo,
}: {
  valore: number | null;
  prima: number | null;
  formato: (n: number | null) => string;
  tipo: Colonna["tipo"];
}) {
  const delta = valore != null && prima != null && prima !== 0 ? valore / prima - 1 : null;
  return (
    <td className={`num${tipo === "mese" ? " col-mese" : tipo === "totale" ? " col-totale" : ""}`}>
      <b style={{ fontWeight: 600 }}>{formato(valore)}</b>
      <div className="cella-sub num" style={delta != null ? { color: delta >= 0 ? "var(--green)" : "var(--red)" } : undefined}>
        {delta != null ? formattaPercento(delta) : " "}
      </div>
    </td>
  );
}

// MKT in stile calendario: periodi in colonna, con la colonna blu di fine mese
// e la colonna totale in fondo. Sotto, la stessa lettura brand per brand.
export default async function PaginaMkt({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; anno?: string; vista?: string; mese?: string }>;
}) {
  const p = await searchParams;
  const scope = (SCOPE_MKT as readonly string[]).includes(p.scope ?? "") ? p.scope! : "totale";
  const anno = Number(p.anno) || 2026;
  const vista = (VISTE as readonly string[]).includes(p.vista ?? "") ? (p.vista as Vista) : "settimane";
  const mese = p.mese !== undefined && p.mese !== "" ? Number(p.mese) : null;

  const tutte = await prisma.settimanaMkt.findMany({
    where: { anno: { in: [anno, anno - 1] } },
    orderBy: { inizio: "asc" },
  });
  const perScope = (s: string, a: number) =>
    tutte.filter((r) => r.scope === s && r.anno === a && (mese == null || r.inizio.getUTCMonth() === mese));

  const ora = aggregaTutto(perScope(scope, anno));
  const prima = aggregaTutto(perScope(scope, anno - 1));

  // Colonne: settimane (con fine mese intercalati), mesi, trimestri o solo il totale.
  const colonne: Colonna[] = [];
  if (vista === "settimane") {
    let mesePrec: number | null = null;
    for (const s of perScope(scope, anno)) {
      const m = s.inizio.getUTCMonth();
      if (mesePrec !== null && m !== mesePrec) {
        colonne.push({ chiave: `M${pad(mesePrec)}`, etichetta: MESI_IT[mesePrec], sotto: "fine mese", tipo: "mese" });
      }
      mesePrec = m;
      const w = settimanaIso(s.inizio);
      colonne.push({
        chiave: `W${pad(w)}`,
        etichetta: `W${w}`,
        sotto: s.inizio.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" }),
        tipo: "periodo",
      });
    }
    if (mesePrec !== null) {
      colonne.push({ chiave: `M${pad(mesePrec)}`, etichetta: MESI_IT[mesePrec], sotto: "fine mese", tipo: "mese" });
    }
  } else if (vista === "mesi") {
    for (let m = 0; m < 12; m++) {
      if (ora.has(`M${pad(m)}`)) colonne.push({ chiave: `M${pad(m)}`, etichetta: MESI_IT[m], tipo: "periodo" });
    }
  } else if (vista === "trimestri") {
    for (let q = 1; q <= 4; q++) {
      if (ora.has(`Q${q}`)) colonne.push({ chiave: `Q${q}`, etichetta: `Q${q}`, tipo: "periodo" });
    }
  }
  colonne.push({ chiave: "TOT", etichetta: "Totale", sotto: String(anno), tipo: "totale" });

  const righe: { nome: string; campo: (r: Riga) => number | null; formato: (n: number | null) => string }[] = [
    { nome: "Google", campo: (r) => r.google, formato: formattaEuro },
    { nome: "Meta", campo: (r) => r.meta, formato: formattaEuro },
    { nome: "Totale MKT", campo: (r) => spesaMkt(r), formato: formattaEuro },
    { nome: "Vendite", campo: (r) => r.vendite, formato: formattaEuro },
    { nome: "Ordini", campo: (r) => r.ordini, formato: formattaNumero },
    { nome: "Medio ordine", campo: (r) => (r.vendite != null && r.ordini ? r.vendite / r.ordini : null), formato: formattaEuro },
    { nome: "Costo conv.", campo: (r) => (r.ordini ? (spesaMkt(r) ?? 0) / r.ordini || null : null), formato: formattaEuro },
    { nome: "Nuovi clienti", campo: (r) => r.nuoviClienti, formato: formattaNumero },
    {
      nome: "ROS (vendite/spesa)",
      campo: (r) => {
        const s = spesaMkt(r);
        return s && s > 0 && r.vendite != null ? r.vendite / s : null;
      },
      formato: (n) => (n == null ? "—" : `${n.toFixed(1)}×`),
    },
  ];

  // Lettura per brand: gli stessi periodi, una riga di spesa, vendite e ROS
  // per ciascun brand. Serve a vedere chi tira e chi frena dentro il totale.
  const BRAND_SCOPE = [
    { scope: "gifts", nome: "Deluxy.it", colore: COLORE_BRAND.gifts },
    { scope: "flowers", nome: "Flowers", colore: COLORE_BRAND.flowers },
    { scope: "cake", nome: "Cake", colore: COLORE_BRAND.cake },
  ];
  const datiBrand = BRAND_SCOPE.map((b) => ({
    ...b,
    ora: aggregaTutto(perScope(b.scope, anno)),
    prima: aggregaTutto(perScope(b.scope, anno - 1)),
  })).filter((b) => b.ora.size > 0);

  return (
    <div className="layout">
      <Sidebar attiva="mkt" />
      <main className="main" style={{ maxWidth: 1700 }}>
        <div className="page-head">
          <div>
            <h1 className="page-title">MKT {anno} vs {anno - 1} — {ETICHETTA_SCOPE[scope]}</h1>
            <p className="page-sub">
              Periodi in colonna, metriche in riga. Sotto ogni valore il confronto % con lo stesso
              periodo dell&apos;anno precedente. Le colonne in <b>azzurro</b> sono i totali di fine
              mese, l&apos;ultima è il totale del periodo mostrato.
            </p>
          </div>
        </div>

        <form className="filtri" method="get">
          <select name="scope" defaultValue={scope}>
            {SCOPE_MKT.map((s) => (
              <option key={s} value={s}>{ETICHETTA_SCOPE[s]}</option>
            ))}
          </select>
          <select name="vista" defaultValue={vista}>
            {VISTE.map((v) => (
              <option key={v} value={v}>{ETICHETTA_VISTA[v]}</option>
            ))}
          </select>
          <select name="mese" defaultValue={mese != null ? String(mese) : ""}>
            <option value="">Tutti i mesi</option>
            {MESI_IT.map((m, i) => (
              <option key={m} value={i}>{m}</option>
            ))}
          </select>
          <select name="anno" defaultValue={String(anno)}>
            <option value="2026">2026</option>
            <option value="2025">2025</option>
          </select>
          <button className="btn small" type="submit">Vai</button>
        </form>

        {ora.size === 0 ? (
          <div className="vuoto">Nessun dato per questa combinazione di scope, anno e periodo.</div>
        ) : (
          <>
            <section className="scheda" style={{ padding: 0 }}>
              <div className="scheda-titolo" style={{ padding: "18px 24px 0" }}>
                {ETICHETTA_SCOPE[scope]}
              </div>
              <div style={{ overflowX: "auto" }}>
                <table className="tabella-calendario">
                  <thead>
                    <tr>
                      <th style={{ minWidth: 150 }}>Metrica</th>
                      {colonne.map((c, i) => (
                        <th
                          className={`num${c.tipo === "mese" ? " col-mese" : c.tipo === "totale" ? " col-totale" : ""}`}
                          key={`${c.chiave}-${i}`}
                        >
                          {c.etichetta}
                          {c.sotto && (
                            <div style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>{c.sotto}</div>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {righe.map((r) => (
                      <tr key={r.nome}>
                        <td className="cella-nome">{r.nome}</td>
                        {colonne.map((c, i) => (
                          <Cella
                            key={`${c.chiave}-${i}`}
                            valore={ora.has(c.chiave) ? r.campo(ora.get(c.chiave)!) : null}
                            prima={prima.has(c.chiave) ? r.campo(prima.get(c.chiave)!) : null}
                            formato={r.formato}
                            tipo={c.tipo}
                          />
                        ))}
                      </tr>
                    ))}
                    {vista === "settimane" && (
                      <tr>
                        <td className="cella-muta">Azioni</td>
                        {colonne.map((c, i) => {
                          const nota = ora.get(c.chiave)?.note ?? null;
                          return (
                            <td
                              key={`${c.chiave}-${i}`}
                              title={nota ?? ""}
                              className={c.tipo === "mese" ? "col-mese" : c.tipo === "totale" ? "col-totale" : ""}
                              style={{ maxWidth: 150 }}
                            >
                              <span className="cella-sub" style={{ whiteSpace: "normal" }}>
                                {nota ? (nota.length > 70 ? `${nota.slice(0, 70)}…` : nota) : ""}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="scheda" style={{ padding: 0 }}>
              <div className="scheda-titolo" style={{ padding: "18px 24px 0" }}>
                Dentro il totale — brand per brand
              </div>
              <div style={{ overflowX: "auto" }}>
                <table className="tabella-calendario">
                  <thead>
                    <tr>
                      <th style={{ minWidth: 150 }}>Brand</th>
                      {colonne.map((c, i) => (
                        <th
                          className={`num${c.tipo === "mese" ? " col-mese" : c.tipo === "totale" ? " col-totale" : ""}`}
                          key={`${c.chiave}-${i}`}
                        >
                          {c.etichetta}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {datiBrand.map((b) => (
                      <>
                        <tr className="riga-forte" key={`${b.scope}-mkt`}>
                          <td className="cella-nome">
                            <span className="sb-dot" style={{ display: "inline-block", width: 8, height: 8, background: b.colore, marginRight: 8 }} />
                            {b.nome} — spesa MKT
                          </td>
                          {colonne.map((c, i) => (
                            <Cella
                              key={`${c.chiave}-${i}`}
                              valore={b.ora.has(c.chiave) ? spesaMkt(b.ora.get(c.chiave)) : null}
                              prima={b.prima.has(c.chiave) ? spesaMkt(b.prima.get(c.chiave)) : null}
                              formato={formattaEuro}
                              tipo={c.tipo}
                            />
                          ))}
                        </tr>
                        <tr key={`${b.scope}-vendite`}>
                          <td className="cella-muta">{b.nome} — vendite</td>
                          {colonne.map((c, i) => (
                            <Cella
                              key={`${c.chiave}-${i}`}
                              valore={b.ora.get(c.chiave)?.vendite ?? null}
                              prima={b.prima.get(c.chiave)?.vendite ?? null}
                              formato={formattaEuro}
                              tipo={c.tipo}
                            />
                          ))}
                        </tr>
                        <tr key={`${b.scope}-ros`}>
                          <td className="cella-muta">{b.nome} — ROS</td>
                          {colonne.map((c, i) => {
                            const calcolaRos = (m: Map<string, Riga>) => {
                              const r = m.get(c.chiave);
                              const s = spesaMkt(r);
                              return r && s && s > 0 && r.vendite != null ? r.vendite / s : null;
                            };
                            return (
                              <Cella
                                key={`${c.chiave}-${i}`}
                                valore={calcolaRos(b.ora)}
                                prima={calcolaRos(b.prima)}
                                formato={(n) => (n == null ? "—" : `${n.toFixed(1)}×`)}
                                tipo={c.tipo}
                              />
                            );
                          })}
                        </tr>
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
