// **Sincronizzazione con Shopify all'apertura dell'app** (chiesta dall'utente
// il 04/09/2026: «all'apertura dell'app sincronizza automaticamente tutto»).
//
// Un import completo di un negozio dura minuti (Gifts ~10): non può girare a
// ogni pagina. Quindi all'apertura del cruscotto si guarda **quando è stato
// l'ultimo import di ogni negozio**: se è più vecchio di `ORE_FRESCHEZZA`, si
// lancia il giro di quel negozio **dopo aver risposto** (`after()` di Next),
// chiamando la stessa rotta del cron notturno — un solo codice per l'import.
// Il venduto non serve: si aggiorna da solo ogni quarto d'ora.
//
// Il lucchetto contro i doppioni sta nella tabella `Impostazione` (chiave
// `sync-apertura:<negozio>` con l'ora di avvio): due schede aperte insieme
// non fanno partire due import dello stesso negozio. Un lucchetto più vecchio
// di 20 minuti si considera scaduto (la funzione che l'aveva messo può essere
// stata interrotta: l'import in sé, avviato via HTTP, arriva comunque in fondo
// nella sua funzione).

import { after } from "next/server";
import { headers } from "next/headers";
import { prisma } from "./db";

const ORE_FRESCHEZZA = 4;
const MINUTI_LUCCHETTO = 20;

export type EsitoSincronizzazione =
  | { stato: "fresca"; ultimo: Date | null }
  | { stato: "in-corso"; negozi: string[]; ultimo: Date | null }
  | { stato: "avviata"; negozi: string[]; ultimo: Date | null }
  | { stato: "non-configurata"; ultimo: Date | null };

const chiaveLucchetto = (negozio: string) => `sync-apertura:${negozio}`;

export async function sincronizzaSeServe(): Promise<EsitoSincronizzazione> {
  const segreto = process.env.CRON_SECRET;
  const [negozi, ultimi, lucchetti] = await Promise.all([
    prisma.negozioShopify.findMany({ where: { attivo: true }, select: { nome: true }, orderBy: { nome: "asc" } }),
    prisma.importCollezioni.groupBy({ by: ["negozio"], where: { esito: "ok" }, _max: { iniziatoIl: true } }),
    prisma.impostazione.findMany({ where: { chiave: { startsWith: "sync-apertura:" } }, select: { chiave: true, valoreCifrato: true } }),
  ]);
  const ultimoDi = new Map(ultimi.map((u) => [u.negozio, u._max.iniziatoIl]));
  const ultimo = [...ultimoDi.values()].filter(Boolean).sort((a, b) => (b as Date).getTime() - (a as Date).getTime())[0] ?? null;
  if (!segreto) return { stato: "non-configurata", ultimo };

  const adesso = Date.now();
  const bloccati = new Set(
    lucchetti
      .filter((l) => adesso - new Date(l.valoreCifrato).getTime() < MINUTI_LUCCHETTO * 60_000)
      .map((l) => l.chiave.slice("sync-apertura:".length))
  );
  const vecchi = negozi
    .map((n) => n.nome)
    .filter((nome) => {
      const u = ultimoDi.get(nome);
      return !u || adesso - u.getTime() > ORE_FRESCHEZZA * 3_600_000;
    });
  const daLanciare = vecchi.filter((n) => !bloccati.has(n));
  const inCorso = vecchi.filter((n) => bloccati.has(n));
  if (daLanciare.length === 0) {
    return inCorso.length ? { stato: "in-corso", negozi: inCorso, ultimo } : { stato: "fresca", ultimo };
  }

  // Il lucchetto si mette PRIMA di rispondere: chi apre la pagina un secondo
  // dopo lo trova e non rilancia.
  const ora = new Date().toISOString();
  for (const nome of daLanciare) {
    await prisma.impostazione.upsert({
      where: { chiave: chiaveLucchetto(nome) },
      create: { chiave: chiaveLucchetto(nome), valoreCifrato: ora, impronta: "lucchetto" },
      update: { valoreCifrato: ora },
    });
  }

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3120";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const base = `${proto}://${host}`;

  after(async () => {
    for (const nome of daLanciare) {
      try {
        const res = await fetch(`${base}/api/cron/collezioni?negozio=${encodeURIComponent(nome)}`, {
          headers: { authorization: `Bearer ${segreto}` },
          cache: "no-store",
          signal: AbortSignal.timeout(290_000),
        });
        // L'esito vero lo scrive la rotta dell'import nel suo storico; qui si
        // toglie solo il lucchetto. Se la risposta non è 200 lo si lascia:
        // scade da solo e intanto non si martella il negozio.
        if (res.ok) await prisma.impostazione.delete({ where: { chiave: chiaveLucchetto(nome) } }).catch(() => undefined);
      } catch {
        // Interrotti (timeout della funzione): l'import prosegue nella sua
        // funzione, il lucchetto scade fra 20 minuti.
      }
    }
  });

  return { stato: "avviata", negozi: daLanciare, ultimo };
}
