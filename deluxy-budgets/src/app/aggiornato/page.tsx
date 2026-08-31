import Link from "next/link";
import { Fragment } from "react";
import { caricaAnno, ANNO_CORRENTE } from "@/lib/calc";
import { caricaConsuntivo, SLUG_D2C } from "@/lib/consuntivo";
import { raggruppa, sommaMesi } from "@/lib/venduto";
import { abbinaMaison, fetchRicaviD2C, fetchRicaviIntervallo } from "@/lib/orders";
import { fetchSpesaPerBrand } from "@/lib/marketing";
import { fetchOrdiniChiusiMese } from "@/lib/scout";
import { fetchRicaviServizi, fetchRicaviServiziIntervallo } from "@/lib/consegne";
import { eur, pct, MESI } from "@/lib/format";

export const dynamic = "force-dynamic";

// LA PAGINA D'APERTURA (30/08/2026, richiesta dell'utente): «all'apertura
// invece che da fare tieni aggiornato per questa settimana, mese, mese scorso,
// trimestre, anno. Su come stanno andando le cose: vendite, margini, conto
// economico, risultati maison e risultati commerciali».
//
// Chi apre l'app chiede come sta andando, non cosa manca da scrivere: «Da
// fare» resta nel menu, questa risponde alla domanda d'apertura.
//
// ⚠️ **La settimana ha un passo diverso dal resto, ed è dichiarato.** Le
// vendite arrivano da Orders con l'intervallo di date esatto (al giorno); la
// banca e Finance hanno solo il MESE, quindi margini e conto economico nella
// vista settimanale non esistono — mostrarli «del mese» sotto il titolo
// «settimana» farebbe credere che siano della settimana. La vista lo scrive e
// rimanda al mese.

const VISTE = [
  { key: "settimana", label: "Questa settimana" },
  { key: "mese", label: "Questo mese" },
  { key: "mese-scorso", label: "Mese scorso" },
  { key: "trimestre", label: "Trimestre" },
  { key: "anno", label: "Anno" },
] as const;
type VistaKey = (typeof VISTE)[number]["key"];

const iso = (d: Date) => d.toISOString().slice(0, 10);

