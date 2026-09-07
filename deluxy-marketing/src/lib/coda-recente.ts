import { prisma } from "@/lib/db";
import { formattaDataOra } from "@/lib/dominio";

// Le operazioni della coda dette in italiano, come le legge chi approva.
// UNA mappa per tutte le viste che le elencano (scheda campagna, pannello
// dopo «metti in coda»): la stessa operazione ha lo stesso nome ovunque.
export const ETICHETTA_TIPO_OPERAZIONE: Record<string, string> = {
  pausa_campagna: "Metti in pausa la campagna",
  attiva_campagna: "Riattiva la campagna",
  nuova_campagna: "Crea la campagna",
  completa_campagna: "Completa la campagna",
  budget: "Cambia budget",
  pausa_keyword: "Metti in pausa la keyword",
  attiva_keyword: "Riattiva la keyword",
  nuova_keyword: "Aggiungi la keyword",
  negativa: "Aggiungi negativa",
  lista_negative: "Applica la lista di negative",
  pausa_gruppo: "Metti in pausa il gruppo",
  attiva_gruppo: "Riattiva il gruppo",
  nuovo_gruppo: "Crea un gruppo",
  nuovo_annuncio: "Crea un annuncio",
  pausa_annuncio: "Metti in pausa l'annuncio",
  localita: "Cambia le località della campagna",
  estensione: "Aggiungi un'estensione",
  rimuovi_estensione: "Togli un'estensione",
};

const PRESENTAZIONE_STATO: Record<string, { testo: string; colore: string }> = {
  in_attesa: { testo: "da approvare", colore: "var(--orange)" },
  approvata: { testo: "approvata", colore: "var(--blue)" },
  eseguita: { testo: "eseguita", colore: "var(--green)" },
  fallita: { testo: "fallita", colore: "var(--red)" },
  annullata: { testo: "annullata", colore: "var(--text-tertiary)" },
};

// Una riga del pannello: già pronta da leggere, niente JSON da aprire lato
// client (il componente che la mostra è un client component: riceve dati
// piatti, non righe di Prisma).
export type RigaCodaRecente = {
  id: string;
  quando: string;
  etichetta: string;
  dettaglio: string | null;
  statoTesto: string;
  colore: string;
  // Messa in coda in questo giro: è quella che l'utente sta cercando con gli occhi.
  appena: boolean;
};

// Le ULTIME operazioni richieste in un ambito — una campagna, un gruppo o
// tutta l'app — in qualunque stato. Non è la coda (quella è CodaCampagna, solo
// le vive): è la risposta a «cosa ho chiesto di recente», che si fa nel
// momento in cui si è appena messo in coda qualcosa e si vuole vederlo
// accanto alle richieste di prima.
export async function ultimeOperazioniRichieste(
  ambito: { campagnaId?: string; gruppoId?: string },
  quante = 8
): Promise<RigaCodaRecente[]> {
  const righe = await prisma.operazioneAdv.findMany({
    where: ambito.gruppoId ? { gruppoId: ambito.gruppoId } : ambito.campagnaId ? { campagnaId: ambito.campagnaId } : {},
    orderBy: { creataIl: "desc" },
    take: quante,
  });
  const adesso = Date.now();
  return righe.map((o) => {
    let p: Record<string, unknown> = {};
    try {
      p = o.parametri ? (JSON.parse(o.parametri) as Record<string, unknown>) : {};
    } catch {
      p = {};
    }
    const pezzi: string[] = [];
    if (typeof p.testo === "string") pezzi.push(`«${p.testo}»`);
    if (p.budget != null) pezzi.push(`a ${String(p.budget)} €/g`);
    // Fuori dalla scheda di una campagna il bersaglio va detto: la stessa
    // operazione su due campagne è due righe diverse.
    if (!ambito.campagnaId && !ambito.gruppoId && o.bersaglio) pezzi.push(`su ${o.bersaglio}`);
    const stato = PRESENTAZIONE_STATO[o.stato] ?? { testo: o.stato, colore: "var(--text-tertiary)" };
    const appena = adesso - o.creataIl.getTime() < 90_000;
    return {
      id: o.id,
      quando: appena ? "adesso" : formattaDataOra(o.creataIl),
      etichetta: ETICHETTA_TIPO_OPERAZIONE[o.tipo] ?? o.tipo.split("_").join(" "),
      dettaglio: pezzi.length > 0 ? pezzi.join(" ") : null,
      statoTesto: stato.testo,
      colore: stato.colore,
      appena,
    };
  });
}
