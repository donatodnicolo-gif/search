import Link from "next/link";
import { ANNO_CORRENTE, caricaAnno } from "@/lib/calc";
import { caricaCategorie, categoriaDi } from "@/lib/cfo";
import { fetchConsuntivo, fetchSpeseBanca } from "@/lib/finance";
import { caricaRettifiche } from "@/lib/competenza";
import { eur } from "@/lib/format";
import { CompetenzaEditor } from "@/components/CompetenzaEditor";

export const dynamic = "force-dynamic";

export default async function CompetenzaPage({
  searchParams,
}: {
  searchParams: Promise<{ anno?: string }>;
}) {
  const sp = await searchParams;
  const ANNI = [ANNO_CORRENTE - 2, ANNO_CORRENTE - 1, ANNO_CORRENTE];
  const anno = ANNI.includes(Number(sp.anno)) ? Number(sp.anno) : ANNO_CORRENTE;

  const [spese, categorie, rettifiche, dati] = await Promise.all([
    fetchSpeseBanca({ anno, dal: 1, al: 12 }),
    caricaCategorie(),
    caricaRettifiche(anno),
    caricaAnno(anno),
  ]);

  // Le voci fra cui scegliere: le controparti di banca (uscite) e le tipologie
  // fatturate (ricavi). Per i ricavi serve il dettaglio mensile, che l'API dà
  // solo un mese alla volta: dodici chiamate, ma questa pagina si apre di rado
  // e senza il mese non si saprebbe cosa spostare.
  const mesiRicavi = await Promise.all(
    Array.from({ length: 12 }, (_, i) => fetchConsuntivo({ anno, mese: i + 1, stato: "tutte" }))
  );
  const ricaviPerVoce = new Map<string, number[]>();
  mesiRicavi.forEach((r, idx) => {
    if (!r.ok) return;
    for (const t of r.dati.tipologie) {
      const arr = ricaviPerVoce.get(t.tipologia) ?? Array(12).fill(0);
      arr[idx] = t.imponibile;
      ricaviPerVoce.set(t.tipologia, arr);
    }
  });

  const voci = [
    ...(spese.ok
      ? spese.dati.controparti
          .filter((c) => c.uscite > 0)
          .sort((a, b) => b.uscite - a.uscite)
          .map((c) => ({ tipo: "USCITA" as const, nome: c.controparte, perMese: c.perMese }))
      : []),
    ...[...ricaviPerVoce.entries()]
      .sort((a, b) => b[1].reduce((s, v) => s + v, 0) - a[1].reduce((s, v) => s + v, 0))
      .map(([nome, perMese]) => ({ tipo: "RICAVO" as const, nome, perMese })),
  ];

  const righe = rettifiche.map((r) => ({
    ...r,
    categoria: r.tipo === "USCITA" ? categoriaDi(r.voce, categorie)?.nome ?? null : null,
  }));

  const spostatoFuori = righe
    .filter((r) => r.annoOrigine === anno && r.annoCompetenza !== anno)
    .reduce((s, r) => s + r.importo, 0);
  const spostatoDentro = righe
    .filter((r) => r.annoCompetenza === anno && r.annoOrigine !== anno)
    .reduce((s, r) => s + r.importo, 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Competenza</h1>
          <p className="page-caption">
            <strong>L&apos;anno di competenza si decide qui, e solo qui.</strong> Finance è il registro di quello
            che è successo e passa gli importi con la data del movimento; a quale <em>esercizio</em> appartengano
            è una scelta contabile, e la fa questa app. Una fattura di dicembre pagata a gennaio è costo
            dell&apos;anno prima: si sposta da qui e tutte le pagine — P&amp;L, Consuntivo, CFO — la leggono
            spostata. Il dato di Finance non viene toccato: resta la verità di cassa.
          </p>
        </div>
        <div className="page-actions">
          <div className="seg">
            {ANNI.map((y) => (
              <Link key={y} href={`/competenza?anno=${y}`} className={y === anno ? "on" : ""}>{y}</Link>
            ))}
          </div>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Rettifiche che toccano il {anno}</div>
          <div className="kpi-value">{righe.length}</div>
          <div className="kpi-sub">{voci.length} voci disponibili fra uscite e ricavi</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Portato fuori dal {anno}</div>
          <div className="kpi-value">{eur(spostatoFuori)}</div>
          <div className="kpi-sub">movimenti del {anno} di competenza di un altro anno</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Portato dentro il {anno}</div>
          <div className="kpi-value">{eur(spostatoDentro)}</div>
          <div className="kpi-sub">movimenti di altri anni di competenza del {anno}</div>
        </div>
      </div>

      {!spese.ok && (
        <div className="card" style={{ borderColor: "var(--red)", marginBottom: 14 }}>
          Le uscite di banca non sono disponibili ({spese.errore}): si possono spostare solo i ricavi.
        </div>
      )}

      <CompetenzaEditor anno={anno} voci={voci} rettifiche={righe} />

      <p className="page-caption" style={{ marginTop: 14 }}>
        Una rettifica porta con sé il proprio <strong>importo</strong>: così il conto di un anno si fa leggendo
        quell&apos;anno più le sue rettifiche, senza dover interrogare Finance su tutti gli anni toccati. Se una
        controparte non ha una categoria nel{" "}
        <Link href="/cfo" style={{ color: "var(--blue)" }}>CFO</Link>, l&apos;importo spostato{" "}
        <strong>non entra in nessuna voce di P&amp;L</strong> — la riga lo dice in rosso: prima le si dà una
        categoria, poi la rettifica ha effetto. Le rettifiche sui ricavi valgono solo per le tipologie mappate a
        una voce di budget in <Link href="/margini" style={{ color: "var(--blue)" }}>Margini</Link>.
      </p>
    </>
  );
}
