// Cartellino — regole di dominio (fusi orari, coppie entrata/uscita, durate).
// Niente accesso al database qui: solo funzioni pure, così si ragiona sulle ore
// senza dover simulare Prisma.

// Tutta l'azienda timbra in Italia, ma il server gira in UTC (Vercel): senza
// forzare il fuso, una timbratura delle 00:30 italiane finirebbe nel giorno
// prima e le ore del turno serale sarebbero sbagliate.
export const FUSO = "Europe/Rome";

export type Verso = "entrata" | "uscita";

export const TIPI_ASSENZA = ["ferie", "permesso", "malattia", "trasferta"] as const;
export type TipoAssenza = (typeof TIPI_ASSENZA)[number];

export const STATI_ASSENZA = ["in-attesa", "approvata", "respinta", "registrata"] as const;
export type StatoAssenza = (typeof STATI_ASSENZA)[number];

export const TIPO_INFO: Record<TipoAssenza, { etichetta: string; spiega: string }> = {
  ferie: { etichetta: "Ferie", spiega: "Giorni di ferie: li approva un amministratore." },
  permesso: {
    etichetta: "Permesso",
    spiega: "Ore o giorni di permesso: li approva un amministratore.",
  },
  malattia: {
    etichetta: "Malattia",
    spiega: "Non si chiede il permesso: si registra e si allega il certificato.",
  },
  trasferta: {
    etichetta: "Trasferta",
    spiega: "Giornate fuori sede: le approva un amministratore.",
  },
};

export const STATO_INFO: Record<StatoAssenza, { etichetta: string; classe: string }> = {
  "in-attesa": { etichetta: "In attesa", classe: "badge gold" },
  approvata: { etichetta: "Approvata", classe: "badge green" },
  respinta: { etichetta: "Respinta", classe: "badge red" },
  registrata: { etichetta: "Registrata", classe: "badge neutro" },
};

// La malattia si registra da sé (conta il certificato, non l'approvazione).
// Tutto il resto è una richiesta che aspetta una risposta.
export function statoIniziale(tipo: TipoAssenza): StatoAssenza {
  return tipo === "malattia" ? "registrata" : "in-attesa";
}

export function isTipoAssenza(x: string): x is TipoAssenza {
  return (TIPI_ASSENZA as readonly string[]).includes(x);
}

// ---------- Date e ore in fuso italiano ----------

// "YYYY-MM-DD" del momento indicato, letto in Italia. Il locale "sv-SE" dà
// esattamente questo formato senza doverlo ricomporre a mano.
export function giornoDi(d: Date): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: FUSO }).format(d);
}

