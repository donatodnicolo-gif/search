// Importa in Personale le persone e i team già esistenti nel roster di
// Budgets (GET /api/v1/team): team → Funzione, persona → Persona (col team
// come funzione e il responsabile del team collegato per nome).
//
// COSA NON IMPORTA, di proposito:
// - stipendi e costi: l'API di Budgets espone solo il costo azienda aggregato,
//   e da lì la RAL si potrebbe solo DEDURRE — meglio niente che sbagliato;
// - inquadramenti: il "tipo" di Budgets (dipendente, stage…) non dice il
//   contratto vero (indeterminato? apprendistato?). Tipo, part-time, maison e
//   mesi finiscono nelle NOTE della persona, da completare a mano.
//
// Idempotente: si riconosce per NOME normalizzato (come fa il Hub con
// Budgets); chi esiste già non si tocca e non si duplica. Nessuna cancellazione.
//
// Uso:
//   node scripts/importa-da-budgets.mjs --chiave-da <env-con-BUDGETS_API_KEY>          (prova a vuoto)
//   node scripts/importa-da-budgets.mjs --chiave-da <env-con-BUDGETS_API_KEY> scrivi   (scrive davvero)
// La chiave non viene mai stampata.
import { readFileSync } from "fs";
import { resolve } from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const argomenti = process.argv.slice(2).filter((a) => a !== "--");
const scrive = argomenti.includes("scrivi");
const indiceChiave = argomenti.indexOf("--chiave-da");
const fileChiave = indiceChiave >= 0 ? argomenti[indiceChiave + 1] : null;

const BUDGETS_URL = process.env.BUDGETS_URL || "https://deluxy-budgets.vercel.app";

function chiaveBudgets() {
  if (process.env.BUDGETS_API_KEY) return process.env.BUDGETS_API_KEY.trim();
  if (!fileChiave) {
    console.error("Serve BUDGETS_API_KEY nell'ambiente o --chiave-da <file-env>.");
    process.exit(1);
  }
  const righe = readFileSync(resolve(fileChiave), "utf8").split(/\r?\n/);
  const riga = righe.find((r) => r.startsWith("BUDGETS_API_KEY="));
  if (!riga) {
    console.error(`BUDGETS_API_KEY non trovata in ${fileChiave}.`);
    process.exit(1);
  }
  let v = riga.slice("BUDGETS_API_KEY=".length).trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  return v;
}

