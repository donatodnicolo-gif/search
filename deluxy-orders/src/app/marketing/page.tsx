import Link from "next/link";
import { euro } from "@/lib/ordini";
import { brandConColore } from "@/lib/brand";
import { nomeCanale } from "@/lib/marketing";
import { venditePerCanale } from "@/lib/canali";
import {
  GRANULARITA,
  type Granularita,
  MESI_BREVI,
  anniConOrdini,
  annoMeseItaliano,
  chiaveGiorno,
  finePeriodo,
  giorniTrascorsi,
  inizioGiornoItaliano,
  inizioPeriodo,
  MS_IN_GIORNO,
  nomeIntervallo,
  nomePeriodo,
  saltoAnno,
  saltoMese,
  variazione,
} from "@/lib/analisi";

export const dynamic = "force-dynamic";

// MARKETING — quanto vende ogni canale di provenienza.
//
// Risponde a una domanda sola, che però ha due metà: **quanto ha venduto** un
// canale e **che tipo di clienti** ha portato. Un canale che porta solo gente
// che tornava già non sta acquistando niente: sta rifatturando la fedeltà, e in
// una tabella di soli euro sembrerebbe il migliore di tutti.
//
// Quello che qui NON c'è, e va detto: la **spesa**. Quanto è costato ogni canale
// lo sa l'app Marketing (deluxy-marketing), non il registro degli ordini. Finché
// non si collegano, questa pagina dice il fatturato per canale, non il ritorno.

const MAX_CAMPAGNE = 20;
const MAX_SORGENTI = 15;

function num(n: number, decimali = 0): string {
  return n.toLocaleString("it-IT", { minimumFractionDigits: decimali, maximumFractionDigits: decimali });
}

function pct(n: number, decimali = 1): string {
  return `${num(n, decimali)}%`;
}

function Delta({ ora, prima }: { ora: number; prima: number }) {
  const v = variazione(ora, prima);
  if (v === null) return <span className="delta delta-nuovo">nuovo</span>;
  const fermo = Math.abs(v) < 0.05;
  return (
    <span className={`delta${fermo ? " delta-fermo" : v > 0 ? " delta-su" : " delta-giu"}`}>
      {fermo ? "=" : v > 0 ? "▲" : "▼"} {pct(Math.abs(v))}
    </span>
  );
}

