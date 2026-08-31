import Link from "next/link";

// L'INTESTAZIONE CHE ORDINA (Libro UX&UI §8: «ordinamento dal click
// sull'intestazione con freccia di direzione, preservando i filtri»).
//
// Sta qui, in un posto solo, perché era scritta dentro `TabellaClienti` e
// nessun'altra tabella dell'app poteva usarla: su ventisei tabelle, una sola
// si ordinava. Ricopiarla pagina per pagina avrebbe prodotto ventisei frecce
// leggermente diverse — la stessa regola scritta in più posti diverge sempre.
//
// È un LINK, non un bottone: la pagina è server-rendered, l'ordinamento vive
// nella query string e quindi si può condividere, mettere fra i preferiti e
// tornarci con «← Indietro». Cliccare la colonna già attiva inverte il verso.

export type VersoOrdinamento = "asc" | "desc";

/**
 * Il verso di partenza di una colonna quando la si clicca la prima volta.
 * I numeri e le date partono dal PIÙ GRANDE (l'ordine più recente, il margine
 * più alto: è quello che si cerca), il testo dalla A.
 */
export function versoIniziale(numerica?: boolean): VersoOrdinamento {
  return numerica ? "desc" : "asc";
}

/**
 * Costruisce l'indirizzo per ordinare per una colonna, **preservando i filtri**
 * già attivi: si riscrivono solo `ordina` e `verso`, e si torna a pagina 1
 * (ordinare e restare a pagina 7 mostra righe che non c'entrano più).
 */
export function hrefOrdinamento(
  parametri: Record<string, string | undefined>,
  colonna: string,
  ordinaAttuale: string,
  versoAttuale: VersoOrdinamento,
  numerica?: boolean,
): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(parametri)) {
    if (v && k !== "ordina" && k !== "verso" && k !== "page") q.set(k, v);
  }
  q.set("ordina", colonna);
  q.set(
    "verso",
    ordinaAttuale === colonna
      ? versoAttuale === "asc" ? "desc" : "asc"
      : versoIniziale(numerica),
  );
  return `?${q.toString()}`;
}

export function ThOrdina({
  chiave,
  nome,
  ordina,
  verso,
  href,
  numerica,
  titolo,
}: {
  chiave: string;
  nome: string;
  ordina: string;
  verso: VersoOrdinamento;
  /** Il link per ordinare per questa colonna (di norma `hrefOrdinamento`). */
  href: string;
  numerica?: boolean;
  titolo?: string;
}) {
  const attiva = ordina === chiave;
  return (
    <th className={numerica ? "num" : undefined} aria-sort={attiva ? (verso === "asc" ? "ascending" : "descending") : "none"}>
      <Link href={href} className={`th-ordina${attiva ? " attiva" : ""}`} title={titolo ?? `Ordina per ${nome.toLowerCase()}`}>
        {nome}
        {/* La freccia dice DUE cose: quale colonna ordina, e in che verso.
            `↕` sulle colonne inattive dichiara che sono ordinabili — senza,
            l'ordinamento è una funzione che esiste e non si vede. */}
        <span className="th-freccia" aria-hidden="true">
          {attiva ? (verso === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </Link>
    </th>
  );
}

/**
 * L'ordinamento di UNA tabella, letto dall'indirizzo.
 *
 * Il `prefisso` serve alle pagine con PIÙ tabelle (Marketing ne ha quattro):
 * senza, ordinare la prima riordinerebbe anche le altre tre, perché
 * leggerebbero tutte lo stesso `?ordina=`. Con il prefisso ogni tabella ha il
 * suo parametro (`?canali=venduto&canaliVerso=asc`) e le altre non si muovono.
 *
 * Torna anche `th()`, che costruisce l'intestazione già collegata: il punto di
 * tutto questo è che una tabella diventi ordinabile in tre righe, non in venti
 * — venti righe ripetute ventisei volte è il motivo per cui finora era
 * ordinabile una tabella sola.
 */
export function ordinamentoDa(
  sp: Record<string, string | undefined>,
  opzioni: { prefisso?: string; predefinito: string } = { predefinito: "" },
) {
  const chiaveOrdina = opzioni.prefisso ? `${opzioni.prefisso}Ordina` : "ordina";
  const chiaveVerso = opzioni.prefisso ? `${opzioni.prefisso}Verso` : "verso";
  const ordina = String(sp[chiaveOrdina] ?? opzioni.predefinito);
  const verso: VersoOrdinamento = sp[chiaveVerso] === "asc" ? "asc" : "desc";

  /** Confronto pronto per `Array.sort`, dato il valore da confrontare. */
  function confronta<T>(valore: (r: T) => string | number) {
    return (a: T, b: T) => {
      const x = valore(a), y = valore(b);
      const c = typeof x === "string" && typeof y === "string"
        ? x.localeCompare(y, "it")
        : Number(x) - Number(y);
      return verso === "asc" ? c : -c;
    };
  }

  return {
    ordina,
    verso,
    confronta,
    /** L'intestazione ordinabile di una colonna, già collegata. */
    th(chiave: string, nome: string, numerica?: boolean) {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(sp)) {
        if (v && k !== chiaveOrdina && k !== chiaveVerso && k !== "page") q.set(k, v);
      }
      q.set(chiaveOrdina, chiave);
      q.set(chiaveVerso, ordina === chiave ? (verso === "asc" ? "desc" : "asc") : versoIniziale(numerica));
      return (
        <ThOrdina
          key={chiave}
          chiave={chiave}
          nome={nome}
          ordina={ordina}
          verso={verso}
          numerica={numerica}
          href={`?${q.toString()}`}
        />
      );
    },
  };
}