// Stessa normalizzazione del Hub: minuscole, senza accenti, spazi compressi.
function normalizza(nome) {
  return (nome ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const MESI_BREVI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

function descriviMesi(mesi) {
  if (!Array.isArray(mesi) || mesi.length === 0 || mesi.length === 12) return null;
  const ordinati = [...mesi].sort((a, b) => a - b);
  const contigui = ordinati.every((m, i) => i === 0 || m === ordinati[i - 1] + 1);
  if (contigui) {
    return ordinati.length === 1
      ? `solo ${MESI_BREVI[ordinati[0] - 1]}`
      : `${MESI_BREVI[ordinati[0] - 1]}–${MESI_BREVI[ordinati[ordinati.length - 1] - 1]}`;
  }
  return ordinati.map((m) => MESI_BREVI[m - 1]).join(", ");
}

function notaProvenienza(p, anno) {
  const pezzi = [`Importata dal roster ${anno} di Budgets il ${new Date().toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })}`];
  if (p.tipoNome) pezzi.push(`tipo: ${p.tipoNome}`);
  if (p.partTimePct != null && p.partTimePct !== 100) pezzi.push(`part-time ${p.partTimePct}%`);
  if (p.maison) pezzi.push(`maison: ${p.maison}`);
  const mesi = descriviMesi(p.mesi);
  if (mesi) pezzi.push(`mesi a budget: ${mesi}`);
  pezzi.push("inquadramento e retribuzione da registrare con i dati veri del contratto");
  return pezzi.join(" · ");
}

// ---------- lettura da Budgets ----------
const risposta = await fetch(`${BUDGETS_URL}/api/v1/team`, {
  headers: { "x-api-key": chiaveBudgets() },
  signal: AbortSignal.timeout(15000),
});
if (!risposta.ok) {
  console.error(`Budgets ha risposto ${risposta.status}: ${(await risposta.text()).slice(0, 200)}`);
  process.exit(1);
}
const dati = await risposta.json();
const anno = dati.anno ?? new Date().getFullYear();

const squadre = dati.team ?? [];
const senzaTeam = dati.senzaTeam ?? [];
console.log(
  `Budgets (anno ${anno}): ${squadre.length} team, ${dati.totali?.persone ?? "?"} persone (di cui ${senzaTeam.length} senza team).`,
);
console.log(scrive ? "MODO: scrivi (le modifiche si applicano).\n" : "MODO: prova a vuoto (nessuna scrittura).\n");

// ---------- stato attuale di Personale ----------
const funzioniEsistenti = await prisma.funzione.findMany();
const personeEsistenti = await prisma.persona.findMany();
const funzionePerNome = new Map(funzioniEsistenti.map((f) => [normalizza(f.nome), f]));
const personaPerNome = new Map(personeEsistenti.map((p) => [normalizza(p.nome), p]));

const esito = { funzioniCreate: [], funzioniEsistenti: [], personeCreate: [], personeGiaPresenti: [], responsabiliCollegati: [], responsabiliNonTrovati: [] };

// ---------- team → funzioni ----------
for (const [indice, squadra] of squadre.entries()) {
  const chiave = normalizza(squadra.nome);
  if (funzionePerNome.has(chiave)) {
    esito.funzioniEsistenti.push(squadra.nome);
    continue;
  }
  esito.funzioniCreate.push(squadra.nome);
  if (scrive) {
    const creata = await prisma.funzione.create({
      data: { nome: squadra.nome, descrizione: `Team importato dal roster ${anno} di Budgets`, ordine: indice },
    });
    funzionePerNome.set(chiave, creata);
  } else {
    // Anche la prova a vuoto tiene la mappa aggiornata, o il riepilogo
    // direbbe «responsabile non trovato» per funzioni che invece nasceranno.
    funzionePerNome.set(chiave, { id: "(prova)", nome: squadra.nome });
  }
}

// ---------- persone ----------
async function importaPersona(p, squadraNome) {
  const chiave = normalizza(p.nome);
  if (!chiave) return;
  if (personaPerNome.has(chiave)) {
    esito.personeGiaPresenti.push(p.nome);
    return;
  }
  const funzione = squadraNome ? funzionePerNome.get(normalizza(squadraNome)) : null;
  esito.personeCreate.push(`${p.nome}${p.ruolo ? ` (${p.ruolo})` : ""}${squadraNome ? ` → ${squadraNome}` : " → senza team"}`);
  if (scrive) {
    const creata = await prisma.persona.create({
      data: {
        nome: p.nome,
        ruolo: p.ruolo ?? "",
        email: (p.email ?? "").toLowerCase(),
        funzioneId: funzione?.id ?? null,
        note: notaProvenienza(p, anno),
      },
    });
    personaPerNome.set(chiave, creata);
  } else {
    personaPerNome.set(chiave, { id: "(prova)", nome: p.nome });
  }
}

for (const squadra of squadre) {
  for (const p of squadra.persone ?? []) await importaPersona(p, squadra.nome);
}
for (const p of senzaTeam) await importaPersona(p, null);

// ---------- responsabili dei team (per nome, dopo che le persone esistono) ----------
for (const squadra of squadre) {
  if (!squadra.responsabile) continue;
  const funzione = funzionePerNome.get(normalizza(squadra.nome));
  const responsabile = personaPerNome.get(normalizza(squadra.responsabile));
  if (!funzione || !responsabile) {
    esito.responsabiliNonTrovati.push(`${squadra.nome} → ${squadra.responsabile}`);
    continue;
  }
  esito.responsabiliCollegati.push(`${squadra.nome} → ${squadra.responsabile}`);
  if (scrive && funzione.id !== "(prova)" && responsabile.id !== "(prova)") {
    await prisma.funzione.update({ where: { id: funzione.id }, data: { responsabileId: responsabile.id } });
  }
}

// ---------- riepilogo ----------
function stampa(titolo, voci) {
  console.log(`${titolo}: ${voci.length}`);
  for (const v of voci) console.log(`  - ${v}`);
}
stampa("Funzioni da creare", esito.funzioniCreate);
stampa("Funzioni già presenti (non toccate)", esito.funzioniEsistenti);
stampa("Persone da creare", esito.personeCreate);
stampa("Persone già presenti (non toccate)", esito.personeGiaPresenti);
stampa("Responsabili di funzione collegati", esito.responsabiliCollegati);
stampa("Responsabili NON trovati fra le persone", esito.responsabiliNonTrovati);
if (!scrive) console.log('\nEra una prova a vuoto: per applicare, aggiungi "scrivi".');

await prisma.$disconnect();
