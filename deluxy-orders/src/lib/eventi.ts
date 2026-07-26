import { prisma } from "./db";

// EVENTI DEI CLIENTI — le occasioni per cui ordinano, lette dagli ordini.
//
// Un fioraio vende ricorrenze. Se lo stesso cliente manda qualcosa alla stessa
// persona più o meno nello stesso giorno di anni diversi, quello è un
// compleanno, un anniversario, una festa: l'informazione più utile che il
// registro possieda, e sta negli ordini da sempre.
//
// SI GUARDANO SOLO DATI STRUTTURATI: la **data di consegna** (l'attributo
// Shopify, mai il testo delle note) e il **destinatario** della spedizione.
// Quel che si festeggia NON si indovina: nessuno lo scrive in un ordine, e
// chiamare «compleanno» un anniversario di matrimonio è il genere di errore che
// poi si legge in un messaggio al cliente. Il tipo resta «da precisare» finché
// non lo scrive una persona.

// Due consegne appartengono alla stessa occasione se cadono entro questi giorni
// l'una dall'altra. Sette: un mazzo può arrivare il sabato prima o il lunedì
// dopo, ma non due settimane dopo.
export const GIORNI_VICINI = 7;

// I motivi per cui si manda qualcosa. Sono più di quattro perché in questo
// mestiere fanno differenza: mandare gli auguri a chi ha avuto un lutto è
// l'errore che non si recupera, e «condoglianze» esiste in elenco proprio per
// poterlo riconoscere e tenerlo fuori da qualunque automazione allegra.
export const TIPI_EVENTO = [
  { chiave: "da-precisare", nome: "Da precisare", colore: "var(--text-secondary)" },
  { chiave: "compleanno", nome: "Compleanno", colore: "var(--purple)" },
  { chiave: "anniversario", nome: "Anniversario", colore: "var(--gold-strong)" },
  { chiave: "matrimonio", nome: "Matrimonio", colore: "var(--gold)" },
  { chiave: "nascita", nome: "Nascita o battesimo", colore: "var(--green)" },
  { chiave: "laurea", nome: "Laurea o traguardo", colore: "var(--blue)" },
  { chiave: "ricorrenza", nome: "Festa o ricorrenza", colore: "var(--orange)" },
  { chiave: "ringraziamento", nome: "Ringraziamento", colore: "var(--text-secondary)" },
  { chiave: "condoglianze", nome: "Condoglianze", colore: "var(--red)" },
  { chiave: "altro", nome: "Altro", colore: "var(--text-tertiary)" },
] as const;

// I motivi a cui NON si scrive un messaggio commerciale allegro. Le automazioni
// li devono saltare: un «ti aspettiamo, torna a ordinare» sull'anniversario di
// un lutto è un danno che nessuna vendita ripaga.
export const TIPI_DELICATI = ["condoglianze"];

export function nomeTipoEvento(t: string): string {
  return TIPI_EVENTO.find((x) => x.chiave === t)?.nome ?? t;
}
export function coloreTipoEvento(t: string): string {
  return TIPI_EVENTO.find((x) => x.chiave === t)?.colore ?? "var(--text-secondary)";
}

export const STATI_EVENTO = [
  { chiave: "da-confermare", nome: "Da confermare", colore: "var(--orange)" },
  { chiave: "confermato", nome: "Confermato", colore: "var(--green)" },
  { chiave: "ignorato", nome: "Ignorato", colore: "var(--text-tertiary)" },
] as const;

export function nomeStatoEvento(s: string): string {
  return STATI_EVENTO.find((x) => x.chiave === s)?.nome ?? s;
}
export function coloreStatoEvento(s: string): string {
  return STATI_EVENTO.find((x) => x.chiave === s)?.colore ?? "var(--text-secondary)";
}

const MESI = [
  "", "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
  "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
];

export function dataEvento(giorno: number, mese: number): string {
  return `${giorno} ${MESI[mese] ?? ""}`.trim();
}

