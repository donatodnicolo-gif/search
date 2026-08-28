import Link from "next/link";
import { ConfermaElimina } from "@/components/ConfermaElimina";
import { prisma } from "@/lib/db";
import { riepilogoTutti, ANNO_CORRENTE } from "@/lib/queries";
import { euro, dataIt } from "@/lib/format";
import { ivato, residuoFattura, parzialmenteIncassata, nomeMese } from "@/lib/calc";
import { suggerisci, type Suggerimento } from "@/lib/riconciliazione";
import {
  importaEstratto,
  sincronizzaQonto,
  registraTransazioneFattura,
  registraTransazioneAcconto,
  registraTransazionePagamento,
  ignoraTransazione,
  ignoraTransazioni,
  associaControparte,
  eliminaAssociazione,
  ripristinaTransazione,
  eliminaTransazioniNonRegistrate,
  sincronizzaQontoAllApertura,
} from "@/lib/transazioni-actions";
import { qontoConfigurato } from "@/lib/qonto";
import { BottoneSincronizzaQonto } from "@/components/BottoneSincronizzaQonto";
import { AutoSyncQonto } from "@/components/AutoSyncQonto";
import { AzioneTransazione } from "@/components/AzioneTransazione";

export const dynamic = "force-dynamic";

export default async function TransazioniPage({
  searchParams,
}: {
  searchParams: Promise<{ import?: string; nuove?: string; doppioni?: string; scartate?: string; iban?: string; errore?: string; cerca?: string; qonto?: string; conti?: string; totali?: string; estesa?: string }>;
}) {
  const sp = await searchParams;

  // Ricerca "morbida" tradotta in SQL: ogni termine deve comparire in
  // descrizione/controparte/esito (o combaciare con l'importo). Prima si
  // caricavano TUTTE le ~11.000 transazioni e si filtrava in memoria.
  const query = (sp.cerca ?? "").trim();
  const termini = query.split(/\s+/).filter(Boolean);
  const filtroRicerca =
    termini.length === 0
      ? {}
      : {
          AND: termini.map((term) => {
            const n = parseFloat(term.replace(",", "."));
            const perImporto =
              !isNaN(n) && term.length > 1
                ? [
                    { importo: { gte: n - 0.005, lte: n + 0.005 } },
                    { importo: { gte: -n - 0.005, lte: -n + 0.005 } },
                  ]
                : [];
            return {
              OR: [
                { descrizione: { contains: term, mode: "insensitive" as const } },
                { controparte: { contains: term, mode: "insensitive" as const } },
                { esito: { contains: term, mode: "insensitive" as const } },
                ...perImporto,
              ],
            };
          }),
        };

  // Il motore di riconoscimento (suggerisci) è costoso: si lavora sulle
  // transazioni con più probabilità di essere riconciliate, non su tutte.
  // Criterio: importo significativo (i micro-movimenti sono spese, non incassi
  // di partner). Sotto i 100 € sta il 69% dei movimenti ma quasi nessun match.
  // «Ricerca estesa» (estesa=1) toglie il filtro; durante una ricerca testuale
  // il filtro non si applica mai — se cerchi, vuoi trovare.
  const SOGLIA_PROBABILI = 100;
  const estesa = sp.estesa === "1";
  const filtroProbabili =
    estesa || termini.length > 0
      ? {}
      : { OR: [{ importo: { gte: SOGLIA_PROBABILI } }, { importo: { lte: -SOGLIA_PROBABILI } }] };
  const whereNuove = { stato: "nuova", ...filtroProbabili, ...filtroRicerca };
  const MAX_NUOVE = 600;

  const [nuoveRec, nuoveTotali, nuoveInTutto, registrate, ignorate, totaleTransazioni, estremi, importi, partners, fattureAperte, tutti, associazioniRec, qonto, ultimaSyncRow] =
    await Promise.all([
      prisma.transazioneBancaria.findMany({
        where: whereNuove,
        orderBy: { data: "desc" },
        take: MAX_NUOVE,
      }),
      prisma.transazioneBancaria.count({ where: whereNuove }),
      // totale delle "da lavorare" senza il filtro probabilità (per l'avviso)
      prisma.transazioneBancaria.count({ where: { stato: "nuova", ...filtroRicerca } }),
      prisma.transazioneBancaria.findMany({
        where: { stato: "registrata", ...filtroRicerca },
        orderBy: { data: "desc" },
        take: 300,
      }),
      prisma.transazioneBancaria.findMany({
        where: { stato: "ignorata", ...filtroRicerca },
        orderBy: { data: "desc" },
        take: 300,
      }),
      prisma.transazioneBancaria.count(),
      prisma.transazioneBancaria.aggregate({ _min: { data: true }, _max: { data: true } }),
      // solo gli importi (non i record interi) per gli "attesi mancanti"
      prisma.transazioneBancaria.findMany({ select: { importo: true } }),
      prisma.partner.findMany({ orderBy: { nome: "asc" } }),
      prisma.fatturaServizio.findMany({
        where: { pagata: false, imponibile: { gt: 0 } },
        include: { partner: true },
      }),
      riepilogoTutti(ANNO_CORRENTE),
      prisma.associazioneControparte.findMany({ orderBy: { updatedAt: "desc" } }),
      // in parallelo anche stato Qonto e ultima sync (prima erano due await in coda)
      qontoConfigurato(),
      prisma.impostazione.findUnique({ where: { chiave: "qonto.ultimaSync" } }),
    ]);

  // mappa controparte-normalizzata → partner, usata dal motore di riconoscimento
  const partnerPerId = new Map(partners.map((p) => [p.id, p]));
  const associazioni = new Map(
    associazioniRec
      .map((a) => [a.chiave, partnerPerId.get(a.partnerId)] as const)
      .filter((x): x is [string, (typeof partners)[number]] => Boolean(x[1]))
  );

  const nuove = nuoveRec;
  const transazioni = [...nuove, ...registrate, ...ignorate];

  const daBonificare = tutti.flatMap((t) =>
    t.mesi
      .filter((m) => m.riepilogo.daBonificare >= 0.01)
      .map((m) => ({ partner: t.partner, mese: m.mese, importo: m.riepilogo.daBonificare }))
  );

  // ultima sincronizzazione riuscita (bottone manuale o cron notturno)
  const ultimaSync = qonto && ultimaSyncRow ? new Date(ultimaSyncRow.valore) : null;
  const ctx = { partners, fattureAperte, daBonificare, associazioni };

  const conSugg = nuove.map((tx) => ({ tx, sugg: suggerisci(tx, ctx) }));
  const daRegistrare = conSugg.filter((x) => ["fattura", "incasso_partner", "bonifico_partner"].includes(x.sugg.tipo));
  const discrepanze = conSugg.filter((x) => x.sugg.tipo === "discrepanza");
  const sconosciute = conSugg.filter((x) => x.sugg.tipo === "sconosciuta");
  // Cosa resta fuori (dichiarato, mai silenzioso):
  // - oltreIlLimite: rientrano nel filtro ma eccedono le MAX_NUOVE mostrate
  // - sottoSoglia: escluse dal filtro "probabili" (importo piccolo)
  const oltreIlLimite = Math.max(0, nuoveTotali - nuove.length);
  const sottoSoglia = Math.max(0, nuoveInTutto - nuoveTotali);

  // Attesi mancanti e periodo: calcolati sull'insieme completo (aggregati SQL +
  // soli importi), non caricando tutti i record.
  const periodo =
    estremi._min.data && estremi._max.data ? { da: estremi._min.data, a: estremi._max.data } : null;
  const TOL = 0.02;
  const accreditiImporti = importi.filter((t) => t.importo > 0).map((t) => t.importo);
  const addebitiImporti = importi.filter((t) => t.importo < 0).map((t) => Math.abs(t.importo));
  const fattureMancanti = periodo
    ? fattureAperte.filter(
        (f) =>
          f.scadenza && f.scadenza <= periodo.a &&
          !accreditiImporti.some((v) => Math.abs(v - ivato(f)) <= TOL)
      )
    : [];
  const bonificiMancanti = periodo
    ? daBonificare.filter((x) => !addebitiImporti.some((v) => Math.abs(v - x.importo) <= TOL))
    : [];

  const importoTx = (v: number) => (
    <span className={`num ${v > 0 ? "pos" : "neg"}`} style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
      {v > 0 ? "+" : ""}{euro(v)}
    </span>
  );

  const rigaTx = (tx: (typeof transazioni)[number]) => (
    <>
      <td style={{ whiteSpace: "nowrap" }}>{dataIt(tx.data)}</td>
      <td style={{ maxWidth: 420 }}>
        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={tx.descrizione}>
          {tx.descrizione}
        </div>
        {tx.controparte && <div className="muted" style={{ fontSize: 12 }}>{tx.controparte}</div>}
      </td>
      <td className="num">{importoTx(tx.importo)}</td>
    </>
  );

  return (
    <>
      {qonto && <AutoSyncQonto azione={sincronizzaQontoAllApertura} />}
      <div className="page-head">
        <div>
          <h1 className="page-title">Import & riconciliazione</h1>
          <p className="page-caption">
            Carica l&apos;estratto conto (CSV o XLSX): l&apos;app ricostruisce incassi e pagamenti,
            li confronta col database e segnala cosa manca.
          </p>
        </div>
        {(nuove.length > 0 || ignorate.length > 0) && (
          <div className="page-actions">
            <form action={eliminaTransazioniNonRegistrate}>
              <ConfermaElimina
                verbo="Svuota"
                className="btn danger small"
                oggetto={`le ${nuove.length} transazioni non ancora registrate`}
                conseguenza="Vengono cancellate in blocco per poter rifare l'import; quelle già registrate restano."
                title="Elimina le transazioni non registrate per rifare l'import"
              />
            </form>
          </div>
        )}
      </div>

      {sp.import === "ok" && (
        <div className="card" style={{ padding: 14, marginBottom: 16 }}>
          <span className="badge green"><span className="dot" />
            Import completato: {sp.nuove} nuove transazioni
            {Number(sp.doppioni) > 0 ? ` · ${sp.doppioni} già presenti (ignorate)` : ""}
            {Number(sp.scartate) > 0 ? ` · ${sp.scartate} righe scartate` : ""}
            {Number(sp.iban) > 0 ? ` · ${sp.iban} IBAN recuperati dai bonifici` : ""}
          </span>
        </div>
      )}
      {sp.qonto === "ok" && (
        <div className="card" style={{ padding: 14, marginBottom: 16 }}>
          <span className="badge green"><span className="dot" />
            Sincronizzazione Qonto completata: {sp.nuove} nuovi movimenti
            {Number(sp.conti) > 0 ? ` da ${sp.conti} cont${Number(sp.conti) === 1 ? "o" : "i"}` : ""}
            {Number(sp.totali) > 0 ? ` · ${sp.totali} esaminati` : ""}
            {Number(sp.nuove) === 0 ? " (nessun movimento nuovo: era già tutto aggiornato)" : ""}
          </span>
        </div>
      )}
      {sp.errore && (
        <div className="card" style={{ padding: 14, marginBottom: 16, borderColor: "rgba(215,0,21,0.15)", background: "rgba(215,0,21,0.06)" }}>
          <span style={{ color: "var(--red)", fontSize: 14 }}>{decodeURIComponent(sp.errore)}</span>
        </div>
      )}

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          {qonto && (
            <form action={sincronizzaQonto} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <BottoneSincronizzaQonto />
              <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                {ultimaSync
                  ? `Ultima: ${dataIt(ultimaSync)} alle ${ultimaSync.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`
                  : "Si sincronizza da sola quando apri la pagina, e ogni notte alle 5"}
              </span>
            </form>
          )}
          <form action={importaEstratto} style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", flex: "1 1 340px" }}>
            <div style={{ flex: "1 1 260px" }}>
              <label className="field-label">
                {qonto ? "Oppure carica un estratto (CSV/XLSX) di un'altra banca" : "Estratto conto (CSV o XLSX) — qualsiasi banca"}
              </label>
              <input type="file" name="file" accept=".csv,.txt,.xlsx,.xls" required style={{ border: "1px solid var(--hairline-strong)", borderRadius: "var(--radius-m)", padding: 8, width: "100%", fontSize: 13.5, background: "var(--surface)" }} />
            </div>
            <button className={`btn ${qonto ? "secondary" : "primary"}`} type="submit">Importa file</button>
          </form>
        </div>
        <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
          {qonto
            ? "La sincronizzazione Qonto scarica i movimenti completati di tutti i conti (senza doppioni). Per altre banche carica il file: riconosce le colonne più comuni, incluso l'export CSV di Vivid. "
            : "Riconosce automaticamente le colonne più comuni delle banche italiane ed estere — incluso l'export CSV di Vivid (Completed date, Counterparty name, Reference, Payment amount). Ricaricare lo stesso estratto non crea doppioni. "}
          Nessun movimento viene registrato in automatico: ogni abbinamento va confermato qui sotto.
          {!qonto && " Hai Qonto? Collegalo in Impostazioni per sincronizzare senza file."}
        </p>
      </div>

      {totaleTransazioni > 0 && (
        <div className="card" style={{ marginBottom: 16, padding: 16 }}>
          <form method="get" className="filters" style={{ width: "100%" }}>
            <input
              type="search"
              name="cerca"
              defaultValue={query}
              placeholder="Cerca per partner, causale o importo (anche parziale: «gru», «500», «chanel roma»)…"
              style={{ flex: "1 1 340px", minWidth: 0 }}
              autoComplete="off"
            />
            <button className="btn secondary small" type="submit">Cerca</button>
            {query && (
              <Link href="/transazioni" className="btn secondary small">Azzera</Link>
            )}
          </form>
          {query && (
            <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
              {transazioni.length} risultati per «{query}» ·{" "}
              {daRegistrare.length} con match · {discrepanze.length} discrepanze ·{" "}
              {sconosciute.length} non riconosciute · {registrate.length + ignorate.length} nello storico.
            </p>
          )}
          {(oltreIlLimite > 0 || sottoSoglia > 0) && (
            <p className="muted" style={{ fontSize: 12.5, marginTop: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <span>
                In lavorazione le <strong>{nuove.length}</strong> più recenti
                {!estesa && !query && <> con importo da <strong>{SOGLIA_PROBABILI} €</strong> in su (le più probabili)</>}
                {oltreIlLimite > 0 && <> · altre <strong>{oltreIlLimite}</strong> in coda</>}
                {sottoSoglia > 0 && <> · <strong>{sottoSoglia}</strong> sotto i {SOGLIA_PROBABILI} € non mostrate</>}
              </span>
              {!query && (
                <Link
                  href={estesa ? "/transazioni" : "/transazioni?estesa=1"}
                  className="btn secondary small"
                  title={estesa ? "Torna alle transazioni più probabili" : "Mostra anche i movimenti sotto i 100 €"}
                >
                  {estesa ? "Solo le probabili" : "Ricerca estesa"}
                </Link>
              )}
            </p>
          )}
        </div>
      )}

      {transazioni.length > 0 && !query && (
        <div className="kpi-grid">
          <div className="kpi">
            <div className="kpi-label">Da registrare (match trovato)</div>
            <div className={`kpi-value ${daRegistrare.length ? "" : "pos"}`}>{daRegistrare.length}</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Discrepanze da controllare</div>
            <div className={`kpi-value ${discrepanze.length ? "neg" : "pos"}`}>{discrepanze.length}</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Non riconosciute</div>
            <div className="kpi-value">{sconosciute.length}</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Registrate / ignorate</div>
            <div className="kpi-value pos">{registrate.length} / {ignorate.length}</div>
            {periodo && <div className="kpi-sub">periodo estratto {dataIt(periodo.da)} – {dataIt(periodo.a)}</div>}
          </div>
        </div>
      )}

      {daRegistrare.length > 0 && (
        <>
          <h2 className="section-title">Match trovati — conferma per registrare</h2>
          <div className="card tight">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Data</th><th>Movimento</th><th className="num">Importo</th><th>Abbinamento proposto</th><th></th></tr>
                </thead>
                <tbody>
                  {daRegistrare.map(({ tx, sugg }) => (
                    <tr key={tx.id}>
                      {rigaTx(tx)}
                      <td style={{ maxWidth: 340 }}>
                        {sugg.tipo === "fattura" && (
                          <>
                            <Link href={`/partner/${sugg.fattura.partnerId}`} style={{ fontWeight: 500 }}>{sugg.fattura.partner.nome}</Link>
                            <div className="muted" style={{ fontSize: 12 }}>
                              Fatt. {sugg.fattura.numero ?? "s.n."} ·{" "}
                              {parzialmenteIncassata(sugg.fattura)
                                ? `residuo ${euro(residuoFattura(sugg.fattura))} di ${euro(ivato(sugg.fattura))}`
                                : euro(ivato(sugg.fattura))} · {sugg.motivo}
                            </div>
                          </>
                        )}
                        {sugg.tipo === "incasso_partner" && (
                          <>
                            <Link href={`/partner/${sugg.partner.id}`} style={{ fontWeight: 500 }}>{sugg.partner.nome}</Link>
                            <div className="muted" style={{ fontSize: 12 }}>{sugg.motivo}</div>
                          </>
                        )}
                        {sugg.tipo === "bonifico_partner" && (
                          <>
                            <Link href={`/partner/${sugg.partner.id}`} style={{ fontWeight: 500 }}>{sugg.partner.nome}</Link>
                            <div className="muted" style={{ fontSize: 12 }}>
                              {sugg.mesePagamento ? `${nomeMese(sugg.mesePagamento)} ${ANNO_CORRENTE} · ` : ""}{sugg.motivo}
                            </div>
                          </>
                        )}
                      </td>
                      <td>
                        <span style={{ display: "inline-flex", gap: 6, alignItems: "flex-start" }}>
                          {sugg.tipo === "fattura" && (() => {
                            // Se il movimento è più piccolo del residuo, «Salda fattura»
                            // chiuderebbe il 100% del documento con una parte soltanto:
                            // l'acconto diventa il gesto principale, la saldatura piena
                            // resta a portata ma in secondo piano.
                            const residuo = residuoFattura(sugg.fattura);
                            const parziale = tx.importo > 0 && tx.importo < residuo - 0.02;
                            return (
                              <>
                                {parziale && (
                                  <AzioneTransazione
                                    azione={registraTransazioneAcconto.bind(null, tx.id, sugg.fattura.id)}
                                    etichetta="Salda in parte"
                                    title={`Registra ${euro(tx.importo)} come acconto sulla fattura ${sugg.fattura.numero ?? "s.n."}: restano ${euro(residuo - tx.importo)}`}
                                  />
                                )}
                                <AzioneTransazione
                                  azione={registraTransazioneFattura.bind(null, tx.id, sugg.fattura.id)}
                                  etichetta="Salda fattura"
                                  variante={parziale ? "secondary" : "primary"}
                                  title={
                                    parziale
                                      ? `Segna incassata TUTTA la fattura ${sugg.fattura.numero ?? "s.n."} (${euro(ivato(sugg.fattura))}), anche se il movimento è di ${euro(tx.importo)}`
                                      : `Segna incassata la fattura ${sugg.fattura.numero ?? "s.n."} con la data del movimento`
                                  }
                                />
                              </>
                            );
                          })()}
                          {sugg.tipo === "incasso_partner" && (
                            <AzioneTransazione
                              azione={registraTransazionePagamento.bind(null, tx.id, sugg.partner.id, null)}
                              etichetta="Registra incasso"
                            />
                          )}
                          {sugg.tipo === "bonifico_partner" && (
                            <AzioneTransazione
                              azione={registraTransazionePagamento.bind(null, tx.id, sugg.partner.id, sugg.mesePagamento)}
                              etichetta="Registra bonifico"
                            />
                          )}
                          <AzioneTransazione
                            azione={ignoraTransazione.bind(null, tx.id)}
                            etichetta="Ignora"
                            inCorso="…"
                            variante="secondary"
                          />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {discrepanze.length > 0 && (
        <>
          <h2 className="section-title">Discrepanze — importi che non tornano</h2>
          <div className="card tight">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Data</th><th>Movimento</th><th className="num">Importo</th><th>Problema</th><th></th></tr>
                </thead>
                <tbody>
                  {discrepanze.map(({ tx, sugg }) => (
                    <tr key={tx.id}>
                      {rigaTx(tx)}
                      <td style={{ maxWidth: 340 }}>
                        {sugg.tipo === "discrepanza" && (
                          <>
                            <Link href={`/partner/${sugg.partner.id}`} style={{ fontWeight: 500 }}>{sugg.partner.nome}</Link>
                            <div style={{ fontSize: 12, color: "var(--orange)" }}>{sugg.motivo}</div>
                          </>
                        )}
                      </td>
                      <td>
                        <span style={{ display: "inline-flex", gap: 6, alignItems: "flex-start" }}>
                          {sugg.tipo === "discrepanza" && (
                            <>
                              {sugg.acconto && (
                                <AzioneTransazione
                                  azione={registraTransazioneAcconto.bind(null, tx.id, sugg.acconto.id)}
                                  etichetta="Salda in parte"
                                  title={`Registra ${euro(tx.importo)} come acconto sulla fattura ${sugg.acconto.numero ?? "s.n."}: restano ${euro(residuoFattura(sugg.acconto) - tx.importo)}`}
                                />
                              )}
                              <AzioneTransazione
                                azione={registraTransazionePagamento.bind(null, tx.id, sugg.partner.id, null)}
                                etichetta="Registra comunque"
                                variante="secondary"
                                title="Registra comunque il movimento sul partner, sul mese della transazione"
                              />
                              <AzioneTransazione
                                azione={ignoraTransazione.bind(null, tx.id)}
                                etichetta="Ignora"
                                inCorso="…"
                                variante="secondary"
                              />
                            </>
                          )}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {sconosciute.length > 0 && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <h2 className="section-title">Non riconosciute ({sconosciute.length})</h2>
            <form action={ignoraTransazioni.bind(null, sconosciute.map((x) => x.tx.id))}>
              <button className="btn secondary small" type="submit" title="Segna ignorate tutte le transazioni non riconosciute (spese carta, fornitori, incassi e-commerce…)">
                Ignora tutte le {sconosciute.length}
              </button>
            </form>
          </div>
          <div className="card tight">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Data</th><th>Movimento</th><th className="num">Importo</th><th>Associa a un partner</th><th></th></tr>
                </thead>
                <tbody>
                  {sconosciute.slice(0, 60).map(({ tx }) => (
                    <tr key={tx.id}>
                      {rigaTx(tx)}
                      <td>
                        <form action={associaControparte.bind(null, tx.id)} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <select name="partnerId" required defaultValue="" style={{ width: "auto", minWidth: 180, padding: "5px 9px", fontSize: 12.5 }}>
                            <option value="" disabled>Scegli partner…</option>
                            {partners.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                          </select>
                          <button className="btn small primary" type="submit" title="Registra questo movimento sul partner e ricorda la controparte per i prossimi">
                            Associa
                          </button>
                        </form>
                      </td>
                      <td>
                        <AzioneTransazione
                          azione={ignoraTransazione.bind(null, tx.id)}
                          etichetta="Ignora"
                          inCorso="…"
                          variante="secondary"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
            Scegli il partner e premi «Associa»: il movimento viene registrato e la controparte
            memorizzata, così i prossimi movimenti dello stesso soggetto si riconoscono da soli.
            Il resto (spese carta, fornitori, incassi e-commerce…) puoi ignorarlo.
            {sconosciute.length > 60 && ` Mostrate le prime 60 di ${sconosciute.length}: usa «Ignora tutte» per il resto.`}
          </p>
        </>
      )}

      {!query && periodo && (fattureMancanti.length > 0 || bonificiMancanti.length > 0) && (
        <>
          <h2 className="section-title">
            Attesi ma assenti dall&apos;estratto ({dataIt(periodo.da)} – {dataIt(periodo.a)})
          </h2>
          <div className="card tight">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Tipo</th><th>Partner</th><th>Riferimento</th><th className="num">Importo atteso</th></tr>
                </thead>
                <tbody>
                  {fattureMancanti.map((f) => (
                    <tr key={f.id}>
                      <td><span className="badge orange"><span className="dot" />Incasso mancante</span></td>
                      <td><Link href={`/partner/${f.partnerId}`} style={{ fontWeight: 500 }}>{f.partner.nome}</Link></td>
                      <td>Fatt. {f.numero ?? "s.n."} · scaduta {dataIt(f.scadenza)}</td>
                      <td className="num">{euro(ivato(f))}</td>
                    </tr>
                  ))}
                  {bonificiMancanti.map((x) => (
                    <tr key={x.partner.id + x.mese}>
                      <td><span className="badge blue"><span className="dot" />Bonifico non eseguito</span></td>
                      <td><Link href={`/partner/${x.partner.id}`} style={{ fontWeight: 500 }}>{x.partner.nome}</Link></td>
                      <td>Dovuto {nomeMese(x.mese)} {ANNO_CORRENTE}</td>
                      <td className="num">{euro(x.importo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {!query && associazioniRec.length > 0 && (
        <details style={{ marginTop: 24 }}>
          <summary style={{ cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
            Associazioni salvate ({associazioniRec.length}) — controparti riconosciute automaticamente
          </summary>
          <div className="card tight" style={{ marginTop: 12 }}>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Controparte (dall&apos;estratto)</th><th>Partner associato</th><th className="num">Usi</th><th></th></tr>
                </thead>
                <tbody>
                  {associazioniRec.map((a) => (
                    <tr key={a.id}>
                      <td className="muted">{a.esempio ?? a.chiave}</td>
                      <td>
                        {partnerPerId.has(a.partnerId) ? (
                          <Link href={`/partner/${a.partnerId}`} style={{ fontWeight: 500 }}>{a.partnerNome}</Link>
                        ) : (
                          <span className="muted">{a.partnerNome} (rimosso)</span>
                        )}
                      </td>
                      <td className="num">{a.usi}</td>
                      <td>
                        <form action={eliminaAssociazione.bind(null, a.id)}>
                          <ConfermaElimina
                            oggetto="questa regola"
                            conseguenza="I movimenti futuri di questa controparte torneranno da riconoscere a mano."
                            title="Elimina la regola"
                          />
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </details>
      )}

      {(registrate.length > 0 || ignorate.length > 0) && (
        <details style={{ marginTop: 24 }} open={Boolean(query)}>
          <summary style={{ cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
            Storico: {registrate.length} registrate · {ignorate.length} ignorate
          </summary>
          <div className="card tight" style={{ marginTop: 12 }}>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Data</th><th>Movimento</th><th className="num">Importo</th><th>Esito</th><th></th></tr>
                </thead>
                <tbody>
                  {[...registrate, ...ignorate].map((tx) => (
                    <tr key={tx.id}>
                      {rigaTx(tx)}
                      <td style={{ maxWidth: 300 }}>
                        {tx.stato === "registrata" ? (
                          <span className="badge green"><span className="dot" />{tx.esito ?? "Registrata"}</span>
                        ) : (
                          <span className="badge neutral"><span className="dot" />Ignorata</span>
                        )}
                      </td>
                      <td>
                        {tx.stato === "ignorata" && (
                          <form action={ripristinaTransazione.bind(null, tx.id)}>
                            <button className="btn small secondary" type="submit">Ripristina</button>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </details>
      )}

      {transazioni.length === 0 && query && (
        <div className="card">
          <div className="empty">
            <div className="empty-icon">⌕</div>
            <div className="empty-title">Nessun risultato per «{query}»</div>
            <div className="empty-text">
              Prova con meno parole o solo una parte del nome/importo.{" "}
              <Link href="/transazioni" style={{ color: "var(--blue)" }}>Azzera la ricerca</Link>.
            </div>
          </div>
        </div>
      )}

      {totaleTransazioni === 0 && !sp.errore && (
        <div className="card">
          <div className="empty">
            <div className="empty-icon">⇅</div>
            <div className="empty-title">Nessuna transazione importata</div>
            <div className="empty-text">
              Esporta l&apos;estratto conto dalla tua banca in CSV o Excel e caricalo qui sopra.
            </div>
          </div>
        </div>
      )}
    </>
  );
}
