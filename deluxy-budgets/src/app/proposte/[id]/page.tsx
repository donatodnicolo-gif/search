import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { caricaAnno, FONTI, nomeFonte, venditeApplicate } from "@/lib/calc";
import { eur, MESI } from "@/lib/format";
import { DecisioneProposta } from "@/components/DecisioneProposta";
import { chiGuarda } from "@/lib/chi-guarda";
import { TornaIndietro } from "@/components/TornaIndietro";

export const dynamic = "force-dynamic";

const BADGE: Record<string, string> = {
  BOZZA: "neutral",
  INVIATA: "blue",
  APPROVATA: "green",
  RESPINTA: "red",
};

export default async function DettaglioProposta({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await prisma.propostaBudget.findUnique({ where: { id } });
  if (!p) notFound();

  // ⚠️⚠️ **LA PROPOSTA DI UN ALTRO NON SI APRE** (27/08/2026). Da qui si vedeva
  // il **budget pubblicato** di qualunque maison, mese per mese e fonte per
  // fonte, più la proiezione dell'anno: bastava avere l'id, e gli id si
  // prendevano dalla lista. `notFound()` e non 403 di proposito: a chi non deve
  // vederla non si conferma nemmeno che esista.
  const chi = await chiGuarda();
  if (!chi.admin && (!chi.uid || p.inviataDaUid !== chi.uid)) notFound();

  const [maisons, linee, dati] = await Promise.all([
    prisma.maison.findMany(),
    prisma.lineaCommerciale.findMany(),
    caricaAnno(p.year),
  ]);

  let valori: { month: number; canale?: string; valore: number }[] = [];
  try {
    valori = JSON.parse(p.valori);
  } catch {
    valori = [];
  }
  const totale = valori.reduce((s, v) => s + (v.valore || 0), 0);
  // Le linee di business che la proposta nomina, nell'ordine delle tipologie.
  // Vuoto = proposta scritta con un numero solo per mese (globale, linea
  // commerciale, o una maison proposta prima del 31/07/2026).
  const canaliProposti = dati.tipologie
    .map((t) => t.slug)
    .filter((slug) => valori.some((v) => v.canale === slug));

  const ambito =
    p.ambitoTipo === "GLOBALE"
      ? "Tutta l'azienda"
      : p.ambitoTipo === "MAISON"
        ? maisons.find((m) => m.slug === p.ambitoSlug)?.nome ?? p.ambitoSlug ?? "—"
        : linee.find((l) => l.slug === p.ambitoSlug)?.nome ?? p.ambitoSlug ?? "—";

  // Quanto c'è oggi a budget sullo stesso ambito: chi approva deve vedere da
  // cosa si sta staccando la proposta, non solo il numero proposto.
  const maison = p.ambitoTipo === "MAISON" ? dati.maisons.find((m) => m.slug === p.ambitoSlug) : null;
  const attuale = maison
    ? maison.mesi.reduce((s, m) => s + Object.values(m.vendite).reduce((a, v) => a + v, 0), 0)
    : null;

  // Il budget di oggi voce per voce e mese per mese: serve al pannello per
  // mostrare **cosa si sovrascrive** prima di consolidare. Senza, «Consolida»
  // è un bottone che riscrive il budget pubblicato senza far vedere cosa
  // toglie — ed è così che il 31/07/2026 sono spariti 692.728 € di budget
  // Deluxy.it su gennaio-giugno.
  // Chiave `canale|fonte`: il confronto si fa **sulla stessa fonte**, perché il
  // consolidamento riscrive solo quella. Metterlo accanto al totale del canale
  // — che comprende anche il commerciale e il budget iniziale — mostrerebbe un
  // crollo enorme che non avverrà.
  const budgetAttuale: Record<string, number[]> = {};
  if (maison) {
    for (const t of dati.tipologie) {
      for (const f of FONTI) {
        budgetAttuale[`${t.slug}|${f.key}`] = maison.mesi.map((m) => m.perFonte[t.slug]?.[f.key] ?? 0);
      }
    }
  }

  // ---- Come resterebbe l anno, se questa proposta venisse consolidata ----
  //
  // Il totale proposto da solo non risponde alla domanda di chi approva: una
  // proposta copre **alcuni** mesi, e confrontarla con il budget di dodici fa
  // sembrare un taglio enorme quello che e solo un pezzo d anno. La proiezione
  // mette insieme le due cose: i mesi che la proposta tocca valgono quello che
  // propone, gli altri restano come sono adesso.
  //
  // Si applica la **regola vera del consolidamento** — la proposta riscrive
  // solo la sua fonte, e le proposte sostituiscono il budget iniziale — invece
  // di sommare: sommare direbbe un numero che dopo il consolidamento non si
  // vedrebbe da nessuna parte.
  //
  // Le proposte vecchie (un numero per mese, senza linea) non si proiettano: non
  // dicono su quale voce atterrano, ed e la stessa ragione per cui il
  // consolidamento chiede di sceglierla.
  const proiettabile = Boolean(maison) && canaliProposti.length > 0;
  const proiezione: Record<string, number[]> = {};
  if (maison && proiettabile) {
    for (const tip of dati.tipologie) {
      proiezione[tip.slug] = maison.mesi.map((mese) => {
        const proposto = valori.find((v) => v.month === mese.month && v.canale === tip.slug);
        const perFonte = { ...(mese.perFonte[tip.slug] ?? {}) };
        if (proposto) perFonte[p.fonte] = proposto.valore || 0;
        return venditeApplicate(perFonte);
      });
    }
  }
  const proiezioneMese = (i: number) =>
    dati.tipologie.reduce((s, tip) => s + (proiezione[tip.slug]?.[i] ?? 0), 0);
  const proiezioneAnno = Array.from({ length: 12 }, (_, i) => proiezioneMese(i)).reduce((s, v) => s + v, 0);

  return (
    <>
      <div className="page-head">
        <div>
          <p className="page-caption" style={{ margin: 0 }}>
            {/* «Il ritorno al punto esatto» (Libro UX&UI v1.5 §2). Il bottone
                «Tutte le proposte» nelle azioni resta: qui si torna al punto
                esatto, quello porta comunque all'elenco. */}
            <TornaIndietro fallback="/proposte" label="Tutte le proposte" />
          </p>
          <h1 className="page-title">Proposta di {p.autore}</h1>
          <p className="page-caption">
            {p.ruolo} · {ambito} · budget {p.year} · <strong>{nomeFonte(p.fonte)}</strong> · inviata il{" "}
            {p.createdAt.toLocaleDateString("it-IT")}
          </p>
        </div>
        <div className="page-actions">
          <span className={`badge ${BADGE[p.stato] ?? "neutral"}`}>
            <span className="dot" />
            {p.stato.charAt(0) + p.stato.slice(1).toLowerCase()}
          </span>
          <Link className="btn secondary" href="/proposte">Tutte le proposte</Link>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Totale proposto {p.year}</div>
          <div className="kpi-value">{eur(totale)}</div>
          {/* «18 mesi» erano 6 mesi × 3 linee: contare le righe e chiamarle
              mesi fa dubitare del numero anche quando il numero è giusto. */}
          <div className="kpi-sub">
            {new Set(valori.map((v) => v.month)).size} mesi
            {canaliProposti.length > 0 && ` × ${canaliProposti.length} linee`} · {valori.length} caselle
          </div>
        </div>
        {attuale !== null && (
          <div className="kpi">
            <div className="kpi-label">Oggi a budget su {ambito}</div>
            <div className="kpi-value">{eur(attuale)}</div>
            {/* ⚠️ Il confronto fra il totale proposto e il budget dell anno e
                fra cose diverse: la proposta copre **alcuni** mesi. Dirlo qui,
                accanto alla percentuale, evita di leggere come un taglio del
                40% quello che e solo un pezzo d anno — la risposta vera e nel
                riquadro accanto, la proiezione. */}
            <div className="kpi-sub">
              {attuale > 0
                ? `sull anno intero; la proposta ne copre ${new Set(valori.map((v) => v.month)).size} mesi`
                : "nessun budget attuale"}
            </div>
          </div>
        )}
        {proiettabile && attuale !== null && (
          <div className="kpi">
            <div className="kpi-label">L anno intero, se consolidata</div>
            <div className="kpi-value">{eur(proiezioneAnno)}</div>
            <div className="kpi-sub">
              da {eur(attuale)} a {eur(proiezioneAnno)} ·{" "}
              <strong className={proiezioneAnno >= attuale ? "delta giu" : "delta su"}>
                {proiezioneAnno >= attuale ? "+" : "−"}
                {eur(Math.abs(proiezioneAnno - attuale))}
              </strong>
            </div>
          </div>
        )}
        {p.decisaIl && (
          <div className="kpi">
            <div className="kpi-label">Decisa il</div>
            <div className="kpi-value" style={{ fontSize: 22 }}>{p.decisaIl.toLocaleDateString("it-IT")}</div>
            <div className="kpi-sub">{p.consolidataSu ? `consolidata su ${p.consolidataSu}` : "non ancora consolidata"}</div>
          </div>
        )}
      </div>

      <h2 className="section-title">I mesi proposti</h2>
      <div className="card tight">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {canaliProposti.length > 0 && <th style={{ minWidth: 140 }}>Linea di business</th>}
                {MESI.map((m) => (<th className="num" key={m}>{m}</th>))}
                <th className="num">Totale</th>
              </tr>
            </thead>
            <tbody>
              {/* Una proposta di maison arriva **linea per linea** (dal
                  31/07/2026): mostrarla schiacciata su una riga sola
                  nasconderebbe proprio l'informazione per cui si chiede il
                  dettaglio — su quale linea il responsabile sta puntando. */}
              {canaliProposti.length > 0 ? (
                <>
                  {canaliProposti.map((slug) => {
                    const righe = valori.filter((v) => v.canale === slug);
                    const tot = righe.reduce((s, v) => s + (v.valore || 0), 0);
                    return (
                      <tr key={slug}>
                        <td style={{ fontWeight: 500 }}>
                          {dati.tipologie.find((t) => t.slug === slug)?.nome ?? slug}
                        </td>
                        {MESI.map((_, i) => {
                          const v = righe.find((x) => x.month === i + 1);
                          return (
                            <td className={`num ${v ? "" : "muted"}`} key={i}>
                              {v ? eur(v.valore) : "—"}
                            </td>
                          );
                        })}
                        <td className="num" style={{ fontWeight: 600 }}>{eur(tot)}</td>
                      </tr>
                    );
                  })}
                  <tr className="tot">
                    <td>Totale</td>
                    {MESI.map((_, i) => {
                      const v = valori.filter((x) => x.month === i + 1);
                      return (
                        <td className={`num ${v.length ? "" : "muted"}`} key={i}>
                          {v.length ? eur(v.reduce((s, x) => s + (x.valore || 0), 0)) : "—"}
                        </td>
                      );
                    })}
                    <td className="num">{eur(totale)}</td>
                  </tr>
                </>
              ) : (
                <tr>
                  {MESI.map((_, i) => {
                    const v = valori.find((x) => x.month === i + 1);
                    return (
                      <td className={`num ${v ? "" : "muted"}`} key={i}>{v ? eur(v.valore) : "—"}</td>
                    );
                  })}
                  <td className="num" style={{ fontWeight: 700 }}>{eur(totale)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <p className="page-caption" style={{ marginTop: 12 }}>
        Un mese a <strong>—</strong> non è un mese proposto a zero: è un mese che la proposta{" "}
        <strong>non contiene</strong>, e che il consolidamento quindi non tocca. I mesi già chiusi non si
        propongono, per questo di solito mancano.
      </p>

      {proiettabile && (
        <>
          <h2 className="section-title">L anno intero, se questa proposta venisse consolidata</h2>
          <div className="card tight">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ minWidth: 140 }}>Linea di business</th>
                    {MESI.map((m) => (<th className="num" key={m}>{m}</th>))}
                    <th className="num">Anno</th>
                  </tr>
                </thead>
                <tbody>
                  {dati.tipologie.map((tip) => {
                    const mesi = proiezione[tip.slug] ?? Array(12).fill(0);
                    const tot = mesi.reduce((s, v) => s + v, 0);
                    if (tot === 0) return null;
                    return (
                      <tr key={tip.slug}>
                        <td style={{ fontWeight: 500 }}>{tip.nome}</td>
                        {mesi.map((v, i) => {
                          // I mesi che la proposta tocca si distinguono: sono
                          // quelli che cambierebbero, gli altri restano come sono.
                          const tocco = valori.some((x) => x.month === i + 1 && x.canale === tip.slug);
                          return (
                            <td
                              className={`num ${v === 0 ? "muted" : ""}`}
                              key={i}
                              style={tocco ? { color: "var(--blue)", fontWeight: 600 } : undefined}
                              title={tocco ? "Mese scritto da questa proposta" : "Resta il budget di oggi"}
                            >
                              {v === 0 ? "—" : eur(v)}
                            </td>
                          );
                        })}
                        <td className="num" style={{ fontWeight: 600 }}>{eur(tot)}</td>
                      </tr>
                    );
                  })}
                  <tr className="tot">
                    <td>Totale anno</td>
                    {Array.from({ length: 12 }, (_, i) => (
                      <td className="num" key={i}>{eur(proiezioneMese(i))}</td>
                    ))}
                    <td className="num">{eur(proiezioneAnno)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <p className="page-caption" style={{ marginTop: 12 }}>
            In <strong style={{ color: "var(--blue)" }}>blu</strong> i mesi che questa proposta scrive; gli
            altri restano il budget di oggi. Non e una somma: il consolidamento riscrive solo la fonte{" "}
            <strong>{nomeFonte(p.fonte)}</strong>, e una proposta <strong>sostituisce</strong> il budget
            iniziale invece di aggiungersi — sommare direbbe un numero che dopo il consolidamento non si
            vedrebbe da nessuna parte.
          </p>
        </>
      )}

      {p.note && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="muted" style={{ fontSize: 12.5, marginBottom: 4 }}>Note di chi l&apos;ha inviata</div>
          {p.note}
        </div>
      )}

      {p.notaAdmin && (
        <div className="card" style={{ marginTop: 12, borderColor: p.stato === "RESPINTA" ? "var(--red)" : "var(--green)" }}>
          <div className="muted" style={{ fontSize: 12.5, marginBottom: 4 }}>Risposta dell&apos;admin</div>
          {p.notaAdmin}
        </div>
      )}

      <DecisioneProposta
        id={p.id}
        stato={p.stato}
        ambitoTipo={p.ambitoTipo}
        consolidataSu={p.consolidataSu}
        tipologie={dati.tipologie.map((t) => ({ slug: t.slug, nome: t.nome }))}
        valori={valori}
        budgetAttuale={budgetAttuale}
        fonteProposta={p.fonte}
        fonti={FONTI}
      />
    </>
  );
}
