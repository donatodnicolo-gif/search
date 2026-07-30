import Link from "next/link";
import { euro, dataBreve } from "@/lib/ordini";
import { brandConColore } from "@/lib/brand";
import { nomeCategoria } from "@/lib/categorie";
import { nomeUrgenza } from "@/lib/urgenza";
import { nomeCanale } from "@/lib/marketing";
import {
  GRANULARITA,
  type Granularita,
  MESI_BREVI,
  anniConOrdini,
  annoMeseItaliano,
  chiaveGiorno,
  finePeriodo,
  inizioGiornoItaliano,
  inizioPeriodo,
  MS_IN_GIORNO,
  nomeIntervallo,
  nomePeriodo,
  saltoAnno,
  saltoMese,
} from "@/lib/analisi";
import {
  DIMENSIONI_MARGINE,
  calcola,
  dimensioneMargine,
  misure,
  perDimensione,
  sopraQuota,
} from "@/lib/margini";
import { quotaFornitore } from "@/lib/controllo";

export const dynamic = "force-dynamic";

const MAX_RIGHE = 25;

// MARGINI — quanto resta dopo aver pagato il fornitore.
//
// La regola della pagina: **si misura solo dove il costo c'è**. Il numero grande
// in cima è il margine vero sugli ordini che hanno un costo registrato, e
// accanto c'è sempre su quanti ordini è misurato: un margine del 47% calcolato su
// un ordine su venti è un'informazione diversa da un margine del 47% su tutti.
// Il «margine atteso» è dichiarato come ipotesi, calcolato alla quota di
// riferimento, e serve solo a dare l'ordine di grandezza di ciò che non è ancora
// misurato.

function num(n: number, decimali = 0): string {
  return n.toLocaleString("it-IT", { minimumFractionDigits: decimali, maximumFractionDigits: decimali });
}

function pct(n: number, decimali = 1): string {
  return `${num(n, decimali)}%`;
}

function etichetta(dimensione: string, valore: string): string {
  if (dimensione === "categoria") return valore === "non-classificato" ? "Non classificato" : nomeCategoria(valore);
  if (dimensione === "urgenza") return valore === "senza-data" ? "Consegna non indicata" : nomeUrgenza(valore);
  if (dimensione === "canale") return valore === "sconosciuto" ? "Provenienza sconosciuta" : nomeCanale(valore);
  if (dimensione === "mese") {
    const [anno, mese] = valore.split("-");
    return `${MESI_BREVI[Number(mese) - 1] ?? mese} ${anno}`;
  }
  return valore;
}

function coloreMargine(p: number, quota: number): string {
  // Il verso «buono» è quello dell'accordo: se paghiamo la quota attesa, il
  // margine è 100 − quota. Sopra è bene, sotto è male, e il colore lo dice.
  const atteso = 100 - quota;
  if (p >= atteso - 0.5) return "var(--green)";
  if (p >= atteso - 10) return "var(--gold-strong)";
  return "var(--red)";
}

