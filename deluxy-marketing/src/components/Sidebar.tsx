import { prisma } from "@/lib/db";
import { BRANDS, COLORE_BRAND, ETICHETTA_BRAND, STATI_AZIONE_APERTI } from "@/lib/dominio";
import { Icona } from "./Icona";
import { SbSezione } from "./SbSezione";

// Sidebar di navigazione. `attiva` identifica la sezione corrente;
// per brand si evidenzia la voce del filtro aperto in /azioni.
export async function Sidebar({
  attiva,
  brandAttivo,
}: {
  attiva?: "home" | "analisi" | "azioni" | "campagne" | "drive";
  brandAttivo?: string;
}) {
  const [nAnalisi, nAzioniAperte, nCampagneVive, nDocumenti, aperteBrand] = await Promise.all([
    prisma.analisi.count(),
    prisma.azione.count({ where: { stato: { in: STATI_AZIONE_APERTI } } }),
    prisma.campagna.count({ where: { stato: { in: ["attiva", "in_apprendimento", "in_pausa"] } } }),
    prisma.documentoDrive.count(),
    prisma.azione.groupBy({
      by: ["brand"],
      where: { stato: { in: STATI_AZIONE_APERTI } },
      _count: { _all: true },
    }),
  ]);
  const aperteDi = (brand: string) => aperteBrand.find((r) => r.brand === brand)?._count._all ?? 0;

  const voce = (
    id: NonNullable<typeof attiva>,
    href: string,
    icona: string,
    nome: string,
    count?: number
  ) => (
    <a className={`sb-item${attiva === id ? " attiva" : ""}`} href={href}>
      <span className="sb-icona"><Icona nome={icona} /></span>
      <span className="sb-nome">{nome}</span>
      {count != null && <span className="sb-count">{count}</span>}
    </a>
  );

  return (
    <aside className="sidebar">
      <nav>
        <SbSezione titolo="Marketing">
          {voce("home", "/", "home", "Dashboard")}
          {voce("analisi", "/analisi", "analisi", "Analisi & audit", nAnalisi)}
          {voce("azioni", "/azioni", "azioni", "Azioni", nAzioniAperte)}
          {voce("campagne", "/campagne", "campagne", "Campagne", nCampagneVive)}
          {voce("drive", "/drive", "drive", "Documenti Drive", nDocumenti)}
        </SbSezione>

        <SbSezione titolo="Brand">
          {BRANDS.map((b) => (
            <a
              key={b}
              className={`sb-item${brandAttivo === b ? " attiva" : ""}`}
              href={`/azioni?brand=${b}`}
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
