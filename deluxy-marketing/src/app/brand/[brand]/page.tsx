import { notFound, redirect } from "next/navigation";
import { BudgetCampagneBrand } from "@/components/BudgetCampagneBrand";
import { BudgetQuestoMese } from "@/components/BudgetQuestoMese";
import { Badge } from "@/components/Badge";
import { VisteSalvate } from "@/components/VisteSalvate";
import { destinazionePredefinita } from "@/lib/viste";
import { FreschezzaDati } from "@/components/FreschezzaDati";
import { GraficoSpesa } from "@/components/GraficoSpesa";
import { RigaLink } from "@/components/RigaLink";
import { Scadenza } from "@/components/Scadenza";
import { Sidebar } from "@/components/Sidebar";
import { mer, numeriBrand, numeriPerCanale, quotaPagato, roasPiattaforma, scostamentoAttribuzione } from "@/lib/brand-dati";
import { prisma } from "@/lib/db";
import {
  BRANDS,
  COLORE_CANALE,
  COLORE_ALERT,
  COLORE_BRAND,
  COLORE_ESITO,
  COLORE_STATO_AZIONE,
  COLORE_STATO_CAMPAGNA,
  ETICHETTA_BRAND,
  ETICHETTA_CANALE,
  ETICHETTA_ESITO,
  ETICHETTA_STATO_AZIONE,
  ETICHETTA_STATO_CAMPAGNA,
  ETICHETTA_TIPO_ANALISI,
  formattaData,
  formattaEuro,
  roas,
  STATI_AZIONE_APERTI,
  STATI_CAMPAGNA_VIVE,
} from "@/lib/dominio";
import { breakEvenRoas } from "@/lib/guardrail";
import { PRESET_PERIODO, variazione } from "@/lib/periodo";
import { periodoApp } from "@/lib/periodo-condiviso";
import { COLORE_VERDETTO, schedaDi, type VerdettoScheda } from "@/lib/scheda-analisi";

export const dynamic = "force-dynamic";

function Delta({ ora, prima, invertito }: { ora: number; prima: number; invertito?: boolean }) {
  const v = variazione(ora, prima);
  if (v == null) return <i style={{ fontStyle: "normal", color: "var(--text-tertiary)" }}>—</i>;
  const positivo = invertito ? v < 0 : v > 0;
  return (
    <i style={{ fontStyle: "normal", fontSize: 11.5, fontVariantNumeric: "tabular-nums", color: positivo ? "var(--green)" : "var(--red)" }}>
      {v > 0 ? "+" : ""}{v.toFixed(0)}%
    </i>
  );
}

