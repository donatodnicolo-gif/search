// **Il menù nelle note delle colazioni** (07/09/2026, chiesto dall'utente: «per
// tutte le colazioni mettere in note variante o prodotto il menù indicato, così
// come per i fiori abbiamo l'indicazione sui numeri di fiori»).
//
// Per ogni prodotto che è una colazione o un brunch (Tipo del negozio
// «Colazioni», «Colazioni & Brunch», «Brunch», o il nome che lo dice) legge il
// menù — prima da un metafield del negozio che parli di menù, poi dalla
// descrizione — e lo scrive nella nota «cosa comprende»:
//   - sul PRODOTTO (`Prodotto.note`) se ha una sola variante o nessuna;
//   - su OGNI VARIANTE (`Variante.note`) se ne ha più d'una, perché è lì che si
//     guarda quando si sceglie il formato (come il numero di fiori sta nel nome
//     della variante dei bouquet).
// Non sovrascrive una nota già scritta a mano (salvo `--sovrascrivi`), non tocca
// le schede unite a un'altra (`unitoAId`) e non cancella niente.
//
//   (dalla cartella deluxy-merchandising)
//   npx tsx scripts/menu-colazioni.ts              # prova a secco: solo il rapporto
//   npx tsx scripts/menu-colazioni.ts --applica    # scrive le note
//   npx tsx scripts/menu-colazioni.ts --applica --sovrascrivi   # anche dove una nota c'è già
//   npx tsx scripts/menu-colazioni.ts --solo-attivi              # solo statoShopify = ACTIVE
//
// Rapporto in docs/menu-colazioni-<data>.md: per ogni prodotto il testo scelto e
// da dove viene, e in fondo l'elenco di quelli in cui il menù NON si è
// riconosciuto — da compilare a mano nella scheda (Panoramica → «Cosa comprende»).
//
// Carica .env a mano (tsx non lo fa) PRIMA di importare i moduli con Prisma.
// Niente top-level await: il progetto è CJS.

import { readFileSync, writeFileSync } from "node:fs";

