import { prisma } from "./db";
import { decifra } from "./cifratura";

// Squadre e persone lette da Deluxy Budgets (GET /api/v1/team): è lì che
// l'organico nasce, col budget del personale. Il Hub le mostra in /utenti per
// creare gli account senza tenersi una copia dell'organico — la fonte resta
// Budgets, qui si legge e basta.
//
// La chiave è la "chiave in ENTRATA" di Budgets (la stessa che usa Finance per
// le categorie di costo). Si cerca in due posti: PRIMA la cassaforte /chiavi,
// poi l'ambiente (BUDGETS_API_KEY) come ripiego. È l'ordine inverso di
// posta.ts, ed è una scelta dell'utente (24/08/2026): questa chiave la
// gestisce lui dalla pagina Chiavi, e quello che scrive lì deve valere senza
// passare da Vercel. Nella cassaforte va bene sia il progetto «deluxy-budgets»
// (dove Budgets stessa cerca le proprie chiavi) sia «budgets» (l'id del
// catalogo che la pagina /chiavi suggerisce): un nome "sbagliato" dei due non
// deve costare un pomeriggio di debug.

export type PersonaBudgets = {
  nome: string;
  ruolo: string | null;
  tipo: string; // DIPENDENTE | STAGISTA | CONSULENTE
  tipoNome: string;
  maison: string | null;
  // Mesi (1-12) in cui la persona è in forza: chi finisce a giugno non ha
  // bisogno di un account nuovo, e la pagina deve poterlo dire.
  mesi: number[];
  partTimePct: number;
};

export type TeamBudgets = {
  id: string;
  nome: string;
  responsabile: string | null;
  colore: string | null; // green | gold | blue | purple | orange | neutral
  persone: PersonaBudgets[];
};

export type Organico =
  | {
      stato: "ok";
      anno: number;
      team: TeamBudgets[];
      senzaTeam: PersonaBudgets[];
      totalePersone: number;
    }
  | { stato: "senza-chiave" }
  | { stato: "errore"; motivo: string };

async function chiaveBudgets(): Promise<string | null> {
  const righe = await prisma.chiave.findMany({
    where: { progetto: { in: ["deluxy-budgets", "budgets"] } },
    select: { nome: true, valoreCifrato: true },
  });
  // Prima il nome canonico; se non c'è ma il progetto ha UNA voce sola, è lei.
  // In cassaforte i nomi sono spesso "umani" («Budget Key», 24/08/2026) e con
  // una voce sola non c'è ambiguità; con più voci senza il nome canonico non si
  // indovina — si torna al messaggio che spiega come chiamarla.
  const riga =
    righe.find((r) => r.nome === "BUDGETS_API_KEY") ?? (righe.length === 1 ? righe[0] : null);
  if (riga) {
    try {
      const valore = decifra(riga.valoreCifrato).trim();
      if (valore) return valore;
    } catch {
      // Cifrata con un altro segreto (HUB_CHIAVI_SECRET cambiato): vale come assente.
    }
  }

  // Ripiego: la variabile d'ambiente, per chi configura da Vercel o in locale.
  return (process.env.BUDGETS_API_KEY ?? "").trim() || null;
}

function urlBudgets(): string {
  // Lo stesso indirizzo a cui punta la tessera in home (apps.ts): i dati
  // mostrati devono venire dall'istanza che si apre cliccando.
  return (process.env.APP_URL_BUDGETS ?? "https://deluxy-budgets.vercel.app").replace(/\/$/, "");
}

export async function organicoDaBudgets(): Promise<Organico> {
  const chiave = await chiaveBudgets();
  if (!chiave) return { stato: "senza-chiave" };

  try {
    const res = await fetch(`${urlBudgets()}/api/v1/team`, {
      headers: { "x-api-key": chiave },
      cache: "no-store",
      // /utenti non deve restare appesa a Budgets: se tarda, si rinuncia.
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) {
      const motivo =
        res.status === 401
          ? "Budgets non riconosce la chiave in cassaforte (401): revocata o incollata male. Se ne genera una nuova da Budgets → Configurazione → Chiavi (scope «lettura») e si aggiorna la voce in /chiavi"
          : `Budgets risponde ${res.status}`;
      return { stato: "errore", motivo };
    }
    const dati = (await res.json()) as {
      anno: number;
      team: TeamBudgets[];
      senzaTeam: PersonaBudgets[];
      totali: { persone: number };
    };
    return {
      stato: "ok",
      anno: dati.anno,
      team: dati.team ?? [],
      senzaTeam: dati.senzaTeam ?? [],
      totalePersone: dati.totali?.persone ?? 0,
    };
  } catch {
    return { stato: "errore", motivo: "Budgets non raggiungibile" };
  }
}

// Per riconoscere chi ha già un account: stesso nome scritto un po' diverso
// ("federica  zicchinella", "Federica Zicchinella") deve contare come uguale.
// Niente di più furbo: se il nome non combacia, il rimedio è il bottone
// "Crea account" — un falso negativo costa un click, un falso positivo
// nasconderebbe una persona senza accesso.
export function nomeNormalizzato(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // via gli accenti: "Niccolò" == "Niccolo"
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// "1-12" non si scrive: è l'anno intero, cioè il caso normale. Si etichetta
// solo chi c'è per un pezzo d'anno, perché è l'informazione che cambia la
// decisione (un account per chi ha già finito non serve).
export function etichettaMesi(mesi: number[]): string | null {
  if (!Array.isArray(mesi) || mesi.length === 0 || mesi.length === 12) return null;
  const NOMI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
  const ordinati = [...mesi].sort((a, b) => a - b);
  const primo = ordinati[0];
  const ultimo = ordinati[ordinati.length - 1];
  // Un intervallo contiguo si legge come tale; buchi in mezzo = si elencano i mesi.
  const contiguo = ordinati.length === ultimo - primo + 1;
  if (!contiguo) return ordinati.map((m) => NOMI[m - 1]).join(", ");
  if (primo === 1) return `fino a ${NOMI[ultimo - 1]}`;
  if (ultimo === 12) return `da ${NOMI[primo - 1]}`;
  return `${NOMI[primo - 1]}–${NOMI[ultimo - 1]}`;
}
