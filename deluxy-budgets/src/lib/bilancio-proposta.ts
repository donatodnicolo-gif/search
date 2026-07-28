// **Proposta** del conto economico a partire dai dati che l'app ha già.
//
// Non è un import del bilancio: è un punto di partenza. Il bilancio vero lo fa
// il commercialista, e alcune voci l'app non può conoscerle per costruzione —
// gli ammortamenti non passano dalla banca, le rimanenze non esistono in
// nessuna delle fonti. Quelle restano vuote **e la pagina dice perché**, invece
// di riempirle con uno zero che sembrerebbe un dato.
//
// Ogni proposta porta con sé la propria **provenienza**: chi la accetta deve
// poter dire da dove viene quel numero, altrimenti fra sei mesi nessuno sa se
// quel B7 è il bilancio o una stima.
//
// Nulla viene salvato da solo: si propone, l'utente conferma.

import { caricaConsuntivo } from "./consuntivo";
import { type DatiAnno } from "./calc";
import { fetchConsuntivo, fetchSpeseBanca } from "./finance";
import { anniConBilancio, caricaBilancio } from "./bilancio";
import { caricaCategorie, ricostruisci } from "./cfo";

export type { Proposta, NonProponibile } from "./proposta-voci";
import { NON_PROPONIBILI, type Proposta } from "./proposta-voci";
export { NON_PROPONIBILI };

