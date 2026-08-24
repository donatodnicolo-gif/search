// Importa in Personale l'organico già esistente nel roster di Budgets
// (GET /api/v1/team?compensi=1):
//   1. team → Funzione (col responsabile collegato per nome);
//   2. persona → Persona (team come funzione, provenienza nelle note);
//   3. contratto → Inquadramento COME DICHIARATO: stagista → stage; dipendente
//      e consulente restano col loro nome («da precisare»: il roster non dice
//      la forma legale, e indovinare indeterminato/determinato sarebbe un dato
//      inventato. Part-time e periodo a budget vengono dichiarati anche loro);
//   4. retribuzione → Compenso: RAL = `lordoAnnuo` calcolato da BUDGETS con la
//      sua regola pubblicata (tabellare + superminimo, ×12 se mensile, ridotto
//      al part-time), mensilità e % contributi come dichiarate. Il netto non
//      viaggia mai (l'API di Budgets non lo espone, e qui non si deduce).
//
// Idempotente: persone e funzioni si riconoscono per NOME normalizzato (come
// fa il Hub); inquadramento e compenso si creano SOLO per chi non ne ha
// nessuno — un rilancio non duplica e non tocca ciò che è stato scritto a mano.
// Nessuna cancellazione, mai.
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

const oggiIt = new Date().toLocaleDateString("it-IT", { timeZone: "Europe/Rome" });

function notaProvenienza(p, anno) {
  const pezzi = [`Importata dal roster ${anno} di Budgets il ${oggiIt}`];
  if (p.tipoNome) pezzi.push(`tipo: ${p.tipoNome}`);
  if (p.maison) pezzi.push(`maison: ${p.maison}`);
  const mesi = descriviMesi(p.mesi);
  if (mesi) pezzi.push(`mesi a budget: ${mesi}`);
  return pezzi.join(" · ");
}

// Il roster distingue solo tre tipi: stagista ha un contratto 1:1 (stage);
// gli altri due restano col nome dichiarato — la forma legale la scrive chi
// conosce il contratto vero, con una riga nuova d'inquadramento.
const TIPO_CONTRATTO_DA_BUDGETS = {
  STAGISTA: "stage",
  DIPENDENTE: "dipendente",
  CONSULENTE: "consulente",
};

const eur = (v) =>
  v.toLocaleString("it-IT", { useGrouping: "always", maximumFractionDigits: 2 }) + " €";

// ---------- lettura da Budgets (coi compensi dichiarati) ----------
const risposta = await fetch(`${BUDGETS_URL}/api/v1/team?compensi=1`, {
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
if (!(dati.compensiInclusi && (squadre[0]?.persone?.[0]?.retribuzione || senzaTeam[0]?.retribuzione))) {
  console.error(
    "L'API di Budgets non ha restituito la retribuzione dichiarata: serve la versione con ?compensi=1 esteso (deploy del 24/08).",
  );
  process.exit(1);
}
console.log(scrive ? "MODO: scrivi (le modifiche si applicano).\n" : "MODO: prova a vuoto (nessuna scrittura).\n");

// ---------- stato attuale di Personale ----------
const funzioniEsistenti = await prisma.funzione.findMany();
const personeEsistenti = await prisma.persona.findMany({
  include: { _count: { select: { inquadramenti: true, compensi: true } } },
});
const funzionePerNome = new Map(funzioniEsistenti.map((f) => [normalizza(f.nome), f]));
const personaPerNome = new Map(personeEsistenti.map((p) => [normalizza(p.nome), p]));

const esito = {
  funzioniCreate: [],
  funzioniEsistenti: [],
  personeCreate: [],
  personeGiaPresenti: [],
  responsabiliCollegati: [],
  responsabiliNonTrovati: [],
  inquadramentiCreati: [],
  inquadramentiSaltati: [],
  compensiCreati: [],
  compensiSenzaImporto: [],
  compensiSaltati: [],
};

// ---------- 1 · team → funzioni ----------
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

// ---------- 2 · persone ----------
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
        funzioneId: funzione && funzione.id !== "(prova)" ? funzione.id : null,
        note: notaProvenienza(p, anno),
      },
    });
    personaPerNome.set(chiave, { ...creata, _count: { inquadramenti: 0, compensi: 0 } });
  } else {
    personaPerNome.set(chiave, { id: "(prova)", nome: p.nome, _count: { inquadramenti: 0, compensi: 0 } });
  }
}

for (const squadra of squadre) {
  for (const p of squadra.persone ?? []) await importaPersona(p, squadra.nome);
}
for (const p of senzaTeam) await importaPersona(p, null);

// ---------- 3 · responsabili dei team (per nome, dopo che le persone esistono) ----------
for (const squadra of squadre) {
  if (!squadra.responsabile) continue;
  const funzione = funzionePerNome.get(normalizza(squadra.nome));
  const responsabile = personaPerNome.get(normalizza(squadra.responsabile));
  if (!funzione || !responsabile) {
    esito.responsabiliNonTrovati.push(`${squadra.nome} → ${squadra.responsabile}`);
    continue;
  }
  if (funzione.responsabileId && funzione.responsabileId === responsabile.id) {
    // già collegato: niente da fare e niente da riportare come novità
  } else {
    esito.responsabiliCollegati.push(`${squadra.nome} → ${squadra.responsabile}`);
    if (scrive && funzione.id !== "(prova)" && responsabile.id !== "(prova)") {
      await prisma.funzione.update({ where: { id: funzione.id }, data: { responsabileId: responsabile.id } });
    }
  }
}

