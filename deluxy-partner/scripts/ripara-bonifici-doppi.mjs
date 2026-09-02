// RIPARAZIONE 02/09/2026 — i bonifici registrati più volte per un doppio clic.
//
// «Abbiamo pagato» / «Hanno pagato» / «Annota pagato» non avevano lo stato di
// attesa: premuti più volte, ogni clic SOMMAVA un'altra registrazione al mese
// (eseguiBonificoMese fa `bonificoImporto + importo`). Nel registro modifiche ci
// sono 53 registrazioni gemelle (stesso partner, stesso testo) a pochi secondi
// l'una dall'altra: CAKELAB giugno 85,48 € registrati 9 volte = 769,32 €.
//
// Come ricostruisce il valore giusto di ogni mese toccato: rilegge il registro
// (registrazioni + «Annullati i pagamenti…»), collassa le gemelle entro 120 s,
// e ripete la somma. Corregge SOLO i mesi «puri», cioè dove il valore attuale
// coincide con la somma di TUTTI i clic (nessun'altra mano ha toccato il
// saldo nel frattempo — il form «upsertSaldo» può scriverlo direttamente).
// Gli altri li stampa e non li tocca: li decide una persona.
//
// Uso: node --env-file=.env scripts/ripara-bonifici-doppi.mjs [--esegui]
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";

