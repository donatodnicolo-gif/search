import { notFound } from "next/navigation";
import { cittaDaTesto } from "@/lib/citta";
import { AndamentoMensile } from "@/components/AndamentoMensile";
import { FreschezzaDati } from "@/components/FreschezzaDati";
import { GuardrailCampagna } from "@/components/GuardrailCampagna";
import { KeywordCampagna } from "@/components/KeywordCampagna";
import { AggiungiNegative } from "@/components/AggiungiNegative";
import { CambiaLocalita } from "@/components/CambiaLocalita";
import { AggiungiEstensione } from "@/components/AggiungiEstensione";
import { ProposteAi } from "@/components/ProposteAi";
import { Badge } from "@/components/Badge";
import { GraficoSpesa } from "@/components/GraficoSpesa";
import { AggiornaAdesso } from "@/components/AggiornaAdesso";
import { CoperturaCampagna } from "@/components/CoperturaCampagna";
import { CoperturaGruppi } from "@/components/CoperturaGruppi";
import { DestinazioniCampagna } from "@/components/DestinazioniCampagna";
import { EstensioniCampagna } from "@/components/EstensioniCampagna";
import { BriefDiLancio } from "@/components/BriefDiLancio";
import { CreaAnnuncioAi } from "@/components/CreaAnnuncioAi";
import { accodaAnnuncio, creaAnnuncioConAi, sistemaAnnuncioConAi, leggiBozzaAnnuncio, salvaBozzaAnnuncio, scartaBozzaAnnuncio } from "@/lib/azioni-annuncio";
import { CodaCampagna } from "@/components/CodaCampagna";
import { OggiCampagna } from "@/components/OggiCampagna";
import { PerformancePeriodi } from "@/components/PerformancePeriodi";
import { SegmentiCampagna } from "@/components/SegmentiCampagna";
import { TerminiRicerca } from "@/components/TerminiRicerca";
import { ProssimeAzioni } from "@/components/ProssimeAzioni";
import { RecapModifiche } from "@/components/RecapModifiche";
import { Scadenza } from "@/components/Scadenza";
import { SceltaPeriodo } from "@/components/SceltaPeriodo";
import { Sidebar } from "@/components/Sidebar";
import { COLORE_VERDETTO, ultimaAnalisiPerCampagna } from "@/lib/scheda-analisi";
import { frequenzeMeta } from "@/lib/meta";
import { parametriPeriodo, periodoApp } from "@/lib/periodo-condiviso";
import { TabellaGruppi } from "@/components/TabellaGruppi";
import { VenditeCampagna } from "@/components/VenditeCampagna";
import { RinominaInline } from "@/components/RinominaInline";
import { BudgetInline } from "@/components/BudgetInline";
import { SelettoreStato } from "@/components/SelettoreStato";
import {
  ETICHETTA_LINGUA,
  LINGUE_CAMPAGNA,
  legameDiCampagna,
  lingueDa,
  linguaDaNome,
  ordiniAttribuiti,
} from "@/lib/vendite-campagna";
import { PortaKeyword } from "@/components/PortaKeyword";
import {
  aggiungiMetrica,
  cambiaStatoCampagna,
  applicaKeywordAdAltreCampagne,
  accodaCambioLocalita, accodaEstensione, accodaNegativeScritte, creaOperazione,
  impostaBrandCampagna,
  impostaLinguaCampagna,
  rinominaCampagna,
} from "@/lib/azioni";
import { prisma } from "@/lib/db";
import { GIORNI_LETTURA, STATI_GRUPPO_IGNORATI, gruppiConNumeri, nomeCampagna } from "@/lib/gruppi";
import {
  BRANDS,
  COLORE_BRAND,
  COLORE_STATO_AZIONE,
  COLORE_STATO_CAMPAGNA,
  ETICHETTA_BRAND,
  ETICHETTA_CANALE,
  ETICHETTA_STATO_AZIONE,
  ETICHETTA_STATO_CAMPAGNA,
  formattaData,
  formattaDataOra,
  formattaEuro,
  formattaNumero,
  roas,
  SPIEGA_STATO_CAMPAGNA,
  STATI_AZIONE_APERTI,
  STATI_CAMPAGNA,
  STATI_CAMPAGNA_IGNORATE,
} from "@/lib/dominio";

// exact | phrase | broad, dette come le dice il resto dell'app.
const ETICHETTA_MATCH_NEGATIVA: Record<string, string> = {
  exact: "esatta",
  phrase: "a frase",
  broad: "generica",
};

export const dynamic = "force-dynamic";
// «Estendi con AI» è una server action di QUESTA pagina: la chiamata al
// modello può superare i secondi di default delle funzioni Vercel, e senza
// questo la proposta morirebbe a metà solo in produzione. Stesso valore
// delle route lunghe (cron ordini, esegui/meta).
export const maxDuration = 60;

