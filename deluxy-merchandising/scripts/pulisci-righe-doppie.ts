// **Toglie dalle sezioni le righe che ripetono un'altra riga.**
//
// Residuo dell'unione dell'08/09: sul padre «Gruè» la sezione «Ingredienti e
// Allergeni» finiva così —
//
//   Base: pan di Spagna
//   Farcitura: chantilly alla vaniglia…
//   Copertura: mousse al cioccolato…
//   Ingredienti: Base: pan di Spagna     ← la prima riga, con un'etichetta davanti
//
// L'etichetta veniva dall'import dal vecchio gestionale, che quando due sezioni
// di là confluivano in una nostra premetteva il nome di provenienza. Unendo poi
// «Ingredienti» dentro «Ingredienti e Allergeni», quella riga è tornata a
// convivere con l'originale: due stringhe diverse, lo stesso contenuto.
//
// Qui si toglie una riga solo quando **è un'altra riga con un prefisso
// «Etichetta:» davanti**, o quando è identica a meno di accenti e maiuscole.
// Niente di più aggressivo: due righe che si somigliano ma non coincidono sono
// due informazioni.
//
//   npx tsx scripts/pulisci-righe-doppie.ts            # prova, non scrive
//   npx tsx scripts/pulisci-righe-doppie.ts --applica

import { caricaEnv } from "./vecchio-gestionale";

const senza = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Il testo dopo un prefisso «Etichetta: », se c'è ed è corto. */
function senzaEtichetta(riga: string): string | null {
  const i = riga.indexOf(":");
  if (i <= 0 || i > 28) return null;
  const resto = riga.slice(i + 1).trim();
  return resto || null;
}

export function pulisci(testo: string): string {
  const righe = testo.split("\n").map((r) => r.trim()).filter(Boolean);
  if (righe.length < 2) return testo;
  const chiavi = righe.map(senza);
  const tenute: string[] = [];
  righe.forEach((r, i) => {
    // identica a una precedente
    if (chiavi.indexOf(chiavi[i]) !== i) return;
    // è un'altra riga con un'etichetta davanti
    const nudo = senzaEtichetta(r);
    if (nudo && chiavi.some((k, j) => j !== i && k === senza(nudo))) return;
    tenute.push(r);
  });
  return tenute.join("\n");
}

async function main() {
  caricaEnv();
  const { prisma } = await import("../src/lib/db");
  const applica = process.argv.includes("--applica");

  const prodotti = await prisma.prodotto.findMany({ select: { id: true, nome: true, codice: true, sezioniScheda: true } });
  const cambi: { id: string; scheda: Record<string, Record<string, string>> }[] = [];
  let righeTolte = 0;
  const esempi: string[] = [];

  for (const p of prodotti) {
    const s = p.sezioniScheda;
    if (!s || typeof s !== "object" || Array.isArray(s)) continue;
    const scheda = s as Record<string, Record<string, string>>;
    let toccato = false;
    const nuova: Record<string, Record<string, string>> = {};
    for (const [sito, val] of Object.entries(scheda)) {
      if (!val || typeof val !== "object" || Array.isArray(val)) { nuova[sito] = val; continue; }
      const dentro: Record<string, string> = {};
      for (const [nome, testo] of Object.entries(val)) {
        if (typeof testo !== "string") continue;
        const p2 = pulisci(testo);
        const prima = testo.split("\n").map((r) => r.trim()).filter(Boolean).length;
        const dopo = p2.split("\n").filter(Boolean).length;
        // ⚠️ Si riscrive **solo se una riga è davvero sparita**. `pulisci`
        // rinormalizza anche spazi e righe vuote: senza questo controllo il
        // conto diceva 1.304 prodotti «da sistemare» mentre i doppioni veri
        // erano poche decine — e avremmo tolto le righe vuote che in un testo
        // lungo sono la separazione fra i paragrafi, per niente.
        if (dopo < prima) {
          toccato = true;
          righeTolte += prima - dopo;
          if (esempi.length < 8) esempi.push(`${(p.codice ?? "").padEnd(14)} ${sito.padEnd(16)} «${nome}» − ${prima - dopo} righe`);
          dentro[nome] = p2;
        } else {
          dentro[nome] = testo;
        }
      }
      nuova[sito] = dentro;
    }
    if (toccato) cambi.push({ id: p.id, scheda: nuova });
  }

  console.log(`Prodotti da sistemare: ${cambi.length} · righe ripetute da togliere: ${righeTolte}`);
  for (const e of esempi) console.log("   " + e);
  if (!applica) { console.log("\nProva: niente scritto. Rilancia con --applica."); await prisma.$disconnect(); return; }
  let n = 0;
  for (let i = 0; i < cambi.length; i += 100) {
    const blocco = cambi.slice(i, i + 100);
    await prisma.$transaction(blocco.map((c) => prisma.prodotto.update({ where: { id: c.id }, data: { sezioniScheda: c.scheda } })));
    n += blocco.length;
  }
  console.log(`Sistemati ${n} prodotti.`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
