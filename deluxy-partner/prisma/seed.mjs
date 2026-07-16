// Seed: importa i dati estratti da PARTNER.xlsx (prisma/seed-data.json)
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const prisma = new PrismaClient();
const dir = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(dir, "seed-data.json"), "utf8"));

const IVA = 22;

// Tipologia di default per le fatture importate, dedotta dai servizi del partner
function tipologiaDaServizi(servizi) {
  const s = (servizi || "").toLowerCase();
  if (s.includes("magazzino")) return "Magazzino";
  if (s.includes("food")) return "Food Supplier";
  if (s.includes("affilia")) return "Affiliazioni";
  if (s.includes("gifting") || s.includes("eventi")) return "Eventi";
  return "Consegne";
}

function d(iso) {
  if (!iso) return null;
  const date = new Date(iso + "T00:00:00.000Z");
  return isNaN(date.getTime()) ? null : date;
}

async function main() {
  // pulizia (seed idempotente)
  await prisma.fatturaServizio.deleteMany();
  await prisma.venditaVendor.deleteMany();
  await prisma.saldoMensile.deleteMany();
  await prisma.forecast.deleteMany();
  await prisma.partner.deleteMany();
  await prisma.tipologiaServizio.deleteMany();

  const tipologie = {};
  for (const [i, nome] of data.tipologieServizio.entries()) {
    tipologie[nome] = await prisma.tipologiaServizio.create({ data: { nome, ordine: i } });
  }
  const altro = await prisma.tipologiaServizio.create({
    data: { nome: "Altro", ordine: 99 },
  });
  tipologie["Altro"] = altro;

  const ANNO = 2026;
  let nFatture = 0, nVendite = 0, nSaldi = 0;

  for (const p of data.partners) {
    const partner = await prisma.partner.create({
      data: {
        nome: p.nome,
        categoria: p.categoria,
        citta: p.citta,
        servizi: p.servizi,
        clienteAnno: p.clienteAnno,
        feePercent: p.feePercent,
        debiti2025: p.debiti2025 ?? 0,
        pdrDebito: p.pdrDebito,
        crediti2025: p.crediti2025 ?? 0,
        ggPagamento: Math.round(p.ggPagamento ?? 0),
        compensazione: p.compensazione === true,
        commissioniADetrazione: p.commissioniADetrazione === true,
        addebitoDiretto: p.addebitoDiretto === true,
        cartaCreditoApp: p.cartaCreditoApp === true,
        attivo: p.clienteAnno !== "Dismesso",
      },
    });

    for (const m of p.mesi) {
      // Fattura servizi (il foglio ha un totale mensile; i numeri possono essere multipli es. "68-69-70/2026")
      if (m.fattImportoNetto != null || m.fattNumeri) {
        const tip = tipologie[tipologiaDaServizi(p.servizi)];
        await prisma.fatturaServizio.create({
          data: {
            partnerId: partner.id,
            tipologiaId: tip.id,
            anno: ANNO,
            mese: m.mese,
            numero: m.fattNumeri,
            scadenza: d(m.fattScadenza),
            imponibile: m.fattImportoNetto ?? 0,
            aliquotaIva: IVA,
            pagata: m.fattSaldata === true,
            dataPagamento: m.fattSaldata === true ? d(m.dataPagamento) : null,
            descrizione: "Import PARTNER.xlsx — totale mese",
          },
        });
        nFatture++;
      }

      // Vendite vendor (totale mensile)
      if (m.incassoVendite != null && m.incassoVendite !== 0) {
        let fee = p.feePercent ?? 0;
        if (m.commissioniNetto != null && m.incassoVendite) {
          fee = +((m.commissioniNetto / m.incassoVendite) * 100).toFixed(2);
        }
        await prisma.venditaVendor.create({
          data: {
            partnerId: partner.id,
            anno: ANNO,
            mese: m.mese,
            descrizione: "Import PARTNER.xlsx — totale mese",
            incassoLordo: m.incassoVendite,
            feePercent: fee,
          },
        });
        nVendite++;
      }

      // Saldo mensile (extra, fattura commissioni, bonifico, note)
      const hasSaldo =
        m.commFattEmessa != null || m.commFattNumero || m.aggiunte != null ||
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
            chiuso: m.netto != null && Math.abs(m.netto) < 0.01,
            note: m.note,
          },
        });
        nSaldi++;
      }
    }
  }

  for (const f of data.forecast) {
    for (const m of f.mesi) {
      await prisma.forecast.create({
        data: {
          partnerNome: f.cliente,
          servizio: f.servizio ?? "Altro",
          anno: 2026,
          mese: m.mese,
          valPrecedente: m.val2025,
          actual: m.actual2026,
          forecast: m.forecast2026,
        },
      });
    }
  }

  console.log(`Seed completato: ${data.partners.length} partner, ${nFatture} fatture, ${nVendite} vendite, ${nSaldi} saldi mensili.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
