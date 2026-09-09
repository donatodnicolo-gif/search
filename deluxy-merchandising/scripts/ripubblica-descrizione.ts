// **Riscrive su Shopify la sola descrizione di un prodotto.**
//
// Serve a rimettere in sesto una scheda che è stata pubblicata con la
// descrizione appiattita — il caso di «Magnum Rosé - Ruinart» il 09/09/2026:
// nessun tag, quindi nessuna tab e i tre punti spariti.
//
// ⚠️ Tocca **solo** `descriptionHtml`. Niente varianti, niente prezzi, niente
// metafield, niente stato: su una scheda viva si cambia la cosa rotta e basta.
//
// ⚠️ Prima di scrivere stampa l'HTML che manderebbe. Senza `--applica` non
// tocca niente.
//
//   npx tsx scripts/ripubblica-descrizione.ts RLVCMZ
//   npx tsx scripts/ripubblica-descrizione.ts RLVCMZ --applica

import { caricaEnv } from "./vecchio-gestionale";

async function main() {
  caricaEnv();
  const { prisma } = await import("../src/lib/db");
  const { descrizionePerNegozio } = await import("../src/lib/descrizione-prodotto");
  const { tokenDi } = await import("../src/lib/negozi");
  const { aggiornaProdottoSuShopify } = await import("../src/lib/shopify-admin");

  const codice = process.argv[2];
  const applica = process.argv.includes("--applica");
  if (!codice) { console.log("Serve il codice del prodotto."); process.exit(1); }

  const p = await prisma.prodotto.findFirst({
    where: { codice },
    select: {
      id: true, codice: true, nome: true, categoria: true,
      plusProdotto: true, descrizione: true, sezioniScheda: true,
      pubblicazioni: { select: { negozio: true, shopifyId: true, handle: true, statoShopify: true } },
    },
  });
  if (!p) { console.log(`Nessun prodotto col codice ${codice}.`); process.exit(1); }

  const negozi = await prisma.negozioShopify.findMany({ select: { id: true, nome: true, dominio: true } });
  console.log(`${p.codice} — ${p.nome}\n`);

  for (const riga of p.pubblicazioni) {
    if (!riga.shopifyId) { console.log(`  ${riga.negozio}: non pubblicato, salto.`); continue; }
    const n = negozi.find((x) => x.nome === riga.negozio);
    if (!n) { console.log(`  ${riga.negozio}: negozio sconosciuto, salto.`); continue; }

    const html = await descrizionePerNegozio(p as never, riga.negozio);
    console.log(`\n  ══ ${riga.negozio} (${riga.statoShopify}) — ${riga.handle ?? "?"} ══`);
    if (!html.trim()) {
      // La regola di `descrizionePerNegozio`: stringa vuota vuol dire «non ho
      // niente da dire», e allora **non si tocca** la scheda invece di
      // scriverci il vuoto.
      console.log("  niente da scrivere: la descrizione resterebbe vuota. Non tocco.");
      continue;
    }
    console.log(html);

    if (!applica) continue;
    const token = await tokenDi(n.id);
    if (!token) { console.log(`  ⚠️ ${riga.negozio}: il negozio non sa autenticarsi.`); continue; }
    const r = await aggiornaProdottoSuShopify(token, { shopifyId: riga.shopifyId, descrizioneHtml: html });
    for (const passo of r.passi) console.log(`  ✅ ${passo}`);
    for (const e of r.errori) console.log(`  ⚠️ ${e.campo ? `${e.campo}: ` : ""}${e.messaggio}`);
  }

  if (!applica) console.log("\nProva: niente scritto su Shopify. Rilancia con --applica.");
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
