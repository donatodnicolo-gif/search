import Link from "next/link";
import { Prisma } from "@prisma/client";
import { RigaLink } from "@/components/RigaLink";
import { ordinamentoDa } from "@/components/ThOrdina";
import { prisma } from "@/lib/db";
import { euro, dataBreve } from "@/lib/ordini";
import { brandConColore } from "@/lib/brand";
import {
  GESTIONI_INCASSO,
  INCASSATI,
  STATI_INCASSO,
  margineOrdine,
  numeroOrdine,
  quotaFornitore,
  valutaQuota,
} from "@/lib/controllo";
import { riepilogoMovimenti, configurazioneFinance } from "@/lib/movimenti";
import { intervalloScorciatoia, nomeIntervallo } from "@/lib/analisi";
import { AbbinaMovimento } from "@/components/AbbinaMovimento";
import { ChipsPeriodo } from "@/components/ChipsPeriodo";
import { ZonaFiltri } from "@/components/ZonaFiltri";
import { LinkPagamento } from "@/components/LinkPagamento";
import {
  abbinaIncasso,
  abbinaPerNumero,
  adottaDaFinance,
  chiediLinkPagamento,
  cercaMovimentiCosto,
  cercaMovimentiIncasso,
  ignoraIncasso,
  impostaGestioneIncasso,
  importaMovimentiBanca,
  registraCosto,
  riapriIncasso,
  segnaIncassato,
} from "./actions";

export const dynamic = "force-dynamic";

const PER_PAGINA = 60;

// CONTROLLO — i soldi degli ordini: quello che è entrato e quello che è uscito.
//
// Questa pagina è il mestiere che prima si faceva in Finance (deluxy-partner,
// `/ordini`), portato dove stanno gli ordini. In Finance restano i MOVIMENTI
// BANCARI, che sono suoi: qui se ne tiene uno specchio di sola lettura e si
// decide **a quale ordine appartiene** ciascuno.
//
// Due domande, tenute separate perché hanno due risposte:
//  · «il cliente ha pagato?» → incasso, importo ~ uguale al totale;
//  · «quanto ci è costato?»  → costo del fornitore, una frazione del totale.

function pct(n: number, decimali = 1): string {
  return `${n.toLocaleString("it-IT", { minimumFractionDigits: decimali, maximumFractionDigits: decimali })}%`;
}

function coloreQuotaIncasso(p: number): string {
  return p >= 90 ? "var(--green)" : p >= 60 ? "var(--gold-strong)" : "var(--red)";
}

