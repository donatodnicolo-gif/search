import { NextRequest, NextResponse } from "next/server";
import { autentica, erroreApi } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { deduciTipoConversione, salvaMetriche, type RigaMetrica } from "@/lib/ingest-metriche";
import { registra } from "@/lib/registro";
import { leggiMetricheTikTok, leggiStatoCampagneTikTok, tiktokConfigurato } from "@/lib/tiktok";

// POST /api/v1/sync/tiktok — come il gemello di Meta: è l'app che va a
// prendere i dati, perché TikTok non ha script che girano dentro l'account.
//
// Body (tutto opzionale):
//   { account?: "7123456789012345678", giorni?: 7, dal?: "2026-01-01", al?: "2026-07-27" }
// Senza "account" gira su tutti gli advertiser TikTok attivi in /impostazioni.
export async function POST(req: NextRequest) {
  const cliente = await autentica(req, { scrittura: true });
  if (cliente instanceof NextResponse) return cliente;

  if (!(await tiktokConfigurato())) {
    return erroreApi(
      503,
      "Token TikTok non impostato: si incolla in Impostazioni → TikTok Ads (o nella variabile TIKTOK_ACCESS_TOKEN). Serve un token di un'app TikTok for Business con accesso all'advertiser."
    );
  }

  let body: { account?: string; giorni?: number; dal?: string; al?: string } = {};
  try {
    body = await req.json();
  } catch {
    // corpo vuoto: valori di default
  }

  const oggi = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const giorni = Math.min(Math.max(Number(body.giorni ?? 7), 1), 365);
  const al = body.al ?? iso(oggi);
  const dal = body.dal ?? iso(new Date(oggi.getTime() - giorni * 86_400_000));

  const account = body.account
    ? [{ idEsterno: String(body.account), nome: String(body.account), brand: undefined as string | undefined }]
    : (
        await prisma.accountAdv.findMany({
          where: { piattaforma: "tiktok", attivo: true },
          select: { idEsterno: true, nome: true, brand: true },
        })
      ).map((a) => ({ idEsterno: a.idEsterno, nome: a.nome, brand: a.brand }));

  if (account.length === 0) {
    return erroreApi(
      400,
      "Nessun advertiser TikTok attivo censito: aggiungilo in Impostazioni → Account pubblicitari (piattaforma TikTok Ads, ID numerico dell'advertiser)."
    );
  }

  const risultati: {
    account: string;
    nome: string;
    righe: number;
    metriche: number;
    campagneNuove: number;
    metricheRifiutate: string[];
    ricaviDerivati: boolean;
    errore: string | null;
  }[] = [];

  for (const a of account) {
    const lettura = await leggiMetricheTikTok(a.idEsterno, dal, al);
    if (lettura.errore && lettura.righe.length === 0) {
      risultati.push({
        account: a.idEsterno, nome: a.nome, righe: 0, metriche: 0, campagneNuove: 0,
        metricheRifiutate: lettura.metricheRifiutate, ricaviDerivati: false, errore: lettura.errore,
      });
      await prisma.ricezioneDati.create({
        data: {
          fonte: "tiktok", account: a.idEsterno, tipo: "metriche", chiave: cliente.nome,
          righe: 0, esito: "errore",
        },
      });
      continue;
    }

    const { stati } = await leggiStatoCampagneTikTok(a.idEsterno);
    const righe: RigaMetrica[] = lettura.righe.map((r) => {
      const s = stati.get(r.idCampagna);
      return {
        ...r,
        stato: s?.stato ?? null,
        budgetGiornaliero: s?.budget ?? null,
        obiettivo: s?.obiettivo ?? null,
      };
    });

    const esito = await salvaMetriche(righe, { canale: "tiktok", account: a.idEsterno, brand: a.brand });
    await deduciTipoConversione(esito.campagneToccate);

    await prisma.ricezioneDati.create({
      data: {
        fonte: "tiktok",
        account: a.idEsterno,
        tipo: "metriche",
        chiave: cliente.nome,
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
    autore: cliente.nome,
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
      `TikTok non ha accettato queste metriche: ${rifiutate.join(", ")}. I dati sono stati salvati senza di esse — spesa e clic sono veri, il ritorno no.`
    );
  }
  if (risultati.some((r) => r.ricaviDerivati)) {
    note.push(
      "I ricavi TikTok sono calcolati come ROAS × spesa: TikTok dà il ritorno, non l'importo. È un numero derivato, non letto."
    );
  }

  return NextResponse.json(
    {
      periodo: { dal, al },
      totaleMetriche: totMetriche,
      account: risultati,
      note: note.length ? note : undefined,
    },
    { status: conErrore.length === risultati.length ? 502 : 201 }
  );
}
