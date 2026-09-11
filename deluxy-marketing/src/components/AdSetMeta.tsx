import { Badge } from "@/components/Badge";
import { creaOperazioneBudgetGruppo, creaOperazioneGruppo } from "@/lib/azioni";
import { prisma } from "@/lib/db";
import { ETICHETTA_OPERAZIONE, formattaEuro, formattaNumero } from "@/lib/dominio";
import { breakEvenRoas } from "@/lib/guardrail";
import { leggiAdSetDiCampagnaMeta, metaConfigurato } from "@/lib/meta";

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

      <p className="cella-sub" style={{ whiteSpace: "normal", marginTop: 10 }}>
        La <b>quota</b> è la fetta di spesa che ogni ad set si prende dentro la campagna. Un ad set
        senza budget proprio non è un errore: con la <b>CBO</b> il budget sta sulla campagna ed è
        Meta a distribuirlo. La resa è colorata sul break-even di {brand} (
        {be.toFixed(2).replace(".", ",")}×).
      </p>
    </section>
  );
}
