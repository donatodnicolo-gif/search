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
/**
 * Il percorso senza l'estensione: la chiave con cui si riconosce che due file
 * sono lo **stesso** documento in due formati.
 *
 * ⚠️ Non basta il nome: due analisi diverse possono chiamarsi uguale in due
 * cartelle diverse (Analisi/ e Audit/), e confonderle vorrebbe dire buttare
 * via un documento vero.
 */
function senzaEstensione(percorso: string): string {
  return percorso.replace(/\.[^./]+$/, "").toLowerCase();
}

function daNonImportare(percorso: string, nome: string): boolean {
  const p = percorso.toLowerCase();
  if (p.includes("/archivio/") || p.startsWith("archivio/")) return true;
  return /^\s*(superato|archiviato|obsoleto)\b/i.test(nome);
}

// Il tipo si legge dal nome del file, che nella cartella ADV è una convenzione
// stabile ("Audit Google Ads Gifts — 9 luglio"). Se non lo dice, resta
// "analisi" generica: meglio generica che classificata a caso.
// Il CANALE dal nome del file: «Analisi Meta Gifts» è Meta, «Analisi Google
// Ads Flowers» è Google. Prima restava vuoto, e le card dell'elenco non
// potevano dire su quale piattaforma l'analisi parla — che è la prima cosa
// che si vuole sapere (richiesta utente, 26/08/2026).
export function canaleAnalisiDa(nome: string): string | null {
  const t = nome.toLowerCase();
  if (/\bmeta\b|facebook|instagram/.test(t)) return "meta_ads";
  if (/google|\bads\b|adwords/.test(t)) return "google_ads";
  if (/tiktok/.test(t)) return "tiktok";
  if (/klaviyo|email/.test(t)) return "email";
  if (/landing|sito|seo/.test(t)) return "sito";
  return null;
}

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

export type EsitoImportAnalisi = {
  create: number;
  saltate: number;
  /** Fogli di calcolo (o pdf) che sono il GEMELLO di un documento di testo già importato. */
  gemelli: number;
  /** Righe che erano nate su un gemello e ora puntano al testo. */
  promosse: number;
  errore?: string;
};

