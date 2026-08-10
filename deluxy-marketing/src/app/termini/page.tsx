import { redirect } from "next/navigation";
import { Badge } from "@/components/Badge";
import { PortaKeyword } from "@/components/PortaKeyword";
import { PortaSelezionate } from "@/components/PortaSelezionate";
import { Sidebar } from "@/components/Sidebar";
import { VisteSalvate } from "@/components/VisteSalvate";
import { campagnePerDialogo } from "@/lib/campagne-dialogo";
import { destinazionePredefinita } from "@/lib/viste";
import { applicaKeywordAdAltreCampagne, escludiTerminiSelezionati, giudicaTermine } from "@/lib/azioni";
import { prisma } from "@/lib/db";
import {
  BRANDS,
  COLORE_BRAND,
  ETICHETTA_BRAND,
  formattaEuro,
  formattaNumero,
  roas,
} from "@/lib/dominio";
import { breakEvenRoas } from "@/lib/guardrail";

export const dynamic = "force-dynamic";

// LE PAROLE CHE LA GENTE HA CERCATO DAVVERO — e per cui siamo comparsi.
//
// Non è la stessa cosa delle keyword: le keyword sono quello che ABBIAMO
// COMPRATO, questi sono i modi in cui le persone lo hanno chiesto. La distanza
// fra le due liste è dove si nascondono i soldi: una ricerca che non c'entra
// niente col nostro mestiere continua a costare finché qualcuno non la guarda.
//
// Il taglio della pagina è quello: prima quelle che spendono, e in cima a tutte
// quelle che spendono SENZA vendere.

const STATI: { chiave: string; nome: string; colore: string }[] = [
  { chiave: "nuovo", nome: "Da guardare", colore: "var(--text-secondary)" },
  { chiave: "pertinente", nome: "Pertinente", colore: "var(--green)" },
  { chiave: "da_escludere", nome: "Da escludere", colore: "var(--red)" },
  { chiave: "escluso", nome: "Escluso", colore: "var(--text-tertiary)" },
];

