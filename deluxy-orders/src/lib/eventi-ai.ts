import { prisma } from "./db";
import { TIPI_EVENTO, dataEvento } from "./eventi";
import { aiConfigurata, chiediJson, modelloAI } from "./ai";

// L'AI che legge il BIGLIETTO e dice per che occasione era quell'ordine.
//
// È la domanda che gli eventi lasciavano aperta: sappiamo che il 27 luglio
// quella persona riceve qualcosa ogni anno, ma non sappiamo *perché*. La
// risposta, quando c'è, sta scritta nel biglietto — «Tanti Auguri Zia!»,
// «Happy Birthday», «Buon Natale», «Congratulazioni per la laurea».
//
// SUI DATI VERI: 7.672 eventi su 8.729 hanno un testo da leggere (91 un
// biglietto vero e proprio, gli altri la nota dell'ordine, che è dove i tre
// negozi finiscono per scrivere la dedica).
//
// LE REGOLE, le stesse del resto dell'AI in questa app:
//  1. **il tipo si accetta solo se esiste** in TIPI_EVENTO: niente inventato;
//  2. **la nota non è sempre una dedica.** Dentro finiscono «Tags: Fiori»,
//     istruzioni per il corriere e numeri di telefono: se il testo non dice
//     l'occasione, la risposta giusta è «da precisare»;
//  3. **si salva la PROVA**: il pezzo di testo su cui si è basata, così chi
//     legge la pagina vede da dove viene la risposta e può smentirla;
//  4. **quello che ha scritto una persona non si tocca** (`tipoDa = manuale`).
//
// COSA ESCE DALL'AZIENDA: solo il testo del biglietto e la data. Non il nome
// del cliente, non l'email, non il telefono, non l'indirizzo. Il biglietto però
// contiene spesso nomi di persona («Tanti Auguri Zia! Peppino, Carmela»): è
// giusto saperlo, perché quel testo passa da OpenAI.

const PER_GIRO = 25;

const VOCABOLARIO = TIPI_EVENTO.filter((t) => t.chiave !== "da-precisare")
  .map((t) => `- ${t.chiave}: ${t.nome}`)
  .join("\n");

const SISTEMA = `Leggi il biglietto che accompagna un regalo (fiori, torte, colazioni) e dimmi PER CHE OCCASIONE è stato mandato.
Scegli fra queste, con la chiave esatta:
${VOCABOLARIO}
- da-precisare: quando il testo non lo dice.

Regole, importanti:
- **il testo spesso NON è una dedica**: può essere una nota per il corriere, un elenco di tag, un indirizzo, un numero di telefono. In quel caso rispondi "da-precisare" e basta;
- non dedurre l'occasione dalla data né dal prodotto: solo da quello che c'è scritto;
- **"auguri" da solo non basta**: senza dire di che cosa (compleanno, onomastico, anniversario…) la risposta è "da-precisare";
- **"nascita" vuol dire un bambino appena nato o un battesimo.** "Auguri mamma", "Feliz día de las madres", "Buona festa della mamma" sono la FESTA DELLA MAMMA, quindi "ricorrenza": una madre che riceve fiori l'8 maggio non ha appena partorito;
- attenzione a distinguere **condoglianze** (lutto) da tutto il resto: se il testo parla di perdita, dolore o vicinanza, dillo — sbagliare qui è grave;
- il "titolo" è una riga breve che una persona userebbe per riconoscere l'evento, tipo "Compleanno di Anna" o "Natale in famiglia". Se non sai il nome, non inventarlo;
- la "prova" è la frase esatta, copiata dal testo, che ti ha fatto decidere (massimo 120 caratteri). Se rispondi "da-precisare", lascia la prova vuota;
- il motivo è una riga in italiano.

Rispondi con questo JSON:
{"occasioni":[{"id":"<l'id che ti ho dato>","tipo":"<chiave>","titolo":"<riga breve o vuoto>","prova":"<frase copiata o vuoto>","motivo":"<una riga>"}]}`;

type RispostaAI = {
  occasioni?: { id?: string; tipo?: string; titolo?: string; prova?: string; motivo?: string }[];
};

export type EsitoLettura = {
  esaminati: number;
  riconosciuti: number;
  daPrecisare: number;
  senzaTesto: number;
  scartati: number;
  chiamate: number;
  errore?: string;
};

