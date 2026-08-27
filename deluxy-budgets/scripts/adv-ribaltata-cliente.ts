// LA PUBBLICITÀ CHE PAGA UN CLIENTE NON È PUBBLICITÀ NOSTRA.
//
// Decisione dell'utente (27/08/2026): il conto Google Ads **956-137-8913** è di
// **Blu Logistica**, un cliente B2B che ne rimborsa **interamente** la spesa.
// Quindi quel costo non deve stare fra le spese del conto economico delle
// maison: non è pubblicità che facciamo noi per vendere, è una spesa che
// anticipiamo per conto di un cliente.
//
// Perché è venuto fuori: incrociando la voce ADV della banca con Deluxy
// Marketing, quel conto era l'unico che in Marketing **non compariva mai** —
// e la ragione non era un difetto di collegamento, è che le sue campagne non
// sono nostre.
//
// COSA FA: crea la categoria «ADV ribaltata al cliente» con tipo di P&L
// **ESCLUSA** (partita di giro, come la quota dei partner) e una regola che
// riconosce il conto dal suo numero — `ads9561378913` — invece che dai tre modi
// in cui la banca scrive lo stesso addebito («GOOGLE *ADS…, cc@google.com»,
// «GOOGLE*ADS…, CC GOOGLE.COM», «Google ADS…, DUBLIN 4»). Una regola sul
// NUMERO copre anche la quarta grafia che comparirà domani.
//
// ⚠️ NON è marcata `quotaPartner`: quella dice «denaro girato a chi esegue un
// ordine», e questo non lo è. Sarebbe finita dentro «girato ai partner»,
// falsando la quota Deluxy misurata dalla banca.
//
// ⚠️⚠️ **DA SOLA QUESTA REGOLA NON MUOVE ANCORA IL CONTO ECONOMICO.** Dal
// 31/07/2026 la categoria del singolo movimento la decide **Finance**: le
// regole di Budgets si applicano solo dove Finance non ha ancora niente, e su
// questi tre addebiti Finance ha già scritto «Pubblicità». Perché la
// fotografia si rifaccia bisogna premere **«↻ Riclassifica tutto»** in
// `/spese` di Finance. Finché non si fa, qui non cambia un euro — ed è scritto
// in cima al CFO proprio perché non sembri rotto.
//
// ⚠️⚠️ **LA TRAPPOLA È DOPO, NON ADESSO — e va decisa PRIMA di fatturare.**
// Confermato dall utente il 27/08: Blu Logistica **non e ancora stata
// fatturata**. Quindi oggi il conto e simmetrico e onesto: il costo e fuori e
// il ricavo non c e. Ma il giorno che la fattura si emette, il ricavo entra in
// Finance sotto una tipologia B2B e viene contato — mentre il costo resta
// escluso. Da quel momento il conto economico guadagna **1.553 EUR che non
// esistono**.
//
// Le due strade coerenti, e sono alternative:
//   (a) PARTITA DI GIRO PIENA: quando si fattura, il ricavo resta fuori come il
//       costo. Perche si possa fare, quella fattura deve essere riconoscibile —
//       una tipologia sua in Finance (es. «Ribaltamento ADV»), non «Consegne»,
//       dove sarebbe indistinguibile dal resto;
//   (b) DENTRO TUTT E DUE: il costo torna nel conto economico ma fuori
//       dall attribuzione alla maison, e il ricavo resta dov e.
// Quello che NON va bene e lasciare le cose come stanno e poi fatturare: e
// l unica delle tre combinazioni che scrive un utile falso.
//
// ⚠️ Il rimborso di Blu Logistica **non risulta fatturato** in Finance su
// Gen–Lug 2026: cercato fra tutte le fatture dei 55 clienti, nessuna col suo
// nome. Escludendo il costo senza che il ricavo ci sia, l'utile sale di quella
// cifra: sono ~1.305 € su Gen–Lug (1.553 € sull'anno). È poco, ma va saputo —
// e il posto per chiuderlo è la fatturazione, non questo script.
//
// Uso, dalla cartella dell'app:
//   npx tsx@4 --env-file=.env scripts/adv-ribaltata-cliente.ts          (prova a vuoto)
//   npx tsx@4 --env-file=.env scripts/adv-ribaltata-cliente.ts scrivi
import { prisma } from "../src/lib/db";

