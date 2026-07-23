import { prisma } from "@/lib/db";
import { BRANDS, COLORE_BRAND, ETICHETTA_BRAND, STATI_AZIONE_APERTI } from "@/lib/dominio";
import { Icona } from "./Icona";
import { SbSezione } from "./SbSezione";

export type VoceSidebar =
  | "home" | "analisi" | "audit" | "azioni" | "campagne" | "landing" | "copy" | "keywords"
  | "meta" | "pubblici" | "drive" | "storico" | "vendite" | "budget" | "mkt";

// Sidebar di navigazione. `attiva` identifica la sezione corrente; `brandAttivo`
// e `canaleAttivo` evidenziano il filtro con cui si sta guardando la pagina.
export async function Sidebar({
  attiva,
  brandAttivo,
  canaleAttivo,
}: {
  attiva?: VoceSidebar;
  brandAttivo?: string;
  canaleAttivo?: string;
}) {
  const [
    nAnalisi, nAudit, nAzioniAperte, nCampagneVive, nLanding, nTestAperti, nDocumenti,
    aperteBrand, aperteCanale, analisiCanale, auditCanale, campagneCanale, nPubblici,
  ] = await Promise.all([
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
    prisma.azione.groupBy({
      by: ["canale"],
      where: { stato: { in: STATI_AZIONE_APERTI } },
      _count: { _all: true },
    }),
    prisma.analisi.groupBy({ by: ["canale"], _count: { _all: true } }),
    prisma.analisi.groupBy({
      by: ["canale"],
      where: { tipo: { in: ["audit_google", "audit_meta", "revisione_creativi", "revisione_landing"] } },
      _count: { _all: true },
    }),
    prisma.campagna.groupBy({
      by: ["canale"],
      where: { stato: { in: ["attiva", "in_apprendimento", "in_pausa"] } },
      _count: { _all: true },
    }),
    prisma.pubblico.count(),
  ]);

  const conta = (
    gruppi: { canale: string | null; _count: { _all: number } }[],
    canale: string
  ) => gruppi.find((r) => r.canale === canale)?._count._all ?? 0;
  const aperteDi = (brand: string) => aperteBrand.find((r) => r.brand === brand)?._count._all ?? 0;

  const voce = (id: VoceSidebar, href: string, icona: string, nome: string, count?: number) => (
    <a className={`sb-item${attiva === id && !canaleAttivo ? " attiva" : ""}`} href={href}>
      <span className="sb-icona"><Icona nome={icona} /></span>
      <span className="sb-nome">{nome}</span>
      {count != null && count !== 0 && <span className="sb-count">{count}</span>}
    </a>
  );

  // Voce filtrata per canale: attiva solo se si sta guardando quel canale.
  const voceCanale = (
    id: VoceSidebar,
    canale: string,
    href: string,
    icona: string,
    nome: string,
    count: number
  ) => (
    <a className={`sb-item${attiva === id && canaleAttivo === canale ? " attiva" : ""}`} href={href}>
      <span className="sb-icona"><Icona nome={icona} /></span>
      <span className="sb-nome">{nome}</span>
      {count !== 0 && <span className="sb-count">{count}</span>}
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
          {voce("pubblici", "/pubblici", "pubblici", "Pubblici", nPubblici)}
        </SbSezione>

        <SbSezione titolo="Google Ads">
          {voceCanale("azioni", "google_ads", "/azioni?canale=google_ads", "azioni", "Azioni Google", conta(aperteCanale, "google_ads"))}
          {voceCanale("analisi", "google_ads", "/analisi?canale=google_ads", "analisi", "Analisi Google", conta(analisiCanale, "google_ads"))}
          {voceCanale("audit", "google_ads", "/audit?canale=google_ads", "audit", "Audit Google", conta(auditCanale, "google_ads"))}
          {voceCanale("campagne", "google_ads", "/campagne?canale=google_ads", "campagne", "Campagne Google", conta(campagneCanale, "google_ads"))}
          {voce("copy", "/copy", "copy", "Copy & annunci")}
          {voce("keywords", "/keywords", "analisi", "Keywords")}
        </SbSezione>

        <SbSezione titolo="Meta">
          {voceCanale("azioni", "meta_ads", "/azioni?canale=meta_ads", "azioni", "Azioni Meta", conta(aperteCanale, "meta_ads"))}
          {voceCanale("analisi", "meta_ads", "/analisi?canale=meta_ads", "analisi", "Analisi Meta", conta(analisiCanale, "meta_ads"))}
          {voceCanale("audit", "meta_ads", "/audit?canale=meta_ads", "audit", "Audit Meta", conta(auditCanale, "meta_ads"))}
          {voceCanale("campagne", "meta_ads", "/campagne?canale=meta_ads", "campagne", "Campagne Meta", conta(campagneCanale, "meta_ads"))}
          {voce("meta", "/meta", "meta", "Test & AIDA", nTestAperti)}
        </SbSezione>

        <SbSezione titolo="Budget">
          {voce("vendite", "/vendite", "vendite", "Budget vendite")}
          {voce("budget", "/budget", "budget", "Budget ADV")}
        </SbSezione>

        <SbSezione titolo="Monitoraggio">
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
