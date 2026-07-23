// Carica la conoscenza estratta dai Definitivi del Drive (22-23/07/2026):
//   - campagne reali della Mappa 00.4 con landing associate
//   - registro landing page
//   - backlog di test Meta (documenti 8, 8.1, 8.2, 8.3)
// Idempotente: se una campagna/landing/test con lo stesso nome esiste, si aggiorna.
// Il canonico resta la 00.4 su Drive: questo è lo specchio navigabile.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ---------- Landing page (da 00.4 + report Gifts 09/07) ----------
const LANDING = [
  // Flowers
  { url: "deluxyflowers.com/en/pages/consegna-fiori-in-italia", brand: "flowers", lingua: "en", tipo: "dedicata", scopo: "Spedire fiori in Italia (EN) — landing principale ENG", gemellaUrl: "deluxyflowers.com/pages/consegna-fiori-in-italia" },
  { url: "deluxyflowers.com/pages/consegna-fiori-in-italia", brand: "flowers", lingua: "it", tipo: "dedicata", scopo: "Consegna fiori in Italia (IT)", gemellaUrl: "deluxyflowers.com/en/pages/consegna-fiori-in-italia" },
  { url: "deluxyflowers.com/en/pages/paris", brand: "flowers", lingua: "en", tipo: "dedicata", scopo: "Fiori verso la Francia" },
  { url: "deluxyflowers.com/pages/allestimenti-floreali-per-eventi", brand: "flowers", lingua: "it", tipo: "lead", scopo: "Lead eventi / matrimoni" },
  { url: "deluxyflowers.com/pages/fiori-darte", brand: "flowers", lingua: "it", tipo: "dedicata", scopo: "Collezione d'autore (Meta [Opera])" },
  { url: "deluxyflowers.com/", brand: "flowers", lingua: "it", tipo: "home", scopo: "Brand protection", stato: "mismatch", note: "Mismatch noto: campagna brand → home" },
  // Gifts (deluxy.it)
  { url: "deluxy.it/flowers/milan", brand: "gifts", lingua: "en", tipo: "dedicata", scopo: "Fiori Milano ENG (DC1)" },
  { url: "deluxy.it/fiori-lusso/a-roma", brand: "gifts", lingua: "it", tipo: "dedicata", scopo: "Fiori Roma (DC2 ENG + DC5 ITA)" },
  { url: "deluxy.it/fiori-lusso/domicilio", brand: "gifts", lingua: "it", tipo: "dedicata", scopo: "Fiori Milano ITA (DC4)" },
  { url: "deluxy.it/delivery/torte", brand: "gifts", lingua: "it", tipo: "dedicata", scopo: "Torte Milano (DC3)" },
  { url: "deluxy.it/collections/torte", brand: "gifts", lingua: "it", tipo: "collection", scopo: "Torte Roma (DC6)" },
  { url: "deluxy.it/collections/fiori", brand: "gifts", lingua: "it", tipo: "collection", scopo: "Fiori Firenze (DC7)" },
  { url: "deluxy.it/collections/gifts", brand: "gifts", lingua: "it", tipo: "collection", scopo: "Gifts Milano (DC10)" },
  { url: "deluxy.it/collections/colazioni", brand: "gifts", lingua: "it", tipo: "collection", scopo: "Colazioni Milano (DC11)" },
  { url: "deluxy.it/delivery/di_lusso", brand: "gifts", lingua: "it", tipo: "dedicata", scopo: "Brand protection (DC12)" },
  { url: "deluxy.it/pages/regali-aziendali", brand: "gifts", lingua: "it", tipo: "lead", scopo: "Regali B2B (DC9)" },
  { url: "business.deluxy.it/pages/catering", brand: "gifts", lingua: "it", tipo: "lead", scopo: "Catering Milano B2B (DC8)" },
  { url: "deluxy.it/pages/fioriperstupire", brand: "gifts", lingua: "it", tipo: "dedicata", scopo: "Landing reale più cliccata (470 clic, report 09/07)", stato: "da_verificare", note: "Attribuzione per-campagna da completare; converte la gemella /en" },
  { url: "deluxy.it/pages/colazioni-stellate", brand: "gifts", lingua: "it", tipo: "dedicata", scopo: "Landing reale colazioni (143 clic)", stato: "da_verificare" },
  { url: "deluxy.it/pages/compleanno", brand: "gifts", lingua: "it", tipo: "dedicata", scopo: "Landing reale compleanno (132 clic)", stato: "da_verificare" },
  { url: "deluxy.it/pages/maison-balloons", brand: "gifts", lingua: "it", tipo: "dedicata", scopo: "Landing palloncini (40 clic)", stato: "da_verificare" },
  // Cake
  { url: "cakedesign.me/pages/landing-torte-per-oggi", brand: "cake", lingua: "it", tipo: "dedicata", scopo: "Torte per Oggi (Sales ITA)", gemellaUrl: "cakedesign.me/en/pages/landing-torte-per-oggi" },
  { url: "cakedesign.me/en/pages/landing-torte-per-oggi", brand: "cake", lingua: "en", tipo: "dedicata", scopo: "Spedire torta in Italia (ENG)", gemellaUrl: "cakedesign.me/pages/landing-torte-per-oggi" },
  { url: "cakedesign.me/pages/cakedesign", brand: "cake", lingua: "it", tipo: "dedicata", scopo: "Crea la tua torta" },
  { url: "cakedesign.me/pages/torte-di-compleanno", brand: "cake", lingua: "it", tipo: "dedicata", scopo: "Birthday cake ITA (0 conv)", stato: "da_verificare" },
  { url: "cakedesign.me/en/pages/regala-una-torta", brand: "cake", lingua: "en", tipo: "dedicata", scopo: "Birthday Cake ENG", stato: "mismatch", note: "MISMATCH lingua noto (A13), 0 conv" },
  { url: "cakedesign.me/", brand: "cake", lingua: "it", tipo: "home", scopo: "Brand protection", stato: "mismatch", note: "Mismatch noto: campagna brand → home" },
];

