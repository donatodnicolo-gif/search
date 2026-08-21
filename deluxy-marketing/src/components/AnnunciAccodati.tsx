import { prisma } from "@/lib/db";
import { formattaDataOra } from "@/lib/dominio";
import { riprendiAnnuncioAccodato } from "@/lib/azioni";
import { misuraTesto } from "@/lib/funzioni-annuncio";
import { spiegaErroreGoogle } from "@/lib/errori-google";

// L'annuncio che HAI GIÀ SCRITTO e non è ancora su Google: in attesa di
// approvazione, approvato e in attesa dello script, oppure fallito.
//
// ⚠️ PERCHÉ STA QUI E NON SOLO IN /operazioni. Il gruppo diceva «questo gruppo
// non ha annunci» ed era vero solo su Google: l'annuncio esisteva, scritto,
// completo, fermo in coda a due passi da lì. Chi guardava la scheda leggeva un
// vuoto e un invito a scriverne uno — cioè l'app suggeriva di rifare una cosa
// già fatta, che è il modo migliore per ritrovarsi con due annunci uguali.
//
// ⚠️ E si POSSONO MODIFICARE. Un'operazione in coda non è ancora un fatto: è
// un testo che sta aspettando. Poterlo solo approvare o annullare costringe,
// per cambiare una virgola, ad annullare e riscrivere quindici titoli.
export async function AnnunciAccodati({
  gruppoId,
  ritorno,
}: {
  gruppoId: string;
  /** Dove tornare dopo aver approvato: finisce nel link di Operazioni. */
  ritorno: string;
}) {
  const ops = await prisma.operazioneAdv.findMany({
    where: {
      gruppoId,
      tipo: "nuovo_annuncio",
      // Le vive e le fallite: sono quelle su cui si può ancora fare qualcosa.
      // Le eseguite no — quelle sono su Google e si vedono nell'elenco vero.
      stato: { in: ["in_attesa", "approvata", "fallita"] },
    },
    orderBy: { creataIl: "desc" },
    take: 5,
  });
  if (ops.length === 0) return null;

  const ETICHETTA: Record<string, { testo: string; colore: string }> = {
    in_attesa: { testo: "da approvare", colore: "var(--orange)" },
    approvata: { testo: "approvato, aspetta lo script", colore: "var(--blue)" },
    fallita: { testo: "fallito", colore: "var(--red)" },
  };

  return (
    <div style={{ marginBottom: 14 }}>
      {ops.map((o) => {
        let par: { titoli?: string[]; descrizioni?: string[]; finalUrl?: string } = {};
        try {
          par = o.parametri ? JSON.parse(o.parametri) : {};
        } catch {
          par = {};
        }
        const titoli = par.titoli ?? [];
        const descrizioni = par.descrizioni ?? [];
        const stato = ETICHETTA[o.stato] ?? { testo: o.stato, colore: "var(--text-tertiary)" };

        return (
          <div className="brief-blocco" key={o.id} style={{ marginTop: 12 }}>
            <div
              className="brief-sotto"
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}
            >
              <span>
                <span className="tag-salute" style={{ color: stato.colore, marginRight: 8 }}>
                  <span className="dot" />
                  {stato.testo}
                </span>
                Annuncio scritto il {formattaDataOra(o.creataIl)}
              </span>
              <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {/* ⚠️ «Modifica» ANNULLA quello in coda e riporta i testi nelle
                    caselle: sono la stessa cosa vista due volte, non due
                    annunci. Lasciare in coda il vecchio mentre si scrive il
                    nuovo significa approvarli tutti e due e ritrovarsi con due
                    annunci quasi uguali in gara fra loro. */}
                <form action={riprendiAnnuncioAccodato} style={{ display: "inline" }}>
                  <input type="hidden" name="id" value={o.id} />
                  <button
                    type="submit"
                    className="btn small btn-secondario"
                    title={
                      o.stato === "fallita"
                        ? "Riporta i testi nelle caselle qui sopra: correggi quello che non andava e rimetti in coda."
                        : "Riporta i testi nelle caselle qui sopra e toglie dalla coda questo, che verrebbe sostituito."
                    }
                  >
                    Modifica
                  </button>
                </form>
                {o.stato === "in_attesa" && (
                  <a className="btn small" href={`/operazioni?torna=${encodeURIComponent(ritorno)}`}>
                    Vai ad approvarlo
                  </a>
                )}
              </span>
            </div>

            {o.stato === "fallita" && o.esito && (
              <div style={{ marginBottom: 8 }}>
                {/* Prima cosa è successo, in italiano; sotto, in piccolo, la
                    risposta testuale di Google — che resta perché è quella
                    che si cerca quando la traduzione non basta. */}
                {spiegaErroreGoogle(o.esito) && (
                  <div style={{ color: "var(--orange)", fontWeight: 600, whiteSpace: "normal" }}>
                    {spiegaErroreGoogle(o.esito)}
                  </div>
                )}
                <div className="cella-sub" style={{ whiteSpace: "normal", overflowWrap: "anywhere" }}>
                  Google (o lo script) ha risposto: {o.esito}
                </div>
              </div>
            )}

            {par.finalUrl && (
              <div className="cella-sub" style={{ overflowWrap: "anywhere", marginBottom: 8 }}>
                Manda a {par.finalUrl}
              </div>
            )}

            {/* I testi si vedono per intero: senza, «hai un annuncio in coda»
                obbliga ad aprire un'altra pagina per sapere COSA dice. Il
                conteggio è lo stesso della casella in cui si scrive — dentro
                le graffe il limite vale sul testo di riserva. */}
            <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
              <div style={{ minWidth: 240, flex: 1 }}>
                <div className="cella-sub" style={{ marginBottom: 4 }}>Titoli ({titoli.length})</div>
                <ul className="brief-elenco">
                  {titoli.map((t, i) => (
                    <li key={i}>
                      {t}
                      <span className="cella-sub"> · {misuraTesto(t).lunghezza}/30</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div style={{ minWidth: 240, flex: 1 }}>
                <div className="cella-sub" style={{ marginBottom: 4 }}>Descrizioni ({descrizioni.length})</div>
                <ul className="brief-elenco">
                  {descrizioni.map((d, i) => (
                    <li key={i}>
                      {d}
                      <span className="cella-sub"> · {misuraTesto(d).lunghezza}/90</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
