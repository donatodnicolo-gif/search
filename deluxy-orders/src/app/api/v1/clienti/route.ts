import { NextRequest, NextResponse } from "next/server";
import { autentica, erroreApi } from "@/lib/api-auth";
import {
  codificaChiave,
  contaClienti,
  elencoClienti,
  ordinamentoValido,
  versoValido,
} from "@/lib/clienti";
import { lista } from "@/lib/segmenti";
import { prisma } from "@/lib/db";
import { acquisizioni } from "@/lib/acquisizione";

// GET /api/v1/clienti — i clienti del registro con il RIASSUNTO scritto dall'AI.
//
// A cosa serve: quando squilla il telefono o arriva un reclamo, l'altra app non
// deve indovinare chi sia la persona dall'altra parte. Qui trova, in una riga:
// chi è, cosa compra e — la parte che serve davvero — cosa le piace.
//
// Filtri: q (ricerca), lista (chiave di una lista del catalogo), ordina
// (speso|ordini|recenti|nome|…), verso (asc|desc).
// Paginazione: page (1..), limit (default 100, max 500).
//
// `riepilogo` è **null** quando quel cliente non ne ha ancora uno: significa
// «non lo abbiamo ancora scritto», non «non ha preferenze». Il riepilogo si
// scrive dall'app (costa una chiamata a pagamento per cliente) e da qui si
// legge soltanto.
export async function GET(req: NextRequest) {
  const client = await autentica(req);
  if (client instanceof NextResponse) return client;

  const p = req.nextUrl.searchParams;
  const q = p.get("q")?.trim() || undefined;
  const ordina = ordinamentoValido(p.get("ordina") ?? undefined);
  const verso = versoValido(ordina, p.get("verso") ?? undefined);
  const page = Math.max(1, Number(p.get("page") ?? "1") || 1);
  const limit = Math.min(500, Math.max(1, Number(p.get("limit") ?? "100") || 100));

  // Il filtro per lista usa lo stesso catalogo della UI: una chiave sbagliata è
  // un errore, non un filtro ignorato in silenzio.
  const chiaveLista = p.get("lista")?.trim();
  let filtro: string | undefined;
  if (chiaveLista) {
    const l = lista(chiaveLista);
    if (!l) return erroreApi(404, `Lista sconosciuta: ${chiaveLista}`);
    filtro = l.chiave;
  }

  const [totale, clienti, riepiloghiScritti] = await Promise.all([
    contaClienti(q, filtro),
    elencoClienti(q, ordina, (page - 1) * limit, limit, filtro, verso),
    prisma.riepilogoCliente.count(),
  ]);

  const [riepiloghi, comeArrivati] = await Promise.all([
    prisma.riepilogoCliente
      .findMany({ where: { chiave: { in: clienti.map((c) => c.chiave) } } })
      .then((r) => new Map(r.map((x) => [x.chiave, x]))),
    acquisizioni(clienti.map((c) => c.chiave)),
  ]);

  const righe = clienti.map((c) => {
      const r = riepiloghi.get(c.chiave);
      return {
        cliente: codificaChiave(c.chiave),
        nome: c.nome,
        email: c.email,
        telefono: c.telefono,
        citta: c.citta,
        ordini: c.ordini,
        speso: Math.round(c.speso * 100) / 100,
        ordineMedio: Math.round(c.medio * 100) / 100,
        ultimoOrdine: c.ultimoOrdine,
        giorniDallUltimo: c.giorni,
        brand: c.brand,
        segmento: c.segmento,
        tipologia: c.tipologia,
        // Da dove ci è arrivata questa persona: il canale del suo PRIMO ordine.
        // Un cliente lo si acquista una volta sola — se poi torna scrivendo
        // l'indirizzo, quegli ordini sono «diretti» ma la persona l'ha portata
        // il canale di allora. `canale: null` = quel primo ordine non ha
        // provenienza, e non va letto come «diretto».
        acquisizione: {
          canale: comeArrivati.get(c.chiave)?.canale || null,
          primoOrdine: comeArrivati.get(c.chiave)?.data ?? null,
        },
        riepilogo: r
          ? {
              riassunto: r.testo,
              gusti: r.gusti,
              ordiniConsiderati: r.ordiniConsiderati,
              // Onestà: se da allora sono arrivati ordini, il riepilogo parla
              // di una persona un po' più vecchia di quella che si ha davanti.
              aggiornato: c.ordini <= r.ordiniConsiderati,
              ordiniNuoviDaAllora: Math.max(0, c.ordini - r.ordiniConsiderati),
              aggiornatoIl: r.aggiornatoIl,
              modello: r.modello,
            }
          : null,
      };
  });

  return NextResponse.json({
    totale,
    page,
    limit,
    pagine: Math.max(1, Math.ceil(totale / limit)),
    lista: filtro ?? null,
    // Quanti riepiloghi esistono in tutto: serve a chi legge per sapere se un
    // `riepilogo: null` è normale (se ne sono scritti pochi) o un'eccezione.
    riepiloghiScritti,
    annullatiInclusi: false,
    clienti: righe,
  });
}