export async function proponiDaApp(dati: DatiAnno): Promise<{ proposte: Proposta[]; avvisi: string[] }> {
  const anno = dati.year;
  const mesi = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const [cons, fattTotale, anniPrec, spese, categorie] = await Promise.all([
    caricaConsuntivo(dati, mesi),
    // Il **totale** fatturato, non solo le tipologie mappate a una voce di
    // budget: in bilancio A1 sono tutti i ricavi, anche quelli che in Margini
    // nessuno ha ancora collegato.
    fetchConsuntivo({ anno, dal: 1, al: 12, stato: "tutte" }),
    anniConBilancio(),
    fetchSpeseBanca({ anno, dal: 1, al: 12 }),
    caricaCategorie(),
  ]);

  // L'ultimo bilancio **vero** più recente di questo: è il metro di paragone.
  // Una proposta non si giudica in assoluto — si giudica accanto a quello che
  // il commercialista ha chiuso l'anno prima.
  const annoPrec = anniPrec.filter((y) => y < anno).sort((a, b) => b - a)[0] ?? null;
  const prec = annoPrec ? await caricaBilancio(annoPrec) : [];
  const daPrec = (codice: string) => {
    const r = prec.find((x) => x.codice === codice);
    return r && annoPrec ? { anno: annoPrec, importo: r.importo } : undefined;
  };

  const avvisi: string[] = [];
  const proposte: Proposta[] = [];

  const fatturato = fattTotale.ok ? fattTotale.dati.totali.imponibile : 0;
  const ecommerce = cons.ricaviPerTipologia["D2C"] ?? 0;
  if (fattTotale.ok || ecommerce > 0) {
    proposte.push({
      codice: "A1",
      importo: fatturato + ecommerce,
      fonte: `fatturato Finance ${anno} (imponibile, tutte le tipologie) + quota ecommerce dal registro ordini`,
      precedente: daPrec("A1"),
    });
    // Nel bilancio vero i ricavi si dividono in due: A1 sono le prestazioni e
    // le provvigioni, A5 gli «altri ricavi» — dove sta la voce più grande dopo
    // le provvigioni, i **servizi di consegna**. L'app non sa fare quella
    // divisione (Finance passa le tipologie commerciali, non le voci di
    // bilancio), quindi mette tutto in A1 e lo dichiara: il totale è giusto, la
    // ripartizione fra A1 e A5 la fa il commercialista.
    const a5 = daPrec("A5");
    const a1 = daPrec("A1");
    if (a5 && a1 && a1.importo + a5.importo > 0) {
      const quota = Math.round((a5.importo / (a1.importo + a5.importo)) * 100);
      avvisi.push(
        `I ricavi sono proposti tutti su A1. Nel bilancio ${a5.anno} il ${quota}% stava invece in A5 «altri ricavi e proventi» (i servizi di consegna): il totale non cambia, la ripartizione sì.`
      );
    }
  } else {
    avvisi.push("Finance non ha risposto: i ricavi non si possono proporre.");
  }

  // ---- I costi arrivano dalla banca, raggruppati per VOCE DI BILANCIO ----
  // Non più per tipo gestionale: ogni categoria del CFO dice dove va nel
  // conto economico civilistico (`voceCE`), e qui si somma per quella. È la
  // differenza fra riclassificare a mano ogni anno e non doverlo più fare.
  // B9 resta fuori: il costo del personale si prende dall'anagrafica, che è
  // deterministica e non aspetta che i bonifici siano categorizzati.
  const perVoce = new Map<string, { importo: number; categorie: string[] }>();
  if (spese.ok) {
    for (const r of ricostruisci(spese.dati.controparti, categorie)) {
      const voce = r.categoria?.voceCE;
      if (!voce || voce === "ESCLUSA" || voce === "B9" || r.uscite <= 0) continue;
      const e = perVoce.get(voce) ?? { importo: 0, categorie: [] };
      e.importo += r.uscite;
      if (r.categoria) e.categorie.push(r.categoria.nome);
      perVoce.set(voce, e);
    }
  } else {
    avvisi.push(`Le uscite di banca non sono disponibili (${spese.errore}): i costi non si possono proporre.`);
  }

  for (const voce of ["B6", "B7", "B8", "B14", "C17"]) {
    const e = perVoce.get(voce);
    if (!e || e.importo <= 0) continue;
    proposte.push({
      codice: voce,
      importo: e.importo,
      fonte: `uscite di banca delle categorie ${e.categorie.map((n) => `«${n}»`).join(", ")} — la voce di bilancio si imposta nel CFO, colonna «Voce di bilancio»`,
      precedente: daPrec(voce),
    });
  }

  // Le categorie ancora senza una voce di bilancio decisa da una persona: la
  // predefinita dedotta le mette tutte in B7, che per «Fornitori fiori e torte»
  // (merce, quindi B6) è sbagliato. Meglio dirlo che lasciarlo scoprire.
  const daConfermare = categorie.filter((c) => !c.voceCEImpostata);
  if (daConfermare.length > 0) {
    avvisi.push(
      `${daConfermare.length} categorie non hanno ancora una voce di bilancio confermata (${daConfermare.map((c) => c.nome).slice(0, 6).join(", ")}${daConfermare.length > 6 ? "…" : ""}): per ora vale quella dedotta dal tipo di P&L, che mette quasi tutto in B7. Si conferma nel CFO.`
    );
  }

  if (cons.personale > 0) {
    proposte.push({
      codice: "B9",
      importo: cons.personale,
      fonte: "costo del personale dall'anagrafica Dipendenti (payroll a budget, non il costo effettivo con TFR e ratei)",
      precedente: daPrec("B9"),
    });
    // Nel bilancio vero B9 è **solo** il lavoro dipendente: compensi
    // dell'amministratore, collaborazioni e lavoro occasionale stanno in B7. Chi
    // guarda «costo del personale» nell'app vede una cosa diversa da B9.
    avvisi.push(
      "B9 accoglie solo il lavoro dipendente: compensi dell'amministratore, co.co.co. e prestazioni occasionali in bilancio stanno in B7 «servizi». Se l'anagrafica Dipendenti li comprende, vanno spostati."
    );
  }

  // B10 non passa dalla banca e non si può ricavare: si riprende dall'ultimo
  // bilancio vero. I cespiti cambiano poco da un anno all'altro, quindi come
  // punto di partenza regge — ma resta una stima, e la riga lo dice.
  const b10 = daPrec("B10");
  if (b10 && b10.importo > 0) {
    proposte.push({
      codice: "B10",
      importo: b10.importo,
      fonte: `ripreso dal bilancio ${b10.anno}: gli ammortamenti non passano dalla banca e nessuna fonte dell'app li conosce. È una STIMA, da confermare col commercialista`,
      precedente: b10,
    });
  }

  if (cons.nonCategorizzato > 0) {
    avvisi.push(
      `In banca ci sono ${Math.round(cons.nonCategorizzato).toLocaleString("it-IT")} € di uscite non ancora categorizzate nel CFO: non entrano in nessuna proposta, quindi i costi qui sotto sono sottostimati di almeno quella cifra.`
    );
  }

  if (!annoPrec) {
    avvisi.push(
      "Non c'è nessun bilancio di un anno precedente da cui prendere le misure: caricane uno (anche solo le voci principali) e queste proposte avranno un metro di paragone."
    );
  }

  return { proposte, avvisi };
}
