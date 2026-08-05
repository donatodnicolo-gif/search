import { Badge } from "@/components/Badge";
import { prisma } from "@/lib/db";
import { COLORE_STATO_KEYWORD, ETICHETTA_STATO_KEYWORD, formattaEuro, formattaNumero, testoKeywordPulito } from "@/lib/dominio";
import { breakEvenRoas } from "@/lib/guardrail";
import { normalizza } from "@/lib/ingest-metriche";
import { creaOperazioneKeyword } from "@/lib/azioni";

// Le keyword di questa campagna: **quello che abbiamo comprato**.
//
// È il gemello della tabella delle parole cercate, e i due numeri non sono lo
// stesso numero: lì c'è quello che la gente ha digitato, qui quello per cui
// paghiamo. La distanza fra le due è dove si nascondono i soldi — una keyword
// generica che costa e non converte sta comprando ricerche che nessuno avrebbe
// scelto, e si vede solo mettendole vicine.

const COLONNE = {
  testo: { etichetta: "Keyword", verso: "asc" as const },
  gruppo: { etichetta: "Gruppo", verso: "asc" as const },
  spesa: { etichetta: "Spesa", verso: "desc" as const },
  clic: { etichetta: "Clic", verso: "desc" as const },
  conversioni: { etichetta: "Conv.", verso: "desc" as const },
  incasso: { etichetta: "Incasso", verso: "desc" as const },
  resa: { etichetta: "Resa", verso: "desc" as const },
  punteggioQualita: { etichetta: "Qualità", verso: "desc" as const },
  stato: { etichetta: "Stato", verso: "asc" as const },
};
// La colonna dei bottoni non si ordina: non c'è un ordine dei bottoni.
type Colonna = keyof typeof COLONNE;

