import { giudicaTermine } from "@/lib/azioni";
import { prisma } from "@/lib/db";
import { formattaEuro, formattaNumero } from "@/lib/dominio";
import { breakEvenRoas } from "@/lib/guardrail";

// Quello che la gente ha digitato per davvero. È il posto dove si vede la
// differenza fra quello che abbiamo comprato e quello che stiamo pagando: una
// corrispondenza generica porta ricerche che nessuno avrebbe scelto.
const COLORE_STATO: Record<string, string> = {
  nuovo: "var(--text-tertiary)",
  pertinente: "var(--green)",
  da_escludere: "var(--orange)",
  escluso: "var(--red)",
};

// Le colonne su cui si può ordinare. `resa` non è una colonna del database (è
// incasso ÷ spesa): si ordina in memoria, e per questo l'elenco resta comunque
// quello dei termini più costosi — vedi sotto.
const COLONNE = {
  testo: { etichetta: "Ha cercato", verso: "asc" as const },
  keyword: { etichetta: "Presa dalla keyword", verso: "asc" as const },
  spesa: { etichetta: "Spesa", verso: "desc" as const },
  clic: { etichetta: "Clic", verso: "desc" as const },
  conversioni: { etichetta: "Conv.", verso: "desc" as const },
  ricavi: { etichetta: "Incasso", verso: "desc" as const },
  resa: { etichetta: "Resa", verso: "desc" as const },
  stato: { etichetta: "Giudizio", verso: "asc" as const },
};
type Colonna = keyof typeof COLONNE;

