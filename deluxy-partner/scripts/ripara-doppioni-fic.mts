// I 4 DOPPIONI dell'import FIC (31/08/2026) e la loro causa vera: righe
// preesistenti (import PARTNER.xlsx) col NUMERO SBAGLIATO, verificate una a
// una contro Fatture in Cloud:
//   - pre «555/2026» da 108 € → su FIC la 555 vale 69 €: quella riga è la 554
//   - pre «203/2026» da 1.025 € → su FIC la 203 vale 390 € (FENDI): è la 212
//   - pre «185/2025» da 480 € comp. Feb 2026 → è la 185/2026 (NIKKY, fee fissa)
//   - pre s.n. DIPTYQUE 69 € comp. Lug → è la 555/2026 vera
//   - pre s.n. TAVEGGIA 19 € comp. Apr → è la 337/2026
// L'import, controllando il numero, le ha credute registrate o ha aggiunto la
// gemella. Si tengono le PREESISTENTI (portano pagata/incassato), si
// correggono i numeri, si cancellano le 4 importate.
import { PrismaClient } from "@prisma/client";
import { registra } from "../src/lib/registro";
const prisma = new PrismaClient();
const SCRIVI = process.argv.includes("scrivi");
const soglia = new Date("2026-08-30T12:00:00Z");

async function trova(where: Record<string, unknown>) {
  return prisma.fatturaServizio.findFirst({ where, select: { id: true, numero: true, imponibile: true, mese: true, createdAt: true, partner: { select: { nome: true } } } });
}
const daCancellare = [
  await trova({ numero: "554/2026", createdAt: { gte: soglia } }),
  await trova({ numero: "212/2026", createdAt: { gte: soglia } }),
  await trova({ numero: "185/2026", createdAt: { gte: soglia } }),
  await trova({ numero: "337/2026", createdAt: { gte: soglia } }),
].filter(Boolean);
const rinumera = [
  { riga: await trova({ numero: "555/2026", createdAt: { lt: soglia } }), nuovo: "554/2026" },
  { riga: await trova({ numero: "203/2026", createdAt: { lt: soglia } }), nuovo: "212/2026" },
  { riga: await trova({ numero: "185/2025", createdAt: { lt: soglia }, anno: 2026 }), nuovo: "185/2026" },
  { riga: await trova({ numero: null, anno: 2026, mese: 7, imponibile: { gte: 68, lte: 70 }, partner: { nome: { contains: "DIPTYQUE" } } }), nuovo: "555/2026" },
  { riga: await trova({ numero: null, anno: 2026, mese: 4, imponibile: { gte: 18, lte: 20 }, partner: { nome: { contains: "TAVEGGIA" } } }), nuovo: "337/2026" },
].filter((x) => x.riga);
console.log("DA CANCELLARE (importate doppie):");
for (const f of daCancellare) console.log(`  ${f!.numero} · ${Math.round(f!.imponibile)} € · ${f!.partner.nome}`);
console.log("DA RINUMERARE (preesistenti):");
for (const x of rinumera) console.log(`  ${x.riga!.numero ?? "s.n."} → ${x.nuovo} · ${Math.round(x.riga!.imponibile)} € · ${x.riga!.partner.nome}`);
if (!SCRIVI) { console.log("\n(prova a vuoto — rilancia con «scrivi»)"); await prisma.$disconnect(); process.exit(0); }
if (daCancellare.length !== 4 || rinumera.length !== 5) { console.log("\nMI FERMO: attese 4 da cancellare e 5 da rinumerare."); process.exit(1); }
for (const f of daCancellare) await prisma.fatturaServizio.delete({ where: { id: f!.id } });
for (const x of rinumera) await prisma.fatturaServizio.update({ where: { id: x.riga!.id }, data: { numero: x.nuovo } });
await registra({
  azione: "Riparati 4 doppioni dell'import FIC e 5 numeri sbagliati",
  categoria: "fatture",
  dettaglio: "Verifica contro FIC: le righe dell'import PARTNER.xlsx portavano numeri sbagliati (555→554, 203→212, 185/2025→185/2026) o nessun numero (Diptyque→555, Taveggia→337); cancellate le 4 gemelle importate (554, 212, 185, 337), tenute le preesistenti con lo stato d'incasso.",
});
console.log("\nSCRITTO.");
await prisma.$disconnect();
