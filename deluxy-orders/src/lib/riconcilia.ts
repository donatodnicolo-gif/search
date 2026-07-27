import { Prisma } from "@prisma/client";
import { prisma, tabella } from "./db";
import { categorieOrdine, nomeCategoria } from "./categorie";
import { ESONIMI, normalizzaCitta } from "./luoghi";

// RICONCILIAZIONE: rimettere insieme quello che il registro sa già ma tiene in
// pezzi diversi.
//
// Il problema, coi numeri veri: **3.315 ordini non hanno una città di
// consegna** — non perché non si sappia dove vanno, ma perché quel dato è
// finito da un'altra parte. Sta nei **tag** dell'ordine («Roma», «Milano») o
// dentro il **nome del prodotto** («Colazione Alassio», «Torta per 10 Roma»).
// Stessa storia per la categoria: 2.500 ordini «non classificati» che portano
// il tag «Fiori» o «Torta».
//
// LA REGOLA CHE TIENE IN PIEDI TUTTO: una città dedotta **non diventa mai
// l'indirizzo di consegna**. Sta in un campo suo (`cittaDedotta`), con scritto
// da dove viene e la frase esatta in cui è stata trovata. Un indirizzo è un
// impegno con un fattorino davanti; una deduzione è un'ipotesi utile a contare
// e a cercare. Confonderle vorrebbe dire mandare qualcuno dove nessuno ha
// scritto di andare.
//
// Il vocabolario delle città **non è una lista inventata**: sono le città in
// cui abbiamo consegnato davvero, prese dagli ordini che l'indirizzo ce
// l'hanno. Cresce da sé e non contiene posti dove non siamo mai stati.

export type EsitoRiconciliazione = {
  cittaDaTag: number;
  cittaDaProdotto: number;
  cittaSenzaRisposta: number;
  scartatePerControprova: number;
  cittaSmentite: string[];
  categorieDaTag: number;
  esempi: string[];
};

// Quante volte una città deve comparire in un indirizzo vero per entrare nel
// vocabolario. Con 1 entrerebbero anche gli errori di battitura di un cliente
// solo, e un refuso diventerebbe un luogo.
const MINIMO_PER_ENTRARE = 3;

// Sotto le quattro lettere il rischio di pescare una parola qualsiasi dentro
// un titolo supera l'utilità («Bra», «Asti» in «pasticceria»…). Le regole con
// i confini di parola aiutano, ma la prudenza costa poco.
const LUNGHEZZA_MINIMA = 4;

type VoceVocabolario = { citta: string; regola: RegExp };

