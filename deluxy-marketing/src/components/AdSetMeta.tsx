import { Badge } from "@/components/Badge";
import { creaOperazioneBudgetGruppo, creaOperazioneGruppo, creaOperazioneTargeting } from "@/lib/azioni";
import { prisma } from "@/lib/db";
import { ETICHETTA_OPERAZIONE, formattaEuro, formattaNumero } from "@/lib/dominio";
import { breakEvenRoas } from "@/lib/guardrail";
import { leggiAdSetDiCampagnaMeta, leggiTargetingAdSetMeta, metaConfigurato } from "@/lib/meta";

// GLI AD SET DI UNA CAMPAGNA META — «dentro» la campagna.
//
// ⚠️⚠️ PERCHÉ ESISTE (11/09/2026, richiesta dell'utente: «al click devo poter
// entrare sulla singola campagna e apportare tutte le modifiche come se fossi
// su Business Meta»). Fino a oggi una campagna Meta si poteva solo spegnere,
// riaccendere o cambiare di budget **tutta intera**: gli ad set non erano
// nemmeno censiti, e la scheda diceva «Gruppi di annunci (0)». Su una campagna
// da 35 €/g con due ad set, «tutta o niente» vuol dire non poter decidere.
//
// Le tre cose che questo riquadro mette insieme, e da dove vengono:
//  · **il budget e lo stato** si leggono VIVI da Meta a ogni apertura. Non li
//    salviamo: `Gruppo` non ha un campo budget, e aggiungerlo vorrebbe dire un
//    `db push` sul cluster condiviso per un numero che Meta sa già.
//  · **spesa, incasso e resa** vengono da `MetricaGruppo`, riempita dalla sync
//    con le insights `level=adset`. Sono i numeri del PERIODO scelto in cima.
//  · **le operazioni in coda** dalla coda: una decisione presa e non ancora
//    eseguita deve vedersi qui, o si riaccoda due volte.
//
// ⚠️ Se Meta non risponde, il riquadro NON sparisce: mostra quello che sa dal
// database e dice che il vivo non è arrivato. Un riquadro che scompare quando
// una lettura fallisce si legge come «non ci sono ad set», che è falso.

const ETICHETTA_OBIETTIVO: Record<string, string> = {
  OFFSITE_CONVERSIONS: "conversioni sul sito",
  LINK_CLICKS: "click sul link",
  LANDING_PAGE_VIEWS: "visite alla pagina",
  IMPRESSIONS: "comparse",
  REACH: "copertura",
  THRUPLAY: "visualizzazioni video",
  VALUE: "valore",
  LEAD_GENERATION: "contatti",
};

