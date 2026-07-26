import { Prisma } from "@prisma/client";
import { prisma, tabella } from "./db";
import { CATEGORIE, nomeCategoria, ricalcolaCategorie, sqlCategoria } from "./categorie";
import { aiConfigurata, chiediJson, modelloAI } from "./ai";

// L'AI che classifica i PRODOTTI che le regole a parole non riconoscono.
//
// Il problema, in numeri veri: 4.367 titoli diversi, e i più venduti si chiamano
// «Botticelli - Nascita di Venere», «Favolosa», «Alexander». Nel nome non c'è
// niente da riconoscere, e metterli a mano in un elenco significherebbe
// riscriverlo a ogni collezione nuova. È esattamente il lavoro in cui un modello
// linguistico è utile: sa che «Nascita di Venere» è un quadro e che un prodotto
// così, su un negozio di fiori, è una composizione floreale.
//
// LE TRE REGOLE CHE LO TENGONO ONESTO
//  1. **L'AI non inventa categorie**: la risposta si accetta solo se è una di
//     quelle che esistono davvero. Qualunque altra cosa si butta e il prodotto
//     resta non classificato — meglio un buco che una categoria inventata.
//  2. **L'AI non tocca ciò che le regole già sanno**: si chiede solo per i
//     titoli che nessuna parola riconosce. Le regole restano davanti.
//  3. **La proposta resta una proposta**: si salva marcata `ai`, si vede in
//     pagina, e la correzione di una persona vince e non viene più toccata.
//
// Le si passa anche il NEGOZIO e il PREZZO MEDIO, perché sono i due indizi che
// spostano davvero: lo stesso nome su un fioraio e su una pasticceria vuol dire
// cose diverse, e un prodotto da 8 EUR non è un bouquet.

const PER_GIRO = 40; // titoli per chiamata: abbastanza da non moltiplicare le chiamate, pochi da restare precisi

export type TitoloDaClassificare = {
  titolo: string;
  righe: number;
  brand: string;
  // Che cosa vende quel negozio, come lo ha dichiarato l'operatore. Vuoto =
  // vende un po' di tutto, e allora il negozio non è un indizio.
  specialita: string;
  prezzoMedio: number;
};

// I titoli che oggi restano senza categoria: né dalle parole, né da una scelta
// già fatta. In ordine di peso — si parte da quelli che pesano di più.
export async function titoliNonClassificati(limite = 200): Promise<TitoloDaClassificare[]> {
  const dalleParole = Prisma.raw(sqlCategoria(`r."titolo"`, `''`));
  return prisma.$queryRaw<TitoloDaClassificare[]>(Prisma.sql`
    SELECT
      r."titolo",
      COUNT(*)::int AS righe,
      (ARRAY_AGG(o."brand" ORDER BY o."data" DESC))[1] AS brand,
      (ARRAY_AGG(COALESCE(n."categoriaPredefinita", '') ORDER BY o."data" DESC))[1] AS specialita,
      ROUND(AVG(NULLIF(r."prezzo", 0))::numeric, 2)::float8 AS "prezzoMedio"
    FROM ${tabella("RigaOrdine")} r
    JOIN ${tabella("Ordine")} o ON o.id = r."ordineId"
    JOIN ${tabella("NegozioShopify")} n ON n.id = o."negozioId"
    LEFT JOIN ${tabella("CategoriaProdotto")} cp ON cp."titolo" = r."titolo"
    WHERE cp."id" IS NULL AND ${dalleParole} = 'non-classificato' AND TRIM(r."titolo") <> ''
    GROUP BY r."titolo"
    ORDER BY COUNT(*) DESC
    LIMIT ${limite}
  `);
}

type RispostaAI = {
  classificazioni?: { titolo?: string; categoria?: string; motivo?: string }[];
};

const VOCABOLARIO = CATEGORIE.map((c) => `- ${c.chiave}: ${c.nome}`).join("\n");

const SISTEMA = `Sei un classificatore di prodotti per Deluxy, un'azienda italiana di regali di lusso: fiori, colazioni a domicilio, torte e pasticceria, dolci, sushi, bollicine, complementi.
Ti do dei nomi di prodotto veri, con il negozio che li vende e il prezzo medio.
Per ognuno scegli UNA categoria fra queste, usando esattamente la chiave:
${VOCABOLARIO}
- non-classificato: quando davvero non si può sapere.

Regole:
- usa SOLO le chiavi elencate, mai inventarne altre;
- **"non-classificato" è la risposta giusta quando non si può sapere.** Non è un fallimento: un prodotto senza categoria si corregge a mano in dieci secondi, un prodotto nella categoria sbagliata resta sbagliato e sposta le liste dei clienti;
- **il negozio vale come indizio SOLO se vende una cosa sola.** Te lo dico io accanto a ogni prodotto: se leggi "vende un po' di tutto", il negozio non è un argomento e non devi usarlo nel motivo;
- i nomi di quadri, città o persone («Botticelli - Nascita di Venere», «Monet», «Frida») sono nomi di collezione: dicono qualcosa solo insieme al negozio e al prezzo;
- se riconosci il nome (un piatto, un fiore, una pasticceria famosa, un'opera) dillo: quella è una ragione vera. Se invece l'unico argomento è "costa una cifra plausibile", rispondi "non-classificato";
- il motivo è una riga sola in italiano e deve dire **da cosa** l'hai capito.

Rispondi con questo JSON:
{"classificazioni":[{"titolo":"<il titolo esatto che ti ho dato>","categoria":"<chiave>","motivo":"<una riga>"}]}`;