// ---------- Campagne reali (Mappa 00.4, verificata 14-16/07/2026) ----------
const CAMPAGNE = [
  // Flowers Google
  { nome: "[Deluxyflowers] ITALIAN-ENG", brand: "flowers", canale: "google_ads", stato: "attiva", budget: 80, landing: "deluxyflowers.com/en/pages/consegna-fiori-in-italia", note: "Limited by budget; RSA star, 87% conv ENG" },
  { nome: "[Deluxyflowers] ITALIAN-ITA", brand: "flowers", canale: "google_ads", stato: "attiva", budget: 28.75, landing: "deluxyflowers.com/pages/consegna-fiori-in-italia", note: "Budget alzato da 23 a 28,75 il 15/7" },
  { nome: "[Deluxyflowers] Francia-FR", brand: "flowers", canale: "google_ads", stato: "attiva", landing: "deluxyflowers.com/en/pages/paris", note: "CVR 5,34% · ROAS 4,61" },
  { nome: "[Deluxyflowers] Lead Generico", brand: "flowers", canale: "google_ads", stato: "attiva", landing: "deluxyflowers.com/pages/allestimenti-floreali-per-eventi" },
  { nome: "[Deluxyflower] Brand protection", brand: "flowers", canale: "google_ads", stato: "attiva", budget: 4.5, landing: "deluxyflowers.com/", note: "Landing = home (mismatch noto)" },
  // Flowers Meta
  { nome: "[Opera] ATC - VOLUME", brand: "flowers", canale: "meta_ads", stato: "attiva", budget: 40, landing: "deluxyflowers.com/pages/fiori-darte", note: "CBO; sostituisce ATC-NEW dal 16/7" },
  { nome: "Retargeting - Microacquisti (Flowers)", brand: "flowers", canale: "meta_ads", stato: "in_apprendimento", budget: 10, note: "Apprendimento limitato; DPA/catalogo" },
  // Gifts Google (account REGALI DELUXE)
  { nome: "DC1 Fiori Milano ENG", brand: "gifts", canale: "google_ads", stato: "attiva", budget: 30, landing: "deluxy.it/flowers/milan", note: "Annunci limitati" },
  { nome: "DC2 Roma (Fiori) ENG", brand: "gifts", canale: "google_ads", stato: "attiva", budget: 19.1, landing: "deluxy.it/fiori-lusso/a-roma", note: "Limited by budget" },
  { nome: "DC3 Torte MILANO", brand: "gifts", canale: "google_ads", stato: "attiva", budget: 12, landing: "deluxy.it/delivery/torte" },
  { nome: "DC4 Fiori Milano ITA", brand: "gifts", canale: "google_ads", stato: "attiva", budget: 15, landing: "deluxy.it/fiori-lusso/domicilio", note: "Budget da 20 a 15 il 14/7" },
  { nome: "DC5 Roma (Fiori) ITA", brand: "gifts", canale: "google_ads", stato: "attiva", budget: 10, landing: "deluxy.it/fiori-lusso/a-roma" },
  { nome: "DC6 Torte ROMA", brand: "gifts", canale: "google_ads", stato: "attiva", budget: 10, landing: "deluxy.it/collections/torte" },
  { nome: "DC7 Fiori Firenze", brand: "gifts", canale: "google_ads", stato: "attiva", budget: 11, landing: "deluxy.it/collections/fiori" },
  { nome: "DC8 Catering Milan B2B", brand: "gifts", canale: "google_ads", stato: "attiva", budget: 8, landing: "business.deluxy.it/pages/catering" },
  { nome: "DC9 Regali B2B", brand: "gifts", canale: "google_ads", stato: "attiva", budget: 8, landing: "deluxy.it/pages/regali-aziendali" },
  { nome: "DC10 Gifts Milano 14 gen ITA", brand: "gifts", canale: "google_ads", stato: "attiva", budget: 8, landing: "deluxy.it/collections/gifts", note: "Idonea limitata" },
  { nome: "DC11 Colazioni MILANO", brand: "gifts", canale: "google_ads", stato: "attiva", budget: 6.3, landing: "deluxy.it/collections/colazioni" },
  { nome: "DC12 Brand Protection", brand: "gifts", canale: "google_ads", stato: "attiva", budget: 9, landing: "deluxy.it/delivery/di_lusso" },
  // Gifts Meta
  { nome: "VENDITE (Acquisto sito web)", brand: "gifts", canale: "meta_ads", stato: "in_apprendimento", budget: 35, note: "CBO" },
  { nome: "DEF ATC", brand: "gifts", canale: "meta_ads", stato: "in_apprendimento", budget: 30, note: "CBO" },
  { nome: "[Palloncini] AWARENESS", brand: "gifts", canale: "meta_ads", stato: "attiva", budget: 17, landing: "deluxy.it/pages/maison-balloons", note: "Ad set video in pausa dal 13/7" },
  { nome: "Retargeting-Microacquisti-Nik", brand: "gifts", canale: "meta_ads", stato: "in_pausa", budget: 10, note: "In pausa dal 13/7: pool ~400, frequenza 15,4" },
  // Cake Google
  { nome: "[Cakedesign] (Sales) ITA", brand: "cake", canale: "google_ads", stato: "attiva", budget: 25, landing: "cakedesign.me/pages/landing-torte-per-oggi" },
  { nome: "[Create your Cake] (Sales) ENG", brand: "cake", canale: "google_ads", stato: "attiva", budget: 9.55, landing: "cakedesign.me/en/pages/landing-torte-per-oggi" },
  { nome: "[Cakedesign] Brand Protection ITA+ENG", brand: "cake", canale: "google_ads", stato: "attiva", budget: 4.5, landing: "cakedesign.me/", note: "Gruppo ENG in pausa" },
  // Cake Meta
  { nome: "[Continuativa] ATC (Cake)", brand: "cake", canale: "meta_ads", stato: "attiva", budget: 15 },
  { nome: "Retargeting - Microacquisti (Cake)", brand: "cake", canale: "meta_ads", stato: "attiva", budget: 5 },
  { nome: "Generica AWARENESS (VIDEO)", brand: "cake", canale: "meta_ads", stato: "attiva", budget: 8, note: "Obiettivo notorietà, nessuna landing" },
];

