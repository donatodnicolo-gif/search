// GLI STIPENDI DEI VALET NON SONO PAGAMENTI AI PARTNER.
//
// Trovato il 27/08/2026 incrociando i valet della piattaforma consegne con le
// controparti di banca: **77.348 €** di bonifici ai valet stavano nella
// categoria «Partner che eseguono gli ordini», che è marcata `quotaPartner` e
// quindi **fuori dal conto economico**. Doppio effetto, e il secondo non lo
// vedeva nessuno:
//   1. quel costo non entrava nel conto economico;
//   2. gonfiava «girato ai partner», cioè **abbassava la quota Deluxy misurata
//      dalla banca** — la stessa misura che fino al 24/08 era la fonte primaria
//      del bilancio e che oggi resta il ripiego dichiarato.
//
// ⭐ **La prova non è il nome, sono le CAUSALI.** Col criterio dell'utente del
// 28/07 (numero d'ordine = fioraio, nome di mese = valet), lette una per una
// sui più grossi: «Spinolo Luigi — stipendio», «stipendio giugno», «Bonifico
// stipendio-compensi-emolumenti (novembre e dicembre 2025)», «ANTONIANI
// LORENZO — 6/2026», «maggio», «aprile», «Deluxy Novembre + Dicembre»,
// «14sima». **Zero causali con un numero d'ordine.**
//
// ⭐⭐ **SI SPOSTANO LE REGOLE, NON LE CONTROPARTI.** Guardando chi le
// classificava è saltato fuori che non c'è nessuna regola esatta sui nomi: sono
// **regole per COGNOME** che contengono («spinolo», «antoniani», «kurihara»,
// «orosco»…). Spostare quelle è più giusto che scrivere ventun regole esatte:
// una sola copre tutte le grafie della stessa persona, oggi e domani.
//
// ⚠️ **Il caso «cassoli» è il motivo per cui questo script non è banale.** Una
// regola sola copre DUE persone che vanno in due posti diversi:
//   · **Cassoli Renato** è un **dipendente** a libro paga (roster 2026,
//     23.719 € l'anno) → i suoi bonifici sono stipendio;
//   · **Cassoli Marco** no → «da classificare come consegne» (utente, 27/08).
// Si risolve con la specificità: il CFO fa vincere il match più lungo, quindi
// «cassoli renato» batte «cassoli». Si scrive la regola specifica e si lascia
// quella generica a valere per gli altri.
//
// ⚠️⚠️ **DA SOLO QUESTO SCRIPT NON MUOVE IL CONTO ECONOMICO.** Dal 31/07 la
// categoria del singolo movimento la decide **Finance**: le regole di qui si
// applicano solo dove Finance non ha ancora niente. Dopo aver scritto, va
// premuto **«↻ Riclassifica tutto»** in `/spese` di Finance.
//
// ⚠️ Il **costo del venduto non cambia**: la categoria delle consegne viene
// comunque sostituita dal conto della piattaforma (vedi `src/lib/consegne.ts`).
// Quello che si rimette a posto è «girato ai partner» e, con lui, la quota
// Deluxy misurata dalla banca.
//
// Uso, dalla cartella dell'app:
//   npx tsx@4 --env-file=.env scripts/valet-non-sono-partner.ts          (prova a vuoto)
//   npx tsx@4 --env-file=.env scripts/valet-non-sono-partner.ts scrivi
import { readFileSync } from "node:fs";
import { prisma } from "../src/lib/db";
import { fetchSpeseBanca } from "../src/lib/finance";

const scrivi = process.argv.includes("scrivi");
const ELENCO = process.env.VALET_JSON ?? "C:/Users/nicol/AppData/Local/Temp/claude/valet-2026.json";

const PARTNER = "Partner che eseguono gli ordini";
const CONSEGNE = "Consegne (valet e corrieri)";
const STIPENDI = "Stipendi dei dipendenti";

/** Chi è a libro paga: i suoi bonifici sono stipendio, non consegne. */
const A_STIPENDI = ["cassoli renato", "mannini", "adonato"];
/** Chi resta dov'è, per decisione dell'utente. */
const NON_TOCCARE = ["consegna amin"];

