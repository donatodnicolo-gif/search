// DA DOVE VIENE UN MOVIMENTO BANCARIO, detto con parole (11/09/2026).
//
// Domanda dell'utente davanti all'elenco `/movimenti`: «fonte file qui intendi
// il file di Vivid che ti carico? in caso specifica». Sì: nel database la
// colonna `fonte` contiene il NOME DEL FILE per intero — per esempio
// «Statement DE54202208000056191201 2026-07-01 - 2026-08-24.csv» — ma la
// pagina lo riduceva a un «File» buono per qualunque cosa, e chi guarda non
// sa di che conto si tratta né di che periodo.
//
// Qui il nome grezzo diventa: un'etichetta corta per il badge (la BANCA, quando
// la si riconosce) e una riga di dettaglio con conto, periodo e nome del file.
// Il conto si riconosce dall'IBAN scritto nel nome: è la sola cosa nel file che
// identifichi il conto con certezza. Aggiungere una banca è una riga in
// `CONTI_NOTI`; quello che non si riconosce resta «File», col nome nel titolo —
// meglio generico che inventato.

/** IBAN → nome della banca, per i conti di cui si caricano gli estratti. */
const CONTI_NOTI: Record<string, string> = {
  // Conto Vivid di Deluxy: è il file che carica l'ufficio (confermato
  // dall'utente l'11/09/2026). 5.042 movimenti importati da tre estratti.
  DE54202208000056191201: "Vivid",
};

export type FonteMovimento = {
  tipo: "qonto" | "file";
  /** Cosa si legge sul badge: «Qonto», «Vivid», «File». */
  etichetta: string;
  /** La riga sotto (o il titolo): conto, periodo, nome del file. */
  dettaglio: string;
  /** Il nome del file, se il movimento viene da un caricamento. */
  file: string | null;
};

const iso = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

export function descriviFonte(fonte: string | null | undefined): FonteMovimento {
  const f = (fonte ?? "").trim();

  if (f.startsWith("Qonto")) {
    // «Qonto (89687708)» → il numero fra parentesi è il conto.
    const conto = f.match(/\(([^)]+)\)/)?.[1];
    return {
      tipo: "qonto",
      etichetta: "Qonto",
      dettaglio: conto ? `sincronizzato da Qonto · conto ${conto}` : "sincronizzato da Qonto",
      file: null,
    };
  }

  if (!f) return { tipo: "file", etichetta: "File", dettaglio: "caricato da file (nome non registrato)", file: null };

  const iban = f.match(/\b([A-Z]{2}\d{2}[A-Z0-9]{10,30})\b/)?.[1];
  const banca = iban ? CONTI_NOTI[iban] : undefined;
  // «… 2026-07-01 - 2026-08-24.csv»: il periodo coperto dall'estratto.
  const date = f.match(/(\d{4}-\d{2}-\d{2})\D+(\d{4}-\d{2}-\d{2})/);
  const pezzi = [
    banca ? `estratto conto ${banca}` : "estratto conto caricato da file",
    iban ? `conto ${iban.slice(0, 6)}…${iban.slice(-4)}` : null,
    date ? `${iso(date[1])} – ${iso(date[2])}` : null,
    f,
  ].filter(Boolean) as string[];

  return { tipo: "file", etichetta: banca ?? "File", dettaglio: pezzi.join(" · "), file: f };
}
