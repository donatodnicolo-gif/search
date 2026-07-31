import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { chiaveApiValida, appOrigine, ipRichiesta } from "@/lib/apiauth";
import { nomeMese, MESI } from "@/lib/calc";
import { ANNO_CORRENTE } from "@/lib/queries";

// API pubblica: gli ADDEBITI bancari (uscite) del periodo, aggregati per
// controparte, per la ricostruzione dei costi lato CFO.
//
//   GET /api/spese?anno=2026                 tutto l'anno
//   GET /api/spese?anno=2026&mese=6          un mese solo
//   GET /api/spese?anno=2026&dal=1&al=6      intervallo di mesi (inclusi)
//   GET /api/spese?anno=2026&stato=tutte     include anche le transazioni "ignorata"
//   GET /api/spese?anno=2026&controparte=X   i MOVIMENTI di quella controparte,
//                                            uno per uno, con data e causale
//   Header: X-API-Key: <chiave>   (la stessa di /api/verifiche)
//
// Il parametro `controparte` serve a chi deve **decidere cosa è** un pagamento:
// il nome da solo non basta — «Formenti Patrizia» può essere una fiorista o una
// valet — mentre la **causale** lo dice (un numero d'ordine è un fioraio pagato
// per quell'ordine, un mese è il rimborso di un valet). E per spostare un
// importo su un altro esercizio serve la **data**, che l'aggregato per mese non
// ha. Sono gli stessi movimenti dell'aggregato, non filtrati diversamente:
// cambia solo che non vengono sommati.
//
// Solo importi < 0 (uscite). Ogni controparte riporta l'uscita totale (valore
// assoluto), il numero di movimenti, la quota % e la ripartizione per mese.

