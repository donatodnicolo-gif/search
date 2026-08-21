/**
 * Riempie **l'area di consegna** sulle righe di venduto già in archivio.
 *
 * I campi `provinciaSpedizione`/`paeseSpedizione` sono nati dopo le vendite:
 * l'import li scrive da oggi in avanti, ma le migliaia di righe già importate
 * restano a `null` — e una scomposizione per area su un archivio mezzo vuoto
 * direbbe «il calo viene da "area non indicata"», che non è una risposta.
 *
 * Questo script rilegge gli ordini da Deluxy Orders mese per mese e fa **solo
 * UPDATE** sulle righe che già esistono, agganciandole per `riferimento`
 * (`"<idOrdine>#<indiceRiga>"`, la stessa chiave dell'import). Non crea né
 * cancella niente: se lo si rilancia due volte, la seconda non fa nulla.
 *
 *   npx tsx scripts/riempi-aree.ts            # ultimi 400 giorni
 *   npx tsx scripts/riempi-aree.ts 800        # più indietro
 *   npx tsx scripts/riempi-aree.ts 400 --dry  # dice cosa farebbe, senza scrivere
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const GIORNI = Number(process.argv[2]) > 0 ? Number(process.argv[2]) : 400;
const DRY = process.argv.includes("--dry");
// Un mese per volta: l'API di Orders pagina, e chiedere un anno in un colpo
// solo è il modo di prendersi un timeout a metà.
const PASSO_GIORNI = 30;
// Il pool è da 5 connessioni ed è condiviso con altre cinque app.
const SCRITTURE_INSIEME = 5;

function base(): string {
  return (process.env.ORDERS_URL ?? "").trim().replace(/^["']|["']$/g, "").replace(/\/$/, "");
}

function normalizzaArea(v: string | null | undefined): string | null {
  const s = (v ?? "").trim().toUpperCase();
  return s === "" ? null : s;
}

type Ordine = {
  id: string;
  spedizione?: { provincia?: string | null; paese?: string | null };
  righe?: unknown[];
};

async function leggiOrdini(dal: Date, al: Date): Promise<Ordine[]> {
  const chiave = (process.env.ORDERS_API_KEY ?? "").trim().replace(/^["']|["']$/g, "");
  const fuori: Ordine[] = [];
  for (let pagina = 1; pagina <= 40; pagina++) {
    // ⚠️ I NOMI DEI PARAMETRI SONO QUELLI DI ORDERS, NON I NOSTRI.
    // `/api/v1/ordini` legge `da`, `a`, `page`, `limit`; un parametro che non
    // conosce lo **ignora in silenzio**, senza errore. Il primo giro di questo
    // script mandava `dal`/`al`/`pagina`/`limite` e ha quindi riletto 40 volte
    // gli stessi ordini più recenti dell'intero archivio (2.000 per finestra,
    // sempre gli stessi), riempiendo 44 righe su 6.939 e sembrando dire «i dati
    // non ci sono». I dati c'erano: era la domanda a essere scritta male.
    const q = new URLSearchParams({
      da: dal.toISOString().slice(0, 10),
      a: al.toISOString().slice(0, 10),
      page: String(pagina),
      limit: "200",
    });
    const res = await fetch(`${base()}/api/v1/ordini?${q}`, { headers: { "x-api-key": chiave } });
    if (!res.ok) throw new Error(`Orders ha risposto ${res.status} su ${dal.toISOString().slice(0, 10)}`);
    const corpo = (await res.json()) as { ordini?: Ordine[]; pagine?: number };
    const ordini = corpo.ordini ?? [];
    fuori.push(...ordini);
    if (ordini.length === 0 || pagina >= (corpo.pagine ?? 1)) break;
  }
  return fuori;
}

async function main() {
  if (!base() || !process.env.ORDERS_API_KEY) {
    throw new Error("Mancano ORDERS_URL / ORDERS_API_KEY: senza non si può rileggere niente.");
  }

  const prima = await prisma.vendita.count({ where: { provinciaSpedizione: { not: null } } });
  const totale = await prisma.vendita.count();
  console.log(`In archivio: ${totale} righe, ${prima} con l'area già scritta.`);
  console.log(`Rileggo ${GIORNI} giorni di ordini${DRY ? " (prova a vuoto)" : ""}…\n`);

  let scritte = 0;
  let ordiniSenzaArea = 0;
  const fine = new Date();

  for (let g = 0; g < GIORNI; g += PASSO_GIORNI) {
    const al = new Date(fine.getTime() - g * 86_400_000);
    const dal = new Date(al.getTime() - PASSO_GIORNI * 86_400_000);
    const ordini = await leggiOrdini(dal, al);

    // Un ordine → tutte le sue righe: l'area sta sull'ordine, non sulla riga.
    const lavori: (() => Promise<number>)[] = [];
    for (const o of ordini) {
      const provincia = normalizzaArea(o.spedizione?.provincia);
      const paese = normalizzaArea(o.spedizione?.paese);
      if (!provincia && !paese) {
        ordiniSenzaArea++;
        continue;
      }
      const quante = Array.isArray(o.righe) ? o.righe.length : 0;
      const riferimenti = Array.from({ length: quante }, (_, i) => `${o.id}#${i}`);
      if (riferimenti.length === 0) continue;
      lavori.push(async () => {
        const esito = await prisma.vendita.updateMany({
          // Solo le righe che l'area non ce l'hanno: rilanciare lo script non
          // riscrive quello che è già a posto.
          where: { riferimento: { in: riferimenti }, provinciaSpedizione: null },
          data: { provinciaSpedizione: provincia, paeseSpedizione: paese },
        });
        return esito.count;
      });
    }

    for (let i = 0; i < lavori.length; i += SCRITTURE_INSIEME) {
      const blocco = lavori.slice(i, i + SCRITTURE_INSIEME);
      if (DRY) continue;
      // ⚠️ Il pooler Supabase (:6543) **chiude la connessione** sulle operazioni
      // lunghe: è già successo due volte a questo script, e prima ancora agli
      // import delle collezioni. Un giro da venti minuti che muore al
      // diciottesimo e non riprende costringe a rifare tutto, quindi qui un
      // blocco che cade si riprova invece di far cadere l'intero giro.
      // Lo script è idempotente (aggiorna solo le righe ancora senza area),
      // quindi riprovare non può fare danni.
      let fatto = false;
      for (let tentativo = 1; tentativo <= 3 && !fatto; tentativo++) {
        try {
          const esiti = await Promise.all(blocco.map((f) => f()));
          scritte += esiti.reduce((s, n) => s + n, 0);
          fatto = true;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (tentativo === 3) {
            console.log(`   ⚠ blocco saltato dopo 3 tentativi: ${msg.split("\n")[0]}`);
          } else {
            // Attesa crescente: se il pooler è sotto pressione, insistere
            // subito peggiora le cose.
            await new Promise((r) => setTimeout(r, tentativo * 3000));
          }
        }
      }
    }

    console.log(
      `  ${dal.toISOString().slice(0, 10)} → ${al.toISOString().slice(0, 10)}: ` +
        `${ordini.length} ordini, ${scritte} righe scritte finora`
    );
  }

  const dopo = await prisma.vendita.count({ where: { provinciaSpedizione: { not: null } } });
  console.log(`\nFatto. Righe con area: ${prima} → ${dopo} (${totale} in tutto).`);
  if (ordiniSenzaArea > 0) {
    console.log(`${ordiniSenzaArea} ordini non avevano provincia né paese in Orders: restano senza area.`);
  }
}

main()
  .catch((e) => {
    console.error("ECCEZIONE:", e instanceof Error ? e.message : e);
    console.error("⚠ Attenzione: «eccezione» non vuol dire «niente scritto». Ricontare prima di rilanciare.");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
