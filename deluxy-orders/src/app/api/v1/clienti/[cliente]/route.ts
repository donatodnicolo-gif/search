import { NextRequest, NextResponse } from "next/server";
import { autentica, erroreApi } from "@/lib/api-auth";
import { clienteSingolo, codificaChiave, decodificaChiave } from "@/lib/clienti";
import { prisma } from "@/lib/db";

// GET /api/v1/clienti/{cliente} — la scheda di un cliente col riepilogo AI
// completo: riassunto, gusti e la sua storia, un punto per ordine.
//
// `{cliente}` è lo stesso identificatore usato dalla UI e dalle altre API
// (base64url della chiave email → telefono → nome). Per comodità si accetta
// anche l'email in chiaro: chi ha solo quella non deve codificare niente.
export async function GET(req: NextRequest, ctx: { params: Promise<{ cliente: string }> }) {
  const client = await autentica(req);
  if (client instanceof NextResponse) return client;

  const { cliente: codice } = await ctx.params;
  // Se contiene una @ è già una chiave leggibile: decodificarla la romperebbe.
  const chiave = codice.includes("@") ? decodeURIComponent(codice).trim().toLowerCase() : decodificaChiave(codice);

  const [c, r] = await Promise.all([
    clienteSingolo(chiave),
    prisma.riepilogoCliente.findUnique({ where: { chiave } }),
  ]);
  if (!c) return erroreApi(404, `Nessun cliente con ordini validi per: ${chiave}`);

  return NextResponse.json({
    cliente: codificaChiave(c.chiave),
    nome: c.nome,
    email: c.email,
    telefono: c.telefono,
    citta: c.citta,
    ordini: c.ordini,
    annullati: c.annullati,
    speso: Math.round(c.speso * 100) / 100,
    ordineMedio: Math.round(c.medio * 100) / 100,
    primoOrdine: c.primoOrdine,
    ultimoOrdine: c.ultimoOrdine,
    giorniDallUltimo: c.giorni,
    brand: c.brand,
    segmento: c.segmento,
    tipologia: c.tipologia,
    tipologiaManuale: c.tipoManuale != null,
    // null = riepilogo non ancora scritto. Non vuol dire «cliente senza gusti».
    riepilogo: r
      ? {
          riassunto: r.testo,
          gusti: r.gusti,
          punti: r.punti ? r.punti.split("\n").filter(Boolean) : [],
          ordiniConsiderati: r.ordiniConsiderati,
          aggiornato: c.ordini <= r.ordiniConsiderati,
          ordiniNuoviDaAllora: Math.max(0, c.ordini - r.ordiniConsiderati),
          aggiornatoIl: r.aggiornatoIl,
          modello: r.modello,
        }
      : null,
  });
}
