// ============================================================
//  Importa i partner ATTIVI da Deluxy Anagrafiche nella piattaforma.
//
//  Anagrafiche e' la fonte di verita' di CHI e' un partner attivo
//  (stato = "attivo", curato dal team commerciale). Qui li portiamo
//  dentro la piattaforma consegne, che oggi non li conosce.
//
//  Idempotente: l'aggancio a un partner gia' presente avviene in cascata
//  P.IVA -> email -> insegna normalizzata. Se aggancia aggiorna, altrimenti
//  crea. Rilanciarlo non duplica.
//
//  NON scrive province e servizi: quelli non esistono in Anagrafiche,
//  vengono dal legacy app.deluxy.it in un secondo passaggio.
//
//  Uso:
//    ANAGRAFICHE_API_KEY=... node --env-file=.env scripts/importa-partner-anagrafiche.mjs
//    ... --scrivi     esegue davvero (senza, e' una prova a vuoto)
//    ... --collega    rimanda ad Anagrafiche il platformId di ogni partner
//                     agganciato o creato (richiede una chiave di SCRITTURA)
//
//  Perche' --collega: senza il platformId i due archivi restano estranei e la
//  domanda "questo partner della piattaforma e' attivo?" resta senza risposta.
//  E' il presupposto perche' la piattaforma possa diventare la padrona della
//  creazione dei nuovi partner: e' cosi' che il registro la riconosce.
// ============================================================
import { PrismaClient } from "@prisma/client";

const SCRIVI = process.argv.includes("--scrivi");
const COLLEGA = process.argv.includes("--collega");
const BASE = process.env.ANAGRAFICHE_URL ?? "https://deluxy-anagrafiche.vercel.app";
const KEY = process.env.ANAGRAFICHE_API_KEY;
if (!KEY) {
  console.error("Manca ANAGRAFICHE_API_KEY.");
  process.exit(1);
}

