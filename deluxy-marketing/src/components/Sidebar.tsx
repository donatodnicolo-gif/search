import { prisma } from "@/lib/db";
import { BRANDS, COLORE_BRAND, ETICHETTA_BRAND, STATI_AZIONE_APERTI } from "@/lib/dominio";
import { Icona } from "./Icona";
import { SbSezione } from "./SbSezione";

export type VoceSidebar =
  | "home" | "analisi" | "audit" | "azioni" | "campagne" | "landing" | "copy"
  | "meta" | "drive" | "storico" | "vendite" | "budget" | "mkt";

// Sidebar di navigazione. `attiva` identifica la sezione corrente;
// per brand si evidenzia la voce della pagina brand aperta.
export async function Sidebar({
  attiva,
  brandAttivo,
}: {
  attiva?: VoceSidebar;
  brandAttivo?: string;
}) {
  const [nAnalisi, nAudit, nAzioniAperte, nCampagneVive, nLanding, nTestAperti, nDocumenti, aperteBrand] =
    await Promise.all([
      prisma.analisi.count(),
      prisma.analisi.count({
        where: { tipo: { in: ["audit_google", "audit_meta", "revisione_creativi", "revisione_landing"] } },
      }),
      prisma.azione.count({ where: { stato: { in: STATI_AZIONE_APERTI } } }),
      prisma.campagna.count({ where: { stato: { in: ["attiva", "in_apprendimento", "in_pausa"] } } }),
      prisma.landingPage.count(),
      prisma.testMeta.count({ where: { stato: { in: ["idea", "pianificato", "in_corso"] } } }),
      prisma.documentoDrive.count(),
      prisma.azione.groupBy({
        by: ["brand"],
        where: { stato: { in: STATI_AZIONE_APERTI } },
        _count: { _all: true },
      }),
    ]);
  const aperteDi = (brand: string) => aperteBrand.find((r) => r.brand === brand)?._count._all ?? 0;

  const voce = (id: VoceSidebar, href: string, icona: string, nome: string, count?: number) => (
    <a className={`sb-item${attiva === id ? " attiva" : ""}`} href={href}>
      <span className="sb-icona"><Icona nome={icona} /></span>
      <span className="sb-nome">{nome}</span>
      {count != null && count !== 0 && <span className="sb-count">{count}</span>}
    </a>
  );

  return (
    <aside className="sidebar">
      <nav>
        <SbSezione titolo="Marketing">
          {voce("home", "/", "home", "Dashboard")}
          {voce("analisi", "/analisi", "analisi", "Analisi", nAnalisi)}
          {voce("audit", "/audit", "audit", "Audit", nAudit)}
          {voce("azioni", "/azioni", "azioni", "Azioni", nAzioniAperte)}
          {voce("campagne", "/campagne", "campagne", "Campagne", nCampagneVive)}
          {voce("landing", "/landing", "landing", "Landing page", nLanding)}
          {voce("copy", "/copy", "copy", "Copy & annunci")}
          {voce("meta", "/meta", "meta", "Meta & test", nTestAperti)}
        </SbSezione>

        <SbSezione titolo="Monitoraggio">
          {voce("vendite", "/vendite", "vendite", "Vendite")}
          {voce("budget", "/budget", "budget", "Budget ADV")}
          {voce("mkt", "/mkt", "metriche", "MKT vs 2025")}
        </SbSezione>

        <SbSezione titolo="Archivio">
          {voce("drive", "/drive", "drive", "Documenti Drive", nDocumenti)}
          {voce("storico", "/storico", "storico", "Storico")}
        </SbSezione>

        <SbSezione titolo="Brand">
          {BRANDS.map((b) => (
            <a
              key={b}
              className={`sb-item${brandAttivo === b ? " attiva" : ""}`}
              href={`/brand/${b}`}
            >
              <span className="sb-icona">
                <span className="sb-dot" style={{ background: COLORE_BRAND[b] }} />
              </span>
              <span className="sb-nome">{ETICHETTA_BRAND[b]}</span>
              <span className="sb-count">{aperteDi(b) || ""}</span>
            </a>
          ))}
        </SbSezione>
      </nav>
    </aside>
  );
}
