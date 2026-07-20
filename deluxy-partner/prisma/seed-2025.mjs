// Import ADDITIVO dello storico 2025 (foglio "Database clienti 2025").
// Cancella e reimporta SOLO i record con anno=2025; i dati 2026 e i partner
// esistenti non vengono toccati (i partner mancanti sono creati come storico).
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const prisma = new PrismaClient();
const dir = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(dir, "seed-2025.json"), "utf8"));
const ANNO = 2025;

const norm = (s) => s.toUpperCase().replace(/\s+/g, " ").trim();

function tipologiaDaServizi(servizi) {
  const s = (servizi || "").toLowerCase();
  if (s.includes("magazzino")) return "Magazzino";
  if (s.includes("food")) return "Food Supplier";
  if (s.includes("affilia")) return "Affiliazioni";
  if (s.includes("gifting") || s.includes("eventi")) return "Eventi";
  return "Consegne";
}

function d(iso) {
  if (!iso || !/^(20\d{2})-/.test(iso)) return null; // scarta refusi tipo anno 20225
  const date = new Date(iso + "T00:00:00.000Z");
  return isNaN(date.getTime()) ? null : date;
}

async function main() {
  await prisma.fatturaServizio.deleteMany({ where: { anno: ANNO } });
  await prisma.venditaVendor.deleteMany({ where: { anno: ANNO } });
  await prisma.saldoMensile.deleteMany({ where: { anno: ANNO } });

  const tipologie = Object.fromEntries(
    (await prisma.tipologiaServizio.findMany()).map((t) => [t.nome, t])
  );
  const esistenti = await prisma.partner.findMany();
  const perNome = new Map(esistenti.map((p) => [norm(p.nome), p]));

  function trovaPartner(nome) {
    const n = norm(nome);
    if (perNome.has(n)) return perNome.get(n);
    // fallback: prefisso (nomi leggermente diversi tra i due fogli)
    for (const [k, p] of perNome) {
      if (k.length >= 6 && n.length >= 6 && (k.startsWith(n) || n.startsWith(k))) return p;
    }
    return null;
  }

  let creati = 0, nF = 0, nV = 0, nS = 0;
  for (const p25 of data.partners) {
    let partner = trovaPartner(p25.nome);
    if (!partner) {
      partner = await prisma.partner.create({
        data: {
          nome: p25.nome,
          categoria: p25.categoria,
          citta: p25.citta,
          attivo: false,
          note: "Presente solo nello storico 2025 (import PARTNER.xlsx)",
        },
      });
      perNome.set(norm(partner.nome), partner);
      creati++;
    }

    for (const m of p25.mesi) {
      if (m.fattImporto != null || m.fattNumeri) {
        const tip = tipologie[tipologiaDaServizi(partner.servizi)] ?? tipologie["Consegne"];
        await prisma.fatturaServizio.create({
          data: {
            partnerId: partner.id,
            tipologiaId: tip.id,
            anno: ANNO,
            mese: m.mese,
            numero: m.fattNumeri,
            imponibile: m.fattImporto ?? 0,
            aliquotaIva: 22,
            pagata: m.fattSaldata === true,
            dataPagamento: m.fattSaldata === true ? d(m.dataPagamento) : null,
            descrizione: "Import PARTNER.xlsx 2025 — totale mese",
          },
        });
        nF++;
      }
      if (m.incassoVendite != null && m.incassoVendite !== 0) {
        let fee = partner.feePercent ?? 0;
        if (m.commissioniNetto != null && m.incassoVendite) {
          fee = +((m.commissioniNetto / m.incassoVendite) * 100).toFixed(2);
        }
        await prisma.venditaVendor.create({
          data: {
            partnerId: partner.id,
            anno: ANNO,
            mese: m.mese,
            descrizione: "Import PARTNER.xlsx 2025 — totale mese",
            incassoLordo: m.incassoVendite,
            feePercent: fee,
          },
        });
        nV++;
      }
      const hasSaldo = m.commFattEmessa != null || m.commFattNumero || m.aggiunte != null ||
        m.detrazioni != null || m.dataPagamento || m.bonifico != null || m.note;
      if (hasSaldo) {
        await prisma.saldoMensile.create({
          data: {
            partnerId: partner.id,
            anno: ANNO,
            mese: m.mese,
            commFattEmessa: m.commFattEmessa === true,
            commFattNumero: m.commFattNumero,
            aggiunte: m.aggiunte ?? 0,
            detrazioni: m.detrazioni ?? 0,
            dataPagamento: d(m.dataPagamento),
            bonificoImporto: m.bonifico,
            bonificoData: m.bonifico != null ? d(m.dataPagamento) : null,
            chiuso: true,
            note: m.note,
          },
        });
        nS++;
      }
    }
  }
  console.log(`Storico 2025 importato: ${data.partners.length} partner (${creati} creati come storico), ${nF} fatture, ${nV} vendite, ${nS} saldi.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
