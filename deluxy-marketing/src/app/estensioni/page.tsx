import { Sidebar } from "@/components/Sidebar";
import { prisma } from "@/lib/db";
import { ETICHETTA_BRAND, formattaEuro, formattaNumero } from "@/lib/dominio";

export const dynamic = "force-dynamic";

// TUTTE le estensioni, in un posto solo.
//
// ⚠️ PERCHÉ SERVIVA UNA PAGINA. Le estensioni si vedevano solo dentro la
// singola campagna, una campagna per volta: per sapere se un brand aveva i
// callout bisognava aprire venti schede e contare a occhio. E la domanda vera
// («dove manca qualcosa?» «cosa è spento?») è per sua natura trasversale —
// misurato il 21/08/2026: **246 estensioni in pausa** su tre conti, che da
// dentro le singole campagne nessuno avrebbe mai messo in fila.
//
// ⚠️ Un'estensione di ACCOUNT vale per tutte le campagne di quel conto, e ogni
// brand ha il suo conto: è per questo che «per brand» e «per campagna» sono
// due righe diverse della stessa tabella e non due pagine.

const TIPI = ["sitelink", "callout", "snippet", "immagine"] as const;

const ETICHETTA_TIPO: Record<string, string> = {
  sitelink: "Sitelink",
  callout: "Callout",
  snippet: "Snippet",
  immagine: "Immagine",
};

const SPIEGA_TIPO: Record<string, string> = {
  sitelink: "link in più sotto l'annuncio, ognuno con la sua pagina",
  callout: "frasi brevi che non si cliccano: occupano spazio e rassicurano",
  snippet: "elenchi per categoria («Servizi: consegna, biglietto, vaso»)",
  immagine: "la foto che Google può affiancare all'annuncio",
};