// ---------- Backlog test Meta (documenti 8 / 8.1 / 8.2 / 8.3) ----------
const TEST_META = [
  {
    titolo: "Rotazione/refresh creativo a segnale (8 settimane)", brand: "cross", fase: "trasversale", stato: "in_corso",
    ipotesi: "Il refresh a segnale (fatigue) batte il refresh a calendario fisso; volume test proporzionato al budget.",
    variabile: "Cadenza produzione creativa (2 concetti/mese a 50€/g, 3-4 a 100€/g) su fasi I+D",
    metricaSuccesso: "KPI di fase + età dei vincenti", guardrail: "Freeze creativo da GIO 13/8; W5 solo monitoraggio; batch ogni ≥2 settimane (slot lunedì)",
    dataInizio: "2026-07-20", dataVerifica: "2026-09-07", fonte: "8.3 Rotazione Creativa Meta (bozza 15/7)",
  },
  {
    titolo: "A/B permanente hook USP in fase A", brand: "cross", fase: "A", stato: "in_corso",
    ipotesi: "La rotazione degli hook mantiene CTR/hook rate stabile sul freddo.",
    variabile: "Esecuzione dell'hook (stesso claim 7.3), ~1 hook nuovo per ciclo",
    metricaSuccesso: "Hook rate / CTR", fonte: "8 Campagne AIDA su Meta",
  },
  {
    titolo: "Interessi lusso vs LAL Value in fase A (50/50)", brand: "cross", fase: "A", stato: "pianificato",
    ipotesi: "Il pubblico LAL 1-3% value è più efficiente degli interessi lusso a parità di budget.",
    variabile: "Fonte del pubblico freddo (AIDA 1 vs AIDA 1b)", pubblico: "Interessi lusso/occasioni vs LAL 1-3% value",
    metricaSuccesso: "Costo per LPV di qualità; vincitore dopo 2 settimane", fonte: "8 / 8.1 §1 (previsto ai budget ≥150€/g)",
  },
  {
    titolo: "Clausola di revisione fase A: Traffico vs Vendite", brand: "cross", fase: "A", stato: "pianificato",
    ipotesi: "Da falsificare: la campagna Traffico (LPV) riempie i pool e regge i guardrail qualità.",
    variabile: "Obiettivo campagna (Traffico/LPV vs Interazione o Vendite)",
    metricaSuccesso: "Costo per LPV di qualità (sessioni engaged GA4 ≥40%, Audience Network = 0)",
    guardrail: "Se fallisce → spostare budget A su I+D", dataVerifica: "2026-08-24", fonte: "8.1 §2.5 (checkpoint W6, vincolante)",
  },
  {
    titolo: "Test di incrementalità su X (retargeting)", brand: "cross", fase: "X", stato: "pianificato",
    ipotesi: "Il retargeting è meno incrementale del ROAS attribuito.",
    variabile: "ROAS incrementale (holdout: pausa X 1-2 settimane su una geo, o Conversion Lift)",
    metricaSuccesso: "ROAS incrementale vs ROAS attribuito", fonte: "8.1 §4.3 (ricorrente trimestrale)",
  },
  {
    titolo: "Separare I e D a 150€/g", brand: "cross", fase: "I", stato: "idea",
    ipotesi: "A budget ≥150€/g separare Interest e Desire non strozza l'apprendimento.",
    variabile: "Struttura ad set (2 ad set separati vs accorpata I+D)", budgetGiornaliero: 150,
    guardrail: "Se dopo 3 settimane entrambe in apprendimento limitato → ri-accorpare", fonte: "8.1 §3.1",
  },
  {
    titolo: "Verifica life events in Ads Manager", brand: "cross", fase: "trasversale", stato: "pianificato",
    ipotesi: "\"Anniversario entro 30g\" disponibile; compleanno e \"amici di chi compie gli anni\" da verificare.",
    variabile: "Disponibilità targeting life events", metricaSuccesso: "Esito verifica manuale, annotato in 00.4",
    fonte: "8.2 §3.2 / §4.3 (manutenzione trimestrale)",
  },
  {
    titolo: "LAL CrossBrand vs LAL Value in fase A", brand: "cross", fase: "A", stato: "idea",
    ipotesi: "Il seed cross-brand (G4, 464 clienti) è più predittivo del multi-acquisto rispetto al seed value.",
    variabile: "Seed della lookalike", pubblico: "LAL CrossBrand vs LAL Value", fonte: "8.2 §4.2 #9",
  },
];