export async function TerminiRicerca({
  campagnaId,
  brand,
  base,
  altriParametri,
  ord,
  verso,
}: {
  campagnaId: string;
  brand: string;
  // Dove tornare quando si clicca un'intestazione.
  base?: string;
  // I parametri da NON perdere ordinando (il periodo, sopra ogni cosa):
  // riordinare una tabella non deve riportare la pagina a un altro periodo.
  altriParametri?: string;
  ord?: string;
  verso?: string;
}) {
  // ⚠️ La selezione NON cambia con l'ordinamento: si prendono sempre i 40
  // termini che costano di più, perché la domanda di questa tabella è "dove
  // stanno finendo i soldi". L'ordinamento cambia come li si guarda, non quali
  // sono — altrimenti ordinando per clic sparirebbe dalla vista il termine che
  // brucia il budget senza cliccare, che è esattamente quello da trovare.
  const termini = await prisma.termineRicerca.findMany({
    where: { campagnaId },
    orderBy: { spesa: "desc" },
    take: 40,
  });

  if (termini.length === 0) {
    return (
      <section className="scheda">
        <div className="scheda-titolo">Cosa ha cercato la gente</div>
        <div className="vuoto-mini">
          Nessun termine di ricerca: li manda lo script con <b>AZIONE = &quot;diagnosi&quot;</b> (una copia per
          account, ogni settimana). Le Performance Max non li espongono.
        </div>
      </section>
    );
  }

  const be = breakEvenRoas(brand);

  // ——— Ordinamento (in memoria, sui 40 già scelti) ———
  const colonna: Colonna = (ord && ord in COLONNE ? ord : "spesa") as Colonna;
  const giu = verso === "asc" ? 1 : verso === "desc" ? -1 : COLONNE[colonna].verso === "asc" ? 1 : -1;
  const resaDi = (t: (typeof termini)[number]) =>
    (t.spesa ?? 0) > 0 ? (t.ricavi ?? 0) / (t.spesa ?? 1) : null;
  const ordinati = [...termini].sort((a, b) => {
    if (colonna === "testo" || colonna === "keyword" || colonna === "stato") {
      const va = String(a[colonna] ?? "");
      const vb = String(b[colonna] ?? "");
      return va.localeCompare(vb, "it") * giu;
    }
    // I vuoti in fondo comunque si ordini: una riga senza resa non è "la
    // peggiore", è una riga senza il dato.
    const va = colonna === "resa" ? resaDi(a) : ((a[colonna] as number | null) ?? null);
    const vb = colonna === "resa" ? resaDi(b) : ((b[colonna] as number | null) ?? null);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    return (va - vb) * giu;
  });

  const versoAttuale = giu === 1 ? "asc" : "desc";
  const intestazione = (c: Colonna, numerica = false) => {
    const attiva = c === colonna;
    // Ricliccando la colonna attiva si gira il verso; su una colonna nuova si
    // parte dal verso che ha senso per quel dato (soldi in giù, testo in su).
    const prossimo = attiva ? (versoAttuale === "asc" ? "desc" : "asc") : COLONNE[c].verso;
    const q = new URLSearchParams(altriParametri ?? "");
    q.set("ord", c);
    q.set("verso", prossimo);
    return (
      <th className={numerica ? "num" : undefined}>
        {base ? (
          <a
            href={`${base}?${q}#termini`}
            style={{ color: attiva ? "var(--text)" : "inherit", textDecoration: "none", whiteSpace: "nowrap" }}
            title={`Ordina per ${COLONNE[c].etichetta.toLowerCase()}`}
          >
            {COLONNE[c].etichetta}
            {attiva && <span aria-hidden> {versoAttuale === "asc" ? "▲" : "▼"}</span>}
          </a>
        ) : (
          COLONNE[c].etichetta
        )}
      </th>
    );
  };

  const spesaTotale = termini.reduce((s, t) => s + (t.spesa ?? 0), 0);
  const senzaResa = termini.filter((t) => (t.spesa ?? 0) > 0 && !(t.conversioni ?? 0));
  const spesaSenzaResa = senzaResa.reduce((s, t) => s + (t.spesa ?? 0), 0);
  const periodo = termini[0].dal && termini[0].al
    ? `${termini[0].dal.toLocaleDateString("it-IT")} → ${termini[0].al.toLocaleDateString("it-IT")}`
    : null;

  return (
    <section className="scheda" id="termini">
      <div className="scheda-titolo">
        Cosa ha cercato la gente ({termini.length} termini più costosi
        {periodo ? ` · ${periodo}` : ""})
      </div>

      {spesaSenzaResa > 0 && (
        <div className="nota-info" style={{ borderColor: "rgba(201,52,0,.35)", background: "rgba(201,52,0,.06)" }}>
          <span className="nota-icona" style={{ color: "var(--orange)" }}>◈</span>
          <span>
            <b>{formattaEuro(spesaSenzaResa)}</b> su {formattaEuro(spesaTotale)} sono andati a{" "}
            {senzaResa.length} ricerche che non hanno portato nessuna conversione. Escluderle è la
            leva più veloce che c&apos;è: passa dalla coda approvata come ogni altra modifica.
          </span>
        </div>
      )}

      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              {intestazione("testo")}
              {intestazione("keyword")}
              {intestazione("spesa", true)}
              {intestazione("clic", true)}
              {intestazione("conversioni", true)}
              {intestazione("ricavi", true)}
              {intestazione("resa", true)}
              {intestazione("stato")}
            </tr>
          </thead>
          <tbody>
            {ordinati.map((t) => {
              const spesa = t.spesa ?? 0;
              const ricavi = t.ricavi ?? 0;
              const resa = spesa > 0 ? ricavi / spesa : null;
              const colore =
                resa == null ? "var(--text-tertiary)" :
                resa >= be * 1.5 ? "var(--green)" :
                resa >= be ? "var(--blue)" : "var(--red)";
              return (
                <tr key={t.id}>
                  <td style={{ maxWidth: 280 }}>
                    <div className="cella-nome">{t.testo}</div>
                    {t.gruppo && <div className="cella-sub">{t.gruppo}</div>}
                  </td>
                  <td className="cella-muta" style={{ maxWidth: 200 }}>
                    {t.keyword ?? "—"}
                    {t.corrispondenza && <div className="cella-sub">{t.corrispondenza.toLowerCase()}</div>}
                  </td>
                  <td className="num">{formattaEuro(spesa)}</td>
                  <td className="num cella-muta">{formattaNumero(t.clic)}</td>
                  <td className="num cella-muta">{formattaNumero(t.conversioni)}</td>
                  <td className="num">{formattaEuro(ricavi)}</td>
                  <td className="num" style={{ color: colore, fontWeight: 600 }}>
                    {resa != null ? `${resa.toFixed(2)}×` : "—"}
                  </td>
                  <td>
                    {t.stato === "nuovo" ? (
                      <div style={{ display: "flex", gap: 6 }}>
                        <form>
                          <input type="hidden" name="id" value={t.id} />
                          <button
                            className="btn small fantasma"
                            type="submit"
                            formAction={giudicaTermine.bind(null, "pertinente")}
                          >
                            Va bene
                          </button>
                          <button
                            className="btn small"
                            type="submit"
                            formAction={giudicaTermine.bind(null, "escludi")}
                            style={{ marginLeft: 6 }}
                          >
                            Escludi
                          </button>
                        </form>
                      </div>
                    ) : (
                      <span className="tag-salute" style={{ color: COLORE_STATO[t.stato] ?? "var(--text-tertiary)" }}>
                        <span className="dot" />
                        {t.stato.split("_").join(" ")}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="cella-sub" style={{ marginTop: 10, whiteSpace: "normal" }}>
        &quot;Escludi&quot; non tocca Google: mette in coda una <b>negativa</b> sulla campagna, da approvare
        in Operazioni. La resa è colorata sul break-even di {brand} ({be.toFixed(2)}×).
        {base && (
          <>
            {" "}Le colonne si ordinano cliccandole. L&apos;elenco resta comunque quello dei{" "}
            {termini.length} termini <b>più costosi</b>: l&apos;ordinamento cambia come li guardi, non
            quali sono — ordinando per clic sparirebbe dalla vista proprio il termine che brucia
            budget senza far cliccare nessuno.
          </>
        )}
      </p>
    </section>
  );
}
