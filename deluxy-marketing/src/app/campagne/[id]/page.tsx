import { notFound } from "next/navigation";
import { cittaDaTesto } from "@/lib/citta";
import { AndamentoMensile } from "@/components/AndamentoMensile";
import { FreschezzaDati } from "@/components/FreschezzaDati";
import { GuardrailCampagna } from "@/components/GuardrailCampagna";
import { KeywordCampagna } from "@/components/KeywordCampagna";
import { ProposteAi } from "@/components/ProposteAi";
import { Badge } from "@/components/Badge";
import { GraficoSpesa } from "@/components/GraficoSpesa";
import { AggiornaAdesso } from "@/components/AggiornaAdesso";
import { CoperturaCampagna } from "@/components/CoperturaCampagna";
import { CoperturaGruppi } from "@/components/CoperturaGruppi";
import { DestinazioniCampagna } from "@/components/DestinazioniCampagna";
import { EstensioniCampagna } from "@/components/EstensioniCampagna";
import { OggiCampagna } from "@/components/OggiCampagna";
import { PerformancePeriodi } from "@/components/PerformancePeriodi";
import { SegmentiCampagna } from "@/components/SegmentiCampagna";
import { TerminiRicerca } from "@/components/TerminiRicerca";
import { ProssimeAzioni } from "@/components/ProssimeAzioni";
import { RecapModifiche } from "@/components/RecapModifiche";
import { Scadenza } from "@/components/Scadenza";
import { SceltaPeriodo } from "@/components/SceltaPeriodo";
import { Sidebar } from "@/components/Sidebar";
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
  creaOperazione,
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
  formattaEuro,
  formattaNumero,
  roas,
  SPIEGA_STATO_CAMPAGNA,
  STATI_AZIONE_APERTI,
  STATI_CAMPAGNA,
  STATI_CAMPAGNA_IGNORATE,
} from "@/lib/dominio";

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
                      : nomiMirate.length <= 4
                        ? nomiMirate.join(" · ")
                        : `${nomiMirate.slice(0, 3).join(" · ")} e altre ${nomiMirate.length - 3}`}
                    {escluse.length > 0 && (
                      <span style={{ opacity: 0.65 }}>
                        {" — esclude "}
                        {escluse.length <= 3
                          ? escluse.map((l) => l.nome).join(", ")
                          : `${escluse.length} località`}
                      </span>
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
          <a className="btn" href={`/azioni/nuova?campagna=${campagna.id}&brand=${campagna.brand}`}>Nuova azione sulla campagna</a>
        </div>

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

        <SceltaPeriodo periodo={periodo} da={sp.da} a={sp.a} azione={`/campagne/${campagna.id}`} />

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

        {!defunta && <FreschezzaDati brand={campagna.brand} canale={campagna.canale} />}

        {!defunta && (
          <OggiCampagna
            campagnaId={campagna.id}
            brand={campagna.brand}
            budgetGiornaliero={campagna.budgetGiornaliero}
          />
        )}

        {/* Sotto «oggi», che è parziale per costruzione: le finestre su cui si
            decide davvero, con il grafico della spesa. */}
        <PerformancePeriodi
          campagnaId={campagna.id}
          base={`/campagne/${campagna.id}`}
          scelta={sp.perf}
        />

        {/* ——— Valutazione: prima si capisce, poi si decide, infine si agisce.
            I gruppi stanno qui in cima perché sono il primo taglio che spiega
            la media di campagna. ——— */}
        <section className="scheda">
          <div className="scheda-titolo">
            Gruppi di annunci ({gruppi.length}) · ultimi {GIORNI_LETTURA} giorni
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
        <KeywordCampagna
          campagnaId={campagna.id}
          nomeCampagna={campagna.nome}
          brand={campagna.brand}
          base={`/campagne/${campagna.id}`}
          altriParametri={parametriPeriodo(periodo)}
          ord={sp.ordk}
          verso={sp.versok}
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
                  <dt>Località (targeting Google)</dt>
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
