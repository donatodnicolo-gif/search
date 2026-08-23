import { NextRequest, NextResponse } from "next/server";
import { autentica } from "@/lib/api-auth";
import {
  ANNO_CORRENTE, advConsentitoMese, advPubblicatoAnno, caricaAnno, LIVELLI, moltiplicatore,
  venditeMese, type Livello,
} from "@/lib/calc";

// GET /api/v1/maison — i **budget per maison** per le altre app Deluxy.
//
// Nasce per Marketing, che deve sapere due cose che vivono qui e solo qui:
// quanto una maison deve vendere in un mese, e **quanto può spendere in ADV**
// in quel mese. Senza, Marketing dovrebbe tenersi una copia dei budget — e due
// copie che divergono fanno decidere le campagne su numeri sbagliati.
//
// Auth: header `X-API-Key` con `BUDGETS_API_KEY`. Sola lettura: il budget si
// scrive dentro Budgets, dalle proposte o dal file pubblicato.
//
// Parametri:
//   ?anno=2026        (default: anno corrente del budget)
//   ?livello=SFIDANTE  RAGGIUNGIBILE (default, il budget pubblicato) |
//                      SFIDANTE | IRRAGGIUNGIBILE
//   ?maison=deluxy     una sola maison
//
// **L'ADV consentito segue il livello**: è una percentuale sulle vendite, e le
// vendite del livello sfidante sono più alte. Chi chiede lo scenario sfidante
// riceve anche il budget pubblicitario di quello scenario, non quello del
// pubblicato — altrimenti si pianificherebbe una crescita senza i soldi per
// farla.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const negata = await autentica(req);
  if (negata) return negata;

  const p = req.nextUrl.searchParams;
  const anno = Number(p.get("anno")) || ANNO_CORRENTE;
  const livelloChiesto = (p.get("livello") ?? "RAGGIUNGIBILE").toUpperCase();
  const livello = (LIVELLI.some((l) => l.key === livelloChiesto) ? livelloChiesto : "RAGGIUNGIBILE") as Livello;
  const soloMaison = p.get("maison")?.trim() || null;

  const dati = await caricaAnno(anno);
  const molt = moltiplicatore(dati, livello);

  const maisons = dati.maisons
    .filter((m) => !soloMaison || m.slug === soloMaison)
    .map((m) => {
      // Il monte pubblicita dell anno del brand: e la base su cui sono
      // calcolate le percentuali mensili (regola del 23/08/2026).
      const pubblicatoAnno = advPubblicatoAnno(m);
      const mesi = m.mesi.map((x) => {
        const vendite: Record<string, number> = {};
        for (const [slug, v] of Object.entries(x.vendite)) vendite[slug] = v * molt;
        return {
          mese: x.month,
          vendite,
          venditeTotali: venditeMese(x) * molt,
          advPercent: x.advPercent,
          advConsentito: advConsentitoMese(x, pubblicatoAnno) * molt,
          // Quello che il monitoraggio ADV aveva pubblicato come riferimento:
          // NON si moltiplica, è un numero storico, non uno scenario.
          advPubblicato: x.advPubblicato,
        };
      });
      return {
        slug: m.slug,
        nome: m.nome,
        mesi,
        totali: {
          vendite: mesi.reduce((s, x) => s + x.venditeTotali, 0),
          advConsentito: mesi.reduce((s, x) => s + x.advConsentito, 0),
        },
      };
    });

  return NextResponse.json({
    anno,
    livello,
    moltiplicatore: molt,
    // Le tipologie di servizio con il loro margine: le chiavi di `vendite` sono
    // questi slug, e senza l'elenco chi consuma dovrebbe indovinarli.
    tipologie: dati.tipologie.map((t) => ({ slug: t.slug, nome: t.nome, marginePct: t.marginePct })),
    maisons,
    totali: {
      vendite: maisons.reduce((s, m) => s + m.totali.vendite, 0),
      advConsentito: maisons.reduce((s, m) => s + m.totali.advConsentito, 0),
    },
  });
}
