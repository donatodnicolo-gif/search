import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { chiaveApiValida, appOrigine, ipRichiesta } from "@/lib/apiauth";
import { ficCreaFattura, ficEntityUltimaFattura, ficStato } from "@/lib/fic";

// API pubblica: EMETTERE UNA FATTURA su Fatture in Cloud, per gli altri
// progetti Deluxy (la chiede AI Mail, da una mail in cui l'importo è stato
// concordato).
//
//   POST /api/fattura
//     body JSON: { "partner": "<nome o id>",
//                  "righe": [{ "descrizione", "prezzoUnitario", "quantita"?, "aliquotaIva"? }],
//                  "oggetto"?, "data"?, "scadenza"?, "forza"? }
//
// ⚠️⚠️ QUESTA ROTTA NON È COME LE ALTRE. `/api/proforma` crea un documento IN
// BOZZA, che si corregge e si butta; qui esce una FATTURA ELETTRONICA vera, che
// prende un numero nella numerazione dell'anno e parte verso lo SDI. Non si
// annulla con un clic: si annulla con una nota di credito. Tutto quello che
// segue è scritto attorno a questo fatto.
export const dynamic = "force-dynamic";

type RigaIn = { descrizione?: string; prezzoUnitario?: number; quantita?: number; aliquotaIva?: number };

async function trovaPartner(rif: string) {
  const perId = await prisma.partner.findUnique({ where: { id: rif } });
  if (perId) return { partner: perId, candidati: [] as string[] };
  const perNome = await prisma.partner.findFirst({
    where: { nome: { equals: rif, mode: "insensitive" } },
  });
  if (perNome) return { partner: perNome, candidati: [] as string[] };
  const simili = await prisma.partner.findMany({
    where: { nome: { contains: rif, mode: "insensitive" } },
    take: 5,
  });
  if (simili.length === 1) return { partner: simili[0], candidati: [] as string[] };
  return { partner: null, candidati: simili.map((p) => p.nome) };
}

async function log(
  req: NextRequest,
  query: string,
  esito: string,
  sintesi?: string,
  partner?: { id: string; nome: string } | null
) {
  await prisma.richiestaVerifica.create({
    data: {
      origine: appOrigine(req),
      queryPartner: query,
      partnerId: partner?.id ?? null,
      partnerNome: partner?.nome ?? null,
      esito,
      rispostaSintesi: sintesi ?? null,
      ip: ipRichiesta(req),
    },
  });
}

function parseData(v: unknown): Date | undefined {
  if (typeof v !== "string" || !v.trim()) return undefined;
  const d = new Date(v.length <= 10 ? `${v}T00:00:00` : v);
  return isNaN(d.getTime()) ? undefined : d;
}

