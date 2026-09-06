import { prisma } from "./db";
import { decifra } from "./cifratura";

// Squadre e persone lette da Deluxy Personale (GET /api/v1/team): è la casa
// dei dati HR, l'organico REALE (Standard §7: ogni dato ha una casa sola). Il
// Hub le mostra in /utenti per creare gli account senza tenersi una copia
// dell'organico — la fonte resta Personale, qui si legge e basta.
//
// Fino al 06/09/2026 la sezione leggeva da Budgets (il roster di
// pianificazione per anno di budget): l'utente ha deciso che «le persone del
// Hub devono arrivare da Personale». Personale espone /api/v1/team NELLO
// STESSO formato di Budgets, nato apposta per questo passaggio; le differenze
// sono dichiarate: niente anno, niente mesi in forza, niente colore di squadra,
// e in più l'EMAIL della persona — che è la lingua comune con gli utenti del
// portale, più affidabile del nome.
//
// La chiave è una chiave in ENTRATA di Personale (sola lettura basta). Si
// cerca in due posti: PRIMA la cassaforte /chiavi, poi l'ambiente
// (PERSONALE_API_KEY) come ripiego. È l'ordine inverso di posta.ts, ed è una
// scelta dell'utente (24/08/2026): questa chiave la gestisce lui dalla pagina
// Chiavi, e quello che scrive lì deve valere senza passare da Vercel. Nella
// cassaforte va bene sia il progetto «personale» (l'id del catalogo, quello
// che la pagina /chiavi suggerisce) sia «deluxy-personale» (il nome dell'app):
// un nome "sbagliato" dei due non deve costare un pomeriggio di debug.

export type PersonaOrganico = {
  id: string;
  nome: string;
  email: string | null;
  ruolo: string | null;
  tipo: string; // chiave del tipo di contratto, "" se non indicato
  tipoNome: string; // «Dipendente», «Stagista», «non indicato»…
  partTimePct: number;
};

export type TeamOrganico = {
  id: string;
  nome: string;
  responsabile: string | null;
  persone: PersonaOrganico[];
};

export type Organico =
  | {
      stato: "ok";
      team: TeamOrganico[];
      senzaTeam: PersonaOrganico[];
      totalePersone: number;
    }
  | { stato: "senza-chiave" }
  | { stato: "errore"; motivo: string };

export const NOME_CHIAVE_PERSONALE = "PERSONALE_API_KEY";
const PROGETTI_PERSONALE = ["personale", "deluxy-personale"];

async function chiavePersonale(): Promise<string | null> {
  const righe = await prisma.chiave.findMany({
    where: { progetto: { in: PROGETTI_PERSONALE } },
    select: { nome: true, valoreCifrato: true },
  });
  // Prima il nome canonico; se non c'è ma il progetto ha UNA voce sola, è lei.
  // In cassaforte i nomi sono spesso "umani" («Budget Key», 24/08/2026) e con
  // una voce sola non c'è ambiguità; con più voci senza il nome canonico non si
  // indovina — si torna al messaggio che spiega come chiamarla.
  const riga =
    righe.find((r) => r.nome === NOME_CHIAVE_PERSONALE) ?? (righe.length === 1 ? righe[0] : null);
  if (riga) {
    try {
      const valore = decifra(riga.valoreCifrato).trim();
      if (valore) return valore;
    } catch {
      // Cifrata con un altro segreto (HUB_CHIAVI_SECRET cambiato): vale come assente.
    }
  }

  // Ripiego: la variabile d'ambiente, per chi configura da Vercel o in locale.
  return (process.env.PERSONALE_API_KEY ?? "").trim() || null;
}

function urlPersonale(): string {
  // Lo stesso indirizzo a cui punta la tessera in home (apps.ts): i dati
  // mostrati devono venire dall'istanza che si apre cliccando.
  return (process.env.APP_URL_PERSONALE ?? "https://deluxy-personale.vercel.app").replace(/\/$/, "");
}

export async function organicoDaPersonale(): Promise<Organico> {
  const chiave = await chiavePersonale();
  if (!chiave) return { stato: "senza-chiave" };

  try {
    // Senza ?compensi=1: al Hub servono nomi, email e squadre, non gli
    // stipendi. Personale li tiene fuori di default proprio per questo.
    const res = await fetch(`${urlPersonale()}/api/v1/team`, {
      headers: { "x-api-key": chiave },
      cache: "no-store",
      // /utenti non deve restare appesa a Personale: se tarda, si rinuncia.
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) {
      const motivo =
        res.status === 401
          ? "Personale non riconosce la chiave in cassaforte (401): revocata o incollata male. Se ne genera una nuova da Personale → Chiavi delle app (sola lettura) e si aggiorna la voce in /chiavi"
          : `Personale risponde ${res.status}`;
      return { stato: "errore", motivo };
    }
    const dati = (await res.json()) as {
      team: TeamOrganico[];
      senzaTeam: PersonaOrganico[];
      totali: { persone: number };
    };
    return {
      stato: "ok",
      team: dati.team ?? [],
      senzaTeam: dati.senzaTeam ?? [],
      totalePersone: dati.totali?.persone ?? 0,
    };
  } catch {
    return { stato: "errore", motivo: "Personale non raggiungibile" };
  }
}

// Per riconoscere chi ha già un account: prima l'EMAIL (se Personale la
// conosce), poi il nome. Lo stesso nome scritto un po' diverso
// ("federica  zicchinella", "Federica Zicchinella") deve contare come uguale.
// Niente di più furbo: se non combacia, il rimedio è il bottone
// "Crea account" — un falso negativo costa un click, un falso positivo
// nasconderebbe una persona senza accesso.
export function nomeNormalizzato(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // via gli accenti: "Niccolò" == "Niccolo"
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function emailNormalizzata(email: string | null | undefined): string | null {
  const e = (email ?? "").trim().toLowerCase();
  return e || null;
}
