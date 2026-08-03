import { NextRequest, NextResponse } from "next/server";
import { autentica } from "@/lib/api-auth";
import { nomeCanale } from "@/lib/marketing";
import { venditePerCanale } from "@/lib/canali";

// GET /api/v1/marketing — quanto vale ogni CANALE DI PROVENIENZA, e quanta
// parte di quel valore sono clienti nuovi invece che clienti che tornano.
//
// A cosa serve: l'app Marketing sa quanto ha SPESO per canale, qui trova quanto
// ha INCASSATO. E soprattutto trova il taglio che una dashboard pubblicitaria
// non sa dare — «di questi ordini, quanti sono di gente che avrebbe comprato
// comunque?»: un canale che porta solo clienti che tornavano già non sta
// acquistando niente, sta rifatturando la fedeltà.
//
// Il conto lo fa `venditePerCanale()` in `src/lib/canali.ts`, lo stesso motore
// della sezione Marketing dell'app: due implementazioni degli stessi numeri
// finirebbero per raccontare due storie diverse senza che nessuno se ne accorga.
//
// Parametri: anno (default: quello in corso) oppure da/a (date ISO); brand.
//
// COSA NON ENTRA NEL CONTO (come in /api/v1/ricavi, e per gli stessi motivi):
// gli ordini annullati — restano spesso «pagati», contarli gonfierebbe un
// incasso mai avvenuto — e i rimborsati o storni. I parzialmente rimborsati
// restano contati per intero, perché l'importo reso non esiste nel registro:
// si dichiara invece di stimarlo.
//
// `lordo` è il totale Shopify: IVA e spedizione INCLUSE.

export async function GET(req: NextRequest) {
  const client = await autentica(req);
  if (client instanceof NextResponse) return client;

  const p = req.nextUrl.searchParams;
  const anno = Number(p.get("anno")) || new Date().getUTCFullYear();
  const da = p.get("da")?.trim() || `${anno}-01-01`;
  const a = p.get("a")?.trim() || `${anno + 1}-01-01`;
  const brand = p.get("brand")?.trim() || null;

  const gte = new Date(`${da}T00:00:00+01:00`);
  const lt = new Date(`${a}T00:00:00+01:00`);

  const v = await venditePerCanale(gte, lt, brand);

  return NextResponse.json({
    anno,
    periodo: { da, a, fuso: "Europe/Rome" },
    brand: brand ?? null,
    criteri: {
      importo: "totale Shopify (IVA e spedizione incluse)",
      attribuzione:
        "primo contatto: la prima visita del percorso che ha portato all'ordine, non l'ultimo clic",
      annullatiInclusi: false,
      rimborsatiInclusi: false,
      // Che cosa significano davvero le tre colonne del taglio per cliente.
      primi: "ordini di chi non aveva mai comprato prima (clienti nuovi)",
      daRepeater: "ordini di chi aveva già comprato prima di questo",
      nonAttribuibili:
        "ordini senza email, telefono né nome: non si può dire se il cliente sia nuovo, e non si indovina",
      // Gli stessi tre gruppi in euro (30/07 → 03/08/2026). Il conteggio degli
      // ordini e la quota del venduto non coincidono quasi mai: chi torna spende
      // di più, quindi «60% di ordini da clienti nuovi» può essere il 40% dei
      // soldi. Chi legge questa API per calcolare un costo di acquisizione deve
      // usare `lordoPrimi`, non `lordo`.
      lordoPrimi: "quanti EURO dei clienti nuovi (non quanti ordini)",
      lordoDaRepeater: "quanti euro di chi aveva già comprato",
      lordoNonAttribuibili: "euro degli ordini senza cliente riconoscibile: non spalmati sulle altre due voci",
      clientiPerMese: "somma dei clienti distinti di ogni mese: chi compra in due mesi è contato due volte",
      sorgenti:
        "lo strumento scritto nel link (utm_source), o il sito da cui è arrivata la persona: sta SOTTO il canale — «klaviyo» è un modo di fare email",
    },
    canali: v.canali,
    campagne: v.campagne.map((c) => ({ ...c, nomeCanale: nomeCanale(c.canale) })),
    // Novità 30/07/2026: lo strumento vero dietro il canale, per rispondere a
    // «quanto ci porta Klaviyo?» senza dover leggere gli ordini uno per uno.
    sorgenti: v.sorgenti.map((s) => ({ ...s, nomeCanale: nomeCanale(s.canale) })),
    totali: v.totali,
    esclusi: {
      annullatiERimborsati: v.esclusi,
    },
  });
}
