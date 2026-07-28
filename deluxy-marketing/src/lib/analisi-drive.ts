import { promises as fs } from "fs";
import path from "path";
import { prisma } from "./db";

// Dai documenti del Drive alle Analisi dell'app.
//
// Fino al 28/07/2026 mancava proprio questo pezzo: la sync indicizzava i file
// in `DocumentoDrive` e basta, e le `Analisi` le creava solo
// `scripts/deposita-analisi.mjs`, cioè una sessione Claude che le depositava a
// mano. Risultato: un'analisi scritta su Drive restava una riga in un elenco di
// file, non entrava nella memoria operativa e non poteva generare azioni.
//
// Qui il legame è il percorso: `Analisi.fileDrive` = `DocumentoDrive.percorso`.
// È anche la chiave di idempotenza — un documento già importato non rientra.
// Le analisi depositate a mano NON vengono toccate: si crea solo quello che
// manca, non si sovrascrive mai niente.

// Solo documenti di lavoro: l'archivio è roba vecchia messa da parte e i
// "definitivi" sono le regole, non le analisi.
const CATEGORIE_DA_IMPORTARE = new Set(["analisi", "audit"]);
const ESTENSIONI_TESTO = new Set([".md", ".txt"]);

// ⚠️ La categoria non basta a tenere fuori il vecchio: un file in
// "Flowers/…/Analisi/Archivio/" viene classificato `analisi` (la regola
// dell'archivio arriva dopo quella dell'analisi), e le sessioni marcano i
// documenti sorpassati scrivendolo nel nome ("SUPERATO (act …) - …").
// Importarli riempirebbe la memoria operativa di roba già superata,
// presentandola come analisi di oggi.
function daNonImportare(percorso: string, nome: string): boolean {
  const p = percorso.toLowerCase();
  if (p.includes("/archivio/") || p.startsWith("archivio/")) return true;
  return /^\s*(superato|archiviato|obsoleto)\b/i.test(nome);
}

// Il tipo si legge dal nome del file, che nella cartella ADV è una convenzione
// stabile ("Audit Google Ads Gifts — 9 luglio"). Se non lo dice, resta
// "analisi" generica: meglio generica che classificata a caso.
export function tipoAnalisiDa(nome: string, categoria: string): string {
  const t = nome.toLowerCase();
  if (/report\s*settiman/.test(t)) return "report_settimanale";
  if (/audit/.test(t) && /meta|facebook|instagram/.test(t)) return "audit_meta";
  if (/audit/.test(t) && /google|ads/.test(t)) return "audit_google";
  if (/landing|sito|pagina/.test(t)) return "revisione_landing";
  if (/creativ|copy|annunci/.test(t)) return "revisione_creativi";
  if (/pubblic|audience|segment/.test(t)) return "analisi_pubblici";
  if (/performance|vendite|delta/.test(t)) return "analisi_performance";
  if (categoria === "audit") return "audit_google";
  return "analisi";
}

// Il brand del documento usa un catalogo più largo di quello delle analisi
// ("pubblici", "performance", "altro" sono cartelle, non marchi).
function brandAnalisi(brandDocumento: string): string {
  return ["flowers", "cake", "gifts"].includes(brandDocumento) ? brandDocumento : "cross";
}

// Le prime righe che dicono qualcosa: si saltano titoli markdown, righe vuote e
// separatori. Serve solo a far capire di cosa parla il documento nell'elenco —
// il documento completo resta su Drive, che è la fonte di verità.
export function sintesiDa(testo: string): string | null {
  const righe = testo
    .split(/\r?\n/)
    .map((r) => r.replace(/^[#>*\-\s]+/, "").trim())
    .filter((r) => r.length > 25 && !/^[=_-]+$/.test(r));
  if (righe.length === 0) return null;
  return righe.slice(0, 4).join(" ").slice(0, 600);
}

export type EsitoImportAnalisi = { create: number; saltate: number; errore?: string };

// Importa come Analisi i documenti di categoria analisi/audit che non lo sono
// ancora. `radiceLocale` serve a leggere le prime righe dei .md e .txt: se la
// cartella non è raggiungibile (sync via API da Vercel) l'analisi si crea lo
// stesso, con una sintesi che dice chiaramente che il documento non è stato
// letto. Meglio una riga onesta che nessuna riga.
export async function importaAnalisiDaDrive(
  radiceLocale: string | null,
  limite = 200
): Promise<EsitoImportAnalisi> {
  const esito: EsitoImportAnalisi = { create: 0, saltate: 0 };

  // Una lettura sola per parte, e il confronto in memoria: con un documento
  // per query questa funzione morirebbe come moriva la sync.
  const [documenti, giaImportate] = await Promise.all([
    prisma.documentoDrive.findMany({
      where: { categoria: { in: [...CATEGORIE_DA_IMPORTARE] } },
      orderBy: { modificatoIl: "desc" },
      select: { percorso: true, nome: true, brand: true, categoria: true, estensione: true, modificatoIl: true },
    }),
    prisma.analisi.findMany({ where: { fileDrive: { not: null } }, select: { fileDrive: true } }),
  ]);

  const note = new Set(giaImportate.map((a) => a.fileDrive!));
  const daImportare = documenti.filter(
    (d) => !note.has(d.percorso) && !daNonImportare(d.percorso, d.nome)
  );
  esito.saltate = documenti.length - daImportare.length;

  for (const d of daImportare.slice(0, limite)) {
    let sintesi: string | null = null;
    if (radiceLocale && ESTENSIONI_TESTO.has(d.estensione)) {
      try {
        const testo = await fs.readFile(path.join(radiceLocale, ...d.percorso.split("/")), "utf8");
        sintesi = sintesiDa(testo);
      } catch {
        sintesi = null; // file non leggibile: si dice, non si inventa
      }
    }

    const analisi = await prisma.analisi.create({
      data: {
        titolo: d.nome.replace(/\.[^.]+$/, ""),
        tipo: tipoAnalisiDa(d.nome, d.categoria),
        brand: brandAnalisi(d.brand),
        sintesi:
          sintesi ??
          `Documento su Drive non ancora letto dall'app (${d.estensione || "senza estensione"}): la sintesi si legge aprendo il file. Percorso: ${d.percorso}`,
        fileDrive: d.percorso,
        dataAnalisi: d.modificatoIl,
        origine: "drive-import",
        note: "Creata dalla sincronizzazione del Drive: il documento completo resta su Drive, che è la fonte di verità.",
      },
    });
    esito.create++;
    // Il registro è dove si va a vedere cosa è cambiato: un'analisi comparsa
    // dal nulla senza una riga qui sembrerebbe scritta da qualcuno.
    await prisma.registroEvento
      .create({
        data: {
          autore: "drive-import",
          tipo: "import",
          entita: "analisi",
          entitaId: analisi.id,
          titolo: `Analisi importata dal Drive: ${analisi.titolo}`,
          dettaglio: d.percorso,
        },
      })
      .catch(() => {});
  }

  if (daImportare.length > limite) {
    esito.errore = `Importate ${limite} analisi su ${daImportare.length}: le restanti al prossimo giro (limite per non far scadere la funzione).`;
  }
  return esito;
}