export default async function SchedaCampagna({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    bloccata?: string;
    // L esito di «metti in coda»: si atterra qui, non su /operazioni
    esito?: string;
    saltate?: string;
    // I filtri con cui si stava guardando l elenco, per il link di ritorno
    dalElenco?: string;
    salvata?: string;
    aggiornamento?: string;
    preset?: string;
    da?: string;
    a?: string;
    ord?: string;
    verso?: string;
    /** «attivi» = solo le keyword dei gruppi non in pausa. */
    kwg?: string;
    // La finestra del blocco «Come sta andando»: è una lente a parte e non
    // tocca il periodo condiviso del resto della pagina.
    perf?: string;
    // L'ordinamento delle keyword ha i suoi parametri: due tabelle ordinabili
    // nella stessa pagina, se condividessero `ord` si riordinerebbero insieme.
    ordk?: string;
    versok?: string;
    // Esito del giro di proposte AI, di ritorno dalla server action
    ai?: string;
    aiok?: string;
  }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { bloccata, salvata, aggiornamento } = sp;

  // Il periodo è quello di tutta l'app: se si è scelto "mese scorso" sulla
  // dashboard, qui dentro si guarda il mese scorso. Sceglierlo qui lo cambia
  // ovunque — un periodo solo, o due numeri letti a due minuti di distanza
  // sembrano confrontabili e non lo sono.
  const periodo = await periodoApp(sp);
  const campagna = await prisma.campagna.findUnique({
    where: { id },
    include: {
      metriche: {
        where: { data: { gte: periodo.corrente.da, lt: periodo.corrente.a } },
        orderBy: { data: "desc" },
      },
      azioni: { orderBy: { creataIl: "desc" } },
      landing: true,
      // Il targeting geografico VERO, letto da Google: prima le mirate, poi
      // le escluse. Vuoto = mai letto, che non è «nessuna località».
      localita: { orderBy: [{ esclusa: "asc" }, { nome: "asc" }] },
    },
  });
  if (!campagna) notFound();

  // Le PAROLE ESCLUSE che Google riporta davvero (censimento del lavoro
  // `negative`, dal 23/08/2026). Sono l'altra metà di una campagna: fin qui la
  // scheda mostrava solo le parole su cui si SPENDE, e una ricerca spenta non
  // lasciava traccia da nessuna parte — né per capire perché il traffico non
  // arriva, né per accorgersi di un'esclusione troppo larga.
  const [negative, ultimoCensimentoNegative] = await Promise.all([
    prisma.negativaCampagna.findMany({
      where: { campagnaId: campagna.id },
      orderBy: [{ livello: "asc" }, { testo: "asc" }],
      select: { id: true, testo: true, corrispondenza: true, livello: true, gruppo: true, vistaIl: true },
    }),
    // ⚠️ Serve a distinguere «nessuna parola esclusa» da «non ancora censite»,
    // che è la stessa trappola già pagata sulle località: senza questa riga le
    // due cose si leggono uguali, e sono opposte.
    campagna.account
      ? prisma.ricezioneDati.findFirst({
          where: { fonte: "google_ads", tipo: "negative", account: campagna.account },
          orderBy: { ricevutoIl: "desc" },
          select: { ricevutoIl: true },
        })
      : null,
  ]);

  // ⚠️ UN CAMBIO DI BUDGET GIÀ IN CODA. Il numero grande in alto è quello che
  // Google ha ADESSO, ed è giusto così — ma se qualcuno ha già chiesto di
  // cambiarlo, quel numero da solo racconta metà della storia: chi guarda
  // decide su un dato che sta per non essere più vero, e nel frattempo mette
  // in coda un secondo cambio senza sapere del primo. Le operazioni vive sono
  // già in `CodaCampagna`, ma in fondo alla scheda: la tessera del budget è il
  // posto dove quella notizia serve.
  const budgetInCoda = await prisma.operazioneAdv.findFirst({
    where: { campagnaId: campagna.id, tipo: "budget", stato: { in: ["in_attesa", "approvata"] } },
    orderBy: { creataIl: "desc" },
    select: { stato: true, parametri: true, creataIl: true, approvataIl: true },
  });
  const budgetChiesto = (() => {
    if (!budgetInCoda?.parametri) return null;
    try {
      const v = Number((JSON.parse(budgetInCoda.parametri) as { budget?: unknown }).budget);
      return Number.isFinite(v) ? v : null;
    } catch {
      return null;
    }
  })();

  // La lingua mostrata accanto al titolo è la STESSA che usa l'attribuzione
  // delle vendite: si legge dal legame (manuale se c'è, altrimenti dedotta dal
  // nome), non da un campo suo. Due fonti per la stessa cosa vorrebbero dire
  // che il selettore in cima dice una lingua e i KPI sotto ne usano un'altra.
  const { legame: legameLingua } = await legameDiCampagna(campagna);
  const linguaCampagna = legameLingua.lingua;
  // Le lingue dichiarate, come elenco: la campagna può servirne più d'una.
  const lingueCampagna = lingueDa(legameLingua.lingua);

  // Le conversioni contate in cassa, da mettere ACCANTO a quelle dichiarate
  // dalla piattaforma. Stesso periodo delle metriche qui sopra — se coprissero
  // due finestre diverse sarebbero due numeri non confrontabili messi vicini,
  // che è peggio di non metterli.
  const inCassa = await ordiniAttribuiti(campagna, periodo.corrente, legameLingua.negozio);

  // L'ultimo giorno CON DATI: è quello su cui si giudica il budget, perché la
  // media del periodo appiattisce le giornate storte. Sta fra le metriche già
  // caricate, non serve una query.
  const ultimoGiornoPieno = campagna.metriche.reduce<{ data: Date; spesa: number | null } | null>(
    (max, m) => (!max || m.data > max.data ? { data: m.data, spesa: m.spesa } : max),
    null
  );

  // Le campagne su cui si può portare una parola cercata: solo quelle che
  // erogano davvero, come nel dialogo della pagina Keywords.
  const campagneGrezze = (
    await prisma.campagna.findMany({
      where: { canale: "google_ads", stato: "attiva" },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, classe: true },
    })
  );
  // I gruppi di annunci di quelle campagne: una query sola, non una per
  // campagna. Servono a far scegliere DOVE finisce la keyword invece di
  // lasciarla al primo gruppo attivo che lo script incontra.
  const gruppiDelle = await prisma.gruppo.findMany({
    where: {
      campagnaId: { in: campagneGrezze.map((c) => c.id) },
      stato: { notIn: [...STATI_GRUPPO_IGNORATI] },
    },
    orderBy: { nome: "asc" },
    select: { campagnaId: true, nome: true },
  });
  const gruppiPerCampagna = new Map<string, string[]>();
  for (const g of gruppiDelle) {
    const lista = gruppiPerCampagna.get(g.campagnaId) ?? [];
    lista.push(g.nome);
    gruppiPerCampagna.set(g.campagnaId, lista);
  }
  const campagneDoveportare = campagneGrezze.map((c) => ({
    ...c,
    lingua: linguaDaNome(c.nome),
    citta: cittaDaTesto(c.nome),
    gruppi: gruppiPerCampagna.get(c.id) ?? [],
  }));

  // L'ANALISI più recente che parla di questa campagna: alimenta il bottone
  // in testata. `null` = niente bottone — uno che apre una pagina a caso
  // insegna a non premerlo.
  const analisiCampagna = await ultimaAnalisiPerCampagna(campagna);

  // La FREQUENZA del periodo scelto, per le campagne Meta (richiesta utente,
  // 26/08): impressioni ÷ persone raggiunte, chiesta viva a Meta perché è un
  // numero di PERIODO — dalle righe giornaliere non si ricava (la copertura è
  // gente unica). Se Meta non risponde il KPI dice «—» e la pagina vive.
  const frequenzaMeta =
    campagna.canale === "meta_ads" && campagna.idEsterno
      ? (
          await frequenzeMeta(campagna.idEsterno, [
            { chiave: "periodo", da: periodo.corrente.da, a: periodo.corrente.a },
          ])
        ).get("periodo") ?? null
      : null;

  // I gruppi della campagna: la media di campagna qui sopra può nascondere un
  // gruppo che rende il doppio e uno che brucia. Vanno guardati separati.
  const giorniPeriodo = Math.max(
    1,
    Math.round((periodo.corrente.a.getTime() - periodo.corrente.da.getTime()) / 86_400_000)
  );
  // ⚠️ Il periodo ESATTO, non un numero di giorni: la finestra che scorre da
  // oggi perdeva il primo giorno e ignorava la data di fine, e la somma dei
  // gruppi non faceva il totale della campagna qui sopra.
  const gruppi = await gruppiConNumeri({ campagnaId: campagna.id, periodo: periodo.corrente });

  // La destinazione con cui precompilare un annuncio nuovo: quella che gli
  // annunci di questa campagna usano gia, la piu frequente. E un suggerimento
  // modificabile — ma partire vuoti farebbe ricopiare a mano un URL che l app
  // ha gia sotto gli occhi, e un URL ricopiato a mano prima o poi si sbaglia.
  const urlAnnunciCampagna = await (async () => {
    const righe = await prisma.copyAnnuncio.findMany({
      where: { campagna: campagna.nome, tipo: { in: ["destinazione", "titolo", "descrizione"] }, finalUrl: { not: null } },
      select: { finalUrl: true },
    });
    const conteggio = new Map<string, number>();
    for (const r of righe) if (r.finalUrl) conteggio.set(r.finalUrl, (conteggio.get(r.finalUrl) ?? 0) + 1);
    let vincitore: string | null = null; let max = 0;
    for (const [u, n] of conteggio) if (n > max) { max = n; vincitore = u; }
    // Se la campagna non ha ancora annunci (e successo alla WORLD-ENG), si
    // ripiega sulla landing agganciata: e la stessa cosa che si era chiesta.
    return vincitore ?? campagna.landing?.url ?? null;
  })();

  const metricheCrono = [...campagna.metriche].reverse();
  const spesa = campagna.metriche.reduce((s, m) => s + (m.spesa ?? 0), 0);
  const ricavi = campagna.metriche.reduce((s, m) => s + (m.ricavi ?? 0), 0);
  const conv = campagna.metriche.reduce((s, m) => s + (m.conversioni ?? 0), 0);
  const click = campagna.metriche.reduce((s, m) => s + (m.click ?? 0), 0);
  const r = roas(ricavi, spesa);
  // Una campagna defunta non si giudica più: niente spesa di oggi, niente
  // guardrail, niente tasklist. Restano i numeri storici, che sono successi.
  const defunta = (STATI_CAMPAGNA_IGNORATE as readonly string[]).includes(campagna.stato);

  return (
    <div className="layout">
      <Sidebar attiva="campagne" />
      <main className="main">
        {/* Si torna DOVE si era: i filtri dell elenco viaggiano nel link
            delle card e si rimettono qui. Senza, «← Campagne» riportava
            sempre a tutte le campagne e la ricerca andava rifatta. */}
        <a
          className="ritorno"
          href={sp.dalElenco ? `/campagne?${decodeURIComponent(sp.dalElenco)}` : "/campagne"}
        >
          ← Campagne{sp.dalElenco ? " (con i filtri di prima)" : ""}
        </a>
        <div className="page-head">
          <div>
            {/* La matita sta FUORI dall'<h1>: si porta dietro il suo <dialog>,
                e un dialog dentro un titolo è HTML non valido. */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h1 className="page-title">{nomeCampagna(campagna)}</h1>
              <RinominaInline
                id={campagna.id}
                nomeVisibile={campagna.nomeVisibile}
                nomeDiPiattaforma={campagna.nome}
                cosa="la campagna"
                azione={rinominaCampagna}
              />
            </div>
            {/* ⚠️ <div>, non <p>: qui dentro c'è un <form> (il selettore dei
                clienti), e un form dentro un paragrafo è HTML non valido — il
                browser chiude il <p> da solo, l'albero che riceve non è quello
                mandato dal server e React **fallisce l'idratazione** e ririsegna
                tutta la pagina. Effetto collaterale misurato: gli ascoltatori
                agganciati a mano alle tabelle (ordinamento) restavano su nodi
                buttati via e i click non facevano niente. Stessa famiglia del
                <dialog> dentro l'<h1>. */}
            <div className="page-sub" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {/* Quando il nome è nostro, quello di Google resta a vista: è
                  quello da cercare nell'interfaccia di Google Ads, e senza si
                  perderebbe l'unico modo di ritrovare la campagna di là. */}
              {campagna.nomeVisibile && (
                <span className="tag-neutro" title="Il nome che ha su Google Ads">
                  su Google: {campagna.nome}
                </span>
              )}
              {/* Il brand si corregge da qui, e accanto c'è l'ACCOUNT che lo
                  spiega. Senza, «di chi è questa campagna» era una deduzione:
                  «[Palloncini] - AWARENESS» risultava di Cake con 1.137,67 €
                  attribuiti e sul conto Meta di Cake non esiste — e non c'era
                  modo di correggerlo. La scelta a mano vince e nessun import
                  la sovrascrive più. */}
              <span className="stato-app-inline">
                <span className="stato-app-etichetta">brand</span>
                <form action={impostaBrandCampagna.bind(null, campagna.id)}>
                  <input
                    type="hidden"
                    name="ritorno"
                    value={`/campagne/${campagna.id}${parametriPeriodo(periodo) ? `?${parametriPeriodo(periodo)}` : ""}`}
                  />
                  <SelettoreStato
                    nome="brand"
                    valore={campagna.brand}
                    colore={COLORE_BRAND[campagna.brand] ?? "var(--text-tertiary)"}
                    // BRANDS contiene gia "cross": aggiungerlo a parte lo
                    // faceva comparire due volte nella tendina.
                    opzioni={BRANDS.map((b) => ({
                      valore: b,
                      etichetta: b === "cross" ? "Cross-brand — non lo so" : ETICHETTA_BRAND[b] ?? b,
                    }))}
                  />
                </form>
              </span>
              {campagna.brandManuale && (
                <span className="tag-neutro" title="Il brand è stato scelto a mano: nessun import lo sovrascrive">
                  brand scelto a mano
                </span>
              )}
              {/* L'account su cui gira DAVVERO: è il fatto da cui il brand
                  dovrebbe discendere, e finché non c'è va detto che non c'è. */}
              <span
                className="tag-neutro"
                title={
                  campagna.account
                    ? "Account pubblicitario su cui l'import l'ha vista"
                    : "Nessun import l'ha ancora vista con l'account: si saprà al prossimo giro"
                }
                style={campagna.account ? undefined : { opacity: 0.6 }}
              >
                {campagna.account ? `account ${campagna.account}` : "account non ancora letto"}
              </span>
              <Badge testo={ETICHETTA_CANALE[campagna.canale] ?? campagna.canale} colore="var(--text-secondary)" />
              {/* Il DOVE della campagna: il targeting VERO letto da Google,
                  non la città dedotta dal nome. Sta in testata come l'account,
                  e come per l'account l'assenza si dichiara: «mai lette» e
                  «nessuna località» sono due cose diverse. L'elenco completo
                  (con le escluse) resta nel blocco Dettagli e nel title. */}
              {(() => {
                const mirate = campagna.localita.filter((l) => !l.esclusa);
                const escluse = campagna.localita.filter((l) => l.esclusa);
                if (campagna.localita.length === 0) {
                  return (
                    <span
                      className="tag-neutro"
                      style={{ opacity: 0.6 }}
                      title="Il targeting geografico arriva col giro anagrafica dello script aggiornato al 10/08: finché non gira, non si sa"
                    >
                      località non ancora lette
                    </span>
                  );
                }
                const nomiMirate = mirate.map((l) => l.nome);
                return (
                  <span
                    className="tag-neutro"
                    title={[
                      nomiMirate.length > 0 ? `Mirate: ${nomiMirate.join(", ")}` : "Nessuna località mirata",
                      escluse.length > 0 ? `Escluse: ${escluse.map((l) => l.nome).join(", ")}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  >
                    {nomiMirate.length === 0
                      ? "nessuna località mirata"
                      : nomiMirate.length === 1
                        ? nomiMirate[0]
                        : `${nomiMirate.length} località`}
                    {escluse.length > 0 && (
                      <span style={{ opacity: 0.65 }}>{` — ${escluse.length} escluse`}</span>
                    )}
                  </span>
                );
              })()}
              {/* La lingua sta col titolo, non in fondo a un blocco richiuso:
                  è la cosa che si corregge più spesso, ed è la stessa che
                  l'attribuzione delle vendite usa per tagliare i clienti — non
                  una seconda impostazione che le somiglia. */}
              <span className="stato-app-inline">
                <span className="stato-app-etichetta">clienti</span>
                <form action={impostaLinguaCampagna.bind(null, campagna.id)}>
                  {/* Si torna dove si era, periodo compreso: senza, cambiare
                      la lingua rimandava agli ultimi 30 giorni di default. */}
                  <input
                    type="hidden"
                    name="ritorno"
                    value={`/campagne/${campagna.id}${parametriPeriodo(periodo) ? `?${parametriPeriodo(periodo)}` : ""}`}
                  />
                  {/* ⚠️ Caselle, non tendina: una campagna può servire DUE
                      pubblici (italiani e stranieri), e una tendina costringe a
                      sceglierne uno solo — cioè a dichiarare il falso.
                      Con due lingue il filtro sul paese non taglia più niente,
                      ed è scritto qui sotto invece di essere una sorpresa. */}
                  {LINGUE_CAMPAGNA.map((l) => (
                    <label key={l} className="pill-opt" style={{ cursor: "pointer", gap: 6 }}>
                      <input
                        type="checkbox"
                        name="lingua"
                        value={l}
                        defaultChecked={lingueCampagna.includes(l)}
                      />
                      {ETICHETTA_LINGUA[l]}
                    </label>
                  ))}
                  <button className="btn small" type="submit">Salva</button>
                </form>
              </span>
              {campagna.obiettivo && <span>{campagna.obiettivo}</span>}
            </div>
            {/* Lo stato sta col titolo: è la prima cosa che si guarda e la più
                frequente da cambiare, non merita di stare sotto a una scheda. */}
            <form className="pill-scelta" style={{ marginTop: 10 }}>
              <input type="hidden" name="id" value={campagna.id} />
              {STATI_CAMPAGNA.map((s) => (
                <button
                  key={s}
                  className={`pill-opt${campagna.stato === s ? " attuale" : ""}`}
                  style={{ color: campagna.stato === s ? undefined : COLORE_STATO_CAMPAGNA[s] }}
                  type="submit"
                  formAction={cambiaStatoCampagna.bind(null, s)}
                  disabled={campagna.stato === s}
                  title={campagna.stato === s ? "Stato attuale" : `Porta la campagna a "${ETICHETTA_STATO_CAMPAGNA[s]}"`}
                >
                  <span className="dot" />
                  <span style={{ color: "var(--text)" }}>{ETICHETTA_STATO_CAMPAGNA[s]}</span>
                </button>
              ))}
            </form>
            <p className="cella-sub" style={{ marginTop: 8, whiteSpace: "normal", maxWidth: 720 }}>
              {SPIEGA_STATO_CAMPAGNA[campagna.stato] ?? ""}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {/* Il brief sta in un bottone e non a pagina: è un documento che si
                consulta quando serve — «che cosa avevamo deciso?» — mentre i
                numeri qui sotto si guardano ogni giorno. Un dato importante ma
                raro va raggiungibile in un click, non messo sulla strada di
                quelli frequenti. Sulle campagne censite da Google il bottone
                non compare proprio: un brief non ce l'hanno. */}
            {/* ⚠️ ANALISI, per primo: è il giudizio più recente di un lettore
                ESTERNO su questa campagna (le analisi depositate su Drive,
                rielaborate in scheda). Il pallino porta il verdetto — di
                questa campagna quando l'analisi la nomina, dell'analisi intera
                quando parla solo del suo mondo — e il testo sotto il mouse
                dice cosa ha detto. Se nessuna analisi elaborata la riguarda,
                il bottone non c'è: un bottone che apre una pagina a caso
                insegna a non premerlo. */}
            {analisiCampagna && (
              <a
                className="btn"
                href={`/analisi/${analisiCampagna.id}`}
                title={
                  analisiCampagna.perCampagna
                    ? `${analisiCampagna.titolo} — su questa campagna: ${analisiCampagna.perCampagna.nota}`
                    : `${analisiCampagna.titolo} (l'analisi non nomina questa campagna: verdetto dell'insieme)`
                }
                style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
              >
                <span
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: "50%",
                    background: COLORE_VERDETTO[analisiCampagna.perCampagna?.verdetto ?? analisiCampagna.verdetto],
                    flexShrink: 0,
                  }}
                />
                ANALISI
              </a>
            )}
            <BriefDiLancio campagnaId={campagna.id} />
            <a className="btn" href={`/azioni/nuova?campagna=${campagna.id}&brand=${campagna.brand}`}>Nuova azione sulla campagna</a>
          </div>
        </div>

        {/* ⚠️ DOVE ESCE LA PUBBLICITÀ, per intero e in cima.
            Il targeting geografico stava in un badge troncato («Croatia ·
            Greece · Monaco e altre 6») e nel blocco Dettagli, in fondo: per
            sapere se una campagna copre la Svizzera bisognava passare il
            mouse su una pastiglia grigia o scorrere mezza pagina. È la prima
            cosa che si guarda quando si apre una campagna, e adesso è la
            prima cosa che si legge. */}
        <section className="scheda" style={{ paddingTop: 14, paddingBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ minWidth: 260, flex: 1 }}>
              <div className="cella-sub" style={{ marginBottom: 4 }}>Dove esce</div>
              {campagna.localita.length === 0 ? (
                <div className="cella-muta" style={{ whiteSpace: "normal" }}>
                  {/* «Mai lette» e «nessuna» sono due cose diverse: la prima è
                      un dato che manca, la seconda una campagna che esce
                      ovunque. Confonderle qui costerebbe caro. */}
                  Non ancora lette dallo script — non vuol dire «nessuna»: finché non arrivano, dove
                  esce questa campagna non lo sappiamo.
                </div>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {campagna.localita
                    .filter((l) => !l.esclusa)
                    .map((l) => (
                      <span key={l.id} className="pill-opt" style={{ cursor: "default" }}>
                        {l.nome}
                        {l.tipo && <span className="cella-sub">{l.tipo}</span>}
                        {l.modificatore != null && (
                          <span className="cella-sub">offerta ×{l.modificatore}</span>
                        )}
                      </span>
                    ))}
                  {campagna.localita.filter((l) => !l.esclusa).length === 0 && (
                    <span style={{ color: "var(--orange)" }}>
                      nessuna località mirata: senza targeting geografico Google la fa uscire ovunque
                    </span>
                  )}
                </div>
              )}
              {campagna.localita.some((l) => l.esclusa) && (
                <div className="cella-sub" style={{ marginTop: 6, whiteSpace: "normal" }}>
                  Esclude: {campagna.localita.filter((l) => l.esclusa).map((l) => l.nome).join(" · ")}
                </div>
              )}
            </div>
            {campagna.canale === "google_ads" && (
              <CambiaLocalita
                campagnaId={campagna.id}
                nomeCampagna={campagna.nome}
                attuali={campagna.localita
                  .filter((l) => !l.esclusa)
                  .map((l) => ({ idEsterno: l.idEsterno, nome: l.nome, tipo: l.tipo }))}
                azione={accodaCambioLocalita}
                ritorno={`/campagne/${campagna.id}`}
              />
            )}
          </div>
        </section>

        {/* L esito di «metti in coda» arriva qui: si resta sulla scheda
            invece di essere portati in coda a ogni parola. */}
        {sp.esito && (
          <div className="nota-info">
            <span className="nota-icona">◈</span>
            <span>
              {sp.esito}
              {sp.saltate && (<> · <b>saltate</b>: {sp.saltate}</>)}
              {" — "}
              <a href="/operazioni">vai alla coda per approvare</a>
            </span>
          </div>
        )}

        {/* I filtri della pagina viaggiano col periodo: cambiarlo e una lente,
            non un modo per tornare all elenco completo. */}
        <SceltaPeriodo
          periodo={periodo}
          da={sp.da}
          a={sp.a}
          azione={`/campagne/${campagna.id}`}
          altriFiltri={new URLSearchParams(
            Object.entries(sp).filter(
              ([k, v]) => v != null && v !== "" && k !== "preset" && k !== "da" && k !== "a"
            ) as [string, string][]
          ).toString()}
        />

        <div className="kpi-riga">
          <div className="kpi">
            <div className="kpi-valore">{spesa > 0 ? formattaEuro(spesa) : "—"}</div>
            <div className="kpi-etichetta">
              Spesa · {periodo.corrente.etichetta} ({campagna.metriche.length} giorni con dati)
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{ricavi > 0 ? formattaEuro(ricavi) : "—"}</div>
            <div className="kpi-etichetta">Ricavi attribuiti</div>
          </div>
          {/* Solo Meta: la frequenza del periodo, col colore che dice quando
              preoccuparsi — sopra 3 nel lusso i creativi si consumano, sopra
              10 il pubblico è esaurito (il caso VENDITE: 16,2). */}
          {campagna.canale === "meta_ads" && (
            <div className="kpi">
              <div
                className="kpi-valore"
                style={{
                  color:
                    frequenzaMeta == null ? undefined : frequenzaMeta.frequenza >= 10 ? "var(--red)" : frequenzaMeta.frequenza >= 3 ? "var(--orange)" : undefined,
                }}
                title={
                  frequenzaMeta
                    ? `Impressioni ÷ persone raggiunte nel periodo, letta da Meta. Sopra 3 nel lusso è fatigue, sopra 10 pubblico esaurito.`
                    : "Meta non ha risposto (o la campagna non ha erogato nel periodo)"
                }
              >
                {frequenzaMeta ? `${frequenzaMeta.frequenza.toFixed(1)}×` : "—"}
              </div>
              <div className="kpi-etichetta">
                Frequenza{frequenzaMeta ? ` · ${formattaNumero(frequenzaMeta.copertura)} persone` : ""}
              </div>
            </div>
          )}
          {/* Le conversioni dichiarate dalla piattaforma e gli ordini veri con
              l'UTM, AFFIANCATI e mai sommati: sommarli conterebbe due volte lo
              stesso acquisto. Contano cose diverse — la piattaforma include
              view-through e finestre lunghe, gli ordini sono cassa entrata —
              quindi il primo è quasi sempre più alto, e la distanza fra i due
              è essa stessa un'informazione. */}
          <div className="kpi">
            <div className="kpi-valore" style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span>{conv > 0 ? formattaNumero(conv) : "—"}</span>
              <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>·</span>
              <span
                style={{ color: inCassa.ordini > 0 ? "var(--green)" : "var(--text-tertiary)" }}
                title="Ordini Shopify del periodo che portano scritto l'UTM di questa campagna"
              >
                {formattaNumero(inCassa.ordini)}
              </span>
            </div>
            {/* ⚠️ Una riga sola, il resto nel title: la spiegazione lunga
                faceva una colonna di testo alta il triplo delle altre e
                sbilanciava la fila dei numeri. Quello che serve a colpo
                d'occhio è «dichiarate · vere», il perché si legge passandoci
                sopra. */}
            <div
              className="kpi-etichetta"
              title={[
                `Conversioni dichiarate da ${ETICHETTA_CANALE[campagna.canale] ?? campagna.canale} accanto agli ordini Shopify che portano l'UTM di questa campagna.`,
                "Non si sommano: contano la stessa cosa in due modi (la piattaforma include view-through e finestre lunghe, gli ordini sono cassa entrata).",
                inCassa.ordini === 0 && inCassa.utmSimili.length > 0
                  ? `Ci sono ${formattaNumero(inCassa.utmSimili.reduce((s, u) => s + u.ordini, 0))} ordini con un UTM che somiglia al nome (${inCassa.utmSimili.map((u) => `«${u.valore}»`).join(", ")}): nomi precedenti o campagne poi divise, non attribuibili.`
                  : null,
                inCassa.ordini === 0 && inCassa.utmSimili.length === 0 && conv > 0
                  ? "Nessun ordine porta l'UTM: la piattaforma dichiara conversioni che in cassa non si ritrovano — di solito è il tracciamento, non la campagna."
                  : null,
              ]
                .filter(Boolean)
                .join(" ")}
            >
              Conversioni dichiarate · <b>ordini veri</b>
              {inCassa.vendite > 0 && <> ({formattaEuro(inCassa.vendite)})</>}
              {inCassa.ordini === 0 && conv > 0 && (
                <span style={{ color: "var(--orange)" }}>
                  {" "}· nessun ordine con l&apos;UTM
                </span>
              )}
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{click > 0 ? formattaNumero(click) : "—"}</div>
            <div className="kpi-etichetta">Click</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{r != null ? `${r.toFixed(1)}×` : "—"}</div>
            <div className="kpi-etichetta">ROAS</div>
          </div>
          {/* Il budget sta fra i numeri perché è quello che si guarda insieme
              alla spesa: «sto spendendo 281 € su un budget di quanto?». La
              matita mette in coda, non applica — vedi BudgetInline. */}
          {/* ⚠️ Budget e «quanto ne usa» in UNA tessera sola: erano due, e la
              seconda ripeteva il budget nella sua frase. Sono la stessa
              domanda — «quanto posso spendere, e quanto ne sto usando». */}
          {(() => {
            const mediaGiorno =
              campagna.metriche.length > 0 ? spesa / campagna.metriche.length : null;
            // ⚠️ Si divide per i giorni CON DATI, non per i giorni del
            // periodo: una campagna partita da tre giorni dentro una finestra
            // da trenta risulterebbe al 10% del budget senza sbagliare niente.
            const quota =
              campagna.budgetGiornaliero && campagna.budgetGiornaliero > 0 && mediaGiorno != null
                ? mediaGiorno / campagna.budgetGiornaliero
                : null;
            return (
              <div className="kpi">
                {/* ⚠️ La matita accanto AL BUDGET, non in coda alla riga: è
                    quel numero che modifica. Andando a capo con la
                    percentuale finiva accanto al «40% usato», e sembrava
                    servisse a cambiare quello. */}
                <div className="kpi-valore" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    {campagna.budgetGiornaliero != null ? formattaEuro(campagna.budgetGiornaliero) : "—"}
                    {!defunta && (
                      <BudgetInline
                        campagnaId={campagna.id}
                        budgetAttuale={campagna.budgetGiornaliero}
                        azione={creaOperazione}
                        inCoda={
                          budgetInCoda
                            ? { stato: budgetInCoda.stato, budget: budgetChiesto }
                            : null
                        }
                      />
                    )}
                  </span>
                  {quota != null && (
                    <span
                      style={{
                        fontSize: "0.62em",
                        fontWeight: 600,
                        color: quota >= 0.85 ? "var(--green)" : quota < 0.5 ? "var(--orange)" : "var(--text-secondary)",
                      }}
                      title={`${formattaEuro(mediaGiorno!)} al giorno di media sui ${campagna.metriche.length} giorni con dati`}
                    >
                      {Math.round(quota * 100)}% usato
                    </span>
                  )}
                </div>
                {/* ⚠️ La riga del cambio in attesa sta SOTTO il numero, non al
                    posto suo: il numero grande deve restare quello che Google
                    ha adesso — è su quello che si legge la spesa. Qui si
                    aggiunge solo che sta per cambiare, e a quanto. */}
                {budgetInCoda && (
                  <div
                    className="kpi-incoda"
                    style={{ color: budgetInCoda.stato === "approvata" ? "var(--blue)" : "var(--orange)" }}
                  >
                    ⏳{" "}
                    {budgetChiesto != null ? <b>{formattaEuro(budgetChiesto)}</b> : <b>un altro valore</b>}{" "}
                    {budgetInCoda.stato === "in_attesa" ? (
                      <>
                        in attesa di approvazione —{" "}
                        <a href={`/operazioni?torna=/campagne/${campagna.id}`}>vai ad approvare</a>
                      </>
                    ) : (
                      <>
                        approvato, aspetta il prossimo giro dello script
                        {budgetInCoda.approvataIl ? ` (dal ${formattaDataOra(budgetInCoda.approvataIl)})` : ""}
                      </>
                    )}
                  </div>
                )}
                <div className="kpi-etichetta">
                  Budget al giorno su Google
                  {quota != null && (
                    <>
                      {" — "}
                      {quota >= 0.85 ? "lo usa tutto" : quota < 0.5 ? "non ci arriva" : "ne usa parte"},{" "}
                      {formattaEuro(mediaGiorno!)}/g di media
                      {/* L'ultimo giorno pieno: la media nasconde le giornate
                          storte, e «212% ieri» è proprio quello che si vuole
                          vedere. */}
                      {ultimoGiornoPieno && ultimoGiornoPieno.spesa != null && campagna.budgetGiornaliero && (
                        <>
                          {" · "}
                          {formattaData(ultimoGiornoPieno.data)}: <b>{formattaEuro(ultimoGiornoPieno.spesa)}</b> (
                          {Math.round((ultimoGiornoPieno.spesa / campagna.budgetGiornaliero) * 100)}%)
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })()}
        </div>

        {defunta && (
          <div className="nota-info">
            <span className="nota-icona">⌁</span>
            <span>
              Campagna <b>defunta</b>: non compare negli elenchi, nei contatori e negli alert, e qui
              non si mostrano né la spesa di oggi, né i guardrail, né le prossime azioni. Resta lo
              storico
              {spesa > 0 ? `: i ${formattaEuro(spesa)} che ha speso sono usciti davvero e restano nei totali del brand` : ""}.
              Per rimetterla in giro basta cambiarle stato qui sopra.
            </span>
          </div>
        )}

        {/* Cosa sta per succedere su Google: in evidenza, non in fondo
            mescolato allo storico. */}
        {!defunta && (
          <CodaCampagna campagnaId={campagna.id} ritorno={`/campagne/${campagna.id}`} />
        )}

        {!defunta && <FreschezzaDati brand={campagna.brand} canale={campagna.canale} />}

        {!defunta && (
          <OggiCampagna
            campagnaId={campagna.id}
            brand={campagna.brand}
            budgetGiornaliero={campagna.budgetGiornaliero}
          />
        )}

        {/* Sotto «oggi», che è parziale per costruzione: le finestre su cui
            si decide davvero, tutte a confronto. */}
        <PerformancePeriodi
          campagnaId={campagna.id}
          metaIdEsterno={campagna.canale === "meta_ads" ? campagna.idEsterno : null}
        />

        {/* ——— Valutazione: prima si capisce, poi si decide, infine si agisce.
            I gruppi stanno qui in cima perché sono il primo taglio che spiega
            la media di campagna. ——— */}
        <section className="scheda">
          <div className="scheda-titolo" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <span>Gruppi di annunci ({gruppi.length}) · ultimi {GIORNI_LETTURA} giorni</span>
            {/* ⚠️ L'annuncio si crea da qui SOLO se il gruppo è uno. Un annuncio
                vive dentro un gruppo, e con più gruppi bisognerebbe scegliere:
                farlo scegliere in fretta da un menù, davanti a una lista di
                numeri, è il modo migliore per scrivere l'annuncio giusto nel
                posto sbagliato — e su Google si scopre a cose fatte. Con più
                gruppi si apre il gruppo, dove si vede cosa già eroga. */}
            {gruppi.length === 1 && (
              <CreaAnnuncioAi
                gruppoId={gruppi[0].id}
                nomeGruppo={gruppi[0].nome}
                azione={creaAnnuncioConAi}
                sistema={sistemaAnnuncioConAi}
                accoda={accodaAnnuncio}
                urlSuggerito={urlAnnunciCampagna}
                ritorno={`/campagne/${campagna.id}`}
                leggiBozza={leggiBozzaAnnuncio}
                salvaBozza={salvaBozzaAnnuncio}
                scartaBozza={scartaBozzaAnnuncio}
              />
            )}
          </div>
          {/* Prima della tabella, non dopo: il numero basso va spiegato mentre
              lo si legge, non quando si è già conclusa la cosa sbagliata. */}
          <CoperturaGruppi campagnaId={campagna.id} giorni={GIORNI_LETTURA} />
          <TabellaGruppi righe={gruppi} mostraCampagna={false} mostraQuota />
          {gruppi.length > 0 && (
            <p className="cella-sub" style={{ marginTop: 10 }}>
              La quota è la fetta di spesa che ogni gruppo si prende dentro questa campagna.
              Aprendo un gruppo si può metterlo in pausa: passa dalla stessa coda approvata.
            </p>
          )}
        </section>

        {/* Il venduto vero, subito dopo i gruppi: le conversioni che dichiara
            la piattaforma e gli euro entrati in cassa sono due numeri diversi,
            e quello che conta è il secondo. */}
        <VenditeCampagna
          campagna={{
            id: campagna.id,
            nome: campagna.nome,
            brand: campagna.brand,
            idEsterno: campagna.idEsterno,
          }}
        />

        <CoperturaCampagna campagnaId={campagna.id} />

        <TerminiRicerca
          campagnaId={campagna.id}
          brand={campagna.brand}
          nomeCampagna={campagna.nome}
          linguaCampagna={linguaCampagna}
          base={`/campagne/${campagna.id}`}
          altriParametri={parametriPeriodo(periodo)}
          ord={sp.ord}
          verso={sp.verso}
          periodoScelto={{ da: periodo.corrente.da, a: periodo.corrente.a, etichetta: periodo.corrente.etichetta }}
        />

        {/* Le keyword subito dopo le parole cercate: sono i due lati della
            stessa cosa — cosa abbiamo comprato e cosa ci hanno chiesto — e
            separarli vuol dire non vedere mai la distanza fra i due. */}
        {/* Le parole per cui NON vogliamo comparire. Le negative vivono qui,
            sulla campagna: e la loro casa naturale. */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
          <AggiungiNegative
            campagnaId={campagna.id}
            nomeCampagna={campagna.nome}
            azione={accodaNegativeScritte}
            ritorno={`/campagne/${campagna.id}`}
          />
        </div>
        <KeywordCampagna
          campagnaId={campagna.id}
          nomeCampagna={campagna.nome}
          brand={campagna.brand}
          base={`/campagne/${campagna.id}`}
          altriParametri={parametriPeriodo(periodo)}
          ord={sp.ordk}
          verso={sp.versok}
          soloGruppiAttivi={sp.kwg === "attivi"}
        />

        {/* Il parere dell'AI subito dopo le due tabelle: ha appena finito di
            leggerle chi legge, e la proposta arriva sui numeri che ha in testa. */}
        {!defunta && (
          <ProposteAi
            campagna={{ id: campagna.id, nome: campagna.nome, brand: campagna.brand }}
            esito={sp.aiok}
            errore={sp.ai}
          />
        )}

        <SegmentiCampagna campagnaId={campagna.id} brand={campagna.brand} />

        <DestinazioniCampagna nomeCampagna={campagna.nome} />
        {/* Si potevano solo guardare: per aggiungerne una si andava in Google
            Ads, e infatti su tre conti ce ne sono 247 ferme e intere campagne
            senza nemmeno un callout. */}
        {campagna.canale === "google_ads" && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
            <AggiungiEstensione
              campagnaId={campagna.id}
              nomeCampagna={campagna.nome}
              azione={accodaEstensione}
              ritorno={`/campagne/${campagna.id}`}
            />
          </div>
        )}
        <EstensioniCampagna campagnaId={campagna.id} nomeCampagna={campagna.nome} />

        {!defunta && <GuardrailCampagna campagnaId={campagna.id} bloccata={bloccata} salvata={salvata} />}

        {!defunta && <ProssimeAzioni campagnaId={campagna.id} />}

        <RecapModifiche campagnaId={campagna.id} />

        <AggiornaAdesso dove={`/campagne/${campagna.id}`} esito={aggiornamento} compatto />

        <div className="due-colonne">
          <div>
            <section className="scheda">
              <div className="scheda-titolo">Andamento spesa</div>
              <GraficoSpesa punti={metricheCrono.map((m) => ({ data: m.data, valore: m.spesa ?? 0 }))} />
            </section>

            <section className="scheda">
              <div className="scheda-titolo">Metriche per mese ({campagna.metriche.length} giorni)</div>
              <AndamentoMensile
                metriche={campagna.metriche}
                vuoto="Nessuna metrica: aggiungila qui sotto o via API."
              />
            </section>
          </div>

          <div>
            <section className="scheda">
              <div className="scheda-titolo">Aggiungi metrica del giorno</div>
              <form className="modulo" action={aggiungiMetrica} style={{ gridTemplateColumns: "1fr 1fr" }}>
                <input type="hidden" name="campagnaId" value={campagna.id} />
                <div className="campo-modulo">
                  <label>Giorno <span className="obbligatorio">*</span></label>
                  <input name="data" type="date" required />
                </div>
                <div className="campo-modulo">
                  <label>Spesa (€)</label>
                  <input name="spesa" type="number" step="0.01" min="0" />
                </div>
                <div className="campo-modulo">
                  <label>Impression</label>
                  <input name="impression" type="number" min="0" />
                </div>
                <div className="campo-modulo">
                  <label>Click</label>
                  <input name="click" type="number" min="0" />
                </div>
                <div className="campo-modulo">
                  <label>Conversioni</label>
                  <input name="conversioni" type="number" step="0.01" min="0" />
                </div>
                <div className="campo-modulo">
                  <label>Ricavi (€)</label>
                  <input name="ricavi" type="number" step="0.01" min="0" />
                </div>
                <div className="azioni-modulo" style={{ gridColumn: "1 / -1" }}>
                  <button className="btn small" type="submit">Salva metrica</button>
                </div>
              </form>
            </section>

            <section className="scheda">
              <div className="scheda-titolo">Dettagli</div>
              <div className="griglia-campi" style={{ gridTemplateColumns: "1fr" }}>
                <dl className="campo">
                  <dt>Budget giornaliero</dt>
                  <dd>{formattaEuro(campagna.budgetGiornaliero)}</dd>
                </dl>
                <dl className="campo">
                  <dt>Periodo</dt>
                  <dd>{formattaData(campagna.inizio)} → {formattaData(campagna.fine)}</dd>
                </dl>
                <dl className="campo">
                  <dt>Id piattaforma</dt>
                  <dd>{campagna.idEsterno ?? "—"}</dd>
                </dl>
                <dl className="campo">
                  <dt>Landing di destinazione</dt>
                  <dd>
                    {campagna.landing ? (
                      <a href={`/landing/${campagna.landing.id}`} style={{ color: "var(--blue)", overflowWrap: "anywhere" }}>
                        {campagna.landing.url}
                      </a>
                    ) : (
                      "—"
                    )}
                  </dd>
                </dl>
                <dl className="campo">
                  <dt style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    Località (targeting Google)
                    {/* Si leggevano e basta: cambiarle voleva dire andare in
                        Google Ads, per una delle poche decisioni che spostano
                        davvero la spesa. */}
                    {campagna.canale === "google_ads" && (
                      <CambiaLocalita
                        campagnaId={campagna.id}
                        nomeCampagna={campagna.nome}
                        attuali={campagna.localita
                          .filter((l) => !l.esclusa)
                          .map((l) => ({ idEsterno: l.idEsterno, nome: l.nome, tipo: l.tipo }))}
                        azione={accodaCambioLocalita}
                        ritorno={`/campagne/${campagna.id}`}
                      />
                    )}
                  </dt>
                  <dd style={{ overflowWrap: "anywhere" }}>
                    {campagna.localita.length === 0 ? (
                      /* Mai lette ≠ nessuna: senza questa frase, una campagna
                         nazionale e una mai importata si leggerebbero uguali. */
                      <span className="cella-muta">
                        non ancora lette — arrivano col giro anagrafica dello script aggiornato al 10/08
                      </span>
                    ) : (
                      <>
                        {campagna.localita
                          .filter((l) => !l.esclusa)
                          .map(
                            (l) =>
                              `${l.nome}${l.modificatore != null ? ` (offerta ×${l.modificatore})` : ""}`
                          )
                          .join(" · ") || "nessuna mirata"}
                        {campagna.localita.some((l) => l.esclusa) && (
                          <div className="cella-sub" style={{ whiteSpace: "normal" }}>
                            escluse: {campagna.localita.filter((l) => l.esclusa).map((l) => l.nome).join(" · ")}
                          </div>
                        )}
                      </>
                    )}
                  </dd>
                </dl>
                {campagna.note && (
                  <dl className="campo">
                    <dt>Note</dt>
                    <dd>{campagna.note}</dd>
                  </dl>
                )}
              </div>
            </section>

            {/* LE PAROLE ESCLUSE. Fino al 23/08/2026 la scheda diceva solo su
                cosa si SPENDE: metà della campagna — quella che decide cosa
                NON arriva — non era da nessuna parte, e le operazioni
                «Escludi parole» sparivano dentro Google senza lasciare un
                elenco da rileggere. */}
            <section className="scheda">
              <div className="scheda-titolo">
                Parole escluse{negative.length > 0 ? ` (${negative.length})` : ""}
              </div>
              {negative.length === 0 ? (
                <div className="vuoto-mini" style={{ whiteSpace: "normal" }}>
                  {ultimoCensimentoNegative
                    ? `Nessuna parola esclusa su questa campagna (censimento del ${formattaDataOra(ultimoCensimentoNegative.ricevutoIl)}).`
                    : /* Mai censite ≠ nessuna, come per le località: senza
                         questa frase una campagna senza esclusioni e una mai
                         letta si leggono uguali, e sono opposte. */
                      "Non ancora censite: arrivano col giro «negative» dello script (da reincollare in Google Ads)."}
                </div>
              ) : (
                <>
                  <ul className="storia">
                    {negative.map((n) => (
                      <li key={n.id}>
                        <span className="storia-testo">
                          <span className="cella-nome">{n.testo}</span>
                          {/* La corrispondenza decide QUANTO blocca: senza
                              scriverla, «cheap» esatta e «cheap» generica si
                              leggono uguali e spengono cose diversissime. */}
                          <span className="cella-sub">
                            {ETICHETTA_MATCH_NEGATIVA[n.corrispondenza] ?? n.corrispondenza}
                            {n.livello === "gruppo" ? ` · solo nel gruppo ${n.gruppo ?? "?"}` : " · tutta la campagna"}
                          </span>
                        </span>
                        <span className="storia-data" style={{ flex: "0 0 auto" }}>
                          {formattaData(n.vistaIl)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {/* ⚠️ Il limite si dichiara accanto all'elenco, non in fondo
                      alla pagina: le liste di esclusione condivise vivono in
                      shared_set e non compaiono fra i criteri della campagna.
                      Leggere questo elenco come completo vuol dire riescludere
                      parole già spente. */}
                  <div className="cella-sub" style={{ whiteSpace: "normal", marginTop: 10 }}>
                    ⚠️ Qui ci sono le esclusioni scritte sulla campagna e sui suoi gruppi. Le{" "}
                    <a href="/liste-escluse" style={{ color: "var(--blue)" }}>liste condivise</a>{" "}
                    applicate alla campagna spengono altre parole che non compaiono in questo elenco.
                  </div>
                </>
              )}
            </section>

            <section className="scheda">
              <div className="scheda-titolo">Azioni sulla campagna ({campagna.azioni.length})</div>
              {campagna.azioni.length === 0 ? (
                <div className="vuoto-mini">Nessuna azione collegata</div>
              ) : (
                <ul className="storia">
                  {campagna.azioni.map((a) => (
                    <li key={a.id}>
                      <span className="storia-testo">
                        <a href={`/azioni/${a.id}`} className="cella-nome">{a.titolo}</a>
                      </span>
                      <span className="storia-autore">
                        <Badge testo={ETICHETTA_STATO_AZIONE[a.stato] ?? a.stato} colore={COLORE_STATO_AZIONE[a.stato] ?? "var(--text-tertiary)"} />
                      </span>
                      {a.scadenza && (
                        <span className="storia-data" style={{ flex: "0 0 auto" }}>
                          <Scadenza data={a.scadenza} chiusa={!STATI_AZIONE_APERTI.includes(a.stato)} />
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>

        {/* Il dialogo di «Porta altrove», uno solo per pagina: i bottoni delle
            righe (parole cercate) lo aprono con un ascoltatore delegato. Lo
            stesso componente della pagina Keywords, stessa coda, stesse
            regole — non una seconda strada che gli somiglia. */}
        <PortaKeyword
          campagne={campagneDoveportare}
          ritorno={`/campagne/${campagna.id}`}
          azione={applicaKeywordAdAltreCampagne}
        />
      </main>
    </div>
  );
}
