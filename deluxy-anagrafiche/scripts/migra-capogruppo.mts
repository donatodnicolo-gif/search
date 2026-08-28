// MIGRAZIONE — dai tre raggruppamenti (società fiscale · entità · insegna) al
// modello unico: CAPOGRUPPO con dentro AZIENDE, ognuna «paga da sé» o «paga la
// capogruppo».
//
// ⚠️ Richiesta dell'utente (28/08/2026): «un capogruppo può avere diverse
// società o aziende; ognuna paga da sé oppure paga la capogruppo». Tre concetti
// sovrapposti (SoggettoFiscale, GruppoAziendale, insegna capogruppo) diventano
// uno solo.
//
// ⚠️ NON cancella niente del vecchio: SoggettoFiscale e i suoi legami restano
// come RETE finché il codice nuovo non è provato. Aggiunge solo — le colonne di
// fatturazione sull'azienda (che nel DB ci sono già, congelate dal 27/08),
// `pagaDaSe`, e la fatturazione sul Capogruppo (la ex-tabella GruppoAziendale).
//
//   npx tsx scripts/migra-capogruppo.mts           → elenca, non scrive
//   npx tsx scripts/migra-capogruppo.mts --scrivi   → scrive
import "dotenv/config";
import { prisma } from "../src/lib/db";

const SCRIVI = process.argv.includes("--scrivi");
const S = (s: string) => JSON.stringify(s); // per l'output

const CAMPI = [
  "pIva", "codiceFiscale", "pec", "codiceSdi", "iban", "intestatarioConto",
  "banca", "metodoPagamento", "condizioniPagamento", "gruppoPagamento",
  "noteAmministrative", "amministrazioneNome", "amministrazioneTelefono", "amministrazioneEmail",
] as const;

