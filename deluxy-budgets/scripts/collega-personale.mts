// COLLEGA IL VECCHIO ROSTER ALLE SCHEDE DI PERSONALE (06/09/2026, decisione
// dell'utente: «personale e team devono arrivare da app personale»).
//
// Da oggi Budgets legge persone e squadre da Deluxy Personale. Delle sue
// tabelle `Dipendente` e `Team` restano in uso SOLO gli attributi di
// pianificazione (maison a cui attribuire il costo, note; per le squadre il
// ruolo economico, colore, ordine, note), agganciati all'id di Personale nella
// colonna `personaleId`. Questo script fa l'aggancio UNA volta, per nome
// normalizzato (come fa il Hub): dopo, il legame è per id e il nome può
// cambiare dove abita.
//
// Cosa NON fa: non crea persone in Personale, non cancella righe qui (le righe
// senza corrispondenza restano, e le pagine le elencano come «nomi che
// Personale non conosce» finché qualcuno non decide cosa sono).
//
// Uso:
//   npx tsx@4 --env-file=.env scripts/collega-personale.mts          → prova a vuoto
//   npx tsx@4 --env-file=.env scripts/collega-personale.mts scrivi   → applica

import { prisma } from "../src/lib/db";
import { fetchOrganicoPersonale } from "../src/lib/personale";
import { nomeNormalizzato } from "../src/lib/organico";

const SCRIVI = process.argv.includes("scrivi");
const ANNO = Number(process.env.ANNO_ROSTER) || new Date().getUTCFullYear();

const organico = await fetchOrganicoPersonale();
if (organico.stato !== "ok") {
  console.error(`Personale non risponde: ${organico.stato === "errore" ? organico.motivo : "manca PERSONALE_API_KEY nel .env"}`);
  process.exit(1);
}

const perNome = new Map(organico.persone.map((p) => [nomeNormalizzato(p.nome), p]));
const funzPerNome = new Map(organico.funzioni.map((f) => [nomeNormalizzato(f.nome), f]));

const dipendenti = await prisma.dipendente.findMany({ where: { year: ANNO }, orderBy: { nome: "asc" } });
const team = await prisma.team.findMany({ orderBy: { ordine: "asc" } });

console.log(`${SCRIVI ? "SCRIVO" : "PROVA A VUOTO"} — anno ${ANNO}: ${dipendenti.length} righe Dipendente, ${team.length} righe Team; Personale: ${organico.persone.length} persone, ${organico.funzioni.length} funzioni\n`);

let collegati = 0, giaCollegati = 0, senza = 0;
for (const d of dipendenti) {
  if (d.personaleId) { giaCollegati++; console.log(`  = ${d.nome} — già collegata`); continue; }
  const p = perNome.get(nomeNormalizzato(d.nome));
  if (!p) { senza++; console.log(`  ? ${d.nome} — NON in Personale (resta scollegata, dichiarata in pagina)`); continue; }
  // Una scheda di Personale può agganciare UNA riga per anno: se un'altra
  // riga l'ha già presa (omonimi), si ferma e lo dice.
  const occupata = dipendenti.find((x) => x.personaleId === p.id);
  if (occupata) { senza++; console.log(`  ! ${d.nome} — la scheda ${p.id} è già di «${occupata.nome}»`); continue; }
  collegati++;
  console.log(`  → ${d.nome} ⇐ ${p.nome} (${p.id})${d.maisonId ? " · maison mantenuta" : ""}${d.note ? " · nota mantenuta" : ""}`);
  if (SCRIVI) await prisma.dipendente.update({ where: { id: d.id }, data: { personaleId: p.id } });
}

let tCollegati = 0, tGia = 0, tSenza = 0;
for (const t of team) {
  if (t.personaleId) { tGia++; console.log(`  = team ${t.nome} — già collegato`); continue; }
  const f = funzPerNome.get(nomeNormalizzato(t.nome));
  if (!f) { tSenza++; console.log(`  ? team ${t.nome} — nessuna funzione con questo nome in Personale`); continue; }
  tCollegati++;
  console.log(`  → team ${t.nome} ⇐ funzione ${f.nome} (${f.id}) · ruolo economico: ${t.struttura ? "struttura" : t.ambiti ?? "da dichiarare"}`);
  if (SCRIVI) await prisma.team.update({ where: { id: t.id }, data: { personaleId: f.id } });
}

console.log(`\nPersone: ${collegati} da collegare, ${giaCollegati} già collegate, ${senza} senza corrispondenza.`);
console.log(`Team: ${tCollegati} da collegare, ${tGia} già collegati, ${tSenza} senza corrispondenza.`);
console.log(SCRIVI ? "Scritto." : "Niente scritto: rilancia con «scrivi» per applicare.");
await prisma.$disconnect();
