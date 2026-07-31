import "server-only";
import { prisma } from "./db";

// Chi può essere l'**account commerciale** di un'anagrafica.
//
// Il MASTER è Deluxy Budgets: l'organico nasce dal budget del personale, e lì
// il team «Commerciale» è già una cosa vera con dentro le persone. Tenerne una
// copia qui vorrebbe dire aggiornarla a mano ogni volta che qualcuno entra o
// esce — cioè non aggiornarla mai. Si legge da `GET /api/v1/team` (sola
// lettura, chiave `BUDGETS_API_KEY`), in cache 1h: l'organico cambia di rado.
//
// Oltre al team commerciale ci sono le persone che seguono anagrafiche pur non
// stando in quella squadra: in Budgets risultano **senza team** (Nicolò Donato
// è amministratore dell'app). Sono elencate qui perché è una scelta nostra, non
// un dato che Budgets possa sapere.
const SEMPRE_IN_ELENCO = ["Nicolò Donato"];

const BUDGETS = (process.env.BUDGETS_URL || "https://deluxy-budgets.vercel.app").replace(/\/$/, "");

type PersonaBudgets = { nome?: string };
type RispostaTeam = {
  team?: { nome?: string; responsabile?: string | null; persone?: PersonaBudgets[] }[];
  senzaTeam?: PersonaBudgets[];
};

function pulisci(nomi: (string | undefined | null)[]): string[] {
  const visti = new Set<string>();
  const out: string[] = [];
  for (const n of nomi) {
    const nome = (n ?? "").trim();
    if (!nome) continue;
    const chiave = nome.toLowerCase();
    if (visti.has(chiave)) continue;
    visti.add(chiave);
    out.push(nome);
  }
  return out;
}

// Nomi già in uso nel registro: sono la rete di sicurezza quando Budgets non
// risponde, e comunque non vanno persi (le anagrafiche vecchie hanno «ELEONORA»
// e simili, scritti a mano prima che ci fosse un elenco).
async function accountGiaUsati(): Promise<string[]> {
  const righe = await prisma.partner.findMany({
    where: { account: { not: null } },
    select: { account: true },
    distinct: ["account"],
    orderBy: { account: "asc" },
  });
  return pulisci(righe.map((r) => r.account));
}

export async function getCommerciali(): Promise<string[]> {
  const key = process.env.BUDGETS_API_KEY;
  let daBudgets: string[] = [];

  if (key) {
    try {
      const res = await fetch(`${BUDGETS}/api/v1/team`, {
        headers: { "x-api-key": key },
        next: { revalidate: 3600 },
        // Budgets non deve mai bloccare il form: se è lento si va di fallback.
        signal: AbortSignal.timeout(2500),
      });
      if (res.ok) {
        const json = (await res.json()) as RispostaTeam;
        const commerciale = (json.team ?? []).filter((t) => /commercial/i.test(t.nome ?? ""));
        const tutti = [...(json.team ?? []).flatMap((t) => t.persone ?? []), ...(json.senzaTeam ?? [])];
        // Le persone «sempre in elenco» si prendono con la grafia di Budgets
        // quando ci sono: così il nome salvato qui resta identico al loro.
        const extra = SEMPRE_IN_ELENCO.map(
          (n) => tutti.find((p) => (p.nome ?? "").trim().toLowerCase() === n.toLowerCase())?.nome ?? n,
        );
        daBudgets = pulisci([
          ...commerciale.flatMap((t) => [t.responsabile, ...(t.persone ?? []).map((p) => p.nome)]),
          ...extra,
        ]);
      }
    } catch {
      // silenzio: sotto c'è il fallback
    }
  }

  if (daBudgets.length) return daBudgets;
  // Fallback: chi è già account di qualche anagrafica, più le persone fisse.
  return pulisci([...(await accountGiaUsati()), ...SEMPRE_IN_ELENCO]);
}

// Elenco per il menu di una scheda: le persone di Budgets più il valore che
// quell'anagrafica ha già, anche se fuori elenco — chi non c'è più non deve
// sparire dal record aprendo la modifica.
export async function getOpzioniAccount(attuale?: string | null): Promise<string[]> {
  const elenco = await getCommerciali();
  const corrente = (attuale ?? "").trim();
  if (!corrente) return elenco;
  const gia = elenco.some((n) => n.toLowerCase() === corrente.toLowerCase());
  return gia ? elenco : [corrente, ...elenco];
}