export async function POST(req: NextRequest) {
  if (!(await chiaveApiValida(req, "scrittura"))) {
    await log(req, "fattura (emissione)", "non_autorizzato");
    return NextResponse.json({ errore: "Chiave API mancante o non valida (header X-API-Key)." }, { status: 401 });
  }

  let body: {
    partner?: string;
    righe?: RigaIn[];
    oggetto?: string;
    data?: string;
    scadenza?: string;
    forza?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ errore: "Body JSON non valido." }, { status: 400 });
  }

  const partnerRif = (body.partner ?? "").trim();
  if (!partnerRif) {
    return NextResponse.json({ errore: "Campo 'partner' obbligatorio (nome o id)." }, { status: 400 });
  }

  // ⚠️ Le righe si controllano PRIMA di chiamare Fatture in Cloud: un prezzo
  // mancante che diventa uno zero è una fattura da zero euro già emessa.
  const righe = (body.righe ?? [])
    .map((r) => ({
      descrizione: (r.descrizione ?? "").trim(),
      quantita: typeof r.quantita === "number" && r.quantita > 0 ? r.quantita : 1,
      prezzoUnitario: typeof r.prezzoUnitario === "number" ? r.prezzoUnitario : NaN,
      aliquotaIva: typeof r.aliquotaIva === "number" ? r.aliquotaIva : 22,
    }))
    .filter((r) => r.descrizione !== "");
  if (righe.length === 0 || righe.some((r) => isNaN(r.prezzoUnitario))) {
    return NextResponse.json(
      { errore: "Campo 'righe' obbligatorio: almeno una riga con 'descrizione' e 'prezzoUnitario' numerico." },
      { status: 400 }
    );
  }
  if (righe.some((r) => r.prezzoUnitario <= 0)) {
    return NextResponse.json(
      { errore: "Una riga ha un prezzo di zero o negativo: una fattura non si emette così." },
      { status: 400 }
    );
  }

  const { partner, candidati } = await trovaPartner(partnerRif);
  if (!partner) {
    await log(req, partnerRif, "non_trovato");
    return NextResponse.json(
      {
        errore: `Nessun partner corrisponde a «${partnerRif}».`,
        candidati,
      },
      { status: 404 }
    );
  }

  const stato = await ficStato();
  if (!stato.collegato) {
    await log(req, partnerRif, "fic_scollegato", undefined, partner);
    return NextResponse.json(
      { errore: "Fatture in Cloud non è collegato: apri Finance → Fatture in Cloud e ricollega." },
      { status: 409 }
    );
  }

  const totale = righe.reduce((a, r) => a + r.quantita * r.prezzoUnitario * (1 + r.aliquotaIva / 100), 0);

  // ⚠️⚠️ LA DIFESA CONTRO IL DOPPIONE. Una fattura non è idempotente: due
  // chiamate uguali fanno due documenti fiscali, con due numeri, e il secondo
  // si toglie solo con una nota di credito. Un doppio clic, un ritentativo
  // della rete o una mail lavorata due volte bastano.
  // Si guarda l'ultima mezz'ora, stesso partner e stesso totale al centesimo:
  // chi vuole davvero rifarla passa `forza: true`, e allora è una decisione,
  // non un incidente.
  const daPocoLimite = new Date(Date.now() - 30 * 60 * 1000);
  if (!body.forza) {
    const gia = await prisma.richiestaVerifica.findFirst({
      where: {
        partnerId: partner.id,
        esito: "fattura_emessa",
        createdAt: { gte: daPocoLimite },
        rispostaSintesi: { contains: totale.toFixed(2) },
      },
      orderBy: { createdAt: "desc" },
    });
    if (gia) {
      return NextResponse.json(
        {
          errore: `A «${partner.nome}» è già stata emessa una fattura dello stesso importo (${totale.toFixed(
            2
          )} €) meno di mezz'ora fa: ${gia.rispostaSintesi ?? ""}. Se è voluto, rimanda con "forza": true.`,
          giaEmessa: true,
        },
        { status: 409 }
      );
    }
  }

  // Il cliente su Fatture in Cloud: si riprende dall'ultima fattura fatta a
  // quel nome. ⚠️ Se non c'è, NON si inventa un'anagrafica al volo: una
  // fattura elettronica intestata male è un problema fiscale, e i dati
  // (partita IVA, codice destinatario) qui non li abbiamo. Si dice di
  // emetterla da Finance, dove si sceglie il cliente guardandolo.
  let entity;
  try {
    entity = await ficEntityUltimaFattura(partner.nome);
  } catch (e) {
    return NextResponse.json(
      { errore: e instanceof Error ? e.message : "Fatture in Cloud non risponde." },
      { status: 502 }
    );
  }
  if (!entity) {
    await log(req, partnerRif, "cliente_fic_assente", undefined, partner);
    return NextResponse.json(
      {
        errore: `Su Fatture in Cloud non risulta nessuna fattura precedente a «${partner.nome}», quindi non so a quale cliente intestarla. Emetti la prima da Finance → Fatture in Cloud: da lì scegli il cliente e controlli i dati fiscali.`,
      },
      { status: 409 }
    );
  }

  try {
    const fattura = await ficCreaFattura({
      entity,
      righe,
      visibleSubject: body.oggetto?.trim() || undefined,
      data: parseData(body.data),
      scadenza: parseData(body.scadenza) ?? null,
    });
    await log(
      req,
      partnerRif,
      "fattura_emessa",
      `Fattura ${fattura.numero} — ${totale.toFixed(2)} €`,
      partner
    );
    return NextResponse.json({
      ok: true,
      numero: fattura.numero,
      id: fattura.id,
      partner: partner.nome,
      totale: Number(totale.toFixed(2)),
    });
  } catch (e) {
    // ⚠️ L'errore di FIC si RIPORTA com'è: dice quale dato fiscale manca
    // («partita IVA o codice fiscale», «codice destinatario»), ed è
    // esattamente ciò che serve sapere per rimediare. Sostituirlo con «non
    // riuscito» costringerebbe a rifare tutto per scoprirlo.
    const t = e instanceof Error ? e.message : "Emissione non riuscita.";
    await log(req, partnerRif, "fattura_errore", t.slice(0, 300), partner);
    return NextResponse.json({ errore: t }, { status: 400 });
  }
}
