// **Cosa c'è dentro una voce di bilancio.**
//
// Il conto economico mostra sette numeri grossi. Il problema di sette numeri
// grossi è che nessuno sa da cosa sono fatti: un B6 di 349.377 € contro i
// 42.299 € del bilancio 2024 si vede subito che è sbagliato, ma per capire
// *perché* bisognava aprire il CFO, cercare le categorie con quella voce di
// bilancio e sommarle a mente. Questo modulo fa quella somma al contrario:
// dato un codice, dice quali categorie lo compongono e con quali controparti.
//
// Due cose vanno tenute distinte, e sono il motivo per cui questo file esiste:
//  - le categorie **decise** da qualcuno (voceCE impostata) e quelle **dedotte**
//    dal tipo di P&L, che nessuno ha ancora confermato;
//  - dentro ogni categoria, le controparti prese da una **regola** e quelle
//    cadute nel **residuo** della categoria predefinita. Le seconde non sono
//    classificate: stanno lì perché dovevano stare da qualche parte.
//
// Le voci che non nascono dalla banca (i ricavi, il personale, gli
// ammortamenti) hanno un'altra provenienza, e il modulo la dichiara invece di
// mostrare un dettaglio vuoto che sembrerebbe «nessun movimento».

import { caricaCategorie, ricostruisci, voceCEPredefinita, type Categoria } from "./cfo";
import { fetchConsuntivo, fetchSpeseBanca } from "./finance";
import { fetchRicaviD2C } from "./orders";
import { raggruppa, fatturatoDaVenduto, QUOTA_STIMATA } from "./venduto";
import { misuraQuota } from "./quota";
import { caricaAnno, costoPersonaAnno } from "./calc";
import { SCHEMA } from "./bilancio-voci";

export type Controparte = { controparte: string; uscite: number; daRegola: boolean };

export type CategoriaVoce = {
  id: string;
  nome: string;
  descrizione: string | null;
  tipoPL: string;
  voceCE: string;
  voceCEImpostata: boolean; // false = dedotta da tipoPL, mai confermata
  predefinita: boolean;
  quotaPartner: boolean;
  uscite: number;
  movimenti: number;
  residuo: number; // quanto è arrivato qui senza che una regola lo dicesse
  controparti: Controparte[];
};

// Una voce alimentata da una fonte che non è la banca: il fatturato di Finance,
// il venduto ecommerce, il roster dei dipendenti. Non ha categorie da
// riassegnare — si dice da dove viene e si linka dove si cambia.
export type RigaFonte = { nome: string; importo: number; fonte: string; dove?: string };

export type DettaglioVoce = {
  codice: string;
  nome: string;
  aiuto?: string;
  anno: number;
  // Etichetta del periodo, quando il dettaglio non è su tutto l'anno (il
  // consuntivo si guarda a YTD, a trimestre, a semestre).
  periodo?: string;
  // Da dove arriva questa voce. `nessuna` non è un errore: gli ammortamenti non
  // passano dalla banca, e dirlo è più utile di una tabella vuota.
  origine: "banca" | "ricavi" | "personale" | "nessuna";
  totale: number;
  categorie: CategoriaVoce[];
  righe: RigaFonte[];
  // Perché l'app non può ricostruire questa voce, quando non può.
  spiegazione: string | null;
  avvisi: string[];
};

const VOCI_DI_BANCA = ["B6", "B7", "B8", "B14", "C17", "IMPOSTE", "ESCLUSA"];

// Le categorie che confluiscono in una voce di bilancio, con i loro importi.
// `ESCLUSA` non è una voce di legge ma si guarda allo stesso modo: è dove
// finisce quello che si è deciso di tenere fuori dal conto economico — le
// partite di giro coi partner, per esempio — e chi controlla un bilancio ha
// bisogno di vedere cosa è stato tolto tanto quanto cosa è rimasto.
function categorieDellaVoce(
  codice: string,
  righe: ReturnType<typeof ricostruisci>,
  categorie: Categoria[]
): CategoriaVoce[] {
  const perId = new Map(categorie.map((c) => [c.id, c] as const));
  const out: CategoriaVoce[] = [];
  for (const r of righe) {
    if (!r.categoria) continue;
    const cat = perId.get(r.categoria.id) ?? r.categoria;
    const voce = cat.voceCE ?? voceCEPredefinita(cat.tipoPL);
    if (voce !== codice) continue;
    out.push({
      id: cat.id,
      nome: cat.nome,
      descrizione: cat.descrizione,
      tipoPL: cat.tipoPL,
      voceCE: voce,
      voceCEImpostata: cat.voceCEImpostata,
      predefinita: cat.predefinita,
      quotaPartner: cat.quotaPartner,
      uscite: r.uscite,
      movimenti: r.movimenti,
      residuo: r.residuo,
      controparti: r.controparti.map((c) => ({
        controparte: c.controparte,
        uscite: c.uscite,
        daRegola: c.daRegola,
      })),
    });
  }
  return out.sort((a, b) => b.uscite - a.uscite);
}

