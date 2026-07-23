import { Prisma } from "@prisma/client";
import { FiltriDashboard } from "@/components/FiltriDashboard";
import { Sidebar } from "@/components/Sidebar";
import { prisma } from "@/lib/db";
import { coloreInteresse } from "@/lib/interessi";
import { getLinee } from "@/lib/linee";
import {
  COLORE_STATO,
  COLORE_STATO_ANALISI,
  COLORE_STATO_FINANZIARIO,
  ETICHETTE_STATO,
  ETICHETTE_STATO_ANALISI,
  ETICHETTE_STATO_FINANZIARIO,
  STATI,
  STATI_ANALISI,
  STATI_FINANZIARI,
  isStato,
  isStatoAnalisi,
  isStatoFinanziario,
} from "@/lib/stati";

export const dynamic = "force-dynamic";

// Barra orizzontale: etichetta a sinistra, barra sottile, valore in inchiostro
// (mai colorato: il colore identifica l'entità, il testo resta testo).
function Barra({
  etichetta,
  valore,
  massimo,
  colore = "var(--gold)",
  href,
  dettaglio,
}: {
  etichetta: string;
  valore: number;
  massimo: number;
  colore?: string;
  href?: string;
  dettaglio?: string;
}) {
  const pct = massimo > 0 ? Math.max(valore > 0 ? 2 : 0, (valore / massimo) * 100) : 0;
  const contenuto = (
    <>
      <span className="dash-etichetta">{etichetta}</span>
      <span className="dash-track" title={dettaglio ?? `${etichetta}: ${valore}`}>
        <span className="dash-fill" style={{ width: `${pct}%`, background: colore }} />
      </span>
      <span className="dash-valore">{valore}</span>
    </>
  );
  return href ? (
    <a className="dash-riga" href={href}>{contenuto}</a>
  ) : (
    <div className="dash-riga">{contenuto}</div>
  );
}

type Ricerca = {
  categoria?: string;
  regione?: string;
  stato?: string;
  statoFinanziario?: string;
  statoAnalisi?: string;
  interesse?: string;
};