// Gli eventi su cui ha senso chiedere: tipo ancora da precisare, nessuno che
// l'abbia scritto a mano, e almeno un ordine con del testo dentro.
async function eventiDaLeggere(limite: number) {
  const eventi = await prisma.eventoCliente.findMany({
    where: { tipo: "da-precisare", tipoDa: { not: "manuale" }, stato: { not: "ignorato" } },
    orderBy: [{ ricorrenze: "desc" }, { ultimaSpesa: "desc" }],
    take: limite * 2, // se ne scartano parecchi per mancanza di testo
    select: { id: true, ordini: true, giorno: true, mese: true, destinatario: true },
  });

  const numeri = [...new Set(eventi.flatMap((e) => e.ordini.split(" ").filter(Boolean)))];
  if (numeri.length === 0) return [];
  const ordini = await prisma.ordine.findMany({
    where: { numero: { in: numeri } },
    select: { numero: true, biglietto: true, noteShopify: true },
  });
  const perNumero = new Map(ordini.map((o) => [o.numero, o]));

  const pronti: { id: string; quando: string; destinatario: string; testo: string }[] = [];
  for (const e of eventi) {
    // Il biglietto vero vale più della nota: la nota contiene di tutto.
    const testi = e.ordini
      .split(" ")
      .filter(Boolean)
      .map((n) => perNumero.get(n))
      .flatMap((o) => (o ? [o.biglietto, o.noteShopify] : []))
      .filter((t): t is string => typeof t === "string" && t.trim().length > 3);
    if (testi.length === 0) continue;
    pronti.push({
      id: e.id,
      quando: dataEvento(e.giorno, e.mese),
      destinatario: e.destinatario,
      testo: testi.join(" / ").replace(/\s+/g, " ").slice(0, 600),
    });
    if (pronti.length >= limite) break;
  }
  return pronti;
}

export async function leggiOccasioniDaiBiglietti(quanti = 100): Promise<EsitoLettura & { modello: string }> {
  const esito: EsitoLettura = {
    esaminati: 0,
    riconosciuti: 0,
    daPrecisare: 0,
    senzaTesto: 0,
    scartati: 0,
    chiamate: 0,
  };
  if (!aiConfigurata()) {
    esito.errore = "OpenAI non è configurata: manca OPENAI_API_KEY.";
    return { ...esito, modello: modelloAI() };
  }

  const daLeggere = await eventiDaLeggere(quanti);
  esito.esaminati = daLeggere.length;
  if (daLeggere.length === 0) return { ...esito, modello: modelloAI() };

  const validi = new Set<string>(TIPI_EVENTO.map((t) => t.chiave));
  const normalizza = (v: string): string | null => {
    const t = (v ?? "").trim().toLowerCase();
    if (!t) return null;
    if (validi.has(t)) return t;
    const perNome = TIPI_EVENTO.find((x) => x.nome.toLowerCase() === t);
    return perNome?.chiave ?? null;
  };

  for (let i = 0; i < daLeggere.length; i += PER_GIRO) {
    const blocco = daLeggere.slice(i, i + PER_GIRO);
    const domanda = blocco
      .map((e) => `- id: ${e.id} · ricorre il ${e.quando} · biglietto: "${e.testo}"`)
      .join("\n");

    const risposta = await chiediJson<RispostaAI>(domanda, { sistema: SISTEMA, temperatura: 0, timeout: 90 });
    esito.chiamate++;
    if (!risposta.ok) {
      esito.errore = risposta.errore;
      break;
    }

    const perId = new Map(blocco.map((b) => [b.id, b]));
    for (const o of risposta.dati?.occasioni ?? []) {
      const evento = o.id ? perId.get(o.id) : undefined;
      const tipo = normalizza(o.tipo ?? "");
      if (!evento || !tipo) {
        esito.scartati++;
        continue;
      }
      if (tipo === "da-precisare") {
        esito.daPrecisare++;
        // Si scrive comunque che l'AI ha guardato, altrimenti al giro dopo
        // si ripaga la stessa domanda per la stessa risposta.
        await prisma.eventoCliente.update({
          where: { id: evento.id },
          data: { tipoDa: "ai", motivoTipo: (o.motivo ?? "").slice(0, 200) || "Il testo non dice l'occasione." },
        });
        continue;
      }
      await prisma.eventoCliente.update({
        where: { id: evento.id },
        data: {
          tipo,
          tipoDa: "ai",
          titolo: (o.titolo ?? "").trim().slice(0, 120) || undefined,
          motivoTipo: (o.motivo ?? "").slice(0, 200) || null,
          prova: (o.prova ?? "").trim().slice(0, 200) || null,
        },
      });
      esito.riconosciuti++;
    }
  }

  return { ...esito, modello: modelloAI() };
}
