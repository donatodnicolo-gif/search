import { prisma } from "@/lib/db";
import { COLORE_INTERESSE, ETICHETTE_INTERESSE, INTERESSI, type Interesse } from "@/lib/interessi";
import { COLORE_STATO, ETICHETTE_STATO, STATI } from "@/lib/stati";
import { IconaCategoria } from "./IconaCategoria";
import { SbSezione } from "./SbSezione";

// Sidebar di navigazione: tipologie, stati e interessi filtrano l'elenco;
// "Aziende" mostra tutto. I conteggi considerano solo le anagrafiche
// attive; le archiviate vivono nella sezione dedicata in fondo.
export async function Sidebar({
  categoriaAttiva,
  statoAttivo,
  interesseAttivo,
  archivioAttivo = false,
  hubspotAttivo = false,
  dashboardAttiva = false,
  matchAttivo = false,
  contattiAttiva = false,
}: {
  categoriaAttiva?: string | null;
  statoAttivo?: string | null;
  interesseAttivo?: string | null;
  archivioAttivo?: boolean;
  hubspotAttivo?: boolean;
  dashboardAttiva?: boolean;
  matchAttivo?: boolean;
  contattiAttiva?: boolean;
}) {
  const [categorie, archiviate, statiConteggio, interessiConteggio] = await Promise.all([
    prisma.partner.groupBy({
      by: ["categoria"],
      where: { attivo: true },
      _count: { _all: true },
      orderBy: [{ _count: { categoria: "desc" } }, { categoria: "asc" }],
    }),
    prisma.partner.count({ where: { attivo: false } }),
    prisma.partner.groupBy({ by: ["stato"], where: { attivo: true }, _count: { _all: true } }),
    // Gli interessi sono un array: si contano i singoli valori con unnest.
    // Schema sempre qualificato nelle query dirette (pgbouncer).
    prisma.$queryRaw<{ interesse: string; totale: bigint }[]>`
      SELECT unnest("interessi") AS interesse, count(*) AS totale
      FROM "anagrafiche"."Partner" WHERE "attivo" GROUP BY 1`,
  ]);
  const daRisolvere = await prisma.richiestaMatch.count({ where: { risolto: false, esito: { not: "agganciata" } } });
  const totale = categorie.reduce((somma, c) => somma + c._count._all, 0);
  const perStato = new Map(statiConteggio.map((s) => [s.stato, s._count._all]));
  const perInteresse = new Map(interessiConteggio.map((i) => [i.interesse, Number(i.totale)]));

  const globaleAttiva =
    !categoriaAttiva && !statoAttivo && !interesseAttivo && !archivioAttivo && !hubspotAttivo && !dashboardAttiva && !matchAttivo && !contattiAttiva;

  return (
    <aside className="sidebar">
      <nav>
        <SbSezione titolo="Registro">
          <a className={`sb-item${globaleAttiva ? " attiva" : ""}`} href="/">
            <span className="sb-icona"><IconaCategoria categoria="GLOBALE" /></span>
            <span className="sb-nome">Aziende</span>
            <span className="sb-count">{totale}</span>
          </a>
          <a className={`sb-item${dashboardAttiva ? " attiva" : ""}`} href="/dashboard">
            <span className="sb-icona"><IconaCategoria categoria="DASHBOARD" /></span>
            <span className="sb-nome">Dashboard</span>
          </a>
          <a className={`sb-item${contattiAttiva ? " attiva" : ""}`} href="/contatti">
            <span className="sb-icona"><IconaCategoria categoria="CONTATTI" /></span>
            <span className="sb-nome">Contatti</span>
          </a>
        </SbSezione>

        <SbSezione titolo="Tipologie">
          {categorie.map((c) => (
            <a
              key={c.categoria}
              className={`sb-item${categoriaAttiva === c.categoria && !archivioAttivo ? " attiva" : ""}`}
              href={`/?categoria=${encodeURIComponent(c.categoria)}`}
            >
              <span className="sb-icona"><IconaCategoria categoria={c.categoria} /></span>
              <span className="sb-nome">{etichetta(c.categoria)}</span>
              <span className="sb-count">{c._count._all}</span>
            </a>
          ))}
        </SbSezione>

        <SbSezione titolo="Stati">
          {STATI.map((s) => (
            <a
              key={s}
              className={`sb-item${statoAttivo === s ? " attiva" : ""}`}
              href={`/?stato=${s}`}
            >
              <span className="sb-icona"><span className="sb-dot" style={{ background: COLORE_STATO[s] }} /></span>
              <span className="sb-nome">{ETICHETTE_STATO[s]}</span>
              <span className="sb-count">{perStato.get(s) ?? 0}</span>
            </a>
          ))}
        </SbSezione>

        <SbSezione titolo="Interessi">
          {INTERESSI.map((i: Interesse) => (
            <a
              key={i}
              className={`sb-item${interesseAttivo === i ? " attiva" : ""}`}
              href={`/?interesse=${i}`}
            >
              <span className="sb-icona"><span className="sb-dot" style={{ background: COLORE_INTERESSE[i] }} /></span>
              <span className="sb-nome">{ETICHETTE_INTERESSE[i]}</span>
              <span className="sb-count">{perInteresse.get(i) ?? 0}</span>
            </a>
          ))}
        </SbSezione>

        <SbSezione titolo="Archivio">
          <a className={`sb-item${archivioAttivo ? " attiva" : ""}`} href="/?archiviati=1">
            <span className="sb-icona"><IconaCategoria categoria="ARCHIVIO" /></span>
            <span className="sb-nome">Archiviati</span>
            <span className="sb-count">{archiviate}</span>
          </a>
        </SbSezione>

        <SbSezione titolo="Sync">
          <a className={`sb-item${hubspotAttivo ? " attiva" : ""}`} href="/sync-hubspot">
            <span className="sb-icona"><IconaCategoria categoria="SYNC" /></span>
            <span className="sb-nome">Sync HubSpot</span>
          </a>
          <a className={`sb-item${matchAttivo ? " attiva" : ""}`} href="/match">
            <span className="sb-icona"><IconaCategoria categoria="MATCH" /></span>
            <span className="sb-nome">Richieste di aggancio</span>
            {daRisolvere > 0 && <span className="sb-count">{daRisolvere}</span>}
          </a>
        </SbSezione>
      </nav>
    </aside>
  );
}

// "CHEF PRIVATO" → "Chef privato"
export function etichetta(categoria: string): string {
  const minuscolo = categoria.toLowerCase();
  return minuscolo.charAt(0).toUpperCase() + minuscolo.slice(1);
}
