/**
 * Deluxy Fondo — le persone al vertice.
 *
 * Perché una sezione dedicata: la tesi del fondo parla di «cambio di management», ma finora
 * l'app misurava le **aziende**. Qui l'unità di analisi diventa la **persona**, e questo apre
 * una domanda che le altre pagine non possono porre: quando la stessa persona guida più
 * società, come è andata ogni volta?
 *
 * È l'unica forma di track record ricostruibile con dati pubblici, ed è anche la più fragile:
 * due mandati non fanno una capacità, e un manager arrivato in un settore in salita eredita
 * un risultato che non ha prodotto. La pagina lo dice invece di lasciarlo intendere.
 */

import { leggiSerie } from "./archivio.ts";
import { calcolaMandato, type Mandato } from "./indicatori.ts";
import { BENCHMARK_MERCATO, BENCHMARK_TOTALE, EVENTI_TUTTI, TITOLI_TUTTI } from "./universo.ts";
import type { EventoManagement } from "./tipi";
import type { Notizia } from "./fonti";
import { leggiBiografie, biografiaDi, anniDaCapoAzienda, type Biografia } from "./biografie.ts";
import { leggiNotizie } from "./archivio.ts";

export type IncaricoCeo = {
  evento: EventoManagement;
  simbolo: string;
  nomeAzienda: string;
  settore: string;
  paese: string;
  /** Ruolo del titolo nell'universo: caso guida, controllo, cambio recente. */
  ruolo: string;
  /** Chi ha lasciato il posto. */
  predecessore: string | null;
  /** Misura del mandato, quando la serie dei prezzi lo consente. */
  mandato: Mandato | null;
  inCorso: boolean;
  /** Motivo per cui il mandato non è misurabile, quando non lo è. */
  problema: string | null;
};

export type ProfiloCeo = {
  nome: string;
  /** Tutti gli incarichi censiti, dal più recente. */
  incarichi: IncaricoCeo[];
  /** Quanti incarichi in questo universo: sopra 1 si può parlare di percorso. */
  quantiIncarichi: number;
  /** Somma degli anni di guida misurati. */
  anniTotali: number;
  /**
   * Media semplice delle differenze rispetto all'indice sui mandati misurati.
   * Media semplice e non ponderata: con due o tre casi ponderare dà una precisione finta.
   */
  eccessoMedio: number | null;
  /** Quanti mandati hanno battuto l'indice, sui misurabili. */
  mandatiSopraIndice: number;
  mandatiMisurati: number;
  /**
   * Aziende dove la stessa persona compare come **predecessore**, cioè come chi ha lasciato.
   * Ricostruisce la catena: chi passa da una società all'altra, e chi lascia un posto che
   * un altro censito occupa. Su Pasqualino Monti, per esempio, dice che arriva a Terna
   * lasciando ENAV — informazione che il solo elenco delle nomine non contiene.
   */
  usciteAltrove: { simbolo: string; nomeAzienda: string; data: string; contesto: string }[];
  /** Percorso professionale e note biografiche, quando censiti. */
  biografia: Biografia | null;
  /** Anni gia passati a guidare un azienda prima dell incarico piu vecchio qui censito. */
  anniDaCapo: number | null;
  /** Notizie che nominano la persona: da leggere, non da interpretare. */
  notizie: Notizia[];
};

/** Estrae il nome della persona da un evento, se strutturato. */
const personaDi = (e: EventoManagement) => e.persona ?? null;

/**
 * Costruisce i profili di tutte le persone censite come arrivate al vertice.
 *
 * Contano solo le nomine: gli eventi di uscita registrano un nome nel campo `predecessore`,
 * ma non aprono un mandato da misurare. Chi esce compare quindi nella storia di un'azienda,
 * non come profilo a sé — a meno che non sia stato nominato altrove.
 */
