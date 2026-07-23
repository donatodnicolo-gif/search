import { Icona } from "@/components/Icona";
import { SelettoreStato } from "@/components/SelettoreStato";
import { Sidebar } from "@/components/Sidebar";
import { cambiaStatoKeyword, creaOperazioneKeyword } from "@/lib/azioni";
import { prisma } from "@/lib/db";
import {
  COLORE_STATO_KEYWORD,
  ETICHETTA_STATO_KEYWORD,
  formattaEuro,
  formattaNumero,
  STATI_KEYWORD,
} from "@/lib/dominio";
import { giudizioKeyword } from "@/lib/salute";

export const dynamic = "force-dynamic";

// Categoria di prodotto dedotta dal testo della keyword.
function categoriaKeyword(testo: string): string {
  const t = testo.toLowerCase();
  if (/tort|cake|pasticc|dolc/.test(t)) return "torte";
  if (/colazion|breakfast|croissant/.test(t)) return "colazioni";
  if (/palloncin|balloon/.test(t)) return "palloncini";
  if (/regal|gift|box/.test(t)) return "regali";
  if (/rose|fior|flower|bouquet|piant|orchide|girasol|peoni|mazz/.test(t)) return "fiori";
  if (/consegn|domicilio|delivery|spedi|invio|inviare|manda/.test(t)) return "consegna";
  return "altro";
}

const CATEGORIE: { chiave: string; nome: string; icona: string; colore: string }[] = [
  { chiave: "fiori", nome: "Fiori", icona: "fiori", colore: "var(--purple)" },
  { chiave: "torte", nome: "Torte", icona: "torta", colore: "var(--orange)" },
  { chiave: "colazioni", nome: "Colazioni", icona: "colazione", colore: "var(--gold-strong)" },
  { chiave: "regali", nome: "Regali", icona: "regalo", colore: "var(--blue)" },
  { chiave: "palloncini", nome: "Palloncini", icona: "palloncino", colore: "var(--red)" },
  { chiave: "consegna", nome: "Consegna generica", icona: "destinazioni", colore: "var(--green)" },
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
  stato: string;
  campagne: string[];
  incasso: number;
  spesa: number;
  resa: number | null;
  clic: number;
  conversioni: number;
  qualita: number | null;
  viva: boolean;
};