export async function dettaglioVoce(anno: number, codice: string): Promise<DettaglioVoce> {
  const voce = SCHEMA.find((v) => v.codice === codice);
  const base: DettaglioVoce = {
    codice,
    nome: voce?.nome ?? (codice === "ESCLUSA" ? "Fuori dal conto economico" : codice),
    aiuto: voce?.aiuto,
    anno,
    origine: "nessuna",
    totale: 0,
    categorie: [],
    righe: [],
    spiegazione: null,
    avvisi: [],
  };

  // ---- Le voci di costo: si ricostruiscono dalle uscite di banca ----
  if (VOCI_DI_BANCA.includes(codice)) {
    const [spese, categorie] = await Promise.all([
      fetchSpeseBanca({ anno, dal: 1, al: 12 }),
      caricaCategorie(),
    ]);
    if (!spese.ok) {
      return { ...base, origine: "banca", spiegazione: `Le uscite di banca non sono disponibili: ${spese.errore}` };
    }
    const cats = categorieDellaVoce(codice, ricostruisci(spese.dati.controparti, categorie), categorie);
    const totale = cats.reduce((s, c) => s + c.uscite, 0);
    const residuo = cats.reduce((s, c) => s + c.residuo, 0);
    const avvisi: string[] = [];
    const dedotte = cats.filter((c) => !c.voceCEImpostata);
    if (dedotte.length > 0) {
      avvisi.push(
        `${dedotte.length} categorie stanno qui perché la voce di bilancio è stata **dedotta** dal tipo di P&L, non scelta da nessuno: ${dedotte.map((c) => c.nome).join(", ")}. Confermarla o spostarla si fa da questa tabella.`
      );
    }
    if (residuo > 0) {
      avvisi.push(
        `${Math.round(residuo).toLocaleString("it-IT")} € sono finiti qui senza che nessuna regola lo dicesse: li ha raccolti la categoria predefinita. Sono elencati sotto e si possono assegnare una a una.`
      );
    }
    return { ...base, origine: "banca", totale, categorie: cats, avvisi };
  }

  // ---- I ricavi: Finance per il fatturato, Orders per l'ecommerce ----
  if (codice === "A1" || codice === "A5") {
    const dati = await caricaAnno(anno);
    const mesi = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const [fatt, ordini] = await Promise.all([
      fetchConsuntivo({ anno, dal: 1, al: 12, stato: "tutte" }),
      fetchRicaviD2C(anno),
    ]);
    const righe: RigaFonte[] = [];
    const avvisi: string[] = [];
    if (fatt.ok) {
      for (const t of fatt.dati.tipologie) {
        if (t.imponibile <= 0) continue;
        righe.push({
          nome: t.tipologia,
          importo: t.imponibile,
          fonte: `fatturato in Finance — ${t.fatture} fatture, imponibile`,
        });
      }
    } else {
      avvisi.push(`Il fatturato di Finance non è disponibile: ${fatt.errore}`);
    }

    const vend = raggruppa(ordini, dati.maisons);
    const venduto = vend.mese.reduce((s, x) => s + x, 0);
    if (venduto > 0) {
      const quota = await misuraQuota(anno, mesi, vend.mese);
      righe.push({
        nome: "Vendite ecommerce — quota che resta a Deluxy",
        importo: fatturatoDaVenduto(venduto, quota),
        fonte: `venduto ${Math.round(venduto).toLocaleString("it-IT")} € dal registro ordini × ${quota.percentuale}% (${quota.spiegazione})`,
        dove: "/venduto",
      });
      if (!quota.misurata) {
        avvisi.push(
          `La quota dell'ecommerce è una **stima al ${QUOTA_STIMATA.percentuale}%**, non una misura: su questo anno i pagamenti ai partner non coprono gli stessi mesi del venduto.`
        );
      }
    }

    // La divisione fra A1 e A5 l'app non sa farla: Finance passa le tipologie
    // commerciali, non le voci di bilancio. Il totale è giusto, il confine no.
    avvisi.push(
      "L'app non sa dividere A1 da A5: Finance conosce le tipologie commerciali, non le voci di bilancio. Qui sotto c'è **tutto** il fatturato, e la ripartizione fra le due voci la fa il commercialista."
    );
    return {
      ...base,
      origine: "ricavi",
      totale: righe.reduce((s, r) => s + r.importo, 0),
      righe: righe.sort((a, b) => b.importo - a.importo),
      avvisi,
    };
  }

  // ---- Il personale: l'anagrafica, non la banca ----
  if (codice === "B9") {
    const [dati, spese, categorie] = await Promise.all([
      caricaAnno(anno),
      fetchSpeseBanca({ anno, dal: 1, al: 12 }),
      caricaCategorie(),
    ]);
    const cats = spese.ok
      ? categorieDellaVoce("B9", ricostruisci(spese.dati.controparti, categorie), categorie)
      : [];
    const righe: RigaFonte[] = dati.persone
      .map((p) => ({
        nome: `${p.nome}${p.ruolo ? ` · ${p.ruolo}` : ""}`,
        importo: costoPersonaAnno(p),
        fonte:
          p.tipo === "DIPENDENTE"
            ? "lavoro dipendente — in bilancio è B9"
            : p.tipo === "STAGISTA"
              ? "stage — in bilancio non è lavoro dipendente"
              : "consulenza — in bilancio va in B7 «servizi»",
        dove: "/dipendenti",
      }))
      .filter((r) => r.importo > 0)
      .sort((a, b) => b.importo - a.importo);
    return {
      ...base,
      origine: "personale",
      totale: righe.reduce((s, r) => s + r.importo, 0) + cats.reduce((s, c) => s + c.uscite, 0),
      categorie: cats,
      righe,
      avvisi: [
        "In bilancio B9 è **solo lavoro dipendente**: compenso dell'amministratore, co.co.co. e prestazioni occasionali stanno in B7 «servizi». L'anagrafica Dipendenti invece li comprende tutti, ed è il motivo per cui il B9 proposto è molto più alto di quello del bilancio vero.",
        "Questi importi sono il **payroll a budget**, non il costo effettivo: non contengono TFR maturato né ratei.",
      ],
    };
  }

  // ---- Quello che l'app non può sapere ----
  const PERCHE: Record<string, string> = {
    B10: "Gli ammortamenti non passano dalla banca: nascono dal registro dei cespiti, che nell'app non esiste. Il valore proposto è ripreso dall'ultimo bilancio ed è una stima dichiarata.",
    B11: "Le rimanenze non esistono in nessuna fonte dell'app: né la banca né Finance sanno cosa è rimasto in magazzino a fine anno.",
    C16: "I proventi finanziari sono entrate, e il CFO ricostruisce solo le uscite.",
    D: "Le rettifiche di valore su attività finanziarie sono una scrittura di chiusura: non hanno un movimento corrispondente.",
    IMPOSTE:
      "IRES e IRAP sono di competenza, non di cassa, e si calcolano sul reddito imponibile — che nel 2024 era positivo (48.970 €) anche con un bilancio in perdita, per via dei costi indeducibili. L'app non fa quel calcolo.",
  };
  return { ...base, spiegazione: PERCHE[codice] ?? "Questa voce non ha una fonte nell'app: si compila a mano dal bilancio." };
}

// Il totale di quello che è finito in una categoria senza che nessuna regola lo
// dicesse, su tutto l'anno. Serve in cima al conto economico: è la misura di
// quanto di quel bilancio è appoggiato su una classificazione che non c'è.
export async function residuoAnno(
  anno: number
): Promise<{ importo: number; controparti: number; voce: string | null; categoria: string | null } | null> {
  const [spese, categorie] = await Promise.all([
    fetchSpeseBanca({ anno, dal: 1, al: 12 }),
    caricaCategorie(),
  ]);
  if (!spese.ok) return null;
  let importo = 0;
  let quante = 0;
  for (const r of ricostruisci(spese.dati.controparti, categorie)) {
    importo += r.residuo;
    quante += r.controparti.filter((c) => !c.daRegola && c.uscite > 0).length;
  }
  // In quale voce di bilancio è finito quel residuo: senza saperlo, l'avviso
  // dice che c'è un problema ma non dove andarlo a lavorare.
  const pred = categorie.find((c) => c.predefinita) ?? null;
  return {
    importo,
    controparti: quante,
    voce: pred ? pred.voceCE ?? voceCEPredefinita(pred.tipoPL) : null,
    categoria: pred?.nome ?? null,
  };
}
