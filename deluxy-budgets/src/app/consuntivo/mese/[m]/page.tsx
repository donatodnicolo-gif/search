// Il mese, aperto.
//
// Nasce da una richiesta dell'utente guardando lo split mensile: «consentimi di
// entrare nel dettaglio di ogni mese». La tabella dava dodici colonne di numeri
// veri e nessun modo di chiedere *perché* — e la domanda che nasce lì è quasi
// sempre su un mese solo («perché gennaio è in perdita e maggio no?»), non sul
// periodo.
//
// Questa pagina è **la colonna di quel mese**, con ogni riga che si apre sul suo
// dettaglio ristretto allo stesso mese (`/consuntivo/[voce]?mese=N`) e accanto
// lo stesso mese dell'anno prima. I numeri vengono da `caricaConsuntivo(dati,
// [m])`, lo stesso motore della pagina da cui si è cliccato: se li ricalcolasse
// qui, prima o poi direbbero due cose diverse.
import Link from "next/link";
import { notFound } from "next/navigation";
import { caricaAnno } from "@/lib/calc";
import { caricaConsuntivo, type ConsuntivoPeriodo } from "@/lib/consuntivo";
import { eur, MESI, pct } from "@/lib/format";
import { variazione } from "@/lib/periodo";
import { TornaIndietro } from "@/components/TornaIndietro";

export const dynamic = "force-dynamic";