const NOME = "ADV ribaltata al cliente";
const MATCH = "ads9561378913";
const scrivi = process.argv.includes("scrivi");

const eur = (n: number) => n.toLocaleString("it-IT", { maximumFractionDigits: 0 }) + " €";

async function main() {
  console.log(scrivi ? "SCRITTURA" : "PROVA A VUOTO", "· categoria «" + NOME + "»\n");

  const esistente = await prisma.categoriaCosto.findUnique({
    where: { nome: NOME },
    include: { regole: true },
  });
  if (esistente) {
    console.log("La categoria esiste già:", esistente.tipoPL, "· regole:", esistente.regole.length);
    if (esistente.regole.some((r) => r.match.toLowerCase() === MATCH)) {
      console.log("E la regola c'è già. Niente da fare.");
      return;
    }
  }

  console.log("Categoria da creare:");
  console.log("  nome        ", NOME);
  console.log("  tipoPL      ", "ESCLUSA  (fuori dal conto economico: la paga il cliente)");
  console.log("  voceCE      ", "ESCLUSA");
  console.log("  quotaPartner", "false    (non è denaro girato a chi esegue un ordine)");
  console.log("\nRegola da creare:  contiene «" + MATCH + "»\n");

  // Cosa sposterebbe, sui nomi che la banca conosce oggi.
  const rig = await prisma.$queryRawUnsafe<{ n: bigint }[]>("SELECT 1 as n").catch(() => []);
  void rig;
  console.log("Addebiti che la regola riconoscerà (grafie viste in banca):");
  for (const g of [
    "GOOGLE *ADS9561378913, cc@google.com, IE",
    "GOOGLE*ADS9561378913, CC GOOGLE.COM, IE",
    "Google ADS9561378913, DUBLIN 4, IE",
  ]) {
    console.log("  ", g, "→", g.toLowerCase().replace(/\s/g, "").includes(MATCH) ? "SÌ" : "no");
  }
  console.log("\nMisurato il 27/08/2026: " + eur(1305) + " su Gen–Lug, " + eur(1553) + " sull'anno.");

  if (!scrivi) {
    console.log("\nNiente è stato scritto. Per applicare: aggiungere «scrivi» al comando.");
    console.log("E dopo, in Finance → /spese, premere «↻ Riclassifica tutto»: senza, il conto economico non si muove.");
    return;
  }

  const cat =
    esistente ??
    (await prisma.categoriaCosto.create({
      data: {
        nome: NOME,
        tipoPL: "ESCLUSA",
        voceCE: "ESCLUSA",
        quotaPartner: false,
        descrizione:
          "Campagne pubblicitarie pagate da noi ma RIMBORSATE per intero da un cliente (conto Google Ads 956-137-8913, Blu Logistica, che in fatturazione figura come B2B). Non è pubblicità nostra: non entra nel conto economico delle maison e non va nel monte ADV. Se un domani il rimborso smettesse, questa categoria va rifatta — non è una spesa da nascondere, è una partita di giro.",
      },
    }));
  await prisma.regolaCosto.create({ data: { match: MATCH, esatto: false, categoriaId: cat.id } });
  console.log("Scritto: categoria «" + cat.nome + "» e regola «" + MATCH + "».");
  console.log("⚠️ Ora, in Finance → /spese, premere «↻ Riclassifica tutto»: la categoria del");
  console.log("   singolo movimento la decide Finance, e finché non ripassa qui non cambia niente.");
}

main().finally(() => prisma.$disconnect());
