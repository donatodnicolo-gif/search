import { NextRequest, NextResponse } from "next/server";
import { autentica, erroreApi } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { deduciTipoConversione, salvaMetriche, type RigaMetrica } from "@/lib/ingest-metriche";
import { leggiMetricheMeta, leggiStatoCampagneMeta, metaConfigurato } from "@/lib/meta";
import { registra } from "@/lib/registro";

// POST /api/v1/sync/meta — va a PRENDERE i dati da Meta (il contrario di
// /api/v1/ingest, dove Google li spinge). Meta non ha gli Scripts: serve che
// l'app chiami la Graph API con un token di utente di sistema.
//
// Body (tutto opzionale):
//   { account?: "2802316249885506", giorni?: 7, dal?: "2026-01-01", al?: "2026-07-26" }
// Senza "account" gira su tutti gli account Meta attivi censiti in /impostazioni.
//
// L'account portfolio 1298043513875111 è DISABILITATO da Meta: non va mai
// interrogato, e infatti non è fra quelli censiti attivi.
export async function POST(req: NextRequest) {
  const cliente = await autentica(req, { scrittura: true });
  if (cliente instanceof NextResponse) return cliente;

  if (!metaConfigurato()) {
    return erroreApi(
      503,
      "META_ACCESS_TOKEN non impostato: serve il token di un utente di sistema del Business Manager (permessi ads_read). Si aggiunge fra le variabili d'ambiente, non nel database."
    );
  }

  let body: { account?: string; giorni?: number; dal?: string; al?: string } = {};
  try {
    body = await req.json();
  } catch {
    // corpo vuoto: si usano i valori di default
  }

  const oggi = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const giorni = Math.min(Math.max(Number(body.giorni ?? 7), 1), 400);
  const al = body.al ?? iso(oggi);
  const dal = body.dal ?? iso(new Date(oggi.getTime() - giorni * 86_400_000));

  // Quali account interrogare
  const account = body.account
    ? [{ idEsterno: String(body.account), nome: String(body.account), brand: undefined as string | undefined }]
    : (
        await prisma.accountAdv.findMany({
          where: { piattaforma: "meta_ads", attivo: true },
          select: { idEsterno: true, nome: true, brand: true },
        })
      ).map((a) => ({ idEsterno: a.idEsterno, nome: a.nome, brand: a.brand }));

  if (account.length === 0) {
    return erroreApi(400, "Nessun account Meta attivo censito: aggiungilo in Impostazioni");
  }

  const risultati: {
    account: string;
    nome: string;
    righe: number;
    metriche: number;
    campagneNuove: number;
    senzaAcquisti: number;
    errore: string | null;
  }[] = [];

  for (const a of account) {
    const lettura = await leggiMetricheMeta(a.idEsterno, dal, al);
    if (lettura.errore && lettura.righe.length === 0) {
      risultati.push({
        account: a.idEsterno, nome: a.nome, righe: 0, metriche: 0,
        campagneNuove: 0, senzaAcquisti: 0, errore: lettura.errore,
      });
      await prisma.ricezioneDati.create({
        data: {
          fonte: "meta_ads", account: a.idEsterno, tipo: "metriche", chiave: cliente.nome,
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
        chiave: cliente.nome,
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
    autore: cliente.nome,
    tipo: "import",
    entita: "metrica",
    titolo: `Sync Meta (${dal} → ${al})`,
    dettaglio:
      `${totMetriche} giorni-campagna su ${risultati.length} account` +
      (conErrore.length ? ` · ${conErrore.length} in errore: ${conErrore[0].errore}` : ""),
  });

  return NextResponse.json(
    {
      periodo: { dal, al },
      totaleMetriche: totMetriche,
      account: risultati,
      // Se molte righe non hanno acquisti, la campagna ottimizza un evento a
      // monte (ATC/Lead): il valore va letto con cautela (istruzioni 8.x).
      nota:
        risultati.some((r) => r.senzaAcquisti > 0)
          ? "Alcune righe non hanno acquisti (omni_purchase): quelle campagne ottimizzano un evento a monte, il ROAS non le descrive."
          : undefined,
    },
    { status: conErrore.length === risultati.length ? 502 : 201 }
  );
}
