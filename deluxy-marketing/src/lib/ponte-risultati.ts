import { prisma } from "@/lib/db";
import { scriviInOut } from "@/lib/drive-scrittura";
import { ETICHETTA_BRAND } from "@/lib/dominio";
import { mezzanotteRoma, oggiRoma } from "@/lib/fuso";

// RISULTATI App [Brand] — lo STATO ATTUALE nel ponte (§3 del MODELLO).
//
// Una riga per campagna ATTIVA per finestra (7 e 30 giorni), solo numeri e note
// fattuali. Il modello è esplicito su tre punti, e sono tre punti in cui è
// facile sbagliare in buona fede:
//
//  · **NIENTE GIUDIZI.** «ROAS 2,1 — sotto il break-even» è un'opinione: qui va
//    2,1 e basta. Il giudizio lo dà il progetto di brand, che ha il contesto
//    (stagione, obiettivo, storia) che l'app non ha.
//  · **È un DATO DI PIATTAFORMA.** La verità sui ricavi resta Shopify: quello
//    che Google e Meta dichiarano è la loro attribuzione, e va detto nel file,
//    o qualcuno userà questi ROAS per decidere credendoli fatturato.
//  · **Su Meta valgono gli Acquisti** (omni_purchase), mai il «ROAS risultati»
//    di campagne ottimizzate su eventi a monte — sarebbe un numero altissimo e
//    privo di senso.
//
// ⚠️ Le campagne ATTIVE si prendono da `statoPiattaforma === "ENABLED"`, cioè da
// quello che dice Google/Meta, non da `stato` che è il giudizio nostro: nel
// ponte va il fatto, e chi legge deve poterlo confrontare con la sua fonte.

type Riga = {
  nome: string;
  id: string;
  stato: string;
  spesa: number;
  conversioni: number;
  ricavi: number;
  click: number;
  impression: number;
};

const num = (n: number, d = 2) =>
  n.toLocaleString("it-IT", { minimumFractionDigits: d, maximumFractionDigits: d });
const euro = (n: number) => `${num(n)} €`;
/**
 * Il contenuto di una cella di tabella.
 *
 * ⚠️⚠️ IL CARATTERE `|` DENTRO UN NOME SPEZZA LA TABELLA. Non è teoria: metà
 * delle campagne Cake si chiamano `[Cakedesign] | Sales | ITA`, e senza questa
 * riga la tabella arriva al custode con le colonne sfasate — la spesa sotto
 * «Stato», il ROAS sotto «Valore» — e nessuno se ne accorge leggendo il
 * Markdown grezzo. Trovato con l'anteprima, prima che il file nascesse: il
 * ponte è append-only e un file sbagliato non si corregge.
 */
const cella = (v: string) => v.split("|").join("\\|").split("\n").join(" ").split("\r").join("");

/** Un rapporto che non si può calcolare NON è zero: si dichiara. */
const rapporto = (sopra: number, sotto: number, formatta: (v: number) => string) =>
  sotto > 0 ? formatta(sopra / sotto) : "n.d.";

function quando(d: Date): { nome: string; testo: string; giorno: string } {
  const p = new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d);
  const v = (t: string) => p.find((x) => x.type === t)!.value;
  const ora = v("hour") === "24" ? "00" : v("hour");
  const giorno = `${v("year")}-${v("month")}-${v("day")}`;
  return { nome: `${giorno} ${ora}${v("minute")}`, testo: `${giorno} ${ora}:${v("minute")}`, giorno };
}

export type EsitoRisultati =
  | { ok: true; file: { nome: string; righe: number; contenuto?: string }[] }
  | { ok: false; errore: string };

/**
 * Deposita un file RISULTATI per ogni brand che ha campagne attive.
 *
 * ⚠️ Un file PER BRAND, come chiede il modello: i progetti Claude sono di
 * brand, e un file unico costringerebbe ciascuno a filtrare la roba altrui.
 */