async function main() {
  for (const line of readFileSync("./.env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
  const { prisma } = await import("../src/lib/db");
  const { estraiMenu } = await import("../src/lib/menu-colazioni");
  const { eColazione } = await import("../src/lib/prezzi-scheda");

  const applica = process.argv.includes("--applica");
  const sovrascrivi = process.argv.includes("--sovrascrivi");
  const soloAttivi = process.argv.includes("--solo-attivi");

  const candidati = await prisma.prodotto.findMany({
    where: {
      unitoAId: null,
      ...(soloAttivi ? { statoShopify: "ACTIVE" } : {}),
      OR: [{ tipoShopify: { contains: "olazion", mode: "insensitive" } }, { tipoShopify: { contains: "brunch", mode: "insensitive" } }, { nome: { contains: "colazion", mode: "insensitive" } }, { nome: { contains: "brunch", mode: "insensitive" } }],
    },
    select: {
      id: true,
      nome: true,
      codice: true,
      tipoShopify: true,
      statoShopify: true,
      descrizione: true,
      note: true,
      metafieldShopify: true,
      varianti: { select: { id: true, nome: true, sku: true, note: true }, orderBy: { creataIl: "asc" } },
    },
    orderBy: { nome: "asc" },
  });
  const prodotti = candidati.filter((p) => eColazione(p));

  type Riga = { p: (typeof prodotti)[number]; dove: "prodotto" | "varianti"; testo: string | null; fonte: string; esito: string };
  const righe: Riga[] = [];
  let scritteProdotto = 0;
  let scritteVarianti = 0;

  for (const p of prodotti) {
    const menu = estraiMenu(p);
    const dove: Riga["dove"] = p.varianti.length > 1 ? "varianti" : "prodotto";
    if (!menu) {
      righe.push({ p, dove, testo: null, fonte: "—", esito: "menù non riconosciuto: da compilare a mano" });
      continue;
    }
    const fonte = menu.fonte === "metafield" ? `metafield ${menu.chiave}` : "descrizione";
    if (dove === "prodotto") {
      const giaScritta = !!p.note?.trim();
      if (giaScritta && !sovrascrivi) {
        righe.push({ p, dove, testo: menu.testo, fonte, esito: `lasciata: la nota del prodotto c'è già («${p.note!.slice(0, 60)}…»)` });
        continue;
      }
      if (applica) await prisma.prodotto.update({ where: { id: p.id }, data: { note: menu.testo } });
      scritteProdotto++;
      righe.push({ p, dove, testo: menu.testo, fonte, esito: applica ? (giaScritta ? "nota del prodotto sovrascritta" : "nota del prodotto scritta") : "da scrivere sul prodotto" });
    } else {
      const daFare = p.varianti.filter((v) => sovrascrivi || !v.note?.trim());
      if (daFare.length === 0) {
        righe.push({ p, dove, testo: menu.testo, fonte, esito: `lasciata: tutte le ${p.varianti.length} varianti hanno già una nota` });
        continue;
      }
      if (applica) await prisma.variante.updateMany({ where: { id: { in: daFare.map((v) => v.id) } }, data: { note: menu.testo } });
      scritteVarianti += daFare.length;
      righe.push({ p, dove, testo: menu.testo, fonte, esito: `${applica ? "scritta" : "da scrivere"} su ${daFare.length} di ${p.varianti.length} varianti (${daFare.map((v) => v.nome).join(", ")})` });
    }
  }

  const oggi = new Date().toISOString().slice(0, 10);
  const senza = righe.filter((r) => !r.testo);
  const out: string[] = [];
  out.push(`# Menù nelle note delle colazioni — ${oggi}${applica ? "" : " (PROVA A SECCO, niente scritto)"}`);
  out.push("");
  out.push(`Candidati letti: ${candidati.length} · colazioni/brunch riconosciuti: ${prodotti.length} · con menù trovato: ${righe.length - senza.length} · senza: ${senza.length}.`);
  out.push(`${applica ? "Scritte" : "Da scrivere"}: ${scritteProdotto} note di prodotto, ${scritteVarianti} note di variante. Opzioni: ${[applica && "--applica", sovrascrivi && "--sovrascrivi", soloAttivi && "--solo-attivi"].filter(Boolean).join(" ") || "nessuna"}.`);
  out.push("");
  out.push("Regola: una sola variante (o nessuna) → nota del prodotto; più varianti → la stessa nota su ogni variante senza nota. Le note già scritte a mano restano (salvo --sovrascrivi).");
  out.push("");
  out.push("## Menù trovati");
  out.push("");
  out.push("| Prodotto | Stato | Tipo | Dove | Fonte | Esito | Menù |");
  out.push("|---|---|---|---|---|---|---|");
  for (const r of righe.filter((x) => x.testo)) {
    out.push(`| ${r.p.nome} \`${r.p.codice}\` | ${r.p.statoShopify ?? "—"} | ${r.p.tipoShopify ?? "—"} | ${r.dove} | ${r.fonte} | ${r.esito} | ${r.testo!.replace(/\|/g, "/")} |`);
  }
  out.push("");
  out.push("## Da compilare a mano (menù non riconosciuto nella descrizione)");
  out.push("");
  if (senza.length === 0) out.push("Nessuno.");
  else {
    out.push("| Prodotto | Stato | Tipo | Varianti | Inizio della descrizione |");
    out.push("|---|---|---|---|---|");
    for (const r of senza) out.push(`| ${r.p.nome} \`${r.p.codice}\` | ${r.p.statoShopify ?? "—"} | ${r.p.tipoShopify ?? "—"} | ${r.p.varianti.map((v) => v.nome).join(", ") || "—"} | ${(r.p.descrizione ?? "").slice(0, 160).replace(/\|/g, "/") || "(vuota)"} |`);
  }
  const file = `docs/menu-colazioni-${oggi}${applica ? "" : "-prova"}.md`;
  writeFileSync(file, out.join("\n") + "\n", "utf8");
  console.log(out.slice(0, 4).join("\n"));
  console.log(`Rapporto: ${file}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
