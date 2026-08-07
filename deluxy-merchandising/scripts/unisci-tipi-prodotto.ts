// **Unisce i valori doppi del campo «Tipo» di Shopify**, e li scrive sul negozio.
//
// Il «Tipo» è testo libero: negli anni ci sono finiti «Torta» e «Torte», «Cena»
// e «Cene», «gift card» e «Gift Card». Non è un problema estetico — spuntando
// «Torte» in una regola si lasciavano fuori 147 torte.
//
// Si scrive **prima su Shopify** e solo dopo in locale, come ogni altra
// correzione dei campi del negozio: se il negozio rifiuta, qui non cambia
// niente e al prossimo import il valore vecchio tornerebbe comunque.
//
//   (dalla cartella deluxy-merchandising)
//   npx tsx scripts/unisci-tipi-prodotto.ts --dry     ← solo il conto
//   npx tsx scripts/unisci-tipi-prodotto.ts           ← scrive davvero

import { readFileSync, writeFileSync } from "node:fs";

/**
 * Da → a. **Deciso da una persona**, non dedotto: quale sia la forma buona non
 * si indovina, e mettere insieme «Crostata» e «Torte» è una scelta di
 * merchandising, non un calcolo su una stringa.
 *
 * `campo` dice cosa si sta correggendo: il **Tipo** o il **Venditore**. Sono lo
 * stesso disordine — testo libero riempito a mano negli anni — e si curano nello
 * stesso modo: prima sul negozio, poi qui.
 */
type Unione =
  | { campo: "tipo" | "fornitore"; da: string[]; a: string }
  // **Non un'unione ma un'assegnazione**: si sceglie per *Tipo* e si scrive il
  // *Venditore* («tutti i vini sono di Deluxy»). Vale la pena tenerla qui e non
  // in uno script a parte: è la stessa disciplina — prima Shopify, poi il
  // locale, con i tentativi — e due script che scrivono gli stessi campi
  // finirebbero per farlo in due modi diversi.
  | { campo: "fornitore"; seTipo: string[]; a: string };

const UNIONI: Unione[] = [
  // — Tipi —
  { campo: "tipo", da: ["Torta", "Torte e Pasticceria", "Crostata"], a: "Torte" },
  { campo: "tipo", da: ["Cappelliera"], a: "Cappelliere" },
  { campo: "tipo", da: ["Cena", "Cena a domicilio", "Cena da favola"], a: "Cene" },
  { campo: "tipo", da: ["Colazione", "colazione"], a: "Colazioni" },
  { campo: "tipo", da: ["gift card"], a: "Gift Card" },
  { campo: "tipo", da: ["Originali", "Originali Natale"], a: "Originali Deluxy" },
  { campo: "tipo", da: ["Drink", "Bevande"], a: "Drinks" },
  { campo: "tipo", da: ["Vino"], a: "Vini" },
  { campo: "tipo", da: ["Aperitivo"], a: "Aperitivi" },
  // «Uova» e non «Uova di Pasqua»: nome scelto dall'utente, che accorpa anche i
  // sette «Uovo di Pasqua». Perde il riferimento alla stagione, ed è una scelta
  // sua — qui si scrive quello che è stato deciso, non quello che sembra meglio.
  { campo: "tipo", da: ["Uova di Pasqua", "Uovo di Pasqua"], a: "Uova" },
  { campo: "tipo", da: ["Buoni regalo"], a: "Gift Card" },
  { campo: "tipo", da: ["degustazione"], a: "Degustazioni & Aperitivi" },
  // — Fornitori —
  // Si tiene la grafia **più diffusa**: è quella che il negozio usa di più, ed è
  // anche quella che fa scrivere di meno. «Colazioni & Brunch» e «Fiori
  // Originali» restano fuori: non sono stati chiesti, e unirli sarebbe una
  // decisione presa al posto di qualcuno.
  { campo: "fornitore", da: ["DELUXY"], a: "Deluxy" },
  { campo: "fornitore", da: ["CLIVATI 1969"], a: "Clivati 1969" },
  { campo: "fornitore", da: ["Cantina Franco"], a: "CANTINA FRANCO" },
  { campo: "fornitore", da: ["142 RESTAURANT"], a: "142 Restaurant" },
  { campo: "fornitore", da: ["DEODATO"], a: "Deodato" },
  { campo: "fornitore", da: ["MARYFLOR"], a: "Maryflor" },
  // — 07/08/2026, chiesti dall'utente —
  // «CDM» è Cake Design Milano, spezzato in tredici tipi per occasione (Adulti,
  // Bambini, Matrimoni, Laurea…). Accorpandoli **si perde quella distinzione**
  // dal negozio: resta nei tag, non più nel Tipo. È una scelta di merchandising
  // presa dall'utente, scritta qui perché non si deduca dopo.
  {
    campo: "tipo",
    da: [
      "CDM Adulti", "CDM FunnyCake", "CDM Bambini", "CDM Domani", "CDM Torte", "CDM Matrimoni",
      "CDM Cream Tart", "CDM Romantiche", "CDM Laurea", "CDM Nascite e Battesimi", "CDM Brand",
      "CDM Natale", "CDM Pasqua",
    ],
    a: "Cake Design",
  },
  // Tutti i vini passano a Deluxy: **il fornitore vero sparisce dal negozio**
  // (erano CANTINA FRANCO 89 e 142 Restaurant 41). Chiesto esplicitamente.
  { campo: "fornitore", seTipo: ["Vini"], a: "Deluxy" },
];