// ---------- 4 · contratti e retribuzioni COME DICHIARATI ----------
// Decorrenza = primo giorno del primo mese a budget dell'anno: è il periodo
// dichiarato nel roster (un contratto che parte prima lo corregge chi lo sa).
function decorrenzaDa(p) {
  const primoMese = Array.isArray(p.mesi) && p.mesi.length > 0 ? Math.min(...p.mesi) : 1;
  return new Date(Date.UTC(anno, primoMese - 1, 1));
}

async function importaContratto(p) {
  const persona = personaPerNome.get(normalizza(p.nome));
  if (!persona) return;

  const tipoContratto = TIPO_CONTRATTO_DA_BUDGETS[p.tipo] ?? "altro";
  const partTimePct = Math.round(p.partTimePct ?? 100);
  const mesiTesto = descriviMesi(p.mesi);

  // Inquadramento: solo per chi non ne ha nessuno (chi ha già una storia
  // scritta a mano non si tocca).
  if (persona._count.inquadramenti > 0) {
    esito.inquadramentiSaltati.push(`${p.nome} (ne ha già ${persona._count.inquadramenti})`);
  } else {
    esito.inquadramentiCreati.push(
      `${p.nome}: ${p.tipoNome ?? p.tipo}${partTimePct !== 100 ? ` · part-time ${partTimePct}%` : ""}${mesiTesto ? ` · ${mesiTesto}` : ""}`,
    );
    if (scrive && persona.id !== "(prova)") {
      // La nota scritta dal primo import diceva «da registrare»: ora non più.
      const notaPulita = (persona.note ?? "").replace(
        " · inquadramento e retribuzione da registrare con i dati veri del contratto",
        "",
      );
      if (notaPulita !== (persona.note ?? "")) {
        await prisma.persona.update({ where: { id: persona.id }, data: { note: notaPulita } });
      }
      await prisma.inquadramento.create({
        data: {
          personaId: persona.id,
          decorrenza: decorrenzaDa(p),
          tipoContratto,
          partTimePct: Math.min(100, Math.max(1, partTimePct)),
          note: [
            `Come dichiarato nel roster ${anno} di Budgets (${oggiIt})`,
            mesiTesto ? `mesi a budget: ${mesiTesto}` : null,
            tipoContratto === "stage" ? null : "forma legale del contratto da precisare",
          ]
            .filter(Boolean)
            .join(" · "),
        },
      });
    }
  }

  // Compenso: solo per chi non ne ha nessuno E ha un importo dichiarato.
  const r = p.retribuzione;
  if (persona._count.compensi > 0) {
    esito.compensiSaltati.push(`${p.nome} (ne ha già ${persona._count.compensi})`);
    return;
  }
  if (!r || !(r.lordoAnnuo > 0)) {
    esito.compensiSenzaImporto.push(p.nome);
    return;
  }
  const dichiarato =
    r.periodicita === "MENSILE"
      ? `dichiarati ${eur(r.importo)}/mese${r.superminimo ? ` + superminimo ${eur(r.superminimo)}/mese` : ""}`
      : `dichiarata RAL ${eur(r.importo)}${r.superminimo ? ` + superminimo ${eur(r.superminimo)}` : ""}`;
  esito.compensiCreati.push(`${p.nome}: RAL ${eur(r.lordoAnnuo)} · ${r.mensilita} mensilità · contributi ${r.contributiPct}%`);
  if (scrive && persona.id !== "(prova)") {
    await prisma.compenso.create({
      data: {
        personaId: persona.id,
        decorrenza: decorrenzaDa(p),
        ral: r.lordoAnnuo, // lordo annuo calcolato da Budgets con la SUA regola
        mensilita: r.mensilita ?? 12,
        contributiPct: r.contributiPct ?? null,
        note: `Come dichiarato nel roster ${anno} di Budgets (${oggiIt}): ${dichiarato}${
          (p.partTimePct ?? 100) !== 100 ? `, part-time ${Math.round(p.partTimePct)}%` : ""
        }`,
      },
    });
  }
}

for (const squadra of squadre) {
  for (const p of squadra.persone ?? []) await importaContratto(p);
}
for (const p of senzaTeam) await importaContratto(p);

// ---------- riepilogo ----------
function stampa(titolo, voci) {
  console.log(`${titolo}: ${voci.length}`);
  for (const v of voci) console.log(`  - ${v}`);
}
stampa("Funzioni da creare", esito.funzioniCreate);
stampa("Funzioni già presenti (non toccate)", esito.funzioniEsistenti);
stampa("Persone da creare", esito.personeCreate);
stampa("Persone già presenti (non toccate)", esito.personeGiaPresenti);
stampa("Responsabili di funzione da collegare", esito.responsabiliCollegati);
stampa("Responsabili NON trovati fra le persone", esito.responsabiliNonTrovati);
stampa("Inquadramenti da creare (come dichiarati)", esito.inquadramentiCreati);
stampa("Inquadramenti saltati (storia già scritta)", esito.inquadramentiSaltati);
stampa("Retribuzioni da creare (come dichiarate)", esito.compensiCreati);
stampa("Retribuzioni saltate (storia già scritta)", esito.compensiSaltati);
stampa("Senza importo dichiarato in Budgets (nessun compenso creato)", esito.compensiSenzaImporto);
if (!scrive) console.log('\nEra una prova a vuoto: per applicare, aggiungi "scrivi".');

await prisma.$disconnect();