// Toglie gli accenti e abbassa tutto: «Forlì» e «forli» devono incontrarsi.
function piatto(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

// Il vocabolario delle città, costruito dagli indirizzi veri del registro.
export async function vocabolarioCitta(): Promise<VoceVocabolario[]> {
  const righe = await prisma.$queryRawUnsafe<{ citta: string; paese: string | null; n: number }[]>(
    `SELECT TRIM("citta") AS citta, MAX("paese") AS paese, COUNT(*)::int AS n
       FROM orders."Ordine"
      WHERE "citta" IS NOT NULL AND TRIM("citta") <> ''
      GROUP BY 1 HAVING COUNT(*) >= ${MINIMO_PER_ENTRARE}`,
  );

  // Una città può essere scritta in mille modi: si tiene la forma normalizzata
  // come nome, e ogni grafia diventa un modo per riconoscerla.
  const perNome = new Map<string, Set<string>>();
  for (const r of righe) {
    const nome = normalizzaCitta(r.citta, r.paese);
    if (!nome || nome.length < LUNGHEZZA_MINIMA) continue;
    if (!perNome.has(nome)) perNome.set(nome, new Set());
    perNome.get(nome)!.add(piatto(r.citta));
    perNome.get(nome)!.add(piatto(nome));
  }
  // Gli esonimi: «Rome» nel titolo di un prodotto vuol dire Roma.
  for (const [inglese, italiana] of Object.entries(ESONIMI)) {
    if (perNome.has(italiana)) perNome.get(italiana)!.add(piatto(inglese));
  }

  return [...perNome.entries()]
    .map(([citta, grafie]) => ({
      citta,
      // Confini di parola: «Como» non si trova dentro «comodino», e «Bari» non
      // dentro «barista». Senza questo la riconciliazione inventa viaggi.
      regola: new RegExp(
        `(?<![\\p{L}])(${[...grafie].map((g) => g.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?![\\p{L}])`,
        "u",
      ),
    }))
    // Prima le città col nome più lungo: «Reggio Emilia» prima di «Reggio».
    .sort((a, b) => b.citta.length - a.citta.length);
}

// Cerca una città dentro un testo. Torna la prima che combacia (le più lunghe
// sono già in cima) insieme al pezzo di testo che l'ha fatta scattare.
export function cercaCitta(testo: string, vocabolario: VoceVocabolario[]): { citta: string; prova: string } | null {
  const t = piatto(testo);
  for (const v of vocabolario) {
    const m = v.regola.exec(t);
    if (m) return { citta: v.citta, prova: testo.trim().slice(0, 120) };
  }
  return null;
}

// ---- IL GUARDIANO: una città nel nome di un prodotto spesso non è una città --
//
// «Bouquet Tulipani Rosa e **Magenta**» — Magenta è un colore, e anche un
// comune vicino a Milano. «**Dubai** Chocolate Cake», «Bouquet **Venezia**»,
// «Colazione a 5 stelle **Napoli**»: nomi di modelli, non destinazioni. Dedurre
// da lì la città di consegna vorrebbe dire spostare centinaia di ordini su una
// mappa sbagliata.
//
// Non serve indovinare: **lo dicono i fatti**. Quegli stessi prodotti, negli
// ordini che l'indirizzo ce l'hanno, dove sono andati? Se sono andati altrove,
// quella parola non è una destinazione — e si smette di crederle.
//
// Misurato sull'archivio (27/07/2026): 746 titoli nominano una città, 30 hanno
// abbastanza ordini indirizzati per giudicarli, e **10 sono smentiti dai
// fatti** — «Bouquet Venezia» è finito 21 volte su 21 fuori Venezia.
export type FiduciaTitoli = { affidabile: (citta: string) => boolean; smentite: string[] };

const PROVE_MINIME = 3;

export async function fiduciaNeiTitoli(vocabolario: VoceVocabolario[]): Promise<FiduciaTitoli> {
  const righe = await prisma.rigaOrdine.findMany({
    select: { titolo: true, ordine: { select: { citta: true, paese: true } } },
  });

  const conto = new Map<string, { si: number; no: number }>();
  for (const r of righe) {
    const t = cercaCitta(r.titolo, vocabolario);
    if (!t) continue;
    const vera = normalizzaCitta(r.ordine.citta, r.ordine.paese);
    if (!vera) continue; // senza indirizzo non fa né prova né controprova
    if (!conto.has(t.citta)) conto.set(t.citta, { si: 0, no: 0 });
    const c = conto.get(t.citta)!;
    if (vera === t.citta) c.si++;
    else c.no++;
  }

  const bocciate = new Set<string>();
  for (const [citta, c] of conto) {
    if (c.si + c.no >= PROVE_MINIME && c.no > c.si) bocciate.add(citta);
  }

  return {
    affidabile: (citta: string) => !bocciate.has(citta),
    smentite: [...bocciate].sort(),
  };
}

// I tag di un ordine, uno per uno.
function tagDi(tagShopify: string | null): string[] {
  return (tagShopify ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

// Il giro completo. Tocca **solo** gli ordini a cui manca il dato: chi ha un
// indirizzo vero non viene sfiorato, e rilanciarlo non cambia niente.
export async function riconcilia(): Promise<EsitoRiconciliazione> {
  const vocabolario = await vocabolarioCitta();
  const fiducia = await fiduciaNeiTitoli(vocabolario);
  const esito: EsitoRiconciliazione = {
    cittaDaTag: 0,
    cittaDaProdotto: 0,
    cittaSenzaRisposta: 0,
    scartatePerControprova: 0,
    cittaSmentite: fiducia.smentite,
    categorieDaTag: 0,
    esempi: [],
  };

  // ---- 1. La città, per gli ordini che non ce l'hanno ----
  const senzaCitta = await prisma.ordine.findMany({
    where: { OR: [{ citta: null }, { citta: "" }] },
    select: {
      id: true,
      numero: true,
      tagShopify: true,
      cittaDedotta: true,
      righe: { select: { titolo: true } },
    },
  });

  const daScrivere: { id: string; citta: string; da: string; prova: string }[] = [];
  for (const o of senzaCitta) {
    // Prima i TAG: sono un'etichetta messa apposta da una persona, quindi
    // valgono più del nome di un prodotto, che può nominare una città per mille
    // altri motivi.
    let trovata: { citta: string; prova: string } | null = null;
    let da = "tag";
    for (const t of tagDi(o.tagShopify)) {
      trovata = cercaCitta(t, vocabolario);
      if (trovata) break;
    }
    if (!trovata) {
      // Dal nome del prodotto sì, ma solo per le città che i fatti non hanno
      // smentito: «Bouquet Venezia» non è un ordine per Venezia.
      da = "prodotto";
      for (const r of o.righe) {
        const c = cercaCitta(r.titolo, vocabolario);
        if (c && fiducia.affidabile(c.citta)) {
          trovata = c;
          break;
        }
        if (c) esito.scartatePerControprova++;
      }
    }
    if (!trovata) {
      esito.cittaSenzaRisposta++;
      continue;
    }
    if (da === "tag") esito.cittaDaTag++;
    else esito.cittaDaProdotto++;
    if (esito.esempi.length < 8) {
      esito.esempi.push(`${o.numero}: ${trovata.citta} — da ${da} «${trovata.prova}»`);
    }
    if (o.cittaDedotta !== trovata.citta) {
      daScrivere.push({ id: o.id, citta: trovata.citta, da, prova: trovata.prova });
    }
  }

  // UNA scrittura per blocco, non una per ordine: con 200 update in parallelo
  // il pool di connessioni (5) si esaurisce e il giro muore a metà. Già visto.
  for (let i = 0; i < daScrivere.length; i += 500) {
    const blocco = daScrivere.slice(i, i + 500);
    await prisma.$executeRaw`
      UPDATE ${tabella("Ordine")} AS o SET
        "cittaDedotta" = v.citta,
        "cittaDedottaDa" = v.da,
        "cittaDedottaProva" = v.prova
      FROM (VALUES ${Prisma.join(blocco.map((d) => Prisma.sql`(${d.id}, ${d.citta}, ${d.da}, ${d.prova})`))})
        AS v(id, citta, da, prova)
      WHERE o."id" = v.id
    `;
  }

  // ---- 2. La categoria dai tag ----
  // NON si fa qui: sta dentro il ricalcolo delle categorie (categorie.ts),
  // nella catena di precedenza — titolo, poi AI, poi TAG, poi specialità del
  // negozio. Se la si scrivesse qui accanto, il primo ricalcolo lanciato da
  // Impostazioni la cancellerebbe senza dire niente. Una regola, un posto.
  const { ricalcolaCategorie } = await import("./categorie");
  esito.categorieDaTag = (await ricalcolaCategorie()).aggiornati;

  return esito;
}