export function oraDi(d: Date): string {
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: FUSO,
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function dataEstesa(d: Date): string {
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: FUSO,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(d);
}

export function dataBreve(d: Date): string {
  return new Intl.DateTimeFormat("it-IT", { timeZone: FUSO, dateStyle: "short" }).format(d);
}

// Un giorno "YYYY-MM-DD" diventa un istante UTC che rappresenta quella data.
// Le assenze sono giornate intere: si salva mezzogiorno UTC, che resta lo stesso
// giorno civile in Italia sia con l'ora solare sia con quella legale (mezzanotte
// no: d'estate scivolerebbe al giorno prima).
export function giornoAData(giorno: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(giorno)) return null;
  const d = new Date(`${giorno}T12:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function dataAGiorno(d: Date): string {
  return giornoDi(d);
}

// Il mese "YYYY-MM" di oggi, e i confini del mese come stringhe giorno: servono
// per filtrare le timbrature senza fare aritmetica sulle date in UTC.
export function meseDi(d: Date): string {
  return giornoDi(d).slice(0, 7);
}

export function confiniMese(mese: string): { primo: string; ultimo: string } | null {
  if (!/^\d{4}-\d{2}$/.test(mese)) return null;
  const [anno, m] = mese.split("-").map(Number);
  const giorniNelMese = new Date(Date.UTC(anno, m, 0)).getUTCDate();
  return { primo: `${mese}-01`, ultimo: `${mese}-${String(giorniNelMese).padStart(2, "0")}` };
}

export function meseEsteso(mese: string): string {
  const primo = giornoAData(`${mese}-01`);
  if (!primo) return mese;
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: FUSO,
    month: "long",
    year: "numeric",
  }).format(primo);
}

// Da "2026-08-05" + "09:30" (ora italiana) all'istante vero.
// Il server non è in Italia, quindi non si può usare `new Date("...T09:30")`:
// si parte dall'ora letta come UTC e si toglie lo scarto di Roma di quel giorno.
// Il calcolo si fa due volte perché nelle due notti del cambio d'ora lo scarto
// della prima passata può essere quello sbagliato.
export function istanteInItalia(giorno: string, hhmm: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(giorno) || !/^\d{2}:\d{2}$/.test(hhmm)) return null;
  const comeUtc = new Date(`${giorno}T${hhmm}:00.000Z`);
  if (Number.isNaN(comeUtc.getTime())) return null;

  let istante = new Date(comeUtc.getTime() - scartoRomaMinuti(comeUtc) * 60000);
  istante = new Date(comeUtc.getTime() - scartoRomaMinuti(istante) * 60000);
  return istante;
}

// Di quanti minuti Roma è avanti rispetto a UTC in quel momento (60 o 120).
function scartoRomaMinuti(d: Date): number {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: FUSO,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
    .formatToParts(d)
    .reduce<Record<string, string>>((acc, x) => {
      acc[x.type] = x.value;
      return acc;
    }, {});

  const comeSeUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour) === 24 ? 0 : Number(p.hour),
    Number(p.minute),
    Number(p.second),
  );
  return Math.round((comeSeUtc - d.getTime()) / 60000);
}

// ---------- Ore lavorate ----------

export type MarcaturaMinima = { verso: string; istante: Date };

export type Turno = { entrata: Date; uscita: Date | null };

// Accoppia le marcature di una giornata: entrata → uscita, in ordine di orario.
// Tollera i casi sporchi (due entrate di fila, un'uscita orfana) perché capitano
// davvero: una doppia entrata non apre due turni, un'uscita senza entrata si
// ignora invece di far esplodere il conteggio.
export function turniDelGiorno(marcature: readonly MarcaturaMinima[]): Turno[] {
  const ordinate = [...marcature].sort((a, b) => a.istante.getTime() - b.istante.getTime());
  const turni: Turno[] = [];
  for (const m of ordinate) {
    const aperto = turni.length > 0 && turni[turni.length - 1].uscita === null;
    if (m.verso === "entrata") {
      if (!aperto) turni.push({ entrata: m.istante, uscita: null });
    } else if (aperto) {
      turni[turni.length - 1].uscita = m.istante;
    }
  }
  return turni;
}

// Minuti lavorati in una giornata, più il fatto che ci sia un turno aperto: la
// pagina deve poter dire "sei dentro", non spacciare un turno aperto per chiuso.
// `adesso` è il momento a cui chiudere un turno ancora aperto — ha senso solo
// per la giornata di oggi. Per i giorni passati si passa `null`: un'uscita
// dimenticata la settimana scorsa vale zero minuti in più, non cento ore.
export function minutiLavorati(
  marcature: readonly MarcaturaMinima[],
  adesso: Date | null = new Date(),
): { minuti: number; aperto: boolean; dalle: Date | null } {
  const turni = turniDelGiorno(marcature);
  let minuti = 0;
  let aperto = false;
  let dalle: Date | null = null;

  for (const t of turni) {
    if (!t.uscita) {
      aperto = true;
      dalle = t.entrata;
    }
    const fine = t.uscita ?? adesso;
    if (!fine) continue; // turno aperto di un giorno passato: non si inventa la durata
    minuti += Math.max(0, Math.round((fine.getTime() - t.entrata.getTime()) / 60000));
  }
  return { minuti, aperto, dalle };
}

export function formattaDurata(minuti: number): string {
  if (minuti <= 0) return "—";
  const h = Math.floor(minuti / 60);
  const m = minuti % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${String(m).padStart(2, "0")}m`;
}

// Il prossimo gesto sensato: se l'ultimo verso è "entrata" tocca uscire.
export function prossimoVerso(ultimo: string | null | undefined): Verso {
  return ultimo === "entrata" ? "uscita" : "entrata";
}

// ---------- Assenze ----------

// Quanti giorni copre un'assenza, estremi inclusi. Conta i giorni di calendario:
// il Hub non conosce i turni di ciascuno, quindi non prova a indovinare quali
// sarebbero stati lavorativi.
export function giorniCoperti(dal: Date, al: Date): number {
  const a = Date.UTC(dal.getUTCFullYear(), dal.getUTCMonth(), dal.getUTCDate());
  const b = Date.UTC(al.getUTCFullYear(), al.getUTCMonth(), al.getUTCDate());
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1);
}

export function intervalloEsteso(dal: Date, al: Date): string {
  const g = giorniCoperti(dal, al);
  if (g === 1) return dataEstesa(dal);
  return `${dataBreve(dal)} → ${dataBreve(al)} (${g} giorni)`;
}

// ---------- Certificati ----------

export const MAX_CERTIFICATO_BYTE = 5 * 1024 * 1024; // 5 MB
export const MIME_CERTIFICATO = ["application/pdf", "image/jpeg", "image/png"] as const;

export function mimeAmmesso(mime: string): boolean {
  return (MIME_CERTIFICATO as readonly string[]).includes(mime);
}

export function pesoLeggibile(byte: number): string {
  if (byte < 1024) return `${byte} B`;
  if (byte < 1024 * 1024) return `${Math.round(byte / 1024)} KB`;
  return `${(byte / (1024 * 1024)).toFixed(1)} MB`;
}
