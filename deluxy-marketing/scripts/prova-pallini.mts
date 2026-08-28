// Prova della regola del pallino giallo nel menu.
// Libro UX&UI v1.4 §7 (sistema del Customer Service): prove portate da
// deluxy-messaging/scripts/prova-pallini.mts, con le sezioni di QUESTA app.
//
// ⚠️ I due casi che questa prova esiste per fermare: **tutti i pallini accesi la
// prima volta** (che vorrebbe dire «non ti conosco», non «è arrivato qualcosa»)
// e **il pallino acceso sulla pagina che si sta guardando**.
//
//   npx tsx scripts/prova-pallini.mts
import { decidiPallini, suQuestaPagina } from "../src/lib/pallini";

let male = 0;
const prova = (nome: string, ok: boolean, extra = "") => {
  if (!ok) male++;
  console.log(`${ok ? "  ok " : "  NO "} ${nome}${extra ? " — " + extra : ""}`);
};
const A = "2026-08-27T09:00:00.000Z";
const B = "2026-08-27T10:00:00.000Z";

console.log("=== LA PRIMA VOLTA ===");
{
  const r = decidiPallini({ "/analisi": { ultimo: A }, "/operazioni": { ultimo: A } }, {}, "/", true);
  prova("non accende niente", r.accesi.length === 0, JSON.stringify(r.accesi));
  prova("ma si segna dov'è il mondo", r.visto["/analisi"] === A && r.visto["/operazioni"] === A);
}

console.log("\n=== POI ===");
{
  const r = decidiPallini(
    { "/analisi": { ultimo: B }, "/operazioni": { ultimo: A } },
    { "/analisi": A, "/operazioni": A },
    "/",
    false
  );
  prova("accende solo dove è cambiato", r.accesi.join() === "/analisi", JSON.stringify(r.accesi));
  prova("e NON sposta il segnalibro di quella accesa", r.visto["/analisi"] === A, r.visto["/analisi"]);
}
{
  const r = decidiPallini({ "/analisi": { ultimo: A } }, { "/analisi": A }, "/", false);
  prova("niente di nuovo, niente pallino", r.accesi.length === 0);
}

console.log("\n=== STANDO SULLA PAGINA ===");
{
  const r = decidiPallini({ "/analisi": { ultimo: B } }, { "/analisi": A }, "/analisi", false);
  prova("sulla pagina il pallino non si accende", r.accesi.length === 0, JSON.stringify(r.accesi));
  prova("e il segnalibro avanza da solo", r.visto["/analisi"] === B, r.visto["/analisi"]);
}
{
  const r = decidiPallini({ "/analisi": { ultimo: B } }, { "/analisi": A }, "/analisi?brand=cake", false);
  // ⚠️ Con un parametro nell'indirizzo il percorso resta `/analisi`: qui si
  // passa il percorso, non l'URL intero.
  prova("⚠️ con la query nel percorso NON riconosce la pagina", r.accesi.join() === "/analisi");
}
{
  const r = decidiPallini({ "/analisi": { ultimo: B } }, { "/analisi": A }, "/analisi/abc123", false);
  prova("una sotto-pagina conta come «ci sono sopra»", r.accesi.length === 0);
}
{
  // ⚠️ `/analisi` NON deve prendere `/analisi-campagne`: sono due pagine
  // diverse, e il taglio sulla barra è quello che le tiene separate.
  const r = decidiPallini({ "/analisi": { ultimo: B } }, { "/analisi": A }, "/analisi-campagne", false);
  prova("/analisi-campagne non conta come /analisi", r.accesi.join() === "/analisi");
}

console.log("\n=== IL DATO CHE TORNA INDIETRO ===");
{
  // L'operazione più recente viene eseguita: `ultimo` regredisce. Niente pallino.
  const r = decidiPallini({ "/operazioni": { ultimo: A } }, { "/operazioni": B }, "/", false);
  prova("una data che regredisce non accende", r.accesi.length === 0);
}

console.log("\n=== SEZIONI VUOTE ===");
{
  const r = decidiPallini({ "/operazioni": { ultimo: "" }, "/analisi": { ultimo: B } }, { "/analisi": A }, "/", false);
  prova("una sezione senza niente non accende", !r.accesi.includes("/operazioni"));
  prova("e non finisce nel segnalibro", !("/operazioni" in r.visto));
}

console.log("\n=== IL SEGNALIBRO NON SI ROVINA ===");
{
  const visto = { "/analisi": A };
  const r = decidiPallini({ "/analisi": { ultimo: B } }, visto, "/", false);
  prova("l'originale non viene toccato", visto["/analisi"] === A && r.accesi.length === 1);
}

console.log("\n=== «CI SONO SOPRA» ===");
prova("la radice combacia solo con sé stessa", suQuestaPagina("/", "/") && !suQuestaPagina("/analisi", "/"));
prova("/analisi non prende /analisi-campagne", !suQuestaPagina("/analisi-campagne", "/analisi"));

console.log(male ? `\n${male} PROVE FALLITE` : "\nTutte le prove passate.");
process.exit(male ? 1 : 0);
