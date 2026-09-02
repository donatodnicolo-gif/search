// RIPARAZIONE 02/09/2026 — fatture importate da FIC già pagate, su partner in
// COMPENSAZIONE, senza l'incasso sul saldo del mese.
//
// In app «Saldata» su un partner in compensazione registra l'incasso
// automatico (incassoRegistrato, bonificoImporto −= ivato) e il riferimento nel
// registro Pagamenti: è il punto unico (segnaFatturaPagataConEsito). Il
// backfill del 31/08 scriveva pagata=true a mano, senza quel giro: il mese
// restava «da incassare» per soldi già arrivati. Qui si applica lo stesso giro
// a quelle righe (non commissioni: quelle le toglie ripara-commissioni-importate).
//
// Stampa anche, senza toccarle, le fatture importate pagate dei partner a
// partite separate che non hanno il riferimento Pagamenti (solo registro).
//
// Uso: node --env-file=.env scripts/ripara-incassi-importati.mjs [--esegui]
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";

const p = new PrismaClient();
const ESEGUI = process.argv.includes("--esegui");
const ivato = (f) => +(f.imponibile * (1 + f.aliquotaIva / 100)).toFixed(2);

const righe = await p.fatturaServizio.findMany({
  where: { pagata: true, incassoRegistrato: false, createdAt: { gte: new Date("2026-08-30T00:00:00Z") }, partner: { compensazione: true } },
  include: { partner: { select: { nome: true } } },
});
const daFare = righe.filter((f) => !(f.descrizione ?? "").startsWith("Import PARTNER.xlsx") && !/\bcommission[ei]\b/i.test(f.descrizione ?? ""));
console.log(`Fatture pagate su partner in compensazione senza incasso registrato: ${daFare.length} — ivato ${daFare.reduce((a, f) => a + ivato(f), 0).toFixed(2)} €`);
for (const f of daFare) console.log("  ", f.numero, f.partner.nome, `${f.anno}/${f.mese}`, ivato(f), "€", f.descrizione);

const separate = await p.fatturaServizio.findMany({
  where: { pagata: true, createdAt: { gte: new Date("2026-08-30T00:00:00Z") }, partner: { compensazione: false } },
  select: { id: true, numero: true },
});
const conRif = new Set((await p.pagamento.findMany({ where: { origineTipo: "fattura_servizi", origineId: { in: separate.map((f) => f.id) } }, select: { origineId: true } })).map((x) => x.origineId));
console.log(`(solo registro) fatture importate pagate di partner a partite separate senza riferimento Pagamenti: ${separate.filter((f) => !conRif.has(f.id)).length} su ${separate.length}`);

if (!ESEGUI) { console.log("(prova: niente scritto — rilancia con --esegui)"); await p.$disconnect(); process.exit(0); }

const dir = process.env.BACKUP_DIR ?? ".";
const file = `${dir}/backup-incassi-importati-${Date.now()}.json`;
const saldiPrima = [];
for (const f of daFare) {
  const s = await p.saldoMensile.findUnique({ where: { partnerId_anno_mese: { partnerId: f.partnerId, anno: f.anno, mese: f.mese } } });
  if (s) saldiPrima.push(s);
}
fs.writeFileSync(file, JSON.stringify({ quando: new Date().toISOString(), righe: daFare, saldiPrima }, null, 1));
console.log("Backup scritto:", file);

async function registraPagamento(opts) {
  const esistente = await p.pagamento.findUnique({ where: { origineTipo_origineId: { origineTipo: opts.tipo, origineId: opts.origineId } } });
  if (esistente) {
    await p.pagamento.update({ where: { id: esistente.id }, data: { direzione: opts.direzione, importo: +opts.importo.toFixed(2), data: opts.data } });
    return;
  }
  const anno = opts.data.getUTCFullYear();
  for (let tentativo = 0; ; tentativo++) {
    const ultimo = await p.pagamento.aggregate({ where: { anno }, _max: { numero: true } });
    const numero = (ultimo._max.numero ?? 0) + 1;
    try {
      await p.pagamento.create({
        data: {
          riferimento: `PAY-${anno}-${String(numero).padStart(6, "0")}`, numero, anno, tipo: opts.tipo, direzione: opts.direzione,
          importo: +opts.importo.toFixed(2), data: opts.data, controparte: opts.controparte ?? null, partnerId: opts.partnerId ?? null,
          descrizione: opts.descrizione ?? null, origineTipo: opts.tipo, origineId: opts.origineId,
        },
      });
      return;
    } catch (e) {
      if (tentativo >= 1) throw e;
    }
  }
}

for (const f of daFare) {
  const v = ivato(f);
  const dp = f.dataPagamento ?? new Date();
  await p.fatturaServizio.update({ where: { id: f.id }, data: { incassoRegistrato: true, incassato: v } });
  const s = await p.saldoMensile.findUnique({ where: { partnerId_anno_mese: { partnerId: f.partnerId, anno: f.anno, mese: f.mese } } });
  const nuovo = +(((s?.bonificoImporto ?? 0) - v).toFixed(2));
  const saldo = await p.saldoMensile.upsert({
    where: { partnerId_anno_mese: { partnerId: f.partnerId, anno: f.anno, mese: f.mese } },
    create: { partnerId: f.partnerId, anno: f.anno, mese: f.mese, bonificoImporto: nuovo, bonificoData: dp },
    update: { bonificoImporto: nuovo, bonificoData: dp },
  });
  if (Math.abs(nuovo) < 0.005) {
    await p.pagamento.deleteMany({ where: { origineTipo: "bonifico_partner", origineId: saldo.id } });
  } else {
    await registraPagamento({ tipo: "bonifico_partner", direzione: nuovo > 0 ? "out" : "in", importo: Math.abs(nuovo), data: dp, origineId: saldo.id, controparte: f.partner.nome, partnerId: f.partnerId, descrizione: `${nuovo > 0 ? "Bonifico a" : "Incasso da"} ${f.partner.nome} — ${f.mese}/${f.anno}` });
  }
  await registraPagamento({ tipo: "fattura_servizi", direzione: "in", importo: v, data: dp, origineId: f.id, controparte: f.partner.nome, partnerId: f.partnerId, descrizione: `Fattura ${f.numero ?? "s.n."} — ${f.partner.nome}` });
  await p.registroModifica.create({
    data: {
      utente: "riparazione 02/09/2026",
      azione: `Fattura ${f.numero} importata da FIC già pagata: registrato l'incasso ${v.toFixed(2).replace(".", ",")} € sul saldo di ${f.mese}/${f.anno} (come fa «Saldata»)`,
      categoria: "fatture", entita: "fattura", entitaId: f.id, partner: f.partner.nome,
      dettaglio: `Il backfill del 31/08 aveva scritto pagata=true senza il giro dell'incasso. Backup: ${file}`,
    },
  });
  console.log("fatto", f.numero, f.partner.nome, `${f.anno}/${f.mese}`, "bonifico", s?.bonificoImporto ?? 0, "→", nuovo);
}
console.log(`\nFATTO: ${daFare.length} fatture`);
await p.$disconnect();
