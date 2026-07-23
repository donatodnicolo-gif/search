import { Sidebar } from "@/components/Sidebar";
import { prisma } from "@/lib/db";
import {
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

type Riga = {
  google: number | null;
  meta: number | null;
  vendite: number | null;
  ordini: number | null;
  nuoviClienti: number | null;
  note: string | null;
};
type Bucket = Riga & { chiave: string; etichetta: string };

// Aggrega le settimane nel periodo scelto. La chiave identifica il periodo
// (uguale tra anni diversi: è così che si confronta col 2025).
function aggrega(
  settimane: { inizio: Date; google: number | null; meta: number | null; vendite: number | null; ordini: number | null; nuoviClienti: number | null; note: string | null }[],
  vista: Vista,
  mese: number | null
): Map<string, Bucket> {
  const buckets = new Map<string, Bucket>();
  for (const s of settimane) {
    const m = s.inizio.getUTCMonth(); // 0-11
    if (mese != null && vista === "settimane" && m !== mese) continue;
    let chiave: string;
    let etichetta: string;
    if (vista === "settimane") {
      const w = settimanaIso(s.inizio);
      chiave = `W${String(w).padStart(2, "0")}`;
      etichetta = `W${w} · dal ${s.inizio.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })}`;
    } else if (vista === "mesi") {
      chiave = `M${String(m).padStart(2, "0")}`;
      etichetta = MESI_IT[m];
    } else if (vista === "trimestri") {
      const q = Math.floor(m / 3) + 1;
      chiave = `Q${q}`;
      etichetta = `Q${q}`;
    } else {
      chiave = "anno";
      etichetta = "Anno";
    }
    const b = buckets.get(chiave) ?? {
      chiave, etichetta, google: null, meta: null, vendite: null, ordini: null, nuoviClienti: null, note: null,
    };
    const somma = (a: number | null, v: number | null) => (v == null ? a : (a ?? 0) + v);
    b.google = somma(b.google, s.google);
    b.meta = somma(b.meta, s.meta);
    b.vendite = somma(b.vendite, s.vendite);
    b.ordini = somma(b.ordini, s.ordini);
    b.nuoviClienti = somma(b.nuoviClienti, s.nuoviClienti);
    if (s.note) b.note = b.note ? `${b.note} · ${s.note}` : s.note;
    buckets.set(chiave, b);
  }
  return buckets;
}

function Cella({ valore, prima, formato }: { valore: number | null; prima: number | null; formato: (n: number | null) => string }) {
  const delta = valore != null && prima != null && prima !== 0 ? valore / prima - 1 : null;
  return (
    <td className="num">
      <b style={{ fontWeight: 600 }}>{formato(valore)}</b>
      <div className="cella-sub num" style={delta != null ? { color: delta >= 0 ? "var(--green)" : "var(--red)" } : undefined}>
        {delta != null ? `${formattaPercento(delta)}` : " "}
      </div>
    </td>
  );
}

// MKT in stile calendario: periodi in colonna (vista a scelta), metriche in
// riga, delta % vs stesso periodo dell'anno precedente sotto ogni valore.
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

  const [attuali, precedenti] = await Promise.all([
    prisma.settimanaMkt.findMany({ where: { scope, anno }, orderBy: { inizio: "asc" } }),
    prisma.settimanaMkt.findMany({ where: { scope, anno: anno - 1 }, orderBy: { inizio: "asc" } }),
  ]);

  const bucketsOra = aggrega(attuali, vista, mese);
  const bucketsPrima = aggrega(precedenti, vista, mese);
  const colonne = [...bucketsOra.values()].sort((a, b) => a.chiave.localeCompare(b.chiave));

  const righeTabella: {
    nome: string;
    campo: (b: Riga) => number | null;
    formato: (n: number | null) => string;
  }[] = [
    { nome: "Google", campo: (b) => b.google, formato: formattaEuro },
    { nome: "Meta", campo: (b) => b.meta, formato: formattaEuro },
    { nome: "Totale MKT", campo: (b) => (b.google == null && b.meta == null ? null : (b.google ?? 0) + (b.meta ?? 0)), formato: formattaEuro },
    { nome: "Vendite", campo: (b) => b.vendite, formato: formattaEuro },
    { nome: "Ordini", campo: (b) => b.ordini, formato: formattaNumero },
    { nome: "Medio ordine", campo: (b) => (b.vendite != null && b.ordini ? b.vendite / b.ordini : null), formato: formattaEuro },
    { nome: "Costo conv.", campo: (b) => (b.ordini ? ((b.google ?? 0) + (b.meta ?? 0)) / b.ordini || null : null), formato: formattaEuro },
    { nome: "Nuovi clienti", campo: (b) => b.nuoviClienti, formato: formattaNumero },
    { nome: "ROS (vendite/spesa)", campo: (b) => {
        const spesa = (b.google ?? 0) + (b.meta ?? 0);
        return spesa > 0 && b.vendite != null ? b.vendite / spesa : null;
      }, formato: (n) => (n == null ? "—" : `${n.toFixed(1)}×`) },
  ];

  return (
    <div className="layout">
      <Sidebar attiva="mkt" />
      <main className="main" style={{ maxWidth: 1700 }}>
        <div className="page-head">
          <div>
            <h1 className="page-title">MKT {anno} vs {anno - 1} — {ETICHETTA_SCOPE[scope]}</h1>
            <p className="page-sub">
              Periodi in colonna, metriche in riga. Sotto ogni valore il confronto % con lo stesso
              periodo dell&apos;anno precedente (verde = meglio, rosso = peggio). Cambia vista per
              vedere settimane, mesi, trimestri o l&apos;anno intero.
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
            <option value="">Tutti i mesi (solo vista settimane)</option>
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

        {colonne.length === 0 ? (
          <div className="vuoto">Nessun dato per questa combinazione di scope, anno e periodo.</div>
        ) : (
          <section className="scheda" style={{ padding: 0 }}>
            <div style={{ overflowX: "auto" }}>
              <table className="tabella-calendario">
                <thead>
                  <tr>
                    <th style={{ minWidth: 150 }}>Metrica</th>
                    {colonne.map((c) => (
                      <th className="num" key={c.chiave} title={c.etichetta}>
                        {vista === "settimane" ? c.chiave.replace(/^W0?/, "W") : c.etichetta}
                        {vista === "settimane" && (
                          <div style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
                            {c.etichetta.split("· ")[1]}
                          </div>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {righeTabella.map((r) => (
                    <tr key={r.nome}>
                      <td className="cella-nome">{r.nome}</td>
                      {colonne.map((c) => (
                        <Cella
                          key={c.chiave}
                          valore={r.campo(c)}
                          prima={bucketsPrima.has(c.chiave) ? r.campo(bucketsPrima.get(c.chiave)!) : null}
                          formato={r.formato}
                        />
                      ))}
                    </tr>
                  ))}
                  {vista === "settimane" && colonne.some((c) => c.note) && (
                    <tr>
                      <td className="cella-muta">Azioni</td>
                      {colonne.map((c) => (
                        <td key={c.chiave} title={c.note ?? ""} style={{ maxWidth: 140 }}>
                          <span className="cella-sub" style={{ whiteSpace: "normal" }}>
                            {c.note ? (c.note.length > 60 ? c.note.slice(0, 60) + "…" : c.note) : ""}
                          </span>
                        </td>
                      ))}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
