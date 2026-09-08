// **L'AI riempie le sezioni della categoria.**
//
// Chiesto dall'utente l'08/09/2026: «l'AI deve essere in grado di riempire le
// varie sezioni di ogni categoria». Finora sapeva scrivere solo la descrizione,
// e le sezioni — che sono le tab della scheda sul sito — restavano a mano.
//
// ⚠️ **Il modello non sa cosa c'è dentro un prodotto.** Non conosce gli
// ingredienti di una torta né quanti steli ha un bouquet, e la sezione più
// importante di tutte è **Allergeni**: un elenco inventato non è un testo
// sbagliato, è un rischio per chi lo legge. Quindi:
//   · si passano SOLO dati veri (nome, categoria, materiali, note, varianti,
//     prezzo) e si vieta di aggiungerne;
//   · le sezioni che parlano di **ingredienti, allergeni, pesi e misure** si
//     compilano solo se quei dati sono stati dati, altrimenti restano vuote —
//     meglio una casella vuota che una lista di allergeni inventata;
//   · **non si sovrascrive** ciò che una persona ha già scritto.
//
// Come per la descrizione: qui non si pubblica niente. Il testo arriva nei
// campi del modulo, e qualcuno lo rilegge prima di salvare.

import { prisma } from "./db";
import { etichettaCategoria } from "./dominio";
import { leggiSegreto } from "./segreti";
import { promptDiCategoria } from "./ai-descrizione";

const MODELLO = (process.env.OPENAI_MODEL || "gpt-4o-mini").trim();

/** Le sezioni che NON si inventano: senza dati veri restano vuote. */
const DA_NON_INVENTARE = /ingredient|allergen|peso|pesi|misur|dimension|conservazion|calor|nutrizion/i;

export type SezioneDaRiempire = { nome: string; tipo: string };

export type DatiPerSezioni = {
  nome: string;
  categoria: string;
  sito: string;
  materiali: string;
  note: string;
  prezzo: string;
  varianti: string[];
  descrizione: string;
  sezioni: SezioneDaRiempire[];
  /** Cosa contiene di solito ogni sezione su questo sito: preso dai prodotti veri. */
  esempi?: Record<string, string[]>;
  /** Quelle già scritte da una persona: non si toccano, servono da contesto. */
  gia: Record<string, string>;
};

export type EsitoSezioni =
  | { ok: true; sezioni: Record<string, string>; saltate: string[]; modello: string }
  | { ok: false; errore: string; configurata: boolean };

const COME_SI_SCRIVE: Record<string, string> = {
  testo: "un paragrafo breve, 1-3 frasi",
  elenco: "un elenco: una voce per riga, senza puntini né trattini iniziali",
  coppie: "una coppia per riga, nella forma «Nome: valore», dove Nome è la GRANDEZZA misurata (Altezza, Diametro, Peso, Porzioni, Durata…) — mai la stessa etichetta ripetuta su più righe",
};

/**
 * Se tutte le righe hanno la stessa etichetta prima dei due punti, diventano
 * una riga sola: «Varianti: 8 / Varianti: 10» → «Varianti: 8, 10». Con una
 * riga sola, o con etichette diverse, non tocca niente.
 */
export function accorpaEtichetteUguali(testo: string): string {
  const righe = testo.split("\n").map((r) => r.trim()).filter(Boolean);
  if (righe.length < 2) return testo;
  const coppie = righe.map((r) => {
    const i = r.indexOf(":");
    return i > 0 && i <= 28 ? { etichetta: r.slice(0, i).trim(), valore: r.slice(i + 1).trim() } : null;
  });
  if (coppie.some((c) => !c)) return testo;
  const prima = coppie[0]!.etichetta.toLowerCase();
  if (!coppie.every((c) => c!.etichetta.toLowerCase() === prima)) return testo;
  return `${coppie[0]!.etichetta}: ${coppie.map((c) => c!.valore).join(", ")}`;
}

/**
 * **Cosa contiene di solito questa sezione, su questo sito.**
 *
 * ⚠️ Serve perché il nome da solo non basta al modello. Alla prova dell'08/09
 * le taglie della torta sono finite sotto «Personalizzazione» invece che sotto
 * «Pesi e Misure»: due sezioni a coppie, e senza sapere cosa ci va dentro la
 * scelta è un tiro di dadi. Gli esempi non sono inventati — sono i valori che
 * quelle stesse sezioni hanno **sugli altri prodotti della stessa categoria su
 * questo sito**, che oggi sono più di millesettecento.
 */
