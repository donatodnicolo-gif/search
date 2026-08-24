import { moltiplicatore, type DatiAnno, type Livello } from "./calc";

// **I premi al raggiungimento**: a chi vanno, per cosa, e se il risultato c'è.
//
// ---- La regola che tiene in piedi tutto ----
//
// Un premio si misura **sullo scenario che si sta guardando**. Nel budget
// *sfidante* le vendite sono più alte, quindi più premi scattano — ed è giusto:
// è esattamente il senso di uno scenario più ambizioso, e un P&L che mostrasse
// gli stessi premi sui tre livelli nasconderebbe il loro costo proprio dove
// diventa vero.
//
// ⚠️ **Un obiettivo che l'app non sa misurare non è un obiettivo, è una nota.**
// Per questo i tipi sono quelli che i dati coprono davvero, e `MANUALE` esiste
// per gli altri — dichiarato come tale invece di far finta di calcolarlo.

// I tipi e le costanti stanno in `premi-tipi.ts` (senza database dentro), e si
// ri-esportano da qui: chi lavora sui premi lato server importa un file solo.
export * from "./premi-tipi";
import { type Premio, type PremioMisurato } from "./premi-tipi";

const mesiDel = (p: { dal: number; al: number }) => {
  const dal = Math.max(1, Math.min(12, p.dal));
  const al = Math.max(dal, Math.min(12, p.al));
  return Array.from({ length: al - dal + 1 }, (_, i) => dal + i);
};

// Le vendite di un periodo, **alla stessa base del conto economico**: sul D2C
// entra la quota che resta a Deluxy, non il prezzo pieno. Un obiettivo scritto
// sul venduto lordo e misurato sul netto (o viceversa) farebbe scattare o
// mancare i premi per una ragione che non c'entra col lavoro di nessuno.
function venditeMaison(dati: DatiAnno, slug: string | null, mesi: number[], molt: number, quotaD2C: number) {
  return dati.maisons
    .filter((m) => (slug ? m.slug === slug : true))
    .reduce(
      (s, m) =>
        s +
        m.mesi
          .filter((x) => mesi.includes(x.month))
          .reduce(
            (a, x) =>
              a +
              Object.entries(x.vendite).reduce(
                (b, [tip, v]) => b + v * molt * (tip === "D2C" ? quotaD2C : 1),
                0
              ),
            0
          ),
      0
    );
}

function venditeLinea(dati: DatiAnno, id: string | null, mesi: number[], molt: number) {
  return dati.linee
    .filter((l) => (id ? l.id === id : true))
    .reduce((s, l) => s + mesi.reduce((a, m) => a + (l.mesi[m - 1] ?? 0), 0) * molt, 0);
}

// ⚠️ **L'EBITDA arriva da fuori, non si calcola qui.** Un premio sull'EBITDA
// misurato dentro il conto economico che lo contiene sarebbe una ricorsione
// senza fondo. E non è un trucco per uscirne: nel conto economico il premio sta
// **sotto** l'EBITDA (EBITDA → premi → risultato netto), quindi misurarlo
// sull'EBITDA *prima dei premi* è anche la definizione giusta.
export function misuraPremi(
  dati: DatiAnno,
  premi: Premio[],
  livello: Livello,
  quotaD2C: number,
  ebitdaDelPeriodo: (mesi: number[]) => number,
  nomiTeam: Map<string, string>,
  nomiPersone: Map<string, string>
): PremioMisurato[] {
  const molt = moltiplicatore(dati, livello);

  return premi.map((p) => {
    const mesi = mesiDel(p);
    let risultato: number | null = null;

    if (p.obiettivoTipo === "VENDITE_AZIENDA") {
      risultato = venditeMaison(dati, null, mesi, molt, quotaD2C) + venditeLinea(dati, null, mesi, molt);
    } else if (p.obiettivoTipo === "VENDITE_MAISON") {
      risultato = venditeMaison(dati, p.obiettivoRif, mesi, molt, quotaD2C);
    } else if (p.obiettivoTipo === "VENDITE_LINEA") {
      risultato = venditeLinea(dati, p.obiettivoRif, mesi, molt);
    } else if (p.obiettivoTipo === "EBITDA") {
      risultato = ebitdaDelPeriodo(mesi);
    }

    const raggiunto = risultato === null ? null : risultato >= p.soglia;
    // Il riconoscimento a mano **vince sulla misura**, in tutt'e due i versi:
    // si può pagare un premio mancato di poco, o non pagarne uno scattato per
    // un motivo che i numeri non vedono. Ma resta una decisione visibile, non
    // un aggiustamento del calcolo.
    const costa = p.riconosciuto ?? raggiunto ?? false;

    const destinatario =
      p.ambito === "TEAM"
        ? nomiTeam.get(p.teamId ?? "") ?? "squadra non trovata"
        : p.ambito === "PERSONA"
          ? nomiPersone.get(p.dipendenteId ?? "") ?? "persona non trovata"
          : "Tutta l'azienda";

    return { ...p, risultato, raggiunto, costa, destinatario };
  });
}

// Quanto pesa sul conto economico di questo scenario: **solo i premi che
// scattano**. Provisionare anche quelli mancati gonfierebbe il costo di premi
// che nessuno prenderà; ignorarli tutti nasconderebbe il costo di quelli che
// invece si pagheranno.
export const costoPremi = (misurati: PremioMisurato[]) =>
  misurati.filter((p) => p.costa).reduce((s, p) => s + p.importo, 0);

