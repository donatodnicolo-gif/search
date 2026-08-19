import { prisma } from "@/lib/db";
import { formattaDataOra } from "@/lib/dominio";

// COME È NATA QUESTA CAMPAGNA: il brief con cui è stata lanciata dall'app, e
// che cosa di quel brief è arrivato davvero su Google.
//
// ⚠️ PERCHÉ SERVE. Tutto quello che si scrive in «Crea campagna» — obiettivo,
// budget, strategia, lingua, località, gruppo, keyword, titoli, descrizioni,
// negative e il motivo — finiva nel JSON dei parametri dell'operazione, cioè
// in un posto che non guarda nessuno. Un mese dopo, davanti a una campagna che
// non rende, la domanda è sempre la stessa: *che cosa avevamo deciso?* — e la
// risposta stava in un campo di testo dentro una riga di coda.
//
// ⚠️ E NON MOSTRA SOLO IL BRIEF: mostra anche **che cosa è arrivato**. Il lancio
// avviene in due tempi (il caricamento crea la campagna, l'API aggiunge gruppo,
// keyword, annuncio e località) e un pezzo può fallire mentre gli altri
// passano: il 19/08/2026 l'annuncio della WORLD-ENG è stato rifiutato per
// `DESTINATION_NOT_WORKING` mentre 25 modifiche su 26 andavano a buon fine. Un
// brief che non dicesse com'è finita racconterebbe le intenzioni facendole
// sembrare fatti.
// I verdetti di policy di Google, detti in italiano.
//
// ⚠️ Lo stesso lo fa `spiegaPolicy()` dentro lo script, ma solo per gli esiti
// NUOVI: quelli già scritti restano un blob JSON. E la lezione che c'è dentro
// non va persa proprio sul caso che l'ha insegnata — sulla WORLD-ENG
// l'interfaccia di Google diceva «doesn't meet editorial guidelines» (cioè:
// guarda i testi) mentre il topic vero era `DESTINATION_NOT_WORKING`, cioè la
// pagina di destinazione. Qui si riscrive anche il passato.
const SPIEGA_POLICY: Record<string, string> = {
  DESTINATION_NOT_WORKING:
    "la PAGINA DI DESTINAZIONE non risponde a Google — non i testi: controllare l'URL dai paesi in cui la campagna eroga, i reindirizzamenti e i blocchi ai crawler",
  DESTINATION_MISMATCH: "l'URL visibile e quello vero non combaciano",
  DESTINATION_CONTENT: "il contenuto della pagina di destinazione non è ammesso",
  TRADEMARK_IN_AD_TEXT: "un marchio registrato nel testo dell'annuncio",
  CAPITALIZATION: "maiuscole eccessive nel testo",
  PUNCTUATION_SYMBOLS: "punteggiatura o simboli non ammessi",
};