/**
 * ⚠️⚠️ **LE REGOLE PER COGNOME CHE PESCANO ANCHE ALTRI.**
 *
 * Prima di spostare una regola bisogna guardare **tutto** quello che cattura,
 * non solo le controparti da cui si è partiti: una regola che contiene un
 * cognome prende anche gli omonimi, e spostarla li porta via con sé senza che
 * si veda. Controllato su tutte le controparti di banca del 2026:
 *   · «coppola» prende anche **Anna coppola** (50 €), che valet non è;
 *   · «lorusso» prende anche **Lorusso Antonella** (35 €), diversa da Donatella.
 * Per questi due la regola generica **resta dov'è** — quelle due persone sono
 * fioriste finché non lo smentisce una causale — e si scrivono regole col nome
 * intero, che vincono perché più lunghe.
 *
 * ⭐ Il controllo ha anche trovato il contrario: «orosco» prende **Manuel
 * Orosco** (3.550 €), che è lo stesso valet di «Giacomo Manuel Orosco» sotto
 * un'altra grafia. Il confronto per nome non l'aveva visto (gli mancava
 * «giacomo»): spostando la regola per cognome entra anche lui, ed è giusto.
 */
const NON_SPOSTARE = ["coppola", "lorusso"];
/** Le regole col nome intero, per chi sopra è rimasto scoperto. */
const SPECIFICHE_CONSEGNE = ["coppola andreas", "andreas coppola", "lorusso donatella"];

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
   .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

const eur = (n: number) => Math.round(n).toLocaleString("it-IT") + " €";

