import Link from "next/link";
import { Suspense } from "react";
import { riepilogoTutti, ANNO_CORRENTE } from "@/lib/queries";
import { AttiviDaRegistro } from "@/components/AttiviDaRegistro";
import { MESI, nomeMese } from "@/lib/calc";
import { euro, pctIt } from "@/lib/format";
import { ThSort, ordina } from "@/components/ThSort";
import { RigaLink } from "@/components/RigaLink";
import { BadgeCredito } from "@/components/BadgeCredito";
import { ZonaFiltri } from "@/components/ZonaFiltri";
import { schedeTutti, schedaVuota, GRAVITA } from "@/lib/stato-credito";

export const dynamic = "force-dynamic";

function badgeStato(clienteAnno: string | null) {
  if (clienteAnno === "Nuovo") return <span className="badge blue"><span className="dot" />Nuovo</span>;
  if (clienteAnno === "Dismesso") return <span className="badge red"><span className="dot" />Dismesso</span>;
  if (clienteAnno) return <span className="badge green"><span className="dot" />P.P.</span>;
  return <span className="badge neutral"><span className="dot" />—</span>;
}

// variazione % rispetto allo stesso periodo dell'anno prima, in piccolo sotto il valore
function DeltaAnno({ cur, prev }: { cur: number; prev: number }) {
  if (prev < 0.005) {
    return <span className="delta-anno neutro">{cur >= 0.005 ? "nuovo" : "—"}</span>;
  }
  const dp = ((cur - prev) / prev) * 100;
  const cls = dp >= 0 ? "pos" : "neg";
  return (
    <span className={`delta-anno ${cls}`} title={`Stesso periodo ${ANNO_CORRENTE - 1}: ${euro(prev)}`}>
      {dp >= 0 ? "+" : ""}{dp.toFixed(1).replace(".", ",")}%
    </span>
  );
}