// Importa come Analisi i documenti di categoria analisi/audit che non lo sono
// ancora. `radiceLocale` serve a leggere le prime righe dei .md e .txt: se la
// cartella non è raggiungibile (sync via API da Vercel) l'analisi si crea lo
// stesso, con una sintesi che dice chiaramente che il documento non è stato
// letto. Meglio una riga onesta che nessuna riga.
export async function importaAnalisiDaDrive(
  radiceLocale: string | null,
  limite = 200
): Promise<EsitoImportAnalisi> {
  const esito: EsitoImportAnalisi = { create: 0, saltate: 0, gemelli: 0, promosse: 0 };

  // Una lettura sola per parte, e il confronto in memoria: con un documento
  // per query questa funzione morirebbe come moriva la sync.
  const [documenti, giaImportate] = await Promise.all([
    prisma.documentoDrive.findMany({
      where: { categoria: { in: [...CATEGORIE_DA_IMPORTARE] } },
      orderBy: { modificatoIl: "desc" },
      select: { percorso: true, nome: true, brand: true, categoria: true, estensione: true, modificatoIl: true },
    }),
    prisma.analisi.findMany({
      where: { fileDrive: { not: null } },
      select: { id: true, fileDrive: true, titolo: true, scheda: true, origine: true },
    }),
  ]);

  const note = new Set(giaImportate.map((a) => a.fileDrive!));

  // ⚠️⚠️ LO STESSO DOCUMENTO DEPOSITATO IN DUE FORMATI NON È DUE ANALISI.
  //
  // Nella cartella ADV ogni analisi arriva come `.md` (il testo) **e** come
  // `.xlsx` (le tabelle): stesso nome, stessa cartella. Fino a oggi ne
  // nascevano due righe, e quella sul foglio di calcolo non poteva essere
  // elaborata — l'elaboratore accetta solo testo — quindi restava «da
  // elaborare» per sempre. Misurato l'11/09/2026: **132 analisi, 94 senza
  // scheda, di cui 46 su file che non si possono leggere** (44 .xlsx, 1 .docx,
  // 1 .pdf), e **23 titoli presenti due volte**. Un contatore che non può
  // tornare a zero viene ignorato, e con lui le analisi vere.
  const baseDiTesto = new Set(
    documenti.filter((d) => ESTENSIONI_TESTO.has(d.estensione)).map((d) => senzaEstensione(d.percorso))
  );
  const gemelli: string[] = [];

  const daImportare = documenti.filter((d) => {
    if (note.has(d.percorso) || daNonImportare(d.percorso, d.nome)) return false;
    if (!ESTENSIONI_TESTO.has(d.estensione) && baseDiTesto.has(senzaEstensione(d.percorso))) {
      gemelli.push(d.percorso);
      return false;
    }
    return true;
  });
  esito.gemelli = gemelli.length;
  esito.saltate = documenti.length - daImportare.length - gemelli.length;

  // ——— E il caso opposto: il foglio è arrivato PRIMA del testo ———
  //
  // Il filtro qui sopra tiene fuori il gemello solo se il testo c'è già. Se
  // l'ordine è rovesciato (l'`.xlsx` indicizzato lunedì, l'`.md` martedì) la
  // riga sul foglio esiste già, e creare la seconda sul testo rifarebbe il
  // doppione da capo. Allora non si crea: si **sposta** quella riga sul testo,
  // che è lo stesso documento in una forma leggibile — le proposte e le
  // risposte già attaccate restano dove sono, attaccate alla stessa analisi.
  //
  // ⚠️ Si sposta solo una riga nata dall'import (`origine: "drive-import"`) e
  // **senza scheda**: una riga depositata a mano, o già elaborata, non si
  // tocca — quella l'ha decisa una persona.
  const perBase = new Map<string, { id: string; titolo: string }>();
  for (const a of giaImportate) {
    if (!a.fileDrive || a.scheda || a.origine !== "drive-import") continue;
    const est = a.fileDrive.match(/\.[^./]+$/)?.[0]?.toLowerCase() ?? "";
    if (ESTENSIONI_TESTO.has(est)) continue;
    perBase.set(senzaEstensione(a.fileDrive), { id: a.id, titolo: a.titolo });
  }

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

    // La riga del gemello, se c'è: si sposta invece di creare la seconda.
    const daPromuovere = ESTENSIONI_TESTO.has(d.estensione)
      ? perBase.get(senzaEstensione(d.percorso))
      : undefined;
    if (daPromuovere) {
      await prisma.analisi.update({
        where: { id: daPromuovere.id },
        data: {
          fileDrive: d.percorso,
          dataAnalisi: d.modificatoIl,
          ...(sintesi ? { sintesi } : {}),
          note: `Creata dalla sincronizzazione del Drive. ⚠️ Nata sul foglio di calcolo dello stesso documento e spostata sul testo (${d.percorso}) l'11/09/2026 o dopo: era lo stesso documento in due formati, e due righe avrebbero voluto dire due analisi.`,
        },
      });
      // ⚠️ Il percorso appena usato entra nei «noti»: senza, un secondo file di
      // testo con lo stesso nome base (un `.txt` accanto a un `.md`)
      // ripromuoverebbe la stessa riga a ogni giro.
      perBase.delete(senzaEstensione(d.percorso));
      note.add(d.percorso);
      esito.promosse++;
      await prisma.registroEvento
        .create({
          data: {
            autore: "drive-import",
            tipo: "sync",
            entita: "analisi",
            entitaId: daPromuovere.id,
            titolo: `Analisi spostata dal foglio di calcolo al testo: ${daPromuovere.titolo}`,
            dettaglio: `Adesso punta a ${d.percorso}. Erano lo stesso documento in due formati.`,
          },
        })
        .catch(() => {});
      continue;
    }

    const analisi = await prisma.analisi.create({
      data: {
        titolo: d.nome.replace(/\.[^.]+$/, ""),
        tipo: tipoAnalisiDa(d.nome, d.categoria),
        canale: canaleAnalisiDa(d.nome),
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