export default async function Controllo({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const giorni = sp.giorni != null ? Number(sp.giorni) : 90;
  const finestra = Number.isFinite(giorni) && giorni > 0 ? giorni : 0;
  const dal = finestra ? new Date(Date.now() - finestra * 86_400_000) : null;
  const brand = sp.brand?.trim() || null;
  const stato = sp.stato?.trim() || null;
  const q = sp.q?.trim() || null;
  const pagina = Math.max(1, Number(sp.page ?? "1") || 1);
  // ORDINAMENTO nella QUERY (Libro §8): l'elenco è paginato, ordinare le righe
  // già estratte riordinerebbe solo la pagina visibile. Il «Margine» non è
  // ordinabile: non è una colonna del database — si calcola a schermo con
  // margineOrdine(), e ordinarlo qui darebbe un ordine vero solo dentro la
  // pagina corrente. Meglio nessun ordinamento che uno che mente.
  const ord = ordinamentoDa(sp, { predefinito: "data" });
  const colonneOrdine: Record<string, Prisma.OrdineOrderByWithRelationInput> = {
    numero: { numero: "asc" },
    data: { data: "desc" },
    cliente: { clienteNome: "asc" },
    pagamento: { categoriaPagamento: "asc" },
    totale: { totale: "desc" },
    costo: { costoFornitore: "desc" },
    incasso: { statoIncasso: "asc" },
  };
  const campo = Object.keys(colonneOrdine[ord.ordina] ?? colonneOrdine.data)[0] as keyof Prisma.OrdineOrderByWithRelationInput;
  // Spareggio sulla data: senza, le colonne con molti valori uguali danno
  // pagine instabili (la stessa riga due volte, o mai).
  const ordineQuery: Prisma.OrdineOrderByWithRelationInput[] = [
    { [campo]: ord.verso } as Prisma.OrdineOrderByWithRelationInput,
    ...(campo === "data" ? [] : [{ data: "desc" } as Prisma.OrdineOrderByWithRelationInput]),
  ];

  // Le scorciatoie di periodo (Libro v1.9 §8-bis), sulla data dell'ORDINE
  // (`Ordine.data`): quando una chip è attiva vince sulla finestra a giorni,
  // che è l'altro modo di dire «quando» e resta nel select.
  const scorciatoia = intervalloScorciatoia(sp.periodo?.trim());

  // La base: ordini del periodo, annullati esclusi (un ordine annullato non ha
  // un incasso da cercare; se è stato pagato comunque, il costo resta e si vede
  // nei margini).
  const dove = {
    ...(scorciatoia ? { data: scorciatoia } : dal ? { data: { gte: dal } } : {}),
    ...(brand ? { brand } : {}),
    // La ricerca (Libro v1.9 §8-bis): come l'operatore riconosce l'ordine —
    // il numero, il cliente o la sua email.
    ...(q
      ? {
          OR: [
            { numero: { contains: q, mode: "insensitive" as const } },
            { clienteNome: { contains: q, mode: "insensitive" as const } },
            { clienteEmail: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
    annullatoIl: null,
  };

  const [negozi, quota, movimenti, conf, tutti, elenco, totaleElenco] = await Promise.all([
    brandConColore(),
    quotaFornitore(),
    riepilogoMovimenti(),
    Promise.resolve(configurazioneFinance()),
    // Per le percentuali serve TUTTO il periodo, non la pagina mostrata.
    prisma.ordine.findMany({
      where: dove,
      select: {
        totale: true,
        statoIncasso: true,
        gestioneIncasso: true,
        categoriaPagamento: true,
        costoFornitore: true,
      },
    }),
    prisma.ordine.findMany({
      where: { ...dove, ...(stato ? { statoIncasso: stato } : {}) },
      orderBy: ordineQuery,
      skip: (pagina - 1) * PER_PAGINA,
      take: PER_PAGINA,
      select: {
        id: true,
        numero: true,
        brand: true,
        data: true,
        totale: true,
        clienteNome: true,
        clienteEmail: true,
        categoriaPagamento: true,
        financialStatus: true,
        statoIncasso: true,
        gestioneIncasso: true,
        movimentoIncassoId: true,
        incassatoIl: true,
        costoFornitore: true,
        costoFornitoreNome: true,
        costoDa: true,
        // Servono a margineOrdine() per il margine reale (netto IVA) e il caso
        // della consegna nostra — così anche qui il conto è quello unico.
        costoConsegna: true,
        feeConsegna: true,
        evasione: true,
        consegnataDa: true,
        // Il margine gia' fatto dalla piattaforma: quando c'e' vince sul conto
        // del registro (vedi margineOrdine). Commissione e gateway servono al
        // ripiego: la commissione d'incasso si detrae SEMPRE.
        margineFinale: true,
        commissioneIncassi: true,
        gateway: true,
      },
    }),
    prisma.ordine.count({ where: { ...dove, ...(stato ? { statoIncasso: stato } : {}) } }),
  ]);

  // ---- Incasso: quanto è entrato, e su cosa si calcola --------------------
  // Gli ordini «ignorati» escono dalla base: sono fuori dal conto per scelta, e
  // lasciarli dentro farebbe sembrare un buco una decisione.
  const attivi = tutti.filter((o) => o.statoIncasso !== "ignorato");
  const somma = (righe: typeof attivi) => righe.reduce((s, o) => s + o.totale, 0);
  const base = somma(attivi);
  const incassato = somma(attivi.filter((o) => (INCASSATI as readonly string[]).includes(o.statoIncasso)));
  const daIncassare = base - incassato;
  const pctIncasso = base > 0.005 ? (incassato / base) * 100 : 0;
  const ignorati = tutti.length - attivi.length;

  const perPagamento = (["carta", "bonifico", "contrassegno", "altro"] as const)
    .map((cat) => {
      const righe = attivi.filter((o) => o.categoriaPagamento === cat);
      const b = somma(righe);
      const inc = somma(righe.filter((o) => (INCASSATI as readonly string[]).includes(o.statoIncasso)));
      return { cat, base: b, incassato: inc, pct: b > 0.005 ? (inc / b) * 100 : 0, n: righe.length };
    })
    .filter((r) => r.n > 0);

  // Da riconciliare DAVVERO: solo dove in banca c'è qualcosa da cercare. Gli
  // ordini «partner» rientrano in un conto mensile e non avranno mai un
  // movimento: contarli come arretrato sarebbe una coda che non finisce mai.
  const daCercare = attivi.filter(
    (o) => o.statoIncasso === "da_riconciliare" && (GESTIONI_INCASSO[o.gestioneIncasso]?.riconciliabile ?? true),
  );
  const inContoPartner = attivi.filter(
    (o) => o.statoIncasso === "da_riconciliare" && !(GESTIONI_INCASSO[o.gestioneIncasso]?.riconciliabile ?? true),
  );

  // ---- Costo del fornitore: quanto sappiamo, e quanto no ------------------
  const conCosto = attivi.filter((o) => o.costoFornitore != null);
  const costoTotale = conCosto.reduce((s, o) => s + (o.costoFornitore ?? 0), 0);
  const lordoConCosto = somma(conCosto);
  const margine = lordoConCosto - costoTotale;
  const pctMargine = lordoConCosto > 0.005 ? (margine / lordoConCosto) * 100 : 0;
  const copertura = attivi.length ? (conCosto.length / attivi.length) * 100 : 0;

  const colori = new Map(negozi.map((n) => [n.nome, n.colore]));

  function link(extra: Record<string, string>): string {
    const q = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(extra)) {
      if (v) q.set(k, v);
      else q.delete(k);
    }
    const s = q.toString();
    return `/controllo${s ? `?${s}` : ""}`;
  }

  const totalePagine = Math.max(1, Math.ceil(totaleElenco / PER_PAGINA));

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1 className="page-title">Controllo</h1>
          <p className="page-sub">
            I soldi di ogni ordine: quello che il cliente ha pagato e quello che abbiamo pagato al fornitore. I
            movimenti bancari arrivano da <strong>Finance</strong> e restano suoi; qui si decide a quale ordine
            appartengono.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <form action={importaMovimentiBanca}>
            <button className="btn btn-secondario" type="submit" disabled={!conf} title="Scarica da Finance i movimenti nuovi">
              ↓ Movimenti da Finance
            </button>
          </form>
          <form action={abbinaPerNumero}>
            <button
              className="btn"
              type="submit"
              disabled={movimenti.totale === 0}
              title="Abbina in automatico dove il numero dell'ordine è in causale: solo le corrispondenze uniche"
            >
              ⇄ Abbina per numero
            </button>
          </form>
        </div>
      </div>

      {/* Com'è collegato a Finance: se non lo è, tutto il resto è vuoto per un
          motivo che va detto subito. */}
      {!conf ? (
        <div className="avviso-nuovi" style={{ borderLeftColor: "var(--orange)" }}>
          <span className="cresce">
            <strong>Finance non è collegato.</strong> Servono <code>FINANCE_URL</code> e{" "}
            <code>FINANCE_API_KEY</code> (la chiave è quella delle API di verifica di deluxy-partner). Senza,
            i movimenti bancari non arrivano e il controllo si può fare solo a mano.
          </span>
        </div>
      ) : (
        <div className="testo-guida" style={{ marginBottom: 14 }}>
          {/* Un `div` e non un `p`: dentro c'è un form (l'adozione da Finance), e
              un form dentro un paragrafo è HTML non valido — React lo segnala
              come errore di hydration e la pagina si rimonta da sola. */}
          Specchio dei movimenti: <strong>{movimenti.totale.toLocaleString("it-IT")}</strong> movimenti (
          {movimenti.entrate.toLocaleString("it-IT")} entrate · {movimenti.uscite.toLocaleString("it-IT")} uscite)
          {movimenti.primo && movimenti.ultimo ? ` dal ${dataBreve(movimenti.primo)} al ${dataBreve(movimenti.ultimo)}` : ""}
          {movimenti.ultimoImport ? ` · ultimo scarico ${dataBreve(movimenti.ultimoImport)}` : ""}.{" "}
          <form action={adottaDaFinance} style={{ display: "inline" }}>
            <button className="btn-testo" type="submit" title="Prende da Finance lo stato d'incasso e i costi già registrati là, senza sovrascrivere quello che è stato deciso qui">
              Adotta il controllo già fatto in Finance
            </button>
          </form>
        </div>
      )}

      {/* Esiti delle azioni */}
      {(sp.mov || sp.movErrore) && (
        <div className="avviso-nuovi" style={{ borderLeftColor: sp.movErrore ? "var(--red)" : "var(--green)" }}>
          <span className="cresce">
            {sp.movErrore ? (
              <>
                <strong>Import non riuscito.</strong> {sp.movErrore}
              </>
            ) : (
              <>
                <strong>{sp.mov} movimenti nuovi</strong> · {sp.movAgg ?? 0} aggiornati.
              </>
            )}
          </span>
        </div>
      )}
      {(sp.adInc || sp.adErrore) && (
        <div className="avviso-nuovi" style={{ borderLeftColor: sp.adErrore ? "var(--red)" : "var(--green)" }}>
          <span className="cresce">
            {sp.adErrore ? (
              <>
                <strong>Adozione non riuscita.</strong> {sp.adErrore}
              </>
            ) : (
              <>
                Da Finance: <strong>{sp.adInc} incassi</strong> e <strong>{sp.adCos} costi</strong> adottati
                {Number(sp.adGes) > 0 ? `, ${sp.adGes} modi di incassare` : ""}
                {Number(sp.adNo) > 0 ? ` · ${sp.adNo} ordini di Finance non trovati qui` : ""}.
              </>
            )}
          </span>
        </div>
      )}
      {sp.inc != null && (
        <div className="avviso-nuovi">
          <span className="cresce">
            <strong>{sp.inc} incassi riconciliati</strong> e <strong>{sp.cos} costi fornitore</strong> agganciati per
            numero in causale.{" "}
            {Number(sp.incDiff) > 0 && <>{sp.incDiff} col numero giusto ma importo diverso: da guardare a mano. </>}
            {Number(sp.cosFuori) > 0 && <>{sp.cosFuori} costi sopra la quota del {quota}%. </>}
            {Number(sp.cosImpl) > 0 && <>{sp.cosImpl} importi implausibili non scritti. </>}
            {Number(sp.amb) > 0 && <>{sp.amb} ambigui (stesso numero su più ordini o movimenti).</>}
          </span>
        </div>
      )}

      {/* ---- Incasso ---- */}
      <div className="scheda">
        <div className="scheda-titolo">
          {/* Il titolo dice il periodo VERO del conto: la chip attiva, se c'è,
              altrimenti la finestra a giorni. */}
          Incassato{" "}
          {scorciatoia
            ? `(${nomeIntervallo(scorciatoia.gte, scorciatoia.lt)})`
            : finestra
              ? `(ultimi ${finestra} giorni)`
              : "(tutto lo storico)"}
          {brand ? ` · ${brand}` : ""}
        </div>
        <div style={{ display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
          <div>
            <div className="kpi-etichetta">% incassato</div>
            <div className="kpi-valore" style={{ color: coloreQuotaIncasso(pctIncasso) }}>
              {pct(pctIncasso)}
            </div>
            <div className="testo-guida">
              {euro(incassato)} su {euro(base)}
            </div>
          </div>
          <div style={{ flex: "1 1 260px", minWidth: 200 }}>
            <div className="barra-incasso">
              <div style={{ width: `${Math.min(100, pctIncasso)}%`, background: "var(--green)" }} />
              <div style={{ flex: 1, background: "rgba(201,52,0,0.35)" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 12.5 }}>
              <span style={{ color: "var(--green)" }}>● Incassato {euro(incassato)}</span>
              <span style={{ color: "var(--orange)" }}>Da incassare {euro(daIncassare)} ●</span>
            </div>
          </div>
        </div>

        {perPagamento.length > 0 && (
          <div className="tabella-wrap" style={{ marginTop: 14 }}>
            <table>
              <thead>
                <tr>
                  <th>Per pagamento</th>
                  <th className="num">Incassato</th>
                  <th className="num">Totale</th>
                  <th className="num">% incasso</th>
                </tr>
              </thead>
              <tbody>
                {perPagamento.map((r) => (
                  <tr key={r.cat}>
                    <td>
                      {r.cat} <span className="cella-muta">· {r.n}</span>
                    </td>
                    <td className="cella-num">{euro(r.incassato)}</td>
                    <td className="cella-num">{euro(r.base)}</td>
                    <td className="cella-num" style={{ fontWeight: 600, color: coloreQuotaIncasso(r.pct) }}>
                      {pct(r.pct)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="testo-guida" style={{ marginTop: 10 }}>
          «Incassato» = carte pagate su Shopify (l&apos;incasso è avvenuto sul gateway) + ordini abbinati a un
          movimento bancario o segnati incassati a mano.{" "}
          {inContoPartner.length > 0 && (
            <>
              <strong>{inContoPartner.length} ordini</strong> ({euro(somma(inContoPartner))}) rientrano nel conto
              mensile di un partner: in banca non c&apos;è niente da cercare, e non sono un arretrato.{" "}
            </>
          )}
          {ignorati > 0 && `${ignorati} ordini ignorati sono esclusi dal calcolo.`}
        </p>
      </div>

      {/* ---- Costo e margine misurato ---- */}
      <div className="scheda">
        <div className="scheda-titolo">Pagato ai fornitori</div>
        <div className="griglia-kpi" style={{ margin: "10px 0 0" }}>
          <div className="kpi kpi-analisi">
            <div className="kpi-etichetta">Pagato ai fornitori</div>
            <div className="kpi-valore">{euro(costoTotale)}</div>
            <div className="testo-guida">su {euro(lordoConCosto)} di ordini con costo</div>
          </div>
          <div className="kpi kpi-analisi">
            <div className="kpi-etichetta">Margine misurato</div>
            <div className="kpi-valore" style={{ color: margine >= 0 ? "var(--green)" : "var(--red)" }}>
              {euro(margine)}
            </div>
            <div className="testo-guida">{pct(pctMargine)} di quel venduto</div>
          </div>
          <div className="kpi kpi-analisi">
            <div className="kpi-etichetta">Ordini con un costo</div>
            <div className="kpi-valore">{conCosto.length.toLocaleString("it-IT")}</div>
            <div className="testo-guida">
              {pct(copertura, 0)} degli ordini del periodo · {(attivi.length - conCosto.length).toLocaleString("it-IT")}{" "}
              ancora senza
            </div>
          </div>
        </div>
        <p className="testo-guida" style={{ marginTop: 10 }}>
          Il costo si registra su un ordine abbinando l&apos;<strong>addebito</strong> in banca, oppure a mano. Non si
          deduce dal totale: la quota attesa è il <strong>{quota}%</strong> del valore (si cambia in Impostazioni) e
          serve a segnalare gli scostamenti, non a inventare un costo. Il quadro completo, tagliato per negozio,
          categoria e fornitore, è in <Link href="/margini" className="ritorno">Margini</Link>.
        </p>
      </div>

      {/* Le scorciatoie di periodo (Libro v1.9 §8-bis): link GET che
          conservano ricerca e filtri, FUORI dal form — il submit del form le
          azzera da solo (la finestra a giorni scelta nel select vince). */}
      <ChipsPeriodo attivo={sp.periodo} href={(v) => link({ periodo: v, page: "" })} azzera="Torna alla finestra" />

      {/* ---- Filtri ---- */}
      <form className="filtri" method="get">
        {/* La ricerca (Libro v1.9 §8-bis): il numero, il cliente o l'email. */}
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Cerca per numero ordine, cliente o email…"
        />
        {/* I select vivono dietro «Filtri (N)» sotto la soglia mobile (Libro
            v1.2 §8): la finestra conta solo fuori dal default (90 giorni). */}
        <ZonaFiltri attivi={(finestra !== 90 ? 1 : 0) + (brand ? 1 : 0) + (stato ? 1 : 0)}>
        <select name="giorni" defaultValue={String(finestra)}>
          <option value="30">Ultimi 30 giorni</option>
          <option value="90">Ultimi 90 giorni</option>
          <option value="180">Ultimi 180 giorni</option>
          <option value="365">Ultimo anno</option>
          <option value="0">Tutto lo storico</option>
        </select>
        <select name="brand" defaultValue={brand ?? ""}>
          <option value="">Tutti i negozi</option>
          {negozi.map((n) => (
            <option key={n.id} value={n.nome}>
              {n.nome}
            </option>
          ))}
        </select>
        <select name="stato" defaultValue={stato ?? ""}>
          <option value="">Ogni stato d&apos;incasso</option>
          {Object.entries(STATI_INCASSO).map(([k, v]) => (
            <option key={k} value={k}>
              {v.nome}
            </option>
          ))}
        </select>
        </ZonaFiltri>
        <button className="btn btn-secondario small" type="submit">
          Filtra
        </button>
        <Link className="btn btn-secondario small" href="/controllo">
          Azzera
        </Link>
      </form>

      <p className="testo-guida" style={{ marginBottom: 10 }}>
        Da riconciliare in banca: <strong>{daCercare.length.toLocaleString("it-IT")}</strong> ordini per{" "}
        {euro(somma(daCercare))}. Sono quelli che un movimento lo devono avere.
      </p>

      {/* ---- L'elenco ---- */}
      <div className="tabella-wrap">
        <table>
          <thead>
            <tr>
              {ord.th("numero", "Ordine")}
              {ord.th("data", "Data", true)}
              {ord.th("cliente", "Cliente")}
              {ord.th("pagamento", "Pagamento")}
              {ord.th("totale", "Totale", true)}
              {ord.th("costo", "Costo fornitore", true)}
              {/* Calcolato a schermo: non è una colonna, non si ordina. */}
              <th className="num">Margine</th>
              {ord.th("incasso", "Incasso")}
            </tr>
          </thead>
          <tbody>
            {elenco.map((o) => {
              const v = o.costoFornitore != null ? valutaQuota(o.totale, o.costoFornitore, quota) : null;
              const gestione = GESTIONI_INCASSO[o.gestioneIncasso] ?? GESTIONI_INCASSO.riconciliazione;
              const st = STATI_INCASSO[o.statoIncasso] ?? STATI_INCASSO.da_riconciliare;
              return (
                <RigaLink key={o.id} href={`/ordini/${o.id}`} className="riga-brand riga-link" style={{ ["--brand" as string]: colori.get(o.brand) ?? "#b8963e" }}>
                  <td>
                    <Link href={`/ordini/${o.id}`} className="cella-nome">
                      {o.numero}
                    </Link>
                    <div className="cella-sub cella-brand">
                      <span className="brand-dot" />
                      {o.brand}
                    </div>
                  </td>
                  <td className="cella-muta">{dataBreve(o.data)}</td>
                  <td style={{ fontSize: 12.5 }}>{o.clienteNome ?? o.clienteEmail ?? "—"}</td>
                  <td style={{ fontSize: 12.5 }}>
                    {o.categoriaPagamento}
                    {o.financialStatus && <div className="cella-muta">{o.financialStatus}</div>}
                  </td>
                  <td className="cella-num">{euro(o.totale)}</td>
                  <td className="cella-num">
                    {o.costoFornitore != null ? (
                      <>
                        {euro(o.costoFornitore)}
                        <div
                          style={{ fontSize: 11, fontWeight: 600, color: v!.stato === "buono" ? "var(--green)" : "var(--red)" }}
                          title={
                            v!.stato === "buono"
                              ? `Sotto la quota del ${quota}%: margine buono`
                              : `Sopra la quota del ${quota}%: margine basso`
                          }
                        >
                          {v!.pct.toFixed(0)}% {v!.stato === "buono" ? "✓" : "⚠"}
                          {o.costoDa === "causale" && " · auto"}
                          {o.costoDa === "finance" && " · Finance"}
                        </div>
                      </>
                    ) : (
                      <AbbinaMovimento
                        ordineId={o.id}
                        ordineNumero={o.numero}
                        totale={o.totale}
                        suggerimento={numeroOrdine(o.numero)}
                        tipo="costo"
                        etichetta="+ costo"
                        cerca={cercaMovimentiCosto}
                        abbina={registraCosto}
                      />
                    )}
                  </td>
                  {(() => {
                    // Il margine REALE (netto IVA), dalla funzione unica: niente
                    // conto a mano qui (era il calcolo inline che dava il lordo).
                    const m = margineOrdine(o);
                    return (
                      <td
                        className="cella-num"
                        style={{ color: m.valore != null ? (m.valore >= 0 ? "var(--green)" : "var(--red)") : undefined }}
                        title={m.valore != null ? `${m.nota} · ${m.pct != null ? `${m.pct.toLocaleString("it-IT", { maximumFractionDigits: 1 })}% del totale pagato dal cliente` : "percentuale non calcolabile"}` : undefined}
                      >
                        {m.valore != null ? euro(m.valore) : "—"}
                      </td>
                    );
                  })()}
                  <td>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                      <span className="pill-stato" style={{ color: st.colore }} title={st.spiega}>
                        <span className="dot" style={{ background: st.colore }} />
                        {st.nome}
                      </span>
                      {/* Come si incassa: si cambia dove si guarda, senza aprire
                          la scheda. È la scelta che decide se cercare o no. */}
                      <form action={impostaGestioneIncasso}>
                        <input type="hidden" name="ordineId" value={o.id} />
                        <select name="gestione" defaultValue={o.gestioneIncasso} className="select-piccola">
                          {Object.entries(GESTIONI_INCASSO).map(([k, g]) => (
                            <option key={k} value={k}>
                              {g.nome}
                            </option>
                          ))}
                        </select>
                        <button className="btn-testo" type="submit">
                          salva
                        </button>
                      </form>
                      {gestione.riconciliabile ? (
                        <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                          <AbbinaMovimento
                            ordineId={o.id}
                            ordineNumero={o.numero}
                            totale={o.totale}
                            suggerimento={numeroOrdine(o.numero)}
                            tipo="incasso"
                            etichetta={o.movimentoIncassoId ? "Cambia movimento" : "Abbina incasso"}
                            cerca={cercaMovimentiIncasso}
                            abbina={abbinaIncasso}
                          />
                          {o.statoIncasso === "da_riconciliare" ? (
                            <>
                              {/* Il modo più corto di incassare un bonifico che
                                  non arriva: mandare il link e lasciar pagare
                                  con la carta. Paga QUESTO ordine, non ne crea
                                  un altro. */}
                              {o.financialStatus !== "PAID" && (
                                <LinkPagamento ordineId={o.id} chiedi={chiediLinkPagamento} compatto />
                              )}
                              <form action={segnaIncassato}>
                                <input type="hidden" name="ordineId" value={o.id} />
                                <button className="btn btn-secondario small" type="submit" title="Incassato senza un movimento da abbinare">
                                  Incassato
                                </button>
                              </form>
                              <form action={ignoraIncasso}>
                                <input type="hidden" name="ordineId" value={o.id} />
                                <button className="btn btn-secondario small" type="submit">
                                  Ignora
                                </button>
                              </form>
                            </>
                          ) : (
                            <form action={riapriIncasso}>
                              <input type="hidden" name="ordineId" value={o.id} />
                              <button className="btn btn-secondario small" type="submit">
                                Riapri
                              </button>
                            </form>
                          )}
                        </span>
                      ) : (
                        <span className="testo-guida">Rientra nel conto del partner</span>
                      )}
                    </div>
                  </td>
                </RigaLink>
              );
            })}
            {elenco.length === 0 && (
              <tr>
                <td colSpan={8} className="cella-muta">
                  Nessun ordine con questi filtri.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="paginazione">
        <span>
          {totaleElenco.toLocaleString("it-IT")} ordini · pagina {pagina} di {totalePagine}
        </span>
        <nav>
          {pagina > 1 && (
            <Link className="btn btn-secondario small" href={link({ page: String(pagina - 1) })}>
              ← Precedente
            </Link>
          )}
          {pagina < totalePagine && (
            <Link className="btn btn-secondario small" href={link({ page: String(pagina + 1) })}>
              Successiva →
            </Link>
          )}
        </nav>
      </div>
    </main>
  );
}
