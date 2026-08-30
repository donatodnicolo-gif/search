import Link from "next/link";
import { caricaAnno, ANNO_CORRENTE } from "@/lib/calc";
import { caricaConsuntivo, SLUG_D2C } from "@/lib/consuntivo";
import { caricaVenduto, sommaMesi } from "@/lib/venduto";
import { fetchRicaviIntervallo } from "@/lib/orders";
import { eur, pct, MESI } from "@/lib/format";

export const dynamic = "force-dynamic";

// LA PAGINA D'APERTURA (30/08/2026, richiesta dell'utente): «all'apertura
// invece che da fare tieni aggiornato per questa settimana, mese, mese scorso,
// trimestre, anno. Su come stanno andando le cose: vendite, margini, conto
// economico, risultati maison e risultati commerciali».
//
// Chi apre l'app chiede come sta andando, non cosa manca da scrivere: «Da
// fare» resta nel menu, questa risponde alla domanda d'apertura.
//
// ⚠️ **La settimana ha un passo diverso dal resto, ed è dichiarato.** Le
// vendite arrivano da Orders con l'intervallo di date esatto (al giorno); la
// banca e Finance hanno solo il MESE, quindi margini e conto economico nella
// vista settimanale non esistono — mostrarli «del mese» sotto il titolo
// «settimana» farebbe credere che siano della settimana. La vista lo scrive e
// rimanda al mese.

const VISTE = [
  { key: "settimana", label: "Questa settimana" },
  { key: "mese", label: "Questo mese" },
  { key: "mese-scorso", label: "Mese scorso" },
  { key: "trimestre", label: "Trimestre" },
  { key: "anno", label: "Anno" },
] as const;
type VistaKey = (typeof VISTE)[number]["key"];

const iso = (d: Date) => d.toISOString().slice(0, 10);

