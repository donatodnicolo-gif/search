import { prisma } from "./db";
import { clienteSingolo, whereOrdiniCliente } from "./clienti";
import { nomeCategoria } from "./categorie";
import { nomeSegmento, nomeTipologia } from "./segmenti";
import { aiConfigurata, chiediJson, modelloAI } from "./ai";
import { euro, dataBreve } from "./ordini";

// IL RIEPILOGO DI UN CLIENTE, scritto dall'AI leggendo i suoi ordini.
//
// A cosa serve: aprire una scheda e capire in dieci secondi chi è questa
// persona, cosa compra, per chi e cosa le piace — le stesse cose che un
// negoziante di quartiere sa a memoria dei suoi clienti abituali, e che qui
// erano sparse in venti righe d'ordine.
//
// TRE COSE, non una:
//  1. il **riassunto** in prosa, poche righe;
//  2. i **punti**, uno per ordine: la storia in ordine di tempo. A ogni ordine
//     nuovo se ne aggiunge uno, i vecchi restano come sono — così due letture a
//     distanza di mesi non si contraddicono;
//  3. **preferenze e gusti**: cosa compra, per chi, in che fascia di prezzo. È
//     la parte che serve davvero a vendere bene.
//
// Le solite regole dell'AI in questa app: legge SOLO i dati veri che le passiamo
// (prodotti, date, destinatari, importi, biglietti), non inventa numeri, e se
// una cosa non si capisce dagli ordini deve dirlo invece di riempire il vuoto.
//
// COSA ESCE DALL'AZIENDA: i titoli dei prodotti, le date, gli importi, i nomi
// dei destinatari e il testo dei biglietti di QUEL cliente. Non l'email, non il
// telefono, non l'indirizzo.

export const MAX_ORDINI = 24; // oltre, si mandano i più recenti: la storia recente conta di più

const SISTEMA = `Sei l'assistente di un negozio italiano di regali di lusso (fiori, colazioni a domicilio, torte, dolci, sushi, bollicine).
Ti do gli ordini VERI di un cliente. Scrivi un riepilogo per chi lo deve servire o contattare.

Rispondi in JSON:
{
 "riassunto": "2-4 frasi in italiano: chi è questo cliente per noi, come compra, per chi",
 "punti": ["una riga per ordine importante, con la data e cosa ha preso e per chi"],
 "gusti": "cosa gli piace: categorie e prodotti che ripete, fascia di prezzo, destinatari abituali, occasioni"
}

Regole:
- **usa solo quello che ti do**: non inventare prodotti, date, importi o preferenze. Se gli ordini non bastano a dire i gusti, scrivi che sono pochi ordini per dirlo;
- niente marketing e niente aggettivi da brochure: frasi asciutte, come le direbbe un collega;
- i **gusti** sono la parte più utile: se ripete lo stesso prodotto, la stessa categoria o lo stesso destinatario, dillo con i nomi veri;
- se manda sempre alla stessa persona, o sempre a persone diverse, dillo: cambia il modo di scrivergli;
- se compra solo in certi periodi dell'anno (Natale, San Valentino, un compleanno) dillo;
- non dare del tu al cliente e non scrivere un messaggio da mandargli: questo è un appunto interno.`;

type RispostaAI = { riassunto?: string; punti?: string[]; gusti?: string };

export type EsitoRiepilogo = {
  ok: boolean;
  ordini: number;
  errore?: string;
};

// Gli ordini di un cliente, ridotti a quello che serve all'AI.
async function ordiniPerRiepilogo(chiave: string) {
  return prisma.ordine.findMany({
    where: { ...whereOrdiniCliente(chiave), annullatoIl: null },
    orderBy: { data: "desc" },
    take: MAX_ORDINI,
    select: {
      numero: true,
      brand: true,
      data: true,
      dataConsegna: true,
      totale: true,
      valuta: true,
      spedizioneNome: true,
      citta: true,
      categorie: true,
      biglietto: true,
      righe: { select: { titolo: true, quantita: true } },
    },
  });
}