// Fra quanti giorni ricorre, a partire da oggi (0 = oggi). Si guarda avanti di
// un anno: passato il giorno, il prossimo è l'anno dopo.
export function fraQuantiGiorni(giorno: number, mese: number, da = new Date()): number {
  const oggi = Date.UTC(da.getUTCFullYear(), da.getUTCMonth(), da.getUTCDate());
  for (const anno of [da.getUTCFullYear(), da.getUTCFullYear() + 1]) {
    const quando = Date.UTC(anno, mese - 1, giorno);
    if (quando >= oggi) return Math.round((quando - oggi) / 86_400_000);
  }
  return 366;
}

export function quandoLeggibile(giorni: number): string {
  if (giorni === 0) return "oggi";
  if (giorni === 1) return "domani";
  if (giorni < 30) return `fra ${giorni} giorni`;
  if (giorni < 60) return "fra circa un mese";
  return `fra ${Math.round(giorni / 30)} mesi`;
}

// ---------------------------------------------------------------------------
// Rilevamento dagli ordini.

type OrdinePerEventi = {
  clienteEmail: string | null;
  clienteTelefono: string | null;
  clienteNome: string | null;
  spedizioneNome: string | null;
  citta: string | null;
  dataConsegna: Date | null;
  numero: string;
  totale: number;
};

// La stessa chiave cliente delle liste: email → telefono → nome.
function chiaveCliente(o: OrdinePerEventi): string {
  return (
    o.clienteEmail?.trim().toLowerCase() ||
    o.clienteTelefono?.trim() ||
    o.clienteNome?.trim().toLowerCase() ||
    ""
  );
}

export type EsitoRilevamento = {
  ordiniLetti: number;
  eventi: number;
  ricorrenti: number;
  nuovi: number;
  aggiornati: number;
};