export default async function AggiornatoPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const sp = await searchParams;
  const vista: VistaKey = (VISTE.find((v) => v.key === sp.p)?.key ?? "settimana") as VistaKey;

  const oggi = new Date();
  const anno = oggi.getUTCFullYear();
  const meseInCorso = oggi.getUTCMonth() + 1;

  // ---- I mesi del periodo (per le viste a passo mensile) ----
  // «Mese scorso» a gennaio è dicembre dell'anno prima: si salta con un
  // cartello invece di mostrare l'anno sbagliato in silenzio.
  const mesiDi = (v: VistaKey): number[] => {
    if (v === "mese") return [meseInCorso];
    if (v === "mese-scorso") return meseInCorso > 1 ? [meseInCorso - 1] : [];
    if (v === "trimestre") {
      const dal = Math.floor((meseInCorso - 1) / 3) * 3 + 1;
      return Array.from({ length: meseInCorso - dal + 1 }, (_, i) => dal + i);
    }
    if (v === "anno") return Array.from({ length: meseInCorso }, (_, i) => i + 1);
    return [];
  };
  const mesi = mesiDi(vista);
  const parziale = mesi.includes(meseInCorso);
  const etichettaMesi =
    mesi.length === 0 ? "" : mesi.length === 1 ? MESI[mesi[0] - 1] : `${MESI[mesi[0] - 1]}–${MESI[mesi[mesi.length - 1] - 1]}`;

  // ---- Dati ----
  // Sempre l'anno del calendario: questa pagina risponde ad «adesso». Gli anni
  // passati si leggono dal Consuntivo, che ha il selettore.
  const dati = await caricaAnno(anno);

  if (vista === "settimana") {
    // Lunedì di questa settimana; `a` è esclusiva, quindi domani prende anche oggi.
    const lun = new Date(oggi);
    lun.setUTCDate(oggi.getUTCDate() - ((oggi.getUTCDay() + 6) % 7));
    const domani = new Date(oggi);
    domani.setUTCDate(oggi.getUTCDate() + 1);
    // Il paragone onesto: la STESSA porzione della settimana scorsa (da lunedì
    // allo stesso giorno), non la settimana scorsa intera — 3 giorni contro 7
    // sembrerebbero sempre un crollo.
    const lunPrec = new Date(lun);
    lunPrec.setUTCDate(lun.getUTCDate() - 7);
    const stessoPuntoPrec = new Date(domani);
    stessoPuntoPrec.setUTCDate(domani.getUTCDate() - 7);

    const [sett, settPrec] = await Promise.all([
      fetchRicaviIntervallo(iso(lun), iso(domani)),
      fetchRicaviIntervallo(iso(lunPrec), iso(stessoPuntoPrec)),
    ]);

    const giorni = Math.round((domani.getTime() - lun.getTime()) / 86400000);
    return (
      <>
        <Testata vista={vista} sotto={`da lunedì ${lun.getUTCDate()} ${MESI[lun.getUTCMonth()]} a oggi (${giorni} ${giorni === 1 ? "giorno" : "giorni"})`} />
        {!sett.ok ? (
          <div className="avviso-errore">Le vendite non arrivano: {sett.errore}</div>
        ) : (
          <>
            <div className="kpi-grid">
              <div className="kpi">
                <div className="kpi-label">Venduto della settimana</div>
                <div className="kpi-value">{eur(sett.dati.totali.lordo)}</div>
                <div className="kpi-sub">{sett.dati.totali.ordini} ordini · IVA inclusa</div>
              </div>
              <div className="kpi">
                <div className="kpi-label">Stessi giorni, settimana scorsa</div>
                <div className="kpi-value">{settPrec.ok ? eur(settPrec.dati.totali.lordo) : "—"}</div>
                <div className="kpi-sub">
                  {settPrec.ok && settPrec.dati.totali.lordo > 0
                    ? `${sett.dati.totali.lordo >= settPrec.dati.totali.lordo ? "+" : ""}${pct(((sett.dati.totali.lordo - settPrec.dati.totali.lordo) / settPrec.dati.totali.lordo) * 100)} questa settimana`
                    : "confronto non disponibile"}
                </div>
              </div>
            </div>
            <div className="table-wrap" style={{ marginTop: 16 }}>
              <table>
                <thead><tr><th>Negozio</th><th className="num">Venduto</th><th className="num">Ordini</th></tr></thead>
                <tbody>
                  {[...sett.dati.brand].sort((a, b) => b.lordo - a.lordo).map((b) => (
                    <tr key={b.brand}>
                      <td>{b.brand}</td>
                      <td className="num">{eur(b.lordo)}</td>
                      <td className="num">{b.ordini}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <p className="page-caption" style={{ marginTop: 16 }}>
          La settimana mostra <strong>solo le vendite</strong>: Orders sa il giorno di ogni ordine, ma la
          banca e Finance hanno il passo del <strong>mese</strong> — margini e conto economico della
          settimana non esistono, e mostrarli «del mese» qui sotto farebbe credere che siano suoi. Si
          leggono da <Link href="/aggiornato?p=mese" style={{ color: "var(--blue)" }}>Questo mese</Link> in su.
        </p>
      </>
    );
  }

  // ---- Viste a passo mensile ----
  if (mesi.length === 0) {
    return (
      <>
        <Testata vista={vista} sotto="" />
        <div className="avviso-errore">
          A gennaio il «mese scorso» è dicembre dell&apos;anno prima: si legge dal{" "}
          <Link href="/consuntivo">Consuntivo</Link> scegliendo l&apos;anno.
        </div>
      </>
    );
  }

  const [cons, venduto] = await Promise.all([
    caricaConsuntivo(dati, mesi),
    caricaVenduto(dati.year, dati.maisons),
  ]);

  // Risultati maison: il venduto dei NEGOZI contro il budget **D2C** degli
  // stessi mesi — stessa coppia di /maison: il venduto ecommerce si confronta
  // con la riga D2C, non con l'intero budget della maison (che dentro ha anche
  // Eventi e B2B). Chi un negozio non ce l'ha (B2B, Experience) mostra «—»,
  // non uno zero che sembrerebbe un crollo. E un mese a budget zero non fa
  // percentuale: è la trappola dell'«866%» (/maison, 24/08).
  const righeM = dati.maisons.map((m) => {
    const mesiNegozio = venduto.perMaison.get(m.slug);
    const vend = mesiNegozio ? sommaMesi(mesiNegozio, mesi) : null;
    const budgetMesi = mesi.map((mm) => {
      const dm = m.mesi.find((x) => x.month === mm);
      return dm ? dm.vendite[SLUG_D2C] ?? 0 : 0;
    });
    const budget = budgetMesi.reduce((s, v) => s + v, 0);
    const mesiSenzaBudget = mesi.filter((_, i) => (budgetMesi[i] ?? 0) === 0);
    return { nome: m.nome, vend, budget, mesiSenzaBudget };
  }).filter((r) => r.vend !== null || r.budget > 0);
  const vendTot = righeM.reduce((s, r) => s + (r.vend ?? 0), 0);

  // Risultati commerciali: il fatturato per tipologia che Finance misura
  // (Eventi, B2B, …). Il D2C sta già nel conto economico qui sopra; le linee
  // commerciali non collegate a Finance restano «n.d.» — punto aperto noto.
  const tipologieNonD2C = dati.tipologie.filter((t) => t.slug !== SLUG_D2C);
  const righeC = tipologieNonD2C
    .map((t) => ({ nome: t.nome, slug: t.slug, importo: cons.ricaviPerTipologia[t.slug] ?? 0 }))
    .sort((a, b) => b.importo - a.importo);

  const ce: { label: string; v: number; costo?: boolean; forte?: boolean }[] = [
    { label: "Ricavi", v: cons.ricavi, forte: true },
    { label: "Costo del venduto", v: cons.cogs, costo: true },
    { label: "Margine lordo", v: cons.margineLordo, forte: true },
    { label: "Pubblicità", v: cons.adv, costo: true },
    { label: "Personale", v: cons.personale, costo: true },
    { label: "Struttura", v: cons.struttura, costo: true },
    { label: "EBITDA", v: cons.ebitda, forte: true },
  ];

  return (
    <>
      <Testata
        vista={vista}
        sotto={`${etichettaMesi} ${dati.year}${parziale ? ` · ${MESI[meseInCorso - 1]} è in corso: dati parziali` : ""}`}
      />

      {!cons.ok && (
        <div className="avviso-errore">
          Il consuntivo non è completo: {cons.mancanti.join(", ") || "una fonte non risponde"}. I numeri
          sotto valgono per quello che c&apos;è.
        </div>
      )}

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Vendite ecommerce · {etichettaMesi}</div>
          <div className="kpi-value">{venduto.ok ? eur(vendTot) : "—"}</div>
          <div className="kpi-sub">{venduto.ok ? "dai negozi, IVA inclusa" : venduto.errore}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Margine lordo</div>
          <div className="kpi-value">{eur(cons.margineLordo)}</div>
          <div className="kpi-sub">
            {cons.ricavi > 0 ? `${pct((cons.margineLordo / cons.ricavi) * 100)} dei ricavi` : "—"}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">EBITDA</div>
          <div className={`kpi-value ${cons.ebitda >= 0 ? "pos" : "neg"}`}>{eur(cons.ebitda)}</div>
          <div className="kpi-sub">
            <Link href="/consuntivo" style={{ color: "var(--blue)" }}>il consuntivo completo →</Link>
          </div>
        </div>
      </div>

      <h2 className="section-title" style={{ marginTop: 24 }}>Conto economico · {etichettaMesi}</h2>
      <div className="table-wrap">
        <table>
          <tbody>
            {ce.map((r) => (
              <tr key={r.label} className={r.label === "EBITDA" ? "tot" : undefined}>
                <td style={r.forte ? { fontWeight: 600 } : undefined}>{r.label}</td>
                <td className={`num ${r.label === "EBITDA" ? (r.v >= 0 ? "pos" : "neg") : ""}`} style={r.forte ? { fontWeight: 600 } : undefined}>
                  {r.costo ? `− ${eur(r.v)}` : eur(r.v)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="section-title" style={{ marginTop: 24 }}>Risultati maison · venduto dei negozi contro budget D2C</h2>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Maison</th><th className="num">Venduto</th><th className="num">Budget D2C {etichettaMesi}</th><th className="num">Realizzato</th></tr></thead>
          <tbody>
            {righeM.map((r) => (
              <tr key={r.nome}>
                <td>{r.nome}</td>
                <td className="num">{venduto.ok && r.vend !== null ? eur(r.vend) : "—"}</td>
                <td className="num">
                  {r.mesiSenzaBudget.length === 0
                    ? eur(r.budget)
                    : <span style={{ color: "var(--text-tertiary)" }}>manca {r.mesiSenzaBudget.map((m) => MESI[m - 1]).join(", ")}</span>}
                </td>
                <td className="num">
                  {/* Con mesi senza budget la percentuale sarebbe l'«866%» già visto: vuota. */}
                  {venduto.ok && r.vend !== null && r.mesiSenzaBudget.length === 0 && r.budget > 0
                    ? pct((r.vend / r.budget) * 100, 0)
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="section-title" style={{ marginTop: 24 }}>Risultati commerciali · fatturato per tipologia</h2>
      <div className="table-wrap">
        <table>
          <tbody>
            {righeC.map((r) => (
              <tr key={r.slug}>
                <td>{r.nome}</td>
                <td className="num">{eur(r.importo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="page-caption" style={{ marginTop: 8 }}>
        È il fatturato che Finance misura per tipologia (il D2C sta già nel conto economico sopra). Le{" "}
        <strong>linee commerciali</strong> non collegate alle voci di Finance restano fuori: il loro
        consuntivo è «n.d.», non zero — si collegano da{" "}
        <Link href="/commerciale" style={{ color: "var(--blue)" }}>/commerciale</Link>.
      </p>
    </>
  );
}

function Testata({ vista, sotto }: { vista: VistaKey; sotto: string }) {
  return (
    <div className="page-head">
      <div>
        <h1 className="page-title">Aggiornato</h1>
        <p className="page-caption">Come stanno andando le cose{sotto ? ` · ${sotto}` : ""}.</p>
      </div>
      {/* La fila scorre nella SUA riga (Libro v1.3): cinque viste a 375px non ci
          stanno, e senza il minWidth:0 il flex non lascia stringere il figlio —
          l'overflow saliva alla pagina intera (misurato: 404px su 375). */}
      <div className="page-actions" style={{ minWidth: 0, maxWidth: "100%" }}>
        <div className="seg" style={{ overflowX: "auto", maxWidth: "100%", flexShrink: 1 }}>
          {VISTE.map((v) => (
            <Link key={v.key} href={`/aggiornato?p=${v.key}`} className={v.key === vista ? "on" : ""}>
              {v.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
