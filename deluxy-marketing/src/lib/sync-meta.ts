import { prisma } from "./db";
import { deduciTipoConversione, salvaMetriche, type RigaMetrica } from "./ingest-metriche";
import { leggiMetricheMeta, leggiStatoCampagneMeta, metaConfigurato } from "./meta";
import { registra } from "./registro";

// La sync Meta in un posto solo.
//
// Meta non ha gli Scripts di Google: là è la piattaforma che spinge i dati
// dentro (`/api/v1/ingest`), qui è l'app che deve andare a prenderli. Prima
// questa logica viveva dentro `POST /api/v1/sync/meta`, quindi succedeva solo
// quando qualcuno premeva un bottone — ed è per questo che il 28/07/2026 i
// numeri Meta erano fermi a ieri mentre Google era a oggi. Ora la stessa
// funzione la chiama anche il cron orario (`GET /api/cron/meta`).

export type OpzioniSyncMeta = {
  account?: string;
  giorni?: number;
  dal?: string;
  al?: string;
};

export type EsitoAccountMeta = {
  account: string;
  nome: string;
  righe: number;
  metriche: number;
  campagneNuove: number;
  senzaAcquisti: number;
  errore: string | null;
};

export type EsitoSyncMeta =
  | { ok: false; codice: number; errore: string }
  | {
      ok: true;
      periodo: { dal: string; al: string };
      totaleMetriche: number;
      account: EsitoAccountMeta[];
      tuttiInErrore: boolean;
      nota?: string;
    };

export async function eseguiSyncMeta(
  opzioni: OpzioniSyncMeta,
  autore: string
): Promise<EsitoSyncMeta> {
  if (!metaConfigurato()) {
    return {
      ok: false,
      codice: 503,
      errore:
        "META_ACCESS_TOKEN non impostato: serve il token di un utente di sistema del Business Manager (permessi ads_read). Si aggiunge fra le variabili d'ambiente, non nel database.",
    };
  }

  const oggi = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const giorni = Math.min(Math.max(Number(opzioni.giorni ?? 7), 1), 400);
  const al = opzioni.al ?? iso(oggi);
  const dal = opzioni.dal ?? iso(new Date(oggi.getTime() - giorni * 86_400_000));

  // L'account portfolio 1298043513875111 è DISABILITATO da Meta: non va mai
  // interrogato, e infatti non è fra quelli censiti attivi.
  // ⚠️ Chiedere UN account per id non deve far perdere il brand che l'app già
  // conosce. Prima qui si costruiva l'oggetto con `brand: undefined` senza
  // guardare gli account censiti: ogni sync mirata (un backfill, una prova)
  // importava le campagne senza brand, e quelle il cui NOME non nomina il
  // marchio finivano in "cross" — cioè "non lo so". Il 29/07/2026 erano 451
  // righe e 12.339 € di spesa Meta invisibili nelle viste per brand.
  const censito = opzioni.account
    ? await prisma.accountAdv.findFirst({
        where: { piattaforma: "meta_ads", idEsterno: String(opzioni.account) },
        select: { idEsterno: true, nome: true, brand: true },
      })
    : null;
  const account = opzioni.account
    ? [
        {
          idEsterno: String(opzioni.account),
          nome: censito?.nome ?? String(opzioni.account),
          brand: censito?.brand as string | undefined,
        },
      ]
    : (
        await prisma.accountAdv.findMany({
          where: { piattaforma: "meta_ads", attivo: true },
          select: { idEsterno: true, nome: true, brand: true },
        })
      ).map((a) => ({ idEsterno: a.idEsterno, nome: a.nome, brand: a.brand }));

  if (account.length === 0) {
    return { ok: false, codice: 400, errore: "Nessun account Meta attivo censito: aggiungilo in Impostazioni" };
  }

  const risultati: EsitoAccountMeta[] = [];

  for (const a of account) {
    const lettura = await leggiMetricheMeta(a.idEsterno, dal, al);
    if (lettura.errore && lettura.righe.length === 0) {
      risultati.push({
        account: a.idEsterno, nome: a.nome, righe: 0, metriche: 0,
        campagneNuove: 0, senzaAcquisti: 0, errore: lettura.errore,
      });
      await prisma.ricezioneDati.create({
        data: {
          fonte: "meta_ads", account: a.idEsterno, tipo: "metriche", chiave: autore,
          righe: 0, esito: "errore",
        },
      });
      continue;
    }

    // Stato, budget e obiettivo stanno su un nodo diverso dalle insights
    const { stati } = await leggiStatoCampagneMeta(a.idEsterno);

    const righe: RigaMetrica[] = lettura.righe.map((r) => {
      const s = stati.get(r.idCampagna);
      return {
        ...r,
        stato: s?.stato ?? null,
        budgetGiornaliero: s?.budget ?? null,
        obiettivo: s?.obiettivo ?? null,
      };
    });

    const esito = await salvaMetriche(righe, {
      canale: "meta_ads",
      account: a.idEsterno,
      brand: a.brand,
    });
    await deduciTipoConversione(esito.campagneToccate);

    await prisma.ricezioneDati.create({
      data: {
        fonte: "meta_ads",
        account: a.idEsterno,
        tipo: "metriche",
        chiave: autore,
        righe: righe.length,
        nuove: esito.campagneCreate,
        aggiornate: esito.metricheSalvate,
        scartate: esito.righeScartate,
        dal: esito.giornoMin,
        al: esito.giornoMax,
        campagne: esito.campagneToccate.size,
        esito: lettura.errore ? "parziale" : "ok",
      },
    });

    risultati.push({
      account: a.idEsterno,
      nome: a.nome,
      righe: righe.length,
      metriche: esito.metricheSalvate,
      campagneNuove: esito.campagneCreate,
      senzaAcquisti: lettura.senzaAcquisti,
      errore: lettura.errore,
    });
  }

  const totMetriche = risultati.reduce((s, r) => s + r.metriche, 0);
  const conErrore = risultati.filter((r) => r.errore);

  await registra({
    autore,
    tipo: "import",
    entita: "metrica",
    titolo: `Sync Meta (${dal} → ${al})`,
    dettaglio:
      `${totMetriche} giorni-campagna su ${risultati.length} account` +
      (conErrore.length ? ` · ${conErrore.length} in errore: ${conErrore[0].errore}` : ""),
  });

  return {
    ok: true,
    periodo: { dal, al },
    totaleMetriche: totMetriche,
    account: risultati,
    tuttiInErrore: conErrore.length === risultati.length,
    // Se molte righe non hanno acquisti, la campagna ottimizza un evento a
    // monte (ATC/Lead): il valore va letto con cautela (istruzioni 8.x).
    nota: risultati.some((r) => r.senzaAcquisti > 0)
      ? "Alcune righe non hanno acquisti (omni_purchase): quelle campagne ottimizzano un evento a monte, il ROAS non le descrive."
      : undefined,
  };
}