export async function esempiDiSezione(categoria: string, sito: string, nomi: string[]): Promise<Record<string, string[]>> {
  if (!nomi.length || !categoria || !sito) return {};
  const altri = await prisma.prodotto.findMany({
    where: { categoria, pubblicazioni: { some: { negozio: sito, shopifyId: { not: null } } } },
    select: { sezioniScheda: true },
    take: 60,
  });
  const fuori: Record<string, string[]> = {};
  for (const a of altri) {
    const s = a.sezioniScheda;
    if (!s || typeof s !== "object" || Array.isArray(s)) continue;
    const suo = (s as Record<string, unknown>)[sito];
    if (!suo || typeof suo !== "object" || Array.isArray(suo)) continue;
    for (const nome of nomi) {
      const v = (suo as Record<string, unknown>)[nome];
      if (typeof v !== "string" || !v.trim()) continue;
      const gia = fuori[nome] ?? [];
      if (gia.length >= 2) continue;
      const breve = v.split("\n").map((r) => r.trim()).filter(Boolean).slice(0, 4).join("\n").slice(0, 220);
      if (breve && !gia.includes(breve)) fuori[nome] = [...gia, breve];
    }
  }
  return fuori;
}

export async function riempiSezioni(d: DatiPerSezioni): Promise<EsitoSezioni> {
  const chiave = await leggiSegreto("OPENAI_API_KEY");
  if (!chiave) return { ok: false, configurata: false, errore: "Manca la chiave OpenAI (Negozi & permessi)." };

  const daFare = d.sezioni.filter((s) => !(d.gia[s.nome] ?? "").trim());
  if (!daFare.length) return { ok: true, sezioni: {}, saltate: [], modello: MODELLO };

  // ⚠️ **Corretto dopo la prima prova vera** (08/09/2026). Il filtro guardava
  // solo materiali e note, e su «Cuore di Cioccolato e Fragole» ha scartato
  // tutte e cinque le sezioni — mentre la **descrizione** conteneva già
  // ingredienti, allergeni e conservazione, scritti da una persona. Un
  // guardrail che butta i dati veri non protegge nessuno: fa solo sembrare
  // che l'AI non serva. Conta come dato anche una descrizione con del
  // contenuto; resta il divieto di inventare, che sta nelle istruzioni.
  const senzaDati = !d.materiali.trim() && !d.note.trim() && d.descrizione.trim().length < 120;
  const promptCategoria = await promptDiCategoria(d.categoria);

  const istruzioni = `Compili le sezioni della scheda prodotto di Deluxy, maison italiana di fiori, torte e regali di lusso. La scheda va sul sito ${d.sito}.

Regole non negoziabili:
- Usa SOLO le informazioni che ti vengono date. Non inventare ingredienti, allergeni, misure, pesi, tempi di conservazione, numero di fiori, provenienze.
- La descrizione già scritta è una fonte valida: se contiene ingredienti, allergeni, pesi o conservazione, **usali da lì** invece di lasciare la sezione vuota. Riportali, non riscriverli a memoria.
- Se per una sezione non hai dati sufficienti, **lasciala fuori dalla risposta**: una sezione vuota è corretta, una sezione inventata è un danno. Vale soprattutto per ingredienti e allergeni, che una persona legge per decidere se può mangiare una cosa.
- Niente superlativi a raffica, niente emoji, niente promesse di consegna o di prezzo.
- Italiano corretto e asciutto. Nessun titolo dentro il testo: il titolo è il nome della sezione.
- I «formati» che ti passo sono i nomi delle taglie con cui il prodotto si vende (spesso il numero di porzioni o di steli): usali come **valori**, non come etichetta. In una sezione di pesi e misure si scrive «Porzioni: 8, 10, 12», non «Varianti: 8» ripetuto.
- **Solo nelle sezioni a coppie**: non ripetere la stessa etichetta su righe diverse — se una grandezza ha più valori, mettili sulla stessa riga separati da virgola («Porzioni: 8, 10, 12»). Nelle sezioni a elenco, invece, **ogni voce resta sulla sua riga**: sono cose diverse, non valori dello stesso dato.
${promptCategoria ? `\nIndicazioni di questa categoria, scritte da chi la cura — hanno la precedenza:\n${promptCategoria}` : ""}

Le sezioni da compilare, con la forma che devono avere. In fondo ai dati trovi «esempiPerSezione»: sono i valori che quelle stesse sezioni hanno su altri prodotti simili. **Dicono COSA va in quella sezione** — segui il contenuto, non copiare le parole e non copiare la punteggiatura.
${daFare.map((s) => `- "${s.nome}": ${COME_SI_SCRIVE[s.tipo] ?? COME_SI_SCRIVE.testo}`).join("\n")}

Rispondi SOLO in JSON, con una chiave per ogni sezione che sai compilare davvero:
{ ${daFare.map((s) => `"${s.nome}": "…"`).join(", ")} }`;

  const dati = {
    nome: d.nome,
    categoria: etichettaCategoria(d.categoria),
    sito: d.sito,
    materialiOComposizione: d.materiali || null,
    noteDiSpecifica: d.note || null,
    prezzo: d.prezzo || null,
    formatiInVendita: d.varianti.filter(Boolean),
    descrizioneGiaScritta: d.descrizione || null,
    sezioniGiaCompilate: d.gia,
    esempiPerSezione: d.esempi ?? {},
  };

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${chiave}` },
      body: JSON.stringify({
        model: MODELLO,
        temperature: 0.5,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: istruzioni },
          { role: "user", content: JSON.stringify(dati) },
        ],
      }),
      signal: AbortSignal.timeout(90_000),
      cache: "no-store",
    });
    if (!res.ok) {
      const testo = await res.text().catch(() => "");
      throw new Error(res.status === 401 ? "Chiave OpenAI rifiutata (401)." : `OpenAI ha risposto ${res.status}. ${testo.slice(0, 160)}`);
    }
    const corpo = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const contenuto = corpo.choices?.[0]?.message?.content;
    if (!contenuto) throw new Error("Risposta del modello vuota.");
    const g = JSON.parse(contenuto) as Record<string, unknown>;

    const sezioni: Record<string, string> = {};
    const saltate: string[] = [];
    for (const s of daFare) {
      const v = g[s.nome];
      // ⚠️⚠️ **Il modello risponde anche con delle LISTE, ed è giusto così**:
      // a una sezione di tipo «elenco» o «coppie» un array è la forma naturale.
      // La prima versione accettava solo le stringhe e buttava via tutto il
      // resto — sul primo prodotto provato («Cuore di Cioccolato e Fragole»)
      // l'AI aveva scritto tutte e cinque le sezioni, ingredienti e allergeni
      // compresi, e l'app rispondeva «niente dati per scriverle». Un difetto
      // che si travestiva da prudenza.
      const testo = typeof v === "string"
        ? v.trim()
        : Array.isArray(v)
          ? v.map((x) => (typeof x === "string" ? x.trim() : x && typeof x === "object" ? Object.entries(x).map(([k, y]) => `${k}: ${y}`).join(", ") : "")).filter(Boolean).join("\n")
          : v && typeof v === "object"
            ? Object.entries(v as Record<string, unknown>).map(([k, y]) => `${k}: ${y}`).join("\n")
            : "";
      if (!testo) { saltate.push(s.nome); continue; }
      // ⚠️ Il guardrail vero: senza materiali né note, una sezione di
      // ingredienti/allergeni/misure sarebbe **inventata**. La si scarta anche
      // se il modello l'ha scritta lo stesso.
      if (senzaDati && DA_NON_INVENTARE.test(s.nome)) { saltate.push(s.nome); continue; }
      // ⚠️ **Rete di sicurezza sulle coppie** (08/09/2026): alla prima prova
      // «Pesi e Misure» è uscito come «Varianti: 8 / Varianti: 10 / Varianti:
      // 12…» — il dato giusto con l'etichetta ripetuta dieci volte. Il prompt
      // ora lo vieta, ma una regola che vive solo nelle istruzioni prima o poi
      // salta: se le righe hanno tutte la stessa etichetta si accorpano in una
      // sola, coi valori separati da virgola.
      sezioni[s.nome] = accorpaEtichetteUguali(testo).slice(0, 4000);
    }
    return { ok: true, sezioni, saltate, modello: MODELLO };
  } catch (e) {
    return { ok: false, configurata: true, errore: e instanceof Error ? e.message : "Errore sconosciuto." };
  }
}
