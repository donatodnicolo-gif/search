// Dati DIMOSTRATIVI (origine "demo") per vedere l'app popolata al primo avvio.
// I dati reali arrivano dalle sessioni Claude via API e dalla sync del Drive.
// Per ripartire puliti: npm run db:reset (ricrea il db e riesegue questo seed).
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const giaSeminato = await prisma.analisi.count({ where: { origine: "demo" } });
if (giaSeminato > 0) {
  console.log("Seed demo già presente: nessuna modifica.");
  await prisma.$disconnect();
  process.exit(0);
}

const oggi = new Date();
oggi.setHours(0, 0, 0, 0);
const giornoFa = (n) => new Date(oggi.getTime() - n * 86_400_000);

// Campagne d'esempio
const pmax = await prisma.campagna.create({
  data: {
    nome: "PMax Flowers — Milano (demo)",
    brand: "flowers",
    canale: "google_ads",
    stato: "attiva",
    obiettivo: "ROAS ≥ 4 sulle consegne Milano",
    budgetGiornaliero: 60,
    note: "Campagna dimostrativa creata dal seed.",
  },
});
const meta = await prisma.campagna.create({
  data: {
    nome: "Meta Advantage+ Cake (demo)",
    brand: "cake",
    canale: "meta_ads",
    stato: "in_apprendimento",
    obiettivo: "CPA ≤ 12 € sugli ordini torta",
    budgetGiornaliero: 35,
    note: "Campagna dimostrativa creata dal seed.",
  },
});

// Metriche degli ultimi 14 giorni (numeri plausibili, non reali)
for (let i = 13; i >= 0; i--) {
  const base = 40 + ((i * 7) % 25);
  await prisma.metricaCampagna.create({
    data: {
      campagnaId: pmax.id,
      data: giornoFa(i),
      spesa: base,
      impression: base * 210,
      click: Math.round(base * 3.2),
      conversioni: Math.round(base / 9),
      ricavi: base * 4.1,
    },
  });
  const baseM = 25 + ((i * 5) % 18);
  await prisma.metricaCampagna.create({
    data: {
      campagnaId: meta.id,
      data: giornoFa(i),
      spesa: baseM,
      impression: baseM * 480,
      click: Math.round(baseM * 4.5),
      conversioni: Math.round(baseM / 11),
      ricavi: baseM * 2.9,
    },
  });
}

// Un'analisi con azioni derivate
await prisma.analisi.create({
  data: {
    titolo: "Audit Google Ads Flowers — esempio (demo)",
    tipo: "audit_google",
    brand: "flowers",
    canale: "google_ads",
    esito: "attenzione",
    origine: "demo",
    dataAnalisi: giornoFa(2),
    fileDrive: "ads/Audit/esempio-audit-google-flowers.md",
    sintesi:
      "Esempio di sintesi depositata da un'analisi.\n\n- La PMax Milano tiene un ROAS 4.1 ma il 22% della spesa va su ricerche generiche fuori target.\n- Le sitelink non sono aggiornate alla collezione estiva.\n- Consigliato: lista di esclusioni + refresh asset entro la settimana.",
    azioni: {
      create: [
        {
          titolo: "Aggiungere esclusioni per le ricerche generiche (demo)",
          brand: "flowers",
          canale: "google_ads",
          priorita: "alta",
          owner: "ai",
          scadenza: giornoFa(-2),
          campagnaId: pmax.id,
          eventi: { create: { tipo: "creazione", autore: "demo", testo: "Creata dal seed dimostrativo" } },
        },
        {
          titolo: "Aggiornare sitelink alla collezione estiva (demo)",
          brand: "flowers",
          canale: "google_ads",
          priorita: "media",
          owner: "utente",
          scadenza: giornoFa(-5),
          eventi: { create: { tipo: "creazione", autore: "demo", testo: "Creata dal seed dimostrativo" } },
        },
      ],
    },
  },
});

console.log("Seed demo completato: 2 campagne, 28 metriche, 1 analisi, 2 azioni.");
await prisma.$disconnect();
