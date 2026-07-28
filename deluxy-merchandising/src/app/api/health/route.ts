import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Health-check pubblico, standard per tutte le app Deluxy: dice se il server
// risponde e se il database è raggiungibile davvero. Lo legge la pagina /stato
// del Hub, che non ha una sessione di questa app — per questo il middleware lo
// lascia passare senza password.
//
// I tre campi del contratto (`ok`, `app`, `database`) non si toccano: sono
// quelli che il Hub legge. Sotto ci sono i **servizi** di questa app —
// collegamento a Orders, negozi Shopify, AI — e quando hanno lavorato l'ultima
// volta: servono a distinguere «è fermo perché non c'è niente da fare» da «è
// fermo perché si è rotto qualcosa», che viste da fuori si somigliano molto.
//
// Nessun dato di business esce da qui: solo conteggi, date e booleani.

export const dynamic = "force-dynamic";

export async function GET() {
  let database = false;
  let servizi: Record<string, unknown> = {};

  try {
    await prisma.$queryRaw`SELECT 1`;
    database = true;

    const [ultimoVendite, ultimoCollezioni, negozi, negoziOk, chiaviApi, prodotti, collezioni, chiaveAi] =
      await Promise.all([
        prisma.importVendite.findFirst({
          orderBy: { iniziatoIl: "desc" },
          select: { iniziatoIl: true, esito: true },
        }),
        prisma.importCollezioni.findFirst({
          orderBy: { iniziatoIl: "desc" },
          select: { iniziatoIl: true, esito: true },
        }),
        prisma.negozioShopify.count({ where: { attivo: true } }),
        prisma.negozioShopify.count({ where: { attivo: true, esitoVerifica: "ok" } }),
        prisma.apiKey.count({ where: { attiva: true } }),
        prisma.prodotto.count(),
        prisma.collezioneShopify.count(),
        // La chiave OpenAI può stare in Impostazioni invece che nell'ambiente.
        prisma.impostazione.findUnique({ where: { chiave: "OPENAI_API_KEY" } }),
      ]);

    servizi = {
      // Da dove arriva il venduto
      orders: {
        configurato: Boolean(process.env.ORDERS_API_KEY),
        ultimoImport: ultimoVendite?.iniziatoIl?.toISOString() ?? null,
        esitoUltimoImport: ultimoVendite?.esito ?? null,
      },
      // I negozi collegati e quanti hanno superato la verifica dei permessi
      shopify: {
        negoziAttivi: negozi,
        negoziFunzionanti: negoziOk,
        ultimoImportCollezioni: ultimoCollezioni?.iniziatoIl?.toISOString() ?? null,
        esitoUltimoImport: ultimoCollezioni?.esito ?? null,
      },
      // Scrittura AI delle descrizioni e lettura del trend
      ai: { configurata: Boolean(process.env.OPENAI_API_KEY) || Boolean(chiaveAi) },
      // Quante app leggono da qui
      apiInterne: { chiaviAttive: chiaviApi },
      catalogo: { prodotti, collezioniShopify: collezioni },
    };
  } catch {
    database = false;
  }

  return NextResponse.json(
    { ok: true, app: "deluxy-merchandising", database, servizi },
    { headers: { "Cache-Control": "no-store" } },
  );
}