export default async function PaginaTermini({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string; stato?: string; ordina?: string; cerca?: string; solo?: string; vista?: string; bloccata?: string }>;
}) {
  const p = await searchParams;
  const destinazione = await destinazionePredefinita("termini", "/termini", p);
  if (destinazione) redirect(destinazione);
  const ordina = p.ordina ?? "spesa";

  const dove = {
    ...(p.brand ? { campagna: { brand: p.brand } } : {}),
    ...(p.stato ? { stato: p.stato } : {}),
    ...(p.cerca ? { testo: { contains: p.cerca, mode: "insensitive" as const } } : {}),
    // "Solo quelle che bruciano": spesa senza nemmeno una conversione.
    ...(p.solo === "vuote" ? { spesa: { gt: 0 }, conversioni: { equals: 0 } } : {}),
    ...(p.solo === "comparsi" ? { impressioni: { gt: 0 } } : {}),
  };

  const ordinamento =
    ordina === "impressioni" ? { impressioni: "desc" as const }
    : ordina === "clic" ? { clic: "desc" as const }
    : ordina === "ricavi" ? { ricavi: "desc" as const }
    : { spesa: "desc" as const };

  const [termini, totali, senzaVendite, perBrand] = await Promise.all([
    prisma.termineRicerca.findMany({
      where: dove,
      orderBy: [ordinamento, { testo: "asc" }],
      take: 300,
      include: { campagna: { select: { nome: true, brand: true, id: true } } },
    }),
    prisma.termineRicerca.aggregate({
      where: dove,
      _sum: { spesa: true, clic: true, impressioni: true, conversioni: true, ricavi: true },
      _count: { _all: true },
    }),
    prisma.termineRicerca.aggregate({
      where: { ...dove, spesa: { gt: 0 }, conversioni: { equals: 0 } },
      _sum: { spesa: true },
      _count: { _all: true },
    }),
    prisma.termineRicerca.groupBy({ by: ["campagnaId"], _count: { _all: true } }),
  ]);

  const link = (cambia: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const nuovo = { brand: p.brand, stato: p.stato, ordina: p.ordina, cerca: p.cerca, solo: p.solo, ...cambia };
    for (const [k, v] of Object.entries(nuovo)) if (v) q.set(k, v);
    return `/termini?${q.toString()}`;
  };

  // Le campagne per il dialogo «Porta altrove»: DOPO il Promise.all qui sopra,
  // non dentro — il Postgres condiviso ha connection_limit=5 e quattro query
  // parallele più queste due lo saturerebbero.
  const campagneDialogo = termini.length > 0 ? await campagnePerDialogo() : [];

  const spesaTot = totali._sum.spesa ?? 0;
  const ricaviTot = totali._sum.ricavi ?? 0;
  const resaTot = roas(ricaviTot, spesaTot);
  const impressioniTot = totali._sum.impressioni ?? 0;
  const clicTot = totali._sum.clic ?? 0;

  return (
    <div className="layout">
      <Sidebar attiva="termini" />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Parole cercate</h1>
            <p className="page-sub">
              Quello che le persone hanno <b>digitato davvero</b> e per cui siamo comparsi. Non è la
              lista delle keyword: quelle sono ciò che abbiamo comprato, queste sono i modi in cui ce
              lo hanno chiesto. La distanza fra le due è dove si nascondono i soldi.
            </p>
          </div>
        </div>

        <div className="kpi-riga">
          <div className="kpi">
            <div className="kpi-valore">{formattaNumero(totali._count._all)}</div>
            <div className="kpi-etichetta">Parole in elenco</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{formattaNumero(impressioniTot)}</div>
            <div className="kpi-etichetta">Volte che siamo comparsi</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{formattaEuro(spesaTot)}</div>
            <div className="kpi-etichetta">
              Spesa · resa {resaTot != null ? `${resaTot.toFixed(2)}×` : "—"}
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-valore" style={{ color: (senzaVendite._sum.spesa ?? 0) > 0 ? "var(--red)" : undefined }}>
              {formattaEuro(senzaVendite._sum.spesa)}
            </div>
            <div className="kpi-etichetta">
              Speso senza una vendita ({senzaVendite._count._all} parole)
            </div>
          </div>
        </div>

        <VisteSalvate pagina="termini" base="/termini" parametri={p} />

        <section className="scheda" style={{ paddingBottom: 14 }}>
          <div className="pill-scelta" style={{ marginBottom: 10 }}>
            <a className={`pill-opt${!p.solo ? " attuale" : ""}`} href={link({ solo: undefined })}>Tutte</a>
            <a className={`pill-opt${p.solo === "comparsi" ? " attuale" : ""}`} href={link({ solo: "comparsi" })}>
              Dove siamo comparsi
            </a>
            <a className={`pill-opt${p.solo === "vuote" ? " attuale" : ""}`} href={link({ solo: "vuote" })}>
              Spendono senza vendere
            </a>
          </div>
          <div className="pill-scelta" style={{ marginBottom: 10 }}>
            <a className={`pill-opt${!p.brand ? " attuale" : ""}`} href={link({ brand: undefined })}>Tutti i brand</a>
            {BRANDS.filter((b) => b !== "cross").map((b) => (
              <a key={b} className={`pill-opt${p.brand === b ? " attuale" : ""}`} href={link({ brand: b })}>
                <span className="dot" style={{ background: COLORE_BRAND[b] }} />
                {ETICHETTA_BRAND[b]}
              </a>
            ))}
          </div>
          <form className="filtri" method="get" action="/termini" style={{ marginBottom: 0 }}>
            {p.brand && <input type="hidden" name="brand" value={p.brand} />}
            {p.solo && <input type="hidden" name="solo" value={p.solo} />}
            <input name="cerca" defaultValue={p.cerca ?? ""} placeholder="cerca nel testo…" style={{ minWidth: 220 }} />
            <select name="stato" defaultValue={p.stato ?? ""}>
              <option value="">Ogni giudizio</option>
              {STATI.map((s) => (
                <option key={s.chiave} value={s.chiave}>{s.nome}</option>
              ))}
            </select>
            <select name="ordina" defaultValue={ordina}>
              <option value="spesa">Ordina per spesa</option>
              <option value="impressioni">Ordina per comparse</option>
              <option value="clic">Ordina per clic</option>
              <option value="ricavi">Ordina per incasso</option>
            </select>
            <button className="btn small" type="submit">Filtra</button>
          </form>
        </section>

        {p.bloccata && (
          <div className="avviso-errore">
            <strong>{p.bloccata}</strong>
          </div>
        )}

        {/* Le due azioni di massa: spunta più parole e agisci su tutte insieme.
            Il form vive FUORI dalla tabella e le caselle lo raggiungono con
            `form=`: dentro le celle ci sono già i moduli del giudizio, e i
            form non si annidano. ⚠️ Qui le righe sono di campagne DIVERSE: le
            caselle portano l'ID del termine, e ogni parola diventa una
            negativa sulla campagna in cui è stata cercata. */}
        {termini.length > 0 && (
          <form id="scelte-termini" action={escludiTerminiSelezionati} className="barra-multipla">
            <input type="hidden" name="ritorno" value={link({})} />
            <span className="cella-sub">Spunta più parole e agisci su tutte insieme:</span>
            {/* ⚠️ Esatta di default: si esclude QUELLA ricerca, non tutto ciò
                che le somiglia. La generica può spegnere una campagna. */}
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}>
              come
              <select name="corrispondenza" defaultValue="exact" style={{ font: "inherit", padding: "4px 8px", borderRadius: 8, border: "1px solid var(--hairline-strong)" }}>
                <option value="exact">esatta — solo questa ricerca</option>
                <option value="phrase">a frase — questa sequenza di parole</option>
                <option value="broad">generica — ogni ricerca con queste parole</option>
              </select>
            </label>
            <button className="btn small btn-secondario" type="submit">
              Escludi le selezionate
            </button>
            <PortaSelezionate lingue={[]} />
          </form>
        )}

        {termini.length === 0 ? (
          <div className="vuoto">
            Nessuna parola cercata con questi filtri.
            {perBrand.length === 0 && (
              <>
                {" "}
                In archivio non ce n&apos;è ancora nessuna: arrivano col giro quotidiano dello script
                di Google Ads (o con <b>AZIONE = &quot;diagnosi&quot;</b>). Le Performance Max non le
                espongono: per quelle campagne l&apos;elenco resterà vuoto anche a script funzionante.
              </>
            )}
          </div>
        ) : (
          <section className="scheda" style={{ padding: 0 }}>
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th></th>
                    <th>Ha cercato</th>
                    <th>Presa dalla keyword</th>
                    <th>Campagna</th>
                    <th className="num" title="Quante volte siamo comparsi">Comparse</th>
                    <th className="num">Clic</th>
                    <th className="num" title="Clic ÷ comparse">CTR</th>
                    <th className="num">Spesa</th>
                    <th className="num" title="Costo per clic">CPC</th>
                    <th className="num">Conv.</th>
                    <th className="num" title="Costo per conversione">CPA</th>
                    <th className="num">Incasso</th>
                    <th className="num" title="Incasso ÷ spesa">Resa</th>
                    <th>Giudizio</th>
                  </tr>
                </thead>
                <tbody>
                  {termini.map((t) => {
                    const spesa = t.spesa ?? 0;
                    const conv = t.conversioni ?? 0;
                    const r = roas(t.ricavi ?? 0, spesa);
                    const be = breakEvenRoas(t.campagna.brand);
                    const ctr = (t.impressioni ?? 0) > 0 ? (t.clic ?? 0) / (t.impressioni ?? 1) : null;
                    const cpc = (t.clic ?? 0) > 0 ? spesa / (t.clic ?? 1) : null;
                    const cpa = conv > 0 ? spesa / conv : null;
                    // Brucia: ha speso qualcosa e non ha portato niente.
                    const brucia = spesa > 0 && conv === 0;
                    return (
                      <tr key={t.id} style={brucia ? { background: "rgba(200,40,40,.04)" } : undefined}>
                        {/* value = ID del termine (l'esclusione deve sapere la
                            campagna di ognuna), data-testo = la parola (la
                            legge «Porta altrove le selezionate»). */}
                        <td>
                          <input
                            type="checkbox"
                            form="scelte-termini"
                            name="scelte"
                            value={t.id}
                            data-testo={t.testo}
                            aria-label={`Seleziona «${t.testo}»`}
                          />
                        </td>
                        <td>
                          <div className="cella-nome">{t.testo}</div>
                          {t.gruppo && <div className="cella-sub">{t.gruppo}</div>}
                        </td>
                        <td className="cella-muta">
                          {t.keyword ?? "—"}
                          {t.corrispondenza && <div className="cella-sub">{t.corrispondenza}</div>}
                        </td>
                        <td className="cella-muta">
                          <a href={`/campagne/${t.campagna.id}`}>{t.campagna.nome}</a>
                        </td>
                        <td className="num">{formattaNumero(t.impressioni)}</td>
                        <td className="num">{formattaNumero(t.clic)}</td>
                        <td className="num cella-muta">{ctr != null ? `${(ctr * 100).toFixed(1)}%` : "—"}</td>
                        <td className="num" style={brucia ? { color: "var(--red)", fontWeight: 600 } : undefined}>
                          {formattaEuro(spesa)}
                        </td>
                        <td className="num cella-muta">{cpc != null ? formattaEuro(cpc) : "—"}</td>
                        <td className="num">{conv > 0 ? conv.toFixed(1) : "—"}</td>
                        <td className="num cella-muta">{cpa != null ? formattaEuro(cpa) : "—"}</td>
                        <td className="num">{formattaEuro(t.ricavi)}</td>
                        <td
                          className="num"
                          style={{ color: r == null ? "var(--text-tertiary)" : r >= be ? "var(--green)" : "var(--red)" }}
                          title={`Break-even di ${t.campagna.brand}: ${be.toFixed(2)}×`}
                        >
                          {r != null ? `${r.toFixed(2)}×` : "—"}
                        </td>
                        <td>
                          <form className="pill-scelta" style={{ gap: 4 }}>
                            <input type="hidden" name="id" value={t.id} />
                            {STATI.filter((s) => s.chiave !== "nuovo").map((s) => (
                              <button
                                key={s.chiave}
                                type="submit"
                                className={`pill-opt${t.stato === s.chiave ? " attuale" : ""}`}
                                style={{ color: t.stato === s.chiave ? undefined : s.colore }}
                                formAction={giudicaTermine.bind(null, s.chiave)}
                                title={`Segna come ${s.nome.toLowerCase()}`}
                              >
                                {s.nome}
                              </button>
                            ))}
                          </form>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <p className="cella-sub" style={{ marginTop: 14, whiteSpace: "normal" }}>
          Le righe in rosso hanno speso <b>senza portare una sola conversione</b>: sono le prime da
          guardare, ma non da escludere a occhi chiusi — una ricerca può essere pertinente e non aver
          ancora convertito perché ha avuto pochi clic. Con due o tre clic non si decide niente:
          quello è rumore, non un verdetto.
          <br />
          Il giudizio che dai qui resta salvato e non viene sovrascritto dai giri successivi dello
          script. <b>Segnare «da escludere» non esclude niente su Google</b>: serve a ricordare cosa
          hai deciso. Per escludere davvero, spunta le caselle e premi <b>«Escludi le
          selezionate»</b>: ogni parola va in coda come negativa <b>sulla campagna in cui è stata
          cercata</b>, da approvare in Operazioni.
          <br />
          Le <b>Performance Max non espongono i termini di ricerca</b>: per quelle campagne questo
          elenco resta vuoto anche a script perfettamente funzionante. Non è un dato mancante, è un
          dato che Google non dà.
        </p>

        {/* Uno solo per tutta la pagina, come su Keywords: l'elenco delle
            campagne è lo stesso per ogni parola, e le caselle gli passano i
            testi via «Porta altrove le selezionate». */}
        {termini.length > 0 && (
          <PortaKeyword
            campagne={campagneDialogo}
            ritorno="/termini"
            azione={applicaKeywordAdAltreCampagne}
          />
        )}
      </main>
    </div>
  );
}
