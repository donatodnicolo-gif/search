// Importa le anagrafiche B2B dal tracker Excel nel registro.
// Uso:  npm run import:excel -- [percorso-del-file.xlsx]
// Default: ~/Downloads/ANAGRAFICHE B2B COMPLETE - ACTIVITY TRACKER.xlsx
//
// L'import è idempotente: cancella e ricrea SOLO le anagrafiche con fonte
// "excel"; quelle create dalla piattaforma o a mano non vengono toccate.
import { PrismaClient } from "@prisma/client";
import { homedir } from "os";
import { join } from "path";
import XLSX from "xlsx";

const prisma = new PrismaClient();

const percorso =
  process.argv.slice(2).filter((a) => a !== "--")[0] ??
  join(homedir(), "Downloads", "ANAGRAFICHE B2B COMPLETE - ACTIVITY TRACKER.xlsx");

// ---------- utilità ----------

function testo(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

// Le date nell'Excel sono seriali (giorni dal 1900). 40000–60000 ≈ 2009–2064.
function dataDaSeriale(v) {
  if (typeof v !== "number" || v < 40000 || v > 60000) return null;
  return new Date(Math.round((v - 25569) * 86400 * 1000));
}

function mappaStato(raw) {
  if (!raw) return "prospect";
  const s = String(raw).toUpperCase();
  if (s.includes("NON INTERESS") || s.includes("NON ACCETTATA") || s === "NO") return "non_interessato";
  if (s.includes("PARTNER") || s.includes("ACCETTATA")) return "attivo";
  if (s.includes("TRATTATIVA")) return "in_trattativa";
  if (s.includes("CONTATTO")) return "in_contatto";
  if (s.includes("ATTESA")) return "in_attesa";
  if (s.includes("RICONTATTARE")) return "da_ricontattare";
  return "prospect";
}

function mappaCategoria(tipo, categoriaDefault) {
  if (!tipo) return categoriaDefault;
  const t = String(tipo).toUpperCase().trim();
  if (t.includes("FIORI")) return "FIORISTA";
  if (t.includes("PASTICCERIA")) return "PASTICCERIA";
  if (t.includes("CIOCCOLAT")) return "CIOCCOLATERIA";
  if (t.includes("RISTORANTE")) return "RISTORANTE";
  if (t.includes("CATERING")) return "CATERING";
  if (t.includes("GIFTING")) return "GIFTING";
  if (t.includes("CHEF")) return "CHEF PRIVATO";
  if (t.includes("ENOTECA")) return "ENOTECA";
  return t;
}

// Il blocco CONTATTI è testo libero, una persona per riga:
//   "FOUNDER & OWNER: Antonino Aiello - 338 1279000 - aa@100capri.com"
//   "Store: 081 837 7008"
function parseContatti(blocco) {
  if (!blocco) return [];
  const contatti = [];
  for (const rigaGrezza of String(blocco).split(/\r?\n/)) {
    const riga = rigaGrezza.trim();
    if (!riga) continue;
    let ruolo = null;
    let resto = riga;
    const conRuolo = riga.match(/^([^:@]{2,40}):\s*(.*)$/);
    if (conRuolo) {
      ruolo = conRuolo[1].trim();
      resto = conRuolo[2];
    }
    const contatto = { ruolo, nome: null, telefono: null, email: null };
    for (const segmento of resto.split(/\s+[-–]\s+|;/).map((s) => s.trim()).filter(Boolean)) {
      const email = segmento.match(/[\w.+-]+@[\w.-]+\.\w{2,}/);
      if (email) {
        if (!contatto.email) contatto.email = email[0].toLowerCase();
        continue;
      }
      const cifre = segmento.replace(/\D/g, "");
      if (cifre.length >= 8 && cifre.length / segmento.length > 0.5) {
        if (!contatto.telefono) contatto.telefono = segmento;
        continue;
      }
      if (!contatto.nome) contatto.nome = segmento;
    }
    if (contatto.nome || contatto.telefono || contatto.email) contatti.push(contatto);
  }
  return contatti;
}

// ---------- mappatura dei fogli ----------
// col.stato e col.mail sono liste di colonne: vince la prima valorizzata.
// col.note ed col.extra sono coppie [indice, etichetta].

const FOGLI = [
  {
    foglio: "BOUTIQUE",
    categoriaDefault: "BOUTIQUE",
    // Il TIPO PROSPECT delle boutique è rumore (es. "CORPORATE / BOUTIQUE"):
    // resta solo in tipoProspect, la categoria è sempre BOUTIQUE.
    tipoComeCategoria: false,
    col: {
      tipo: 0, nome: 1, citta: 2, provincia: 3, regione: 4, indirizzo: 5,
      contatti: 6, ultimaVisita: 7, account: 8,
      stato: [12, 20],
      mail: [15, 22],
      note: [[11, "Note"], [18, "Note retail marketing"]],
      extra: [
        [10, "servizioConsegnaLocale"], [13, "consegneGiornoStima"],
        [14, "stimaFatturato"], [17, "attivazioniRetailMarketing"],
        [19, "tipologiaInteresse"], [21, "stimaFatturatoRetail"],
      ],
    },
  },
  {
    foglio: "RISTORANTI  PASTICCERIE  FIORIS",
    categoriaDefault: "RISTORAZIONE",
    tipoComeCategoria: true,
    col: {
      tipo: 0, nome: 1, citta: 2, provincia: 3, regione: 4, indirizzo: 5,
      contatti: 6, ultimaVisita: 7, account: null,
      stato: [13, 22],
      mail: [26],
      note: [[16, "Note"], [20, "Note & decisioner"]],
      extra: [
        [8, "tipologiaPartnership"], [9, "ordine"], [11, "servizioConsegnaLocale"],
        [12, "chiamateEffettuate"], [14, "consegneGiornoStima"], [15, "stimaFatturato"],
        [19, "partnershipInCorso"], [21, "tipologiaPartnershipAttiva"],
        [23, "stimaFatturatoPartnership"], [24, "fee"], [25, "percentuale"],
      ],
    },
  },
  {
    foglio: "GIFTING  CATERING",
    categoriaDefault: "GIFTING",
    tipoComeCategoria: true,
    col: {
      tipo: 0, nome: 1, citta: 2, provincia: 3, regione: 4, indirizzo: 5,
      // "ULTIMA MAIL / TELEFONATA" (col 17) è l'ultimo contatto del gifting
      contatti: 6, ultimaVisita: 17, account: 8,
      stato: [14],
      mail: [],
      note: [[12, "Note & decisioner"], [18, "Note"]],
      extra: [
        [7, "tipologia"], [10, "arrivoContatto"], [11, "fornitore"],
        [13, "destinazioneRegali"], [15, "stimaBudgetRegali"],
        [16, "tipologieStimeVolumi"],
      ],
    },
  },
];

function estraiRiga(riga, config) {
  const { col, categoriaDefault, tipoComeCategoria } = config;
  const nome = testo(riga[col.nome]);
  if (!nome || nome.toUpperCase() === "PROSPECT" || nome.toUpperCase() === "PRPOSPECT") return null;

  const tipo = testo(riga[col.tipo]);
  const statoGrezzo = col.stato.map((i) => testo(riga[i])).find(Boolean);
  const email = col.mail.map((i) => testo(riga[i])).find((v) => v?.includes("@"));

  const note = col.note
    .map(([i, etichetta]) => {
      const v = testo(riga[i]);
      return v ? `${etichetta}: ${v}` : null;
    })
    .filter(Boolean)
    .join("\n\n");

  const extra = {};
  for (const [i, chiave] of col.extra) {
    let v = riga[i];
    if (v == null || String(v).trim() === "") continue;
    // Alcuni extra sono date seriali (es. ultima mail)
    const forseData = chiave.toLowerCase().includes("mail") ? dataDaSeriale(v) : null;
    extra[chiave] = forseData ? forseData.toISOString().slice(0, 10) : (typeof v === "number" ? v : String(v).trim());
  }

  const contattiRaw = testo(riga[col.contatti]);

  return {
    nome,
    categoria: tipoComeCategoria ? mappaCategoria(tipo, categoriaDefault) : categoriaDefault,
    tipoProspect: tipo,
    stato: mappaStato(statoGrezzo),
    citta: testo(riga[col.citta])?.toUpperCase() ?? null,
    provincia: testo(riga[col.provincia])?.toUpperCase() ?? null,
    regione: testo(riga[col.regione])?.toUpperCase() ?? null,
    indirizzo: testo(riga[col.indirizzo]),
    email: email?.toLowerCase() ?? null,
    account: col.account != null ? testo(riga[col.account]) : null,
    ultimaVisita: col.ultimaVisita != null ? dataDaSeriale(riga[col.ultimaVisita]) : null,
    note: note || null,
    contattiRaw,
    datiExtra: Object.keys(extra).length ? JSON.stringify(extra) : null,
    contatti: parseContatti(contattiRaw),
  };
}

// ---------- esecuzione ----------

console.log(`Leggo ${percorso}`);
const wb = XLSX.readFile(percorso);

const anagrafiche = [];
for (const config of FOGLI) {
  const ws = wb.Sheets[config.foglio];
  if (!ws) {
    console.warn(`! Foglio "${config.foglio}" non trovato, salto`);
    continue;
  }
  const righe = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  let contate = 0;
  for (const riga of righe.slice(1)) {
    const a = estraiRiga(riga, config);
    if (a) {
      anagrafiche.push(a);
      contate++;
    }
  }
  console.log(`  ${config.foglio}: ${contate} anagrafiche`);
}

// Il foglio CONCIERGE non ha intestazione: colonne fisse nome..contatti
const concierge = wb.Sheets["CONCIERGE"];
if (concierge) {
  const righe = XLSX.utils.sheet_to_json(concierge, { header: 1, defval: null });
  let contate = 0;
  for (const riga of righe) {
    const nome = testo(riga[0]);
    if (!nome) continue;
    const contattiRaw = testo(riga[5]);
    anagrafiche.push({
      nome,
      categoria: "CONCIERGE",
      tipoProspect: null,
      stato: "prospect",
      citta: testo(riga[1])?.toUpperCase() ?? null,
      provincia: testo(riga[2])?.toUpperCase() ?? null,
      regione: testo(riga[3])?.toUpperCase() ?? null,
      indirizzo: testo(riga[4]),
      email: null,
      account: null,
      ultimaVisita: null,
      note: null,
      contattiRaw,
      datiExtra: null,
      contatti: parseContatti(contattiRaw),
    });
    contate++;
  }
  console.log(`  CONCIERGE: ${contate} anagrafiche`);
}

// Dedup per nome+città+categoria (tiene la prima occorrenza)
const viste = new Set();
const uniche = [];
let duplicate = 0;
for (const a of anagrafiche) {
  const chiave = [a.nome.toUpperCase(), a.citta ?? "", a.categoria].join("|");
  if (viste.has(chiave)) {
    duplicate++;
    continue;
  }
  viste.add(chiave);
  uniche.push(a);
}

const esistentiExcel = await prisma.partner.count({ where: { fonte: "excel" } });
console.log(`\nAnagrafiche uniche: ${uniche.length} (${duplicate} duplicati saltati)`);
console.log(`Sostituisco le ${esistentiExcel} anagrafiche esistenti con fonte "excel"…`);

await prisma.partner.deleteMany({ where: { fonte: "excel" } });

let create = 0;
let contattiTotali = 0;
for (const { contatti, ...dati } of uniche) {
  await prisma.partner.create({
    data: {
      ...dati,
      fonte: "excel",
      // Data convenzionale del lotto storico del tracker (vigilia della nascita
      // del registro): un re-import non deve far sembrare "di oggi" anagrafiche vecchie.
      creatoIl: new Date("2026-07-16T10:00:00.000Z"),
      contatti: contatti.length ? { create: contatti } : undefined,
    },
  });
  create++;
  contattiTotali += contatti.length;
  if (create % 100 === 0) console.log(`  …${create}/${uniche.length}`);
}

console.log(`\nFatto: ${create} anagrafiche importate, ${contattiTotali} contatti estratti.`);
await prisma.$disconnect();