export default async function AggiornatoPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const sp = await searchParams;
  const vista: VistaKey = (VISTE.find((v) => v.key === sp.p)?.key ?? "settimana") as VistaKey;

  const oggi = new Date();
  const anno = oggi.getUTCFullYear();
  const meseInCorso = oggi.getUTCMonth() + 1;

  // ---- I mesi del periodo (per le viste a passo mensile) ----
  // «Mese scorso» a gennaio è dicembre dell'anno prima: si salta con un
  // cartello invece di mostrare l'anno sbagliato in silenzio.
  const mesiDi = (v: VistaKey): number[] => {
    if (v === "mese") return [meseInCorso];
    if (v === "mese-scorso") return meseInCorso > 1 ? [meseInCorso - 1] : [];
    if (v === "trimestre") {
      const dal = Math.floor((meseInCorso - 1) / 3) * 3 + 1;
      return Array.from({ length: meseInCorso - dal + 1 }, (_, i) => dal + i);
    }
    if (v === "anno") return Array.from({ length: meseInCorso }, (_, i) => i + 1);
    return [];
  };
  const mesi = mesiDi(vista);
  const parziale = mesi.includes(meseInCorso);
  const etichettaMesi =
    mesi.length === 0 ? "" : mesi.length === 1 ? MESI[mesi[0] - 1] : `${MESI[mesi[0] - 1]}–${MESI[mesi[mesi.length - 1] - 1]}`;

  // ---- Dati ----
  // Sempre l'anno del calendario: questa pagina risponde ad «adesso». Gli anni
  // passati si leggono dal Consuntivo, che ha il selettore.
  const dati = await caricaAnno(anno);

  if (vista === "settimana") {
    // Lunedì di questa settimana; `a` è esclusiva, quindi domani prende anche oggi.
    const lun = new Date(oggi);
    lun.setUTCDate(oggi.getUTCDate() - ((oggi.getUTCDay() + 6) % 7));
    const domani = new Date(oggi);
    domani.setUTCDate(oggi.getUTCDate() + 1);
    // Il paragone onesto: la STESSA porzione della settimana scorsa (da lunedì
    // allo stesso giorno), non la settimana scorsa intera — 3 giorni contro 7
    // sembrerebbero sempre un crollo.
    const lunPrec = new Date(lun);
    lunPrec.setUTCDate(lun.getUTCDate() - 7);
    const stessoPuntoPrec = new Date(domani);
    stessoPuntoPrec.setUTCDate(domani.getUTCDate() - 7);

    const [sett, settPrec, serviziSett] = await Promise.all([
      fetchRicaviIntervallo(iso(lun), iso(domani)),
      fetchRicaviIntervallo(iso(lunPrec), iso(stessoPuntoPrec)),
      // I SERVIZI della piattaforma sono l'unico ricavo commerciale che il
      // giorno lo sa davvero (30/08, domanda dell'utente: «in questa settimana
      // perché non compaiono i ricavi commerciali?»): le fatture di Finance
      // hanno il passo del mese, le consegne no.
      fetchRicaviServiziIntervallo(iso(lun), iso(domani)),
    ]);

    const giorni = Math.round((domani.getTime() - lun.getTime()) / 86400000);
    return (
      <>
        <Testata vista={vista} sotto={`da lunedì ${lun.getUTCDate()} ${MESI[lun.getUTCMonth()]} a oggi (${giorni} ${giorni === 1 ? "giorno" : "giorni"})`} />
        {!sett.ok ? (
          <div className="avviso-errore">Le vendite non arrivano: {sett.errore}</div>
        ) : (
          <>
            <div className="kpi-grid">
              <div className="kpi">
                <div className="kpi-label">Venduto della settimana</div>
                <div className="kpi-value">{eur(sett.dati.totali.lordo)}</div>
                <div className="kpi-sub">{sett.dati.totali.ordini} ordini · IVA inclusa</div>
              </div>
              <div className="kpi">
                <div className="kpi-label">Stessi giorni, settimana scorsa</div>
                <div className="kpi-value">{settPrec.ok ? eur(settPrec.dati.totali.lordo) : "—"}</div>
                <div className="kpi-sub">
                  {settPrec.ok && settPrec.dati.totali.lordo > 0
                    ? `${sett.dati.totali.lordo >= settPrec.dati.totali.lordo ? "+" : ""}${pct(((sett.dati.totali.lordo - settPrec.dati.totali.lordo) / settPrec.dati.totali.lordo) * 100)} questa settimana`
                    : "confronto non disponibile"}
                </div>
              </div>
            </div>
            <div className="table-wrap" style={{ marginTop: 16 }}>
              <table>
                <thead><tr><th>Negozio</th><th className="num">Venduto</th><th className="num">Ordini</th></tr></thead>
                <tbody>
                  {[...sett.dati.brand].sort((a, b) => b.lordo - a.lordo).map((b) => (
                    <tr key={b.brand}>
                      <td>{b.brand}</td>
                      <td className="num">{eur(b.lordo)}</td>
                      <td className="num">{b.ordini}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {/* ⚠️ Se in questi giorni risulta ZERO non è (di solito) zero lavoro:
            il perimetro conta le consegne arrivate a uno stato FINALE
            (consegnata/approvata), e quelle degli ultimi giorni ci arrivano
            dopo, alla conferma. Misurato il 30/08: 22–24 Ago aveva già 24
            servizi, dal 24 in poi zero — poi si riempiono da soli. Si dice,
            invece di nascondere il blocco e far credere che manchi la fonte. */}
        {serviziSett.ok && serviziSett.totali.n === 0 && (
          <p className="page-caption" style={{ marginTop: 16 }}>
            <strong>Servizi della piattaforma</strong>: in questi giorni nessun servizio è ancora{" "}
            <strong>confermato</strong> — le consegne della settimana sono in lavorazione e contano da
            quando risultano consegnate o approvate. Compariranno qui (e nel mese) man mano.
          </p>
        )}
        {serviziSett.ok && serviziSett.totali.n > 0 && (
          <>
            <h2 className="section-title" style={{ marginTop: 24 }}>Servizi della piattaforma · questa settimana</h2>
            <div className="table-wrap">
              <table>
                <tbody>
                  {serviziSett.perServizio.filter((s) => s.n > 0).slice(0, 10).map((s) => (
                    <tr key={s.nome}>
                      <td>{s.nome}</td>
                      <td className="num" style={{ color: "var(--text-tertiary)" }}>{s.modello === "A_ORA" ? "a ore" : "prezzo fisso"}</td>
                      <td className="num" style={{ color: "var(--text-tertiary)" }}>{s.n} {s.n === 1 ? "servizio" : "servizi"}</td>
                      <td className="num">{eur(s.ricavo)}</td>
                    </tr>
                  ))}
                  <tr className="tot">
                    <td style={{ fontWeight: 600 }}>Totale</td>
                    <td />
                    <td className="num" style={{ fontWeight: 600 }}>{serviziSett.totali.n} {serviziSett.totali.n === 1 ? "servizio" : "servizi"}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{eur(serviziSett.totali.ricavo)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="page-caption" style={{ marginTop: 8 }}>
              Servizi a prezzo fisso e a ore col lavoro fatto in questi {giorni} {giorni === 1 ? "giorno" : "giorni"},
              dal listino della piattaforma consegne. Il fatturato resta quello di Finance, a passo mensile.
            </p>
          </>
        )}
        <p className="page-caption" style={{ marginTop: 16 }}>
          La settimana mostra <strong>le vendite e i servizi della piattaforma</strong>, le due fonti che
          sanno il giorno. La banca e Finance hanno il passo del <strong>mese</strong> — margini e conto
          economico della settimana non esistono, e mostrarli «del mese» qui sotto farebbe credere che
          siano suoi. Si leggono da{" "}
          <Link href="/aggiornato?p=mese" style={{ color: "var(--blue)" }}>Questo mese</Link> in su.
        </p>
      </>
    );
  }

  // ---- Viste a passo mensile ----
  if (mesi.length === 0) {
    return (
      <>
        <Testata vista={vista} sotto="" />
        <div className="avviso-errore">
          A gennaio il «mese scorso» è dicembre dell&apos;anno prima: si legge dal{" "}
          <Link href="/consuntivo">Consuntivo</Link> scegliendo l&apos;anno.
        </div>
      </>
    );
  }

  const [cons, ricaviRes, advBrand, scoutMese, serviziAnno] = await Promise.all([
    caricaConsuntivo(dati, mesi),
    fetchRicaviD2C(dati.year),
    // La pubblicità PER BRAND la sa solo Marketing (la banca ha il totale ma
    // non il brand). ⚠️ Il suo totale è «quello che le campagne ancora
    // esistenti hanno speso» (le eliminate spariscono): per brand è l'unica
    // misura che c'è, e la si usa dichiarandola.
    fetchSpesaPerBrand(dati.year, mesi),
    // Il numero VIVO del commerciale sul mese in corso: gli ordini che Scout
    // ha già chiuso. Solo quando il periodo contiene il mese aperto — sui mesi
    // chiusi la verità sono le fatture di Finance. Se la Edge non risponde il
    // blocco semplicemente non compare.
    parziale ? fetchOrdiniChiusiMese(dati.year, meseInCorso) : Promise.resolve(null),
    // I SERVIZI della piattaforma (prezzo fisso e a ore): l'altro numero vivo
    // del commerciale — il lavoro fatto nel mese, dal listino, prima che la
    // fattura arrivi in Finance.
    parziale ? fetchRicaviServizi(dati.year, meseInCorso) : Promise.resolve(null),
  ]);
  const venduto = raggruppa(ricaviRes, dati.maisons);

  // Il ricavo Deluxy misurato per brand: fee + primo margine scritti dalla
  // piattaforma sugli ordini (economia della vendita, 26/08). Per brand e per
  // i mesi del periodo; se Orders non porta i campi il numero non si inventa.
  const ricavoDeluxy = new Map<string, number>();
  if (ricaviRes.ok) {
    for (const b of ricaviRes.dati.brand) {
      const slug = abbinaMaison(b.brand, dati.maisons);
      if (!slug || !b.feeMese || !b.primoMargineMese) continue;
      const v = sommaMesi(b.feeMese, mesi) + sommaMesi(b.primoMargineMese, mesi);
      ricavoDeluxy.set(slug, (ricavoDeluxy.get(slug) ?? 0) + v);
    }
  }

  // Risultati maison: il venduto dei NEGOZI contro il budget **D2C** degli
  // stessi mesi — stessa coppia di /maison: il venduto ecommerce si confronta
  // con la riga D2C, non con l'intero budget della maison (che dentro ha anche
  // Eventi e B2B). Chi un negozio non ce l'ha (B2B, Experience) mostra «—»,
  // non uno zero che sembrerebbe un crollo. E un mese a budget zero non fa
  // percentuale: è la trappola dell'«866%» (/maison, 24/08).
  //
  // Le colonne di costo (30/08, richiesta «metti anche costi così da vedere
  // conto economico»): per una maison i costi misurabili sono DUE — il costo
  // prodotti è già dentro il «ricavo Deluxy» (con la quota il prodotto è già
  // tolto), e la pubblicità è quella per brand di Marketing. Contributo =
  // ricavo Deluxy − pubblicità. Struttura e personale NON si ripartiscono per
  // brand: si tolgono una volta sola, nel conto economico qui sopra.
  const righeM = dati.maisons.map((m) => {
    const mesiNegozio = venduto.perMaison.get(m.slug);
    const vend = mesiNegozio ? sommaMesi(mesiNegozio, mesi) : null;
    const budgetMesi = mesi.map((mm) => {
      const dm = m.mesi.find((x) => x.month === mm);
      return dm ? dm.vendite[SLUG_D2C] ?? 0 : 0;
    });
    const budget = budgetMesi.reduce((s, v) => s + v, 0);
    const mesiSenzaBudget = mesi.filter((_, i) => (budgetMesi[i] ?? 0) === 0);
    const ricavo = ricavoDeluxy.get(m.slug) ?? null;
    const advMesi = advBrand.ok ? advBrand.perMaison.get(m.slug) : undefined;
    const adv = advMesi ? mesi.reduce((s, mm) => s + (advMesi[mm - 1] ?? 0), 0) : null;
    // Il PONTE fra venduto e ricavo (31/08, richiesta utente: «hai tolto tutti
    // i costi prodotti»): il costo non era sparito — la presa lo sconta già —
    // ma non si VEDEVA, e un conto senza la riga dei costi non si legge.
    // Dentro ci stanno prodotti, quota dei partner e IVA sulle vendite (il
    // venduto è lordo IVA, la presa no): si dichiara, non si spacchetta con
    // una stima.
    const prodotti = vend !== null && ricavo !== null ? vend - ricavo : null;
    const contributo = ricavo !== null && adv !== null ? ricavo - adv : null;
    return { nome: m.nome, vend, budget, mesiSenzaBudget, ricavo, prodotti, adv, contributo };
  }).filter((r) => r.vend !== null || r.budget > 0);
  const vendTot = righeM.reduce((s, r) => s + (r.vend ?? 0), 0);
  // I totali di colonna: il budget totale ha senso solo se NESSUNA riga ha
  // mesi scoperti — sommare budget bucati direbbe un «realizzato» gonfiato.
  const budgetCompleto = righeM.every((r) => r.mesiSenzaBudget.length === 0);
  const tot = {
    budget: righeM.reduce((s, r) => s + r.budget, 0),
    ricavo: righeM.some((r) => r.ricavo !== null) ? righeM.reduce((s, r) => s + (r.ricavo ?? 0), 0) : null,
    prodotti: righeM.some((r) => r.prodotti !== null) ? righeM.reduce((s, r) => s + (r.prodotti ?? 0), 0) : null,
    adv: righeM.some((r) => r.adv !== null) ? righeM.reduce((s, r) => s + (r.adv ?? 0), 0) : null,
    contributo: righeM.some((r) => r.contributo !== null) ? righeM.reduce((s, r) => s + (r.contributo ?? 0), 0) : null,
  };

  // Risultati commerciali: il fatturato per tipologia che Finance misura
  // (Eventi, B2B, …). Il D2C sta già nel conto economico qui sopra; le linee
  // commerciali non collegate a Finance restano «n.d.» — punto aperto noto.
  const tipologieNonD2C = dati.tipologie.filter((t) => t.slug !== SLUG_D2C);
  const righeC = tipologieNonD2C
    .map((t) => ({ nome: t.nome, slug: t.slug, importo: cons.ricaviPerTipologia[t.slug] ?? 0 }))
    .sort((a, b) => b.importo - a.importo);

  const ce: { label: string; v: number; costo?: boolean; forte?: boolean }[] = [
    { label: "Ricavi", v: cons.ricavi, forte: true },
    { label: "Costo del venduto", v: cons.cogs, costo: true },
    { label: "Margine lordo", v: cons.margineLordo, forte: true },
    { label: "Pubblicità", v: cons.adv, costo: true },
    { label: "Personale", v: cons.personale, costo: true },
    { label: "Struttura", v: cons.struttura, costo: true },
    { label: "EBITDA", v: cons.ebitda, forte: true },
  ];

  return (
    <>
      <Testata
        vista={vista}
        sotto={`${etichettaMesi} ${dati.year}${parziale ? ` · ${MESI[meseInCorso - 1]} è in corso: dati parziali` : ""}`}
      />

      {!cons.ok && (
        <div className="avviso-errore">
          Il consuntivo non è completo: {cons.mancanti.join(", ") || "una fonte non risponde"}. I numeri
          sotto valgono per quello che c&apos;è.
        </div>
      )}

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Vendite ecommerce · {etichettaMesi}</div>
          <div className="kpi-value">{venduto.ok ? eur(vendTot) : "—"}</div>
          <div className="kpi-sub">{venduto.ok ? "dai negozi, IVA inclusa" : venduto.errore}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Margine lordo</div>
          <div className="kpi-value">{eur(cons.margineLordo)}</div>
          <div className="kpi-sub">
            {cons.ricavi > 0 ? `${pct((cons.margineLordo / cons.ricavi) * 100)} dei ricavi` : "—"}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">EBITDA</div>
          <div className={`kpi-value ${cons.ebitda >= 0 ? "pos" : "neg"}`}>{eur(cons.ebitda)}</div>
          <div className="kpi-sub">
            <Link href="/consuntivo" style={{ color: "var(--blue)" }}>il consuntivo completo →</Link>
          </div>
        </div>
      </div>

      <h2 className="section-title" style={{ marginTop: 24 }}>Conto economico · {etichettaMesi}</h2>
      <div className="table-wrap">
        <table>
          <tbody>
            {ce.map((r) => (
              <tr key={r.label} className={r.label === "EBITDA" ? "tot" : undefined}>
                <td style={r.forte ? { fontWeight: 600 } : undefined}>{r.label}</td>
                <td className={`num ${r.label === "EBITDA" ? (r.v >= 0 ? "pos" : "neg") : ""}`} style={r.forte ? { fontWeight: 600 } : undefined}>
                  {r.costo ? `− ${eur(r.v)}` : eur(r.v)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="section-title" style={{ marginTop: 24 }}>Risultati maison · dal venduto al contributo</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Maison</th>
              <th className="num">Venduto</th>
              <th className="num">Budget D2C {etichettaMesi}</th>
              <th className="num">Realizzato</th>
              <th className="num">Prodotti, partner e IVA</th>
              <th className="num">Ricavo Deluxy</th>
              <th className="num">Pubblicità</th>
              <th className="num">Contributo</th>
            </tr>
          </thead>
          <tbody>
            {righeM.map((r) => (
              <tr key={r.nome}>
                <td>{r.nome}</td>
                <td className="num">{venduto.ok && r.vend !== null ? eur(r.vend) : "—"}</td>
                <td className="num">
                  {r.mesiSenzaBudget.length === 0
                    ? eur(r.budget)
                    : <span style={{ color: "var(--text-tertiary)" }}>manca {r.mesiSenzaBudget.map((m) => MESI[m - 1]).join(", ")}</span>}
                </td>
                <td className="num">
                  {/* Con mesi senza budget la percentuale sarebbe l'«866%» già visto: vuota. */}
                  {venduto.ok && r.vend !== null && r.mesiSenzaBudget.length === 0 && r.budget > 0
                    ? pct((r.vend / r.budget) * 100, 0)
                    : "—"}
                </td>
                <td className="num">{r.prodotti !== null ? `− ${eur(r.prodotti)}` : "—"}</td>
                <td className="num">{r.ricavo !== null ? eur(r.ricavo) : "—"}</td>
                <td className="num">{r.adv !== null ? `− ${eur(r.adv)}` : "—"}</td>
                <td className={`num ${r.contributo !== null ? (r.contributo >= 0 ? "pos" : "neg") : ""}`} style={{ fontWeight: 600 }}>
                  {r.contributo !== null ? eur(r.contributo) : "—"}
                </td>
              </tr>
            ))}
            <tr className="tot">
              <td style={{ fontWeight: 600 }}>Totale</td>
              <td className="num" style={{ fontWeight: 600 }}>{venduto.ok ? eur(vendTot) : "—"}</td>
              <td className="num" style={{ fontWeight: 600 }}>
                {budgetCompleto ? eur(tot.budget) : <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>incompleto</span>}
              </td>
              <td className="num" style={{ fontWeight: 600 }}>
                {venduto.ok && budgetCompleto && tot.budget > 0 ? pct((vendTot / tot.budget) * 100, 0) : "—"}
              </td>
              <td className="num" style={{ fontWeight: 600 }}>{tot.prodotti !== null ? `− ${eur(tot.prodotti)}` : "—"}</td>
              <td className="num" style={{ fontWeight: 600 }}>{tot.ricavo !== null ? eur(tot.ricavo) : "—"}</td>
              <td className="num" style={{ fontWeight: 600 }}>{tot.adv !== null ? `− ${eur(tot.adv)}` : "—"}</td>
              <td className={`num ${tot.contributo !== null ? (tot.contributo >= 0 ? "pos" : "neg") : ""}`} style={{ fontWeight: 600 }}>
                {tot.contributo !== null ? eur(tot.contributo) : "—"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="page-caption" style={{ marginTop: 8 }}>
        <strong>Prodotti, partner e IVA</strong> = venduto − ricavo Deluxy: quello che dei negozi non resta — il costo dei prodotti, la quota dei partner e l&apos;IVA sulle vendite (il venduto è lordo IVA, il ricavo no). <strong>Ricavo Deluxy</strong> = fee + primo margine scritti dalla piattaforma sugli ordini.{" "}
        <strong>Pubblicità</strong> = campagne per brand da Marketing (le campagne eliminate non ci
        sono: il totale vero di cassa resta la banca, nel conto economico sopra).{" "}
        <strong>Contributo</strong> = ricavo − pubblicità: struttura e personale non si ripartiscono
        per brand — si tolgono una volta sola, sul totale.
      </p>

      <h2 className="section-title" style={{ marginTop: 24 }}>Risultati commerciali · fatturato per tipologia</h2>
      <div className="table-wrap">
        <table>
          <tbody>
            {righeC.map((r) => (
              <tr key={r.slug}>
                <td>{r.nome}</td>
                <td className="num">{eur(r.importo)}</td>
              </tr>
            ))}
            {/* I SERVIZI della piattaforma come riga della stessa tabella
                (richiesta utente 30/08): il lavoro del mese in corso, dal
                listino, che la fattura non ha ancora raggiunto. Entra nel
                totale perché è ricavo commerciale del periodo — con
                l'avvertenza sotto: quando la fattura arriva, il valore migra
                nella sua tipologia. */}
            {(() => {
              const meseSrv = serviziAnno?.ok ? serviziAnno.mesi.find((m) => m.mese === meseInCorso) : null;
              const srv = meseSrv && meseSrv.n > 0 ? meseSrv.ricavo : null;
              const totale = righeC.reduce((s, r) => s + r.importo, 0) + (srv ?? 0);
              return (
                <>
                  {srv !== null && (
                    <tr>
                      <td>Servizi app (piattaforma · {MESI[meseInCorso - 1]} in corso)</td>
                      <td className="num">{eur(srv)}</td>
                    </tr>
                  )}
                  <tr className="tot">
                    <td style={{ fontWeight: 600 }}>Totale</td>
                    <td className="num" style={{ fontWeight: 600 }}>{eur(totale)}</td>
                  </tr>
                </>
              );
            })()}
          </tbody>
        </table>
      </div>
      <p className="page-caption" style={{ marginTop: 8 }}>
        È il fatturato che Finance misura per tipologia (il D2C sta già nel conto economico sopra), più
        la riga <strong>Servizi app</strong>: il lavoro del mese in corso dal listino della piattaforma,
        che la fattura non ha ancora raggiunto — quando arriva, quel valore migra nella sua tipologia
        (il dettaglio è nella tabella sotto). Le <strong>linee commerciali</strong> non collegate alle
        voci di Finance restano fuori: il loro consuntivo è «n.d.», non zero — si collegano da{" "}
        <Link href="/commerciale" style={{ color: "var(--blue)" }}>/commerciale</Link>.
      </p>

      {/* I SERVIZI della piattaforma sul mese in corso (prezzo fisso e a ore):
          il lavoro fatto, dal listino, prima che la fattura arrivi in Finance.
          ⚠️ NON si somma alla tabella di Finance: quando la fattura del
          servizio arriva, entra di là — questo è l'anticipo. */}
      {(() => {
        const meseSrv = serviziAnno?.ok ? serviziAnno.mesi.find((m) => m.mese === meseInCorso) : null;
        if (!meseSrv || meseSrv.n === 0) return null;
        return (
          <>
            <h2 className="section-title" style={{ marginTop: 24 }}>
              In corso a {MESI[meseInCorso - 1]} · servizi della piattaforma
            </h2>
            <div className="table-wrap">
              <table>
                <tbody>
                  {/* Raggruppati per TIPOLOGIA di servizio (richiesta utente
                      30/08), col subtotale di ciascuna: prima la tipologia che
                      vale di più. */}
                  {(["PREZZO_FISSO", "A_ORA"] as const)
                    .map((mod) => {
                      const righe = serviziAnno!.perServizio.filter((s) => s.n > 0 && s.modello === mod);
                      const sub = righe.reduce((a, s) => ({ n: a.n + s.n, ricavo: a.ricavo + s.ricavo }), { n: 0, ricavo: 0 });
                      return { mod, righe, sub };
                    })
                    .filter((g) => g.righe.length > 0)
                    .sort((a, b) => b.sub.ricavo - a.sub.ricavo)
                    .map((g) => (
                      <Fragment key={g.mod}>
                        {g.righe.slice(0, 10).map((s) => (
                          <tr key={s.nome}>
                            <td>{s.nome}</td>
                            <td className="num" style={{ color: "var(--text-tertiary)" }}>
                              {g.mod === "A_ORA" ? "a ore" : "prezzo fisso"}
                            </td>
                            <td className="num" style={{ color: "var(--text-tertiary)" }}>{s.n} {s.n === 1 ? "servizio" : "servizi"}</td>
                            <td className="num">{eur(s.ricavo)}</td>
                          </tr>
                        ))}
                        <tr>
                          <td style={{ fontWeight: 600 }}>Servizi {g.mod === "A_ORA" ? "a ore" : "a prezzo fisso"}</td>
                          <td />
                          <td className="num" style={{ fontWeight: 600 }}>{g.sub.n} {g.sub.n === 1 ? "servizio" : "servizi"}</td>
                          <td className="num" style={{ fontWeight: 600 }}>{eur(g.sub.ricavo)}</td>
                        </tr>
                      </Fragment>
                    ))}
                  <tr className="tot">
                    <td style={{ fontWeight: 600 }}>Totale</td>
                    <td />
                    <td className="num" style={{ fontWeight: 600 }}>{meseSrv.n} {meseSrv.n === 1 ? "servizio" : "servizi"}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{eur(meseSrv.ricavo)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="page-caption" style={{ marginTop: 8 }}>
              Servizi <strong>a prezzo fisso e a ore</strong> col lavoro fatto, valorizzati dal{" "}
              <strong>listino</strong> della piattaforma consegne
              {meseSrv.nonFatturabili > 0 ? ` (${meseSrv.nonFatturabili} non fatturabili, contati a zero)` : ""}.{" "}
              <strong>Non si sommano al fatturato di Finance</strong>: la fattura di questi servizi,
              quando arriva, entra nella tabella sopra — questo è il numero vivo del mese, quello è
              il registro. Le consegne degli ordini D2C restano fuori: il loro ricavo è la fee, già
              dentro il conto economico.
            </p>
          </>
        );
      })()}

      {/* Il numero VIVO del mese in corso: Finance vede le fatture, che sul
          mese aperto sono indietro per costruzione — Scout sa già cosa ha
          chiuso. ⚠️ Le due misure NON si sommano (un ordine chiuso ha già una
          fattura: quando Finance la sincronizza, lo stesso valore compare
          sopra), quindi il blocco sta sotto, separato e dichiarato. */}
      {scoutMese?.ok && (
        <>
          <h2 className="section-title" style={{ marginTop: 24 }}>
            In corso a {MESI[meseInCorso - 1]} · ordini chiusi in Scout
          </h2>
          <div className="table-wrap">
            <table>
              <tbody>
                {scoutMese.perLinea.map((l) => (
                  <tr key={l.linea}>
                    <td>{l.linea}</td>
                    <td className="num">{l.n} {l.n === 1 ? "ordine" : "ordini"}</td>
                    <td className="num">{eur(l.valore)}</td>
                  </tr>
                ))}
                <tr className="tot">
                  <td style={{ fontWeight: 600 }}>Totale</td>
                  <td className="num" style={{ fontWeight: 600 }}>{scoutMese.n} {scoutMese.n === 1 ? "ordine" : "ordini"}</td>
                  <td className="num" style={{ fontWeight: 600 }}>{eur(scoutMese.valore)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="page-caption" style={{ marginTop: 8 }}>
            Ordini con la pratica <strong>chiusa</strong> in Scout a {MESI[meseInCorso - 1]} (fornitura
            registrata, fattura emessa o agganciata){scoutMese.senzaValore > 0 ? ` — ${scoutMese.senzaValore} a valore zero, contati` : ""}.{" "}
            <strong>Non si sommano al fatturato di Finance qui sopra</strong>: la fattura di un ordine
            chiuso, quando Finance la sincronizza, entra in quella tabella — questo è l&apos;anticipo,
            quello è il registro.
          </p>
        </>
      )}
    </>
  );
}

function Testata({ vista, sotto }: { vista: VistaKey; sotto: string }) {
  return (
    <div className="page-head">
      <div>
        <h1 className="page-title">Aggiornato</h1>
        <p className="page-caption">Come stanno andando le cose{sotto ? ` · ${sotto}` : ""}.</p>
      </div>
      {/* La fila scorre nella SUA riga (Libro v1.3): cinque viste a 375px non ci
          stanno, e senza il minWidth:0 il flex non lascia stringere il figlio —
          l'overflow saliva alla pagina intera (misurato: 404px su 375). */}
      <div className="page-actions" style={{ minWidth: 0, maxWidth: "100%" }}>
        <div className="seg" style={{ overflowX: "auto", maxWidth: "100%", flexShrink: 1 }}>
          {VISTE.map((v) => (
            <Link key={v.key} href={`/aggiornato?p=${v.key}`} className={v.key === vista ? "on" : ""}>
              {v.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
