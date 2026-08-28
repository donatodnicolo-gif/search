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
  const r = decidiPallini({ "/": { ultimo: A }, "/eventi": { ultimo: A } }, {}, "/clienti", true);
  prova("non accende niente", r.accesi.length === 0, JSON.stringify(r.accesi));
  prova("ma si segna dov'è il mondo", r.visto["/"] === A && r.visto["/eventi"] === A);
}

console.log("\n=== POI ===");
{
  const r = decidiPallini(
    { "/": { ultimo: B }, "/eventi": { ultimo: A } },
    { "/": A, "/eventi": A },
    "/clienti",
    false
  );
  prova("accende solo dove è cambiato", r.accesi.join() === "/", JSON.stringify(r.accesi));
  prova("e NON sposta il segnalibro di quella accesa", r.visto["/"] === A, r.visto["/"]);
}
{
  const r = decidiPallini({ "/eventi": { ultimo: A } }, { "/eventi": A }, "/clienti", false);
  prova("niente di nuovo, niente pallino", r.accesi.length === 0);
}

console.log("\n=== STANDO SULLA PAGINA ===");
{
  const r = decidiPallini({ "/": { ultimo: B } }, { "/": A }, "/", false);
  prova("sulla pagina il pallino non si accende", r.accesi.length === 0, JSON.stringify(r.accesi));
  prova("e il segnalibro avanza da solo", r.visto["/"] === B, r.visto["/"]);
}
{
  // ⚠️ La radice combacia SOLO con sé stessa: da /controllo il registro «/»
  // non conta come «ci sono sopra», o il suo pallino non si accenderebbe mai.
  const r = decidiPallini({ "/": { ultimo: B } }, { "/": A }, "/controllo", false);
  prova("da un'altra pagina la radice si accende", r.accesi.join() === "/");
}
{
  const r = decidiPallini({ "/controllo": { ultimo: B } }, { "/controllo": A }, "/controllo?stato=x", false);
  // ⚠️ Con un parametro nell'indirizzo il percorso resta `/controllo`: qui si
  // passa il percorso, non l'URL intero.
  prova("⚠️ con la query nel percorso NON riconosce la pagina", r.accesi.join() === "/controllo");
}
{
  const r = decidiPallini({ "/eventi": { ultimo: B } }, { "/eventi": A }, "/eventi/abc", false);
  prova("una sotto-pagina conta come «ci sono sopra»", r.accesi.length === 0);
}

console.log("\n=== IL DATO CHE TORNA INDIETRO ===");
{
  // L'ordine più recente viene annullato: `ultimo` regredisce. Niente pallino.
  const r = decidiPallini({ "/": { ultimo: A } }, { "/": B }, "/clienti", false);
  prova("una data che regredisce non accende", r.accesi.length === 0);
}

console.log("\n=== SEZIONI VUOTE ===");
{
  const r = decidiPallini({ "/controllo": { ultimo: "" }, "/": { ultimo: B } }, { "/": A }, "/clienti", false);
  prova("una sezione senza niente non accende", !r.accesi.includes("/controllo"));
  prova("e non finisce nel segnalibro", !("/controllo" in r.visto));
}

console.log("\n=== IL SEGNALIBRO NON SI ROVINA ===");
{
  const visto = { "/eventi": A };
  const r = decidiPallini({ "/eventi": { ultimo: B } }, visto, "/clienti", false);
  prova("l'originale non viene toccato", visto["/eventi"] === A && r.accesi.length === 1);
}

console.log("\n=== «CI SONO SOPRA» ===");
prova("la radice combacia solo con sé stessa", suQuestaPagina("/", "/") && !suQuestaPagina("/controllo", "/"));
prova("/eventi non prende /eventi-clienti", !suQuestaPagina("/eventi-clienti", "/eventi"));

console.log(male ? `\n${male} PROVE FALLITE` : "\nTutte le prove passate.");
process.exit(male ? 1 : 0);