async function main() {
  console.log(scrivi ? "SCRITTURA" : "PROVA A VUOTO", "· i valet escono dai pagamenti ai partner\n");

  const valet: { nome: string; paga: number }[] = JSON.parse(readFileSync(ELENCO, "utf8"));
  const spese = await fetchSpeseBanca({ anno: 2026, dal: 1, al: 12 });
  if (!spese.ok) { console.log("Banca non disponibile: mi fermo."); return; }

  const categorie = await prisma.categoriaCosto.findMany({ include: { regole: true } });
  const perNome = new Map(categorie.map((c) => [c.nome, c]));
  const catConsegne = perNome.get(CONSEGNE);
  const catStipendi = perNome.get(STIPENDI);
  const catPartner = perNome.get(PARTNER);
  if (!catConsegne || !catStipendi || !catPartner) {
    console.log("Manca una categoria: non invento nomi.", [...perNome.keys()].join(" · "));
    return;
  }

  // Una controparte si abbina a UN valet solo, il più grosso per primo.
  const abbinata = new Map<string, string>();
  for (const v of [...valet].sort((a, b) => b.paga - a.paga)) {
    const pezzi = norm(v.nome).split(" ").filter((p) => p.length >= 3);
    if (pezzi.length < 2) continue;
    for (const c of spese.dati.controparti) {
      if (abbinata.has(c.controparte)) continue;
      if (pezzi.every((p) => norm(c.controparte).includes(p))) abbinata.set(c.controparte, v.nome);
    }
  }

  // Per ogni controparte da spostare, la regola che oggi la porta fra i partner.
  const perRegola = new Map<string, { match: string; importo: number; nomi: string[] }>();
  let restaComE = 0;
  for (const c of spese.dati.controparti) {
    if (!abbinata.has(c.controparte)) continue;
    const inPartner = (c.categorie ?? []).find((k) => k.nome === PARTNER);
    if (!inPartner || !(inPartner.uscite ?? 0)) continue;
    const n = norm(c.controparte);
    if (NON_TOCCARE.some((x) => n.includes(x))) { restaComE += inPartner.uscite ?? 0; continue; }
    // La regola vincente fra quelle dei partner: la più specifica.
    let vinta: { id: string; match: string; peso: number } | null = null;
    for (const r of catPartner.regole) {
      const m = norm(r.match);
      if (!m) continue;
      if (r.esatto ? n === m : n.includes(m)) {
        const peso = m.length + (r.esatto ? 1000 : 0);
        if (!vinta || peso > vinta.peso) vinta = { id: r.id, match: r.match, peso };
      }
    }
    const chiave = vinta?.id ?? "SENZA REGOLA::" + c.controparte;
    const v = perRegola.get(chiave) ?? { match: vinta?.match ?? c.controparte, importo: 0, nomi: [] };
    v.importo += inPartner.uscite ?? 0;
    v.nomi.push(c.controparte);
    perRegola.set(chiave, v);
  }

  console.log("LE REGOLE DA SPOSTARE (una per persona, non una per grafia):");
  let versoConsegne = 0, versoStipendi = 0;
  const azioni: { id: string | null; match: string; dest: string; importo: number }[] = [];
  const scoperti: string[] = [];
  for (const [id, v] of [...perRegola.entries()].sort((a, b) => b[1].importo - a[1].importo)) {
    if (NON_SPOSTARE.includes(norm(v.match))) {
      scoperti.push(v.match);
      console.log(
        `  «${v.match}»`.padEnd(28) + ` ${eur(v.importo).padStart(11)}  ·  NON si sposta: prende anche altri`
      );
      continue;
    }
    // ⚠️⚠️ **L'EFFETTO VERO DI UNA REGOLA È QUELLO CHE PRENDE LEI, non quello
    // che avevo abbinato io.** Spostare «orosco» porta via anche «Manuel
    // Orosco» (3.550 €), che il confronto per nome non aveva agganciato perché
    // gli mancava «giacomo». Contare solo le controparti di partenza direbbe un
    // numero più basso del vero, e la differenza si scoprirebbe dopo — che è il
    // modo peggiore.
    const m = norm(v.match);
    const presi = spese.dati.controparti.filter((c) => norm(c.controparte).includes(m));
    const vero = presi.reduce(
      (acc, c) => acc + ((c.categorie ?? []).find((k) => k.nome === PARTNER)?.uscite ?? 0),
      0
    );
    const inPiu = vero - v.importo;
    versoConsegne += vero;
    azioni.push({ id: id.startsWith("SENZA REGOLA::") ? null : id, match: v.match, dest: CONSEGNE, importo: vero });
    console.log(
      `  «${v.match}»`.padEnd(28) + ` ${eur(vero).padStart(11)}  →  ${CONSEGNE}   [${presi.length} controparti]` +
        (inPiu > 1 ? `   ⚠️ di cui ${eur(inPiu)} da grafie che il confronto per nome non aveva visto` : "")
    );
  }
  if (scoperti.length) {
    console.log("\n  Al posto di quelle, regole col nome intero (vincono perché più lunghe):");
    for (const s of SPECIFICHE_CONSEGNE) {
      const quanto = spese.dati.controparti
        .filter((c) => norm(c.controparte).includes(s))
        .reduce((acc, c) => acc + ((c.categorie ?? []).find((k) => k.nome === PARTNER)?.uscite ?? 0), 0);
      const gia = catConsegne.regole.some((r) => norm(r.match) === s);
      console.log(`  «${s}»`.padEnd(28) + ` ${eur(quanto).padStart(11)}  →  ${CONSEGNE}` + (gia ? "   (c'è già)" : ""));
      versoConsegne += quanto;
    }
  }

  // Le regole più specifiche per chi è a libro paga.
  console.log("\nLE REGOLE SPECIFICHE DA CREARE (vincono su quelle per cognome, perché più lunghe):");
  const specifiche: { match: string; dest: string }[] = [];
  for (const s of A_STIPENDI) {
    const gia = catStipendi.regole.some((r) => norm(r.match) === s);
    const quanto = spese.dati.controparti
      .filter((c) => norm(c.controparte).includes(s))
      .reduce((acc, c) => acc + ((c.categorie ?? []).find((k) => k.nome === PARTNER)?.uscite ?? 0), 0);
    console.log(`  «${s}»`.padEnd(28) + ` ${eur(quanto).padStart(11)}  →  ${STIPENDI}` + (gia ? "   (c'è già)" : ""));
    if (!gia) specifiche.push({ match: s, dest: STIPENDI });
    versoStipendi += quanto;
    versoConsegne -= quanto;
  }

  console.log("\n  regole da spostare:", azioni.length, "· regole specifiche da creare:", specifiche.length);
  console.log("  → " + CONSEGNE + ":", eur(versoConsegne));
  console.log("  → " + STIPENDI + ":", eur(versoStipendi));
  console.log("  resta dov'è per decisione dell'utente:", eur(restaComE));
  console.log("\n  «girato ai partner» scende di", eur(versoConsegne + versoStipendi) + ".");

  if (!scrivi) {
    console.log("\nNiente è stato scritto. Per applicare: aggiungere «scrivi» al comando.");
    return;
  }

  let mosse = 0, create = 0;
  for (const a of azioni) {
    if (a.id) { await prisma.regolaCosto.update({ where: { id: a.id }, data: { categoriaId: catConsegne.id } }); mosse++; }
    else { await prisma.regolaCosto.create({ data: { match: a.match, esatto: true, categoriaId: catConsegne.id } }); create++; }
  }
  for (const s of specifiche) {
    await prisma.regolaCosto.create({ data: { match: s.match, esatto: false, categoriaId: catStipendi.id } });
    create++;
  }
  for (const s of SPECIFICHE_CONSEGNE) {
    if (catConsegne.regole.some((r) => norm(r.match) === s)) continue;
    await prisma.regolaCosto.create({ data: { match: s, esatto: false, categoriaId: catConsegne.id } });
    create++;
  }
  console.log(`\nScritto: ${mosse} regole spostate, ${create} create.`);
  console.log("⚠️ Ora, in Finance → /spese, premere «↻ Riclassifica tutto».");
}

main().finally(() => prisma.$disconnect());
