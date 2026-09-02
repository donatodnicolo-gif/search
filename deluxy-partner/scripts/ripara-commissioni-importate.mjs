// RIPARAZIONE 02/09/2026 — le fatture COMMISSIONI importate come servizi.
//
// Il backfill da Fatture in Cloud del 31/08 (fic-mancanti) ha registrato come
// `FatturaServizio` anche le fatture delle commissioni sulle vendite vendor
// («Commissioni Deluxy Giugno 2026»): 132 righe, 69.808 € netti. Quelle non
// sono servizi: la commissione è già calcolata sulla vendita e già tolta dal
// dovuto al partner — contarle fra i servizi le somma una seconda volta, nel
// saldo del mese e nel fatturato per tipologia che legge Budgets (la regola è
// scritta in actions.ts, ramo `__fee__` di registraFicComeServizio).
//
// Cosa fa, per ognuna:
//   1. se «Saldata» aveva registrato l'incasso automatico sul saldo del mese
//      (incassoRegistrato), lo storna (bonificoImporto += ivato) e aggiorna il
//      riferimento nel registro Pagamenti;
//   2. toglie l'eventuale riferimento Pagamenti della fattura;
//   3. aggancia il numero al mese come fattura commissioni (commFattNumero),
//      se il mese non ne ha già uno numerico;
//   4. cancella la riga.
// Prima di scrivere salva TUTTO in un JSON (righe + saldi toccati).
//
// Uso: node --env-file=.env scripts/ripara-commissioni-importate.mjs [--esegui]
// Senza --esegui stampa soltanto cosa farebbe.
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";

const p = new PrismaClient();
const ESEGUI = process.argv.includes("--esegui");
const ivato = (f) => +(f.imponibile * (1 + f.aliquotaIva / 100)).toFixed(2);

const saldiConComm = await p.saldoMensile.findMany({ where: { commFattNumero: { not: null } }, select: { commFattNumero: true } });
const numeriComm = new Set(saldiConComm.map((s) => (s.commFattNumero ?? "").trim()).filter((x) => /\d/.test(x)));

const tutte = await p.fatturaServizio.findMany({
  where: { createdAt: { gte: new Date("2026-08-30T00:00:00Z") } },
  include: { partner: { select: { nome: true, compensazione: true } } },
});
const eCommissioni = (f) =>
  !(f.descrizione ?? "").startsWith("Import PARTNER.xlsx") &&
  (/\bcommission[ei]\b/i.test(f.descrizione ?? "") || (f.numero && numeriComm.has(f.numero.trim())));
// le «integrazioni» per ultime: se un mese non ha numero, prende quello della fattura principale
const righe = tutte.filter(eCommissioni).sort((a, b) => Number(/integrazione|\(2\)/i.test(a.descrizione ?? "")) - Number(/integrazione|\(2\)/i.test(b.descrizione ?? "")));

console.log(`Fatture commissioni registrate come servizi: ${righe.length} — imponibile ${righe.reduce((a, f) => a + f.imponibile, 0).toFixed(2)} €`);
if (righe.length !== 132) {
  console.error(`ATTESE 132 (censimento del 02/09), trovate ${righe.length}: mi fermo.`);
  process.exit(1);
}

const backup = { quando: new Date().toISOString(), righe, saldi: [] };
const saldiKey = new Set(righe.map((f) => `${f.partnerId}|${f.anno}|${f.mese}`));
for (const k of saldiKey) {
  const [partnerId, anno, mese] = k.split("|");
  const s = await p.saldoMensile.findUnique({ where: { partnerId_anno_mese: { partnerId, anno: +anno, mese: +mese } } });
  if (s) backup.saldi.push(s);
}
const dir = process.env.BACKUP_DIR ?? ".";
const file = `${dir}/backup-commissioni-importate-${Date.now()}.json`;
fs.writeFileSync(file, JSON.stringify(backup, null, 1));
console.log("Backup scritto:", file);

