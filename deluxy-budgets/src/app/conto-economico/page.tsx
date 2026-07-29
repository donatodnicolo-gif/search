import Link from "next/link";
import { ANNO_CORRENTE, caricaAnno } from "@/lib/calc";
import { caricaBilancio, totali } from "@/lib/bilancio";
import { caricaConsuntivo } from "@/lib/consuntivo";
import { eur, MESI, pct } from "@/lib/format";
import { BilancioEditor } from "@/components/BilancioEditor";
import { PropostaBilancio } from "@/components/PropostaBilancio";
import { proponiDaApp } from "@/lib/bilancio-proposta";
import { residuoAnno } from "@/lib/bilancio-dettaglio";

export const dynamic = "force-dynamic";

export default async function ContoEconomicoPage({
  searchParams,
}: {
  searchParams: Promise<{ anno?: string }>;
}) {
  const sp = await searchParams;
  const ANNI = [ANNO_CORRENTE - 3, ANNO_CORRENTE - 2, ANNO_CORRENTE - 1, ANNO_CORRENTE];
  const anno = ANNI.includes(Number(sp.anno)) ? Number(sp.anno) : ANNO_CORRENTE - 1;

  const valori = await caricaBilancio(anno);
  const importi = new Map(valori.map((v) => [v.codice, v.importo]));
  const t = totali(importi);
  const compilato = valori.length > 0;

  // Le voci che l'app può proporre da sé (Finance, banca, Orders). Si calcolano
  // sempre: servono anche a bilancio già compilato, per vedere quanto si
  // discosta il gestionale — ma non si scrive niente senza conferma.
  const datiProposta = await caricaAnno(anno);
  const [{ proposte, avvisi }, residuo] = await Promise.all([
    proponiDaApp(datiProposta),
    residuoAnno(anno),
  ]);

  // Il confronto col gestionale ha senso solo su un anno concluso e solo se il
  // bilancio c'è: su un anno in corso il bilancio non esiste ancora, e mettere
  // un consuntivo parziale accanto a un bilancio vuoto direbbe «-100%».
  const annoConcluso = anno < ANNO_CORRENTE;
  const gest = compilato && annoConcluso ? await caricaConsuntivo(datiProposta, [1,2,3,4,5,6,7,8,9,10,11,12]) : null;

  // Ripartizione mensile: si mostra solo per le voci che ce l'hanno davvero.
  const conMesi = valori.filter((v) => v.mesi);
  const mesiTotali = Array(12).fill(0) as number[];
  for (const v of conMesi) v.mesi!.forEach((x, i) => { mesiTotali[i] += x; });

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Conto economico</h1>
          <p className="page-caption">
            Il bilancio <strong>vero</strong>, nello schema di legge (art. 2425 c.c.), con le stesse voci e gli
            stessi codici del PDF del commercialista. È un&apos;altra cosa dal{" "}
            <Link href="/consuntivo" style={{ color: "var(--blue)" }}>Consuntivo</Link>, che ricostruisce i costi
            dai movimenti di banca: quello risponde a «come sta andando adesso», questo a «cosa abbiamo chiuso».
            Tenerli separati serve proprio a confrontarli.
          </p>
        </div>
        <div className="page-actions">
          <div className="seg">
            {ANNI.map((y) => (
              <Link key={y} href={`/conto-economico?anno=${y}`} className={y === anno ? "on" : ""}>{y}</Link>
            ))}
          </div>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Valore della produzione {anno}</div>
          <div className="kpi-value">{eur(t.A)}</div>
          <div className="kpi-sub">{compilato ? `${valori.length} voci compilate` : "bilancio non ancora caricato"}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Differenza A − B</div>
          <div className={`kpi-value ${t.AB >= 0 ? "pos" : "neg"}`}>{eur(t.AB)}</div>
          <div className="kpi-sub">{t.A > 0 ? `${pct((t.AB / t.A) * 100)} sul valore della produzione` : "—"}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Utile (perdita) dell&apos;esercizio</div>
          <div className={`kpi-value ${t.UTILE >= 0 ? "pos" : "neg"}`}>{eur(t.UTILE)}</div>
          <div className="kpi-sub">dopo oneri finanziari e imposte</div>
        </div>
      </div>

      {residuo && residuo.importo > 0 && (
        <p className="page-caption" style={{ marginTop: 0 }}>
          <strong>{eur(residuo.importo)}</strong> di uscite {anno} ({residuo.controparti} controparti) stanno in una
          voce di bilancio <strong>senza che nessuna regola lo dica</strong>: le raccoglie
          {residuo.categoria ? ` «${residuo.categoria}»` : " la categoria predefinita"}, che confluisce in{" "}
          {residuo.voce ? (
            <Link href={`/conto-economico/${residuo.voce}?anno=${anno}`} style={{ color: "var(--blue)" }}>
              {residuo.voce}
            </Link>
          ) : (
            "nessuna voce"
          )}
          . Il totale è giusto — quei soldi sono usciti davvero — ma <em>dove</em> stanno non l&apos;ha deciso
          nessuno. Si assegnano dal dettaglio della voce.
        </p>
      )}

      <PropostaBilancio
        anno={anno}
        proposte={proposte}
        avvisi={avvisi}
        gia={Object.fromEntries(valori.map((v) => [v.codice, v.importo]))}
      />

      <BilancioEditor anno={anno} valori={valori} />

      {conMesi.length > 0 && (
        <>
          <h2 className="section-title">Ripartizione mensile</h2>
          <div className="card tight">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Voce</th>
                    {MESI.map((m) => (<th className="num" key={m}>{m}</th>))}
                    <th className="num">Anno</th>
                  </tr>
                </thead>
                <tbody>
                  {conMesi.map((v) => (
                    <tr key={v.codice}>
                      <td style={{ whiteSpace: "nowrap", fontWeight: 500 }}>{v.codice}</td>
                      {v.mesi!.map((x, i) => (<td className="num" key={i}>{eur(x)}</td>))}
                      <td className="num" style={{ fontWeight: 600 }}>{eur(v.importo)}</td>
                    </tr>
                  ))}
                  <tr className="tot">
                    <td>Totale ripartito</td>
                    {mesiTotali.map((x, i) => (<td className="num" key={i}>{eur(x)}</td>))}
                    <td className="num">{eur(mesiTotali.reduce((s, x) => s + x, 0))}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <p className="page-caption" style={{ marginTop: 12 }}>
            Solo le voci a cui è stata data una ripartizione compaiono qui. Le altre restano annue e non vengono
            spalmate in dodicesimi: un dodicesimo di ammortamento è un numero inventato, e in una tabella mensile
            sembrerebbe misurato.
          </p>
        </>
      )}

      {gest && (
        <>
          <h2 className="section-title">Bilancio {anno} contro la ricostruzione gestionale</h2>
          <div className="card tight">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Voce</th>
                    <th className="num">Bilancio</th>
                    <th className="num">Gestionale</th>
                    <th className="num">Differenza</th>
                    <th>Perché può non tornare</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { nome: "Ricavi", bil: t.A, ges: gest.ricavi, perche: "il gestionale conta il fatturato di Finance più la quota ecommerce; il bilancio anche altri proventi." },
                    { nome: "Costi per servizi", bil: importi.get("B7") ?? 0, ges: gest.cogs, perche: "il gestionale vede solo le uscite di banca categorizzate, il bilancio anche fatture non ancora pagate." },
                    { nome: "Personale", bil: importi.get("B9") ?? 0, ges: gest.personale, perche: "il gestionale usa il roster a budget, il bilancio il costo effettivo con TFR e ratei." },
                    { nome: "Ammortamenti", bil: importi.get("B10") ?? 0, ges: 0, perche: "non passano dalla banca: il gestionale non li vede per costruzione." },
                  ].map((r) => (
                    <tr key={r.nome}>
                      <td style={{ fontWeight: 600 }}>{r.nome}</td>
                      <td className="num">{eur(r.bil)}</td>
                      <td className="num muted">{eur(r.ges)}</td>
                      <td className={`num ${Math.abs(r.bil - r.ges) < 1 ? "muted" : ""}`}>
                        {r.bil - r.ges >= 0 ? "+" : ""}{eur(r.bil - r.ges)}
                      </td>
                      <td className="muted" style={{ fontSize: 12.5 }}>{r.perche}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="page-caption" style={{ marginTop: 12 }}>
            Le differenze <strong>non sono errori</strong>: sono le due contabilità che misurano cose diverse. Servono
            a scoprire cosa manca — spese non ancora categorizzate nel{" "}
            <Link href="/cfo" style={{ color: "var(--blue)" }}>CFO</Link>, oppure costi che in banca non passeranno
            mai. Quando una differenza non ha una spiegazione in questa colonna, quella è la cosa da guardare.
          </p>
        </>
      )}
    </>
  );
}