export async function depositaRisultati(
  opzioni: { anteprima?: boolean } = {},
): Promise<EsitoRisultati> {
  const oggi = oggiRoma();
  const adesso = new Date();
  const q = quando(adesso);
  const fine = mezzanotteRoma(oggi.anno, oggi.mese, oggi.giorno); // le finestre si chiudono a ieri
  const finestre = [7, 30].map((giorni) => ({
    giorni,
    da: new Date(fine.getTime() - giorni * 86_400_000),
    a: fine,
  }));

  // ⚠️ **Senza `idEsterno` non è un fatto di piattaforma, è un residuo.**
  // `statoPiattaforma` dovrebbe dire «così l'ho letta sulla piattaforma» — ma
  // una campagna che la piattaforma non ha mai nominato non ha un id, e il suo
  // ENABLED viene da un import vecchio che creava le campagne per NOME. Il
  // 25/08/2026 erano due, gemelle di campagne vere col brand appiccicato al
  // nome («[Continuativa] ATC (Cake)»): finivano nel file per il custode come
  // accese, a zero spesa e «(id non noto)», e `[Continuativa] ATC` compariva
  // **due volte** — una vera con la sua spesa e una fantasma a zero.
  //
  // Non si cancellano: qui si smette solo di dichiararle accese, che è ciò che
  // questo file promette di non fare.
  const campagne = await prisma.campagna.findMany({
    where: { statoPiattaforma: "ENABLED", idEsterno: { not: null } },
    select: { id: true, nome: true, brand: true, canale: true, idEsterno: true, statoPiattaforma: true },
  });
  if (campagne.length === 0) return { ok: false, errore: "Nessuna campagna attiva da riportare." };

  const metriche = await prisma.metricaCampagna.findMany({
    where: {
      campagnaId: { in: campagne.map((c) => c.id) },
      data: { gte: finestre[1].da, lt: finestre[1].a },
    },
    select: { campagnaId: true, data: true, spesa: true, conversioni: true, ricavi: true, click: true, impression: true },
  });

  const file: { nome: string; righe: number; contenuto?: string }[] = [];
  const brands = [...new Set(campagne.map((c) => c.brand))].sort();

  for (const brand of brands) {
    const sue = campagne.filter((c) => c.brand === brand);
    const tabella: string[] = [];
    let righe = 0;

    for (const f of finestre) {
      for (const c of sue) {
        const m = metriche.filter((x) => x.campagnaId === c.id && x.data >= f.da && x.data < f.a);
        // ⚠️ Una campagna attiva SENZA metriche nella finestra si scrive lo
        // stesso, con la nota: «non compare» e «ha speso zero» sono due cose
        // diverse, e tacerla la farebbe sembrare inesistente.
        const r: Riga = {
          nome: c.nome,
          id: c.idEsterno ?? "id non noto",
          stato: "ENABLED",
          spesa: m.reduce((s, x) => s + (x.spesa ?? 0), 0),
          conversioni: m.reduce((s, x) => s + (x.conversioni ?? 0), 0),
          ricavi: m.reduce((s, x) => s + (x.ricavi ?? 0), 0),
          click: m.reduce((s, x) => s + (x.click ?? 0), 0),
          impression: m.reduce((s, x) => s + (x.impression ?? 0), 0),
        };
        const note: string[] = [];
        if (m.length === 0) note.push("nessun giorno di dati nella finestra");
        else if (m.length < f.giorni) note.push(`${m.length} giorni di dati su ${f.giorni}`);
        if (c.canale === "meta_ads") note.push("Meta: conversioni = Acquisti");
        tabella.push(
          `| ${cella(r.nome)} (${cella(r.id)}) | ${r.stato} | ${f.giorni}gg (${quando(f.da).giorno} → ${quando(new Date(f.a.getTime() - 1)).giorno}) | ` +
            `${euro(r.spesa)} | ${num(r.conversioni, 1)} | ${euro(r.ricavi)} | ` +
            `${rapporto(r.ricavi, r.spesa, (v) => `${num(v, 2)}×`)} | ` +
            `${rapporto(r.spesa, r.conversioni, euro)} | ` +
            `${rapporto(r.click, r.impression, (v) => `${num(v * 100, 2)}%`)} | ` +
            `${rapporto(r.spesa * 1000, r.impression, euro)} | ${cella(note.join(" · ") || "—")} |`,
        );
        righe++;
      }
    }

    const canali = [...new Set(sue.map((c) => (c.canale === "meta_ads" ? "Meta" : c.canale === "tiktok" ? "TikTok" : "Google Ads")))].join(" + ");
    const contenuto =
      `# RISULTATI App — ${ETICHETTA_BRAND[brand] ?? brand} — ${q.testo}\n` +
      `Fonte: interfaccia ${canali} · Lettura: ${q.testo} · ` +
      `Finestre: 7gg (${quando(finestre[0].da).giorno} → ${quando(new Date(fine.getTime() - 1)).giorno}) e ` +
      `30gg (${quando(finestre[1].da).giorno} → ${quando(new Date(fine.getTime() - 1)).giorno}) · ` +
      `Tipo: DATO di piattaforma (la verità ricavi resta Shopify; riconciliazione a cura dei progetti Claude).\n` +
      `\n` +
      `| Campagna (ID) | Stato | Finestra | Spesa | Conv | Valore | ROAS | CPA | CTR | CPM | Note |\n` +
      `|---|---|---|---|---|---|---|---|---|---|---|\n` +
      tabella.join("\n") +
      `\n\n` +
      // Il limite si dichiara nel file, non fuori: chi lo legge fra un mese non
      // ha questa conversazione sotto mano.
      `⚠️ Le finestre si chiudono a ieri: la giornata di oggi è parziale e non entra.\n` +
      `⚠️ Solo campagne che la piattaforma riporta ENABLED. Le ferme non sono qui.\n` +
      `⚠️ Niente giudizi: solo numeri e note fattuali, come chiede il §3 del modello.\n`;

    const nome = `RISULTATI App ${ETICHETTA_BRAND[brand] ?? brand} ${q.nome}.md`;
    if (opzioni.anteprima) {
      file.push({ nome, righe, contenuto });
      continue;
    }
    const esito = await scriviInOut(nome, contenuto);
    if (!esito.ok) return { ok: false, errore: `${nome}: ${esito.errore}` };
    file.push({ nome, righe });
  }

  return { ok: true, file };
}