async function aggiornaPagamentoDaSaldo(saldo) {
  if (!saldo.bonificoImporto || Math.abs(saldo.bonificoImporto) < 0.005) {
    await p.pagamento.deleteMany({ where: { origineTipo: "bonifico_partner", origineId: saldo.id } });
    return;
  }
  const uscita = saldo.bonificoImporto > 0;
  const esistente = await p.pagamento.findUnique({ where: { origineTipo_origineId: { origineTipo: "bonifico_partner", origineId: saldo.id } } });
  if (esistente) {
    await p.pagamento.update({ where: { id: esistente.id }, data: { direzione: uscita ? "out" : "in", importo: +Math.abs(saldo.bonificoImporto).toFixed(2) } });
  }
  // (nessuna creazione: qui si STORNA soltanto — se non c'era un riferimento, non nasce adesso)
}

let stornate = 0, agganciate = 0, pagamentiTolti = 0;
const dettaglio = [];
for (const f of righe) {
  const v = ivato(f);
  if (ESEGUI) {
    if (f.incassoRegistrato) {
      const s = await p.saldoMensile.findUnique({ where: { partnerId_anno_mese: { partnerId: f.partnerId, anno: f.anno, mese: f.mese } } });
      // solo se l'incasso automatico è ancora dentro il saldo: un «Annulla»
      // successivo lo ha già azzerato (142 RESTAURANT giugno, 02/09 14:29)
      if (s && s.bonificoImporto != null) {
        const nuovo = +(((s.bonificoImporto ?? 0) + v).toFixed(2));
        const saldo = await p.saldoMensile.update({ where: { id: s.id }, data: { bonificoImporto: Math.abs(nuovo) < 0.005 ? null : nuovo } });
        await aggiornaPagamentoDaSaldo(saldo);
        stornate++;
      }
    }
    const tolti = await p.pagamento.deleteMany({ where: { origineTipo: "fattura_servizi", origineId: f.id } });
    pagamentiTolti += tolti.count;
    const s2 = await p.saldoMensile.findUnique({ where: { partnerId_anno_mese: { partnerId: f.partnerId, anno: f.anno, mese: f.mese } }, select: { commFattNumero: true } });
    const haNumero = !!(s2?.commFattNumero && /\d/.test(s2.commFattNumero));
    if (!haNumero && f.numero) {
      await p.saldoMensile.upsert({
        where: { partnerId_anno_mese: { partnerId: f.partnerId, anno: f.anno, mese: f.mese } },
        create: { partnerId: f.partnerId, anno: f.anno, mese: f.mese, commFattEmessa: true, commFattNumero: f.numero },
        update: { commFattEmessa: true, commFattNumero: f.numero },
      });
      agganciate++;
    }
    await p.fatturaServizio.delete({ where: { id: f.id } });
  }
  dettaglio.push(`${f.numero} ${f.partner.nome} ${f.anno}/${f.mese} ${f.imponibile} €${f.incassoRegistrato ? " (stornato incasso " + v + ")" : ""}`);
}
console.log(dettaglio.join("\n"));
if (ESEGUI) {
  await p.registroModifica.create({
    data: {
      utente: "riparazione 02/09/2026",
      azione: `Tolte dai servizi ${righe.length} fatture commissioni importate da FIC il 31/08 (${righe.reduce((a, f) => a + f.imponibile, 0).toFixed(2)} € netti); ${agganciate} agganciate ai mesi come fatture commissioni`,
      categoria: "fatture",
      dettaglio: `Le fatture delle commissioni vendor non sono servizi (già dentro il dovuto vendite). Incassi automatici stornati: ${stornate}; riferimenti Pagamenti tolti: ${pagamentiTolti}. Backup: ${file}. ` + dettaglio.slice(0, 40).join(" · "),
    },
  });
  console.log(`\nFATTO: cancellate ${righe.length}, stornate ${stornate}, agganciate ${agganciate}, pagamenti tolti ${pagamentiTolti}`);
} else {
  console.log("\n(prova: niente scritto — rilancia con --esegui)");
}
await p.$disconnect();
