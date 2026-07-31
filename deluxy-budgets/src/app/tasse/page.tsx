import Link from "next/link";
import { ANNO_CORRENTE, caricaAnno } from "@/lib/calc";
import { caricaBilancio, totali } from "@/lib/bilancio";
import { caricaConsuntivo } from "@/lib/consuntivo";
import { caricaCategorie, ricostruisci } from "@/lib/cfo";
import { fetchConsuntivo, fetchSpeseBanca } from "@/lib/finance";
import { eur, pct } from "@/lib/format";
import { stimaImposte, ALIQUOTA_IRES, ALIQUOTA_IRAP } from "@/lib/tasse";
import { stimaIva, ALIQUOTA_IVA } from "@/lib/iva";

export const dynamic = "force-dynamic";

export default async function TassePage({
  searchParams,
}: {
  searchParams: Promise<{ anno?: string }>;
}) {
  const sp = await searchParams;
  const ANNI = [ANNO_CORRENTE - 2, ANNO_CORRENTE - 1, ANNO_CORRENTE];
  const anno = ANNI.includes(Number(sp.anno)) ? Number(sp.anno) : ANNO_CORRENTE - 1;
  const mesi = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  const dati = await caricaAnno(anno);
  const [bilancio, cons, spese, categorie] = await Promise.all([
    caricaBilancio(anno),
    caricaConsuntivo(dati, mesi),
    fetchSpeseBanca({ anno, dal: 1, al: 12 }),
    caricaCategorie(),
  ]);

  // Il punto di partenza è il **bilancio vero** se c'è: il reddito imponibile
  // nasce dall'utile civilistico, non da una ricostruzione. Dove il bilancio non
  // c'è ancora si parte dall'EBITDA del gestionale, e va detto: manca tutto
  // quello che sta sotto l'EBITDA (ammortamenti, oneri finanziari), quindi la
  // stima è più alta del vero.
  const importi = new Map(bilancio.map((v) => [v.codice, v.importo]));
  const t = totali(importi);
  const daBilancio = bilancio.length > 0;
  const utileCivilistico = daBilancio ? t.ANTE : cons.ebitda;

  // I costi per categoria, dalle stesse regole del CFO: è il motivo per cui la
  // classificazione fatta lì serve anche qui — una spesa di rappresentanza
  // finita fra i costi ordinari si deduce al 100% invece che al 75%.
  const costiPerCategoria = spese.ok
    ? ricostruisci(spese.dati.controparti, categorie)
        .filter((r) => r.categoria && r.categoria.tipoPL !== "ESCLUSA" && r.uscite > 0)
        .map((r) => ({ categoria: r.categoria!.nome, costo: r.uscite }))
    : [];

  // Base IRAP: valore della produzione meno i costi che vi concorrono. Restano
  // fuori gli oneri finanziari e i compensi non da lavoro dipendente — è la
  // ragione per cui l'IRAP si paga anche quando l'IRES no.
  const valoreProduzione = daBilancio ? t.A : cons.ricavi;
  const costiIrapDeducibili = costiPerCategoria.reduce((s, c) => {
    const r = (c.categoria.startsWith("Banca") || c.categoria.startsWith("Amministratore")) ? 0 : 1;
    return s + c.costo * r;
  }, 0);

  // ---- I due numeri che solo il commercialista ha ----
  // Perdite fiscali riportabili ed eccedenza degli ammortamenti civilistici sui
  // fiscali: non nascono da nessuna fonte dell'app (in banca gli ammortamenti
  // non passano, e le perdite stanno nel quadro RS della dichiarazione), quindi
  // si scrivono a mano nel conto economico. **Vuoto ≠ zero**: se il campo non
  // c'è si passa `undefined` e la stima dichiara che manca, invece di calcolare
  // come se fossero stati comunicati e valessero zero.
  const perditePregresse = importi.get("FPERDITE");
  const ammortamentiIndeducibili = importi.get("FAMMORT");
  const s = stimaImposte({
    utileCivilistico,
    costiPerCategoria,
    valoreProduzione,
    costiIrapDeducibili,
    perditePregresse,
    ammortamentiIndeducibili,
  });

  // ---- IVA: non è un costo, ma è cassa che esce ----
  // Il fatturato di Finance porta già l'IVA separata (è un dato); sull'ecommerce
  // si versa solo quella sulla provvigione, perché il prezzo pieno lo incassa il
  // partner col suo scontrino.
  const fatt = await fetchConsuntivo({ anno, dal: 1, al: 12, stato: 'tutte' });
  const provvigioni = cons.d2c?.fee ?? 0;
  const margineForn = cons.d2c?.margineFornitori ?? 0;
  const iva = stimaIva({
    mesi: mesi.length,
    ivaFatture: fatt.ok ? fatt.dati.totali.iva : 0,
    imponibileFatture: fatt.ok ? fatt.dati.totali.imponibile : 0,
    provvigioniEcommerce: provvigioni,
    margineFornitori: margineForn,
    costiPerCategoria,
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Tasse</h1>
          <p className="page-caption">
            Quanto si pagherà di <strong>IRES</strong> e <strong>IRAP</strong>, stimato dal bilancio e dai costi
            già classificati. Serve perché <strong>una perdita non vuol dire zero imposte</strong>: nel 2024
            Deluxy ha chiuso a −21.130 € e il reddito fiscale era +48.970 €, perché il fisco non riconosce tutti i
            costi che il bilancio contiene.
          </p>
        </div>
        <div className="page-actions">
          <div className="seg">
            {ANNI.map((y) => (
              <Link key={y} href={`/tasse?anno=${y}`} className={y === anno ? "on" : ""}>{y}</Link>
            ))}
          </div>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Reddito imponibile IRES</div>
          <div className={`kpi-value ${s.redditoImponibile >= 0 ? "" : "pos"}`}>{eur(s.redditoImponibile)}</div>
          <div className="kpi-sub">
            {eur(s.utileCivilistico)} {daBilancio ? "di risultato ante imposte" : "di EBITDA gestionale"} +{" "}
            {eur(s.totaleVariazioniIres)} di costi non deducibili
            {s.variazioneAmmortamenti !== 0 && ` + ${eur(s.variazioneAmmortamenti)} di ammortamenti eccedenti`}
            {s.perditeUsate > 0 && ` − ${eur(s.perditeUsate)} di perdite pregresse`}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">IRES {ALIQUOTA_IRES}%</div>
          <div className="kpi-value">{eur(s.ires)}</div>
          <div className="kpi-sub">{s.redditoImponibile <= 0 ? "reddito negativo: nessuna IRES" : "sul reddito imponibile"}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">IRAP {ALIQUOTA_IRAP}%</div>
          <div className="kpi-value">{eur(s.irap)}</div>
          <div className="kpi-sub">su una base di {eur(s.baseIrap)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Totale stimato</div>
          <div className="kpi-value neg">{eur(s.totale)}</div>
          <div className="kpi-sub">
            {valoreProduzione > 0 ? `${pct((s.totale / valoreProduzione) * 100)} del valore della produzione` : "—"}
          </div>
        </div>
      </div>

      {!daBilancio && (
        <div className="card" style={{ marginBottom: 16, borderColor: "var(--orange)" }}>
          <strong>Per il {anno} il bilancio non è ancora caricato</strong>, quindi si parte dall&apos;EBITDA
          gestionale invece che dal risultato ante imposte. Sotto l&apos;EBITDA mancano ammortamenti e oneri
          finanziari, che abbassano il reddito: <strong>questa stima è più alta del vero</strong>. Caricando il
          bilancio in{" "}
          <Link href="/conto-economico" style={{ color: "var(--blue)" }}>Conto economico</Link> il conto si
          raddrizza da solo.
        </div>
      )}

      <div className="card" style={{ marginBottom: 16, borderColor: "var(--red)" }}>
        <strong>Quanto vale davvero questa stima: misurato sul 2024.</strong> Quell&apos;anno le variazioni in
        aumento dichiarate sono state <strong>70.100 €</strong> (reddito imponibile 48.970 € su una perdita
        civilistica di −21.130 €), mentre le percentuali per categoria qui sotto ne spiegano{" "}
        <strong>1.385 €: il 2%</strong>. Il resto sono voci che l&apos;app non vede — accantonamenti,
        ammortamenti oltre i coefficienti, compensi deliberati e non pagati, perdite su crediti, costi non
        documentati. Due di quelle voci ora hanno un campo:{" "}
        <Link href={`/conto-economico?anno=${anno}`} style={{ color: "var(--blue)" }}>
          ammortamenti eccedenti e perdite riportabili
        </Link>{" "}
        si scrivono a mano quando arrivano dal commercialista, ed entrano nel conto qui sotto.
        <div style={{ marginTop: 6 }} className="muted">
          Quindi <strong>il numero qui sopra è un minimo, non una previsione</strong>. Il metro più affidabile,
          finché il modello non conosce quelle voci, è il rapporto dell&apos;ultimo anno vero: nel 2024 le
          variazioni valevano il <strong>16% dei costi</strong>. Applicato a quest&apos;anno darebbe un ordine di
          grandezza molto più alto di quello analitico.
        </div>
      </div>

      <h2 className="section-title">Dove il fisco non segue il bilancio</h2>
      <div className="card tight">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Categoria di costo</th>
                <th className="num">Costo</th>
                <th className="num">Deducibile IRES</th>
                <th className="num">Variazione in aumento</th>
                <th>Perché</th>
              </tr>
            </thead>
            <tbody>
              {s.variazioni.map((v) => (
                <tr key={v.categoria}>
                  <td style={{ fontWeight: 500 }}>{v.categoria}</td>
                  <td className="num">{eur(v.costo)}</td>
                  <td className="num muted">
                    {eur(v.deducibileIres)}
                    <div style={{ fontSize: 11 }}>{pct((v.deducibileIres / v.costo) * 100, 0)}</div>
                  </td>
                  <td className={`num ${v.variazioneIres > 0 ? "neg" : "muted"}`}>
                    {v.variazioneIres > 0 ? `+ ${eur(v.variazioneIres)}` : "—"}
                  </td>
                  <td className="muted" style={{ fontSize: 12 }}>{v.perche}</td>
                </tr>
              ))}
              <tr className="tot">
                <td>Totale variazioni in aumento</td>
                <td className="num">{eur(s.variazioni.reduce((x, v) => x + v.costo, 0))}</td>
                <td className="num" />
                <td className="num">+ {eur(s.totaleVariazioniIres)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      {/* Il passaggio dal risultato all'imponibile, riga per riga. Le ultime due
          righe non nascono da nessuna fonte dell'app: gli ammortamenti in banca
          non passano e le perdite pregresse stanno nella dichiarazione. Vuoto e
          zero non sono la stessa cosa, e la tabella lo dice. */}
      <h2 className="section-title">Dal risultato all&apos;imponibile</h2>
      <div className="card tight">
        <div className="table-wrap">
          <table>
            <tbody>
              <tr>
                <td>{daBilancio ? "Risultato prima delle imposte (bilancio)" : "EBITDA gestionale (bilancio non caricato)"}</td>
                <td className="num" style={{ width: 170 }}>{eur(s.utileCivilistico)}</td>
                <td className="muted" style={{ fontSize: 12 }}>
                  {daBilancio ? "voce ANTE del conto economico" : "manca tutto quello che sta sotto l'EBITDA"}
                </td>
              </tr>
              <tr>
                <td>+ Costi non deducibili (regole TUIR sulle categorie)</td>
                <td className="num">{eur(s.totaleVariazioniIres)}</td>
                <td className="muted" style={{ fontSize: 12 }}>la tabella qui sopra</td>
              </tr>
              <tr>
                <td>+ Ammortamenti eccedenti i coefficienti fiscali</td>
                <td className={`num ${ammortamentiIndeducibili === undefined ? "muted" : ""}`}>
                  {ammortamentiIndeducibili === undefined ? "non comunicato" : eur(s.variazioneAmmortamenti)}
                </td>
                <td className="muted" style={{ fontSize: 12 }}>
                  {ammortamentiIndeducibili === undefined ? (
                    <>
                      il gestionale non li può vedere: in banca gli ammortamenti non passano. Il campo è in{" "}
                      <Link href={`/conto-economico?anno=${anno}`} style={{ color: "var(--blue)" }}>Conto economico</Link>
                    </>
                  ) : (
                    "comunicato dal commercialista"
                  )}
                </td>
              </tr>
              <tr className="tot">
                <td>Reddito prima delle perdite pregresse</td>
                <td className="num">{eur(s.redditoLordo)}</td>
                <td />
              </tr>
              <tr>
                <td>− Perdite fiscali di esercizi precedenti</td>
                <td className={`num ${perditePregresse === undefined ? "muted" : ""}`}>
                  {perditePregresse === undefined ? "non comunicate" : `− ${eur(s.perditeUsate)}`}
                </td>
                <td className="muted" style={{ fontSize: 12 }}>
                  {perditePregresse === undefined ? (
                    <>
                      abbattono l&apos;imponibile fino all&apos;80%: finché mancano, l&apos;IRES qui è un{" "}
                      <strong>massimo</strong>. Il campo è in{" "}
                      <Link href={`/conto-economico?anno=${anno}`} style={{ color: "var(--blue)" }}>Conto economico</Link>
                    </>
                  ) : (
                    `su ${eur(s.perditeDisponibili)} disponibili — tetto dell'80% (art. 84 TUIR); ne restano ${eur(s.perditeResidue)}`
                  )}
                </td>
              </tr>
              <tr className="tot">
                <td>Reddito imponibile IRES</td>
                <td className="num">{eur(s.redditoImponibile)}</td>
                <td className="muted" style={{ fontSize: 12 }}>× {ALIQUOTA_IRES}% = {eur(s.ires)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <p className="page-caption" style={{ marginTop: 12 }}>
        <strong>Le perdite non azzerano l&apos;IRES</strong>: si usano fino all&apos;80% dell&apos;imponibile
        (art. 84 TUIR), quindi anche con perdite più grandi del reddito un quinto resta tassato. E valgono solo
        sull&apos;IRES: <strong>l&apos;IRAP si paga lo stesso</strong>, perché ha una base sua che non parte
        dall&apos;utile.
      </p>

      <p className="page-caption" style={{ marginTop: 12 }}>
        Le percentuali sono le regole ordinarie del TUIR applicate alle categorie del{" "}
        <Link href="/cfo" style={{ color: "var(--blue)" }}>CFO</Link>: è il motivo per cui classificare bene una
        spesa non serve solo al margine. Una cena di lavoro finita fra i costi ordinari si deduce al 100% invece
        che al 75%, e la differenza la paga l&apos;azienda con gli interessi.
      </p>

      <h2 className="section-title">IVA — quanto mettere da parte</h2>
      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">IVA incassata sulle vendite</div>
          <div className="kpi-value">{eur(iva.totaleDebito)}</div>
          <div className="kpi-sub">a debito</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">IVA pagata e detraibile</div>
          <div className="kpi-value">{eur(iva.totaleCredito)}</div>
          <div className="kpi-sub">a credito, sugli acquisti</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Da versare</div>
          <div className={`kpi-value ${iva.daVersare > 0 ? "neg" : "pos"}`}>{eur(iva.daVersare)}</div>
          <div className="kpi-sub">{iva.daVersare > 0 ? "esce dalla cassa" : "credito: si porta al periodo dopo"}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Da accantonare al mese</div>
          <div className="kpi-value neg">{eur(iva.accantonamentoMensile)}</div>
          <div className="kpi-sub">per non arrivare scoperti al 16</div>
        </div>
      </div>

      <div className="card tight" style={{ marginBottom: 12 }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>IVA a debito — da cosa nasce</th>
                <th className="num">Imponibile</th>
                <th className="num">IVA</th>
                <th>Perché</th>
              </tr>
            </thead>
            <tbody>
              {iva.debito.map((r) => (
                <tr key={r.voce}>
                  <td style={{ fontWeight: 500 }}>{r.voce}</td>
                  <td className="num muted">{eur(r.imponibile)}</td>
                  <td className="num" style={{ fontWeight: 600 }}>{eur(r.iva)}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{r.nota}</td>
                </tr>
              ))}
              <tr className="tot">
                <td>Totale a debito</td>
                <td className="num" />
                <td className="num">{eur(iva.totaleDebito)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="card tight">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>IVA a credito — quanto si detrae</th>
                <th className="num">Speso (IVA inclusa)</th>
                <th className="num">Aliquota</th>
                <th className="num">IVA detraibile</th>
                <th>Perché</th>
              </tr>
            </thead>
            <tbody>
              {iva.credito.map((r) => (
                <tr key={r.voce}>
                  <td style={{ fontWeight: 500 }}>{r.voce}</td>
                  <td className="num muted">{eur(r.imponibile + r.iva)}</td>
                  {/* L'aliquota si vede: un credito basso su una categoria
                      grossa è una scelta (i fiori stanno al 10%), non un
                      errore di conto, e senza questa colonna sembra l'altro. */}
                  <td
                    className="num"
                    style={r.aliquota !== ALIQUOTA_IVA ? { fontWeight: 600, color: "var(--gold)" } : { color: "var(--muted)" }}
                  >
                    {r.aliquota}%
                  </td>
                  <td className="num" style={{ fontWeight: 600 }}>{eur(r.iva)}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{r.nota}</td>
                </tr>
              ))}
              <tr className="tot">
                <td>Totale a credito</td>
                <td className="num" />
                <td className="num" />
                <td className="num">{eur(iva.totaleCredito)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <p className="page-caption" style={{ marginTop: 12 }}>
        <strong>L&apos;IVA non è un costo</strong> e non compare nel conto economico: è denaro incassato per conto
        dello Stato che va riversato. Ma <strong>è cassa che esce</strong>, e un&apos;azienda che la spende
        credendola sua si trova senza soldi il 16. Le categorie con IVA indetraibile — stipendi, tributi, banca,
        rappresentanza, quota partner — non compaiono nella seconda tabella: su quelle non c&apos;è niente da
        detrarre.
      </p>
      <div className="card" style={{ marginTop: 12 }}>
        <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 8 }}>
          {iva.avvertenze.map((a, i) => (
            <li key={i} className="muted" style={{ fontSize: 13 }}>{a.split("**").join("")}</li>
          ))}
        </ul>
      </div>

      <h2 className="section-title">Cosa questa stima non sa</h2>
      <div className="card">
        <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 8 }}>
          {s.avvertenze.map((a, i) => (
            <li key={i} className="muted" style={{ fontSize: 13 }}>
              {a.replace(/\*\*/g, "")}
            </li>
          ))}
        </ul>
      </div>
      <p className="page-caption" style={{ marginTop: 12 }}>
        <strong>Non sostituisce il commercialista</strong>: dice l&apos;ordine di grandezza prima che arrivi il
        conto, che è la cosa che serve per non trovarsi un F24 a giugno senza averlo messo da parte.
      </p>
    </>
  );
}