async function main() {
  for (const line of readFileSync("./.env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
  const secco = process.argv.includes("--dry");

  const { prisma } = await import("../src/lib/db");
  const { negoziAttivi } = await import("../src/lib/negozi");
  const { graphqlNegozio, erroriDi } = await import("../src/lib/shopify-scrittura");

  const negozi = await negoziAttivi();
  console.log("Negozi collegati:", negozi.map((n) => n.nome).join(", "));

  for (const u of UNIONI) {
    const colonna = u.campo === "tipo" ? "tipoShopify" : "vendorShopify";
    const campoShopify = u.campo === "tipo" ? "productType" : "vendor";
    const prodotti = await prisma.prodotto.findMany({
      // O si sceglie per **valore da correggere**, o per **Tipo** quando si sta
      // assegnando il venditore a una famiglia di prodotti.
      where: "seTipo" in u ? { tipoShopify: { in: u.seTipo } } : { [colonna]: { in: u.da } },
      select: {
        id: true,
        nome: true,
        shopifyId: true,
        tipoShopify: true,
        vendorShopify: true,
        collezioniShopify: { select: { collezione: { select: { negozio: true } } }, take: 1 },
      },
    });
    // Chi ha già il valore giusto non si tocca: sarebbe una chiamata a Shopify
    // per non cambiare niente (dei 140 vini, 10 erano già di Deluxy).
    const conGid = prodotti.filter(
      (p) => p.shopifyId && (u.campo === "tipo" ? p.tipoShopify : p.vendorShopify) !== u.a,
    );
    const partenza = "seTipo" in u ? `Tipo «${u.seTipo.join("», «")}»` : `«${u.da.join("», «")}»`;
    console.log(`\n${partenza} → ${u.campo} «${u.a}»: ${prodotti.length} prodotti (${conGid.length} da cambiare)`);
    if (secco) continue;
    // **Il ritorno indietro, prima di partire.** Dopo la scrittura il valore
    // vecchio non esiste più né qui né sul negozio: senza questo file l'unione
    // sarebbe irreversibile, e un'operazione irreversibile su dati veri non si
    // fa senza una via d'uscita.
    if (conGid.length > 0) {
      const nome = `ripristino-${u.campo}-${u.a.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.json`;
      writeFileSync(
        nome,
        JSON.stringify(
          conGid.map((p) => ({
            id: p.id,
            shopifyId: p.shopifyId,
            nome: p.nome,
            tipo: p.tipoShopify,
            fornitore: p.vendorShopify,
          })),
          null,
          2,
        ),
      );
      console.log(`  ritorno indietro salvato in ${nome}`);
    }

    let fatti = 0;
    let falliti = 0;
    for (const p of conGid) {
      // Il negozio del prodotto: si sa dalle collezioni a cui appartiene. Se
      // quello non funziona si prova con gli altri — il gid è di un negozio
      // solo, e con tre negozi collegati indovinare non serve: si verifica.
      const primo = p.collezioniShopify[0]?.collezione.negozio;
      const ordine = [...negozi].sort((a, b) => (a.nome === primo ? -1 : b.nome === primo ? 1 : 0));
      let ok = false;
      let ultimoErrore = "";
      for (const n of ordine) {
        const r = await graphqlNegozio(
          n.dominio,
          n.token,
          `mutation($input: ProductInput!) { productUpdate(input: $input) { product { id } userErrors { field message } } }`,
          { input: { id: p.shopifyId, [campoShopify]: u.a } },
        );
        const err = erroriDi(r, "productUpdate");
        if (err.length === 0 && r.corpo.data?.productUpdate?.product) {
          ok = true;
          break;
        }
        ultimoErrore = err.join(" · ") || "prodotto non trovato su questo negozio";
      }
      if (ok) {
        // **Il pooler chiude le connessioni lunghe** (P1017: «server has closed
        // the connection»), ed è già successo a metà dei 102 Clivati. Non è un
        // dato sbagliato: è la connessione caduta, e basta rifare la scrittura.
        // Senza questo, un giro da 300 prodotti muore a caso e va rilanciato a
        // mano — e chi lo rilancia non sa a che punto era arrivato.
        for (let tentativo = 1; ; tentativo++) {
          try {
            await prisma.prodotto.update({ where: { id: p.id }, data: { [colonna]: u.a } });
            break;
          } catch (e) {
            if (tentativo >= 3) throw e;
            await new Promise((r) => setTimeout(r, 1500 * tentativo));
          }
        }
        fatti++;
        if (fatti % 25 === 0) process.stdout.write(`\r  aggiornati ${fatti}/${conGid.length}`);
      } else {
        falliti++;
        if (falliti <= 3) console.log(`\n  ! ${p.nome.slice(0, 40)}: ${ultimoErrore}`);
      }
    }
    console.log(`\r  aggiornati ${fatti}/${conGid.length}${falliti ? ` · ${falliti} non riusciti` : ""}`);
  }

  console.log("\n— dopo —");
  const gt = await prisma.prodotto.groupBy({ by: ["tipoShopify"], where: { tipoShopify: { not: null } }, _count: true });
  const gv = await prisma.prodotto.groupBy({ by: ["vendorShopify"], where: { vendorShopify: { not: null } }, _count: true });
  for (const u of UNIONI) {
    const g = (u.campo === "tipo" ? gt.map((x) => ({ v: x.tipoShopify, n: x._count })) : gv.map((x) => ({ v: x.vendorShopify, n: x._count })));
    const resta = "seTipo" in u ? [] : g.filter((x) => u.da.includes(x.v as string));
    const arrivo = g.find((x) => x.v === u.a);
    console.log(`  [${u.campo}] «${u.a}»: ${arrivo?.n ?? 0}${resta.length ? ` · restano ${resta.map((x) => `«${x.v}» ${x.n}`).join(", ")}` : " · nessun residuo"}`);
  }
  await prisma.$disconnect();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
