import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { autentica } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { nomeCompleto } from "@/lib/valet";

// Valet: le persone che fanno le consegne. **Solo lettura**, di proposito.
//
// Chi scrive un valet oggi è: la UI del registro (anagrafica) e la piattaforma
// consegne (che lo assume, lo paga e lo assegna). Aprire la scrittura via API
// prima di aver deciso chi è il master vorrebbe dire ritrovarsi tre copie della
// stessa persona — che è il problema che stiamo chiudendo, non aprendo.
// Serve soprattutto a **Deluxy Customer Service**, che oggi tiene una sua
// tabella `Valet` (nome + recapito) solo per attribuire la colpa di un reclamo:
// da qui la può leggere invece di duplicarla.
//
// GET /api/v1/valet        — elenco (lettura). Filtri: q, stato, provincia, attivo, page, perPage
// GET /api/v1/valet/:id    — un valet (id del registro o platformId)

function serializza(v: {
  id: string;
  nome: string;
  cognome: string | null;
  telefono: string | null;
  email: string | null;
  indirizzo: string | null;
  citta: string | null;
  provincia: string | null;
  provinceServite: string | null;
  mezzo: string | null;
  codiceFiscale: string | null;
  pIva: string | null;
  stato: string;
  note: string | null;
  platformId: string | null;
  fonte: string;
  attivo: boolean;
  creatoIl: Date;
  aggiornatoIl: Date;
}) {
  return {
    id: v.id,
    nome: v.nome,
    cognome: v.cognome,
    // Nome già composto: le app che mostrano solo un'etichetta non devono
    // decidere l'ordine di nome e cognome per conto loro.
    nomeCompleto: nomeCompleto(v),
    telefono: v.telefono,
    email: v.email,
    indirizzo: v.indirizzo,
    citta: v.citta,
    provincia: v.provincia,
    provinceServite: v.provinceServite
      ? v.provinceServite.split(",").map((p) => p.trim()).filter(Boolean)
      : [],
    mezzo: v.mezzo,
    codiceFiscale: v.codiceFiscale,
    pIva: v.pIva,
    // in_servizio | sospeso | cessato
    stato: v.stato,
    note: v.note,
    // Id nella piattaforma consegne, quando è agganciato.
    platformId: v.platformId,
    fonte: v.fonte,
    attivo: v.attivo,
    creatoIl: v.creatoIl,
    aggiornatoIl: v.aggiornatoIl,
  };
}

export async function GET(req: NextRequest) {
  const client = await autentica(req);
  if (client instanceof NextResponse) return client;

  const p = req.nextUrl.searchParams;
  const where: Prisma.ValetWhereInput = {};

  // `attivo` non filtrato = solo quelli in elenco: gli archiviati si chiedono
  // apposta, come per i partner.
  const attivo = p.get("attivo");
  where.attivo = attivo === "false" ? false : attivo === "tutti" ? undefined : true;

  const stato = p.get("stato")?.trim();
  if (stato) where.stato = stato;

  const provincia = p.get("provincia")?.trim();
  if (provincia) {
    where.OR = [
      { provincia: { equals: provincia, mode: "insensitive" } },
      { provinceServite: { contains: provincia, mode: "insensitive" } },
    ];
  }

  const q = p.get("q")?.trim();
  if (q) {
    where.AND = [
      {
        OR: [
          { nome: { contains: q, mode: "insensitive" } },
          { cognome: { contains: q, mode: "insensitive" } },
          { telefono: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
          { citta: { contains: q, mode: "insensitive" } },
        ],
      },
    ];
  }

  const pagina = Math.max(1, Number(p.get("page")) || 1);
  const perPagina = Math.min(200, Math.max(1, Number(p.get("perPage")) || 50));

  const [totale, dati] = await Promise.all([
    prisma.valet.count({ where }),
    prisma.valet.findMany({
      where,
      orderBy: [{ cognome: "asc" }, { nome: "asc" }],
      skip: (pagina - 1) * perPagina,
      take: perPagina,
    }),
  ]);

  return NextResponse.json({ totale, pagina, perPagina, dati: dati.map(serializza) });
}