async function esegui() {
  // --- 1. Schema additivo: colonne di fatturazione sul Capogruppo (ex
  //     GruppoAziendale) e `pagaDaSe` sull'azienda. IF NOT EXISTS = ripetibile. ---
  if (SCRIVI) {
    for (const c of CAMPI) {
      await prisma.$executeRawUnsafe(`ALTER TABLE "anagrafiche"."GruppoAziendale" ADD COLUMN IF NOT EXISTS "${c}" text`);
    }
    await prisma.$executeRawUnsafe(`ALTER TABLE "anagrafiche"."GruppoAziendale" ADD COLUMN IF NOT EXISTS "provenienza" jsonb`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "anagrafiche"."Partner" ADD COLUMN IF NOT EXISTS "pagaDaSe" boolean NOT NULL DEFAULT true`);
    // ⚠️ Sgancio il vecchio FK capogruppoId→Partner: da qui capogruppoId punterà
    // al Capogruppo. I valori restano (li leggo sotto prima di riscriverli).
    await prisma.$executeRawUnsafe(`ALTER TABLE "anagrafiche"."Partner" DROP CONSTRAINT IF EXISTS "Partner_capogruppoId_fkey"`);
    console.log("schema: colonne aggiunte, vecchio FK sganciato\n");
  }

  // --- 2. Leggo lo stato attuale (prima di toccare capogruppoId) ---
  const soggetti = await prisma.soggettoFiscale.findMany({
    include: { sedi: { where: { attivo: true }, select: { id: true, nome: true } }, gruppo: true },
  });
  const insegne = await prisma.partner.findMany({
    where: { capogruppoId: { not: null }, attivo: true },
    select: { id: true, nome: true, capogruppoId: true, capogruppo: { select: { id: true, nome: true } } },
  });

  // Piano: per ogni azienda, chi paga (sé / capogruppo) e con quali dati.
  type Azione =
    | { tipo: "propria"; partnerId: string; nome: string; dati: Record<string, string | null> }
    | { tipo: "capogruppo"; partnerId: string; nome: string; capogruppo: string };
  const azioni: Azione[] = [];
  // I capogruppo da creare/valorizzare: nome → dati di fatturazione (o vuoto).
  const capogruppi = new Map<string, { dati: Record<string, string | null>; provenienza: unknown }>();
  const assegna = new Map<string, string>(); // partnerId → nome capogruppo

  // 2a. SoggettoFiscale → l'azienda che fattura.
  for (const s of soggetti) {
    const dati = Object.fromEntries(CAMPI.map((c) => [c, (s as Record<string, unknown>)[c] as string | null]));
    if (s.sedi.length === 1) {
      // Una sola azienda: paga da sé, con questi dati.
      azioni.push({ tipo: "propria", partnerId: s.sedi[0].id, nome: s.sedi[0].nome, dati });
    } else if (s.sedi.length > 1) {
      // Più aziende sullo stesso soggetto: la fatturazione è della CAPOGRUPPO,
      // e ognuna la paga tramite lei.
      const nome = s.ragioneSociale;
      capogruppi.set(nome, { dati, provenienza: s.provenienza });
      for (const sede of s.sedi) {
        azioni.push({ tipo: "capogruppo", partnerId: sede.id, nome: sede.nome, capogruppo: nome });
        assegna.set(sede.id, nome);
      }
    }
    // 2a-bis. Se il soggetto apparteneva a un'ENTITÀ, l'azienda entra in quel
    // capogruppo (l'entità È già un Capogruppo). La fatturazione resta la sua
    // (propria) — l'entità raggruppa, non fattura per forza.
    if (s.gruppo && s.sedi.length === 1) {
      capogruppi.set(s.gruppo.nome, capogruppi.get(s.gruppo.nome) ?? { dati: {}, provenienza: null });
      assegna.set(s.sedi[0].id, s.gruppo.nome);
    }
  }

  // 2b. Vecchia insegna (capogruppoId→Partner): madre e figli in un capogruppo
  //     col nome della madre. Solo se non già assegnati sopra.
  for (const p of insegne) {
    const nomeCapo = p.capogruppo?.nome ?? "GRUPPO";
    capogruppi.set(nomeCapo, capogruppi.get(nomeCapo) ?? { dati: {}, provenienza: null });
    if (!assegna.has(p.id)) assegna.set(p.id, nomeCapo);
    if (p.capogruppoId && p.capogruppo && !assegna.has(p.capogruppoId)) assegna.set(p.capogruppoId, nomeCapo);
  }

  // ⚠️ Via i capogruppo VUOTI: l'insegna vecchia a volte descrive lo stesso
  // gruppo di un soggetto condiviso (DR.VRANJES), e i suoi membri sono già
  // assegnati là. Un capogruppo con 0 aziende è solo rumore.
  for (const nome of [...capogruppi.keys()]) {
    const membri = [...assegna.values()].filter((n) => n === nome).length;
    if (membri === 0) capogruppi.delete(nome);
  }

  // --- 3. Stampa il piano ---
  console.log(`AZIENDE che pagano DA SÉ (fatturazione propria): ${azioni.filter((a) => a.tipo === "propria").length}`);
  console.log(`CAPOGRUPPO da creare/valorizzare: ${capogruppi.size}`);
  for (const [nome, c] of capogruppi) {
    const membri = [...assegna.entries()].filter(([, n]) => n === nome).length;
    const conDati = Object.values(c.dati).some((v) => v);
    console.log(`  «${nome}»  ${membri} aziende  ${conDati ? "· fattura lei (paga la capogruppo)" : "· solo raggruppa"}`);
  }
  console.log(`ASSEGNAZIONI azienda→capogruppo: ${assegna.size}`);

  if (!SCRIVI) {
    console.log("\n(prova: non ho scritto niente — rilancia con --scrivi)");
    return;
  }

  // --- 4. Scrivo ---
  // 4a. Capogruppo: creo per nome (o riuso l'esistente GruppoAziendale/entità) e
  //     ci metto la fatturazione se ne ha.
  const idCapo = new Map<string, string>();
  for (const [nome, c] of capogruppi) {
    const esistente = await prisma.gruppoAziendale.findFirst({ where: { nome } });
    const g = esistente ?? (await prisma.gruppoAziendale.create({ data: { nome } }));
    idCapo.set(nome, g.id);
    if (Object.values(c.dati).some((v) => v)) {
      const set = CAMPI.map((k) => `"${k}"=$${CAMPI.indexOf(k) + 2}`).join(", ");
      await prisma.$executeRawUnsafe(
        `UPDATE "anagrafiche"."GruppoAziendale" SET ${set}, "provenienza"=$${CAMPI.length + 2} WHERE "id"=$1`,
        g.id, ...CAMPI.map((k) => c.dati[k] ?? null), c.provenienza ?? null,
      );
    }
  }
  // 4b. Aziende che pagano da sé: fatturazione propria + pagaDaSe=true.
  for (const a of azioni) {
    if (a.tipo !== "propria") continue;
    const set = CAMPI.map((k, i) => `"${k}"=$${i + 2}`).join(", ");
    await prisma.$executeRawUnsafe(
      `UPDATE "anagrafiche"."Partner" SET ${set}, "pagaDaSe"=true WHERE "id"=$1`,
      a.partnerId, ...CAMPI.map((k) => a.dati[k] ?? null),
    );
  }
  // 4c. Aziende che pagano la capogruppo: pagaDaSe=false.
  for (const a of azioni) {
    if (a.tipo !== "capogruppo") continue;
    await prisma.$executeRawUnsafe(`UPDATE "anagrafiche"."Partner" SET "pagaDaSe"=false WHERE "id"=$1`, a.partnerId);
  }
  // 4d. Assegnazione al capogruppo.
  for (const [partnerId, nome] of assegna) {
    await prisma.$executeRawUnsafe(`UPDATE "anagrafiche"."Partner" SET "capogruppoId"=$2 WHERE "id"=$1`, partnerId, idCapo.get(nome)!);
  }
  // 4e. Nuovo FK: capogruppoId → Capogruppo (GruppoAziendale).
  await prisma.$executeRawUnsafe(`DO $$ BEGIN
    ALTER TABLE "anagrafiche"."Partner" ADD CONSTRAINT "Partner_capogruppoId_fkey"
      FOREIGN KEY ("capogruppoId") REFERENCES "anagrafiche"."GruppoAziendale"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`);

  console.log("\nscritto. Il vecchio (SoggettoFiscale) è intatto come rete.");
}

esegui().then(() => prisma.$disconnect());
