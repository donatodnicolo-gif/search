import { prisma } from "@/lib/db";
import { deduciTipoConversione, salvaMetriche, type RigaMetrica } from "@/lib/ingest-metriche";
import { registra } from "@/lib/registro";
import { leggiMetricheTikTok, leggiStatoCampagneTikTok, tiktokConfigurato } from "@/lib/tiktok";

// La sincronizzazione TikTok, fuori dalla rotta che la chiamava.
//
// ⚠️ PERCHÉ È STATA SPOSTATA QUI (24/08/2026). Stava dentro
// `POST /api/v1/sync/tiktok`, cioè dietro una chiave di scrittura: la poteva
// chiamare **solo una persona o uno script**. Meta ha lo stesso problema — non
// ha gli Scripts di Google, è l'app che deve andare a prendere i dati — e l'ha
// risolto il 28/07 mettendo il motore in `lib/sync-meta.ts` e dandogli un cron.
// TikTok era rimasto a metà: token, pagina, registro degli advertiser, tutto
// pronto, e nessuno che lo facesse partire. Collegarlo avrebbe prodotto zero
// righe finché qualcuno non premeva qualcosa — cioè mai.
//
// Finestra di 7 giorni come Meta: le conversioni si consolidano nei giorni
// dopo, quindi il numero di ieri cambia ancora e ripassare la settimana costa
// poco.

export type OpzioniSyncTikTok = {
  /** Un solo advertiser; senza, tutti quelli attivi in /impostazioni. */
  account?: string;
  giorni?: number;
  dal?: string;
  al?: string;
};

export type EsitoAccountTikTok = {
  account: string;
  nome: string;
  righe: number;
  metriche: number;
  campagneNuove: number;
  metricheRifiutate: string[];
  ricaviDerivati: boolean;
  errore: string | null;
};

export type EsitoSyncTikTok =
  | { ok: false; codice: number; errore: string }
  | {
      ok: true;
      periodo: { dal: string; al: string };
      totaleMetriche: number;
      account: EsitoAccountTikTok[];
      note?: string[];
      tuttiInErrore: boolean;
    };

export async function eseguiSyncTikTok(
  opzioni: OpzioniSyncTikTok,
  autore: string,
): Promise<EsitoSyncTikTok> {
  if (!(await tiktokConfigurato())) {
    return {
      ok: false,
      codice: 503,
      errore:
        "Token TikTok non impostato: si incolla in Impostazioni → TikTok Ads (o nella variabile TIKTOK_ACCESS_TOKEN). Serve un token di un'app TikTok for Business con accesso all'advertiser.",
    };
  }

  const oggi = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const giorni = Math.min(Math.max(Number(opzioni.giorni ?? 7), 1), 365);
  const al = opzioni.al ?? iso(oggi);
  const dal = opzioni.dal ?? iso(new Date(oggi.getTime() - giorni * 86_400_000));

  const account = opzioni.account
    ? [{ idEsterno: String(opzioni.account), nome: String(opzioni.account), brand: undefined as string | undefined }]
    : (
        await prisma.accountAdv.findMany({
          where: { piattaforma: "tiktok", attivo: true },
          select: { idEsterno: true, nome: true, brand: true },
        })
      ).map((a) => ({ idEsterno: a.idEsterno, nome: a.nome, brand: a.brand }));

  if (account.length === 0) {
    return {
      ok: false,
      codice: 400,
      errore:
        "Nessun advertiser TikTok attivo censito: aggiungilo in Impostazioni → Account pubblicitari (piattaforma TikTok Ads, ID numerico dell'advertiser).",
    };
  }

  const risultati: EsitoAccountTikTok[] = [];

  for (const a of account) {
    const lettura = await leggiMetricheTikTok(a.idEsterno, dal, al);
    if (lettura.errore && lettura.righe.length === 0) {
      risultati.push({
        account: a.idEsterno, nome: a.nome, righe: 0, metriche: 0, campagneNuove: 0,
        metricheRifiutate: lettura.metricheRifiutate, ricaviDerivati: false, errore: lettura.errore,
      });
      // La consegna a vuoto si registra lo stesso: «non è arrivato niente» e
      // «non ha nemmeno provato» sono due diagnosi diverse, e /ricezione deve
      // poterle distinguere.
      await prisma.ricezioneDati.create({
        data: {
          fonte: "tiktok", account: a.idEsterno, tipo: "metriche", chiave: autore,
          righe: 0, esito: "errore",
        },
      });
      continue;
    }

    const { stati } = await leggiStatoCampagneTikTok(a.idEsterno);
    const righe: RigaMetrica[] = lettura.righe.map((r) => {
      const s = stati.get(r.idCampagna);
      return { ...r, stato: s?.stato ?? null, budgetGiornaliero: s?.budget ?? null, obiettivo: s?.obiettivo ?? null };
    });

    const esito = await salvaMetriche(righe, { canale: "tiktok", account: a.idEsterno, brand: a.brand });
    await deduciTipoConversione(esito.campagneToccate);

    await prisma.ricezioneDati.create({
      data: {
        fonte: "tiktok",
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
        esito: lettura.errore || lettura.metricheRifiutate.length > 0 ? "parziale" : "ok",
      },
    });

    risultati.push({
      account: a.idEsterno,
      nome: a.nome,
      righe: righe.length,
      metriche: esito.metricheSalvate,
      campagneNuove: esito.campagneCreate,
      metricheRifiutate: lettura.metricheRifiutate,
      ricaviDerivati: lettura.ricaviDerivati,
      errore: lettura.errore,
    });
  }

  const totMetriche = risultati.reduce((s, r) => s + r.metriche, 0);
  const conErrore = risultati.filter((r) => r.errore);
  const rifiutate = [...new Set(risultati.flatMap((r) => r.metricheRifiutate))];

  await registra({
    autore,
    tipo: "import",
    entita: "metrica",
    titolo: `Sync TikTok (${dal} → ${al})`,
    dettaglio:
      `${totMetriche} giorni-campagna su ${risultati.length} advertiser` +
      (rifiutate.length ? ` · metriche non disponibili: ${rifiutate.join(", ")}` : "") +
      (conErrore.length ? ` · ${conErrore.length} in errore: ${conErrore[0].errore}` : ""),
  });

  const note: string[] = [];
  if (rifiutate.length > 0) {
    note.push(
      `TikTok non ha accettato queste metriche: ${rifiutate.join(", ")}. I dati sono stati salvati senza di esse — spesa e clic sono veri, il ritorno no.`,
    );
  }
  if (risultati.some((r) => r.ricaviDerivati)) {
    note.push(
      "I ricavi TikTok sono calcolati come ROAS × spesa: TikTok dà il ritorno, non l'importo. È un numero derivato, non letto.",
    );
  }

  return {
    ok: true,
    periodo: { dal, al },
    totaleMetriche: totMetriche,
    account: risultati,
    note: note.length ? note : undefined,
    tuttiInErrore: conErrore.length === risultati.length,
  };
}