export default async function MeseConsuntivoPage({
  params,
  searchParams,
}: {
  params: Promise<{ m: string }>;
  searchParams: Promise<{ anno?: string; stato?: string }>;
}) {
  const { m: grezzo } = await params;
  const mese = Number(grezzo);
  if (!Number.isInteger(mese) || mese < 1 || mese > 12) notFound();

  const sp = await searchParams;
  const oggi = new Date();
  const annoInCorso = oggi.getUTCFullYear();
  const anno = Number.isInteger(Number(sp.anno)) ? Number(sp.anno) : annoInCorso;
  const stato = sp.stato ?? "tutte";
  const nomeMese = MESI[mese - 1];

  // Un mese non ancora cominciato non si apre: meglio rimandare al consuntivo
  // che mostrare una colonna di zeri che sembrano misure.
  const meseLimite = anno < annoInCorso ? 12 : anno > annoInCorso ? 0 : oggi.getUTCMonth() + 1;
  const futuro = mese > meseLimite;
  const inCorso = anno === annoInCorso && mese === meseLimite;

  const [dati, datiPrec] = await Promise.all([caricaAnno(anno), caricaAnno(anno - 1)]);
  const [c, prec]: [ConsuntivoPeriodo | null, ConsuntivoPeriodo | null] = futuro
    ? [null, null]
    : await Promise.all([caricaConsuntivo(dati, [mese]), caricaConsuntivo(datiPrec, [mese])]);

  const indietro = `/consuntivo?stato=${stato}&anno=${anno}`;
  const q = `stato=${stato}&anno=${anno}&mese=${mese}`;

  // La riga dell'anno prima si mostra **solo se quel mese è stato misurato**:
  // la banca del 2025 è completa, ma su anni più indietro un mese vuoto non è
  // un mese a zero costi — è un mese che non c'è. Regola già applicata nel
  // consuntivo: dove il dato non esiste la casella resta vuota, non a zero.
  const precMisurato = Boolean(prec && prec.ok && (prec.ricavi > 0 || prec.cogs + prec.adv + prec.struttura > 0));

  type Riga = {
    label: string;
    valore: number;
    prec: number | null;
    costo?: boolean;
    forte?: boolean;
    dentro?: boolean;
    voce?: string;
    nota?: string;
  };
  const righe: Riga[] = c
    ? [
        {
          label: "Ricavi",
          valore: c.ricavi,
          prec: precMisurato ? prec!.ricavi : null,
          voce: "ricavi",
          nota: "fatturato Finance del mese + ricavo dell'ecommerce",
        },
        {
          label: "di cui ecommerce",
          valore: c.d2c ? c.d2c.fee + c.d2c.margineFornitori : c.ricavi - (c.ricavi - c.vendutoEcommerce),
          prec: null,
          dentro: true,
          voce: "ricavi",
          nota: c.d2c
            ? `fee dei vendor ${eur(c.d2c.fee)} + margine sugli ordini da fornitori ${eur(c.d2c.margineFornitori)} (${c.d2c.percentualeFornitori}% su ${eur(c.d2c.vendutoFornitori)})`
            : `${c.quota.percentuale}% del venduto (${c.quota.misurata ? "misurato" : "stimato"})`,
        },
        {
          label: "Costo per servizi",
          valore: c.cogs,
          prec: precMisurato ? prec!.cogs : null,
          costo: true,
          voce: "cogs",
          nota: "uscite di banca del mese, categorie di costo del servizio",
        },
        { label: "Margine lordo", valore: c.margineLordo, prec: precMisurato ? prec!.margineLordo : null, forte: true },
        {
          label: "ADV",
          valore: c.adv,
          prec: precMisurato ? prec!.adv : null,
          costo: true,
          voce: "adv",
          nota:
            c.advMarketing === null
              ? "uscite di banca del mese (Marketing non risponde: la copertura non si misura)"
              : `uscite di banca del mese — di queste Marketing ne spiega ${eur(c.advMarketing)}`,
        },
        {
          label: "Personale",
          valore: c.personale,
          prec: precMisurato ? prec!.personale : null,
          costo: true,
          voce: "personale",
          nota: "payroll a budget dell'anagrafica Dipendenti, non la banca",
        },
        {
          label: "Struttura",
          valore: c.struttura,
          prec: precMisurato ? prec!.struttura : null,
          costo: true,
          voce: "struttura",
          nota: "uscite di banca del mese, categorie di struttura",
        },
      ]
    : [];

  return (
    <>
      <div className="page-head">
        <div>
          <p className="page-caption" style={{ margin: 0 }}>
            {/* «Il ritorno al punto esatto» (Libro UX&UI v1.5 §2) */}
            <TornaIndietro fallback={indietro} label={`Consuntivo ${anno}`} />
          </p>
          <h1 className="page-title">
            {nomeMese} {anno}
          </h1>
          <p className="page-caption">
            La colonna di questo mese, riga per riga. <strong>Ogni voce si apre</strong> sul suo dettaglio
            ristretto a {nomeMese}: le categorie di banca e le controparti di questo mese soltanto, non del
            periodo. Accanto, lo <strong>stesso mese del {anno - 1}</strong>.
          </p>
        </div>
        <div className="page-actions">
          {/* I mesi si scorrono da qui: aperto un mese, la domanda successiva è
              quasi sempre su quello prima o quello dopo. I mesi non ancora
              cominciati non sono cliccabili — non c'è niente da vedere. */}
          <div className="seg">
            {MESI.map((nome, i) => {
              const n = i + 1;
              if (n > meseLimite) return <span key={n} className="muted" style={{ padding: "0 6px", opacity: 0.4 }}>{nome}</span>;
              return (
                <Link key={n} href={`/consuntivo/mese/${n}?stato=${stato}&anno=${anno}`} className={n === mese ? "on" : ""}>
                  {nome}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {futuro ? (
        <div className="card tight" style={{ padding: 16 }}>
          <p style={{ margin: 0 }}>
            <strong>{nomeMese} {anno} non è ancora cominciato.</strong> Non c&apos;è un consuntivo da
            mostrare: quello che esiste per questo mese è il <Link href="/maison" style={{ color: "var(--blue)" }}>budget</Link>.
          </p>
        </div>
      ) : (
        <>
          <div className="kpi-grid">
            <div className="kpi">
              <div className="kpi-label">Ricavi · {nomeMese} {anno}</div>
              <div className="kpi-value">{eur(c!.ricavi)}</div>
              <div className="kpi-sub">
                {precMisurato ? (
                  <>
                    {nomeMese} {anno - 1}: {eur(prec!.ricavi)}{" "}
                    {variazione(c!.ricavi, prec!.ricavi) !== null && (
                      <span className={c!.ricavi >= prec!.ricavi ? "pos" : "neg"}>
                        ({pct(variazione(c!.ricavi, prec!.ricavi)!)})
                      </span>
                    )}
                  </>
                ) : (
                  `nessun dato misurato per ${nomeMese} ${anno - 1}`
                )}
              </div>
            </div>
            <div className="kpi">
              <div className="kpi-label">EBITDA · {nomeMese}</div>
              <div className={`kpi-value ${c!.ebitda >= 0 ? "pos" : "neg"}`}>{eur(c!.ebitda)}</div>
              <div className="kpi-sub">
                margine lordo {eur(c!.margineLordo)} meno ADV, personale e struttura
              </div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Venduto ecommerce</div>
              <div className="kpi-value">{eur(c!.vendutoEcommerce)}</div>
              <div className="kpi-sub">
                lordo sui negozi, IVA inclusa — di cui {eur(c!.pagatoAiPartner)} girati ai partner
                {c!.quota.misurata ? ` (quota Deluxy ${c!.quota.percentuale}%, misurata)` : ""}
              </div>
            </div>
          </div>

          <h2 className="section-title">Conto economico di {nomeMese}</h2>
          <div className="card tight">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Voce</th>
                    <th className="num">{nomeMese} {anno}</th>
                    <th className="num">{nomeMese} {anno - 1}</th>
                    <th className="num">Var.</th>
                  </tr>
                </thead>
                <tbody>
                  {righe.map((r) => {
                    const v = r.prec === null ? null : variazione(r.valore, r.prec);
                    return (
                      <tr key={r.label}>
                        <td style={{ fontWeight: r.forte ? 600 : 400, paddingLeft: r.dentro ? 26 : undefined }}>
                          {r.dentro && <span className="muted" style={{ marginRight: 6 }}>└</span>}
                          {r.voce ? (
                            <Link href={`/consuntivo/${r.voce}?${q}`} style={{ color: "var(--blue)" }}>
                              {r.label}
                            </Link>
                          ) : (
                            r.label
                          )}
                          {r.nota && (
                            <div className="muted" style={{ fontSize: 11.5, paddingLeft: r.dentro ? 16 : 0 }}>{r.nota}</div>
                          )}
                        </td>
                        <td className="num" style={{ fontWeight: r.forte ? 600 : 400 }}>
                          {r.costo ? `− ${eur(r.valore)}` : eur(r.valore)}
                        </td>
                        <td className="num muted">
                          {r.prec === null ? "—" : r.costo ? `− ${eur(r.prec)}` : eur(r.prec)}
                        </td>
                        <td className="num">
                          {v === null ? (
                            <span className="muted">—</span>
                          ) : (
                            <span className={(r.costo ? v <= 0 : v >= 0) ? "pos" : "neg"}>{pct(v)}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="tot">
                    <td>EBITDA</td>
                    <td className={`num ${c!.ebitda >= 0 ? "pos" : "neg"}`}>{eur(c!.ebitda)}</td>
                    <td className="num muted">{precMisurato ? eur(prec!.ebitda) : "—"}</td>
                    <td className="num">
                      {precMisurato && variazione(c!.ebitda, prec!.ebitda) !== null ? (
                        <span className={c!.ebitda >= prec!.ebitda ? "pos" : "neg"}>
                          {pct(variazione(c!.ebitda, prec!.ebitda)!)}
                        </span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <h2 className="section-title">Da dove viene il fatturato di {nomeMese}</h2>
          <div className="card tight">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Voce di budget</th>
                    <th className="num">{nomeMese} {anno}</th>
                    <th className="num">Quota del mese</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(c!.ricaviPerTipologia)
                    .sort((a, b) => b[1] - a[1])
                    .map(([nome, v]) => (
                      <tr key={nome}>
                        <td>{nome}</td>
                        <td className="num">{eur(v)}</td>
                        <td className="num muted">{c!.ricavi > 0 ? pct((v / c!.ricavi) * 100, 0) : "—"}</td>
                      </tr>
                    ))}
                  <tr className="tot">
                    <td>Totale</td>
                    <td className="num">{eur(c!.ricavi)}</td>
                    <td className="num muted">100%</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="page-caption" style={{ margin: "10px 14px 4px" }}>
              Le singole fatture di ogni tipologia, e i negozi uno per uno, stanno nel{" "}
              <Link href={`/consuntivo/ricavi?${q}`} style={{ color: "var(--blue)" }}>dettaglio dei ricavi di {nomeMese}</Link>.
            </p>
          </div>

          {/* Quello che di questo mese **non** è misurato. Sta in fondo e non in
              cima di proposito: prima si guardano i numeri, poi si sa quanto
              fidarsene. Ma sta nella stessa pagina, perché un limite scritto
              altrove non lo legge nessuno. */}
          <div className="card tight" style={{ padding: 16, marginTop: 16 }}>
            <strong>Cosa sapere su questo mese</strong>
            <ul style={{ margin: "8px 0 0", paddingLeft: 18, lineHeight: 1.6 }}>
              {inCorso && (
                <li>
                  <strong>{nomeMese} è il mese in corso</strong>: l&apos;ecommerce arriva al giorno, mentre
                  fatturato e banca sono aggregati al mese e si riempiono man mano. Il mese sembra peggiore
                  di quello che sarà, e non è un calo.
                </li>
              )}
              {c!.d2c && c!.d2c.mesiNonCaricati.includes(mese) && (
                <li>
                  <strong>Le vendite dei partner di {nomeMese} non sono caricate</strong> in Finance (si
                  inseriscono a mano): il ricavo dell&apos;ecommerce di questo mese resta fuori dalla misura
                  delle fee e si ripiega sulla quota.
                </li>
              )}
              {c!.nonCategorizzato > 0 && (
                <li>
                  <strong>{eur(c!.nonCategorizzato)}</strong> di uscite di questo mese non hanno ancora una
                  categoria: finché restano lì, i costi sono <strong>sottostimati</strong> e l&apos;EBITDA
                  più bello del vero. Si assegnano dal dettaglio di ogni voce, o nel{" "}
                  <Link href="/cfo" style={{ color: "var(--blue)" }}>CFO</Link>.
                </li>
              )}
              {c!.advMarketing !== null && c!.adv > 0 && (
                <li>
                  Degli <strong>{eur(c!.adv)}</strong> di pubblicità usciti dal conto,{" "}
                  <Link href="/competenza" style={{ color: "var(--blue)" }}>Marketing</Link> ne spiega{" "}
                  <strong>{eur(c!.advMarketing)}</strong> ({pct((c!.advMarketing / c!.adv) * 100, 0)}): il resto
                  sono account non collegati o spesa di piattaforme che Marketing non legge.
                </li>
              )}
              {c!.mancanti.length > 0 && (
                <li>
                  Fonti che non hanno risposto: {c!.mancanti.join(" · ")}. Le righe che ne dipendono sono
                  <strong> incomplete</strong>, non a zero.
                </li>
              )}
              <li>
                I ricavi di questo mese stanno su <strong>due basi diverse</strong>: Finance dà
                l&apos;imponibile, i negozi il totale pagato dal cliente con IVA e spedizione incluse. È
                dichiarato invece di uniformarlo con un&apos;aliquota indovinata.
              </li>
            </ul>
          </div>
        </>
      )}
    </>
  );
}