function leggibile(esito: string): string {
  const topics = [...new Set([...esito.matchAll(/"topic"\s*:\s*"([A-Z_]+)"/g)].map((m) => m[1]))];
  if (topics.length === 0) return esito;
  // Si tiene la parte prima del blob (che è già scritta da noi) e si sostituisce
  // il JSON con la frase. Il codice del topic resta: se un domani non fosse più
  // fra quelli noti, un codice è comunque più utile di una frase inventata.
  const prima = esito.split(/The resource has been disapproved|\(\{"errorCode"/)[0].trim();
  const frasi = topics.map((t) => `${t}${SPIEGA_POLICY[t] ? ` (${SPIEGA_POLICY[t]})` : ""}`);
  return `${prima ? prima + " " : ""}RIFIUTATO da Google per ${frasi.join(" e ")}.`;
}

export async function BriefDiLancio({ campagnaId }: { campagnaId: string }) {
  const lancio = await prisma.operazioneAdv.findFirst({
    where: { campagnaId, tipo: "nuova_campagna" },
    orderBy: { creataIl: "desc" },
    select: {
      stato: true, creataIl: true, approvataDa: true, approvataIl: true,
      eseguitaIl: true, esito: true, motivo: true, parametri: true,
    },
  });
  // Le campagne censite da Google (la stragrande maggioranza) non hanno un
  // brief: non sono nate qui, e inventargliene uno sarebbe peggio che tacere.
  if (!lancio) return null;

  let p: Record<string, unknown> = {};
  try {
    p = JSON.parse(lancio.parametri ?? "{}") as Record<string, unknown>;
  } catch {
    p = {};
  }

  const testi = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x)) : []);
  const keywords = Array.isArray(p.keywords)
    ? (p.keywords as { testo?: unknown; corrispondenza?: unknown }[]).map((k) => ({
        testo: String(k?.testo ?? ""),
        corrispondenza: String(k?.corrispondenza ?? ""),
      }))
    : [];
  const titoli = testi(p.titoli);
  const descrizioni = testi(p.descrizioni);
  const negative = testi(p.negative);
  const localitaNomi = testi(p.localita);
  const localitaId = Array.isArray(p.localitaId) ? (p.localitaId as unknown[]).map((x) => String(x)) : [];
  const nonRisolte = testi(p.localitaNomi);

  // ── Che cosa è arrivato DAVVERO ────────────────────────────────────────
  // Una lettura per cosa, non una per riga: sono tre conteggi e un elenco.
  const [gruppi, localitaVere, completamento, negativeInCoda, ultimaLettura] = await Promise.all([
    prisma.gruppo.findMany({ where: { campagnaId }, select: { nome: true } }),
    prisma.localitaCampagna.count({ where: { campagnaId } }),
    prisma.operazioneAdv.findFirst({
      where: { campagnaId, tipo: "completa_campagna" },
      orderBy: { creataIl: "desc" },
      select: { stato: true, esito: true, eseguitaIl: true },
    }),
    prisma.operazioneAdv.groupBy({
      by: ["stato"],
      where: { campagnaId, tipo: "negativa" },
      _count: { _all: true },
    }),
    // ⚠️ QUANDO l'app ha letto l'ultima volta. Senza questo il riquadro dice
    // «0 gruppi» due righe sopra «gruppo creato» e sembra che uno dei due
    // menta: invece uno racconta il passato e l'altro il presente. Il numero
    // resta quello vero — è la data che mancava.
    prisma.ricezioneDati.findFirst({
      where: { fonte: "google_ads", tipo: { in: ["gruppi", "anagrafica"] } },
      orderBy: { ricevutoIl: "desc" },
      select: { ricevutoIl: true },
    }),
  ]);

  const negativePerStato = new Map(negativeInCoda.map((n) => [n.stato, n._count._all]));
  const negativeFatte = negativePerStato.get("eseguita") ?? 0;
  const negativeAttesa = (negativePerStato.get("in_attesa") ?? 0) + (negativePerStato.get("approvata") ?? 0);

  const voce = (etichetta: string, valore: React.ReactNode) =>
    valore == null || valore === "" ? null : (
      <div className="brief-voce" key={etichetta}>
        <span className="brief-etichetta">{etichetta}</span>
        <span className="brief-valore">{valore}</span>
      </div>
    );

  return (
    <section className="scheda">
      <div className="scheda-titolo">
        Come è nata questa campagna
        <span className="cella-sub" style={{ fontWeight: 400, marginLeft: 8 }}>
          il brief con cui è stata lanciata dall&apos;app, il {formattaDataOra(lancio.creataIl)}
          {lancio.approvataDa ? ` · approvato da ${lancio.approvataDa}` : ""}
          {lancio.approvataIl ? ` il ${formattaDataOra(lancio.approvataIl)}` : ""}
        </span>
      </div>

      {/* Il motivo è la cosa che si dimentica per prima e serve di più: è la
          frase con cui una persona ha spiegato PERCHÉ questa campagna. */}
      {lancio.motivo && (
        <div className="nota-info" style={{ marginBottom: 12 }}>
          <span className="nota-icona">◈</span>
          <span>
            <b>Perché è stata fatta.</b> {lancio.motivo}
          </span>
        </div>
      )}

      <div className="brief-griglia">
        {voce("Obiettivo", typeof p.obiettivoTipo === "string" ? p.obiettivoTipo : null)}
        {voce("Budget chiesto", p.budget != null ? `${String(p.budget)} €/g` : null)}
        {voce("Strategia", typeof p.strategia === "string" ? p.strategia : null)}
        {voce("Lingua", typeof p.lingua === "string" ? p.lingua : null)}
        {voce("Gruppo", typeof p.gruppo === "string" ? p.gruppo : null)}
        {voce(
          "Dove manda",
          typeof p.finalUrl === "string" && p.finalUrl ? (
            <a href={String(p.finalUrl)} target="_blank" rel="noreferrer">
              {String(p.finalUrl)}
            </a>
          ) : null
        )}
        {voce(
          "Località chieste",
          localitaNomi.length > 0 ? (
            <>
              {localitaNomi.join(", ")}
              <span className="cella-sub">
                {" "}
                — {localitaId.length} tradotte in id
                {/* ⚠️ Quelle non tradotte non si nascondono: se una località
                    non è arrivata, è QUI che si capisce perché. */}
                {nonRisolte.length > 0 ? `, ${nonRisolte.length} chieste a Google al lancio (${nonRisolte.join(", ")})` : ""}
              </span>
            </>
          ) : null
        )}
      </div>

      {/* ── Che cosa è arrivato su Google ───────────────────────────────── */}
      <div className="brief-esito">
        <b>Che cosa è arrivato su Google.</b>{" "}
        {lancio.stato === "eseguita" ? (
          <>
            La campagna è stata <b>inviata</b> il {formattaDataOra(lancio.eseguitaIl ?? lancio.creataIl)}.{" "}
          </>
        ) : (
          <>
            Il lancio è ancora <b>{lancio.stato === "in_attesa" ? "da approvare" : lancio.stato}</b>.{" "}
          </>
        )}
        {/* ⚠️ I numeri vengono da quello che Google ha RIMANDATO (gruppi e
            località importati), non da quello che l'app ha chiesto: è la
            differenza fra un resoconto e una promessa. */}
        {ultimaLettura ? `All'ultima lettura (${formattaDataOra(ultimaLettura.ricevutoIl)}) ` : "Finora "}
        l&apos;app legge da Google <b>{gruppi.length} gruppi</b>
        {gruppi.length > 0 ? ` (${gruppi.map((g) => g.nome).join(", ")})` : ""} e{" "}
        <b>{localitaVere} località</b> su {localitaId.length + nonRisolte.length} chieste.
        {/* ⚠️ Se il secondo tempo è più recente dell'ultima lettura, questi
            numeri sono VECCHI: dirlo evita che «0 gruppi» sopra «gruppo
            creato» sembri una contraddizione invece che un ritardo. */}
        {completamento?.eseguitaIl &&
          ultimaLettura &&
          completamento.eseguitaIl > ultimaLettura.ricevutoIl && (
            <>
              {" "}
              <b>
                ⚠️ Questi due numeri sono più vecchi del secondo tempo qui sotto: lo script ha
                scritto su Google dopo l&apos;ultima lettura, e l&apos;app non ha ancora riletto.
              </b>
            </>
          )}
        {keywords.length > 0 && <> Keyword nel brief: <b>{keywords.length}</b>.</>}
        {titoli.length > 0 && <> Titoli: <b>{titoli.length}</b>, descrizioni: <b>{descrizioni.length}</b>.</>}
        {negative.length > 0 && (
          <>
            {" "}
            Parole da escludere: <b>{negative.length}</b> nel brief —{" "}
            {negativeFatte > 0 ? `${negativeFatte} già su Google` : "nessuna ancora su Google"}
            {negativeAttesa > 0 ? `, ${negativeAttesa} in coda da approvare` : ""}.
          </>
        )}
      </div>

      {completamento && (
        <div className={completamento.esito && /ATTENZIONE|RIFIUTAT/i.test(completamento.esito) ? "op-avvisi" : "op-conferma"}>
          <b>Secondo tempo</b> (gruppo, keyword, annuncio e località: non viaggiano col caricamento,
          li aggiunge lo script quando la campagna esiste) —{" "}
          {completamento.stato === "eseguita"
            ? leggibile(completamento.esito ?? "eseguito")
            : `ancora ${completamento.stato === "in_attesa" ? "da approvare" : completamento.stato}`}
        </div>
      )}

      {/* ── Il brief per esteso ─────────────────────────────────────────── */}
      <details className="brief-dettaglio">
        <summary>Vedi tutto quello che era stato scritto</summary>

        {keywords.length > 0 && (
          <div className="brief-blocco">
            <div className="brief-sotto">Keyword ({keywords.length})</div>
            <ul className="brief-elenco">
              {keywords.map((k, i) => (
                <li key={i}>
                  {k.testo}
                  {k.corrispondenza ? <span className="op-match"> {k.corrispondenza}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        )}

        {titoli.length > 0 && (
          <div className="brief-blocco">
            <div className="brief-sotto">Titoli dell&apos;annuncio ({titoli.length})</div>
            <ul className="brief-elenco">
              {titoli.map((t, i) => (
                <li key={i}>
                  {t} <span className="cella-sub">{t.length}/30</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {descrizioni.length > 0 && (
          <div className="brief-blocco">
            <div className="brief-sotto">Descrizioni ({descrizioni.length})</div>
            <ul className="brief-elenco">
              {descrizioni.map((d, i) => (
                <li key={i}>
                  {d} <span className="cella-sub">{d.length}/90</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {negative.length > 0 && (
          <div className="brief-blocco">
            <div className="brief-sotto">Parole da escludere ({negative.length})</div>
            <ul className="brief-elenco">
              {negative.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </div>
        )}

        {lancio.esito && (
          <div className="brief-blocco">
            <div className="brief-sotto">Che cosa ha riferito lo script al lancio</div>
            <div className="cella-sub" style={{ whiteSpace: "normal" }}>{leggibile(lancio.esito)}</div>
          </div>
        )}
      </details>
    </section>
  );
}