export async function AdSetMeta({
  campagnaId,
  idEsternoCampagna,
  brand,
  periodo,
  ritorno,
  defunta,
}: {
  campagnaId: string;
  idEsternoCampagna: string | null;
  brand: string;
  /** Il periodo scelto in cima alla pagina: i numeri qui lo seguono. */
  periodo: { da: Date; a: Date; etichetta: string };
  ritorno: string;
  defunta: boolean;
}) {
  const gruppi = await prisma.gruppo.findMany({
    where: { campagnaId, canale: "meta_ads" },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true, idEsterno: true, statoPiattaforma: true, stato: true, tipo: true },
  });

  // Il vivo da Meta: budget e stato di adesso. Si chiede solo se c'è il token e
  // l'id della campagna — altrimenti si resta su quello che sa il database.
  const vivo =
    idEsternoCampagna && metaConfigurato()
      ? await leggiAdSetDiCampagnaMeta(idEsternoCampagna)
      : { adset: [], errore: metaConfigurato() ? "questa campagna non ha un id di piattaforma" : "META_ACCESS_TOKEN non impostato" };
  const perId = new Map(vivo.adset.map((a) => [a.id, a]));

  // ⚠️ Gli ad set che Meta riporta e l'app non ha ancora censito: si dicono,
  // non si nascondono. Vuol dire che la sync non è ancora passata da qui, e
  // chi guarda deve saperlo — altrimenti conta due ad set dove ce ne sono tre.
  const noti = new Set(gruppi.map((g) => g.idEsterno));
  const nonCensiti = vivo.adset.filter((a) => !noti.has(a.id));

  // ——— Il PUBBLICO di ogni ad set, letto vivo ———
  //
  // ⚠️ È una chiamata alla Graph API per ad set: si fa solo per i primi
  // `TETTO_TARGETING`, e sopra quel numero la pagina lo DICE invece di
  // diventare lenta in silenzio. Dentro una campagna gli ad set sono due o
  // tre; se un giorno fossero venti, meglio una riga onesta che dodici secondi
  // di attesa.
  const TETTO_TARGETING = 8;
  const conId = gruppi.filter((g) => g.idEsterno);
  const daLeggere = metaConfigurato() ? conId.slice(0, TETTO_TARGETING) : [];
  const letture = await Promise.all(
    daLeggere.map(async (g) => [g.id, await leggiTargetingAdSetMeta(g.idEsterno as string)] as const)
  );
  const pubblicoDi = new Map(letture);
  const targetingTroncato = conId.length > daLeggere.length && metaConfigurato();

  // I pubblici che l'app ha censito su questo brand: sono le uniche scelte
  // ammesse, e gli id sono quelli di Meta (`idEsterno`), non i nostri.
  const pubbliciCensiti = await prisma.pubblico.findMany({
    where: {
      piattaforma: "meta",
      brand,
      idEsterno: { not: null },
      stato: { notIn: ["estinto", "obsoleto", "da_creare"] },
    },
    orderBy: [{ tipo: "asc" }, { nome: "asc" }],
    select: { idEsterno: true, nome: true, tipo: true, dimensione: true },
  });

  if (gruppi.length === 0 && vivo.adset.length === 0) {
    return (
      <section className="scheda">
        <div className="scheda-titolo">Ad set di questa campagna</div>
        <div className="vuoto-mini" style={{ whiteSpace: "normal" }}>
          Nessun ad set. {vivo.errore ? `Il vivo da Meta non è arrivato: ${vivo.errore}.` : "Li porta la sincronizzazione Meta (ogni ora), che li legge dal nodo /adsets dell'account."}
        </div>
      </section>
    );
  }

  const ids = gruppi.map((g) => g.id);
  const [somme, inCoda] = await Promise.all([
    prisma.metricaGruppo.groupBy({
      by: ["gruppoId"],
      where: { gruppoId: { in: ids }, data: { gte: periodo.da, lt: periodo.a } },
      _sum: { spesa: true, ricavi: true, click: true, impression: true, conversioni: true },
    }),
    prisma.operazioneAdv.findMany({
      where: { gruppoId: { in: ids }, stato: { in: ["in_attesa", "approvata"] } },
      select: { gruppoId: true, tipo: true, stato: true },
      orderBy: { creataIl: "asc" },
    }),
  ]);
  const numeri = new Map(somme.map((s) => [s.gruppoId, s._sum]));
  const attese = new Map<string, { tipo: string; stato: string }[]>();
  for (const o of inCoda) {
    if (!o.gruppoId) continue;
    const v = attese.get(o.gruppoId) ?? [];
    v.push({ tipo: o.tipo, stato: o.stato });
    attese.set(o.gruppoId, v);
  }

  const be = breakEvenRoas(brand);
  const totale = gruppi.reduce((s, g) => s + (numeri.get(g.id)?.spesa ?? 0), 0);

  return (
    <section className="scheda" id="adset">
      <div className="scheda-titolo">Ad set di questa campagna ({gruppi.length})</div>
      <p className="cella-sub" style={{ whiteSpace: "normal", marginBottom: 10 }}>
        <b>Budget e stato sono letti vivi da Meta</b> a ogni apertura; spesa, incasso e resa sono del
        periodo scelto in cima ({periodo.etichetta.toLowerCase()}) e arrivano dalla sincronizzazione.
        Ogni modifica passa dalla coda approvata, come sulla campagna.
        {vivo.errore && (
          <>
            {" "}
            <b style={{ color: "var(--orange)" }}>
              Il vivo da Meta non è arrivato ({vivo.errore}): budget e stato qui sotto sono quelli
              dell&apos;ultima sincronizzazione.
            </b>
          </>
        )}
      </p>

      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Ad set</th>
              <th>Stato</th>
              <th className="num">Budget</th>
              <th className="num">Spesa</th>
              <th className="num">Quota</th>
              <th className="num">Clic</th>
              <th className="num">Conv.</th>
              <th className="num">Incasso</th>
              <th className="num">Resa</th>
              <th>Azione decisa</th>
              <th>Azioni</th>
            </tr>
          </thead>
          <tbody>
            {gruppi.map((g) => {
              const v = g.idEsterno ? perId.get(g.idEsterno) : undefined;
              const n = numeri.get(g.id);
              const spesa = n?.spesa ?? 0;
              const incasso = n?.ricavi ?? 0;
              const resa = spesa > 0 ? incasso / spesa : null;
              // Lo stato: il vivo comanda quando c'è, altrimenti l'ultimo letto.
              const acceso = v ? (v.effettivo ?? v.stato) === "ACTIVE" : g.statoPiattaforma === "ENABLED";
              const budget = v?.budgetGiorno ?? null;
              const az = attese.get(g.id) ?? [];
              return (
                <tr key={g.id}>
                  <td style={{ maxWidth: 260 }}>
                    <b>{g.nome}</b>
                    {g.tipo && (
                      <div className="cella-sub">
                        ottimizza: {ETICHETTA_OBIETTIVO[g.tipo] ?? g.tipo.toLowerCase()}
                      </div>
                    )}
                  </td>
                  <td>
                    <Badge
                      testo={acceso ? "Attivo su Meta" : "In pausa su Meta"}
                      colore={acceso ? "var(--green)" : "var(--text-tertiary)"}
                    />
                  </td>
                  <td className="num">
                    {/* ⚠️⚠️ «NON LETTO» NON È «NON C'È». Se il vivo da Meta non
                        è arrivato, il budget è un «non lo so» e va detto così:
                        scrivere «sulla campagna» vorrebbe dire affermare che
                        l'ad set non ha un budget suo — che è una notizia, e
                        falsa. (Trappola «permesso mancante ≠ dato mancante».) */}
                    {budget != null ? (
                      formattaEuro(budget) + "/g"
                    ) : v?.budgetTotale != null ? (
                      <span title="Budget a durata, non giornaliero">{formattaEuro(v.budgetTotale)} totale</span>
                    ) : v ? (
                      <span
                        className="cella-muta"
                        title="Nessun budget sull'ad set: con la CBO il budget sta sulla campagna e Meta lo distribuisce da sé. Per cambiarlo si cambia quello della campagna."
                      >
                        sulla campagna
                      </span>
                    ) : (
                      <span style={{ color: "var(--orange)" }} title="Il budget si legge vivo da Meta: questa lettura non è arrivata, quindi non lo sappiamo.">
                        non letto
                      </span>
                    )}
                  </td>
                  <td className="num">{spesa > 0 ? formattaEuro(spesa) : "—"}</td>
                  <td className="num cella-muta">
                    {totale > 0 ? `${Math.round((spesa / totale) * 100)}%` : "—"}
                  </td>
                  <td className="num cella-muta">{formattaNumero(n?.click ?? 0)}</td>
                  <td className="num cella-muta">{formattaNumero(Math.round((n?.conversioni ?? 0) * 10) / 10)}</td>
                  <td className="num">{incasso > 0 ? formattaEuro(incasso) : "—"}</td>
                  <td
                    className="num"
                    style={{
                      fontWeight: 600,
                      color:
                        resa == null
                          ? undefined
                          : resa >= be * 1.5
                            ? "var(--green)"
                            : resa >= be
                              ? "var(--blue)"
                              : "var(--red)",
                    }}
                    title={`Break-even di ${brand}: ${be.toFixed(2).replace(".", ",")}×`}
                  >
                    {resa != null ? `${resa.toFixed(2).replace(".", ",")}×` : "—"}
                  </td>
                  <td>
                    {az.length === 0 ? (
                      <span className="cella-muta">—</span>
                    ) : (
                      az.map((a, i) => (
                        <div key={i} className="cella-sub" style={{ color: "var(--orange)", whiteSpace: "normal" }}>
                          ⏳ {ETICHETTA_OPERAZIONE[a.tipo] ?? a.tipo}
                          {a.stato === "in_attesa" ? " · da approvare" : " · approvata"}
                        </div>
                      ))
                    )}
                  </td>
                  <td>
                    {defunta ? (
                      <span className="cella-muta">campagna defunta</span>
                    ) : az.length > 0 ? (
                      <span className="cella-sub">c&apos;è già una decisione in coda</span>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                        <form action={creaOperazioneGruppo} style={{ display: "inline-flex" }}>
                          <input type="hidden" name="gruppoId" value={g.id} />
                          <input type="hidden" name="ritorno" value={`${ritorno}#adset`} />
                          <input type="hidden" name="tipo" value={acceso ? "pausa_gruppo" : "attiva_gruppo"} />
                          <button
                            className="btn small btn-secondario"
                            type="submit"
                            title={
                              acceso
                                ? "Mette in coda la pausa di QUESTO ad set: gli altri della campagna continuano"
                                : "Mette in coda la riattivazione di questo ad set"
                            }
                          >
                            {acceso ? "Metti in pausa" : "Riattiva"}
                          </button>
                        </form>
                        {/* ⚠️⚠️ IL CAMPO BUDGET SI OFFRE SOLO SE SI PUÒ SCRIVERE.
                            Due casi in cui NON si può, e in cui un campo attivo
                            sarebbe una promessa che Meta rifiuta:
                             · **CBO**: se l'ad set non ha un budget proprio, il
                               budget sta sulla campagna e Meta non accetta un
                               `daily_budget` sull'ad set. Si rimanda al riquadro
                               dei comandi della campagna, che quel budget lo
                               cambia già.
                             · **vivo non letto**: senza il valore di adesso non
                               si sa da dove si parte, e il guardrail non
                               potrebbe valutare la variazione.
                            Un comando che può solo fallire non si mostra spento
                            e muto: si spiega. */}
                        {budget != null ? (
                          <form action={creaOperazioneBudgetGruppo} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                            <input type="hidden" name="gruppoId" value={g.id} />
                            <input type="hidden" name="ritorno" value={`${ritorno}#adset`} />
                            <input type="hidden" name="budgetOra" value={budget} />
                            <input
                              type="number"
                              name="budget"
                              min="1"
                              step="0.5"
                              defaultValue={String(budget)}
                              placeholder="€/g"
                              aria-label={`Budget giornaliero di ${g.nome}`}
                              style={{
                                width: 78,
                                font: "inherit",
                                padding: "4px 8px",
                                borderRadius: 8,
                                border: "1px solid var(--hairline-strong)",
                              }}
                            />
                            <button
                              className="btn small btn-secondario"
                              type="submit"
                              title="Mette in coda il cambio di budget di questo ad set. È un L2 come sulla campagna: il guardrail lo valuta."
                            >
                              Budget
                            </button>
                          </form>
                        ) : v ? (
                          <span className="cella-sub" style={{ whiteSpace: "normal" }}>
                            budget sulla campagna (CBO): si cambia dal riquadro dei comandi qui sotto
                          </span>
                        ) : (
                          <span className="cella-sub" style={{ whiteSpace: "normal", color: "var(--orange)" }}>
                            budget non letto da Meta: non si può cambiare alla cieca
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {nonCensiti.length > 0 && (
        <p className="cella-sub" style={{ whiteSpace: "normal", marginTop: 10, color: "var(--orange)" }}>
          ⚠️ Meta riporta {nonCensiti.length} ad set che l&apos;app non ha ancora censito
          ({nonCensiti.map((a) => `«${a.nome}»`).join(", ")}): arrivano col prossimo giro della
          sincronizzazione. Finché non ci sono, i numeri qui sopra non li comprendono.
        </p>
      )}


      {/* ——— IL PUBBLICO DI OGNI AD SET ———
          Sta qui e non in una pagina sua perché la domanda «a chi parla questo
          ad set» si fa guardando la sua resa, che è nella riga sopra.

          ⚠️⚠️ IL MODULO È A CAMPI VUOTI, E NON È PIGRIZIA. Su Meta il
          targeting si scrive tutto insieme: un modulo precompilato coi valori
          di adesso, rimandato senza toccare niente, sarebbe un cambio di
          pubblico **L3 a vuoto** — approvato, eseguito, e registrato nel
          paper-trail come se qualcuno avesse deciso qualcosa. Con i campi
          vuoti «non scritto» vuol dire «lascia com'è», e quello che si legge
          nel riquadro accanto è lo stato di adesso. */}
      {conId.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div className="scheda-titolo" style={{ fontSize: 13 }}>
            A chi parla ogni ad set
          </div>
          {/* ⚠️ Senza token non si legge NIENTE, e il titolo da solo sarebbe un
              riquadro vuoto: uno spazio bianco sotto un'intestazione si legge
              come «questo ad set non ha un pubblico», che e' falso. E il
              modulo non si offre: l'esecutore si rifiuta di scrivere un
              targeting senza aver letto quello di adesso, quindi sarebbe un
              bottone che puo' solo fallire. */}
          {!metaConfigurato() && (
            <p className="cella-sub" style={{ whiteSpace: "normal", color: "var(--orange)" }}>
              Il pubblico di un ad set (età, luoghi, pubblici salvati) si legge <b>vivo da Meta</b>,
              e qui il token non è impostato: non lo si può né leggere né cambiare da questa copia
              dell&apos;app. In produzione il riquadro mostra il pubblico di adesso e il modulo per
              cambiarlo.
            </p>
          )}
          {targetingTroncato && (
            <p className="cella-sub" style={{ whiteSpace: "normal", color: "var(--orange)" }}>
              Il pubblico si legge vivo da Meta, una chiamata per ad set: qui sotto ci sono i primi{" "}
              {TETTO_TARGETING} di {conId.length}. Gli altri si guardano dalla loro riga in Ads
              Manager — non li mostro per non far aspettare la pagina.
            </p>
          )}
          {daLeggere.map((g) => {
            const letto = pubblicoDi.get(g.id);
            const t = letto?.targeting ?? null;
            const inCoda = (attese.get(g.id) ?? []).some((o) => o.tipo === "targeting");
            return (
              <details key={g.id} className="vend-riga">
                <summary>
                  <b>{g.nome}</b>{" "}
                  <span className="cella-sub">
                    {t ? t.riassunto.join(" · ") : `pubblico non letto (${letto?.errore ?? "non chiesto"})`}
                  </span>
                </summary>

                {inCoda ? (
                  <p className="cella-sub" style={{ whiteSpace: "normal", marginTop: 10, color: "var(--orange)" }}>
                    ⏳ C&apos;è già un cambio di pubblico in coda su questo ad set: se ne mette uno
                    per volta, perché due si applicherebbero uno sopra l&apos;altro e il secondo
                    partirebbe da una base diversa da quella che chi l&apos;ha scritto aveva davanti.
                  </p>
                ) : (
                  <form action={creaOperazioneTargeting} style={{ marginTop: 10 }}>
                    <input type="hidden" name="gruppoId" value={g.id} />
                    <input type="hidden" name="ritorno" value={`${ritorno}#adset`} />

                    <p className="cella-sub" style={{ whiteSpace: "normal", marginBottom: 8 }}>
                      <b>Quello che lasci vuoto non si tocca.</b> Età e genere sono un <b>L2</b>;
                      luoghi e pubblici sono un <b>L3</b>, perché cambiano il mercato e non la
                      domanda dentro lo stesso mercato. Come tutto il resto passa dalla coda: qui si
                      mette in coda, non si scrive su Meta.
                    </p>

                    <div className="modulo" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
                      <div className="campo-modulo">
                        <label>Età minima</label>
                        <input
                          type="number"
                          name="etaMin"
                          min="13"
                          max="65"
                          placeholder={t?.eta.min != null ? `adesso ${t.eta.min}` : "adesso: non impostata"}
                        />
                      </div>
                      <div className="campo-modulo">
                        <label>Età massima</label>
                        <input
                          type="number"
                          name="etaMax"
                          min="13"
                          max="65"
                          placeholder={t?.eta.max != null ? `adesso ${t.eta.max}` : "adesso: non impostata"}
                        />
                      </div>
                      <div className="campo-modulo">
                        <label>Genere</label>
                        <select name="genere" defaultValue="">
                          <option value="">— lascia com&apos;è ({t ? t.genere : "non letto"}) —</option>
                          <option value="tutti">Tutti</option>
                          <option value="uomini">Solo uomini</option>
                          <option value="donne">Solo donne</option>
                        </select>
                      </div>

                      <div className="campo-modulo">
                        <label>Paesi (codici, es. IT FR)</label>
                        <input
                          name="paesi"
                          placeholder={t && t.paesi.length > 0 ? `adesso ${t.paesi.join(" ")}` : "adesso: nessuno"}
                        />
                        <span className="campo-aiuto">
                          Sostituisce l&apos;elenco dei paesi, non si aggiunge.
                        </span>
                      </div>
                      <div className="campo-modulo largo">
                        <label>Città (una per riga, «nome | km»)</label>
                        <textarea
                          name="citta"
                          rows={2}
                          placeholder={
                            t && t.citta.length > 0
                              ? `adesso: ${t.citta.map((c) => (c.raggioKm ? `${c.nome} | ${c.raggioKm}` : c.nome)).join(" · ")}`
                              : "adesso: nessuna — es. Milano | 15"
                          }
                        />
                        <span className="campo-aiuto">
                          Sostituisce l&apos;elenco delle città. Il nome lo traduce l&apos;app
                          chiedendo a Meta: se è ambiguo non sceglie e lo scrive nell&apos;esito.
                        </span>
                      </div>
                    </div>

                    {/* ⚠️ I pubblici si toccano solo se lo si dichiara: senza
                        questa spunta un modulo mandato per cambiare l'età
                        avrebbe TOLTO tutti i pubblici (nessuna casella
                        spuntata = elenco vuoto). È la trappola del modulo
                        parziale, e qui costa il pubblico migliore. */}
                    {pubbliciCensiti.length > 0 ? (
                      <details style={{ marginTop: 8 }}>
                        <summary className="cella-sub">
                          Pubblici personalizzati — {t ? t.pubblici.length : "?"} adesso su questo
                          ad set, {pubbliciCensiti.length} disponibili
                        </summary>
                        <label
                          className="cella-sub"
                          style={{ display: "flex", gap: 6, alignItems: "center", margin: "8px 0" }}
                        >
                          <input type="checkbox" name="toccaPubblici" value="1" />
                          <b>Cambia anche i pubblici</b> — senza questa spunta restano quelli di
                          adesso
                        </label>
                        {/* ⚠️ Su Gifts i pubblici censiti sono un centinaio:
                            un elenco lungo cosi', dentro un modulo, spinge il
                            bottone fuori dalla schermata — e un comando che
                            non si vede non si preme. Si scorre dentro il suo
                            riquadro, come le tabelle larghe. */}
                        <div style={{ display: "grid", gap: 4, maxHeight: 220, overflowY: "auto", paddingRight: 4 }}>
                          {pubbliciCensiti.map((pb) => (
                            <label
                              key={pb.idEsterno}
                              className="cella-sub"
                              style={{ display: "flex", gap: 6, alignItems: "center" }}
                            >
                              <input
                                type="checkbox"
                                name="pubblici"
                                value={pb.idEsterno as string}
                                defaultChecked={t ? t.pubblici.some((x) => x.id === pb.idEsterno) : false}
                              />
                              {pb.nome} <span className="cella-muta">· {pb.tipo}</span>
                              {pb.dimensione != null && (
                                <span className="cella-muta">· {formattaNumero(pb.dimensione)}</span>
                              )}
                            </label>
                          ))}
                        </div>
                        <p className="cella-sub" style={{ whiteSpace: "normal", marginTop: 6 }}>
                          Spuntando «cambia anche i pubblici» vale quello che è selezionato qui:
                          niente selezionato vuol dire <b>togliere tutti i pubblici</b>, e
                          l&apos;operazione lo scrive fra gli avvisi.
                        </p>
                      </details>
                    ) : (
                      <p className="cella-sub" style={{ whiteSpace: "normal", marginTop: 8 }}>
                        Nessun pubblico censito per {brand}: si censiscono da{" "}
                        <a href="/pubblici" style={{ color: "var(--blue)" }}>Pubblici</a>, e finché
                        non ci sono non si possono scegliere da qui — mandare a Meta un id non
                        censito vorrebbe dire scoprire l&apos;errore dopo l&apos;approvazione.
                      </p>
                    )}

                    <div className="modulo" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 8 }}>
                      <div className="campo-modulo">
                        <label>Perché</label>
                        <input name="motivo" placeholder="es. il 18-24 non converte" />
                      </div>
                      <div className="campo-modulo">
                        <label>Come si torna indietro</label>
                        <input name="rollbackPiano" placeholder="es. rimetto 18-65 se la resa cala a 3 giorni" />
                        <span className="campo-aiuto">
                          Sulle campagne traino il guardrail lo chiede: il pubblico di adesso resta
                          scritto nell&apos;operazione, così tornare indietro non è a memoria.
                        </span>
                      </div>
                    </div>

                    <button className="btn small" type="submit" style={{ marginTop: 8 }}>
                      Metti in coda il cambio di pubblico
                    </button>
                  </form>
                )}
              </details>
            );
          })}
        </div>
      )}

      <p className="cella-sub" style={{ whiteSpace: "normal", marginTop: 10 }}>
        La <b>quota</b> è la fetta di spesa che ogni ad set si prende dentro la campagna. Un ad set
        senza budget proprio non è un errore: con la <b>CBO</b> il budget sta sulla campagna ed è
        Meta a distribuirlo. La resa è colorata sul break-even di {brand} (
        {be.toFixed(2).replace(".", ",")}×).
      </p>
    </section>
  );
}