export default async function Marketing({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const gran = (GRANULARITA.find((g) => g.chiave === sp.gran)?.chiave ?? "mese") as Granularita;
  const brand = sp.brand?.trim() || null;
  const adesso = new Date();

  // Lo stesso modo di dire «quando» delle pagine Analisi e Margini: tre schermate
  // che parlano dello stesso mestiere non possono chiedere il periodo in tre modi.
  const suMisuraDa = inizioGiornoItaliano(sp.da?.trim() ?? "");
  const suMisuraAInclusa = inizioGiornoItaliano(sp.a?.trim() ?? "");
  const suMisura =
    suMisuraDa && suMisuraAInclusa && suMisuraAInclusa >= suMisuraDa
      ? { inizio: suMisuraDa, fine: new Date(suMisuraAInclusa.getTime() + MS_IN_GIORNO) }
      : null;
  const salto = -Math.max(0, Number(sp.salto ?? "0") || 0);
  const inizio = suMisura ? suMisura.inizio : inizioPeriodo(adesso, gran, salto);
  const fine = suMisura ? suMisura.fine : finePeriodo(inizio, gran);
  const inCorso = fine > adesso;
  const fineOra = inCorso ? adesso : fine;

  // Il periodo di confronto, a parità di giorni quando quello scelto è in corso:
  // senza, a metà mese ogni canale sembrerebbe crollato.
  const durata = fine.getTime() - inizio.getTime();
  const inizioPrima = suMisura ? new Date(inizio.getTime() - durata) : inizioPeriodo(inizio, gran, -1);
  const finePrima = suMisura ? new Date(inizioPrima.getTime() + durata) : finePeriodo(inizioPrima, gran);
  const giorni = inCorso ? giorniTrascorsi(inizio, adesso) : null;
  const fineConfronto = giorni
    ? new Date(Math.min(inizioPrima.getTime() + giorni * MS_IN_GIORNO, finePrima.getTime()))
    : finePrima;

  const [negozi, ora, prima, anniRegistrati] = await Promise.all([
    brandConColore(),
    venditePerCanale(inizio, fineOra, brand),
    venditePerCanale(inizioPrima, fineConfronto, brand),
    anniConOrdini(),
  ]);

  const primaPerCanale = new Map(prima.canali.map((c) => [c.canale, c]));
  const totale = ora.totali.lordo;
  const pagati = ora.canali.filter((c) => c.pagato);
  const lordoPagato = pagati.reduce((s, c) => s + c.lordo, 0);
  const sconosciuto = ora.canali.find((c) => c.canale === "sconosciuto");
  const manuale = ora.canali.find((c) => c.canale === "manuale");
  const attribuito = totale - (sconosciuto?.lordo ?? 0);

  // Quanta parte degli ordini portava un link marcato, nei due periodi: è la
  // misura che dice se un confronto per canale è leale.
  const quotaTracciati = ora.totali.ordini ? (ora.totali.tracciati / ora.totali.ordini) * 100 : null;
  const quotaTracciatiPrima = prima.totali.ordini ? (prima.totali.tracciati / prima.totali.ordini) * 100 : null;

  const oraItaliana = annoMeseItaliano(adesso);
  const mostrato = annoMeseItaliano(inizio);
  const anni = [...new Set([...anniRegistrati, oraItaliana.anno, mostrato.anno])].sort((a, b) => b - a);
  const etichettaPeriodo = suMisura ? nomeIntervallo(inizio, fine) : nomePeriodo(inizio, gran);
  const etichettaConfronto = suMisura ? nomeIntervallo(inizioPrima, fineConfronto) : nomePeriodo(inizioPrima, gran);

  function link(extra: Record<string, string>): string {
    const q = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(extra)) {
      if (v) q.set(k, v);
      else q.delete(k);
    }
    const s = q.toString();
    return `/marketing${s ? `?${s}` : ""}`;
  }

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1 className="page-title">Marketing</h1>
          <p className="page-sub">
            Quanto vende ogni canale di provenienza, e <strong>che tipo di clienti</strong> porta: un canale che porta
            solo chi tornava già non sta acquistando niente.
          </p>
        </div>
      </div>

      {/* Periodo: le stesse scelte di Analisi e Margini */}
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
            {(["gran", "brand"] as const).map((k) => (sp[k] ? <input key={k} type="hidden" name={k} value={sp[k]} /> : null))}
            <label htmlFor="da">Dal</label>
            <input type="date" id="da" name="da" defaultValue={sp.da ?? ""} max={chiaveGiorno(adesso)} />
            <label htmlFor="a">al</label>
            <input type="date" id="a" name="a" defaultValue={sp.a ?? ""} max={chiaveGiorno(adesso)} />
            <button className="btn small" type="submit">Vedi</button>
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

        <p className="testo-guida" style={{ marginTop: 10 }}>
          Confronto con <strong>{etichettaConfronto}</strong>
          {inCorso ? `, fermato allo stesso giorno (${giorni} ${giorni === 1 ? "giorno" : "giorni"})` : ""}. Attribuzione
          al <strong>primo contatto</strong>: chi ci ha trovati con Google Ads e poi è tornato scrivendo
          l&apos;indirizzo resta Google Ads.
        </p>
      </div>

      <div className="griglia-kpi">
        <div className="kpi kpi-analisi" title="Venduto valido del periodo: annullati e rimborsati esclusi.">
          <div className="kpi-etichetta">Venduto del periodo</div>
          <div className="kpi-valore">{euro(totale)}</div>
          <Delta ora={totale} prima={prima.totali.lordo} />
        </div>
        <div className="kpi kpi-analisi" title="Quanto del venduto ha un canale di provenienza riconosciuto.">
          <div className="kpi-etichetta">Attribuito a un canale</div>
          <div className="kpi-valore">{totale > 0.005 ? pct((attribuito / totale) * 100, 0) : "—"}</div>
          <div className="testo-guida">{euro(attribuito)} su {euro(totale)}</div>
        </div>
        <div className="kpi kpi-analisi" title="Venduto arrivato dai canali che ci sono costati qualcosa: Google Ads, Shopping, inserzioni Meta.">
          <div className="kpi-etichetta">Dai canali a pagamento</div>
          <div className="kpi-valore">{euro(lordoPagato)}</div>
          <div className="testo-guida">{totale > 0.005 ? pct((lordoPagato / totale) * 100, 0) : "—"} del venduto</div>
        </div>
        <div className="kpi kpi-analisi" title="Ordini di chi non aveva mai comprato prima, su tutta la storia del registro.">
          <div className="kpi-etichetta">Ordini da clienti nuovi</div>
          <div className="kpi-valore">
            {ora.totali.ordini ? pct((ora.totali.primi / ora.totali.ordini) * 100, 0) : "—"}
          </div>
          <div className="testo-guida">
            {num(ora.totali.primi)} nuovi · {num(ora.totali.daRepeater)} di ritorno
          </div>
        </div>
      </div>

      {/* ⚠️ Avviso automatico: se nei due periodi i link erano marcati in modo
          diverso, le variazioni per canale dicono più del tracciamento che del
          mercato. Meglio scriverlo che lasciar leggere «+8.785%» come una
          notizia commerciale. */}
      {quotaTracciati != null && quotaTracciatiPrima != null && Math.abs(quotaTracciati - quotaTracciatiPrima) >= 8 && (
        <div className="avviso-nuovi" style={{ borderLeftColor: "var(--orange)" }}>
          <span className="cresce">
            <strong>Attenzione al confronto.</strong> In {etichettaPeriodo} il{" "}
            <strong>{pct(quotaTracciati, 0)}</strong> degli ordini arrivava da un link marcato
            (<code className="inline">utm_*</code>), in {etichettaConfronto} il{" "}
            <strong>{pct(quotaTracciatiPrima, 0)}</strong>. Quando cambia il modo di marcare i link, un canale può
            «crescere» perché prima i suoi ordini finivano in <em>Ricerca</em> o <em>Diretto</em>: le variazioni qui
            sotto vanno lette sapendolo.
          </span>
        </div>
      )}

      {/* Il cuore: quanto vale ogni canale */}
      <div className="scheda">
        <div className="scheda-titolo">Venduto per canale</div>
        <div className="tabella-wrap" style={{ marginTop: 10 }}>
          <table>
            <thead>
              <tr>
                <th>Canale</th>
                <th className="num">Venduto</th>
                <th className="num">Quota</th>
                <th className="num">Ordini</th>
                <th className="num">Scontrino</th>
                <th className="num">Clienti nuovi</th>
                <th className="num">Di ritorno</th>
              </tr>
            </thead>
            <tbody>
              {ora.canali.map((c) => {
                const p = primaPerCanale.get(c.canale);
                const scontrino = c.ordini ? c.lordo / c.ordini : 0;
                const scontrinoPrima = p?.ordini ? p.lordo / p.ordini : 0;
                const attribuiti = c.primi + c.daRepeater;
                return (
                  <tr key={c.canale}>
                    <td>
                      <span style={{ marginRight: 6 }}>{c.simbolo}</span>
                      {c.nome}
                      {c.pagato && <div className="cella-muta">a pagamento</div>}
                    </td>
                    <td className="cella-num">
                      {euro(c.lordo)}
                      <Delta ora={c.lordo} prima={p?.lordo ?? 0} />
                    </td>
                    <td className="cella-num">{totale > 0.005 ? pct((c.lordo / totale) * 100) : "—"}</td>
                    <td className="cella-num">
                      {num(c.ordini)}
                      <Delta ora={c.ordini} prima={p?.ordini ?? 0} />
                    </td>
                    <td className="cella-num">
                      {euro(scontrino)}
                      <Delta ora={scontrino} prima={scontrinoPrima} />
                    </td>
                    <td className="cella-num">
                      {attribuiti ? pct((c.primi / attribuiti) * 100, 0) : "—"}
                      <div className="cella-muta">{num(c.primi)}</div>
                    </td>
                    <td className="cella-num">
                      {attribuiti ? pct((c.daRepeater / attribuiti) * 100, 0) : "—"}
                      <div className="cella-muta">{num(c.daRepeater)}</div>
                    </td>
                  </tr>
                );
              })}
              {ora.canali.length === 0 && (
                <tr>
                  <td colSpan={7} className="cella-muta">Nessun ordine in questo periodo.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="testo-guida" style={{ marginTop: 10 }}>
          {manuale && manuale.lordo > 0 && (
            <>
              <strong>«Ordine creato a mano» non è un canale di traffico</strong>: sono {num(manuale.ordini)} ordini per{" "}
              {euro(manuale.lordo)} presi al telefono, su WhatsApp o di persona. Sta in tabella perché è venduto vero,
              ma non va confrontato con Google.{" "}
            </>
          )}
          {sconosciuto && sconosciuto.lordo > 0 && (
            <>
              <strong>Provenienza sconosciuta</strong>: {num(sconosciuto.ordini)} ordini per {euro(sconosciuto.lordo)}.
              Shopify non ha associato nessuna visita — capita agli ordini vecchi e a quelli creati a mano. Non sono
              stati spalmati sugli altri canali: sarebbe un numero comodo e falso.
            </>
          )}
        </p>
      </div>

      {/* Lo strumento dietro il canale: è qui che si vede Klaviyo */}
      <div className="scheda">
        <div className="scheda-titolo">Da quale strumento arrivano</div>
        <p className="testo-guida" style={{ marginTop: 6 }}>
          È <code className="inline">utm_source</code> — quello che c&apos;è scritto nel link — oppure il sito da cui è
          arrivata la persona. Sta <strong>sotto</strong> il canale: «klaviyo» è un modo di fare email, «adwords» è
          Google Ads. Serve a rispondere a «quanto ci porta Klaviyo?», che il canale da solo non dice.
        </p>
        <div className="tabella-wrap" style={{ marginTop: 10 }}>
          <table>
            <thead>
              <tr>
                <th>Strumento / sito</th>
                <th>Canale</th>
                <th className="num">Venduto</th>
                <th className="num">Ordini</th>
                <th className="num">Clienti nuovi</th>
              </tr>
            </thead>
            <tbody>
              {ora.sorgenti.slice(0, MAX_SORGENTI).map((s) => (
                <tr key={`${s.sorgente}-${s.canale}`}>
                  <td>{s.sorgente === "(non indicata)" ? "Nessun link tracciato" : s.sorgente}</td>
                  <td className="cella-muta">{s.canale === "sconosciuto" ? "—" : nomeCanale(s.canale)}</td>
                  <td className="cella-num">{euro(s.lordo)}</td>
                  <td className="cella-num">{num(s.ordini)}</td>
                  <td className="cella-num">{s.ordini ? pct((s.primi / s.ordini) * 100, 0) : "—"}</td>
                </tr>
              ))}
              {ora.sorgenti.length === 0 && (
                <tr>
                  <td colSpan={5} className="cella-muta">Nessuna sorgente in questo periodo.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="testo-guida" style={{ marginTop: 8 }}>
          «Nessun link tracciato» è la riga più grande quasi sempre, ed è normale: chi arriva da Google o scrivendo
          l&apos;indirizzo non porta nessun <code className="inline">utm_*</code>. Quella riga non è un problema di
          Klaviyo o di Google Ads, che i loro link li marcano.
        </p>
      </div>

      {/* Le campagne, per riconciliare con le dashboard pubblicitarie */}
      <div className="scheda">
        <div className="scheda-titolo">Campagne</div>
        <div className="tabella-wrap" style={{ marginTop: 10 }}>
          <table>
            <thead>
              <tr>
                <th>Campagna</th>
                <th>Canale</th>
                <th className="num">Venduto</th>
                <th className="num">Ordini</th>
                <th className="num">Clienti nuovi</th>
              </tr>
            </thead>
            <tbody>
              {ora.campagne.slice(0, MAX_CAMPAGNE).map((c) => (
                <tr key={`${c.campagna}-${c.canale}`}>
                  <td style={{ maxWidth: 380, overflow: "hidden", textOverflow: "ellipsis" }}>{c.campagna}</td>
                  <td className="cella-muta">{c.canale === "sconosciuto" ? "—" : nomeCanale(c.canale)}</td>
                  <td className="cella-num">{euro(c.lordo)}</td>
                  <td className="cella-num">{num(c.ordini)}</td>
                  <td className="cella-num">{c.ordini ? pct((c.primi / c.ordini) * 100, 0) : "—"}</td>
                </tr>
              ))}
              {ora.campagne.length === 0 && (
                <tr>
                  <td colSpan={5} className="cella-muta">
                    Nessuna campagna con un nome in questo periodo: i link non portavano <code className="inline">utm_campaign</code>.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="testo-guida">
        Qui c&apos;è quanto <strong>ha incassato</strong> ogni canale, non quanto è <strong>costato</strong>: la spesa
        pubblicitaria vive nell&apos;app Marketing (deluxy-marketing), e finché le due non si parlano questa pagina
        misura il fatturato per canale, non il ritorno. Gli stessi numeri escono già dall&apos;API{" "}
        <code className="inline">/api/v1/marketing</code>, che l&apos;app ADV legge. Fuori dal conto restano annullati e
        rimborsati: {num(ora.esclusi.ordini)} ordini per {euro(ora.esclusi.lordo)}.{" "}
        <Link href="/analisi?dim=canale" className="ritorno">
          In Analisi
        </Link>{" "}
        lo stesso taglio si incrocia con tutti gli altri KPI.
      </p>
    </main>
  );
}