// Scrive (o aggiorna) il riepilogo di un cliente.
// Con `rifai` si riparte da zero: serve quando il riepilogo esistente non
// convince e si vuole rileggere tutta la storia invece di accodarci un punto.
export async function riepilogaCliente(
  chiave: string,
  opzioni: { rifai?: boolean } = {},
): Promise<EsitoRiepilogo> {
  if (!aiConfigurata()) {
    return { ok: false, ordini: 0, errore: "OpenAI non è configurata: manca OPENAI_API_KEY." };
  }

  const [cliente, ordini, precedente] = await Promise.all([
    clienteSingolo(chiave),
    ordiniPerRiepilogo(chiave),
    prisma.riepilogoCliente.findUnique({ where: { chiave } }),
  ]);
  const esistente = opzioni.rifai ? null : precedente;
  if (!cliente || ordini.length === 0) {
    return { ok: false, ordini: 0, errore: "Questo cliente non ha ordini validi da riassumere." };
  }

  // Se il riepilogo c'è già, si chiede di CONTINUARLO: i punti vecchi restano e
  // l'AI ne aggiunge uno per ogni ordine arrivato dopo. Riscrivere tutto da capo
  // ogni volta costerebbe di più e cambierebbe le parole di cose già lette.
  const nuovi = esistente
    ? ordini.filter((o) => !esistente.ultimoOrdine || o.data > esistente.ultimoOrdine)
    : ordini;
  if (esistente && nuovi.length === 0) {
    return { ok: true, ordini: esistente.ordiniConsiderati, errore: "Nessun ordine nuovo: il riepilogo è già aggiornato." };
  }

  const daRaccontare = esistente ? nuovi : ordini;
  const righeOrdini = [...daRaccontare]
    .sort((a, b) => a.data.getTime() - b.data.getTime())
    .map((o) => {
      const prodotti = o.righe.map((r) => `${r.quantita}× ${r.titolo}`).join(", ");
      const cat = o.categorie
        ? o.categorie.split(" ").filter(Boolean).map(nomeCategoria).join("/")
        : "categoria non classificata";
      const biglietto = o.biglietto ? ` · biglietto: "${o.biglietto.replace(/\s+/g, " ").slice(0, 140)}"` : "";
      const consegna = o.dataConsegna ? ` · consegna ${dataBreve(o.dataConsegna)}` : "";
      const a = o.spedizioneNome ? ` · a ${o.spedizioneNome}${o.citta ? ` (${o.citta})` : ""}` : "";
      return `- ${dataBreve(o.data)} · ${o.numero} · ${o.brand} · ${euro(o.totale, o.valuta)} · ${cat} · ${prodotti}${a}${consegna}${biglietto}`;
    })
    .join("\n");

  const scheda = [
    `Cliente: ${cliente.nome ?? "senza nome"} · ${nomeTipologia(cliente.tipologia)} · segmento ${nomeSegmento(cliente.segmento)}`,
    `In totale: ${cliente.ordini} ordini, ${euro(cliente.speso)} spesi, ordine medio ${euro(cliente.medio)}, ultimo ordine ${dataBreve(cliente.ultimoOrdine)} (${cliente.giorni} giorni fa)`,
    cliente.citta ? `Città: ${cliente.citta}` : "",
    cliente.brand.length ? `Negozi: ${cliente.brand.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const domanda = esistente
    ? `${scheda}\n\nRiepilogo già scritto (da aggiornare, NON riscrivere i punti vecchi):\n"""\n${esistente.testo}\n"""\nPunti già scritti:\n${esistente.punti}\n\nOrdini NUOVI da aggiungere:\n${righeOrdini}\n\nRestituisci: il riassunto aggiornato, SOLO i punti nuovi (uno per ordine nuovo), e i gusti aggiornati con quello che si è capito adesso.`
    : `${scheda}\n\nI suoi ordini (dal più vecchio):\n${righeOrdini}`;

  const risposta = await chiediJson<RispostaAI>(domanda, { sistema: SISTEMA, temperatura: 0.2, timeout: 90 });
  if (!risposta.ok) return { ok: false, ordini: ordini.length, errore: risposta.errore };

  const puntiNuovi = (risposta.dati?.punti ?? [])
    .filter((p) => typeof p === "string" && p.trim())
    .map((p) => p.trim().replace(/^[-•]\s*/, ""));
  // I punti vecchi restano, i nuovi si accodano: il riepilogo cresce con la
  // storia del cliente invece di essere riscritto ogni volta.
  const punti = esistente ? [esistente.punti, ...puntiNuovi].filter(Boolean).join("\n") : puntiNuovi.join("\n");

  const dati = {
    testo: (risposta.dati?.riassunto ?? "").trim().slice(0, 2000),
    punti: punti.slice(0, 6000),
    gusti: (risposta.dati?.gusti ?? "").trim().slice(0, 1500),
    ordiniConsiderati: cliente.ordini,
    ultimoOrdine: cliente.ultimoOrdine,
    modello: modelloAI(),
  };

  await prisma.riepilogoCliente.upsert({
    where: { chiave },
    create: { chiave, ...dati },
    update: dati,
  });
  return { ok: true, ordini: daRaccontare.length };
}

// Riepiloghi in blocco: i clienti che valgono di più e non ce l'hanno ancora.
// Con un limite esplicito, perché ogni cliente è una chiamata a pagamento e
// 10.000 clienti non si riassumono «per sbaglio».
// Il tempo, non solo il numero, è un limite vero: una funzione serverless viene
// uccisa dopo qualche decina di secondi. Meglio fermarsi da soli e dire quanti
// se ne sono fatti, che essere interrotti a metà senza un messaggio.
const SECONDI_MAX = 50;

export async function riepilogaClientiMancanti(quanti = 20): Promise<{
  fatti: number;
  saltati: number;
  fermato?: boolean;
  errore?: string;
}> {
  const inizio = Date.now();
  const { elencoClienti } = await import("./clienti");
  const candidati = await elencoClienti(undefined, "speso", 0, Math.min(200, quanti * 3));
  const giaFatti = new Set(
    (
      await prisma.riepilogoCliente.findMany({
        where: { chiave: { in: candidati.map((c) => c.chiave) } },
        select: { chiave: true },
      })
    ).map((r) => r.chiave),
  );

  let fatti = 0;
  let saltati = 0;
  for (const c of candidati) {
    if (fatti >= quanti) break;
    if ((Date.now() - inizio) / 1000 > SECONDI_MAX) return { fatti, saltati, fermato: true };
    if (giaFatti.has(c.chiave)) {
      saltati++;
      continue;
    }
    const esito = await riepilogaCliente(c.chiave);
    if (esito.ok) fatti++;
    else if (esito.errore?.includes("OpenAI")) return { fatti, saltati, errore: esito.errore };
    else saltati++;
  }
  return { fatti, saltati };
}
