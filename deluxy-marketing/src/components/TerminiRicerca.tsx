import { escludiParoleSelezionate, giudicaTermine } from "@/lib/azioni";
import { PortaSelezionate } from "@/components/PortaSelezionate";
import { attributiPortaKeyword } from "@/lib/porta-keyword";
import { prisma } from "@/lib/db";
import { formattaEuro, formattaNumero, testoKeywordGoogle, testoKeywordPulito } from "@/lib/dominio";
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
  // ⚠️ Il gruppo c'era già ma come sottoriga grigia sotto la ricerca: non si
  // poteva ordinare né leggere in colonna. Su una campagna con quattro gruppi
  // è la prima cosa che si vuole raggruppare — non quanta spesa, ma DOVE.
  gruppo: { etichetta: "Gruppo", verso: "asc" as const },
  keyword: { etichetta: "Fatta scattare da", verso: "asc" as const },
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
  periodoScelto,
  nomeCampagna,
  linguaCampagna,
}: {
  campagnaId: string;
  brand: string;
  // Il nome della campagna e la sua lingua: servono al bottone «Porta
  // altrove», che riusa il dialogo della pagina Keywords.
  nomeCampagna?: string;
  linguaCampagna?: string | null;
  // Dove tornare quando si clicca un'intestazione.
  base?: string;
  // I parametri da NON perdere ordinando (il periodo, sopra ogni cosa):
  // riordinare una tabella non deve riportare la pagina a un altro periodo.
  altriParametri?: string;
  ord?: string;
  verso?: string;
  // Il periodo scelto in cima alla pagina: serve SOLO per dire se coincide
  // con la finestra di questi dati, che e decisa dallo script e non da qui.
  periodoScelto?: { da: Date; a: Date; etichetta: string };
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

  // ⚠️ Chi ce l'ha GIÀ, saputo prima di premere. Senza questo, si sceglievano
  // cinque campagne, si metteva in coda e solo allora l'app rispondeva «ce
  // l'ha già»: il lavoro si scopriva inutile dopo averlo fatto.
  //
  // Una query sola per tutte e 40 le righe (testo + campagna, due colonne), e
  // il confronto sul testo RIPULITO — «consegna fiori milano (phrase)» e
  // «consegna fiori milano (match esatto)» sono la stessa parola scritta da
  // due import diversi.
  const tutteLeKeyword = await prisma.copyAnnuncio.findMany({
    where: { tipo: "keyword" },
    select: { testo: true, campagna: true },
  });
  const campagneDiParola = new Map<string, Set<string>>();
  for (const k of tutteLeKeyword) {
    const chiave = testoKeywordPulito(k.testo).toLowerCase();
    const v = campagneDiParola.get(chiave) ?? new Set<string>();
    v.add(k.campagna);
    campagneDiParola.set(chiave, v);
  }
  const giaSuDi = (testo: string) => [
    ...(campagneDiParola.get(testoKeywordPulito(testo).toLowerCase()) ?? new Set<string>()),
  ];

  // ——— Ordinamento (in memoria, sui 40 già scelti) ———
  const colonna: Colonna = (ord && ord in COLONNE ? ord : "spesa") as Colonna;
  const giu = verso === "asc" ? 1 : verso === "desc" ? -1 : COLONNE[colonna].verso === "asc" ? 1 : -1;
  const resaDi = (t: (typeof termini)[number]) =>
    (t.spesa ?? 0) > 0 ? (t.ricavi ?? 0) / (t.spesa ?? 1) : null;
  const ordinati = [...termini].sort((a, b) => {
    if (colonna === "testo" || colonna === "gruppo" || colonna === "keyword" || colonna === "stato") {
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
  // ⚠️ La finestra si prendeva dalla PRIMA RIGA e si scriveva come se fosse
  // quella di tutta la tabella. Non lo è: le righe arrivano da corse diverse e
  // ognuna porta la sua. Misurato il 07/08/2026 su «[Deluxy] - Fiori Milano
  // ENG»: **cinque finestre** nella stessa tabella — 129 righe su un ANNO
  // (3.020 €) e 31 righe su 30 giorni (418 €), più tre righe rimaste indietro.
  // L'intestazione diceva «29/07/2025 → 29/07/2026», e i totali sotto sommavano
  // un anno di spesa con un mese come se fossero lo stesso periodo.
  const finestre = new Map<string, { dal: Date; al: Date; righe: number; spesa: number }>();
  for (const t of termini) {
    if (!t.dal || !t.al) continue;
    const k = `${t.dal.getTime()}|${t.al.getTime()}`;
    const v = finestre.get(k) ?? { dal: t.dal, al: t.al, righe: 0, spesa: 0 };
    v.righe++;
    v.spesa += t.spesa ?? 0;
    finestre.set(k, v);
  }
  const elencoFinestre = [...finestre.values()].sort((a, b) => b.righe - a.righe);
  const piuFinestre = elencoFinestre.length > 1;
  const data = (d: Date) => d.toLocaleDateString("it-IT");
  // La finestra di riferimento è quella della maggioranza delle righe; quando
  // ce n'è più d'una si dichiara l'intervallo complessivo e il perché.
  const principale = elencoFinestre[0] ?? null;
  const dal = principale?.dal ?? null;
  const al = principale?.al ?? null;
  const periodo = piuFinestre
    ? `${data(new Date(Math.min(...elencoFinestre.map((f) => f.dal.getTime()))))} → ${data(
        new Date(Math.max(...elencoFinestre.map((f) => f.al.getTime())))
      )} · ${elencoFinestre.length} finestre diverse`
    : dal && al
      ? `${data(dal)} → ${data(al)}`
      : null;

  // ⚠️ Questa tabella NON segue il periodo scelto in cima, e va detto.
  //
  // Le parole cercate arrivano come fotografia: lo script le manda con una sua
  // finestra (`dal`/`al`), non giorno per giorno come le metriche. Chi sceglie
  // "ultimi 7 giorni" e qui legge la spesa di un mese sbaglia di quattro volte,
  // e non ha modo di accorgersene — tutto il resto della pagina il periodo lo
  // rispetta.
  const giorno = 86_400_000;
  const scostata =
    periodoScelto && dal && al
      // Tolleranza di un giorno per parte: le finestre non combaciano mai
      // all'ora esatta, e segnalare mezz'ora di scarto sarebbe rumore.
      ? Math.abs(dal.getTime() - periodoScelto.da.getTime()) > giorno ||
        Math.abs(al.getTime() - periodoScelto.a.getTime()) > giorno
      : false;

  return (
    <section className="scheda" id="termini">
      <div className="scheda-titolo">
        Cosa ha cercato la gente ({termini.length} termini più costosi
        {periodo ? ` · ${periodo}` : ""})
      </div>
      {/* Prima di ogni altro avviso: se le righe vengono da finestre diverse,
          i totali qui sotto sommano periodi diversi — ed è il difetto che
          rende tutto il resto inaffidabile. */}
      {piuFinestre && (
        <div className="nota-info" style={{ borderColor: "rgba(215,0,21,.35)", background: "rgba(215,0,21,.06)" }}>
          <span className="nota-icona" style={{ color: "var(--red)" }}>⚠</span>
          <span>
            <b>Queste righe non coprono lo stesso periodo.</b> Arrivano da corse diverse dello
            script, ognuna con la sua finestra:{" "}
            {elencoFinestre.map((f, i) => (
              <span key={i}>
                {i > 0 && " · "}
                <b>{f.righe}</b> righe dal {data(f.dal)} al {data(f.al)} ({formattaEuro(f.spesa)})
              </span>
            ))}
            . I totali qui sotto <b>le sommano</b>, quindi mettono insieme periodi lunghi e corti:
            leggerli come «la spesa di un mese» è sbagliato. Si riallineano quando lo script rifà
            un giro di <code>AZIONE = &quot;diagnosi&quot;</code> su tutte.
          </span>
        </div>
      )}

      {scostata && periodoScelto && !piuFinestre && (
        <div className="nota-info" style={{ borderColor: "rgba(201,52,0,.35)", background: "rgba(201,52,0,.06)" }}>
          <span className="nota-icona" style={{ color: "var(--orange)" }}>⚠</span>
          <span>
            <b>Questa tabella non segue il periodo scelto.</b> In cima hai chiesto
            {" "}<b>{periodoScelto.etichetta}</b>, ma le parole cercate arrivano come fotografia con
            {" "}una finestra decisa dallo script — qui <b>{periodo}</b>. I numeri sotto sono di
            {" "}quella finestra, non del periodo in alto: confrontarli con la spesa di campagna
            {" "}qui sopra non ha senso finché le due finestre non coincidono.
          </span>
        </div>
      )}

      {/* Domanda arrivata davvero, il 28/07/2026: "ma queste sono le
          performance delle keyword o delle parole cercate?". Se te lo devi
          chiedere, la pagina non l'ha detto. */}
      <p className="cella-sub" style={{ whiteSpace: "normal", marginBottom: 12 }}>
        I numeri di questa tabella sono della <b>parola cercata</b>, non della keyword: spesa, clic e
        incasso sono di quello che la gente ha digitato. La colonna «Fatta scattare da» dice solo{" "}
        <b>quale keyword l&apos;ha intercettata</b> — quella che ci ha speso di più, se sono state più
        d&apos;una. Le performance delle keyword stanno in{" "}
        <a href="/keywords" style={{ color: "var(--blue)" }}>Keywords</a>, e sono un altro numero.
      </p>

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

      {/* Le due azioni di massa. Il modulo sta fuori dalla tabella: le caselle
          delle righe lo raggiungono con `form=`, perché dentro le celle ci
          sono già i moduli di «Va bene» e «Escludi» e i form non si annidano. */}
      {nomeCampagna && (
        <form id="scelte-termini" action={escludiParoleSelezionate} className="barra-multipla">
          <input type="hidden" name="campagnaId" value={campagnaId} />
          <input type="hidden" name="ritorno" value={base ?? `/campagne/${campagnaId}`} />
          <span className="cella-sub">Spunta più parole e agisci su tutte insieme:</span>
          {/* ⚠️ Esatta di default: si esclude QUELLA ricerca, non tutto ciò
              che le somiglia. La generica può spegnere una campagna. */}
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}>
            come
            <select name="corrispondenza" defaultValue="exact" style={{ font: "inherit", padding: "4px 8px", borderRadius: 8, border: "1px solid var(--hairline-strong)" }}>
              <option value="exact">esatta — solo questa ricerca</option>
              <option value="phrase">a frase — questa sequenza di parole</option>
              <option value="broad">generica — ogni ricerca con queste parole</option>
            </select>
          </label>
          <button className="btn small btn-secondario" type="submit">
            Escludi le selezionate
          </button>
          <PortaSelezionate lingue={linguaCampagna ? [linguaCampagna] : []} />
        </form>
      )}

      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th data-no-ordina></th>
              {intestazione("testo")}
              {intestazione("gruppo")}
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
                  {/* La casella vive FUORI dalla tabella e la raggiunge con
                      `form=`: dentro le celle ci sono già i moduli di «Va
                      bene» e «Escludi», e i form non si annidano. */}
                  <td>
                    <input
                      type="checkbox"
                      form="scelte-termini"
                      name="scelte"
                      value={t.testo}
                      aria-label={`Seleziona «${t.testo}»`}
                    />
                  </td>
                  <td style={{ maxWidth: 280 }}>
                    <div className="cella-nome">{t.testo}</div>
                  </td>
                  <td className="cella-muta" style={{ maxWidth: 190 }}>
                    {t.gruppo ?? "—"}
                  </td>
                  <td className="cella-muta" style={{ maxWidth: 200 }}>
                    {/* La keyword come la scrive Google: [esatta], "a frase",
                        generica nuda. La corrispondenza non è più una parola in
                        un'altra riga: è la forma stessa della parola. */}
                    {t.keyword ? testoKeywordGoogle(t.keyword, t.corrispondenza) : "—"}
                    <div className="cella-sub">
                      {""}
                      {/* Se la ricerca è stata intercettata da più keyword, i
                          numeri della riga sono la somma di tutte: dirlo evita
                          di attribuire quella spesa alla sola keyword scritta. */}
                      {(t.keywordDiverse ?? 0) > 1 && (
                        <>
                          {t.corrispondenza ? " · " : ""}
                          <b>+{t.keywordDiverse! - 1} altre keyword</b>, numeri sommati
                        </>
                      )}
                    </div>
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
                        {/* Una ricerca che rende è una keyword che non abbiamo
                            ancora comprato: da qui la si porta dove manca,
                            con lo stesso dialogo della pagina Keywords.
                            ⚠️ Corrispondenza ESATTA: è quella parola precisa
                            ad aver reso, non tutto ciò che le somiglia. */}
                        {nomeCampagna && (
                          <button
                            type="button"
                            className="btn small fantasma"
                            {...attributiPortaKeyword({
                              testo: t.testo,
                              corrispondenza: "exact",
                              giaSu: giaSuDi(t.testo),
                              classificata: true,
                              lingueDiOra: linguaCampagna ? [linguaCampagna] : [],
                            })}
                          >
                            Porta altrove
                          </button>
                        )}
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
