import { Badge } from "@/components/Badge";
import { Sidebar } from "@/components/Sidebar";
import { avviaSyncDrive } from "@/lib/azioni";
import { prisma } from "@/lib/db";
import { driveDir } from "@/lib/drive";
import {
  CATEGORIE_DRIVE,
  COLORE_BRAND,
  ETICHETTA_BRAND,
  ETICHETTA_CATEGORIA_DRIVE,
  formattaDataOra,
} from "@/lib/dominio";

export const dynamic = "force-dynamic";

function dimensioneLeggibile(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

// Indice in sola lettura della cartella ufficiale "ADV DELUXY SRL".
export default async function PaginaDrive({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string; categoria?: string; q?: string }>;
}) {
  const { brand, categoria, q } = await searchParams;
  const [documenti, totale, ultimaSync] = await Promise.all([
    prisma.documentoDrive.findMany({
      where: {
        ...(brand ? { brand } : {}),
        ...(categoria ? { categoria } : {}),
        ...(q ? { OR: [{ nome: { contains: q } }, { percorso: { contains: q } }] } : {}),
      },
      orderBy: { modificatoIl: "desc" },
      take: 300,
    }),
    prisma.documentoDrive.count(),
    prisma.documentoDrive.findFirst({ orderBy: { sincronizzatoIl: "desc" }, select: { sincronizzatoIl: true } }),
  ]);

  const marcheDrive = ["flowers", "cake", "gifts", "cross", "pubblici", "performance", "altro"];

  return (
    <div className="layout">
      <Sidebar attiva="drive" />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Documenti Drive</h1>
            <p className="page-sub">
              Indice in sola lettura della cartella ufficiale “ADV DELUXY SRL” ({totale} documenti
              indicizzati{ultimaSync ? `, ultima sincronizzazione ${formattaDataOra(ultimaSync.sincronizzatoIl)}` : ""}).
              La fonte di verità resta il Drive: l&apos;app non lo scrive mai.
            </p>
          </div>
          <form action={avviaSyncDrive}>
            <button className="btn" type="submit">Sincronizza ora</button>
          </form>
        </div>

        <div className="nota-info">
          <span className="nota-icona">◈</span>
          <span>
            Cartella locale: <b>{driveDir()}</b> (Google Drive per Desktop). Per cambiarla impostare
            <b> DRIVE_ADV_DIR</b> nel file .env. Sincronizzazione anche da terminale: <b>npm run sync-drive</b>.
          </span>
        </div>

        <form className="filtri" method="get">
          <input type="search" name="q" placeholder="Cerca per nome o percorso…" defaultValue={q ?? ""} />
          <select name="brand" defaultValue={brand ?? ""}>
            <option value="">Tutte le aree</option>
            {marcheDrive.map((b) => (
              <option key={b} value={b}>{ETICHETTA_BRAND[b] ?? b}</option>
            ))}
          </select>
          <select name="categoria" defaultValue={categoria ?? ""}>
            <option value="">Tutte le categorie</option>
            {CATEGORIE_DRIVE.map((c) => (
              <option key={c} value={c}>{ETICHETTA_CATEGORIA_DRIVE[c]}</option>
            ))}
          </select>
          <button className="btn small" type="submit">Filtra</button>
        </form>

        {documenti.length === 0 ? (
          <div className="vuoto">
            Nessun documento indicizzato: premi “Sincronizza ora” (serve la cartella Drive locale).
          </div>
        ) : (
          <div className="tabella-wrap">
            <table>
              <thead>
                <tr>
                  <th>Documento</th>
                  <th>Area</th>
                  <th>Categoria</th>
                  <th className="num">Dimensione</th>
                  <th>Modificato</th>
                </tr>
              </thead>
              <tbody>
                {documenti.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <div className="cella-nome">{d.nome}</div>
                      <div className="cella-sub">{d.cartella}</div>
                    </td>
                    <td>
                      <Badge testo={ETICHETTA_BRAND[d.brand] ?? d.brand} colore={COLORE_BRAND[d.brand] ?? "var(--text-tertiary)"} />
                    </td>
                    <td className="cella-muta">{ETICHETTA_CATEGORIA_DRIVE[d.categoria] ?? d.categoria}</td>
                    <td className="num">{dimensioneLeggibile(d.dimensione)}</td>
                    <td className="cella-muta">{formattaDataOra(d.modificatoIl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