export async function KeywordCampagna({
  campagnaId,
  nomeCampagna,
  brand,
  base,
  altriParametri,
  ord,
  verso,
}: {
  campagnaId: string;
  nomeCampagna: string;
  brand: string;
  base?: string;
  altriParametri?: string;
  ord?: string;
  verso?: string;
}) {
  // Il legame con la campagna è il NOME: `CopyAnnuncio.campagna` è una stringa,
  // non una chiave esterna (le keyword arrivano dallo script prima ancora che
  // la campagna esista nell'app).
  //
  // ⚠️ E i nomi non combaciano. Le keyword importate dal Monitoraggio hanno i
  // nomi della 00.4 ("FIORI MILANO ENG"), la piattaforma usa i suoi
  // ("[Deluxy] - Fiori Milano ENG"). Col confronto esatto questa tabella
  // mostrava zero su tutta la riga proprio sulle campagne che hanno speso di
  // più. Si confronta con lo stesso metro dell'import: nome normalizzato.
  const nomiKeyword = await prisma.copyAnnuncio.groupBy({
    by: ["campagna"],
    where: { tipo: "keyword" },
  });
  const bersaglio = normalizza(nomeCampagna);
  const nomiCompatibili = nomiKeyword
    .map((n) => n.campagna)
    .filter((n) => normalizza(n) === bersaglio);

  const keyword = nomiCompatibili.length
    ? await prisma.copyAnnuncio.findMany({
        where: { tipo: "keyword", campagna: { in: nomiCompatibili } },
        orderBy: { spesa: "desc" },
        take: 60,
      })
    : [];

  if (keyword.length === 0) {
    return (
      <section className="scheda" id="keywords">
        <div className="scheda-titolo">Cosa abbiamo comprato (keyword)</div>
        <div className="vuoto-mini">
          Nessuna keyword per questa campagna: le manda lo script con <b>AZIONE = &quot;copy&quot;</b>.
          Le Performance Max e le Shopping non ne hanno.
        </div>
      </section>
    );
  }

  // ⚠️ «Google non l'ha ancora detto» era spesso FALSO: Google ce l'ha, ma
  // sotto un'altra riga. Le keyword del Monitoraggio arrivano col nome vecchio
  // della campagna e col suffisso di corrispondenza del foglio — «flower
  // delivery in milan (broad)» — mentre la riga vera di Google è «(phrase)»,
  // sotto il nome nuovo. Sono due righe distinte nel database e non si
  // fondono: risultato, la colonna Stato diceva che Google non sapeva niente
  // di una parola che invece stava erogando (misurato il 04/08/2026).
  //
  // Qui si cerca la gemella: stesso testo una volta tolta la corrispondenza,
  // in una qualunque delle campagne compatibili. Non si fondono le righe — i
  // numeri restano di chi li ha mandati — si dice solo che l'altra esiste.
  const daGoogle = keyword.filter((k) => k.impressioni != null || k.statoPiattaforma != null);
  const gemelle = new Map<string, (typeof keyword)[number]>();
  for (const g of daGoogle) {
    const chiave = testoKeywordPulito(g.testo).toLowerCase();
    const gia = gemelle.get(chiave);
    // Se ce n'è più d'una vince quella che ha speso di più: è la riga che
    // descrive meglio cosa sta facendo davvero quella parola.
    if (!gia || (g.spesa ?? 0) > (gia.spesa ?? 0)) gemelle.set(chiave, g);
  }

  const be = breakEvenRoas(brand);
  const resaDi = (k: (typeof keyword)[number]) =>
    (k.spesa ?? 0) > 0 ? (k.incasso ?? 0) / (k.spesa ?? 1) : null;

  const colonna: Colonna = (ord && ord in COLONNE ? ord : "spesa") as Colonna;
  const giu = verso === "asc" ? 1 : verso === "desc" ? -1 : COLONNE[colonna].verso === "asc" ? 1 : -1;
  const ordinate = [...keyword].sort((a, b) => {
    if (colonna === "testo" || colonna === "gruppo" || colonna === "stato") {
      return String(a[colonna] ?? "").localeCompare(String(b[colonna] ?? ""), "it") * giu;
    }
    // I vuoti in fondo comunque si ordini: una keyword senza punteggio non è
    // "la peggiore", è una keyword senza quel dato.
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
    const prossimo = attiva ? (versoAttuale === "asc" ? "desc" : "asc") : COLONNE[c].verso;
    const q = new URLSearchParams(altriParametri ?? "");
    q.set("ordk", c);
    q.set("versok", prossimo);
    return (
      <th className={numerica ? "num" : undefined}>
        {base ? (
          <a
            href={`${base}?${q}#keywords`}
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

  const spesaTotale = keyword.reduce((s, k) => s + (k.spesa ?? 0), 0);
  const incassoTotale = keyword.reduce((s, k) => s + (k.incasso ?? 0), 0);
  // ⚠️ "Spende a vuoto" vuol dire che NON è entrato niente, non che il conteggio
  // delle conversioni è vuoto: le righe che arrivano dal Monitoraggio hanno
  // l'incasso ma non il numero di conversioni, e con la regola «conversioni = 0»
  // una keyword che ha reso 3.817 € finiva fra quelle che non hanno portato
  // niente. Un dato che manca non è uno zero.
  const aVuoto = keyword.filter(
    (k) => (k.spesa ?? 0) > 0 && (k.conversioni ?? 0) === 0 && (k.incasso ?? 0) === 0
  );
  const spesaAVuoto = aVuoto.reduce((s, k) => s + (k.spesa ?? 0), 0);
  const resaTotale = spesaTotale > 0 ? incassoTotale / spesaTotale : null;

  return (
    <section className="scheda" id="keywords">
      <div className="scheda-titolo">Cosa abbiamo comprato ({keyword.length} keyword)</div>
      <p className="cella-sub" style={{ whiteSpace: "normal", marginBottom: 12 }}>
        Queste sono le <b>keyword</b>: quello per cui paghiamo. Sopra ci sono le <b>parole cercate</b>,
        cioè quello che la gente ha digitato davvero. Non sono lo stesso numero, e la distanza fra i
        due è dove si nascondono i soldi: una keyword generica che costa e non converte sta comprando
        ricerche che nessuno avrebbe scelto.
        {resaTotale != null && (
          <>
            {" "}Nel complesso queste keyword rendono <b>{resaTotale.toFixed(2)}×</b> (break-even{" "}
            {be.toFixed(2)}×).
          </>
        )}
      </p>

      {spesaAVuoto > 0 && (
        <div className="nota-info" style={{ borderColor: "rgba(201,52,0,.35)", background: "rgba(201,52,0,.06)" }}>
          <span className="nota-icona" style={{ color: "var(--orange)" }}>◈</span>
          <span>
            <b>{formattaEuro(spesaAVuoto)}</b> su {formattaEuro(spesaTotale)} sono su {aVuoto.length}{" "}
            keyword che non hanno portato <b>né conversioni né incasso</b>. Prima di metterle in pausa
            vale la pena guardare cosa hanno fatto cercare, qui sopra: a volte la keyword è buona ed è
            la ricerca che ha preso a essere sbagliata.
          </span>
        </div>
      )}

      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              {intestazione("testo")}
              {intestazione("gruppo")}
              {intestazione("spesa", true)}
              {intestazione("clic", true)}
              {intestazione("conversioni", true)}
              {intestazione("incasso", true)}
              {intestazione("resa", true)}
              {intestazione("punteggioQualita", true)}
              {intestazione("stato")}
              <th>Azioni</th>
            </tr>
          </thead>
          <tbody>
            {ordinate.map((k) => {
              const resa = resaDi(k);
              const colore =
                resa == null ? "var(--text-tertiary)" :
                resa >= be * 1.5 ? "var(--green)" :
                resa >= be ? "var(--blue)" : "var(--red)";
              const fermaSuGoogle = k.statoPiattaforma && k.statoPiattaforma.toUpperCase() !== "ENABLED";
              // La riga gemella di Google, se questa non ne ha di suoi: stessa
              // parola, corrispondenza diversa. Solo per le righe del foglio.
              const gemella =
                k.statoPiattaforma == null && k.impressioni == null
                  ? gemelle.get(testoKeywordPulito(k.testo).toLowerCase())
                  : undefined;
              return (
                <tr key={k.id}>
                  <td style={{ maxWidth: 280 }}>
                    <a className="cella-nome" href={`/keywords?q=${encodeURIComponent(k.testo)}`}>{k.testo}</a>
                  </td>
                  <td className="cella-muta" style={{ maxWidth: 180 }}>
                    {k.gruppo ?? "—"}
                    {/* Due fonti diverse per le stesse colonne: lo script manda
                        anche impressioni e qualità, il Monitoraggio solo spesa e
                        incasso. Una riga senza impressioni non è una keyword che
                        non è mai comparsa: è una riga che arriva dal foglio. */}
                    {k.impressioni == null && (k.spesa ?? 0) > 0 && (
                      <div className="cella-sub">dal Monitoraggio, non da Google</div>
                    )}
                  </td>
                  <td className="num">{formattaEuro(k.spesa)}</td>
                  <td className="num cella-muta">{formattaNumero(k.clic)}</td>
                  <td className="num cella-muta">{formattaNumero(k.conversioni)}</td>
                  <td className="num">{formattaEuro(k.incasso)}</td>
                  <td className="num" style={{ color: colore, fontWeight: 600 }}>
                    {resa != null ? `${resa.toFixed(2)}×` : "—"}
                  </td>
                  <td className="num cella-muta">
                    {/* Il punteggio di qualità non è un voto estetico: sotto 5
                        si paga di più per la stessa posizione. */}
                    {k.punteggioQualita != null ? (
                      <span style={{ color: k.punteggioQualita <= 4 ? "var(--red)" : undefined, fontWeight: k.punteggioQualita <= 4 ? 600 : undefined }}>
                        {k.punteggioQualita}/10
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <Badge
                      testo={ETICHETTA_STATO_KEYWORD[k.stato] ?? k.stato}
                      colore={COLORE_STATO_KEYWORD[k.stato] ?? "var(--text-tertiary)"}
                    />
                    {/* Come per i gruppi: quello che dice Google si vede sempre,
                        non solo quando è un problema. */}
                    <div className="cella-sub" title={k.statoPiattaforma ?? "nessuno stato ricevuto"}>
                      {k.statoPiattaforma
                        ? fermaSuGoogle
                          ? "ferma su Google"
                          : "attiva su Google"
                        : gemella
                          ? // Google ce l'ha, sotto un'altra riga: si dice
                            // quale, invece di dire che non la conosce.
                            `Google ce l'ha come «${gemella.testo}»: ${
                              gemella.statoPiattaforma && gemella.statoPiattaforma.toUpperCase() !== "ENABLED"
                                ? "ferma"
                                : "attiva"
                            }`
                          : "Google non l'ha ancora detto"}
                    </div>
                    {gemella && (
                      <div className="cella-sub" style={{ color: "var(--text-tertiary)" }}>
                        {formattaEuro(gemella.spesa)} · {formattaNumero(gemella.clic)} clic
                        {gemella.punteggioQualita != null && ` · QS ${gemella.punteggioQualita}/10`}
                        {" "}su quella riga
                      </div>
                    )}
                  </td>
                  <td>
                    {/* Due cose diverse, e la differenza conta: la PAUSA ferma
                        questa keyword, la NEGATIVA chiude la porta a tutte le
                        ricerche che le somigliano — anche quelle che oggi
                        arrivano da altre keyword. Passano dalla stessa coda
                        approvata: lo script le esegue solo dopo l'approvazione.
                        Il name/value di un submit non arriva nelle server
                        action: i valori viaggiano in campi nascosti. */}
                    <div style={{ display: "flex", gap: 6 }}>
                      <form action={creaOperazioneKeyword}>
                        <input type="hidden" name="tipo" value="pausa_keyword" />
                        <input type="hidden" name="campagnaId" value={campagnaId} />
                        <input type="hidden" name="testo" value={k.testo} />
                        <input type="hidden" name="gruppo" value={k.gruppo ?? ""} />
                        <input type="hidden" name="idEsternoKeyword" value={k.idEsterno ?? ""} />
                        <input type="hidden" name="motivo" value={`Fermata dalla scheda di ${nomeCampagna}`} />
                        <button
                          className="btn small btn-secondario"
                          type="submit"
                          title="Ferma solo questa keyword. Passa dalla coda approvata."
                        >
                          Pausa
                        </button>
                      </form>
                      <form action={creaOperazioneKeyword}>
                        <input type="hidden" name="tipo" value="negativa" />
                        <input type="hidden" name="campagnaId" value={campagnaId} />
                        <input type="hidden" name="testo" value={k.testo} />
                        <input type="hidden" name="motivo" value={`Esclusa dalla scheda di ${nomeCampagna}`} />
                        <button
                          className="btn small"
                          type="submit"
                          title="Aggiunge il testo fra le negative della campagna: chiude anche le ricerche simili, comprese quelle che oggi arrivano da altre keyword."
                        >
                          Escludi
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="cella-sub" style={{ marginTop: 10, whiteSpace: "normal" }}>
        Le prime {keyword.length} per spesa
        {nomiCompatibili.length > 1 && (
          <> (nomi riconosciuti: {nomiCompatibili.map((n) => `«${n}»`).join(", ")})</>
        )}
        . La resa è colorata sul break-even di {brand} ({be.toFixed(2)}×); il punteggio di qualità è
        in rosso sotto 5, dove si paga di più per la stessa posizione.
        Da <a href="/keywords" style={{ color: "var(--blue)" }}>Keywords</a> si mettono in pausa o si
        escludono, passando dalla coda approvata.
      </p>
    </section>
  );
}
