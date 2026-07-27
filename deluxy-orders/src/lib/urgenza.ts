// QUANTO TEMPO C'È FRA L'ORDINE E LA CONSEGNA.
//
// È la classificazione più operativa che esista in questo mestiere: un ordine
// da consegnare domani mattina e un ordine per un matrimonio fra tre settimane
// hanno lo stesso aspetto in una tabella, e non c'entrano niente l'uno con
// l'altro. Uno va lavorato adesso e non si può sbagliare; l'altro si può
// preparare con calma, ma se lo si dimentica il danno è peggiore.
//
// COME SI MISURA, e perché non in ore: la data di consegna che arriva da
// Shopify è **un giorno**, non un istante — la fascia oraria c'è solo qualche
// volta. Quindi si contano i **giorni di calendario** (ora italiana) fra il
// giorno dell'ordine e il giorno della consegna. Dire «23 ore e mezza» quando
// l'orario non lo sappiamo sarebbe precisione finta, ed è il tipo di numero che
// fa prendere decisioni sbagliate.

export type TipoUrgenza = {
  chiave: string;
  nome: string;
  spiega: string;
  colore: string;
  giorniMax: number | null; // fino a quanti giorni di anticipo (compreso)
};

export const URGENZE: TipoUrgenza[] = [
  {
    chiave: "urgenza",
    nome: "Urgenza",
    spiega: "Consegna lo stesso giorno o il giorno dopo: entro 24 ore.",
    colore: "var(--red)",
    giorniMax: 1,
  },
  {
    chiave: "pensiero",
    nome: "Pensiero",
    spiega: "Consegna entro 48 ore: qualcosa deciso al momento, ma non di corsa.",
    colore: "var(--orange)",
    giorniMax: 2,
  },
  {
    chiave: "pianificato",
    nome: "Pianificato",
    spiega: "Consegna entro 7 giorni: c'è il tempo di prepararlo bene.",
    colore: "var(--blue)",
    giorniMax: 7,
  },
  {
    chiave: "evento",
    nome: "Evento",
    spiega: "Consegna entro 30 giorni: una data fissata in anticipo — matrimoni, ricorrenze, feste.",
    colore: "var(--purple)",
    giorniMax: 30,
  },
  {
    chiave: "lontano",
    nome: "Molto in anticipo",
    spiega: "Consegna oltre 30 giorni: rarissimo, e vale la pena guardarlo (spesso è una data sbagliata).",
    colore: "var(--text-tertiary)",
    giorniMax: null,
  },
];

const PER_CHIAVE = new Map(URGENZE.map((u) => [u.chiave, u]));

export function urgenza(chiave: string | null | undefined): TipoUrgenza | null {
  return chiave ? (PER_CHIAVE.get(chiave) ?? null) : null;
}

export function nomeUrgenza(chiave: string | null | undefined): string {
  return urgenza(chiave)?.nome ?? "Consegna non indicata";
}

const FUSO = "Europe/Rome";
const MS_GIORNO = 86_400_000;

// Il giorno di calendario italiano di un istante, come numero di giorni
// dall'epoca: serve solo a fare la differenza fra due giorni.
function giornoItaliano(d: Date): number {
  const iso = new Intl.DateTimeFormat("sv-SE", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  return Math.floor(Date.parse(`${iso}T00:00:00Z`) / MS_GIORNO);
}

// Quanti giorni passano fra l'ordine e la consegna. `null` se manca la data.
export function giorniDiAnticipo(dataOrdine: Date, dataConsegna: Date | null): number | null {
  if (!dataConsegna) return null;
  // La data di consegna arriva senza orario (mezzanotte UTC): va letta come
  // giorno, non come istante, altrimenti il fuso la sposta di un giorno.
  const consegna = Math.floor(dataConsegna.getTime() / MS_GIORNO);
  return consegna - giornoItaliano(dataOrdine);
}

// La classificazione di un ordine. Stringa vuota = consegna non indicata: è
// un'assenza vera, e va lasciata visibile invece di essere messa nel mucchio
// dei «pianificati».
export function classificaUrgenza(dataOrdine: Date, dataConsegna: Date | null): string {
  const giorni = giorniDiAnticipo(dataOrdine, dataConsegna);
  if (giorni === null) return "";
  // Una consegna chiesta PRIMA della data dell'ordine è un dato sbagliato (o un
  // ordine registrato dopo): resta un'urgenza, che è la lettura più prudente.
  if (giorni < 0) return "urgenza";
  for (const u of URGENZE) {
    if (u.giorniMax !== null && giorni <= u.giorniMax) return u.chiave;
  }
  return "lontano";
}

// La stessa regola in SQL, per ricalcolare tutto l'archivio in una query invece
// che riga per riga. Deve restare identica a quella qui sopra: se cambia una,
// cambia l'altra.
export const SQL_URGENZA = `
  CASE
    WHEN "dataConsegna" IS NULL THEN ''
    WHEN ("dataConsegna"::date - ("data" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Rome')::date) <= 1 THEN 'urgenza'
    WHEN ("dataConsegna"::date - ("data" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Rome')::date) <= 2 THEN 'pensiero'
    WHEN ("dataConsegna"::date - ("data" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Rome')::date) <= 7 THEN 'pianificato'
    WHEN ("dataConsegna"::date - ("data" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Rome')::date) <= 30 THEN 'evento'
    ELSE 'lontano'
  END`;