// Keywords per tema: si sceglie un tema e lo si espande. La stessa keyword su
// più campagne è una riga sola; lo stato si governa da qui.
export default async function PaginaKeywords({
  searchParams,
}: {
  searchParams: Promise<{ ordina?: string; q?: string; campagna?: string; tema?: string; stato?: string; bloccata?: string }>;
}) {
  const p = await searchParams;
  const ordina = Object.keys(ORDINAMENTI).includes(p.ordina ?? "") ? p.ordina! : "incasso";
  const temaAperto = p.tema ?? null;

  const keyword = await prisma.copyAnnuncio.findMany({
    where: {
      tipo: "keyword",
      ...(p.q ? { testo: { contains: p.q } } : {}),
      ...(p.campagna ? { campagna: p.campagna } : {}),
    },
  });
  const campagneCensite = await prisma.campagna.findMany({
    where: { canale: "google_ads", stato: { in: ["attiva", "in_pausa"] } },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true, classe: true },
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
      stato: k.stato === "attivo" ? "attiva" : k.stato,
      campagne: [],
      incasso: 0,
      spesa: 0,
      resa: null,
      clic: 0,
      conversioni: 0,
      qualita: null,
      viva: false,
    };
    if (!agg.campagne.includes(k.campagna)) agg.campagne.push(k.campagna);
    agg.incasso += k.incasso ?? 0;
    agg.spesa += k.spesa ?? 0;
    agg.clic += k.clic ?? 0;
    agg.conversioni += k.conversioni ?? 0;
    if (k.punteggioQualita != null) agg.qualita = Math.max(agg.qualita ?? 0, k.punteggioQualita);
    if (k.metricheAl) agg.viva = true;
    perTesto.set(chiave, agg);
  }
  let tutte = [...perTesto.values()].map((k) => ({
    ...k,
    resa: k.spesa > 0 ? k.incasso / k.spesa : null,
  }));
  if (p.stato) tutte = tutte.filter((k) => k.stato === p.stato);

  const confronta = (a: KwAggregata, b: KwAggregata) => {
    if (ordina === "keyword") return a.testo.localeCompare(b.testo);
    if (ordina === "spesa") return b.spesa - a.spesa;
    if (ordina === "resa") return (b.resa ?? -1) - (a.resa ?? -1);
    return b.incasso - a.incasso;
  };

  const totIncasso = tutte.reduce((s, k) => s + k.incasso, 0);
  const totSpesa = tutte.reduce((s, k) => s + k.spesa, 0);

  // link che conserva i filtri correnti cambiando un solo parametro
  const link = (cambi: Record<string, string | null>) => {
    const q = new URLSearchParams();
    const base: Record<string, string | undefined> = {
      q: p.q, campagna: p.campagna, ordina: p.ordina, tema: p.tema, stato: p.stato,
    };
    for (const [k, v] of Object.entries({ ...base, ...cambi })) {
      if (v) q.set(k, v);
    }
    const s = q.toString();
    return `/keywords${s ? `?${s}` : ""}`;
  };

  return (
    <div className="layout">
      <Sidebar attiva="keywords" />
      <main className="main" style={{ maxWidth: 1700 }}>
        <div className="page-head">
          <div>
            <h1 className="page-title">Keywords</h1>
            <p className="page-sub">
              Le parole chiave raggruppate per tema: scegli un tema per aprirlo. La stessa keyword
              usata da più campagne è una riga sola, e lo stato che imposti vale su tutte.
            </p>
          </div>
        </div>

        {p.bloccata && (
          <div className="nota-info" style={{ borderColor: "rgba(215,0,21,.35)", background: "rgba(215,0,21,.06)" }}>
            <span className="nota-icona" style={{ color: "var(--red)" }}>⛔</span>
            <span><b>Operazione bloccata dal guardrail:</b> {p.bloccata}</span>
          </div>
        )}

        {campagneCensite.length > 0 && (
          <section className="scheda">
            <div className="scheda-titolo">Metti in coda su Google Ads</div>
            <p className="cella-sub" style={{ marginBottom: 12 }}>
              Aggiungi una keyword, una negativa, o metti in pausa/riattiva una keyword esistente.
              Niente parte subito: l&apos;operazione va approvata in{" "}
              <a href="/operazioni" style={{ color: "var(--blue)" }}>Operazioni</a> e la esegue lo
              script alla prossima corsa. Livelli: negativa L0 · aggiunta L1 · pausa/riattiva L2.
            </p>
            <form className="modulo" action={creaOperazioneKeyword}>
              <div className="campo-modulo">
                <label>Operazione</label>
                <select name="tipo" defaultValue="nuova_keyword">
                  <option value="nuova_keyword">Aggiungi keyword</option>
                  <option value="negativa">Aggiungi negativa</option>
                  <option value="pausa_keyword">Metti in pausa keyword</option>
                  <option value="attiva_keyword">Riattiva keyword</option>
                </select>
              </div>
              <div className="campo-modulo">
                <label>Campagna <span className="obbligatorio">*</span></label>
                <select name="campagnaId" required defaultValue="">
                  <option value="" disabled>Scegli…</option>
                  {campagneCensite.map((c) => (
                    <option key={c.id} value={c.id}>{c.nome}{c.classe === "traino" ? " · TRAINO" : ""}</option>
                  ))}
                </select>
              </div>
              <div className="campo-modulo largo">
                <label>Keyword <span className="obbligatorio">*</span></label>
                <input name="testo" required placeholder="es. consegna fiori roma" />
              </div>
              <div className="campo-modulo">
                <label>Corrispondenza</label>
                <select name="corrispondenza" defaultValue="broad">
                  <option value="broad">Broad</option>
                  <option value="phrase">Phrase</option>
                  <option value="exact">Exact</option>
                </select>
              </div>
              <div className="campo-modulo">
                <label>Gruppo di annunci (per l&apos;aggiunta)</label>
                <input name="gruppo" placeholder="vuoto = primo gruppo attivo" />
              </div>
              <div className="campo-modulo largo">
                <label>Perché</label>
                <input name="motivo" placeholder="Il motivo resta nello storico" />
              </div>
              <div className="campo-modulo largo">
                <label>Rollback (per pausa/riattiva su traino)</label>
                <input name="rollbackPiano" placeholder="Come si torna indietro se peggiora" />
              </div>
              <div className="azioni-modulo" style={{ gridColumn: "1 / -1" }}>
                <button className="btn" type="submit">Metti in coda</button>
              </div>
            </form>
          </section>
        )}

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
          {temaAperto && <input type="hidden" name="tema" value={temaAperto} />}
          <input type="search" name="q" placeholder="Cerca una keyword…" defaultValue={p.q ?? ""} />
          <select name="campagna" defaultValue={p.campagna ?? ""}>
            <option value="">Tutte le campagne</option>
            {campagneDisponibili.map((c) => (
              <option key={c.campagna} value={c.campagna}>{c.campagna}</option>
            ))}
          </select>
          <select name="stato" defaultValue={p.stato ?? ""}>
            <option value="">Tutti gli stati</option>
            {STATI_KEYWORD.map((s) => (
              <option key={s} value={s}>{ETICHETTA_STATO_KEYWORD[s]}</option>
            ))}
          </select>
          <select name="ordina" defaultValue={ordina}>
            {Object.entries(ORDINAMENTI).map(([v, e]) => (
              <option key={v} value={v}>Ordina per {e}</option>
            ))}
          </select>
          <button className="btn small" type="submit">Applica</button>
        </form>

        {/* Scelta del tema: tessere cliccabili, quella aperta resta evidenziata */}
        <div className="griglia-temi">
          {CATEGORIE.map((cat) => {
            const del = tutte.filter((k) => k.categoria === cat.chiave);
            if (del.length === 0) return null;
            const incasso = del.reduce((s, k) => s + k.incasso, 0);
            const spesa = del.reduce((s, k) => s + k.spesa, 0);
            const aperto = temaAperto === cat.chiave;
            return (
              <a
                className={`tessera-tema${aperto ? " aperta" : ""}`}
                key={cat.chiave}
                href={link({ tema: aperto ? null : cat.chiave })}
              >
                <span className="tessera-icona" style={{ color: cat.colore }}>
                  <Icona nome={cat.icona} />
                </span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span className="tessera-nome">{cat.nome}</span>
                  <span className="tessera-conta">{del.length} keyword</span>
                </span>
                <span className="tessera-resa">
                  <b>{spesa > 0 ? `${(incasso / spesa).toFixed(1)}×` : "—"}</b>
                  <i>{formattaEuro(incasso)}</i>
                </span>
              </a>
            );
          })}
        </div>

        {!temaAperto && (
          <div className="vuoto">Scegli un tema qui sopra per vedere le sue keyword.</div>
        )}

        {CATEGORIE.filter((c) => c.chiave === temaAperto).map((cat) => {
          const del = tutte.filter((k) => k.categoria === cat.chiave).sort(confronta);
          const incassoCat = del.reduce((s, k) => s + k.incasso, 0);
          const spesaCat = del.reduce((s, k) => s + k.spesa, 0);
          return (
            <section className="scheda" key={cat.chiave} style={{ padding: 0 }}>
              <div className="scheda-titolo" style={{ display: "flex", alignItems: "center", gap: 10, padding: "18px 24px 0", flexWrap: "wrap" }}>
                <span className="tessera-icona" style={{ color: cat.colore }}>
                  <Icona nome={cat.icona} />
                </span>
                {cat.nome} ({del.length})
                <span style={{ marginLeft: "auto", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
                  {formattaEuro(incassoCat)} incasso · {formattaEuro(spesaCat)} spesa ·{" "}
                  {spesaCat > 0 ? `${(incassoCat / spesaCat).toFixed(1)}×` : "—"}
                </span>
                <a className="btn small btn-secondario" href={link({ tema: null })}>Chiudi</a>
              </div>
              <div style={{ overflowX: "auto", paddingBottom: 6 }}>
                <table>
                  <thead>
                    <tr>
                      <th><a href={link({ ordina: "keyword" })}>Keyword {ordina === "keyword" ? "↓" : ""}</a></th>
                      <th style={{ minWidth: 150 }}>Valutazione</th>
                      <th style={{ minWidth: 140 }}>Stato</th>
                      <th>Campagne</th>
                      <th className="num"><a href={link({ ordina: "incasso" })}>Incasso {ordina === "incasso" ? "↓" : ""}</a></th>
                      <th className="num">Clic</th>
                      <th className="num">Conv.</th>
                      <th className="num" title="Punteggio di qualità Google (1-10)">QS</th>
                      <th className="num"><a href={link({ ordina: "spesa" })}>Spesa {ordina === "spesa" ? "↓" : ""}</a></th>
                      <th className="num"><a href={link({ ordina: "resa" })}>Resa {ordina === "resa" ? "↓" : ""}</a></th>
                    </tr>
                  </thead>
                  <tbody>
                    {del.map((k) => {
                      const g = giudizioKeyword(k.incasso, k.spesa);
                      return (
                      <tr key={k.testo}>
                        <td className="cella-nome">{k.testo}</td>
                        <td>
                          <span className="tag-salute" style={{ color: g.colore }} title={g.spiega}>
                            <span className="dot" />
                            {g.etichetta}
                          </span>
                        </td>
                        <td>
                          <form action={cambiaStatoKeyword}>
                            <input type="hidden" name="keyword" value={k.testo} />
                            <SelettoreStato
                              valore={k.stato}
                              colore={COLORE_STATO_KEYWORD[k.stato]}
                              opzioni={STATI_KEYWORD.map((s) => ({ valore: s, etichetta: ETICHETTA_STATO_KEYWORD[s] }))}
                            />
                          </form>
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {k.campagne.map((c) => (
                              <span className="tag-neutro" key={c}>{c}</span>
                            ))}
                          </div>
                        </td>
                        <td className="num" style={{ color: k.incasso > 0 ? "var(--green)" : "var(--text-tertiary)", fontWeight: k.incasso > 0 ? 600 : 400 }}>
                          {formattaEuro(k.incasso)}
                        </td>
                        <td className="num cella-muta">{k.clic > 0 ? formattaNumero(k.clic) : "—"}</td>
                        <td className="num cella-muta">{k.conversioni > 0 ? k.conversioni.toFixed(1) : "—"}</td>
                        <td className="num" style={k.qualita != null && k.qualita < 5 ? { color: "var(--red)", fontWeight: 600 } : undefined}>
                          {k.qualita ?? "—"}
                        </td>
                        <td className="num cella-muta">{formattaEuro(k.spesa)}</td>
                        <td className="num" style={k.resa != null && k.resa < 1 && k.spesa > 30 ? { color: "var(--red)", fontWeight: 600 } : undefined}>
                          {k.resa != null ? `${k.resa.toFixed(1)}×` : "—"}
                        </td>
                      </tr>
                      );
                    })}
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
