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
  const r = decidiPallini({ "/fatture": { ultimo: A }, "/transazioni": { ultimo: A } }, {}, "/", true);
  prova("non accende niente", r.accesi.length === 0, JSON.stringify(r.accesi));
  prova("ma si segna dov'è il mondo", r.visto["/fatture"] === A && r.visto["/transazioni"] === A);
}

console.log("\n=== POI ===");
{
  const r = decidiPallini(
    { "/fatture": { ultimo: B }, "/transazioni": { ultimo: A } },
    { "/fatture": A, "/transazioni": A },
    "/",
    false
  );
  prova("accende solo dove è cambiato", r.accesi.join() === "/fatture", JSON.stringify(r.accesi));
  prova("e NON sposta il segnalibro di quella accesa", r.visto["/fatture"] === A, r.visto["/fatture"]);
}
{
  const r = decidiPallini({ "/fatture": { ultimo: A } }, { "/fatture": A }, "/", false);
  prova("niente di nuovo, niente pallino", r.accesi.length === 0);
}

console.log("\n=== STANDO SULLA PAGINA ===");
{
  const r = decidiPallini({ "/scadenzario": { ultimo: B } }, { "/scadenzario": A }, "/scadenzario", false);
  prova("sulla pagina il pallino non si accende", r.accesi.length === 0, JSON.stringify(r.accesi));
  prova("e il segnalibro avanza da solo", r.visto["/scadenzario"] === B, r.visto["/scadenzario"]);
}
{
  const r = decidiPallini({ "/scadenzario": { ultimo: B } }, { "/scadenzario": A }, "/scadenzario?q=abc", false);
  // ⚠️ Con un parametro nell'indirizzo il percorso resta `/scadenzario`: qui si
  // passa il percorso, non l'URL intero. La prova sta a dire che se qualcuno un
  // giorno ci passasse l'URL intero, il pallino resterebbe acceso mentre si guarda.
  prova("⚠️ con la query nel percorso NON riconosce la pagina", r.accesi.join() === "/scadenzario");
}
{
  const r = decidiPallini({ "/transazioni": { ultimo: B } }, { "/transazioni": A }, "/transazioni/import", false);
  prova("una sotto-pagina conta come «ci sono sopra»", r.accesi.length === 0);
}

console.log("\n=== IL DATO CHE TORNA INDIETRO ===");
{
  // La transazione più recente viene registrata: `ultimo` regredisce. Niente pallino.
  const r = decidiPallini({ "/transazioni": { ultimo: A } }, { "/transazioni": B }, "/", false);
  prova("una data che regredisce non accende", r.accesi.length === 0);
}

console.log("\n=== SEZIONI VUOTE ===");
{
  const r = decidiPallini({ "/scadenzario": { ultimo: "" }, "/fatture": { ultimo: B } }, { "/fatture": A }, "/", false);
  prova("una sezione senza niente non accende", !r.accesi.includes("/scadenzario"));
  prova("e non finisce nel segnalibro", !("/scadenzario" in r.visto));
}

console.log("\n=== IL SEGNALIBRO NON SI ROVINA ===");
{
  const visto = { "/fatture": A };
  const r = decidiPallini({ "/fatture": { ultimo: B } }, visto, "/", false);
  prova("l'originale non viene toccato", visto["/fatture"] === A && r.accesi.length === 1);
}

console.log("\n=== «CI SONO SOPRA» ===");
prova("la radice combacia solo con sé stessa", suQuestaPagina("/", "/") && !suQuestaPagina("/fatture", "/"));
prova("/fatture non prende /fatture-storico", !suQuestaPagina("/fatture-storico", "/fatture"));

console.log(male ? `\n${male} PROVE FALLITE` : "\nTutte le prove passate.");
process.exit(male ? 1 : 0);
