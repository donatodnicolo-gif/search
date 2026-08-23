import Link from "next/link";
import { misuraQuota } from "@/lib/quota";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  ANNO_CORRENTE, caricaAnno, contoEconomico, FONTI, LIVELLI,
  moltiplicatore, totaliMaison, type Livello,
} from "@/lib/calc";
import { eur, pct } from "@/lib/format";
import { caricaVenduto } from "@/lib/venduto";
import { BudgetMaison } from "@/components/BudgetMaison";

export const dynamic = "force-dynamic";

export default async function MaisonDetail({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ livello?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const dati = await caricaAnno(ANNO_CORRENTE);
  const maison = dati.maisons.find((m) => m.slug === slug);
  if (!maison) notFound();

  const livello = (LIVELLI.some((l) => l.key === sp.livello) ? sp.livello : "RAGGIUNGIBILE") as Livello;
  const molt = moltiplicatore(dati, livello);
  const t = totaliMaison(maison);
  const q = (await misuraQuota(dati.year, [1,2,3,4,5,6,7,8,9,10,11,12], [])).percentuale / 100;
  const pl = contoEconomico(dati, livello, maison.slug, q);

  // ---- Il consuntivo dei mesi già chiusi ----
  // Per una maison l'unico consuntivo che esiste è il **venduto ecommerce**:
  // il fatturato di Finance è per tipologia di servizio e non si ripartisce per
  // brand. Si mostra sotto la riga D2C, in un colore diverso, perché un numero
  // già successo e un numero promesso non devono somigliarsi. Il mese in corso
  // c'è anche, dichiarato parziale: nasconderlo lasciava una casella vuota
  // proprio dove stanno le sorprese.
  const oggi = new Date();
  const meseInCorso = oggi.getUTCFullYear() === ANNO_CORRENTE ? oggi.getUTCMonth() + 1 : 13;
  const mesiChiusi = Array.from({ length: Math.max(0, meseInCorso - 1) }, (_, i) => i + 1);
  const cIsInCorso = meseInCorso <= 12;
  const giornoInCorso = oggi.getUTCDate();
  const giorniDelMese = new Date(Date.UTC(ANNO_CORRENTE, meseInCorso, 0)).getUTCDate();
  const vend =
    mesiChiusi.length > 0 || cIsInCorso ? await caricaVenduto(dati.year, dati.maisons) : null;
  const consuntivoMese = Array(12).fill(null) as (number | null)[];
  if (vend?.ok) {
    const mesiMaison = vend.perMaison.get(maison.slug);
    if (mesiMaison) {
      for (const m of mesiChiusi) consuntivoMese[m - 1] = mesiMaison[m - 1] ?? 0;
      // Anche il **mese in corso**: il dato c'è, Orders è al giorno. Che sia
      // parziale lo dice la pagina, invece di lasciare una casella vuota su cui
      // non si può fare nessuna domanda.
      if (cIsInCorso) consuntivoMese[meseInCorso - 1] = mesiMaison[meseInCorso - 1] ?? 0;
    }
  }

  // ---- Da dove viene ogni casella del budget ----
  // Il budget non si digita: si propone, si approva, si consolida. Le proposte
  // consolidate dicono **esattamente** quali (linea, mese) hanno scritto,
  // quindi la provenienza si ricostruisce cella per cella invece di essere una
  // nota generica in fondo alla pagina. Chi è arrivato dopo vince: è l'ordine
  // in cui le scritture sono davvero avvenute.
  const proposte = await prisma.propostaBudget.findMany({
    where: { year: dati.year, ambitoTipo: "MAISON", ambitoSlug: maison.slug, stato: "APPROVATA" },
    orderBy: { consolidataIl: "asc" },
  });
  const leggiValori = (json: string): { month: number; canale?: string; valore: number }[] => {
    try {
      const v = JSON.parse(json);
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  };
  const origini: Record<string, { autore: string; propostaId: string; il: string }> = {};
  const approvate: {
    id: string; autore: string; il: string; voci: string; totale: number;
    fonte: string; inUso: boolean; sostituitaDa: string | null;
  }[] = [];
  const daConsolidare: { id: string; autore: string; totale: number }[] = [];
  for (const p of proposte) {
    const valori = leggiValori(p.valori);
    const totale = valori.reduce((s, v) => s + (v.valore || 0), 0);
    if (!p.consolidataIl) {
      daConsolidare.push({ id: p.id, autore: p.autore, totale });
      continue;
    }
    const il = p.consolidataIl.toLocaleDateString("it-IT");
    for (const v of valori) {
      // Una proposta senza `canale` è di quelle vecchie, scritte con un numero
      // solo per mese: la voce su cui è atterrata è scritta in `consolidataSu`.
      const canale = v.canale ?? p.consolidataSu?.split("·")[1]?.trim() ?? "";
      if (canale) origini[`${canale}|${v.month}`] = { autore: p.autore, propostaId: p.id, il };
    }
    approvate.push({
      id: p.id,
      autore: p.autore,
      il,
      voci: p.consolidataSu?.replace(`${maison.nome} · `, "") || "budget",
      totale,
      fonte: p.fonte,
      inUso: true,
      sostituitaDa: null,
    });
  }
  // **Quale proposta comanda davvero.** Sulla stessa fonte una proposta nuova
  // riscrive quella di prima: l'ultima consolidata è quella che si sta
  // leggendo, le precedenti restano nello storico ma **non sono più il
  // budget**. Senza dirlo, due proposte approvate della stessa squadra si
  // somigliano e non si sa quale delle due si sta guardando. (Fra fonti diverse
  // invece non c'è nessuna sostituzione: si sommano.)
  for (const a of approvate) {
    const piuRecente = approvate.filter((x) => x.fonte === a.fonte).at(-1);
    if (piuRecente && piuRecente.id !== a.id) {
      a.inUso = false;
      a.sostituitaDa = `${piuRecente.autore}, ${piuRecente.il}`;
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">{maison.nome}</h1>
          <p className="page-caption">
            Budget {dati.year} per canale. Livello mostrato:{" "}
            {LIVELLI.find((l) => l.key === livello)?.label} (×{molt.toLocaleString("it-IT")}).
          </p>
        </div>
        <div className="page-actions">
          <div className="seg">
            {LIVELLI.map((l) => (
              <Link
                key={l.key}
                href={`/maison/${maison.slug}?livello=${l.key}`}
                className={l.key === livello ? "on" : ""}
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Vendite anno ({LIVELLI.find((l) => l.key === livello)?.label})</div>
          <div className="kpi-value">{eur(t.totale * molt)}</div>
          <div className="kpi-sub">pubblicato {eur(t.totale)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">ADV consentito</div>
          <div className="kpi-value">{eur(t.adv * molt)}</div>
          <div className="kpi-sub">quota assegnata ai mesi del budget pubblicita dell anno ({eur(t.advPubblicato)})</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Margine lordo</div>
          <div className="kpi-value">{eur(pl.margineLordo)}</div>
          <div className="kpi-sub">dopo costo del venduto</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Risultato operativo</div>
          <div className={`kpi-value ${pl.ebitda >= 0 ? "pos" : "neg"}`}>
            {eur(pl.ebitda)}
          </div>
          <div className="kpi-sub">quota personale e struttura inclusa</div>
        </div>
      </div>

      {/* Il budget si legge, non si scrive: chi lo cambia lo fa da una
          proposta, che ha un autore, una data e un «va bene». Qui si vede
          **da dove viene ogni casella**. */}
      <BudgetMaison
        maison={maison.slug}
        tipologie={dati.tipologie.map((tip) => ({ slug: tip.slug, nome: tip.nome }))}
        mesi={maison.mesi.map((m) => ({
          month: m.month,
          vendite: m.vendite,
          perFonte: m.perFonte,
          advPercent: m.advPercent,
          advPubblicato: m.advPubblicato,
        }))}
        fonti={FONTI}
        molt={molt}
        consuntivoD2C={consuntivoMese}
        meseInCorso={cIsInCorso ? meseInCorso : null}
        giornoInCorso={giornoInCorso}
        giorniDelMese={giorniDelMese}
        origini={origini}
        approvate={approvate}
        daConsolidare={daConsolidare}
      />

      <p className="page-caption" style={{ marginTop: 18 }}>
        Le <strong>% ADV</strong> per mese si cambiano in{" "}
        <Link href="/spese" style={{ color: "var(--blue)" }}>Spese ADV</Link>, dove si vedono tutte le maison
        insieme. &quot;ADV pubblicato&quot; è il budget HP del monitoraggio {dati.year}, tenuto come riferimento:
        non scala con il livello, perché è un numero storico e non uno scenario.
      </p>
    </>
  );
}