function meseValido(v: string | null): number | null {
  if (!v) return null;
  const n = parseInt(v);
  return n >= 1 && n <= 12 ? n : null;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const anno = parseInt(sp.get("anno") ?? "") || ANNO_CORRENTE;
  const mese = meseValido(sp.get("mese"));
  const dal = meseValido(sp.get("dal")) ?? 1;
  const al = meseValido(sp.get("al")) ?? 12;
  const includiIgnorate = (sp.get("stato") ?? "").toLowerCase() === "tutte";
  const query = `spese ${anno}${mese ? `/${mese}` : dal !== 1 || al !== 12 ? ` ${dal}-${al}` : ""}`;

  if (!(await chiaveApiValida(req))) {
    await prisma.richiestaVerifica.create({
      data: { origine: appOrigine(req), queryPartner: query, esito: "non_autorizzato", ip: ipRichiesta(req) },
    });
    return NextResponse.json({ errore: "Chiave API mancante o non valida (header X-API-Key)." }, { status: 401 });
  }

  const meseDa = mese ?? Math.min(dal, al);
  const meseA = mese ?? Math.max(dal, al);
  // Finestra temporale [primo giorno di meseDa, primo giorno del mese dopo meseA)
  const inizio = new Date(Date.UTC(anno, meseDa - 1, 1));
  const fine = new Date(Date.UTC(anno, meseA, 1));

  const movimenti = await prisma.transazioneBancaria.findMany({
    where: {
      data: { gte: inizio, lt: fine },
      importo: { lt: 0 }, // solo uscite
      ...(includiIgnorate ? {} : { stato: { not: "ignorata" } }),
    },
    select: { data: true, importo: true, descrizione: true, controparte: true, categoriaId: true, categoriaNome: true, categoriaTipoPL: true },
  });

  // ---- Dettaglio di una sola controparte: i movimenti, non la somma ----
  // Si filtra sugli stessi movimenti già letti, con la stessa regola di
  // aggregazione del nome (controparte, altrimenti descrizione): se qui il nome
  // si formasse in modo diverso, una controparte dell'elenco non troverebbe i
  // propri movimenti e sembrerebbe vuota.
  const chiediControparte = (sp.get("controparte") ?? "").trim();
  if (chiediControparte) {
    const righe = movimenti
      .filter(
        (m) =>
          (m.controparte?.trim() || m.descrizione?.trim() || "Senza controparte").slice(0, 120) ===
          chiediControparte
      )
      .sort((a, b) => b.data.getTime() - a.data.getTime())
      .map((m) => ({
        data: m.data.toISOString().slice(0, 10),
        importo: +Math.abs(m.importo).toFixed(2),
        descrizione: m.descrizione ?? null,
        categoria: m.categoriaNome ?? null,
      }));
    return NextResponse.json({
      anno,
      controparte: chiediControparte,
      periodo: { dal: meseDa, al: meseA },
      movimenti: righe,
      totale: +righe.reduce((s, r) => s + r.importo, 0).toFixed(2),
    });
  }

  // aggregazione per controparte (fallback: descrizione)
  const perContro = new Map<
    string,
    {
      controparte: string;
      uscite: number;
      movimenti: number;
      perMese: number[];
      categorie: Map<string, { id: string | null; tipoPL: string; uscite: number; perMese: number[] }>;
    }
  >();
  for (const m of movimenti) {
    const k = (m.controparte?.trim() || m.descrizione?.trim() || "Senza controparte").slice(0, 120);
    const e = perContro.get(k) ?? { controparte: k, uscite: 0, movimenti: 0, perMese: Array(12).fill(0), categorie: new Map() };
    const uscita = Math.abs(m.importo);
    const meseIdx = m.data.getUTCMonth();
    // Categoria di costo assegnata in Finance (elenco di Budgets). Si raccolgono
    // TUTTE quelle viste per la stessa controparte: se sono piu' di una, chi
    // legge deve saperlo invece di ricevere la prima a caso.
    //
    // **Con l'importo e i dodici mesi di ciascuna** (31/07/2026): da quando la
    // classificazione la decide Finance, Budgets ci costruisce sopra il conto
    // economico, e una controparte usata per spese di natura diversa va
    // **divisa** fra le sue voci. Senza gli importi si potrebbe solo prendere
    // la prima e attribuirle tutto.
    if (m.categoriaNome) {
      const c = e.categorie.get(m.categoriaNome) ?? {
        id: m.categoriaId ?? null,
        tipoPL: m.categoriaTipoPL ?? "STRUTTURA",
        uscite: 0,
        perMese: Array(12).fill(0) as number[],
      };
      c.uscite += uscita;
      c.perMese[meseIdx] += uscita;
      e.categorie.set(m.categoriaNome, c);
    }
    e.uscite += uscita;
    e.movimenti += 1;
    e.perMese[meseIdx] += uscita;
    perContro.set(k, e);
  }

  const totaleUscite = [...perContro.values()].reduce((a, x) => a + x.uscite, 0);
  const controparti = [...perContro.values()]
    .sort((a, b) => b.uscite - a.uscite)
    .map((x) => ({
      controparte: x.controparte,
      uscite: +x.uscite.toFixed(2),
      movimenti: x.movimenti,
      quota: totaleUscite ? +((x.uscite / totaleUscite) * 100).toFixed(1) : 0,
      perMese: x.perMese.map((v) => +v.toFixed(2)),
      // null = nessuna categoria assegnata; piu' voci = controparte usata per
      // spese di natura diversa, da guardare prima di sommarla a un totale.
      categorie: [...x.categorie.entries()].map(([nome, c]) => ({
        // `id` e' quello della categoria in Budgets: permette di agganciarla
        // senza passare dal nome, che una rinomina fa divergere in silenzio.
        id: c.id,
        nome,
        tipoPL: c.tipoPL,
        uscite: +c.uscite.toFixed(2),
        perMese: c.perMese.map((v) => +v.toFixed(2)),
      })),
    }));

  const etichettaPeriodo = mese
    ? `${nomeMese(mese)} ${anno}`
    : dal === 1 && al === 12
      ? `Anno ${anno}`
      : `${MESI[Math.min(dal, al) - 1]}–${MESI[Math.max(dal, al) - 1]} ${anno}`;

  await prisma.richiestaVerifica.create({
    data: {
      origine: appOrigine(req),
      queryPartner: query,
      esito: "trovato",
      rispostaSintesi: `${controparti.length} controparti · uscite ${totaleUscite.toFixed(2)}`,
      ip: ipRichiesta(req),
    },
  });

  return NextResponse.json({
    anno,
    periodo: { dal: meseDa, al: meseA, etichetta: etichettaPeriodo },
    controparti,
    totali: {
      uscite: +totaleUscite.toFixed(2),
      movimenti: movimenti.length,
      perMese: Array.from({ length: 12 }, (_, i) =>
        +[...perContro.values()].reduce((a, x) => a + x.perMese[i], 0).toFixed(2)
      ),
    },
  });
}