const p = new PrismaClient();
const ESEGUI = process.argv.includes("--esegui");
const MESI = ["", "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
const FINESTRA_MS = 120_000;

const reg = await p.registroModifica.findMany({
  where: { OR: [{ azione: { startsWith: "Registrato bonifico" } }, { azione: { startsWith: "Registrato incasso" } }, { azione: { startsWith: "Annullati i pagamenti" } }] },
  orderBy: { createdAt: "asc" },
});
const chiave = (r) => {
  const m = r.azione.match(/\((\w+) (\d{4})\)|per (\w+) (\d{4})/);
  if (!m) return null;
  const mese = m[1] ?? m[3], anno = m[2] ?? m[4];
  return `${r.partner}|${anno}|${MESI.indexOf(mese)}`;
};
const importoDi = (r) => {
  const m = r.azione.match(/(bonifico al partner|incasso dal partner)\s([\d.]+,\d\d)\s€/);
  if (!m) return null;
  return parseFloat(m[2].replace(/\./g, "").replace(",", ".")) * (m[1].startsWith("bonifico") ? 1 : -1);
};

const mesiToccati = new Set();
for (let i = 1; i < reg.length; i++) {
  const a = reg[i - 1], b = reg[i];
  if (a.azione === b.azione && a.partner === b.partner && a.azione.startsWith("Registrato") && b.createdAt - a.createdAt < FINESTRA_MS) mesiToccati.add(chiave(a));
}
const partners = await p.partner.findMany({ select: { id: true, nome: true, compensazione: true } });
const perNome = new Map(partners.map((x) => [x.nome, x]));

const piano = [];
for (const k of mesiToccati) {
  const [nome, anno, mese] = k.split("|");
  const pr = perNome.get(nome);
  if (!pr) { console.log("?? partner non trovato:", nome); continue; }
  const saldo = await p.saldoMensile.findUnique({ where: { partnerId_anno_mese: { partnerId: pr.id, anno: +anno, mese: +mese } } });
  const eventi = reg.filter((r) => r.partner === nome && chiave(r) === k);
  let grezzo = 0, collassato = 0, gemelle = 0, ultimaAzione = "", ultimoT = 0;
  const storia = [];
  for (const r of eventi) {
    if (r.azione.startsWith("Annullati")) { grezzo = 0; collassato = 0; ultimaAzione = ""; storia.push("ANNULLA"); continue; }
    const imp = importoDi(r);
    if (imp == null) { storia.push("?"); continue; }
    grezzo += imp;
    if (r.azione === ultimaAzione && r.createdAt - ultimoT < FINESTRA_MS) { gemelle++; ultimoT = r.createdAt; continue; }
    collassato += imp; ultimaAzione = r.azione; ultimoT = r.createdAt;
    storia.push(`${imp > 0 ? "+" : ""}${imp.toFixed(2)}`);
  }
  // le «Saldata» automatiche (partner in compensazione) toccano lo stesso campo
  const auto = await p.fatturaServizio.findMany({ where: { partnerId: pr.id, anno: +anno, mese: +mese, incassoRegistrato: true } });
  const autoInc = auto.reduce((a, f) => a + f.imponibile * (1 + f.aliquotaIva / 100), 0);
  const attuale = +((saldo?.bonificoImporto ?? 0).toFixed(2));
  const attesoGrezzo = +((grezzo - autoInc).toFixed(2));
  const corretto = +((collassato - autoInc).toFixed(2));
  const puro = Math.abs(attuale - attesoGrezzo) < 0.01;
  piano.push({ nome, anno: +anno, mese: +mese, partnerId: pr.id, saldoId: saldo?.id ?? null, attuale, corretto, gemelle, puro, storia: storia.join(" "), autoInc: +autoInc.toFixed(2) });
}
piano.sort((a, b) => a.nome.localeCompare(b.nome) || a.mese - b.mese);

const daCorreggere = piano.filter((x) => x.puro && Math.abs(x.attuale - x.corretto) >= 0.01);
const ambigui = piano.filter((x) => !x.puro);
const giaOk = piano.filter((x) => x.puro && Math.abs(x.attuale - x.corretto) < 0.01);
for (const x of piano) {
  const tag = !x.puro ? "AMBIGUO " : Math.abs(x.attuale - x.corretto) < 0.01 ? "OK      " : "CORREGGO";
  console.log(`${tag} ${x.nome} ${MESI[x.mese]} ${x.anno}: ${x.attuale} → ${x.corretto} (gemelle ${x.gemelle}${x.autoInc ? ", saldate-auto " + x.autoInc : ""}) | ${x.storia}`);
}
console.log(`\nmesi toccati ${piano.length}: da correggere ${daCorreggere.length}, già giusti ${giaOk.length}, ambigui (non toccati) ${ambigui.length}`);

if (!ESEGUI) { console.log("(prova: niente scritto — rilancia con --esegui)"); await p.$disconnect(); process.exit(0); }

const dir = process.env.BACKUP_DIR ?? ".";
const file = `${dir}/backup-bonifici-doppi-${Date.now()}.json`;
fs.writeFileSync(file, JSON.stringify({ quando: new Date().toISOString(), piano }, null, 1));
console.log("Backup scritto:", file);

for (const x of daCorreggere) {
  if (!x.saldoId) continue;
  const nuovo = Math.abs(x.corretto) < 0.005 ? null : x.corretto;
  const saldo = await p.saldoMensile.update({ where: { id: x.saldoId }, data: { bonificoImporto: nuovo, ...(nuovo == null ? { bonificoData: null } : {}) } });
  if (nuovo == null) {
    await p.pagamento.deleteMany({ where: { origineTipo: "bonifico_partner", origineId: saldo.id } });
  } else {
    const rif = await p.pagamento.findUnique({ where: { origineTipo_origineId: { origineTipo: "bonifico_partner", origineId: saldo.id } } });
    if (rif) await p.pagamento.update({ where: { id: rif.id }, data: { direzione: nuovo > 0 ? "out" : "in", importo: +Math.abs(nuovo).toFixed(2) } });
  }
  await p.registroModifica.create({
    data: {
      utente: "riparazione 02/09/2026",
      azione: `Corretto il ${x.corretto >= 0 ? "bonifico" : "incasso"} di ${MESI[x.mese]} ${x.anno}: da ${x.attuale.toFixed(2).replace(".", ",")} € a ${Math.abs(x.corretto).toFixed(2).replace(".", ",")} € (${x.gemelle} registrazioni gemelle da doppio clic tolte)`,
      categoria: "pagamenti", entita: "partner", entitaId: x.partnerId, partner: x.nome,
      dettaglio: `Ricostruito dal registro modifiche: ${x.storia}. Backup: ${file}`,
    },
  });
  console.log("corretto", x.nome, MESI[x.mese], x.anno, x.attuale, "→", x.corretto);
}
console.log(`\nFATTO: corretti ${daCorreggere.length} mesi; ambigui lasciati: ${ambigui.map((x) => `${x.nome} ${MESI[x.mese]} ${x.anno}`).join(", ") || "nessuno"}`);
await p.$disconnect();