export default async function PartnerList({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string; citta?: string; categoria?: string; stato?: string;
    credito?: string; sort?: string; dir?: string;
    attivita?: string; dal?: string; al?: string;
    importFatto?: string; importErrore?: string;
  }>;
}) {
  const sp = await searchParams;
  const [tutti, prec, schede] = await Promise.all([
    riepilogoTutti(ANNO_CORRENTE),
    riepilogoTutti(ANNO_CORRENTE - 1),
    schedeTutti(),
  ]);
  const vuota = schedaVuota();
  const credito = (id: string) => schede.get(id) ?? vuota;

  // ————— Filtri "attività" e "periodo" —————
  // attivita: "" tutte · "vendor" solo vendite come vendor · "servizi" tutti i
  // servizi a fatturazione · "tip:<id>" una singola tipologia (es. Consegne).
  // Stato: senza parametro l'elenco parte dai partner ATTIVI, cioè con almeno
  // una fattura di competenza dell'anno in corso. "tutti" toglie il filtro.
  const stato = sp.stato ?? "attivi-fatture";
  const attivita = sp.attivita ?? "";
  const tipologiaId = attivita.startsWith("tip:") ? attivita.slice(4) : null;
  const soloVendor = attivita === "vendor";
  const soloServizi = attivita === "servizi" || Boolean(tipologiaId);
  // elenco tipologie realmente presenti sulle fatture dell'anno
  const tipologie = [
    ...new Map(
      tutti.flatMap((t) => t.fatture.map((f) => [f.tipologiaId, f.tipologia?.nome ?? "—"] as const))
    ),
  ].sort((a, b) => a[1].localeCompare(b[1], "it"));

  const nMese = (v: string | undefined, def: number) => {
    const n = v ? parseInt(v) : NaN;
    return Number.isFinite(n) && n >= 1 && n <= 12 ? n : def;
  };
  const dal = nMese(sp.dal, 1);
  const al = Math.max(dal, nMese(sp.al, 12));
  const periodoRidotto = dal !== 1 || al !== 12;
  const filtroAttivo = Boolean(attivita) || periodoRidotto;
  const inPeriodo = (mese: number) => mese >= dal && mese <= al;

  // Valori mostrati in tabella: se non ci sono filtri restano i rolling YTD già
  // calcolati; con un filtro si ricalcolano su mesi/attività selezionati.
  type Riga = (typeof tutti)[number];
  const vistaDi = (t: Riga) => {
    if (!filtroAttivo) {
      return { vendite: t.rolling.vendite, servizi: t.rolling.fatture, residuo: t.rolling.residuo };
    }
    const vendite = soloServizi
      ? 0
      : t.vendite.filter((v) => inPeriodo(v.mese)).reduce((a, v) => a + v.incassoLordo, 0);
    const servizi = soloVendor
      ? 0
      : t.fatture
          .filter((f) => inPeriodo(f.mese) && (!tipologiaId || f.tipologiaId === tipologiaId))
          .reduce((a, f) => a + f.imponibile, 0);
    // il residuo resta un dato di cassa del mese: si somma sui mesi del periodo
    const residuo = t.mesi.filter((m) => inPeriodo(m.mese)).reduce((a, m) => a + m.riepilogo.residuo, 0);
    return { vendite, servizi, residuo };
  };
  const viste = new Map(tutti.map((t) => [t.partner.id, vistaDi(t)]));
  const vista = (id: string) => viste.get(id) ?? { vendite: 0, servizi: 0, residuo: 0 };

  // confronto a parità di periodo: fino all'ultimo mese con movimenti nel 2026
  const meseMax = Math.max(
    1,
    ...tutti.flatMap((t) =>
      t.mesi.filter((m) => m.riepilogo.vendite || m.riepilogo.serviziNetto).map((m) => m.mese)
    )
  );
  // Confronto anno su anno sullo STESSO perimetro: quando ci sono filtri usa gli
  // stessi mesi e la stessa attività, altrimenti il periodo YTD.
  const precPeriodo = new Map(
    prec.map((t) => {
      if (!filtroAttivo) {
        return [
          t.partner.id,
          {
            vendite: t.mesi.slice(0, meseMax).reduce((a, m) => a + m.riepilogo.vendite, 0),
            servizi: t.mesi.slice(0, meseMax).reduce((a, m) => a + m.riepilogo.serviziNetto, 0),
          },
        ] as const;
      }
      return [
        t.partner.id,
        {
          vendite: soloServizi
            ? 0
            : t.vendite.filter((v) => inPeriodo(v.mese)).reduce((a, v) => a + v.incassoLordo, 0),
          servizi: soloVendor
            ? 0
            : t.fatture
                .filter((f) => inPeriodo(f.mese) && (!tipologiaId || f.tipologiaId === tipologiaId))
                .reduce((a, f) => a + f.imponibile, 0),
        },
      ] as const;
    })
  );

  const citta = [...new Set(tutti.map((t) => t.partner.citta).filter(Boolean))].sort() as string[];
  const categorie = [...new Set(tutti.map((t) => t.partner.categoria?.trim()).filter(Boolean))].sort() as string[];

  // Tutti i filtri TRANNE lo stato: sono la base su cui si contano i partner che
  // lo stato di default sta nascondendo (numero esatto su ciò che si vede, non
  // sull'intero database).
  const passaAltriFiltri = (t: Riga) => {
    const p = t.partner;
    if (sp.q && !p.nome.toLowerCase().includes(sp.q.toLowerCase())) return false;
    if (sp.citta && p.citta !== sp.citta) return false;
    if (sp.categoria && p.categoria?.trim() !== sp.categoria) return false;
    if (sp.credito === "arischio" && GRAVITA[credito(p.id).stato] < GRAVITA.ritardo) return false;
    if (sp.credito && sp.credito !== "arischio" && credito(p.id).stato !== sp.credito) return false;
    // con un filtro attività/periodo mostra solo chi ha davvero movimenti dentro
    // il perimetro scelto (altrimenti l'elenco sarebbe pieno di righe a zero)
    if (filtroAttivo) {
      const v = vista(p.id);
      if (Math.abs(v.vendite) < 0.005 && Math.abs(v.servizi) < 0.005) return false;
    }
    return true;
  };
  // «Almeno una fattura nell'anno» sono DUE cose: le fatture di servizi
  // (FatturaServizio) e le fatture di COMMISSIONI emesse sui saldi mensili dei
  // vendor (SaldoMensile.commFattEmessa). Contare solo le prime nascondeva 24
  // partner che una fattura ce l'hanno eccome — MARYFLOR ne ha sette nel 2026.
  const haFattura = (t: Riga) => t.fatture.length > 0 || t.saldiRecords.some((s) => s.commFattEmessa);
  const passaStato = (t: Riga) => {
    switch (stato) {
      // default: chi ha almeno una fattura di competenza dell'anno in corso
      case "attivi-fatture": return haFattura(t);
      case "attivi-movimenti": return haFattura(t) || t.vendite.length > 0;
      case "attivi": return t.partner.clienteAnno !== "Dismesso";
      case "dismessi": return t.partner.clienteAnno === "Dismesso";
      default: return true;
    }
  };
  const base = tutti.filter(passaAltriFiltri);
  let filtered = base.filter(passaStato);
  // quanti restano fuori per il solo stato, e quanti di quelli hanno comunque
  // lavorato nell'anno (vendite come vendor, senza fattura di servizio)
  const nascostiDalloStato = base.length - filtered.length;
  const nascostiConVendite = base.filter((t) => !passaStato(t) && t.vendite.length > 0).length;
  const ETICHETTA_STATO: Record<string, string> = {
    "attivi-fatture": `con almeno una fattura ${ANNO_CORRENTE} (servizi o commissioni)`,
    "attivi-movimenti": `con una fattura o una vendita ${ANNO_CORRENTE}`,
    attivi: "non dismessi",
    dismessi: "dismessi",
  };
  // stesso link, cambiato solo lo stato: gli altri filtri non si perdono
  const linkStato = (v: string) => {
    const qs = new URLSearchParams();
    for (const [k, val] of Object.entries(sp)) {
      if (val && k !== "stato" && k !== "importFatto" && k !== "importErrore") qs.set(k, val);
    }
    qs.set("stato", v);
    return `/partner?${qs.toString()}`;
  };

  // Le scorciatoie di periodo (Libro v1.9 §8-bis): qui il periodo vive GIÀ nei
  // select «Da/A mese» — le chips scrivono gli stessi dal/al (una fonte sola,
  // niente secondo parametro da tenere allineato). Si applicano alla competenza
  // mensile di vendite e fatture dell'anno in corso; la pagina è annuale, quindi
  // «Anno» coincide con l'azzeramento (tutto l'anno) e a inizio anno i mesi che
  // scavallerebbero si stringono al perimetro dell'anno.
  const linkPeriodo = (d?: number, a?: number) => {
    const qs = new URLSearchParams();
    for (const [k, val] of Object.entries(sp)) {
      if (val && !["dal", "al", "importFatto", "importErrore"].includes(k)) qs.set(k, val);
    }
    if (d) qs.set("dal", String(d));
    if (a) qs.set("al", String(a));
    const s = qs.toString();
    return s ? `/partner?${s}` : "/partner";
  };
  const mOggi = new Date().getMonth() + 1;
  const chipsPeriodo = [
    { l: "Mese in corso", d: mOggi, a: mOggi },
    { l: "Mese scorso", d: Math.max(1, mOggi - 1), a: Math.max(1, mOggi - 1) },
    { l: "Trimestre", d: Math.max(1, mOggi - 2), a: mOggi },
  ];

  type T = (typeof tutti)[number];
  const campi: Record<string, (t: T) => string | number | null> = {
    nome: (t) => t.partner.nome,
    categoria: (t) => t.partner.categoria,
    citta: (t) => t.partner.citta,
    servizi: (t) => t.partner.servizi,
    stato: (t) => t.partner.clienteAnno,
    credito: (t) => GRAVITA[credito(t.partner.id).stato],
    scaduto: (t) => credito(t.partner.id).scaduto,
    fee: (t) => t.partner.feePercent,
    vendite: (t) => vista(t.partner.id).vendite,
    servizio: (t) => vista(t.partner.id).servizi,
    residuo: (t) => vista(t.partner.id).residuo,
  };
  if (sp.sort && campi[sp.sort]) filtered = ordina(filtered, campi[sp.sort], sp.dir);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Partner</h1>
          <p className="page-caption">
            Il database partner {ANNO_CORRENTE}: anagrafica, condizioni e rolling annuale.
          </p>
        </div>
        <div className="page-actions">
          <Link href="/partner/nuovo" className="btn primary">+ Nuovo partner</Link>
        </div>
      </div>

      {sp.importFatto && (
        <div className="card" style={{ padding: 14, marginBottom: 16 }}>
          <span className="badge green"><span className="dot" />Da Anagrafiche: {sp.importFatto}</span>
        </div>
      )}
      {sp.importErrore && (
        <div className="card" style={{ padding: 14, marginBottom: 16, borderColor: "rgba(215,0,21,0.15)", background: "rgba(215,0,21,0.06)" }}>
          <span style={{ color: "var(--red)", fontSize: 14 }}>{sp.importErrore}</span>
        </div>
      )}
      {/* Interroga il registro: sta in Suspense perché l'elenco dei partner non
          deve aspettare una chiamata di rete per comparire. */}
      <Suspense fallback={null}>
        <AttiviDaRegistro />
      </Suspense>

      <div className="card" style={{ marginBottom: 16, padding: 16 }}>
        {/* Chips fuori dal form: il submit riscrive dal/al dai select e le
            «spegne» da solo. In gennaio «Mese in corso» e «Trimestre»
            coincidono: caso limite accettato. */}
        <div className="filters riga-chips-scorri" style={{ marginBottom: 10 }}>
          {chipsPeriodo.map((c) => (
            <Link
              key={c.l}
              href={linkPeriodo(c.d, c.a)}
              className={`chip-link${dal === c.d && al === c.a ? " attiva" : ""}`}
            >
              {c.l}
            </Link>
          ))}
          <Link href={linkPeriodo()} className={`chip-link${periodoRidotto ? " azzera" : " attiva"}`}>
            Anno
          </Link>
        </div>
        <form className="filters" method="get">
          <input type="text" name="q" placeholder="Cerca partner…" defaultValue={sp.q ?? ""} />
          {/* I select vivono dietro «Filtri (N)» sotto la soglia mobile (Libro
              v1.2 §8): N conta solo i filtri fuori dal loro default. */}
          <ZonaFiltri
            attivi={
              [sp.citta, sp.categoria, sp.credito].filter(Boolean).length +
              (stato !== "attivi-fatture" ? 1 : 0) +
              (attivita ? 1 : 0) +
              (periodoRidotto ? 1 : 0)
            }
          >
          <select name="citta" defaultValue={sp.citta ?? ""}>
            <option value="">Tutte le città</option>
            {citta.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select name="categoria" defaultValue={sp.categoria ?? ""}>
            <option value="">Tutte le categorie</option>
            {categorie.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select name="stato" defaultValue={stato} aria-label="Stato del partner">
            <option value="attivi-fatture">Attivi · con fattura {ANNO_CORRENTE}</option>{/* servizi o commissioni */}
            <option value="attivi-movimenti">Attivi · fattura o vendita {ANNO_CORRENTE}</option>
            <option value="attivi">Non dismessi</option>
            <option value="dismessi">Dismessi</option>
            <option value="tutti">Tutti i partner</option>
          </select>
          <select name="credito" defaultValue={sp.credito ?? ""} aria-label="Stato finanziario">
            <option value="">Credito: tutti</option>
            <option value="arischio">Solo a rischio (ritardo e oltre)</option>
            <option value="regolare">Regolari</option>
            <option value="monitorare">Da monitorare</option>
            <option value="ritardo">In ritardo</option>
            <option value="grave">Scaduto grave</option>
            <option value="insoluto">Insoluti</option>
            <option value="nessuna">Senza esposizione</option>
          </select>
          <select name="attivita" defaultValue={attivita} aria-label="Tipo di attività">
            <option value="">Attività: tutte</option>
            <option value="vendor">Solo vendite come vendor</option>
            <option value="servizi">Solo servizi a fatturazione</option>
            {tipologie.map(([id, nome]) => (
              <option key={id} value={`tip:${id}`}>Servizi · {nome}</option>
            ))}
          </select>
          <select name="dal" defaultValue={String(dal)} aria-label="Dal mese">
            {MESI.map((m, i) => <option key={m} value={i + 1}>Da {m}</option>)}
          </select>
          <select name="al" defaultValue={String(al)} aria-label="Al mese">
            {MESI.map((m, i) => <option key={m} value={i + 1}>A {m}</option>)}
          </select>
          </ZonaFiltri>
          <button className="btn secondary small" type="submit">Filtra</button>
          {filtroAttivo && <Link href="/partner" className="btn secondary small">Azzera</Link>}
        </form>
        {stato !== "tutti" && nascostiDalloStato > 0 && (
          <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
            In elenco i <strong>{filtered.length}</strong> partner {ETICHETTA_STATO[stato]}.{" "}
            Nascosti <strong>{nascostiDalloStato}</strong>
            {stato === "attivi-fatture" && nascostiConVendite > 0 && (
              <>, di cui <strong>{nascostiConVendite}</strong> con vendite come vendor nel{" "}
              {ANNO_CORRENTE} ma nessuna fattura, né di servizi né di commissioni</>
            )}
            .{" "}
            {stato === "attivi-fatture" && nascostiConVendite > 0 && (
              <><Link href={linkStato("attivi-movimenti")}>Conta anche le vendite</Link> · </>
            )}
            <Link href={linkStato("tutti")}>Mostra tutti i partner</Link>
          </p>
        )}
        {filtroAttivo && (
          <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
            Valori di <strong>{nomeMese(dal)}–{nomeMese(al)} {ANNO_CORRENTE}</strong>
            {soloVendor && <> · solo <strong>vendite come vendor</strong></>}
            {tipologiaId && <> · solo servizi <strong>{tipologie.find(([id]) => id === tipologiaId)?.[1]}</strong></>}
            {attivita === "servizi" && <> · solo <strong>servizi a fatturazione</strong></>}
            {" "}· in elenco i {filtered.length} partner con movimenti nel perimetro. Il confronto % è sullo
            stesso periodo {ANNO_CORRENTE - 1} <strong>per questi partner</strong>: chi lavorava nel{" "}
            {ANNO_CORRENTE - 1} ma non nel periodo scelto non entra nel totale.
          </p>
        )}
      </div>

      <div className="card tight">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <ThSort label="Partner" campo="nome" sp={sp} path="/partner" />
                <ThSort label="Categoria" campo="categoria" sp={sp} path="/partner" />
                <ThSort label="Città" campo="citta" sp={sp} path="/partner" />
                <ThSort label="Servizio" campo="servizi" sp={sp} path="/partner" />
                <ThSort label="Stato" campo="stato" sp={sp} path="/partner" />
                <ThSort label="Credito" campo="credito" sp={sp} path="/partner" />
                <ThSort label="Scaduto" campo="scaduto" sp={sp} path="/partner" num />
                <ThSort label="Fee" campo="fee" sp={sp} path="/partner" num />
                <ThSort label={filtroAttivo ? "Vendite periodo" : "Vendite YTD"} campo="vendite" sp={sp} path="/partner" num />
                <ThSort label={filtroAttivo ? "Servizi periodo" : "Servizi YTD"} campo="servizio" sp={sp} path="/partner" num />
                <ThSort label="Residuo" campo="residuo" sp={sp} path="/partner" num />
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                // «La riga si apre col click» (Libro UX&UI v1.6 §8): tutta la
                // riga porta alla scheda, non solo il nome in blu.
                <RigaLink key={t.partner.id} href={`/partner/${t.partner.id}`} className="riga-link">
                  <td><Link href={`/partner/${t.partner.id}`} style={{ fontWeight: 500 }}>{t.partner.nome}</Link></td>
                  <td>{t.partner.categoria ?? "—"}</td>
                  <td>{t.partner.citta ?? "—"}</td>
                  <td className="muted">{t.partner.servizi ?? "—"}</td>
                  <td>{badgeStato(t.partner.clienteAnno)}</td>
                  <td><BadgeCredito s={credito(t.partner.id)} /></td>
                  <td className={`num ${credito(t.partner.id).scaduto >= 0.01 ? "neg" : ""}`}>
                    {credito(t.partner.id).scaduto >= 0.01 ? euro(credito(t.partner.id).scaduto) : "—"}
                  </td>
                  <td className="num">{pctIt(t.partner.feePercent)}</td>
                  <td className="num">
                    {euro(vista(t.partner.id).vendite)}
                    <DeltaAnno cur={vista(t.partner.id).vendite} prev={precPeriodo.get(t.partner.id)?.vendite ?? 0} />
                  </td>
                  <td className="num">
                    {euro(vista(t.partner.id).servizi)}
                    <DeltaAnno cur={vista(t.partner.id).servizi} prev={precPeriodo.get(t.partner.id)?.servizi ?? 0} />
                  </td>
                  <td className={`num ${Math.abs(vista(t.partner.id).residuo) < 0.01 ? "" : vista(t.partner.id).residuo > 0 ? "pos" : "neg"}`}>
                    {euro(vista(t.partner.id).residuo)}
                  </td>
                </RigaLink>
              ))}
              {(() => {
                const somma = (fn: (t: T) => number) => filtered.reduce((a, t) => a + fn(t), 0);
                const totVendite = somma((t) => vista(t.partner.id).vendite);
                const totServizi = somma((t) => vista(t.partner.id).servizi);
                const totResiduo = somma((t) => vista(t.partner.id).residuo);
                const totVenditePrec = somma((t) => precPeriodo.get(t.partner.id)?.vendite ?? 0);
                const totServiziPrec = somma((t) => precPeriodo.get(t.partner.id)?.servizi ?? 0);
                return (
                  <tr style={{ background: "var(--bg)", fontWeight: 600 }}>
                    <td>Totale ({filtered.length} partner)</td>
                    <td colSpan={5}></td>
                    <td className="num neg">
                      {euro(somma((t) => credito(t.partner.id).scaduto))}
                    </td>
                    <td></td>
                    <td className="num">
                      {euro(totVendite)}
                      <DeltaAnno cur={totVendite} prev={totVenditePrec} />
                    </td>
                    <td className="num">
                      {euro(totServizi)}
                      <DeltaAnno cur={totServizi} prev={totServiziPrec} />
                    </td>
                    <td className={`num ${Math.abs(totResiduo) < 0.01 ? "" : totResiduo > 0 ? "pos" : "neg"}`}>
                      {euro(totResiduo)}
                    </td>
                  </tr>
                );
              })()}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
