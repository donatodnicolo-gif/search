import Link from "next/link";
import {
  ANNO_CORRENTE, caricaAnno, contoEconomico, contoEconomicoMensile,
  LIVELLI, type Livello, type PL,
} from "@/lib/calc";
import { eur, MESI, pct } from "@/lib/format";
import { caricaConsuntivo, type ConsuntivoPeriodo } from "@/lib/consuntivo";
import { QUOTA_STIMATA } from "@/lib/venduto";
import { misuraQuota } from "@/lib/quota";

export const dynamic = "force-dynamic";

// Struttura del conto economico: ogni riga sa come si legge (costo o risultato)
// così la tabella resta una sola fonte di verità per tutti e 3 i livelli.
type Riga = {
  label: string;
  valore: (pl: PL) => number;
  tipo?: "costo" | "totale" | "risultato";
  nota?: string;
  // Quanto è successo davvero sui mesi chiusi. `null` = nel consuntivo quella
  // riga non esiste (i premi si liquidano a fine anno, al raggiungimento: non
  // si consuntivano mese per mese). Meglio una casella vuota di uno zero che
  // sembra un dato.
  cons?: (c: ConsuntivoPeriodo) => number | null;
};

const RIGHE_FISSE: Riga[] = [
  { label: "Totale ricavi", valore: (pl) => pl.ricavi, tipo: "totale", cons: (c) => c.ricavi },
  { label: "Costo per servizi", valore: (pl) => pl.cogs, tipo: "costo", nota: "a budget: dai margini per tipologia", cons: (c) => c.cogs },
  { label: "Margine lordo", valore: (pl) => pl.margineLordo, tipo: "totale", cons: (c) => c.margineLordo },
  { label: "Spesa pubblicitaria (ADV)", valore: (pl) => pl.adv, tipo: "costo", nota: "% sulle vendite per maison/mese", cons: (c) => c.adv },
  { label: "Costo del personale", valore: (pl) => pl.personale, tipo: "costo", nota: "dipendenti, stagisti e consulenti", cons: (c) => c.personale },
  { label: "Costi di struttura", valore: (pl) => pl.costiFissi, tipo: "costo", cons: (c) => c.struttura },
  { label: "EBITDA", valore: (pl) => pl.ebitda, tipo: "risultato", cons: (c) => c.ebitda },
  { label: "Premi al raggiungimento", valore: (pl) => pl.premio, tipo: "costo", cons: () => null },
  { label: "Risultato netto", valore: (pl) => pl.risultatoNetto, tipo: "risultato", cons: () => null },
];