export default async function Margini({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const gran = (GRANULARITA.find((g) => g.chiave === sp.gran)?.chiave ?? "mese") as Granularita;
  const brand = sp.brand?.trim() || null;
  const adesso = new Date();

  // Stesso modo di dire il periodo della pagina Analisi — comprese le pillole di
  // anni e mesi: due pagine che parlano dello stesso mestiere non possono
  // chiedere «quando» in due modi diversi.
  const suMisuraDa = inizioGiornoItaliano(sp.da?.trim() ?? "");
  const suMisuraAInclusa = inizioGiornoItaliano(sp.a?.trim() ?? "");
  const suMisura =
    suMisuraDa && suMisuraAInclusa && suMisuraAInclusa >= suMisuraDa
      ? { inizio: suMisuraDa, fine: new Date(suMisuraAInclusa.getTime() + MS_IN_GIORNO) }
      : null;
  const salto = -Math.max(0, Number(sp.salto ?? "0") || 0);
  const inizio = suMisura ? suMisura.inizio : inizioPeriodo(adesso, gran, salto);
  const fine = suMisura ? suMisura.fine : finePeriodo(inizio, gran);
  const fineOra = fine > adesso ? adesso : fine;

  const dim = dimensioneMargine(sp.dim);
  const quota = await quotaFornitore();

  const [negozi, m, righeDim, coda, anniRegistrati] = await Promise.all([
    brandConColore(),
    misure(inizio, fineOra, brand, quota),
    perDimensione(dim, inizio, fineOra, brand, quota),
    sopraQuota(inizio, fineOra, brand, quota, 15),
    anniConOrdini(),
  ]);

  const k = calcola(m, quota);
  const oraItaliana = annoMeseItaliano(adesso);
  const mostrato = annoMeseItaliano(inizio);
  const anni = [...new Set([...anniRegistrati, oraItaliana.anno, mostrato.anno])].sort((a, b) => b - a);

  // Le righe della dimensione: solo quelle che hanno un costo misurato, perché
  // una riga senza costo non ha un margine da mostrare — avrebbe margine 0 e
  // sembrerebbe una perdita secca.
  const righe = righeDim
    .map((r) => ({ etichetta: r.etichetta, k: calcola(r, quota) }))
    .filter((r) => r.k.ordiniConCosto > 0)
    .sort((a, b) => b.k.margine - a.k.margine);
  const senzaMisura = righeDim.filter((r) => r.ordiniConCosto === 0);
  const mostrate = righe.slice(0, MAX_RIGHE);

  const etichettaPeriodo = suMisura ? nomeIntervallo(inizio, fine) : nomePeriodo(inizio, gran);

  function link(extra: Record<string, string>): string {
    const q = new URLSearchParams(sp);
    for (const [k2, v] of Object.entries(extra)) {
      if (v) q.set(k2, v);
      else q.delete(k2);
    }
    const s = q.toString();
    return `/margini${s ? `?${s}` : ""}`;
  }

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1 className="page-title">Margini</h1>
          <p className="page-sub">
            Quanto resta di un ordine dopo aver pagato il fornitore. Si misura <strong>solo dove il costo c&apos;è</strong>:
            accanto a ogni numero c&apos;è su quanti ordini è calcolato.
          </p>
        </div>
      </div>

      {/* Periodo: le stesse scelte della pagina Analisi */}
      <div className="scheda">
        <div className="filtri-analisi">
          <div className="scelta-vista" role="group" aria-label="Granularità">
            {GRANULARITA.map((g) => (
              <Link key={g.chiave} className={`vista-opz${gran === g.chiave ? " attiva" : ""}`} href={link({ gran: g.chiave, salto: "" })}>
                {g.nome}
              </Link>
            ))}
          </div>
          <div className="navigazione-periodo">
            {!suMisura && (
              <Link className="btn btn-secondario small" href={link({ salto: String(-salto + 1) })}>
                ←
              </Link>
            )}
            <strong>{etichettaPeriodo}</strong>
            {!suMisura && salto < 0 && (
              <Link className="btn btn-secondario small" href={link({ salto: String(-salto - 1) })}>
                →
              </Link>
            )}
          </div>
          <span className="scelta-vista" role="group" aria-label="Negozio">
            <Link className={`vista-opz${!brand ? " attiva" : ""}`} href={link({ brand: "" })}>
              Tutti
            </Link>
            {negozi.map((n) => (
              <Link key={n.nome} className={`vista-opz${brand === n.nome ? " attiva" : ""}`} href={link({ brand: n.nome })}>
                {n.nome}
              </Link>
            ))}
          </span>
          <form className="periodo-a-mano" method="get">
            {(["gran", "brand", "dim"] as const).map((k2) => (sp[k2] ? <input key={k2} type="hidden" name={k2} value={sp[k2]} /> : null))}
            <label htmlFor="da">Dal</label>
            <input type="date" id="da" name="da" defaultValue={sp.da ?? ""} max={chiaveGiorno(adesso)} />
            <label htmlFor="a">al</label>
            <input type="date" id="a" name="a" defaultValue={sp.a ?? ""} max={chiaveGiorno(adesso)} />
            <button className="btn small" type="submit">
              Vedi
            </button>
            {suMisura && (
              <Link className="btn btn-secondario small" href={link({ da: "", a: "" })}>
                Torna ai mesi
              </Link>
            )}
          </form>
        </div>

        <div className="scelta-rapida">
          <div className="riga-rapida">
            <span className="rapida-etichetta">Anno</span>
            {anni.map((a) => {
              const attivo = !suMisura && gran === "anno" && mostrato.anno === a;
              const contesto = !attivo && mostrato.anno === a;
              return (
                <Link
                  key={a}
                  className={`periodo-opz${attivo ? " attiva" : contesto ? " contesto" : ""}`}
                  href={link({ gran: "anno", salto: String(Math.max(0, saltoAnno(adesso, a))), da: "", a: "" })}
                >
                  {a}
                </Link>
              );
            })}
          </div>
          <div className="riga-rapida">
            <span className="rapida-etichetta">Mesi {mostrato.anno}</span>
            {MESI_BREVI.map((nome, i) => {
              const indietro = saltoMese(adesso, mostrato.anno, i + 1);
              if (indietro < 0) {
                return (
                  <span key={nome} className="periodo-opz futuro" title="Mese non ancora cominciato">
                    {nome}
                  </span>
                );
              }
              const attivo = !suMisura && gran === "mese" && mostrato.mese === i + 1;
              return (
                <Link key={nome} className={`periodo-opz${attivo ? " attiva" : ""}`} href={link({ gran: "mese", salto: String(indietro), da: "", a: "" })}>
                  {nome}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* I numeri del margine misurato */}
      <div className="griglia-kpi">
        <div className="kpi kpi-analisi" title="Venduto degli ordini con un costo registrato, meno il costo. Gli altri ordini non entrano.">
          <div className="kpi-etichetta">Margine misurato</div>
          <div className="kpi-valore" style={{ color: k.margine >= 0 ? "var(--green)" : "var(--red)" }}>
            {euro(k.margine)}
          </div>
          <div className="testo-guida">su {euro(k.lordoConCosto)} di venduto misurato</div>
        </div>
        <div className="kpi kpi-analisi" title="Margine in percentuale del venduto misurato. Con la quota attesa dovrebbe stare intorno a 100 − quota.">
          <div className="kpi-etichetta">Margine %</div>
          <div className="kpi-valore" style={{ color: coloreMargine(k.pctMargine, quota) }}>
            {pct(k.pctMargine)}
          </div>
          <div className="testo-guida">atteso {pct(100 - quota, 0)} con la quota del {quota}%</div>
        </div>
        <div className="kpi kpi-analisi" title="Quanto abbiamo pagato al fornitore in percentuale del valore dell'ordine.">
          <div className="kpi-etichetta">Costo fornitore</div>
          <div className="kpi-valore">{euro(k.costo)}</div>
          <div className="testo-guida">{pct(k.costoMedioPct)} del venduto misurato</div>
        </div>
        <div className="kpi kpi-analisi" title="Quanti ordini del periodo hanno un costo registrato: è la parte del venduto su cui il margine è un fatto e non un'ipotesi.">
          <div className="kpi-etichetta">Copertura della misura</div>
          <div className="kpi-valore" style={{ color: k.coperturaLordo >= 80 ? "var(--green)" : k.coperturaLordo >= 30 ? "var(--gold-strong)" : "var(--orange)" }}>
            {pct(k.coperturaLordo, 0)}
          </div>
          <div className="testo-guida">
            {num(k.ordiniConCosto)} ordini su {num(k.ordiniValidi)} ({pct(k.coperturaOrdini, 0)})
          </div>
        </div>
        <div className="kpi kpi-analisi" title="Ipotesi, non una misura: è il margine che uscirebbe se OGNI ordine del periodo costasse la quota di riferimento.">
          <div className="kpi-etichetta">Margine atteso (ipotesi)</div>
          <div className="kpi-valore" style={{ color: "var(--text-secondary)" }}>{euro(k.margineAtteso)}</div>
          <div className="testo-guida">su tutto il venduto valido, {euro(k.lordoValido)}</div>
        </div>
        <div className="kpi kpi-analisi" title="Ordini pagati sopra la quota attesa: sono quelli che mangiano il margine.">
          <div className="kpi-etichetta">Sopra la quota</div>
          <div className="kpi-valore" style={{ color: k.sopraQuota ? "var(--red)" : "var(--green)" }}>
            {num(k.sopraQuota)}
          </div>
          <div className="testo-guida">{num(k.sottoQuota)} entro la quota del {quota}%</div>
        </div>
      </div>

      {/* Cosa NON è misurato: sta scritto, non nascosto */}
      {k.coperturaLordo < 99.5 && (
        <div className="scheda">
          <div className="scheda-titolo">Cosa non è misurato</div>
          <p className="testo-guida" style={{ marginTop: 6 }}>
            Su <strong>{num(k.ordiniValidi)}</strong> ordini validi del periodo, <strong>{num(k.ordiniValidi - k.ordiniConCosto)}</strong>{" "}
            non hanno un costo fornitore registrato: {euro(k.lordoValido - k.lordoConCosto)} di venduto su cui il
            margine <strong>non si sa</strong>. Non è stato stimato: una media spalmata darebbe un numero preciso e
            falso, e questa pagina servirebbe a prendere decisioni sbagliate con più fiducia.
          </p>
          <p className="testo-guida">
            Il costo entra dal <Link href="/controllo" className="ritorno">Controllo</Link>: si abbina l&apos;addebito in
            banca all&apos;ordine, in automatico dove il numero è in causale, a mano dove no.
          </p>
        </div>
      )}

      {/* Dove si fa e dove si perde */}
      <div className="scheda">
        <div className="scheda-titolo">Dove si fa il margine</div>
        <div className="scelta-vista" role="group" aria-label="Dimensione" style={{ flexWrap: "wrap" }}>
          {DIMENSIONI_MARGINE.map((d) => (
            <Link key={d.chiave} className={`vista-opz${dim.chiave === d.chiave ? " attiva" : ""}`} href={link({ dim: d.chiave })} title={d.spiega}>
              {d.nome}
            </Link>
          ))}
        </div>
        <p className="testo-guida" style={{ marginTop: 8 }}>
          {dim.spiega} Ogni riga è calcolata <strong>solo sui suoi ordini con un costo</strong>, e la colonna
          «misurato su» dice quanti sono: due righe con lo stesso margine ma coperture diverse non valgono uguale.
        </p>

        <div className="tabella-wrap" style={{ marginTop: 12 }}>
          <table>
            <thead>
              <tr>
                <th>{dim.nome}</th>
                <th className="num">Margine</th>
                <th className="num">Margine %</th>
                <th className="num">Venduto misurato</th>
                <th className="num">Costo</th>
                <th className="num">Costo %</th>
                <th className="num">Misurato su</th>
                <th className="num">Sopra quota</th>
              </tr>
            </thead>
            <tbody>
              {mostrate.map((r) => (
                <tr key={r.etichetta}>
                  <td>{etichetta(dim.chiave, r.etichetta)}</td>
                  <td className="cella-num" style={{ fontWeight: 600, color: r.k.margine >= 0 ? "var(--green)" : "var(--red)" }}>
                    {euro(r.k.margine)}
                  </td>
                  <td className="cella-num" style={{ color: coloreMargine(r.k.pctMargine, quota) }}>{pct(r.k.pctMargine)}</td>
                  <td className="cella-num">{euro(r.k.lordoConCosto)}</td>
                  <td className="cella-num">{euro(r.k.costo)}</td>
                  <td className="cella-num">{pct(r.k.costoMedioPct)}</td>
                  <td className="cella-num">
                    {num(r.k.ordiniConCosto)}/{num(r.k.ordiniValidi)}
                    <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{pct(r.k.coperturaOrdini, 0)}</div>
                  </td>
                  <td className="cella-num" style={{ color: r.k.sopraQuota ? "var(--red)" : undefined }}>{num(r.k.sopraQuota)}</td>
                </tr>
              ))}
              {mostrate.length === 0 && (
                <tr>
                  <td colSpan={8} className="cella-muta">
                    Nessun ordine con un costo registrato in questo periodo: il margine non si può misurare.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {senzaMisura.length > 0 && (
          <p className="testo-guida" style={{ marginTop: 8 }}>
            Altre <strong>{senzaMisura.length}</strong> righe esistono nel periodo ma non hanno nemmeno un ordine con
            un costo: non compaiono perché non avrebbero un margine da mostrare, non perché valgono zero.
          </p>
        )}
        {righe.length > MAX_RIGHE && (
          <p className="testo-guida" style={{ marginTop: 8 }}>
            Sono mostrate le {MAX_RIGHE} righe col margine più alto delle {righe.length} misurate.
          </p>
        )}
        {dim.nota && <p className="testo-guida" style={{ marginTop: 8 }}>{dim.nota}</p>}
      </div>

      {/* La coda di lavoro: dove abbiamo pagato più del dovuto */}
      <div className="scheda">
        <div className="scheda-titolo">Pagati sopra la quota — da guardare</div>
        <p className="testo-guida" style={{ marginTop: 6 }}>
          Ordinati per <strong>quanto ci sono costati in più</strong> della quota del {quota}%, non per percentuale: il
          90% su un ordine da 30 € pesa meno del 70% su uno da 900 €.
        </p>
        <div className="tabella-wrap" style={{ marginTop: 10 }}>
          <table>
            <thead>
              <tr>
                <th>Ordine</th>
                <th>Data</th>
                <th>Fornitore</th>
                <th className="num">Valore</th>
                <th className="num">Pagato</th>
                <th className="num">Quota pagata</th>
                <th className="num">In più</th>
              </tr>
            </thead>
            <tbody>
              {coda.map((o) => (
                <tr key={o.id}>
                  <td>
                    <Link href={`/ordini/${o.id}`} className="cella-nome">
                      {o.numero}
                    </Link>
                    <div className="cella-sub">{o.brand}</div>
                  </td>
                  <td className="cella-muta">{dataBreve(o.data)}</td>
                  <td style={{ fontSize: 12.5 }}>
                    {o.costoFornitoreNome ?? "—"}
                    {o.costoDa === "causale" && <div className="cella-muta">agganciato in automatico</div>}
                    {o.costoDa === "finance" && <div className="cella-muta">arrivato da Finance</div>}
                  </td>
                  <td className="cella-num">{euro(o.totale)}</td>
                  <td className="cella-num">{euro(o.costoFornitore)}</td>
                  <td className="cella-num" style={{ color: "var(--red)", fontWeight: 600 }}>{pct(o.pct, 0)}</td>
                  <td className="cella-num" style={{ color: "var(--red)" }}>{euro(o.differenza)}</td>
                </tr>
              ))}
              {coda.length === 0 && (
                <tr>
                  <td colSpan={7} className="cella-muta">
                    Nessun ordine pagato sopra la quota in questo periodo.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="testo-guida">
        Il <strong>lordo è lordo</strong>: <code>totale</code> è il totale Shopify, IVA e spedizione incluse.
        L&apos;aliquota non sta sull&apos;ordine (fiori e torte non hanno la stessa), quindi qui non si scorpora niente
        e questo è un margine <strong>sul lordo</strong>. Chi deve fare il conto netto lo scorpora e lo dichiara.
      </p>
    </main>
  );
}