// Chiave di confronto per le insegne: via accenti, punteggiatura, forme
// societarie e doppi spazi. "142 RESTAURANT (BEYOND 142 SRL)" -> "142 restaurant"
const FORME = /\b(s\.?r\.?l\.?s?|s\.?p\.?a\.?|s\.?n\.?c\.?|s\.?a\.?s\.?|societa|ditta|di [a-z]+ [a-z]+ ?& ?c)\b/g;
function normalizza(s) {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(FORME, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function leggiAttivi() {
  const tutti = [];
  for (let pagina = 1; ; pagina++) {
    const url = `${BASE}/api/v1/partners?stato=attivo&perPage=200&page=${pagina}`;
    const res = await fetch(url, { headers: { "x-api-key": KEY } });
    if (!res.ok) throw new Error(`Anagrafiche HTTP ${res.status}: ${await res.text()}`);
    const j = await res.json();
    tutti.push(...j.dati);
    if (tutti.length >= j.totale || j.dati.length === 0) return { tutti, totale: j.totale };
  }
}

// L'email spesso NON e' nel campo principale ma sul primo referente utile:
// in Anagrafiche i contatti sono un elenco a parte. Guardare solo `email`
// fa sembrare privi di email partner che invece ce l'hanno (29 su 41).
function contattoConEmail(a) {
  return (a.contatti ?? []).find((c) => c.email);
}
function emailDi(a) {
  return a.email ?? contattoConEmail(a)?.email ?? null;
}

// Restituisce ad Anagrafiche il legame con la piattaforma. Va usata la chiave
// della piattaforma (`deluxy-platform`): il registro deduce da li' la
// provenienza del dato. `attivo`, `stato` e `interessi` NON si mandano: sono
// curati dal team, il registro li scarterebbe comunque.
async function collega(idAnagrafica, platformId, nome) {
  const res = await fetch(`${BASE}/api/v1/partners`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": KEY },
    body: JSON.stringify({
      platformId,
      nome,
      sistema: "platform",
      idEsterno: platformId,
      asOf: new Date().toISOString(),
    }),
  });
  if (!res.ok) return { ok: false, dettaglio: `HTTP ${res.status} ${await res.text().catch(() => "")}` };
  const j = await res.json().catch(() => ({}));
  return { ok: true, esito: j.esito, idRegistro: j.id ?? idAnagrafica };
}

const prisma = new PrismaClient();
const { tutti, totale } = await leggiAttivi();
console.log(`Anagrafiche: ${totale} partner con stato="attivo", ${tutti.length} letti.\n`);

const esistenti = await prisma.partner.findMany();
const perPiva = new Map(esistenti.filter((p) => p.vatNumber).map((p) => [p.vatNumber, p]));
const perEmail = new Map(esistenti.map((p) => [p.email.toLowerCase(), p]));
const perNome = new Map(esistenti.map((p) => [normalizza(p.insegna), p]));

const esito = { agganciati: [], creati: [], saltati: [], collegati: [], nonCollegati: [] };

const emailUsate = new Set(esistenti.map((p) => p.email.toLowerCase()));

for (const a of tutti) {
  const email = emailDi(a);
  const referente = contattoConEmail(a);

  // Cascata di aggancio, dalla piu' forte alla piu' debole.
  let match = null;
  let via = null;
  if (a.pIva && perPiva.has(a.pIva)) { match = perPiva.get(a.pIva); via = "P.IVA"; }
  if (!match && email && perEmail.has(email.toLowerCase())) { match = perEmail.get(email.toLowerCase()); via = "email"; }
  if (!match && perNome.has(normalizza(a.nome))) { match = perNome.get(normalizza(a.nome)); via = "insegna"; }

  // L'email e' obbligatoria e unica sulla piattaforma: senza, non si crea.
  if (!match && !email) {
    esito.saltati.push({ nome: a.nome, citta: a.citta, motivo: "nessuna email, ne' sull'anagrafica ne' sui referenti" });
    continue;
  }
  // Due partner distinti che condividono l'email di un referente (es. la stessa
  // sede commerciale) violerebbero il vincolo di unicita': meglio fermarsi.
  if (!match && emailUsate.has(email.toLowerCase())) {
    esito.saltati.push({ nome: a.nome, citta: a.citta, motivo: `email gia' usata da un altro partner (${email})` });
    continue;
  }

  const campi = {
    insegna: a.nome,
    businessName: a.ragioneSociale ?? null,
    vatNumber: a.pIva ?? null,
    fiscalCode: a.codiceFiscale ?? null,
    address: a.indirizzo ?? null,
    phone: a.telefono ?? referente?.telefono ?? null,
    contactName: referente?.nome ?? null,
    active: true,
  };

  if (match) {
    esito.agganciati.push({ nome: a.nome, via, insegnaPiattaforma: match.insegna, id: match.id });
    if (SCRIVI) {
      // Solo i campi vuoti sulla piattaforma: non sovrascrivo dati gia' curati qui.
      const soloVuoti = Object.fromEntries(
        Object.entries(campi).filter(([k, v]) => v != null && k !== "active" && (match[k] == null || match[k] === "")),
      );
      if (Object.keys(soloVuoti).length) {
        await prisma.partner.update({ where: { id: match.id }, data: soloVuoti });
      }
      await rimandaIlLegame(a, match.id);
    }
  } else {
    esito.creati.push({
      nome: a.nome,
      citta: a.citta,
      email,
      da: a.email ? "anagrafica" : "referente",
      categoria: a.categoria,
    });
    emailUsate.add(email.toLowerCase());
    if (SCRIVI) {
      const creato = await prisma.partner.create({ data: { ...campi, email } });
      await rimandaIlLegame(a, creato.id);
    }
  }
}

async function rimandaIlLegame(a, platformId) {
  if (!COLLEGA) return;
  const esitoCollega = await collega(a.id, platformId, a.nome);
  if (esitoCollega.ok) esito.collegati.push({ nome: a.nome, platformId, esito: esitoCollega.esito });
  else esito.nonCollegati.push({ nome: a.nome, dettaglio: esitoCollega.dettaglio });
}

const r = (t, righe) => {
  console.log(`\n### ${t}: ${righe.length}`);
  for (const x of righe) console.log("  - " + JSON.stringify(x));
};
r("AGGANCIATI a un partner gia' esistente", esito.agganciati);
r("DA CREARE", esito.creati);
r("SALTATI", esito.saltati);
if (COLLEGA) {
  console.log(`\n### LEGAME RIMANDATO AD ANAGRAFICHE: ${esito.collegati.length} riusciti`);
  r("LEGAME NON RIUSCITO", esito.nonCollegati);
} else {
  console.log("\n(--collega non attivo: il platformId NON viene rimandato ad Anagrafiche)");
}

console.log(
  SCRIVI
    ? "\n>>> SCRITTURA ESEGUITA."
    : "\n>>> PROVA A VUOTO: nessuna scrittura. Rilancia con --scrivi per applicare.",
);
await prisma.$disconnect();