export default async function ContoEconomico({
  searchParams,
}: {
  searchParams: Promise<{ livello?: string; vista?: string }>;
}) {
  const sp = await searchParams;
  const dati = await caricaAnno(ANNO_CORRENTE);
  const livello = (LIVELLI.some((l) => l.key === sp.livello) ? sp.livello : "RAGGIUNGIBILE") as Livello;

  // Il consuntivo si ferma al **mese precedente a quello in corso**: qui, a
  // differenza del Consuntivo, il mese aperto non entra. Un P&L si legge a mesi
  // chiusi, e mezzo mese di ricavi contro un mese intero di stipendi darebbe un
  // EBITDA più brutto del vero proprio nella tabella dove si decide.
  const oggi = new Date();
  const meseChiuso =
    dati.year < oggi.getUTCFullYear() ? 12 : dati.year > oggi.getUTCFullYear() ? 0 : oggi.getUTCMonth();
  const mesiChiusi = Array.from({ length: meseChiuso }, (_, i) => i + 1);
  const cons = mesiChiusi.length > 0 ? await caricaConsuntivo(dati, mesiChiusi) : null;
  const etichettaChiusi = meseChiuso > 0 ? `Gen–${MESI[meseChiuso - 1]}` : "—";

  // Il budget si converte alla stessa base del consuntivo: sul D2C entra la
  // quota che resta a Deluxy, non il venduto pieno. Senza, «realizzato» e
  // «scostamento» confrontano una provvigione con un prezzo di vendita.
  const quotaDeluxy = cons?.quota ?? (await misuraQuota(dati.year, [1,2,3,4,5,6,7,8,9,10,11,12], []));
  const qD2C = quotaDeluxy.percentuale / 100;

  // Il budget **degli stessi mesi**, altrimenti il consuntivo di sei mesi
  // finirebbe accanto a un budget di dodici e sembrerebbe un disastro. Ha la
  // stessa forma del consuntivo, così le due colonne usano lo stesso accessore
  // e non possono descrivere due cose diverse. Si confronta col **pubblicato**
  // (raggiungibile): misurare i fatti contro lo scenario sfidante sarebbe
  // scegliersi l'asticella dopo il salto.
  const bmRagg = contoEconomicoMensile(dati, "RAGGIUNGIBILE", qD2C);
  const somma = (campo: "ricavi" | "cogs" | "margineLordo" | "adv" | "personale" | "costiFissi" | "ebitda") =>
    mesiChiusi.reduce((s, m) => s + bmRagg[m - 1][campo], 0);
  const budgetChiusi: ConsuntivoPeriodo | null =
    mesiChiusi.length === 0
      ? null
      : {
          ok: true,
          mancanti: [],
          mesi: mesiChiusi,
          ricavi: somma("ricavi"),
          ricaviPerTipologia: Object.fromEntries(
            dati.tipologie.map((t) => [
              t.slug,
              dati.maisons.reduce(
                (s, m) => s + mesiChiusi.reduce((a, mm) => a + (m.mesi.find((y) => y.month === mm)?.vendite[t.slug] ?? 0), 0),
                0
              ),
            ])
          ),
          vendutoEcommerce: 0,
          cogs: somma("cogs"),
          adv: somma("adv"),
          struttura: somma("costiFissi"),
          personale: somma("personale"),
          margineLordo: somma("margineLordo"),
          ebitda: somma("ebitda"),
          nonCategorizzato: 0,
          // Campi che descrivono le fonti del consuntivo: qui dentro c'è il
          // budget, che di fonti non ne ha.
          advMarketing: null,
          advCopertura: null,
          advCompetenza: { dentro: 0, fuori: 0 },
          quota: QUOTA_STIMATA,
          pagatoAiPartner: 0,
          competenza: null,
          perMese: [],
        };

  const pls = LIVELLI.map((l) => contoEconomico(dati, l.key, undefined, qD2C));
  const plScelto = pls.find((p) => p.livello === livello)!;

  // I ricavi si dettagliano per tipologia di servizio: l'elenco è quello
  // configurato in /margini, non un insieme fisso di canali.
  const RIGHE: Riga[] = [
    ...dati.tipologie.map((t) => ({
      label: `Ricavi ${t.nome}`,
      nota: `margine ${t.marginePct.toLocaleString("it-IT")}%`,
      valore: (pl: PL) => pl.ricaviPerServizio[t.slug] ?? 0,
      cons: (c: ConsuntivoPeriodo) => c.ricaviPerTipologia[t.slug] ?? 0,
    })),
    ...RIGHE_FISSE,
  ];
  const mensile = contoEconomicoMensile(dati, livello, qD2C);
  const mesiInPerdita = mensile.filter((m) => m.ebitda < 0).length;

  // Vista «Attuale»: nell'andamento mensile i mesi chiusi mostrano quello che è
  // successo davvero, quelli che restano il budget. Non è un ibrido per pigrizia
  // — è la lettura che serve a metà anno: da qui in poi cosa ci aspetta, dato
  // quello che è già andato come è andato. Ogni mese dice quale dei due è.
  const attuale = sp.vista === "attuale" && cons !== null;
  const mensileVista = mensile.map((m) => {
    const reale = attuale && cons ? cons.perMese.find((x) => x.month === m.month) : undefined;
    return reale
      ? { month: m.month, ricavi: reale.ricavi, cogs: reale.cogs, margineLordo: reale.margineLordo,
          adv: reale.adv, personale: reale.personale, costiFissi: reale.struttura, ebitda: reale.ebitda, reale: true }
      : { month: m.month, ricavi: m.ricavi, cogs: m.cogs, margineLordo: m.margineLordo,
          adv: m.adv, personale: m.personale, costiFissi: m.costiFissi, ebitda: m.ebitda, reale: false };
  });
  const linkMensile = (x: { livello?: string; vista?: string }) =>
    `/pl?livello=${x.livello ?? livello}${x.vista ? `&vista=${x.vista}` : ""}#mensile`;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">P&amp;L {dati.year}</h1>
          <p className="page-caption">
            Conto economico aziendale: ricavi meno costo per servizi, pubblicità, personale e
            struttura, sui 3 livelli di budget. Le prime colonne sono il{" "}
            <strong>consuntivo dei mesi chiusi</strong>{cons ? ` (${etichettaChiusi})` : ""}: il mese in
            corso non entra, perché mezzo mese di ricavi contro un mese intero di stipendi darebbe un
            EBITDA più brutto del vero. Il confronto è col <strong>budget degli stessi mesi</strong>, e
            col pubblicato — misurare i fatti contro lo scenario sfidante sarebbe scegliersi
            l&apos;asticella dopo il salto.
          </p>
        </div>
        <div className="page-actions">
          <Link className="btn secondary" href="/dipendenti">Costo del personale</Link>
          <Link className="btn secondary" href="/impostazioni">Costi e premi</Link>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Ricavi ({LIVELLI.find((l) => l.key === livello)?.label})</div>
          <div className="kpi-value">{eur(plScelto.ricavi)}</div>
          <div className="kpi-sub">×{plScelto.moltiplicatore.toLocaleString("it-IT")} sul pubblicato</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">EBITDA</div>
          <div className={`kpi-value ${plScelto.ebitda >= 0 ? "pos" : "neg"}`}>{eur(plScelto.ebitda)}</div>
          <div className="kpi-sub">{pct(plScelto.ebitdaPct)} sui ricavi</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Costo del personale</div>
          <div className="kpi-value">{eur(plScelto.personale)}</div>
          <div className="kpi-sub">
            {plScelto.ricavi > 0 ? `${pct((plScelto.personale / plScelto.ricavi) * 100)} sui ricavi` : "—"}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Mesi in perdita</div>
          <div className={`kpi-value ${mesiInPerdita > 0 ? "neg" : "pos"}`}>{mesiInPerdita} su 12</div>
          <div className="kpi-sub">EBITDA mensile sotto zero</div>
        </div>
      </div>

      <h2 className="section-title">Conto economico sui 3 livelli</h2>
      <div className="card tight">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Voce</th>
                {cons && (
                  <>
                    <th className="num">Consuntivo {etichettaChiusi}</th>
                    <th className="num">Budget {etichettaChiusi}</th>
                    <th className="num">Scostamento</th>
                  </>
                )}
                {LIVELLI.map((l) => (
                  <th className="num" key={l.key}>{l.label}</th>
                ))}
                <th className="num">% sui ricavi</th>
              </tr>
            </thead>
            <tbody>
              {RIGHE.map((r) => {
                const forte = r.tipo === "totale" || r.tipo === "risultato";
                return (
                  <tr key={r.label} className={r.tipo === "risultato" ? "tot" : undefined}>
                    <td style={{ fontWeight: forte ? 600 : 400 }}>
                      {r.label}
                      {r.nota && <div className="muted" style={{ fontSize: 11.5 }}>{r.nota}</div>}
                    </td>
                    {cons && budgetChiusi && (() => {
                      const c = r.cons ? r.cons(cons) : null;
                      const b = r.cons ? r.cons(budgetChiusi) : null;
                      if (c === null || b === null) {
                        return (
                          <>
                            <td className="num muted">—</td>
                            <td className="num muted">—</td>
                            <td className="num muted">—</td>
                          </>
                        );
                      }
                      const scost = c - b;
                      // Su un costo spendere meno del previsto è una buona
                      // notizia: il colore segue il verso della voce.
                      const buono = r.tipo === "costo" ? scost <= 0 : scost >= 0;
                      return (
                        <>
                          <td className="num" style={{ fontWeight: 600 }}>
                            {r.tipo === "costo" ? `− ${eur(c)}` : eur(c)}
                          </td>
                          <td className="num muted">{r.tipo === "costo" ? `− ${eur(b)}` : eur(b)}</td>
                          <td className={`num ${buono ? "pos" : "neg"}`}>
                            {scost >= 0 ? "+" : ""}{eur(scost)}
                          </td>
                        </>
                      );
                    })()}
                    {pls.map((pl) => {
                      const v = r.valore(pl);
                      const cls = r.tipo === "risultato" ? (v >= 0 ? "pos" : "neg") : "";
                      return (
                        <td className={`num ${cls}`} style={{ fontWeight: forte ? 600 : 400 }} key={pl.livello}>
                          {r.tipo === "costo" ? `− ${eur(v)}` : eur(v)}
                        </td>
                      );
                    })}
                    <td className="num muted">
                      {plScelto.ricavi > 0 ? pct((r.valore(plScelto) / plScelto.ricavi) * 100) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginTop: 10, borderColor: "var(--orange)" }}>
        <strong>Il budget è mezzo convertito, e va finito.</strong> I <strong>ricavi</strong> D2C entrano qui
        con la quota che resta a Deluxy ({quotaDeluxy.percentuale}%, {quotaDeluxy.misurata ? "misurata" : "stimata"}) —
        la stessa base del consuntivo, così «scostamento» e «realizzato» confrontano finalmente due cose uguali.
        Il <strong>costo per servizi a budget</strong> però si calcola ancora dai margini per tipologia scritti
        quando il ricavo era il venduto pieno: applicare un margine del 35% a un ricavo già netto lascia dentro
        un costo che non c&apos;è più. Finché quei margini non si rifanno in{" "}
        <Link href="/margini" style={{ color: "var(--blue)" }}>Margini</Link>, l&apos;EBITDA a budget è più basso
        del vero e i mesi in perdita sono un artefatto del conto, non un fatto.
        {cons && (
          <>
            {" "}Il metro c&apos;è: sui mesi chiusi il costo per servizi reale è{" "}
            <strong>{eur(cons.cogs)}</strong> contro <strong>{eur(budgetChiusi?.cogs ?? 0)}</strong> a budget.
          </>
        )}
        <div style={{ marginTop: 6 }} className="muted">
          Rifarli cambia EBITDA e <strong>premi</strong>: è una decisione, non una correzione.
        </div>
      </div>

      {cons && (
        <p className="page-caption" style={{ marginTop: 10 }}>
          La riga <strong>ADV</strong> sono le <strong>uscite di banca</strong> categorizzate «Marketing e
          ADV» nel <Link href="/cfo" style={{ color: "var(--blue)" }}>CFO</Link>: la banca vede tutto quello
          che è stato pagato, comprese le piattaforme che nessuno ha collegato.
          {cons.advMarketing !== null && (
            <>
              {" "}
              <strong>Deluxy Marketing</strong>, che conosce solo le <strong>campagne collegate</strong>, ne
              spiega <strong>{eur(cons.advMarketing)}</strong>
              {cons.adv > 0 && <> ({pct((cons.advMarketing / cons.adv) * 100)})</>}: il resto è pubblicità
              pagata su account che in Marketing non ci sono. Non è un errore del conto economico — è la
              misura di quanto ne sappiamo per brand e per campagna.
            </>
          )}
          {cons.advCompetenza.dentro > 0 && (
            <>
              {" "}
              Dentro la riga ci sono <strong>{eur(cons.advCompetenza.dentro)}</strong> pagati in un altro
              esercizio ma <strong>di competenza</strong> di questo.
            </>
          )}
          {cons.advCompetenza.fuori > 0 && (
            <>
              {" "}
              E <strong>{eur(cons.advCompetenza.fuori)}</strong> usciti in questo periodo sono stati portati in{" "}
              <Link href="/competenza" style={{ color: "var(--blue)" }}>competenza</Link> di un altro anno.
            </>
          )}
        </p>
      )}

      <div className="page-head" style={{ marginTop: 28, marginBottom: 12 }}>
        <h2 className="section-title" style={{ margin: 0 }} id="mensile">Andamento mensile</h2>
        <div className="seg">
          {cons && (
            <Link href={linkMensile({ vista: "attuale" })} className={attuale ? "on" : ""}>
              Attuale
            </Link>
          )}
          {LIVELLI.map((l) => (
            <Link key={l.key} href={linkMensile({ livello: l.key })} className={!attuale && l.key === livello ? "on" : ""}>
              {l.label}
            </Link>
          ))}
        </div>
      </div>
      {attuale && (
        <p className="page-caption" style={{ marginTop: -4, marginBottom: 10 }}>
          <strong>Attuale</strong>: i mesi fino a {etichettaChiusi.replace("Gen–", "")} sono il{" "}
          <strong>consuntivo</strong> — quello che è successo davvero — e sono in grassetto; da{" "}
          {MESI[meseChiuso]} in poi è il <strong>budget pubblicato</strong>, in grigio. Il mese in corso è già
          budget: è ancora aperto, e mezzo mese di ricavi contro un mese intero di stipendi non è un dato.
        </p>
      )}
      <div className="card tight">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Voce</th>
                {MESI.map((m) => (
                  <th className="num" key={m}>{m}</th>
                ))}
                <th className="num">Anno</th>
              </tr>
            </thead>
            <tbody>
              {([
                ["Ricavi", (m: (typeof mensileVista)[number]) => m.ricavi, false],
                ["Costo per servizi", (m: (typeof mensileVista)[number]) => m.cogs, true],
                ["Margine lordo", (m: (typeof mensileVista)[number]) => m.margineLordo, false],
                ["ADV", (m: (typeof mensileVista)[number]) => m.adv, true],
                ["Personale", (m: (typeof mensileVista)[number]) => m.personale, true],
                ["Struttura", (m: (typeof mensileVista)[number]) => m.costiFissi, true],
              ] as const).map(([label, get, costo]) => (
                <tr key={label}>
                  <td style={{ whiteSpace: "nowrap" }}>{label}</td>
                  {mensileVista.map((m) => (
                    <td
                      className={`num ${attuale && !m.reale ? "muted" : ""}`}
                      style={{ fontWeight: attuale && m.reale ? 600 : 400 }}
                      key={m.month}
                    >
                      {costo ? `− ${eur(get(m))}` : eur(get(m))}
                    </td>
                  ))}
                  <td className="num" style={{ fontWeight: 600 }}>
                    {eur(mensileVista.reduce((s, m) => s + get(m), 0))}
                  </td>
                </tr>
              ))}
              <tr className="tot">
                <td>EBITDA</td>
                {mensileVista.map((m) => (
                  <td
                    className={`num ${m.ebitda >= 0 ? "pos" : "neg"}`}
                    style={{ opacity: attuale && !m.reale ? 0.55 : 1 }}
                    key={m.month}
                  >
                    {eur(m.ebitda)}
                  </td>
                ))}
                <td className={`num ${mensileVista.reduce((s, m) => s + m.ebitda, 0) >= 0 ? "pos" : "neg"}`}>
                  {eur(mensileVista.reduce((s, m) => s + m.ebitda, 0))}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <h2 className="section-title">Conto economico per maison</h2>
      <div className="card tight">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Maison</th>
                <th className="num">Ricavi</th>
                <th className="num">Margine lordo</th>
                <th className="num">ADV</th>
                <th className="num">Personale</th>
                <th className="num">Struttura</th>
                <th className="num">EBITDA</th>
                <th className="num">EBITDA %</th>
              </tr>
            </thead>
            <tbody>
              {dati.maisons.map((m) => {
                const pl = contoEconomico(dati, livello, m.slug, qD2C);
                return (
                  <tr key={m.id}>
                    <td>
                      <Link href={`/maison/${m.slug}`} style={{ fontWeight: 600 }}>{m.nome}</Link>
                    </td>
                    <td className="num">{eur(pl.ricavi)}</td>
                    <td className="num">{eur(pl.margineLordo)}</td>
                    <td className="num">{eur(pl.adv)}</td>
                    <td className="num">{eur(pl.personale)}</td>
                    <td className="num">{eur(pl.costiFissi)}</td>
                    <td className={`num ${pl.ebitda >= 0 ? "pos" : "neg"}`} style={{ fontWeight: 600 }}>
                      {eur(pl.ebitda)}
                    </td>
                    <td className="num muted">{pct(pl.ebitdaPct)}</td>
                  </tr>
                );
              })}
              <tr className="tot">
                <td>Totale</td>
                <td className="num">{eur(plScelto.ricavi)}</td>
                <td className="num">{eur(plScelto.margineLordo)}</td>
                <td className="num">{eur(plScelto.adv)}</td>
                <td className="num">{eur(plScelto.personale)}</td>
                <td className="num">{eur(plScelto.costiFissi)}</td>
                <td className={`num ${plScelto.ebitda >= 0 ? "pos" : "neg"}`}>{eur(plScelto.ebitda)}</td>
                <td className="num">{pct(plScelto.ebitdaPct)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <p className="page-caption" style={{ marginTop: 18 }}>
        I costi comuni (struttura, personale non attribuito, premi) sono ripartiti sulle maison in
        proporzione ai ricavi. Personale e struttura non scalano con il livello di budget: sono impegni
        già presi, quindi il maggior fatturato dello scenario sfidante cade quasi interamente a margine.
      </p>
    </>
  );
}