export async function profiliCeo(): Promise<ProfiloCeo[]> {
  const totale = await leggiSerie(BENCHMARK_TOTALE);
  const benchmark = totale ?? (await leggiSerie(BENCHMARK_MERCATO));
  const notizie = (await leggiNotizie()) ?? [];
  const biografie = await leggiBiografie();
  const oggi = new Date().toISOString().slice(0, 10);

  // Le nomine, in ordine cronologico per azienda: serve a sapere quando un mandato finisce.
  const nomine = EVENTI_TUTTI.filter(
    (e) => e.categoria === "management" && !e.id.endsWith("-out") && !e.id.includes("piano") && e.dataAnnuncio <= oggi
  );

  const perPersona = new Map<string, EventoManagement[]>();
  for (const e of nomine) {
    const nome = personaDi(e);
    if (!nome) continue;
    const elenco = perPersona.get(nome) ?? [];
    elenco.push(e);
    perPersona.set(nome, elenco);
  }

  const profili: ProfiloCeo[] = [];

  for (const [nome, eventi] of perPersona) {
    const incarichi: IncaricoCeo[] = [];

    for (const e of eventi) {
      const titolo = TITOLI_TUTTI.find((t) => t.simbolo === e.simbolo);
      const serie = await leggiSerie(e.simbolo);

      // Il mandato finisce quando la stessa azienda nomina qualcun altro.
      const successiva = nomine
        .filter((x) => x.simbolo === e.simbolo && x.dataAnnuncio > e.dataAnnuncio)
        .sort((a, b) => a.dataAnnuncio.localeCompare(b.dataAnnuncio))[0];

      const mandato =
        serie && titolo
          ? calcolaMandato(
              {
                eventoId: e.id,
                chi: e.titolo,
                tier: e.tier,
                forzato: e.forzato,
                successoreEsterno: e.successoreEsterno,
                dataInizio: e.dataAnnuncio,
                dataFine: successiva ? successiva.dataAnnuncio : null,
              },
              serie,
              benchmark
            )
          : null;

      incarichi.push({
        evento: e,
        simbolo: e.simbolo,
        nomeAzienda: titolo?.nome ?? e.simbolo,
        settore: titolo?.settore ?? "non classificato",
        paese: titolo?.paese ?? "non indicato",
        ruolo: titolo?.ruolo ?? "non classificato",
        predecessore: e.predecessore ?? null,
        mandato,
        inCorso: !successiva,
        problema: !serie
          ? "Prezzi non disponibili per questo titolo."
          : mandato === null
            ? "Storico insufficiente per misurare il mandato: la serie comincia dopo la nomina."
            : null,
      });
    }

    incarichi.sort((a, b) => b.evento.dataAnnuncio.localeCompare(a.evento.dataAnnuncio));

    const misurati = incarichi.filter((i) => i.mandato?.eccesso != null);
    const eccessi = misurati.map((i) => i.mandato!.eccesso!);

    // Il nome nelle notizie: confronto sul cognome, perché i titoli spesso omettono il nome
    // di battesimo. Resta un filtro testuale, quindi può pescare omonimi: le notizie si
    // leggono, non si contano come prove.
    const cognome = nome.split(" ").slice(-1)[0].toLowerCase();
    const sue = notizie.filter((n) => n.titolo.toLowerCase().includes(cognome)).slice(0, 6);

    // Dove la stessa persona risulta essere quella che ha lasciato il posto.
    const usciteAltrove = EVENTI_TUTTI.filter((e) => e.predecessore === nome).map((e) => ({
      simbolo: e.simbolo,
      nomeAzienda: TITOLI_TUTTI.find((t) => t.simbolo === e.simbolo)?.nome ?? e.simbolo,
      data: e.dataAnnuncio,
      contesto: e.titolo,
    }));

    const bio = biografiaDi(biografie, nome);
    const primoIncarico = [...incarichi].sort((a, b) => a.evento.dataAnnuncio.localeCompare(b.evento.dataAnnuncio))[0];

    profili.push({
      nome,
      incarichi,
      usciteAltrove,
      biografia: bio,
      anniDaCapo: anniDaCapoAzienda(bio, primoIncarico?.evento.dataAnnuncio ?? null),
      quantiIncarichi: incarichi.length,
      anniTotali: incarichi.reduce((s, i) => s + (i.mandato?.anni ?? 0), 0),
      eccessoMedio: eccessi.length ? eccessi.reduce((s, x) => s + x, 0) / eccessi.length : null,
      mandatiSopraIndice: eccessi.filter((x) => x > 0).length,
      mandatiMisurati: eccessi.length,
      notizie: sue,
    });
  }

  // Prima chi ha più incarichi (è l'informazione nuova di questa pagina), poi il più recente.
  return profili.sort((a, b) => {
    if (b.quantiIncarichi !== a.quantiIncarichi) return b.quantiIncarichi - a.quantiIncarichi;
    return (b.incarichi[0]?.evento.dataAnnuncio ?? "").localeCompare(a.incarichi[0]?.evento.dataAnnuncio ?? "");
  });
}

export type RiepilogoCeo = {
  persone: number;
  /** Persone con più di un incarico censito. */
  conPiuIncarichi: number;
  inCarica: number;
  /** Quanti mandati misurabili in totale, e quanti battono l'indice. */
  mandatiMisurati: number;
  sopraIndice: number;
  /** Quanti provengono da fuori l'azienda, quanti da dentro, quanti non accertati. */
  esterni: number;
  interni: number;
  nonAccertati: number;
  /** Quanti sono arrivati dopo un'uscita forzata del predecessore. */
  dopoUscitaForzata: number;
};

export function riepilogo(profili: ProfiloCeo[]): RiepilogoCeo {
  const incarichi = profili.flatMap((p) => p.incarichi);
  return {
    persone: profili.length,
    conPiuIncarichi: profili.filter((p) => p.quantiIncarichi > 1).length,
    inCarica: incarichi.filter((i) => i.inCorso).length,
    mandatiMisurati: profili.reduce((s, p) => s + p.mandatiMisurati, 0),
    sopraIndice: profili.reduce((s, p) => s + p.mandatiSopraIndice, 0),
    esterni: incarichi.filter((i) => i.evento.successoreEsterno === true).length,
    interni: incarichi.filter((i) => i.evento.successoreEsterno === false).length,
    nonAccertati: incarichi.filter((i) => i.evento.successoreEsterno === null).length,
    dopoUscitaForzata: incarichi.filter((i) => i.evento.forzato === true).length,
  };
}