// ---------- esecuzione ----------
let nLanding = 0, nCampagne = 0, nTest = 0;

for (const l of LANDING) {
  const { url, ...resto } = l;
  await prisma.landingPage.upsert({
    where: { url },
    create: { url, stato: "attiva", ...resto },
    update: resto,
  });
  nLanding++;
}

for (const c of CAMPAGNE) {
  const landing = c.landing ? await prisma.landingPage.findUnique({ where: { url: c.landing } }) : null;
  const dati = {
    brand: c.brand, canale: c.canale, stato: c.stato,
    budgetGiornaliero: c.budget ?? null, note: c.note ?? null,
    landingId: landing?.id ?? null, obiettivo: c.obiettivo ?? null,
  };
  const esistente = await prisma.campagna.findFirst({ where: { nome: c.nome } });
  if (esistente) await prisma.campagna.update({ where: { id: esistente.id }, data: dati });
  else await prisma.campagna.create({ data: { nome: c.nome, ...dati } });
  nCampagne++;
}

for (const t of TEST_META) {
  const dati = {
    brand: t.brand, fase: t.fase ?? null, ipotesi: t.ipotesi, variabile: t.variabile ?? null,
    pubblico: t.pubblico ?? null, formato: t.formato ?? null, metricaSuccesso: t.metricaSuccesso ?? null,
    guardrail: t.guardrail ?? null, budgetGiornaliero: t.budgetGiornaliero ?? null,
    dataInizio: t.dataInizio ? new Date(t.dataInizio) : null,
    dataVerifica: t.dataVerifica ? new Date(t.dataVerifica) : null,
    stato: t.stato, fonte: t.fonte ?? null,
  };
  const esistente = await prisma.testMeta.findFirst({ where: { titolo: t.titolo } });
  if (esistente) await prisma.testMeta.update({ where: { id: esistente.id }, data: dati });
  else await prisma.testMeta.create({ data: { titolo: t.titolo, ...dati } });
  nTest++;
}

await prisma.registroEvento.create({
  data: {
    autore: "import", tipo: "import", entita: "campagna",
    titolo: "Caricata conoscenza Definitivi (00.4 + docs 8.x)",
    dettaglio: `landing: ${nLanding} · campagne: ${nCampagne} · test Meta: ${nTest}`,
  },
});
console.log(`Seed ADV: ${nLanding} landing · ${nCampagne} campagne · ${nTest} test Meta`);
await prisma.$disconnect();
