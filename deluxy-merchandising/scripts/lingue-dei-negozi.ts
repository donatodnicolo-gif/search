// **Quali lingue ha davvero ogni negozio, e le scrive sulla sua scheda.**
//
// Chiesto dall'utente l'08/09/2026: «parte di traduzione va inserita con il
// negozio, ogni negozio ha lingue a parte». Il modulo diceva «le 8 lingue del
// negozio» a tutti e quattro, che è falso.
//
// ⚠️ Senza lo scope `read_locales` le lingue non si possono chiedere a Shopify:
// si **deducono da chi ha già traduzioni** — un locale spento non può averne.
// È una deduzione da un fatto, non una stima.
//
//   npx tsx scripts/lingue-dei-negozi.ts            # prova, non scrive
//   npx tsx scripts/lingue-dei-negozi.ts --applica

import { caricaEnv } from "./vecchio-gestionale";

async function main() {
  caricaEnv();
  const { prisma } = await import("../src/lib/db");
  const { lingueAttiveDi } = await import("../src/lib/traduzioni-automatiche");
  const { tokenDi } = await import("../src/lib/negozi");
  const { LINGUE_NEGOZIO } = await import("../src/lib/ai-traduzioni");
  const applica = process.argv.includes("--applica");

  const negozi = await prisma.negozioShopify.findMany({ where: { attivo: true }, select: { id: true, nome: true, dominio: true, lingueAttive: true } });
  const nome = (c: string) => LINGUE_NEGOZIO.find((l) => l.codice === c)?.nome ?? c;

  for (const n of negozi) {
    const token = await tokenDi(n.id).catch(() => null);
    if (!token) { console.log(`${n.nome.padEnd(16)} ⚠️ non sa autenticarsi: saltato`); continue; }
    let attive: string[] = [];
    try {
      attive = await lingueAttiveDi({ nome: n.nome, dominio: n.dominio, token: token.token });
    } catch (e) {
      console.log(`${n.nome.padEnd(16)} ⚠️ ${e instanceof Error ? e.message.slice(0, 60) : "errore"}`);
      continue;
    }
    const prima = Array.isArray(n.lingueAttive) ? (n.lingueAttive as string[]) : [];
    console.log(`${n.nome.padEnd(16)} ${attive.length ? attive.map(nome).join(", ") : "nessuna oltre l'italiano"}${prima.length ? `   (prima: ${prima.join(", ")})` : ""}`);
    if (applica) {
      await prisma.negozioShopify.update({ where: { id: n.id }, data: { lingueAttive: attive, lingueAttiveIl: new Date() } });
    }
  }
  if (!applica) console.log("\nProva: niente scritto. Rilancia con --applica.");
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
