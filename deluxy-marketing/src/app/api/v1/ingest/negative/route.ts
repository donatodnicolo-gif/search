import { NextRequest, NextResponse } from "next/server";
import { autentica, erroreApi } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { CHIAVE_CENSIMENTO } from "@/lib/negative";

// POST /api/v1/ingest/negative — le keyword NEGATIVE che ci sono davvero su
// Google, dal lavoro `negative` dello script.
//
// ⚠️ PERCHÉ. Era l'unico pezzo di una campagna che l'app non riceveva mai, e
// costava due cose: le operazioni `negativa` restavano senza conferma
// indipendente (`conferme-operazioni.ts` doveva dire «vale la rilettura dello
// script», cioè la parola di chi ha scritto), e le parole SPENTE di una
// campagna erano invisibili — si vede su cosa si spende, non cosa è stato
// escluso, e una ricerca che non arriva non lascia traccia da nessuna parte.
//
// Body: { account*, canale?, righe: [{ idEsterno*, campagna*, testo*,
//         corrispondenza?, livello? ("campagna"|"gruppo"), gruppo? }] }
//   oppure { account*, completo: true } — il marcatore di fine censimento.
//
// ⚠️⚠️ IL MARCATORE ESISTE PERCHÉ UN ELENCO TRONCATO MENTE AL CONTRARIO.
// Le righe arrivano a blocchi, e `inviaABlocchi` si ferma quando Google sta
// per scadere ("interrotto per tempo"): è un caso NORMALE, previsto. Ma un
// censimento a metà, letto come completo, fa dire all'app «Google non esclude
// più questa parola» per tutte quelle rimaste fuori — cioè accusa di un guasto
// un giro semplicemente lento. Lo script manda `completo: true` SOLO quando
// ha spedito tutte le righe che aveva letto, e solo da quel momento l'app si
// permette di smentire (vedi `conferme-operazioni.ts`).
//
// ⚠️ NIENTE CANCELLAZIONE, mai. Il censimento arriva a blocchi e `inviaABlocchi`
// li dimezza quando l'app fatica: un invio interrotto a metà è normale, e un
// giro che cancellasse le righe non viste spegnerebbe l'archivio di un intero
// account per un blocco perso, senza un errore. Si scrive `vistaIl`, e «non
// c'è più su Google» si deduce confrontandola con l'ultima consegna `negative`
// di quell'account — la stessa strada delle keyword non confermate.
export async function POST(req: NextRequest) {
  const cliente = await autentica(req, { scrittura: true });
  if (cliente instanceof NextResponse) return cliente;

  let body: {
    account?: string;
    canale?: string;
    completo?: boolean;
    righe?: Record<string, unknown>[];
  };
  try {
    body = await req.json();
  } catch {
    return erroreApi(400, "Body JSON non valido");
  }

  const account = body.account ? String(body.account) : null;
  if (!account) {
    // Senza account non si sa di CHI sono queste negative, e la stessa parola
    // su due conti sono due fatti diversi. Meglio rifiutare che archiviare
    // righe che non si possono più attribuire (è la lezione di `Campagna.account`).
    return erroreApi(400, "Manca 'account': una negativa vive dentro un account");
  }
  // Il marcatore di fine: nessuna riga, solo la dichiarazione che il giro ha
  // spedito tutto. Si scrive come impostazione e non come consegna, per non
  // riempire /ricezione di righe vuote che non portano dati.
  if (body.completo === true) {
    await prisma.impostazione.upsert({
      where: { chiave: `${CHIAVE_CENSIMENTO}${account}` },
      update: { valore: new Date().toISOString() },
      create: { chiave: `${CHIAVE_CENSIMENTO}${account}`, valore: new Date().toISOString() },
    });
    return NextResponse.json({ censimentoCompleto: true }, { status: 200 });
  }

  const righe = Array.isArray(body.righe) ? body.righe : [];
  if (righe.length === 0) {
    return erroreApi(400, "Niente da importare: atteso { righe: [...] } oppure { completo: true }");
  }

  // exact | phrase | broad. Lo script manda le parole di Google (EXACT,
  // PHRASE, BROAD); qualunque altra cosa vale broad, che è la più larga:
  // dichiarare stretta un'esclusione larga farebbe credere viva una ricerca
  // che invece è spenta, e l'errore opposto si nota subito.
  const MATCH = new Set(["exact", "phrase", "broad"]);
  const corrispondenzaDi = (v: unknown) => {
    const m = String(v ?? "").toLowerCase();
    return MATCH.has(m) ? m : "broad";
  };
  // Il testo si archivia NUDO: la corrispondenza sta nel suo campo, così
  // «cheap» esatta e «cheap» generica si riconoscono come la stessa parola con
  // due regole diverse — che è il caso vero del 23/08 sulla WORLD-ENG.
  const nudo = (v: unknown) => String(v ?? "").replace(/^[["]+|[\]"]+$/g, "").trim();

  const valide = righe
    .map((r) => {
      const testo = nudo(r.testo);
      if (!r.idEsterno || !r.campagna || !testo) return null;
      const livello = String(r.livello ?? "campagna") === "gruppo" ? "gruppo" : "campagna";
      return {
        account,
        idEsterno: String(r.idEsterno),
        campagna: String(r.campagna),
        livello,
        gruppo: livello === "gruppo" && r.gruppo ? String(r.gruppo) : null,
        testo,
        corrispondenza: corrispondenzaDi(r.corrispondenza),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r != null);

  // Il legame con la campagna dell'app, quando c'è: si cerca per NOME, che è
  // la chiave con cui l'import ritrova le cose ovunque. Una query sola per
  // tutto il lotto — con `connection_limit 5` una query per riga fa cadere la
  // pagina, ed è la cautela già pagata in conferme-operazioni.ts.
  const nomi = [...new Set(valide.map((r) => r.campagna))];
  const campagne = await prisma.campagna.findMany({
    where: { nome: { in: nomi } },
    select: { id: true, nome: true, account: true },
  });
  const idCampagna = (nome: string) => {
    const stesse = campagne.filter((c) => c.nome === nome);
    // Se due campagne omonime vivono su conti diversi, comanda l'account:
    // attribuirla a caso è il difetto che `Campagna.account` esiste per evitare.
    return (stesse.find((c) => c.account === account) ?? stesse.find((c) => !c.account))?.id ?? null;
  };

  const adesso = new Date();
  const esistenti = await prisma.negativaCampagna.findMany({
    where: { idEsterno: { in: valide.map((r) => r.idEsterno) } },
  });
  const perId = new Map(esistenti.map((e) => [e.idEsterno, e]));

  const nuove = valide.filter((r) => !perId.has(r.idEsterno));
  if (nuove.length > 0) {
    await prisma.negativaCampagna.createMany({
      data: nuove.map((r) => ({ ...r, campagnaId: idCampagna(r.campagna), vistaIl: adesso })),
      skipDuplicates: true,
    });
  }

  let aggiornate = 0;
  for (const r of valide) {
    const c = perId.get(r.idEsterno);
    if (!c) continue;
    const campagnaId = idCampagna(r.campagna);
    await prisma.negativaCampagna.update({
      where: { id: c.id },
      data: {
        // `vistaIl` si riscrive SEMPRE: è il campo che dice «Google la nomina
        // ancora», e aggiornarlo solo quando cambia qualcos'altro farebbe
        // sembrare sparita una negativa che è lì da mesi identica a se stessa.
        vistaIl: adesso,
        campagna: r.campagna,
        campagnaId: campagnaId ?? c.campagnaId,
        livello: r.livello,
        gruppo: r.gruppo,
        testo: r.testo,
        corrispondenza: r.corrispondenza,
      },
    });
    aggiornate++;
  }

  await prisma.ricezioneDati.create({
    data: {
      fonte: body.canale ?? "google_ads",
      account,
      tipo: "negative",
      chiave: cliente.nome,
      righe: righe.length,
      nuove: nuove.length,
      aggiornate,
      scartate: righe.length - valide.length,
      esito: "ok",
    },
  });

  return NextResponse.json(
    { nuove: nuove.length, aggiornate, scartate: righe.length - valide.length },
    { status: 201 }
  );
}