// Scorre gli ordini e ricostruisce le occasioni. È idempotente: rilanciarlo
// aggiorna gli eventi esistenti (chiave + destinatario + giorno) invece di
// crearne di nuovi, e **non tocca** ciò che una persona ha scritto — titolo,
// tipo, note e lo stato «confermato»/«ignorato» restano come li ha lasciati.
export async function rilevaEventi(): Promise<EsitoRilevamento> {
  const ordini = await prisma.ordine.findMany({
    where: { annullatoIl: null, dataConsegna: { not: null } },
    select: {
      clienteEmail: true,
      clienteTelefono: true,
      clienteNome: true,
      spedizioneNome: true,
      citta: true,
      dataConsegna: true,
      numero: true,
      totale: true,
    },
    orderBy: { dataConsegna: "asc" },
  });

  // Raggruppo per cliente + destinatario, poi per date vicine.
  type Consegna = { giorno: number; mese: number; giornoAnno: number; anno: number; numero: string; totale: number; citta: string };
  const gruppi = new Map<string, { chiave: string; destinatario: string; consegne: Consegna[] }>();

  for (const o of ordini) {
    const chiave = chiaveCliente(o);
    const d = o.dataConsegna;
    if (!chiave || !d) continue;
    const destinatario = (o.spedizioneNome ?? "").trim();
    const k = `${chiave}§${destinatario.toLowerCase()}`;
    const inizioAnno = Date.UTC(d.getUTCFullYear(), 0, 1);
    const giornoAnno = Math.floor(
      (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - inizioAnno) / 86_400_000,
    );
    const gruppo = gruppi.get(k) ?? { chiave, destinatario, consegne: [] };
    gruppo.consegne.push({
      giorno: d.getUTCDate(),
      mese: d.getUTCMonth() + 1,
      giornoAnno,
      anno: d.getUTCFullYear(),
      numero: o.numero,
      totale: o.totale,
      citta: o.citta ?? "",
    });
    gruppi.set(k, gruppo);
  }

  const esito: EsitoRilevamento = { ordiniLetti: ordini.length, eventi: 0, ricorrenti: 0, nuovi: 0, aggiornati: 0 };

  // Gli eventi già salvati, letti in una volta sola: sono ottomila, e farne
  // ottomila upsert uno per uno vuol dire minuti invece di secondi (è la stessa
  // lezione della sync degli ordini).
  const esistenti = new Map(
    (
      await prisma.eventoCliente.findMany({
        select: { id: true, chiave: true, destinatario: true, mese: true, giorno: true, ricorrenze: true, ultimoAnno: true, ordini: true },
      })
    ).map((e) => [`${e.chiave}§${e.destinatario.toLowerCase()}§${e.mese}§${e.giorno}`, e]),
  );
  const daCreare: {
    chiave: string; destinatario: string; mese: number; giorno: number; citta: string;
    ricorrenze: number; primoAnno: number; ultimoAnno: number; ordini: string; ultimaSpesa: number; origine: string;
  }[] = [];

  for (const gruppo of gruppi.values()) {
    // Ordino per giorno dell'anno e taglio dove il salto supera la soglia.
    const consegne = [...gruppo.consegne].sort((a, b) => a.giornoAnno - b.giornoAnno);
    const gruppetti: Consegna[][] = [];
    let corrente: Consegna[] = [];
    for (const c of consegne) {
      if (corrente.length && c.giornoAnno - corrente[corrente.length - 1].giornoAnno > GIORNI_VICINI) {
        gruppetti.push(corrente);
        corrente = [];
      }
      corrente.push(c);
    }
    if (corrente.length) gruppetti.push(corrente);

    for (const g of gruppetti) {
      // La data dell'evento è quella dell'ULTIMA volta: se la festa si è
      // spostata di un giorno, vale l'ultima abitudine, non la prima.
      const ultima = g.reduce((a, b) => (b.anno > a.anno ? b : a));
      const anni = [...new Set(g.map((c) => c.anno))].sort();
      const dati = {
        citta: ultima.citta,
        ricorrenze: anni.length,
        primoAnno: anni[0],
        ultimoAnno: anni[anni.length - 1],
        ordini: g.map((c) => c.numero).join(" "),
        ultimaSpesa: ultima.totale,
        origine: "dedotto",
      };

      const k = `${gruppo.chiave}§${gruppo.destinatario.toLowerCase()}§${ultima.mese}§${ultima.giorno}`;
      const esistente = esistenti.get(k);
      esito.eventi++;
      if (anni.length >= 2) esito.ricorrenti++;

      if (!esistente) {
        daCreare.push({
          chiave: gruppo.chiave,
          destinatario: gruppo.destinatario,
          mese: ultima.mese,
          giorno: ultima.giorno,
          ...dati,
        });
        esito.nuovi++;
        continue;
      }

      // Si riscrive solo se i fatti sono cambiati: un giro che non trova
      // niente di nuovo non deve toccare ottomila righe.
      const cambiato =
        esistente.ricorrenze !== dati.ricorrenze ||
        esistente.ultimoAnno !== dati.ultimoAnno ||
        esistente.ordini !== dati.ordini;
      if (cambiato) {
        // Solo i fatti: titolo, tipo, note e stato restano di chi li ha scritti.
        await prisma.eventoCliente.update({ where: { id: esistente.id }, data: dati });
        esito.aggiornati++;
      }
    }
  }

  // A blocchi: una createMany da ottomila righe supera i limiti del pooler.
  for (let i = 0; i < daCreare.length; i += 500) {
    await prisma.eventoCliente.createMany({ data: daCreare.slice(i, i + 500), skipDuplicates: true });
  }

  return esito;
}

// Riepilogo per la pagina e per il pulsante in Impostazioni.
export async function riepilogoEventi(): Promise<{
  totale: number;
  ricorrenti: number;
  daConfermare: number;
  prossimi30: number;
}> {
  const oggi = new Date();
  const mmdd = (d: Date) => (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
  const fra30 = new Date(Date.now() + 30 * 86_400_000);
  const [totale, ricorrenti, daConfermare, tutti] = await Promise.all([
    prisma.eventoCliente.count(),
    prisma.eventoCliente.count({ where: { ricorrenze: { gte: 2 } } }),
    prisma.eventoCliente.count({ where: { stato: "da-confermare" } }),
    prisma.eventoCliente.findMany({ where: { stato: { not: "ignorato" } }, select: { mese: true, giorno: true } }),
  ]);
  const inizio = mmdd(oggi);
  const fine = mmdd(fra30);
  const dentro = (e: { mese: number; giorno: number }) => {
    const v = e.mese * 100 + e.giorno;
    return fine >= inizio ? v >= inizio && v <= fine : v >= inizio || v <= fine;
  };
  return { totale, ricorrenti, daConfermare, prossimi30: tutti.filter(dentro).length };
}
