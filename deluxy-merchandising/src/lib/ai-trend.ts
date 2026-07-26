// Lettura AI del trend di vendita.
//
// Due principi, gli stessi delle altre app Deluxy che usano l'AI:
//
// 1. Il modello riceve SOLO numeri già calcolati dall'app (vendite.ts,
//    riordino.ts) e non ha mai il compito di calcolarli. Un modello che somma
//    sbaglia in silenzio: qui somma il database, il modello interpreta.
// 2. L'AI NON ESEGUE NULLA. Propone letture e azioni; ordinare, cambiare prezzi
//    o spostare prodotti resta un gesto umano, dentro le pagine dell'app.
//
// Chiave in OPENAI_API_KEY, modello in OPENAI_MODEL (default gpt-4o-mini).
// Senza chiave la pagina resta utile: mostra comunque il pacchetto di numeri
// che sarebbe stato mandato al modello.

import { prisma } from "./db";
import { etichettaCategoria } from "./dominio";
import { calcolaIpotesi, PARAMETRI_DEFAULT } from "./riordino";
import { analizzaVendite, delta } from "./vendite";

const MODELLO = (process.env.OPENAI_MODEL || "gpt-4o-mini").trim();

export function aiConfigurata(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export type Osservazione = {
  titolo: string;
  tipo: string; // cosa_va | cosa_non_va | da_capire | rischio
  spiegazione: string;
  numeri: string;
};

export type Azione = {
  titolo: string;
  perche: string;
  area: string; // assortimento | prezzo | riordino | visual | sviluppo
  priorita: string; // P0 | P1 | P2
};

export type Lettura = {
  sintesi: string;
  osservazioni: Osservazione[];
  azioni: Azione[];
  domande: string[];
};

export type DatiPerAI = {
  periodo: { giorni: number; dal: string; al: string };
  totali: {
    pezzi: number;
    ricavo: number;
    margine: number;
    marginePct: number;
    scontrinoMedio: number;
    variazionePezzi: string;
    variazioneRicavo: string;
    variazioneMargine: string;
  };
  qualitaDato: {
    righeVendute: number;
    giorniConVendite: number;
    ricavoNonAbbinato: number;
    ultimaVendita: string | null;
  };
  prodotti: {
    nome: string;
    codice: string;
    collezione: string | null;
    categoria: string;
    pezzi: number;
    ricavo: number;
    marginePct: number;
    variazionePezzi: string;
    tendenza: string;
  }[];
  collezioni: { nome: string; ricavo: number; quota: number; variazione: string }[];
  categorie: { nome: string; ricavo: number; quota: number; variazione: string }[];
  canali: { nome: string; ricavo: number; quota: number; variazione: string }[];
  riordino: {
    parametri: typeof PARAMETRI_DEFAULT;
    articoliDaRiordinare: number;
    pezzi: number;
    costo: number;
    margineAtteso: number;
    inRottura: { nome: string; giacenza: number; coperturaGiorni: number | null; suggeriti: number }[];
    fermiConGiacenza: { nome: string; giacenza: number }[];
  };
};

/** Il pacchetto di numeri che va al modello (e che resta salvato con la lettura). */
export async function datiPerAI(giorni: number): Promise<DatiPerAI> {
  const [a, ip] = await Promise.all([analizzaVendite(giorni), calcolaIpotesi(PARAMETRI_DEFAULT)]);

  return {
    periodo: {
      giorni,
      dal: a.finestra.dal.toISOString().slice(0, 10),
      al: a.finestra.al.toISOString().slice(0, 10),
    },
    totali: {
      pezzi: a.totale.pezzi,
      ricavo: Math.round(a.totale.ricavo),
      margine: Math.round(a.totale.margine),
      marginePct: Math.round(a.totale.marginePct * 100),
      scontrinoMedio: Math.round(a.totale.scontrino),
      variazionePezzi: delta(a.delta.pezzi),
      variazioneRicavo: delta(a.delta.ricavo),
      variazioneMargine: delta(a.delta.margine),
    },
    qualitaDato: {
      righeVendute: a.totaleRighe,
      giorniConVendite: a.giorniConVendite,
      ricavoNonAbbinato: Math.round(a.ricavoNonAbbinato),
      ultimaVendita: a.ultimaVendita ? a.ultimaVendita.toISOString().slice(0, 10) : null,
    },
    prodotti: a.prodotti.slice(0, 30).map((p) => ({
      nome: p.nome,
      codice: p.codice,
      collezione: p.collezione,
      categoria: etichettaCategoria(p.categoria),
      pezzi: p.pezzi,
      ricavo: Math.round(p.ricavo),
      marginePct: Math.round(p.marginePct * 100),
      variazionePezzi: delta(p.deltaPezzi),
      tendenza: p.tendenza,
    })),
    collezioni: a.collezioni.map((c) => ({
      nome: c.nome,
      ricavo: Math.round(c.ricavo),
      quota: Math.round(c.quota * 100),
      variazione: delta(c.delta),
    })),
    categorie: a.categorie.map((c) => ({
      nome: etichettaCategoria(c.nome),
      ricavo: Math.round(c.ricavo),
      quota: Math.round(c.quota * 100),
      variazione: delta(c.delta),
    })),
    canali: a.canali.map((c) => ({
      nome: c.nome,
      ricavo: Math.round(c.ricavo),
      quota: Math.round(c.quota * 100),
      variazione: delta(c.delta),
    })),
    riordino: {
      parametri: ip.parametri,
      articoliDaRiordinare: ip.totali.articoli,
      pezzi: ip.totali.pezzi,
      costo: Math.round(ip.totali.costo),
      margineAtteso: Math.round(ip.totali.margine),
      inRottura: ip.righe
        .filter((r) => r.urgenza === "rottura")
        .slice(0, 12)
        .map((r) => ({
          nome: r.nome,
          giacenza: r.giacenza,
          coperturaGiorni: r.coperturaAttuale,
          suggeriti: r.quantitaSuggerita,
        })),
      fermiConGiacenza: ip.righe
        .filter((r) => r.urgenza === "fermo" && r.giacenza > 0)
        .slice(0, 12)
        .map((r) => ({ nome: r.nome, giacenza: r.giacenza })),
    },
  };
}

const ISTRUZIONI = `Sei il direttore merchandising di Deluxy, maison di fiori e regali di lusso.
Leggi i numeri di vendita che ti vengono dati e scrivi una lettura da riunione: asciutta, concreta, in italiano.

Regole non negoziabili:
- NON calcolare né inventare numeri: usa solo quelli forniti, citandoli.
- Se un dato manca o è di scarsa qualità (poche righe, molto ricavo non abbinato a prodotto, storico corto), dillo invece di dedurre.
- Distingui il fatto ("le composizioni fanno il 38% del ricavo, +22%") dall'ipotesi ("probabilmente traina il gifting").
- Le azioni sono proposte per una persona, non ordini da eseguire: nessuna di esse verrà applicata in automatico.
- Niente entusiasmo di maniera, niente frasi da consulente.

Rispondi SOLO in JSON con questa forma:
{
  "sintesi": "3-5 frasi: come sta andando il prodotto nel periodo",
  "osservazioni": [{"titolo":"...","tipo":"cosa_va|cosa_non_va|da_capire|rischio","spiegazione":"...","numeri":"i numeri che la sostengono"}],
  "azioni": [{"titolo":"...","perche":"...","area":"assortimento|prezzo|riordino|visual|sviluppo","priorita":"P0|P1|P2"}],
  "domande": ["cosa serve sapere per decidere meglio"]
}
Da 4 a 7 osservazioni, da 3 a 6 azioni, da 1 a 4 domande.`;

export type EsitoLettura =
  | { ok: true; lettura: Lettura; modello: string; dati: DatiPerAI; id: string }
  | { ok: false; errore: string; configurata: boolean; dati: DatiPerAI };

/** Chiede la lettura al modello e la storicizza. */
export async function generaLettura(giorni: number): Promise<EsitoLettura> {
  const dati = await datiPerAI(giorni);

  if (!aiConfigurata()) {
    return {
      ok: false,
      configurata: false,
      errore:
        "Chiave OpenAI non configurata: aggiungi OPENAI_API_KEY alle variabili d'ambiente dell'app. I numeri qui sotto sono già pronti.",
      dati,
    };
  }

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODELLO,
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: ISTRUZIONI },
          { role: "user", content: JSON.stringify(dati) },
        ],
      }),
      signal: AbortSignal.timeout(90_000),
      cache: "no-store",
    });

    if (!res.ok) {
      const testo = await res.text().catch(() => "");
      throw new Error(
        res.status === 401
          ? "Chiave OpenAI rifiutata (401)."
          : `OpenAI ha risposto ${res.status}. ${testo.slice(0, 200)}`
      );
    }

    const corpo = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const contenuto = corpo.choices?.[0]?.message?.content;
    if (!contenuto) throw new Error("Risposta del modello vuota.");

    const grezza = JSON.parse(contenuto) as Partial<Lettura>;
    const lettura: Lettura = {
      sintesi: typeof grezza.sintesi === "string" ? grezza.sintesi : "",
      osservazioni: Array.isArray(grezza.osservazioni) ? (grezza.osservazioni as Osservazione[]) : [],
      azioni: Array.isArray(grezza.azioni) ? (grezza.azioni as Azione[]) : [],
      domande: Array.isArray(grezza.domande) ? (grezza.domande as string[]) : [],
    };
    if (!lettura.sintesi) throw new Error("Il modello non ha prodotto una sintesi leggibile.");

    const salvata = await prisma.letturaTrend.create({
      data: {
        dal: new Date(dati.periodo.dal),
        al: new Date(dati.periodo.al),
        modello: MODELLO,
        sintesi: lettura.sintesi,
        contenuto: JSON.stringify({
          osservazioni: lettura.osservazioni,
          azioni: lettura.azioni,
          domande: lettura.domande,
        }),
        dati: JSON.stringify(dati),
      },
    });

    return { ok: true, lettura, modello: MODELLO, dati, id: salvata.id };
  } catch (e) {
    return {
      ok: false,
      configurata: true,
      errore: e instanceof Error ? e.message : "Errore sconosciuto nella lettura AI.",
      dati,
    };
  }
}

/** Rilegge dal database una lettura storicizzata. */
export function ricomponi(riga: {
  sintesi: string;
  contenuto: string;
}): Lettura {
  try {
    const c = JSON.parse(riga.contenuto) as Omit<Lettura, "sintesi">;
    return {
      sintesi: riga.sintesi,
      osservazioni: c.osservazioni ?? [],
      azioni: c.azioni ?? [],
      domande: c.domande ?? [],
    };
  } catch {
    return { sintesi: riga.sintesi, osservazioni: [], azioni: [], domande: [] };
  }
}

export const ETICHETTA_TIPO_OSSERVAZIONE: Record<string, string> = {
  cosa_va: "Cosa va",
  cosa_non_va: "Cosa non va",
  da_capire: "Da capire",
  rischio: "Rischio",
};

export const COLORE_TIPO_OSSERVAZIONE: Record<string, string> = {
  cosa_va: "var(--green)",
  cosa_non_va: "var(--orange)",
  da_capire: "var(--blue)",
  rischio: "var(--red)",
};

export const COLORE_PRIORITA: Record<string, string> = {
  P0: "var(--red)",
  P1: "var(--orange)",
  P2: "var(--text-tertiary)",
};