// La dashboard di un brand: il marketing e le vendite nello stesso posto, sul
// periodo che scegli. Il ROAS di piattaforma dice cosa si attribuisce Google;
// il MER dice se l'insegna sta in piedi. Servono entrambi, letti insieme al
// break-even del brand (doc 10 §11).
export default async function PaginaBrand({
  params,
  searchParams,
}: {
  params: Promise<{ brand: string }>;
  searchParams: Promise<{ preset?: string; da?: string; a?: string; ord?: string; verso?: string; vista?: string }>;
}) {
  const { brand } = await params;
  if (!(BRANDS as readonly string[]).includes(brand)) notFound();
  const sp = await searchParams;
  // Le tre dashboard per brand condividono le viste (i parametri sono gli
  // stessi: periodo e ordinamento), ma ognuna vive al proprio indirizzo.
  const destinazione = await destinazionePredefinita("brand", `/brand/${brand}`, sp);
  if (destinazione) redirect(destinazione);
  const periodo = await periodoApp(sp, "30g");

  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);

  const [ora, prima, anno, aperte, scadute, analisi, letture, campagne, metrichePeriodo, alertAperti, pubblici, landing, canali] =
    await Promise.all([
      numeriBrand(brand, periodo.corrente),
      numeriBrand(brand, periodo.precedente),
      numeriBrand(brand, periodo.annoPrima),
      prisma.azione.findMany({
        where: { brand, stato: { in: STATI_AZIONE_APERTI } },
        orderBy: [{ scadenza: { sort: "asc", nulls: "last" } }, { creataIl: "desc" }],
        take: 10,
      }),
      prisma.azione.count({ where: { brand, stato: { in: STATI_AZIONE_APERTI }, scadenza: { lt: oggi } } }),
      prisma.analisi.findMany({ where: { brand }, orderBy: { dataAnalisi: "desc" }, take: 6 }),
      // Le LETTURE: le analisi già rielaborate in scheda, da aprire dalla
      // testata col loro verdetto. Sono la risposta a «cosa dicono di questo
      // brand le ultime letture?» prima ancora di guardare i numeri.
      prisma.analisi.findMany({
        where: { brand, scheda: { not: null } },
        orderBy: { dataAnalisi: "desc" },
        take: 3,
        select: { id: true, titolo: true, verdetto: true, dataAnalisi: true, scheda: true },
      }),
      prisma.campagna.findMany({
        // Solo quelle che girano: una scheda brand serve a decidere su oggi, e
        // un elenco pieno di campagne spente del 2025 nasconde le tre che
        // stanno spendendo adesso. Le altre stanno in /campagne, nella sezione
        // "Campagne non attive", con la loro spesa storica.
        where: { brand, stato: { in: [...STATI_CAMPAGNA_VIVE] } },
        orderBy: [{ stato: "asc" }, { creataIl: "desc" }],
        include: { metriche: { where: { data: { gte: periodo.corrente.da, lt: periodo.corrente.a } } } },
      }),
      prisma.metricaCampagna.findMany({
        where: { data: { gte: periodo.corrente.da, lt: periodo.corrente.a }, campagna: { brand } },
        select: { data: true, spesa: true },
      }),
      prisma.alert.findMany({
        where: { stato: "aperto", campagna: { brand } },
        include: { campagna: { select: { id: true, nome: true, classe: true } } },
        orderBy: { giorno: "desc" },
        take: 8,
      }),
      prisma.pubblico.count({ where: { brand } }),
      prisma.landingPage.count({ where: { brand } }),
      // Quanto spende e quanto incassa ogni singolo canale: la media di brand
      // nasconde il canale che tiene su tutto e quello che se lo mangia.
      numeriPerCanale(brand, periodo.corrente),
    ]);

  // Spesa giorno per giorno nel periodo scelto
  const giorni = Math.max(1, Math.round((periodo.corrente.a.getTime() - periodo.corrente.da.getTime()) / 86_400_000));
  const perGiorno = new Map<string, number>();
  for (let i = 0; i < giorni; i++) {
    const d = new Date(periodo.corrente.da.getTime() + i * 86_400_000);
    perGiorno.set(d.toISOString().slice(0, 10), 0);
  }
  for (const m of metrichePeriodo) {
    const k = m.data.toISOString().slice(0, 10);
    if (perGiorno.has(k)) perGiorno.set(k, (perGiorno.get(k) ?? 0) + (m.spesa ?? 0));
  }
  const puntiSpesa = [...perGiorno.entries()].map(([g, valore]) => ({ data: new Date(g), valore }));

  const be = breakEvenRoas(brand);
  const roasOra = roasPiattaforma(ora);
  const merOra = mer(ora);
  const merPrima = mer(prima);
  const quota = quotaPagato(ora);
  const scost = scostamentoAttribuzione(ora);
  const ultimoAudit = analisi.find((a) => a.tipo.startsWith("audit_"));
  const traino = campagne.filter((c) => c.classe === "traino");

  // ORDINAMENTO DELLE COLONNE. Il verso si ricorda: ripremere la stessa
  // colonna rovescia l'ordine, che è quello che uno si aspetta da una tabella.
  // Il difetto resta la spesa in giù: davanti a una lista di campagne la prima
  // domanda è dove stanno andando i soldi.
  const ord = sp.ord ?? "spesa";
  const verso = sp.verso === "su" ? "su" : "giu";
  const linkOrd = (colonna: string) => {
    const q = new URLSearchParams();
    if (sp.preset) q.set("preset", sp.preset);
    if (sp.da) q.set("da", sp.da);
    if (sp.a) q.set("a", sp.a);
    q.set("ord", colonna);
    // Stessa colonna → si rovescia; colonna nuova → si parte dal verso utile
    // (grande-piccolo per i numeri, A-Z per il testo).
    const numerica = ["spesa", "conv", "valore", "roas"].includes(colonna);
    q.set("verso", ord === colonna ? (verso === "giu" ? "su" : "giu") : numerica ? "giu" : "su");
    return `/brand/${brand}?${q.toString()}`;
  };
  const frecciaOrd = (colonna: string) => (ord === colonna ? (verso === "giu" ? " ↓" : " ↑") : "");
  const ordinatore = (
    a: { c: { nome: string; canale: string; stato: string }; spesa: number; ric: number; conv: number },
    b: typeof a
  ) => {
    const segno = verso === "giu" ? -1 : 1;
    const resa = (x: typeof a) => (x.spesa > 0 ? x.ric / x.spesa : -1);
    if (ord === "nome") return segno * a.c.nome.localeCompare(b.c.nome, "it");
    if (ord === "canale") return segno * a.c.canale.localeCompare(b.c.canale, "it");
    if (ord === "stato") return segno * a.c.stato.localeCompare(b.c.stato, "it");
    if (ord === "conv") return segno * (a.conv - b.conv);
    if (ord === "valore") return segno * (a.ric - b.ric);
    if (ord === "roas") return segno * (resa(a) - resa(b));
    return segno * (a.spesa - b.spesa);
  };

  const linkPreset = (chiave: string) =>
    `/brand/${brand}${chiave !== "libero" ? `?preset=${chiave}` : ""}`;

  return (
    <div className="layout">
      <Sidebar brandAttivo={brand} />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title" style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span className="sb-dot" style={{ background: COLORE_BRAND[brand], width: 14, height: 14 }} />
              {ETICHETTA_BRAND[brand]}
            </h1>
            <p className="page-sub">
              {periodo.corrente.etichetta} · pubblicità e vendite nello stesso posto. Break-even del
              brand <b>{be.toFixed(2).replace(".", ",")}×</b> (margine {Math.round((1 / be) * 100)}%).
            </p>
          </div>
          {/* ⚠️ LE LETTURE DISPONIBILI, in alto a destra (richiesta utente,
              25/08 sera): le analisi già rielaborate in scheda, ognuna col
              pallino del SUO verdetto e la frase-verdetto sotto il mouse.
              L'etichetta è il titolo senza la data davanti — la data sta
              accanto, e ripeterla è rumore. Se non c'è nessuna scheda il
              blocco sparisce: resta solo «Deposita analisi». */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
            {letture.length > 0 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                {letture.map((l) => {
                  const sch = schedaDi(l);
                  const verdetto = (l.verdetto ?? "giallo") as VerdettoScheda;
                  return (
                    <a
                      key={l.id}
                      className="btn small btn-secondario"
                      href={`/analisi/${l.id}`}
                      title={sch?.titolo ?? l.titolo}
                      style={{ display: "inline-flex", alignItems: "center", gap: 7 }}
                    >
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: COLORE_VERDETTO[verdetto] ?? "var(--text-tertiary)",
                          flexShrink: 0,
                        }}
                      />
                      {l.titolo.replace(/^\s*\d{4}-\d{2}-\d{2}\s*[-–—]\s*/, "")}
                      <span className="cella-sub">{formattaData(l.dataAnalisi)}</span>
                    </a>
                  );
                })}
              </div>
            )}
            <a className="btn" href={`/analisi/nuova?brand=${brand}`}>Deposita analisi</a>
          </div>
        </div>

        <VisteSalvate pagina="brand" base={`/brand/${brand}`} parametri={sp} />

        {/* Periodo */}
        <section className="scheda" style={{ paddingBottom: 14 }}>
          <div className="pill-scelta" style={{ marginBottom: 12 }}>
            {PRESET_PERIODO.filter((x) => x.chiave !== "libero").map((x) => (
              <a key={x.chiave} className={`pill-opt${periodo.preset === x.chiave ? " attuale" : ""}`} href={linkPreset(x.chiave)}>
                {x.nome}
              </a>
            ))}
          </div>
          <form className="filtri" method="get" style={{ marginBottom: 0 }}>
            <input type="date" name="da" defaultValue={sp.da ?? ""} title="Dal" />
            <input type="date" name="a" defaultValue={sp.a ?? ""} title="Al (compreso)" />
            <button className="btn small" type="submit">Applica</button>
          </form>
        </section>

        <FreschezzaDati brand={brand} />

        {/* ⚠️ Quanto abbiamo ACCESO contro quanto POSSIAMO spendere: le due
            cifre vivevano in due app diverse (i budget su Google e Meta, il
            tetto in Budgets), quindi nessuno le confrontava mai — e la domanda
            se la faceva la fattura. */}
        {/* IL MESE IN UNA RIGA: consentito da Budgets, speso, resta,
            proiezione — la stessa tabella di /budget, solo questo brand.
            Sopra il dettaglio campagna per campagna, che la spiega. */}
        <BudgetQuestoMese anno={oggi.getFullYear()} soloSito={brand} />

        <BudgetCampagneBrand brand={brand} />

        {/* Canale per canale: la media di brand nasconde chi tiene su la
            baracca e chi se la mangia. */}
        <section className="scheda">
          <div className="scheda-titolo">
            Quanto spende e quanto incassa ogni canale · {periodo.corrente.etichetta}
          </div>
          {canali.length === 0 ? (
            <div className="vuoto-mini">
              Nessuna metrica di campagna nel periodo: non c&apos;è niente da spezzare per canale.
            </div>
          ) : (
            <>
              <div style={{ overflowX: "auto" }}>
                <table>
                  <thead>
                    <tr>
                      <th>Canale</th>
                      <th className="num">Spesa</th>
                      <th className="num">Quota</th>
                      <th className="num">Incasso dichiarato</th>
                      <th className="num">ROAS</th>
                      <th className="num">Conv.</th>
                      <th className="num">Costo per conv.</th>
                      <th className="num">Campagne</th>
                    </tr>
                  </thead>
                  <tbody>
                    {canali.map((c) => (
                      <tr key={c.canale}>
                        <td>
                          {/* Cliccabile: da qui si entra nelle campagne di QUEL
                              canale per QUESTO brand, col periodo già scelto. */}
                          <a
                            href={`/campagne?brand=${brand}&canale=${c.canale}&preset=${periodo.preset}`}
                            title={`Vedi le campagne ${ETICHETTA_CANALE[c.canale] ?? c.canale} di ${ETICHETTA_BRAND[brand] ?? brand}`}
                          >
                            <Badge
                              testo={ETICHETTA_CANALE[c.canale] ?? c.canale}
                              colore={COLORE_CANALE[c.canale] ?? "var(--text-secondary)"}
                            />
                          </a>
                        </td>
                        <td className="num">{formattaEuro(c.spesa)}</td>
                        <td className="num cella-muta">{Math.round(c.quotaSpesa * 100)}%</td>
                        <td className="num">{formattaEuro(c.ricaviPiattaforma)}</td>
                        <td
                          className="num"
                          style={{
                            fontWeight: 600,
                            color:
                              c.roas == null
                                ? "var(--text-tertiary)"
                                : c.roas >= be
                                  ? "var(--green)"
                                  : "var(--red)",
                          }}
                        >
                          {c.roas != null ? `${c.roas.toFixed(2).replace(".", ",")}×` : "—"}
                        </td>
                        <td className="num cella-muta">{c.conversioni.toFixed(0)}</td>
                        <td className="num cella-muta">{c.cpa != null ? formattaEuro(c.cpa) : "—"}</td>
                        <td className="num cella-muta">{c.campagne}</td>
                      </tr>
                    ))}
                    <tr>
                      <td className="cella-nome">Totale</td>
                      <td className="num">{formattaEuro(canali.reduce((s, c) => s + c.spesa, 0))}</td>
                      <td className="num cella-muta">100%</td>
                      <td className="num">
                        {formattaEuro(canali.reduce((s, c) => s + c.ricaviPiattaforma, 0))}
                      </td>
                      <td className="num" />
                      <td className="num cella-muta">
                        {canali.reduce((s, c) => s + c.conversioni, 0).toFixed(0)}
                      </td>
                      <td className="num" />
                      <td className="num cella-muta">{canali.reduce((s, c) => s + c.campagne, 0)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="cella-sub" style={{ marginTop: 10, whiteSpace: "normal" }}>
                ⚠️ L&apos;incasso è quello che <b>il canale si attribuisce</b>, ed è di parte: ogni
                piattaforma conta a modo suo, e la somma dei canali ({formattaEuro(canali.reduce((s, c) => s + c.ricaviPiattaforma, 0))})
                può superare le vendite Shopify vere del periodo ({formattaEuro(ora.venditeTotali)}).
                Le vendite Shopify <b>non si sanno spezzare per canale</b> — l&apos;UTM c&apos;è su una
                minoranza di ordini — quindi il MER resta un numero di brand e questa tabella non
                finge di poterlo dividere. Il ROAS è colorato sul break-even di {ETICHETTA_BRAND[brand]} ({be.toFixed(2).replace(".", ",")}×).
              </p>
            </>
          )}
        </section>

        {/* I numeri che contano */}
        <div className="kpi-riga">
          <div className="kpi">
            <div className="kpi-valore">{formattaEuro(ora.spesa)}</div>
            <div className="kpi-etichetta">
              Spesa ADV · Δ <Delta ora={ora.spesa} prima={prima.spesa} /> · Δa <Delta ora={ora.spesa} prima={anno.spesa} />
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{ora.ordini > 0 ? formattaEuro(ora.venditeTotali) : "—"}</div>
            <div className="kpi-etichetta">
              Vendite Shopify ({ora.ordini} ordini) · Δ <Delta ora={ora.venditeTotali} prima={prima.venditeTotali} /> · Δa{" "}
              <Delta ora={ora.venditeTotali} prima={anno.venditeTotali} />
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-valore" style={merOra != null ? { color: merOra >= be ? "var(--green)" : "var(--orange)" } : undefined}>
              {merOra != null ? `${merOra.toFixed(2).replace(".", ",")}×` : "—"}
            </div>
            <div className="kpi-etichetta">
              MER — tutte le vendite / tutta la spesa · Δ <Delta ora={merOra ?? 0} prima={merPrima ?? 0} />
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-valore" style={roasOra != null ? { color: roasOra >= be ? "var(--green)" : "var(--red)" } : undefined}>
              {roasOra != null ? `${roasOra.toFixed(2).replace(".", ",")}×` : "—"}
            </div>
            <div className="kpi-etichetta">
              ROAS dichiarato · reale stimato{" "}
              {roasOra != null ? `${(roasOra * 0.6).toFixed(1)}–${(roasOra * 0.75).toFixed(1).replace(".", ",")}×` : "—"}
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{quota != null ? `${Math.round(quota * 100)}%` : "—"}</div>
            <div className="kpi-etichetta">
              Vendite da campagne tracciate{ora.ordiniDaCampagne > 0 ? ` · ${ora.ordiniDaCampagne} ordini` : ""}
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-valore" style={scadute > 0 ? { color: "var(--red)" } : undefined}>{aperte.length}</div>
            <div className="kpi-etichetta">
              Azioni aperte{scadute > 0 ? ` · ${scadute} scadute` : ""}
            </div>
          </div>
        </div>

        {/* Dove piattaforma e Shopify non concordano */}
        {scost != null && scost > 1.4 && (
          <div className="nota-info">
            <span className="nota-icona">◈</span>
            <span>
              <b>La piattaforma si attribuisce {scost.toFixed(1).replace(".", ",")}× le vendite tracciate da Shopify</b>{" "}
              ({formattaEuro(ora.ricaviPiattaforma)} dichiarati contro {formattaEuro(ora.venditeDaCampagne)} veri).
              È il normale scarto fra last-click e view-through: per decidere usa il MER e le vendite
              Shopify, non il ROAS dichiarato (doc 10 §3).
            </span>
          </div>
        )}
        {ora.ordini === 0 && ora.spesa > 0 && (
          <div className="nota-info">
            <span className="nota-icona">◈</span>
            <span>
              Nessun ordine Shopify per questo brand nel periodo: il MER non è calcolabile e restano
              solo i numeri dichiarati dalla piattaforma. Gli ordini si importano dalla sezione{" "}
              <a href="/ordini" style={{ color: "var(--blue)" }}>Ordini</a>.
            </span>
          </div>
        )}

        {/* Alert aperti */}
        {alertAperti.length > 0 && (
          <section className="scheda">
            <div className="scheda-titolo">Alert aperti ({alertAperti.length})</div>
            <ul className="storia">
              {alertAperti.map((a) => (
                <li key={a.id}>
                  <span className="storia-data">{formattaData(a.giorno)}</span>
                  <span className="storia-testo">
                    <a href={`/campagne/${a.campagna.id}`} className="cella-nome">
                      {a.campagna.nome}{a.campagna.classe === "traino" ? " · TRAINO" : ""}
                    </a>
                    <span className="cella-sub">{a.messaggio}</span>
                  </span>
                  <span className="storia-autore">
                    <Badge testo={a.tipo} colore={COLORE_ALERT[a.livello] ?? "var(--text-tertiary)"} />
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="due-colonne">
          <div>
            <section className="scheda">
              <div className="scheda-titolo">
                Campagne ({campagne.length}){traino.length > 0 ? ` · ${traino.length} traino` : ""}
              </div>
              {campagne.length === 0 ? (
                <div className="vuoto-mini">Nessuna campagna registrata</div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table>
                    <thead>
                      <tr>
                        <th><a href={linkOrd("nome")}>Campagna{frecciaOrd("nome")}</a></th>
                        <th><a href={linkOrd("canale")}>Canale{frecciaOrd("canale")}</a></th>
                        <th><a href={linkOrd("stato")}>Stato{frecciaOrd("stato")}</a></th>
                        <th className="num"><a href={linkOrd("spesa")}>Spesa{frecciaOrd("spesa")}</a></th>
                        <th className="num"><a href={linkOrd("conv")}>Conv.{frecciaOrd("conv")}</a></th>
                        <th className="num" title="Valore delle conversioni dichiarato dalla piattaforma">
                          <a href={linkOrd("valore")}>Valore{frecciaOrd("valore")}</a>
                        </th>
                        <th className="num"><a href={linkOrd("roas")}>ROAS{frecciaOrd("roas")}</a></th>
                      </tr>
                    </thead>
                    <tbody>
                      {campagne
                        .map((c) => ({
                          c,
                          spesa: c.metriche.reduce((s, m) => s + (m.spesa ?? 0), 0),
                          ric: c.metriche.reduce((s, m) => s + (m.ricavi ?? 0), 0),
                          conv: c.metriche.reduce((s, m) => s + (m.conversioni ?? 0), 0),
                        }))
                        .sort(ordinatore)
                        .map(({ c, spesa, ric, conv }) => {
                          const r = roas(ric, spesa);
                          const lead = c.tipoConversione === "lead";
                          return (
                            // «La riga si apre col click» (Libro v1.6 §8):
                            // tutta la riga porta alla campagna.
                            <RigaLink key={c.id} href={`/campagne/${c.id}`} className="riga-link">
                              <td style={{ maxWidth: 230 }}>
                                <a href={`/campagne/${c.id}`} className="cella-nome">{c.nome}</a>
                                {(c.classe === "traino" || lead) && (
                                  <div className="cella-sub">
                                    {c.classe === "traino" ? "TRAINO" : ""}
                                    {c.classe === "traino" && lead ? " · " : ""}
                                    {lead ? "LEAD" : ""}
                                  </div>
                                )}
                              </td>
                              <td>
                                <Badge
                                  testo={ETICHETTA_CANALE[c.canale] ?? c.canale}
                                  colore={COLORE_CANALE[c.canale] ?? "var(--text-secondary)"}
                                />
                              </td>
                              <td>
                                {/* ⚠️ Il FATTO prima del giudizio, come sui
                                    gruppi. Questa colonna mostrava solo lo
                                    stato dell'app: «Retargeting -
                                    Microacquisti» risultava «In pausa» mentre
                                    su Meta era accesa e stava spendendo, e
                                    sembrava un errore dei numeri (11/08).
                                    Quando i due non concordano si vedono
                                    entrambi: comanda quello che dice la
                                    piattaforma. */}
                                {c.statoPiattaforma && c.statoPiattaforma !== "PAUSED" && c.stato === "in_pausa" ? (
                                  <>
                                    <Badge testo="Attiva sulla piattaforma" colore="var(--green)" />
                                    <div className="cella-sub" title="Lo stato deciso nell'app non coincide con quello della piattaforma: comanda la piattaforma">
                                      nell&apos;app: in pausa
                                    </div>
                                  </>
                                ) : (
                                  <Badge testo={ETICHETTA_STATO_CAMPAGNA[c.stato] ?? c.stato} colore={COLORE_STATO_CAMPAGNA[c.stato] ?? "var(--text-tertiary)"} />
                                )}
                              </td>
                              <td className="num">{spesa > 0 ? formattaEuro(spesa) : "—"}</td>
                              <td className="num">{conv > 0 ? Math.round(conv) : "—"}</td>
                              <td className="num" style={lead ? { color: "var(--text-tertiary)" } : undefined}>
                                {lead ? "n/d" : ric > 0 ? formattaEuro(ric) : "—"}
                              </td>
                              <td className="num" style={{ fontWeight: 600, color: lead ? "var(--text-tertiary)" : r != null ? (r >= be ? "var(--green)" : "var(--red)") : undefined }}>
                                {lead ? "n/d" : r != null ? `${r.toFixed(1).replace(".", ",")}×` : "—"}
                              </td>
                            </RigaLink>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}
              <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <a className="btn small btn-secondario" href={`/analisi-campagne?brand=${brand}&preset=${periodo.preset}`}>
                  Analisi per periodo
                </a>
                <a className="btn small btn-secondario" href={`/campagne?brand=${brand}`}>Tutte le campagne</a>
              </div>
            </section>

            <section className="scheda">
              <div className="scheda-titolo">Azioni aperte</div>
              {aperte.length === 0 ? (
                <div className="vuoto-mini">Nessuna azione aperta per questo brand</div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table>
                    <thead>
                      <tr><th>Azione</th><th>Stato</th><th>Scadenza</th></tr>
                    </thead>
                    <tbody>
                      {aperte.map((a) => (
                        <tr key={a.id}>
                          <td><a href={`/azioni/${a.id}`} className="cella-nome">{a.titolo}</a></td>
                          <td>
                            <Badge testo={ETICHETTA_STATO_AZIONE[a.stato] ?? a.stato} colore={COLORE_STATO_AZIONE[a.stato] ?? "var(--text-tertiary)"} />
                          </td>
                          <td><Scadenza data={a.scadenza} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div style={{ marginTop: 12 }}>
                <a className="btn small btn-secondario" href={`/azioni?brand=${brand}`}>Tutte le azioni</a>
              </div>
            </section>
          </div>

          <div>
            <section className="scheda">
              <div className="scheda-titolo">Spesa nel periodo</div>
              <GraficoSpesa punti={puntiSpesa} />
              <p className="cella-sub" style={{ marginTop: 10 }}>
                {ora.click.toLocaleString("it-IT")} clic · {ora.impression.toLocaleString("it-IT")} impressioni ·{" "}
                {Math.round(ora.conversioni)} conversioni dichiarate
                {ora.conversioni > 0 ? ` · CPA ${formattaEuro(ora.spesa / ora.conversioni)}` : ""}
              </p>
            </section>

            <section className="scheda">
              <div className="scheda-titolo">Il brand in breve</div>
              <div className="kpi-riga" style={{ marginBottom: 0 }}>
                <div className="kpi">
                  <div className="kpi-valore">{pubblici}</div>
                  <div className="kpi-etichetta"><a href={`/pubblici?brand=${brand}`}>Pubblici</a></div>
                </div>
                <div className="kpi">
                  <div className="kpi-valore">{landing}</div>
                  <div className="kpi-etichetta"><a href={`/landing?brand=${brand}`}>Landing</a></div>
                </div>
                <div className="kpi">
                  {ultimoAudit?.esito ? (
                    <div style={{ marginBottom: 6 }}>
                      <Badge testo={ETICHETTA_ESITO[ultimoAudit.esito] ?? ultimoAudit.esito} colore={COLORE_ESITO[ultimoAudit.esito] ?? "var(--text-tertiary)"} />
                    </div>
                  ) : (
                    <div className="kpi-valore">—</div>
                  )}
                  <div className="kpi-etichetta">
                    Ultimo audit{ultimoAudit ? ` · ${formattaData(ultimoAudit.dataAnalisi)}` : ""}
                  </div>
                </div>
              </div>
            </section>

            <section className="scheda">
              <div className="scheda-titolo">Ultime analisi &amp; audit</div>
              {analisi.length === 0 ? (
                <div className="vuoto-mini">Nessuna analisi per questo brand</div>
              ) : (
                <ul className="storia">
                  {analisi.map((an) => (
                    <li key={an.id}>
                      <span className="storia-data">{formattaData(an.dataAnalisi)}</span>
                      <span className="storia-testo">
                        <a href={`/analisi/${an.id}`} className="cella-nome">{an.titolo}</a>
                        <span className="cella-sub">{ETICHETTA_TIPO_ANALISI[an.tipo] ?? an.tipo}</span>
                      </span>
                      {an.esito && (
                        <span className="storia-autore">
                          <Badge testo={ETICHETTA_ESITO[an.esito] ?? an.esito} colore={COLORE_ESITO[an.esito] ?? "var(--text-tertiary)"} />
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <div style={{ marginTop: 12 }}>
                <a className="btn small btn-secondario" href={`/analisi?brand=${brand}`}>Tutte le analisi</a>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
