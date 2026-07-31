import Link from "next/link";
import { misuraQuota } from "@/lib/quota";
import { notFound } from "next/navigation";
import {
  ANNO_CORRENTE, caricaAnno, contoEconomico, LIVELLI,
  moltiplicatore, totaliMaison, type Livello,
} from "@/lib/calc";
import { eur, pct } from "@/lib/format";
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
          <div className="kpi-sub">{t.totale > 0 ? pct((t.adv / t.totale) * 100) : "—"} delle vendite</div>
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

      {/* Il budget si SCRIVE qui (31/07/2026). Prima si poteva solo importare
          dall'Excel o ereditare da una proposta consolidata: mancava un canale
          a un brand e non c'era modo di aggiungerlo. E siccome l'ADV consentito
          è una percentuale sulle vendite del mese, un canale senza budget non è
          «un canale a zero»: è un canale che non porta con sé i soldi per
          farlo. */}
      <BudgetMaison
        anno={dati.year}
        maison={maison.slug}
        tipologie={dati.tipologie.map((tip) => ({ slug: tip.slug, nome: tip.nome }))}
        mesi={maison.mesi.map((m) => ({
          month: m.month,
          vendite: m.vendite,
          advPercent: m.advPercent,
          advPubblicato: m.advPubblicato,
        }))}
        molt={molt}
        modificabile={livello === "RAGGIUNGIBILE"}
      />

      <p className="page-caption" style={{ marginTop: 18 }}>
        Le vendite si scrivono qui, canale per canale e mese per mese: sono il <strong>budget pubblicato</strong>,
        e da loro nasce tutto il resto — l&apos;<strong>ADV consentito</strong> si ricalcola da solo, e il P&amp;L
        con lui. Le <strong>% ADV</strong> per mese si cambiano invece in{" "}
        <Link href="/spese" style={{ color: "var(--blue)" }}>Spese ADV</Link>, dove si vedono tutte le maison
        insieme. &quot;ADV pubblicato&quot; è il budget HP del monitoraggio {dati.year}, tenuto come riferimento:
        non scala con il livello, perché è un numero storico e non uno scenario.
      </p>
    </>
  );
}