export default async function Estensioni({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string; tipo?: string; stato?: string; campagna?: string }>;
}) {
  const sp = await searchParams;
  const fBrand = sp.brand ?? "tutti";
  const fTipo = sp.tipo ?? "tutti";
  // ⚠️ Si apre su «in pausa»: è la domanda che porta qui. Chi vuole l'elenco
  // completo ha la pillola «Tutte», e il conteggio dice sempre quante sono in
  // totale — così non sembra che ne manchino.
  const fStato = sp.stato ?? "in_pausa";
  const fCampagna = sp.campagna ?? null;

  const [righe, campagne] = await Promise.all([
    prisma.copyAnnuncio.findMany({
      where: { tipo: { in: [...TIPI] } },
      select: {
        id: true,
        tipo: true,
        testo: true,
        brand: true,
        campagna: true,
        gruppo: true,
        livello: true,
        statoPiattaforma: true,
        finalUrl: true,
        spesa: true,
        clic: true,
        conversioni: true,
        incasso: true,
        metricheGiorni: true,
      },
      orderBy: [{ tipo: "asc" }, { spesa: { sort: "desc", nulls: "last" } }],
    }),
    prisma.campagna.findMany({
      where: { canale: "google_ads", stato: { notIn: ["defunta", "conclusa"] } },
      select: { id: true, nome: true, brand: true, account: true, statoPiattaforma: true },
      orderBy: { nome: "asc" },
    }),
  ]);

  // ⚠️ Null = attiva, come sulla scheda campagna: le righe vecchie sono
  // arrivate prima che lo script mandasse lo stato, e marcarle «in pausa»
  // sarebbe un allarme falso su centinaia di righe.
  const inPausa = (r: { statoPiattaforma: string | null }) => {
    const s = (r.statoPiattaforma ?? "").toUpperCase();
    return s !== "" && s !== "ENABLED";
  };
  const diAccount = (r: { campagna: string | null }) => /^\(account /.test(r.campagna ?? "");

  const brands = [...new Set(righe.map((r) => r.brand).filter(Boolean))] as string[];

  // Il riepilogo: per brand e per tipo, quante ne escono e quante sono ferme.
  const riepilogo = brands.map((b) => ({
    brand: b,
    per: TIPI.map((t) => {
      const suoi = righe.filter((r) => r.brand === b && r.tipo === t);
      return { tipo: t, attive: suoi.filter((r) => !inPausa(r)).length, ferme: suoi.filter(inPausa).length };
    }),
  }));

  // ⚠️ LA DOMANDA CHE VALE: dove NON esce niente. Un tipo con zero attive su
  // una campagna è spazio gratuito lasciato vuoto nella pagina dei risultati —
  // e vale anche se ci sono dieci estensioni di quel tipo tutte in pausa.
  // Le estensioni di ACCOUNT contano per tutte le campagne del conto.
  const attivePerConto = new Map<string, Set<string>>();
  for (const r of righe) {
    if (inPausa(r) || !diAccount(r)) continue;
    const conto = (r.campagna ?? "").replace(/^\(account\s*/, "").replace(/\)\s*$/, "").trim();
    const s = attivePerConto.get(conto) ?? new Set<string>();
    s.add(r.tipo);
    attivePerConto.set(conto, s);
  }
  const scoperte = campagne
    .map((c) => {
      const sue = righe.filter((r) => r.campagna === c.nome && !inPausa(r));
      const daConto = c.account ? attivePerConto.get(c.account) ?? new Set<string>() : new Set<string>();
      const mancanti = TIPI.filter((t) => !sue.some((r) => r.tipo === t) && !daConto.has(t));
      return { ...c, mancanti };
    })
    .filter((c) => c.mancanti.length > 0)
    .sort((a, b) => b.mancanti.length - a.mancanti.length);

  const mostrate = righe.filter((r) => {
    if (fBrand !== "tutti" && r.brand !== fBrand) return false;
    if (fTipo !== "tutti" && r.tipo !== fTipo) return false;
    if (fCampagna && r.campagna !== fCampagna) return false;
    if (fStato === "in_pausa") return inPausa(r);
    if (fStato === "attive") return !inPausa(r);
    return true;
  });

  const totaliFermi = righe.filter(inPausa).length;
  const pillola = (chiave: string, valore: string, etichetta: string, attuale: string) => {
    const qs = new URLSearchParams({ brand: fBrand, tipo: fTipo, stato: fStato });
    if (fCampagna) qs.set("campagna", fCampagna);
    qs.set(chiave, valore);
    return (
      <a key={`${chiave}-${valore}`} className={`pill-opt${attuale === valore ? " attuale" : ""}`} href={`/estensioni?${qs}`}>
        {etichetta}
      </a>
    );
  };

  return (
    <div className="layout">
      <Sidebar attiva="estensioni" brandAttivo={fBrand !== "tutti" ? fBrand : undefined} />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Estensioni</h1>
            <p className="page-sub">
              Sitelink, callout, snippet e immagini di tutti i conti Google, con lo stato che hanno
              su Google. <b>{totaliFermi}</b> sono in pausa: occupano posto nell&apos;archivio e non
              escono in asta.
            </p>
          </div>
        </div>

        {/* ⚠️ Quello che si può fare da qui, detto subito: leggere. Riaccendere
            una estensione già associata NON è fra le operazioni che gli Script
            di Google permettono (l'oggetto Sitelink ha setLinkText e urls, non
            enable/pause): si può solo aggiungere o togliere l'associazione.
            Dirlo qui evita di cercare per mezz'ora un bottone che non c'è. */}
        <div className="nota-info">
          <span className="nota-icona">◈</span>
          <span>
            Da qui si <b>guarda</b>. Riaccendere un&apos;estensione già associata non è fra le cose
            che gli Script di Google sanno fare — si può solo aggiungerne una nuova o toglierla —
            quindi quelle in pausa si riaccendono dentro Google Ads, mentre le <b>nuove</b> si
            potranno scrivere da qui.
          </span>
        </div>

        {/* ── Il quadro per brand ─────────────────────────────────────── */}
        <section className="scheda">
          <div className="scheda-titolo">Quante ne escono, per brand</div>
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Brand</th>
                  {TIPI.map((t) => (
                    <th key={t} className="num">
                      {ETICHETTA_TIPO[t]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {riepilogo.map((b) => (
                  <tr key={b.brand}>
                    <td className="cella-nome">
                      {/* ⚠️ OGNI NUMERO È UNA PORTA. Un quadro che si legge e
                          non si apre costringe a rifare a mano, con le
                          pillole in fondo, la selezione che si è appena fatta
                          con gli occhi — e chi legge «+82 in pausa» vuole
                          vedere QUELLE 82, non impostare tre filtri. */}
                      <a href={`/estensioni?brand=${b.brand}&tipo=tutti&stato=tutte#elenco`}>
                        {ETICHETTA_BRAND[b.brand] ?? b.brand}
                      </a>
                    </td>
                    {b.per.map((p) => (
                      <td key={p.tipo} className="num">
                        {/* Il numero grande è quello che ESCE. Le ferme accanto,
                            in arancione: sono lavoro già fatto e spento. */}
                        <a
                          href={`/estensioni?brand=${b.brand}&tipo=${p.tipo}&stato=attive#elenco`}
                          style={{ fontWeight: 600, color: p.attive === 0 ? "var(--orange)" : undefined }}
                          title={`Le ${ETICHETTA_TIPO[p.tipo].toLowerCase()} di ${ETICHETTA_BRAND[b.brand] ?? b.brand} che escono in asta`}
                        >
                          {p.attive}
                        </a>
                        {p.ferme > 0 && (
                          <a
                            href={`/estensioni?brand=${b.brand}&tipo=${p.tipo}&stato=in_pausa#elenco`}
                            className="cella-sub"
                            style={{ color: "var(--orange)" }}
                            title={`Le ${p.ferme} ${ETICHETTA_TIPO[p.tipo].toLowerCase()} di ${ETICHETTA_BRAND[b.brand] ?? b.brand} ferme su Google`}
                          >
                            {" "}+{p.ferme} in pausa
                          </a>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="cella-sub" style={{ whiteSpace: "normal", marginTop: 10 }}>
            Le estensioni di <b>account</b> valgono per tutte le campagne di quel conto: siccome ogni
            brand ha il suo conto, sono l&apos;unico modo di accendere qualcosa «per brand» in un
            colpo solo.
          </p>
        </section>

        {/* ── Dove non esce niente ───────────────────────────────────── */}
        {scoperte.length > 0 && (
          <section className="scheda">
            <div className="scheda-titolo">Campagne senza niente di un tipo ({scoperte.length})</div>
            <p className="cella-sub" style={{ whiteSpace: "normal", marginBottom: 10 }}>
              Qui l&apos;annuncio esce più basso di quanto potrebbe: sono spazi gratuiti nella pagina
              dei risultati. ⚠️ Conta solo quello che <b>esce davvero</b> — una campagna con dieci
              sitelink tutti in pausa compare in questa lista, perché in asta non ne ha nessuno.
            </p>
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Campagna</th>
                    <th>Brand</th>
                    <th>Non ha nessuno</th>
                  </tr>
                </thead>
                <tbody>
                  {scoperte.slice(0, 40).map((c) => (
                    <tr key={c.id}>
                      <td className="cella-nome" style={{ maxWidth: 320 }}>
                        <a href={`/campagne/${c.id}`}>{c.nome}</a>
                        <div className="cella-sub">
                          {c.statoPiattaforma === "PAUSED" ? "in pausa su Google" : "attiva su Google"}
                        </div>
                      </td>
                      <td className="cella-muta">{ETICHETTA_BRAND[c.brand ?? ""] ?? c.brand}</td>
                      <td>
                        {c.mancanti.map((t) => (
                          <a
                            key={t}
                            className="tag-salute"
                            style={{ color: "var(--orange)", marginRight: 6 }}
                            href={`/estensioni?brand=${c.brand ?? "tutti"}&tipo=${t}&stato=tutte&campagna=${encodeURIComponent(c.nome)}#elenco`}
                            title={`Guarda le ${ETICHETTA_TIPO[t].toLowerCase()} di questa campagna: se ce ne sono, sono tutte in pausa`}
                          >
                            <span className="dot" />
                            {ETICHETTA_TIPO[t]}
                          </a>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {scoperte.length > 40 && (
              <p className="cella-sub" style={{ marginTop: 8 }}>
                Mostrate le prime 40 di {scoperte.length}.
              </p>
            )}
          </section>
        )}

        {/* ── L'elenco ───────────────────────────────────────────────── */}
        <section className="scheda" id="elenco">
          <div className="scheda-titolo">
            Elenco ({mostrate.length} su {righe.length})
          </div>

          <div className="pill-scelta" style={{ marginBottom: 8, flexWrap: "wrap" }}>
            {pillola("stato", "in_pausa", `In pausa (${totaliFermi})`, fStato)}
            {pillola("stato", "attive", "Che escono", fStato)}
            {pillola("stato", "tutte", "Tutte", fStato)}
          </div>
          <div className="pill-scelta" style={{ marginBottom: 8, flexWrap: "wrap" }}>
            {pillola("tipo", "tutti", "Tutti i tipi", fTipo)}
            {TIPI.map((t) => pillola("tipo", t, ETICHETTA_TIPO[t], fTipo))}
          </div>
          <div className="pill-scelta" style={{ marginBottom: 12, flexWrap: "wrap" }}>
            {pillola("brand", "tutti", "Tutti i brand", fBrand)}
            {brands.map((b) => pillola("brand", b, ETICHETTA_BRAND[b] ?? b, fBrand))}
          </div>

          {fCampagna && (
            <p className="cella-sub" style={{ marginBottom: 10 }}>
              Filtrate su <b>{fCampagna}</b>.{" "}
              <a href={`/estensioni?brand=${fBrand}&tipo=${fTipo}&stato=${fStato}`} style={{ color: "var(--blue)" }}>
                togli il filtro
              </a>
            </p>
          )}

          {mostrate.length === 0 ? (
            <div className="vuoto-mini">Niente con questi filtri.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Testo</th>
                    <th>Tipo</th>
                    <th>Dove vale</th>
                    <th>Stato</th>
                    <th className="num">Spesa</th>
                    <th className="num">Clic</th>
                    <th className="num">Resa</th>
                  </tr>
                </thead>
                <tbody>
                  {mostrate.slice(0, 400).map((r) => {
                    const ferma = inPausa(r);
                    const resa = (r.spesa ?? 0) > 0 ? (r.incasso ?? 0) / (r.spesa ?? 1) : null;
                    return (
                      <tr key={r.id} style={ferma ? { opacity: 0.65 } : undefined}>
                        <td className="cella-nome" style={{ maxWidth: 300 }}>
                          {r.testo}
                          {r.finalUrl && (
                            <div className="cella-sub" style={{ overflowWrap: "anywhere" }}>
                              → {r.finalUrl.replace(/^https?:\/\/(www\.)?/, "")}
                            </div>
                          )}
                        </td>
                        <td className="cella-muta">{ETICHETTA_TIPO[r.tipo] ?? r.tipo}</td>
                        <td className="cella-muta" style={{ maxWidth: 260 }}>
                          {/* ⚠️ «(account NNN)» non è il nome di una campagna: è
                              il segnaposto con cui lo script marca le estensioni
                              di conto. Tradotto, perché a schermo sembrava un
                              errore di importazione. */}
                          {diAccount(r) ? (
                            <>
                              <b>tutto il conto</b>
                              <div className="cella-sub">vale per ogni campagna di {r.campagna}</div>
                            </>
                          ) : (
                            <>
                              {r.campagna}
                              {r.gruppo && <div className="cella-sub">gruppo: {r.gruppo}</div>}
                            </>
                          )}
                        </td>
                        <td>
                          <span
                            className="tag-salute"
                            style={{ color: ferma ? "var(--orange)" : "var(--green)" }}
                          >
                            <span className="dot" />
                            {ferma ? "in pausa" : "esce"}
                          </span>
                        </td>
                        <td className="num">{(r.spesa ?? 0) > 0 ? formattaEuro(r.spesa!) : "—"}</td>
                        <td className="num">{(r.clic ?? 0) > 0 ? formattaNumero(r.clic!) : "—"}</td>
                        <td
                          className="num"
                          style={{ fontWeight: 600, color: resa == null ? undefined : resa >= 3 ? "var(--green)" : resa < 1 ? "var(--red)" : undefined }}
                        >
                          {resa != null ? `${resa.toFixed(1).replace(".", ",")}×` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className="cella-sub" style={{ whiteSpace: "normal", marginTop: 10 }}>
            {mostrate.length > 400 && <>Mostrate le prime 400 di {mostrate.length}. </>}
            I numeri sono degli <b>ultimi {righe.find((r) => r.metricheGiorni != null)?.metricheGiorni ?? 365} giorni</b>,
            la finestra con cui lo script legge le estensioni: non seguono il periodo scelto altrove.
          </p>
        </section>
      </main>
    </div>
  );
}
