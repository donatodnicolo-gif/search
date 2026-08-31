// COMPETENZA = MESE DEL SERVIZIO (decisione dell'utente, 31/08/2026: «devono
// essere tutte così»). Il giro mensile emette a inizio mese la fattura del
// mese PRIMA, e la competenza giusta è quella del servizio — che la fattura
// dichiara nella descrizione («Servizi Deluxy Luglio 2026»).
//
// Questo script allinea le FatturaServizio del 2026 la cui DESCRIZIONE nomina
// un mese diverso dalla competenza salvata. Dove la descrizione non nomina
// nessun mese non si tocca niente: meglio una competenza di emissione che una
// indovinata.
//
// Uso: npx tsx@4 --env-file=.env scripts/competenza-dal-servizio.mts [scrivi]
import { PrismaClient } from "@prisma/client";
import { registra } from "../src/lib/registro";
const prisma = new PrismaClient();
const SCRIVI = process.argv.includes("scrivi");

const MESI = ["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"];
const SIGLE = ["gen","feb","mar","apr","mag","giu","lug","ago","set","ott","nov","dic"];
function meseNellaDescrizione(s: string | null): number | null {
  if (!s) return null;
  const t = s.toLowerCase();
  for (let i = 0; i < 12; i++) if (t.includes(MESI[i])) return i + 1;
  // le sigle solo come parola a sé («lug 2026»), non dentro altre parole
  for (let i = 0; i < 12; i++) if (new RegExp(`\b${SIGLE[i]}\b`).test(t)) return i + 1;
  return null;
}

const fatture = await prisma.fatturaServizio.findMany({
  where: { anno: 2026 },
  select: { id: true, numero: true, anno: true, mese: true, emissione: true, descrizione: true, partner: { select: { nome: true } } },
});
const daSpostare: { id: string; numero: string | null; da: number; a: number; annoA: number; partner: string; desc: string }[] = [];
for (const f of fatture) {
  const m = meseNellaDescrizione(f.descrizione);
  if (!m || m === f.mese) continue;
  // L'anno del servizio: una fattura di gennaio che parla di «dicembre» è
  // dell'anno prima. Il riferimento è il mese di emissione (o la competenza).
  const meseRif = f.emissione ? f.emissione.getMonth() + 1 : f.mese;
  const annoA = m > meseRif ? f.anno - 1 : f.anno;
  daSpostare.push({ id: f.id, numero: f.numero, da: f.mese, a: m, annoA, partner: f.partner.nome, desc: (f.descrizione ?? "").slice(0, 50) });
}
console.log(`Registrate 2026 guardate: ${fatture.length} · da spostare: ${daSpostare.length}`);
for (const s of daSpostare) console.log(`  ${(s.numero ?? "s.n.").padEnd(9)} ${String(s.da).padStart(2)} → ${String(s.a).padStart(2)}/${s.annoA} · ${s.partner.slice(0, 30).padEnd(31)} · ${s.desc}`);
if (!SCRIVI) { console.log("\n(prova a vuoto — rilancia con «scrivi»)"); await prisma.$disconnect(); process.exit(0); }
for (const s of daSpostare) await prisma.fatturaServizio.update({ where: { id: s.id }, data: { mese: s.a, anno: s.annoA } });
await registra({
  azione: `Competenze allineate al mese del servizio: ${daSpostare.length} fatture`,
  categoria: "fatture",
  dettaglio: `Regola dell'utente (31/08): la competenza è il mese del SERVIZIO, letto dalla descrizione della fattura. ${daSpostare.slice(0, 15).map((s) => `${s.numero} ${s.da}→${s.a}`).join(", ")}${daSpostare.length > 15 ? "…" : ""}`,
});
console.log(`\nSCRITTO: ${daSpostare.length} competenze allineate.`);
await prisma.$disconnect();