export type EsitoClassificazione = {
  esaminati: number;
  classificati: number;
  nonClassificati: number;
  scartati: number; // risposte con una categoria che non esiste
  chiamate: number;
  errore?: string;
};

// Chiede all'AI di classificare i titoli passati e salva le proposte.
export async function classificaConAI(titoli: TitoloDaClassificare[]): Promise<EsitoClassificazione> {
  const esito: EsitoClassificazione = {
    esaminati: titoli.length,
    classificati: 0,
    nonClassificati: 0,
    scartati: 0,
    chiamate: 0,
  };
  if (!aiConfigurata()) {
    esito.errore = "OpenAI non è configurata: manca OPENAI_API_KEY.";
    return esito;
  }
  if (titoli.length === 0) return esito;

  // L'AI risponde a volte con la chiave («torte»), a volte col nome che le ho
  // mostrato accanto («Torte e pasticceria»). Sono la stessa cosa: si normalizza
  // invece di buttare la risposta — buttarla faceva scartare 12 prodotti su 40
  // e sembrava che il modello sbagliasse, mentre sbagliava il controllo.
  const normalizza = (v: string): string | null => {
    const t = v.trim().toLowerCase();
    if (!t) return null;
    if (t === "non-classificato" || t === "non classificato") return "non-classificato";
    const per = CATEGORIE.find((c) => c.chiave === t || c.nome.toLowerCase() === t);
    return per?.chiave ?? null;
  };

  for (let i = 0; i < titoli.length; i += PER_GIRO) {
    const blocco = titoli.slice(i, i + PER_GIRO);
    const domanda = blocco
      .map(
        (t) =>
          `- "${t.titolo}" · negozio: ${t.brand} (${t.specialita ? `vende soprattutto ${nomeCategoria(t.specialita).toLowerCase()}` : "vende un po' di tutto"}) · prezzo medio: ${Math.round(t.prezzoMedio || 0)} EUR · venduto ${t.righe} volte`,
      )
      .join("\n");

    const risposta = await chiediJson<RispostaAI>(domanda, { sistema: SISTEMA, temperatura: 0, timeout: 90 });
    esito.chiamate++;
    if (!risposta.ok) {
      esito.errore = risposta.errore;
      break; // se OpenAI non risponde, inutile insistere per venti giri
    }

    // Si accetta solo quello che combacia con un titolo chiesto e con una
    // categoria che esiste: il resto si butta e si conta.
    const perTitolo = new Map(blocco.map((t) => [t.titolo, t]));
    for (const c of risposta.dati?.classificazioni ?? []) {
      const t = c.titolo ? perTitolo.get(c.titolo) : undefined;
      const categoria = normalizza(c.categoria ?? "") ?? "";
      if (!t || !categoria) {
        esito.scartati++;
        continue;
      }
      if (categoria === "non-classificato") {
        esito.nonClassificati++;
        continue; // non si salva: resta da guardare, e magari lo dice una persona
      }
      await prisma.categoriaProdotto.upsert({
        where: { titolo: t.titolo },
        create: {
          titolo: t.titolo,
          categoria,
          origine: "ai",
          motivo: (c.motivo ?? "").slice(0, 300) || null,
          righe: t.righe,
        },
        // Una scelta manuale non si tocca mai: l'AI ripassa solo sulle sue.
        update: { categoria, motivo: (c.motivo ?? "").slice(0, 300) || null, righe: t.righe },
      });
      esito.classificati++;
    }
  }

  // Le categorie degli ordini si rifanno subito: altrimenti la classificazione
  // resta scritta ma non si vede da nessuna parte.
  if (esito.classificati > 0) await ricalcolaCategorie();
  return esito;
}

// Il giro completo, come lo chiama il pulsante: prendi i più pesanti, chiedi.
export async function proponiCategorieAI(quanti = 120): Promise<EsitoClassificazione & { modello: string }> {
  const titoli = await titoliNonClassificati(quanti);
  const esito = await classificaConAI(titoli);
  return { ...esito, modello: modelloAI() };
}

// Quanto pesa ancora il non classificato, e chi ha classificato cosa.
export async function riepilogoCategorie(): Promise<{
  righeTotali: number;
  righeNonClassificate: number;
  titoliNonClassificati: number;
  daAI: number;
  daPersona: number;
}> {
  const dalleParole = Prisma.raw(sqlCategoria(`r."titolo"`, `n."categoriaPredefinita"`, "cp"));
  const r = await prisma.$queryRaw<{ totali: number; non_classificate: number; titoli: number }[]>(Prisma.sql`
    SELECT
      COUNT(*)::int AS totali,
      COUNT(*) FILTER (WHERE ${dalleParole} = 'non-classificato')::int AS non_classificate,
      COUNT(DISTINCT r."titolo") FILTER (WHERE ${dalleParole} = 'non-classificato')::int AS titoli
    FROM ${tabella("RigaOrdine")} r
    JOIN ${tabella("Ordine")} o ON o.id = r."ordineId"
    JOIN ${tabella("NegozioShopify")} n ON n.id = o."negozioId"
    LEFT JOIN ${tabella("CategoriaProdotto")} cp ON cp."titolo" = r."titolo"
  `);
  const [daAI, daPersona] = await Promise.all([
    prisma.categoriaProdotto.count({ where: { origine: "ai" } }),
    prisma.categoriaProdotto.count({ where: { origine: "manuale" } }),
  ]);
  return {
    righeTotali: r[0]?.totali ?? 0,
    righeNonClassificate: r[0]?.non_classificate ?? 0,
    titoliNonClassificati: r[0]?.titoli ?? 0,
    daAI,
    daPersona,
  };
}

export { nomeCategoria };