export default async function Dashboard({ searchParams }: { searchParams: Promise<Ricerca> }) {
  const sp = await searchParams;
  const categoria = sp.categoria || undefined;
  const regione = sp.regione || undefined;
  const stato = sp.stato && isStato(sp.stato) ? sp.stato : undefined;
  const statoFinanziario =
    sp.statoFinanziario && isStatoFinanziario(sp.statoFinanziario) ? sp.statoFinanziario : undefined;
  // "nessuno" = anagrafiche mai analizzate
  const statoAnalisi =
    sp.statoAnalisi === "nessuno" || (sp.statoAnalisi && isStatoAnalisi(sp.statoAnalisi))
      ? sp.statoAnalisi
      : undefined;
  const interesse = sp.interesse?.trim() || undefined;
  const linee = await getLinee();
  const filtriAttivi = [categoria, regione, stato, statoFinanziario, statoAnalisi, interesse].filter(
    Boolean,
  ).length;

  // Filtro Prisma (groupBy/count) e filtro SQL (query raw), stessi criteri
  const where: Prisma.PartnerWhereInput = { attivo: true };
  if (categoria) where.categoria = categoria;
  if (regione) where.regione = regione;
  if (stato) where.stato = stato;
  if (statoFinanziario) where.statoFinanziario = statoFinanziario;
  if (statoAnalisi) where.statoAnalisi = statoAnalisi === "nessuno" ? null : statoAnalisi;
  if (interesse) where.interessi = { has: interesse };

  const cond: Prisma.Sql[] = [Prisma.sql`"attivo"`];
  if (categoria) cond.push(Prisma.sql`"categoria" = ${categoria}`);
  if (regione) cond.push(Prisma.sql`"regione" = ${regione}`);
  if (stato) cond.push(Prisma.sql`"stato" = ${stato}`);
  if (statoFinanziario) cond.push(Prisma.sql`"statoFinanziario" = ${statoFinanziario}`);
  if (statoAnalisi) {
    cond.push(
      statoAnalisi === "nessuno"
        ? Prisma.sql`"statoAnalisi" IS NULL`
        : Prisma.sql`"statoAnalisi" = ${statoAnalisi}`,
    );
  }
  if (interesse) cond.push(Prisma.sql`${interesse} = ANY("interessi")`);
  const whereRaw = Prisma.join(cond, " AND ");

  const setteGiorniFa = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const oggi = new Date();

  const [
    opzioniCategorie,
    opzioniRegioni,
    totale,
    perStato,
    perStatoFinanziario,
    perStatoAnalisi,
    perCategoria,
    perRegione,
    perCitta,
    perInteresse,
    perMese,
    nuove7,
    contattate7,
    conTelefono,
    conEmail,
    conReferente,
    riconciliate,
  ] = await Promise.all([
    // Opzioni dei menu: sempre l'elenco completo, indipendente dai filtri attivi
    prisma.partner.findMany({ where: { attivo: true }, distinct: ["categoria"], select: { categoria: true }, orderBy: { categoria: "asc" } }),
    prisma.partner.findMany({ where: { attivo: true, regione: { not: null } }, distinct: ["regione"], select: { regione: true }, orderBy: { regione: "asc" } }),
    prisma.partner.count({ where }),
    prisma.partner.groupBy({ by: ["stato"], where, _count: { _all: true } }),
    prisma.partner.groupBy({ by: ["statoFinanziario"], where, _count: { _all: true } }),
    prisma.partner.groupBy({ by: ["statoAnalisi"], where, _count: { _all: true } }),
    prisma.partner.groupBy({ by: ["categoria"], where, _count: { _all: true }, orderBy: { _count: { categoria: "desc" } } }),
    prisma.partner.groupBy({ by: ["regione"], where: regione ? where : { ...where, regione: { not: null } }, _count: { _all: true }, orderBy: { _count: { regione: "desc" } } }),
    prisma.partner.groupBy({ by: ["citta"], where: { ...where, citta: { not: null } }, _count: { _all: true }, orderBy: { _count: { citta: "desc" } }, take: 10 }),
    prisma.$queryRaw<{ interesse: string; totale: bigint }[]>(Prisma.sql`
      SELECT unnest("interessi") AS interesse, count(*) AS totale
      FROM "anagrafiche"."Partner" WHERE ${whereRaw} GROUP BY 1`),
    prisma.$queryRaw<{ mese: Date; totale: bigint }[]>(Prisma.sql`
      SELECT date_trunc('month', "ultimaVisita") AS mese, count(*) AS totale
      FROM "anagrafiche"."Partner"
      WHERE ${whereRaw} AND "ultimaVisita" IS NOT NULL
        AND "ultimaVisita" >= now() - interval '12 months' AND "ultimaVisita" <= now()
      GROUP BY 1 ORDER BY 1`),
    prisma.partner.count({ where: { ...where, creatoIl: { gte: setteGiorniFa }, fonte: { not: "excel" } } }),
    prisma.partner.count({ where: { ...where, ultimaVisita: { gte: setteGiorniFa, lte: oggi } } }),
    prisma.partner.count({ where: { ...where, OR: [{ telefono: { not: null } }, { contatti: { some: { telefono: { not: null } } } }] } }),
    prisma.partner.count({ where: { ...where, OR: [{ email: { not: null } }, { contatti: { some: { email: { not: null } } } }] } }),
    prisma.partner.count({ where: { ...where, contatti: { some: {} } } }),
    prisma.partner.count({ where: { ...where, hubspotId: { not: null } } }),
  ]);

  const statoConteggio = new Map(perStato.map((s) => [s.stato, s._count._all]));
  const pipeline = ["in_contatto", "in_attesa", "in_trattativa", "da_ricontattare"].reduce(
    (somma, s) => somma + (statoConteggio.get(s) ?? 0),
    0,
  );
  const finanziarioConteggio = new Map(
    perStatoFinanziario.map((s) => [s.statoFinanziario, s._count._all]),
  );
  const analisiConteggio = new Map(
    perStatoAnalisi.map((s) => [s.statoAnalisi ?? "nessuno", s._count._all]),
  );
  const interesseConteggio = new Map(perInteresse.map((i) => [i.interesse, Number(i.totale)]));
  const maxStato = Math.max(...STATI.map((s) => statoConteggio.get(s) ?? 0), 1);
  const maxFinanziario = Math.max(...STATI_FINANZIARI.map((s) => finanziarioConteggio.get(s) ?? 0), 1);
  const maxAnalisi = Math.max(
    ...STATI_ANALISI.map((s) => analisiConteggio.get(s) ?? 0),
    analisiConteggio.get("nessuno") ?? 0,
    1,
  );
  // A rischio incasso: tutto ciò che non è "regolare" né ancora da verificare
  const aRischio = ["in_ritardo", "insoluto", "piano_di_rientro", "bloccato"].reduce(
    (somma, s) => somma + (finanziarioConteggio.get(s) ?? 0),
    0,
  );
  const maxInteresse = Math.max(...linee.map((i) => interesseConteggio.get(i) ?? 0), 1);

  const TOP = 8;
  const categorieTop = perCategoria.slice(0, TOP);
  const altreCategorie = perCategoria.slice(TOP).reduce((somma, c) => somma + c._count._all, 0);
  const regioniTop = perRegione.slice(0, TOP);
  const altreRegioni = perRegione.slice(TOP).reduce((somma, r) => somma + r._count._all, 0);
  const maxCategoria = Math.max(categorieTop[0]?._count._all ?? 1, 1);
  const maxRegione = Math.max(regioniTop[0]?._count._all ?? 1, 1);
  const maxCitta = Math.max(perCitta[0]?._count._all ?? 1, 1);

  // Ultimi 12 mesi completi, inclusi quelli a zero
  const mesi: { nome: string; totale: number }[] = [];
  const perMeseMap = new Map(perMese.map((m) => [m.mese.toISOString().slice(0, 7), Number(m.totale)]));
  for (let i = 11; i >= 0; i--) {
    const d = new Date(oggi.getFullYear(), oggi.getMonth() - i, 1);
    const chiave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    mesi.push({
      nome: d.toLocaleDateString("it-IT", { month: "short" }),
      totale: perMeseMap.get(chiave) ?? 0,
    });
  }
  const maxMese = Math.max(...mesi.map((m) => m.totale), 1);

  const pct = (n: number) => (totale ? Math.round((n / totale) * 100) : 0);
  const senzaRegione = totale - perRegione.reduce((s, r) => s + r._count._all, 0);

  return (
    <div className="layout">
      <Sidebar
        dashboardAttiva
        categoriaAttiva={categoria ?? null}
        statoAttivo={stato ?? null}
        statoFinanziarioAttivo={statoFinanziario ?? null}
        statoAnalisiAttivo={statoAnalisi ?? null}
        interesseAttivo={interesse ?? null}
      />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Dashboard</h1>
            <p className="page-sub">
              {filtriAttivi > 0
                ? `${totale} anagrafiche nella fetta selezionata`
                : "Analisi del registro: funnel, aree, interessi e qualità dei dati."}
            </p>
          </div>
        </div>

        <FiltriDashboard
          categorie={opzioniCategorie.map((c) => c.categoria)}
          regioni={opzioniRegioni.map((r) => r.regione!).filter(Boolean)}
          interessi={linee}
          valori={{ categoria, regione, stato, statoFinanziario, statoAnalisi, interesse }}
        />

        <div className="sync-riepilogo" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
          <div className="sync-kpi"><div className="sync-kpi-valore">{totale}</div><div className="sync-kpi-etichetta">Anagrafiche{filtriAttivi > 0 ? " (filtro)" : " attive"}</div></div>
          <div className="sync-kpi"><div className="sync-kpi-valore">{statoConteggio.get("attivo") ?? 0}</div><div className="sync-kpi-etichetta">Partner operativi</div></div>
          <div className="sync-kpi"><div className="sync-kpi-valore">{pipeline}</div><div className="sync-kpi-etichetta">In pipeline (contatto → trattativa)</div></div>
          <div className="sync-kpi"><div className="sync-kpi-valore">{aRischio}</div><div className="sync-kpi-etichetta">A rischio incasso (ritardo → bloccato)</div></div>
          <div className="sync-kpi"><div className="sync-kpi-valore">{nuove7}</div><div className="sync-kpi-etichetta">Nuove negli ultimi 7 giorni</div></div>
          <div className="sync-kpi"><div className="sync-kpi-valore">{contattate7}</div><div className="sync-kpi-etichetta">Contattate negli ultimi 7 giorni</div></div>
        </div>

        {totale === 0 ? (
          <div className="vuoto">Nessuna anagrafica in questa fetta. Allarga i filtri.</div>
        ) : (
        <div className="dash-grid">
          <section className="scheda">
            <h2 className="scheda-titolo">Funnel per stato commerciale</h2>
            {STATI.map((s) => (
              <Barra
                key={s}
                etichetta={ETICHETTE_STATO[s]}
                valore={statoConteggio.get(s) ?? 0}
                massimo={maxStato}
                colore={COLORE_STATO[s]}
                href={`/?stato=${s}`}
                dettaglio={`${ETICHETTE_STATO[s]}: ${statoConteggio.get(s) ?? 0} (${pct(statoConteggio.get(s) ?? 0)}% della fetta)`}
              />
            ))}
          </section>

          <section className="scheda">
            <h2 className="scheda-titolo">
              Stati finanziari <span className="scheda-sub">come pagano</span>
            </h2>
            {STATI_FINANZIARI.map((s) => (
              <Barra
                key={s}
                etichetta={ETICHETTE_STATO_FINANZIARIO[s]}
                valore={finanziarioConteggio.get(s) ?? 0}
                massimo={maxFinanziario}
                colore={COLORE_STATO_FINANZIARIO[s]}
                href={`/?statoFinanziario=${s}`}
                dettaglio={`${ETICHETTE_STATO_FINANZIARIO[s]}: ${finanziarioConteggio.get(s) ?? 0} (${pct(finanziarioConteggio.get(s) ?? 0)}% della fetta)`}
              />
            ))}
          </section>

          <section className="scheda">
            <h2 className="scheda-titolo">
              Perimetro di analisi <span className="scheda-sub">catalogo FINANCE</span>
            </h2>
            {STATI_ANALISI.map((s) => (
              <Barra
                key={s}
                etichetta={ETICHETTE_STATO_ANALISI[s]}
                valore={analisiConteggio.get(s) ?? 0}
                massimo={maxAnalisi}
                colore={COLORE_STATO_ANALISI[s]}
                href={`/?statoAnalisi=${s}`}
                dettaglio={`${ETICHETTE_STATO_ANALISI[s]}: ${analisiConteggio.get(s) ?? 0} (${pct(analisiConteggio.get(s) ?? 0)}% della fetta)`}
              />
            ))}
            <Barra
              etichetta="Non analizzate"
              valore={analisiConteggio.get("nessuno") ?? 0}
              massimo={maxAnalisi}
              colore="var(--fill-active)"
              href="/?statoAnalisi=nessuno"
            />
          </section>

          <section className="scheda">
            <h2 className="scheda-titolo">Interessi commerciali</h2>
            {linee.map((i) => (
              <Barra
                key={i}
                etichetta={i}
                valore={interesseConteggio.get(i) ?? 0}
                massimo={maxInteresse}
                colore={coloreInteresse(i)}
                href={`/?interesse=${encodeURIComponent(i)}`}
              />
            ))}
            <p className="testo-guida" style={{ marginTop: 10 }}>
              Un&apos;anagrafica può avere più interessi: le barre non sommano al totale.
            </p>
          </section>

          <section className="scheda">
            <h2 className="scheda-titolo">Tipologie</h2>
            {categorieTop.map((c) => (
              <Barra
                key={c.categoria}
                etichetta={c.categoria}
                valore={c._count._all}
                massimo={maxCategoria}
                href={`/?categoria=${encodeURIComponent(c.categoria)}`}
              />
            ))}
            {altreCategorie > 0 && <Barra etichetta="Altre" valore={altreCategorie} massimo={maxCategoria} colore="var(--fill-active)" />}
          </section>

          <section className="scheda">
            <h2 className="scheda-titolo">Regioni</h2>
            {regioniTop.map((r) => (
              <Barra key={r.regione} etichetta={r.regione ?? "—"} valore={r._count._all} massimo={maxRegione} />
            ))}
            {altreRegioni > 0 && <Barra etichetta="Altre" valore={altreRegioni} massimo={maxRegione} colore="var(--fill-active)" />}
            {senzaRegione > 0 && (
              <p className="testo-guida" style={{ marginTop: 10 }}>{senzaRegione} anagrafiche senza regione.</p>
            )}
          </section>

          <section className="scheda">
            <h2 className="scheda-titolo">Prime 10 città</h2>
            {perCitta.map((c) => (
              <Barra
                key={c.citta}
                etichetta={c.citta ?? "—"}
                valore={c._count._all}
                massimo={maxCitta}
                href={`/?citta=${encodeURIComponent(c.citta ?? "")}`}
              />
            ))}
          </section>

          <section className="scheda">
            <h2 className="scheda-titolo">Contatti per mese <span className="scheda-sub">ultimi 12 mesi</span></h2>
            <div className="dash-mesi" role="img" aria-label="Contatti per mese negli ultimi 12 mesi">
              {mesi.map((m, i) => (
                <div className="dash-mese" key={i} title={`${m.nome}: ${m.totale} contatti`}>
                  <div className="dash-colonna-area">
                    <div className="dash-colonna" style={{ height: `${(m.totale / maxMese) * 100}%` }} />
                  </div>
                  <div className="dash-mese-nome">{m.nome}</div>
                  <div className="dash-mese-valore">{m.totale}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="scheda">
            <h2 className="scheda-titolo">Qualità dei dati</h2>
            <Barra etichetta="Con telefono" valore={conTelefono} massimo={totale} dettaglio={`Con telefono: ${conTelefono} (${pct(conTelefono)}%)`} />
            <Barra etichetta="Con email" valore={conEmail} massimo={totale} dettaglio={`Con email: ${conEmail} (${pct(conEmail)}%)`} />
            <Barra etichetta="Con referenti" valore={conReferente} massimo={totale} dettaglio={`Con referenti: ${conReferente} (${pct(conReferente)}%)`} />
            <Barra etichetta="Riconciliate HubSpot" valore={riconciliate} massimo={totale} dettaglio={`Riconciliate: ${riconciliate} (${pct(riconciliate)}%)`} />
            <p className="testo-guida" style={{ marginTop: 10 }}>
              Percentuali sul totale della fetta ({totale}). Telefono ed email contano anche i referenti.
            </p>
          </section>
        </div>
        )}
      </main>
    </div>
  );
}
