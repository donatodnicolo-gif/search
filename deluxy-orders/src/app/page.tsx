import Link from "next/link";
import { prisma } from "@/lib/db";
import {
  whereOrdini, euro, dataBreve, consegnaBreve, urgenzaConsegna,
  evasioneLeggibile, pagamentoLeggibile, motivoLeggibile, coloreEvasione, STATI_PAGAMENTO,
  rischioLeggibile, rischioDaSegnalare, coloreRischio,
  problematico, motiviProblema, STATI_PROBLEMA,
} from "@/lib/ordini";
import { statiOrdinati } from "@/lib/stati";
import { CATEGORIE_PAGAMENTO, APP_DESTINAZIONI, nomeApp } from "@/lib/classificazione";
import { CambiaStatoSelect } from "@/components/CambiaStatoSelect";
import { brandConColore, mappaColori, coloreBrand, mappaRicerca } from "@/lib/brand";
import { linkRicerca } from "@/lib/fornitori";
import { ordinali } from "@/lib/repeater";
import { URGENZE } from "@/lib/urgenza";
import { SegnoCanale, PillRepeater, TagLuoghi, PillUrgenza, PillNuovo } from "@/components/Provenienza";
import { etichettaLavorazioneCs } from "@/lib/customer-service";
import { margineOrdine } from "@/lib/controllo";
import { daQuando, daQuandoLeggibile } from "@/lib/sessione";
import { anniConOrdini } from "@/lib/analisi";
import { sincronizza, segnaOrdiniVisti } from "./actions";

export const dynamic = "force-dynamic";

const PER_PAGINA = 50;
// Quanti ordini mostrare in ogni colonna della vista per brand
const PER_COLONNA = 40;

export default async function ElencoOrdini({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const params = new URLSearchParams(sp);
  // Da quando sei qui: serve sia per l'etichetta «Nuovo» sia per il filtro.
  const daQuandoSeiQui = await daQuando();
  if (sp.nuovi === "si" && daQuandoSeiQui) params.set("nuoviDa", daQuandoSeiQui.toISOString());
  const where = whereOrdini(params);
  const pagina = Math.max(1, Number(sp.page ?? "1") || 1);
  // Due viste: colonne per brand (predefinita) ed elenco in tabella.
  const vista = sp.vista === "elenco" ? "elenco" : "brand";

  const [stati, brand, etichette, anni, totale, somma, problemiAperti, arrivatiOra, ordini] = await Promise.all([
    statiOrdinati(),
    brandConColore(),
    prisma.etichetta.findMany({ orderBy: { nome: "asc" } }),
    // Gli anni che esistono davvero nel registro: il filtro non offre anni vuoti.
    anniConOrdini(),
    prisma.ordine.count({ where }),
    prisma.ordine.aggregate({ where, _sum: { totale: true } }),
    // Quanti ordini problematici aspettano ancora un occhio (su TUTTO il
    // registro, non sul filtro: è una coda di lavoro, non una statistica).
    prisma.ordine.count({ where: { financialStatus: { in: [...STATI_PROBLEMA] }, problemaGestito: false } }),
    // Quanti ordini sono ENTRATI nel registro da quando sei qui. Si conta su
    // tutto, non sul filtro: è una notizia, non una statistica del filtro.
    daQuandoSeiQui
      ? prisma.ordine.count({ where: { createdAt: { gte: daQuandoSeiQui } } })
      : Promise.resolve(0),
    vista === "elenco"
      ? prisma.ordine.findMany({
          where,
          include: { stato: true, etichette: true, negozio: { select: { brand: true } }, righe: { select: { id: true, titolo: true, quantita: true } } },
          orderBy: { data: "desc" },
          skip: (pagina - 1) * PER_PAGINA,
          take: PER_PAGINA,
        })
      : Promise.resolve([]),
  ]);

  // Vista a colonne: per ogni brand, i suoi ordini più recenti (con gli stessi
  // filtri e la stessa ricerca dell'elenco).
  const colonneBrand =
    vista === "brand"
      ? await Promise.all(
          brand.map(async (b) => {
            const dove = { AND: [where, { brand: b.nome }] };
            const [conta, somma, ordini] = await Promise.all([
              prisma.ordine.count({ where: dove }),
              prisma.ordine.aggregate({ where: dove, _sum: { totale: true } }),
              prisma.ordine.findMany({
                where: dove,
                include: { stato: true, etichette: true, righe: { select: { id: true, titolo: true, quantita: true } } },
                orderBy: { data: "desc" },
                take: PER_COLONNA,
              }),
            ]);
            return { brand: b, conta, valore: somma._sum.totale ?? 0, ordini };
          }),
        )
      : [];

  // Prima volta o cliente che torna: si calcola per gli ordini che stiamo
  // mostrando, in una query sola per l'intera schermata.
  const ordinaliOrdini = await ordinali([
    ...ordini.map((o) => o.id),
    ...colonneBrand.flatMap((c) => c.ordini.map((o) => o.id)),
  ]);

  const colori = mappaColori(brand);
  const ricerca = mappaRicerca(brand);
  const totalePagine = Math.max(1, Math.ceil(totale / PER_PAGINA));
  const statiOpt = stati.map((s) => ({ id: s.id, nome: s.nome }));
  const negozi = brand;
  const nessunNegozio = brand.length === 0;

  function conFiltro(extra: Record<string, string>): string {
    const q = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(extra)) {
      if (v) q.set(k, v);
      else q.delete(k);
    }
    return `/?${q.toString()}`;
  }

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1 className="page-title">Ordini</h1>
          <p className="page-sub">Il registro di tutti gli ordini Shopify, riclassificabili a piacimento.</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {/* Selettore di vista: elenco oppure una colonna per brand */}
          <div className="scelta-vista" role="group" aria-label="Vista">
            <Link className={`vista-opz${vista === "brand" ? " attiva" : ""}`} href={conFiltro({ vista: "", page: "" })}>
              Colonne per brand
            </Link>
            <Link className={`vista-opz${vista === "elenco" ? " attiva" : ""}`} href={conFiltro({ vista: "elenco" })}>
              Elenco
            </Link>
          </div>
          <form action={sincronizza}>
            <input type="hidden" name="giorni" value="90" />
            <button className="btn" type="submit" disabled={nessunNegozio}>
              Sincronizza da Shopify
            </button>
          </form>
        </div>
      </div>

      <div className="kpi-riga">
        <div className="kpi">
          <div className="kpi-valore">{totale.toLocaleString("it-IT")}</div>
          <div className="kpi-etichetta">Ordini nel filtro</div>
        </div>
        <div className="kpi">
          <div className="kpi-valore">{euro(somma._sum.totale ?? 0)}</div>
          <div className="kpi-etichetta">Valore totale</div>
        </div>
        <div className="kpi">
          <div className="kpi-valore">{negozi.filter((n) => n.attivo).length}</div>
          <div className="kpi-etichetta">Negozi attivi</div>
        </div>
        {problemiAperti > 0 && (
          <Link className="kpi kpi-problema" href="/?problema=aperti">
            <div className="kpi-valore">{problemiAperti.toLocaleString("it-IT")}</div>
            <div className="kpi-etichetta">Rimborsi parziali da verificare</div>
          </Link>
        )}
      </div>

      {/* Arrivati mentre eri qui. Compare solo se ce ne sono: un avviso che dice
          «zero» ogni volta smette di essere letto dopo due giorni. */}
      {arrivatiOra > 0 && (
        <div className="avviso-nuovi">
          <span className="cresce">
            <strong>
              {arrivatiOra === 1 ? "1 ordine nuovo" : `${arrivatiOra.toLocaleString("it-IT")} ordini nuovi`}
            </strong>{" "}
            {daQuandoSeiQui ? daQuandoLeggibile(daQuandoSeiQui) : ""}: sono entrati nel registro dopo
            che eri già qui.
          </span>
          <Link
            className={`btn small${sp.nuovi === "si" ? " btn-secondario" : ""}`}
            href={conFiltro({ nuovi: sp.nuovi === "si" ? "" : "si", page: "" })}
          >
            {sp.nuovi === "si" ? "Mostra tutti" : "Vedi solo questi"}
          </Link>
          <form action={segnaOrdiniVisti}>
            <button className="btn btn-secondario small" type="submit" title="Riparte da adesso: gli ordini di prima non saranno più segnati come nuovi">
              Ho visto
            </button>
          </form>
        </div>
      )}

      {/* Ricerca in evidenza: una sola casella che cerca ovunque */}
      <form className="ricerca" method="get">
        {/* conserva i filtri attivi mentre si cerca */}
        {["brand", "anno", "stato", "categoria", "app", "etichetta", "citta", "paese", "cittaMittente", "paeseMittente", "urgenza", "canale", "estero"].map((k) =>
          sp[k] ? <input key={k} type="hidden" name={k} value={sp[k]} /> : null,
        )}
        <span className="ricerca-icona" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.4 15.4 20 20" />
          </svg>
        </span>
        <input
          type="search"
          name="q"
          autoFocus={!sp.q}
          placeholder="Cerca un ordine: numero, cliente, email, telefono, indirizzo, prodotto, SKU, note…"
          defaultValue={sp.q ?? ""}
        />
        <button className="btn" type="submit">Cerca</button>
        {sp.q && (
          <Link className="btn btn-secondario" href={conFiltro({ q: "", page: "" })}>
            Annulla
          </Link>
        )}
      </form>

      {sp.q && (
        <p className="esito-ricerca">
          {totale === 0
            ? "Nessun ordine trovato"
            : totale === 1
              ? "1 ordine trovato"
              : `${totale.toLocaleString("it-IT")} ordini trovati`}{" "}
          per «{sp.q}»
        </p>
      )}

      {/* Filtri */}
      <form className="filtri" method="get">
        {sp.q && <input type="hidden" name="q" value={sp.q} />}
        {vista === "elenco" && <input type="hidden" name="vista" value="elenco" />}
        <select name="brand" defaultValue={sp.brand ?? ""}>
          <option value="">Tutti i brand</option>
          {negozi.map((n) => (
            <option key={n.id} value={n.nome}>{n.nome}</option>
          ))}
        </select>
        {/* Anno dell'ordine: cambia sia l'elenco sia i due KPI in cima (quanti
            ordini e quanto valgono), che è il modo più corto di chiedere
            «quanto abbiamo fatto nel 2025». */}
        <select name="anno" defaultValue={sp.anno ?? ""}>
          <option value="">Tutti gli anni</option>
          {anni.map((a) => (
            <option key={a} value={String(a)}>{a}</option>
          ))}
        </select>
        <select name="stato" defaultValue={sp.stato ?? ""}>
          <option value="">Tutti gli stati</option>
          {stati.map((s) => (
            <option key={s.id} value={s.chiave}>{s.nome}</option>
          ))}
        </select>
        <select name="categoria" defaultValue={sp.categoria ?? ""}>
          <option value="">Ogni metodo</option>
          {CATEGORIE_PAGAMENTO.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select name="shopify" defaultValue={sp.shopify ?? ""}>
          <option value="">Stato Shopify: tutti</option>
          <option value="validi">Non annullati</option>
          <option value="annullati">Solo annullati</option>
          <option value="da_evadere">Da evadere</option>
          <option value="evasi">Evasi</option>
          <option value="rimborsati">Rimborsati / annullati (pagamento)</option>
        </select>
        <select name="problema" defaultValue={sp.problema ?? ""}>
          <option value="">Problematici: tutti gli ordini</option>
          <option value="aperti">Solo problematici da verificare</option>
          <option value="gestiti">Problematici già verificati</option>
          <option value="tutti">Tutti i problematici</option>
        </select>
        <select name="rischio" defaultValue={sp.rischio ?? ""}>
          <option value="">Ogni rischio frode</option>
          <option value="sospetti">Sospetti (medio o alto)</option>
          <option value="HIGH">Rischio alto</option>
          <option value="MEDIUM">Rischio medio</option>
          <option value="LOW">Rischio basso</option>
        </select>
        {/* Quanto tempo c'è fra l'ordine e la consegna richiesta */}
        <select name="urgenza" defaultValue={sp.urgenza ?? ""}>
          <option value="">Ogni tempo di consegna</option>
          {URGENZE.map((u) => (
            <option key={u.chiave} value={u.chiave}>{u.nome}</option>
          ))}
          <option value="senza-data">Consegna non indicata</option>
        </select>
        {/* Da dove parte la richiesta: gli ordini spediti da un altro paese */}
        <select name="estero" defaultValue={sp.estero ?? ""}>
          <option value="">Da qualunque paese</option>
          <option value="si">Solo ordini mandati dall&apos;estero</option>
        </select>
        <select name="pagamento" defaultValue={sp.pagamento ?? ""}>
          <option value="">Ogni stato pagamento</option>
          {STATI_PAGAMENTO.map((s) => (
            <option key={s.codice} value={s.codice}>{s.nome}</option>
          ))}
        </select>
        <select name="app" defaultValue={sp.app ?? ""}>
          <option value="">Ogni destinazione</option>
          {APP_DESTINAZIONI.map((a) => (
            <option key={a.id} value={a.id}>{a.nome}</option>
          ))}
        </select>
        <select name="etichetta" defaultValue={sp.etichetta ?? ""}>
          <option value="">Ogni etichetta</option>
          {etichette.map((e) => (
            <option key={e.id} value={e.nome}>{e.nome}</option>
          ))}
        </select>
        <button className="btn btn-secondario small" type="submit">Filtra</button>
        <Link className="btn btn-secondario small" href="/">Azzera</Link>
      </form>

      {/* ---------- Vista a colonne per brand ---------- */}
      {vista === "brand" &&
        (nessunNegozio ? (
          <div className="vuoto">
            Nessun negozio collegato. Vai in <Link href="/impostazioni" className="ritorno">Impostazioni</Link> per aggiungere un negozio Shopify.
          </div>
        ) : (
          <div className="colonne-brand">
            {colonneBrand.map(({ brand: b, conta, valore, ordini: suoi }) => (
              <div className="colonna" key={b.id} style={{ ["--brand" as string]: b.colore }}>
                <div className="colonna-testa colonna-testa-brand">
                  <span className="colonna-dot" style={{ background: b.colore }} />
                  <span className="colonna-nome">{b.nome}</span>
                  <span className="colonna-conta">{conta.toLocaleString("it-IT")}</span>
                </div>
                <div className="colonna-valore">{euro(valore)}</div>
                {suoi.length === 0 ? (
                  <div className="colonna-vuota">Nessun ordine</div>
                ) : (
                  suoi.map((o) => (
                    <div className={`card-ordine card-brand${o.annullatoIl ? " ordine-annullato" : ""}`} key={o.id}>
                      <div className="card-testa">
                        <Link href={`/ordini/${o.id}`} className="card-numero">
                          {o.numero}
                          {o.biglietto && (
                            <span className="simbolo-biglietto" title="C'è un biglietto da scrivere">✉</span>
                          )}
                        </Link>
                        <span className="card-totale">{euro(o.totale, o.valuta)}</span>
                      </div>
                      {/* Rimborso parziale: l'ordine sembra normale ma una parte
                          del denaro è tornata indietro, e quanta non lo sappiamo */}
                      {problematico(o) && (
                        <div
                          className={`badge-problema${o.problemaGestito ? " gestito" : ""}`}
                          title={motiviProblema(o).join(" · ")}
                        >
                          {o.problemaGestito ? "✓ Rimborso parziale verificato" : "⚠ Rimborso parziale"}
                        </div>
                      )}
                      {/* Rischio frode: solo medio/alto, altrimenti è rumore */}
                      {rischioDaSegnalare(o.rischioLivello) && !o.annullatoIl && (
                        <div className="badge-rischio" style={{ color: coloreRischio(o.rischioLivello) }}>
                          ⚠ {rischioLeggibile(o.rischioLivello)}
                        </div>
                      )}
                      {/* Annullato: va detto subito, non si deduce dal pagamento */}
                      {o.annullatoIl ? (
                        <div className="badge-annullato">
                          Annullato{motivoLeggibile(o.motivoAnnullamento) ? ` · ${motivoLeggibile(o.motivoAnnullamento)}` : ""}
                        </div>
                      ) : (
                        <div className="riga-stati">
                          <span className="stato-shopify" style={{ color: coloreEvasione(o.fulfillmentStatus) }}>
                            {evasioneLeggibile(o.fulfillmentStatus) ?? "—"}
                          </span>
                          <span className="stato-shopify">{pagamentoLeggibile(o.financialStatus) ?? "—"}</span>
                        </div>
                      )}
                      {/* Stato del Customer Service (come stanno lavorando
                          l'ordine) e, per i chiusi, il margine in € e %. */}
                      {o.csGestione && !o.annullatoIl && (
                        <div className="riga-provenienza">
                          <PillLavorazioneCs codice={o.csGestione} />
                          <MargineChiuso ordine={o} />
                        </div>
                      )}
                      <div className="card-cliente">
                        {o.clienteNome ?? o.spedizioneNome ?? "—"}
                        {o.citta ? ` · ${o.citta}` : ""}
                      </div>
                      {/* Chi ordina e da dove è arrivato: due segni, una riga */}
                      <div className="riga-provenienza">
                        <PillNuovo arrivato={o.createdAt} da={daQuandoSeiQui} />
                        <PillRepeater ordinale={ordinaliOrdini.get(o.id)} />
                        <PillUrgenza chiave={o.urgenza} />
                        <SegnoCanale ordine={o} conNome />
                      </div>
                      <TagLuoghi ordine={o} />
                      {/* Cosa è stato ordinato: è la prima cosa che serve sapere */}
                      {o.righe.length > 0 && (
                        <div className="card-prodotti">
                          {o.righe.slice(0, 3).map((r) => (
                            <span key={r.id} className="prodotto-riga">
                              {r.quantita > 1 && <span className="prodotto-qta">{r.quantita}× </span>}
                              {r.titolo}
                            </span>
                          ))}
                          {o.righe.length > 3 && (
                            <span className="prodotto-riga prodotto-altri">+{o.righe.length - 3} altri</span>
                          )}
                        </div>
                      )}
                      {/* Consegna richiesta: è il dato operativo più importante */}
                      {consegnaBreve(o.dataConsegna, o.fasciaConsegna) ? (
                        <div className={`consegna consegna-${urgenzaConsegna(o.dataConsegna) ?? "futura"}`}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
                          </svg>
                          {consegnaBreve(o.dataConsegna, o.fasciaConsegna)}
                        </div>
                      ) : (
                        <div className="consegna consegna-assente">consegna non indicata</div>
                      )}
                      <div className="card-meta">
                        <span className="card-data">ordine {dataBreve(o.data)}</span>
                        <CambiaStatoSelect ordineId={o.id} statoAttualeId={o.statoId} stati={statiOpt} compatto />
                      </div>
                      {/* Bottone rapido: apre l'app Ricerca fornitori con
                          l'ordine gia' impostato, senza passare dalla scheda */}
                      <a
                        className="btn-fornitore"
                        href={linkRicerca(ricerca.get(o.brand) ?? o.brand, o.numero)}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Cerca il fornitore con l'app Ricerca fornitori"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.4 15.4 20 20" />
                        </svg>
                        Cerca fornitore
                      </a>
                      {o.etichette.length > 0 && (
                        <div className="card-etichette">
                          {o.etichette.map((e) => (
                            <span key={e.id} className="tag" style={{ color: e.colore }}>
                              <span className="dot" /><span className="tag-label">{e.nome}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
                {conta > suoi.length && (
                  <Link className="colonna-vuota colonna-altri" href={conFiltro({ vista: "elenco", brand: b.nome })}>
                    +{(conta - suoi.length).toLocaleString("it-IT")} altri — vedi tutti
                  </Link>
                )}
              </div>
            ))}
          </div>
        ))}

      {/* ---------- Vista elenco ---------- */}
      {vista === "elenco" &&
        (ordini.length === 0 ? (
        <div className="vuoto">
          {nessunNegozio ? (
            <>Nessun negozio collegato. Vai in <Link href="/impostazioni" className="ritorno">Impostazioni</Link> per aggiungere un negozio Shopify e sincronizzare gli ordini.</>
          ) : (
            <>Nessun ordine con questi filtri.</>
          )}
        </div>
      ) : (
        <>
          <div className="tabella-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ordine</th>
                  <th>Data</th>
                  <th>Consegna</th>
                  <th>Cliente</th>
                  <th className="num">Totale</th>
                  <th>Evasione</th>
                  <th>Pagamento</th>
                  <th>Stato</th>
                  <th>Destinazione</th>
                  <th>Etichette</th>
                  <th>Fornitore</th>
                </tr>
              </thead>
              <tbody>
                {ordini.map((o) => (
                  <tr key={o.id} className={`riga-brand${o.annullatoIl ? " ordine-annullato" : ""}`} style={{ ["--brand" as string]: coloreBrand(colori, o.brand) }}>
                    <td>
                      <Link href={`/ordini/${o.id}`} className="cella-nome">
                        {o.numero}
                        {o.biglietto && (
                          <span className="simbolo-biglietto" title="C'è un biglietto da scrivere">✉</span>
                        )}
                        {/* Da dove è arrivato: un simbolo, il nome sotto il mouse */}
                        <SegnoCanale ordine={o} />
                      </Link>
                      <PillNuovo arrivato={o.createdAt} da={daQuandoSeiQui} />
                      {rischioDaSegnalare(o.rischioLivello) && (
                        <span className="badge-rischio" style={{ color: coloreRischio(o.rischioLivello) }} title={o.rischioMotivi ?? ""}>
                          ⚠ {rischioLeggibile(o.rischioLivello)}
                        </span>
                      )}
                      {problematico(o) && (
                        <span
                          className={`badge-problema${o.problemaGestito ? " gestito" : ""}`}
                          title={motiviProblema(o).join(" · ")}
                        >
                          {o.problemaGestito ? "✓ Rimborso parziale" : "⚠ Rimborso parziale"}
                        </span>
                      )}
                      {/* Stato del Customer Service, subito nell'elenco */}
                      {!o.annullatoIl && <PillLavorazioneCs codice={o.csGestione} />}
                      <div className="cella-sub cella-brand">
                        <span className="brand-dot" />
                        {o.brand}
                      </div>
                    </td>
                    <td className="cella-muta">{dataBreve(o.data)}</td>
                    <td>
                      {consegnaBreve(o.dataConsegna, o.fasciaConsegna) ? (
                        <span className={`consegna consegna-${urgenzaConsegna(o.dataConsegna) ?? "futura"}`}>
                          {consegnaBreve(o.dataConsegna, o.fasciaConsegna)}
                        </span>
                      ) : (
                        <span className="tag-vuoto">—</span>
                      )}
                    </td>
                    <td>
                      <div>{o.clienteNome ?? o.spedizioneNome ?? "—"}</div>
                      <TagLuoghi ordine={o} compatto />
                      <PillRepeater ordinale={ordinaliOrdini.get(o.id)} />
                    </td>
                    <td className="cella-num">
                      {euro(o.totale, o.valuta)}
                      {/* Margine dei soli ordini CHIUSI dal Customer Service */}
                      {o.csGestione === "gestito" && (
                        <div className="cella-sub" style={{ marginTop: 4 }}>
                          <MargineChiuso ordine={o} />
                        </div>
                      )}
                    </td>
                    <td>
                      {o.annullatoIl ? (
                        <span className="badge-annullato">
                          Annullato{motivoLeggibile(o.motivoAnnullamento) ? ` · ${motivoLeggibile(o.motivoAnnullamento)}` : ""}
                        </span>
                      ) : (
                        <span className="stato-shopify" style={{ color: coloreEvasione(o.fulfillmentStatus) }}>
                          {evasioneLeggibile(o.fulfillmentStatus) ?? "—"}
                        </span>
                      )}
                    </td>
                    <td>
                      <span className="badge neutro">{o.categoriaPagamento}</span>
                      <div className="cella-sub">{pagamentoLeggibile(o.financialStatus) ?? ""}</div>
                    </td>
                    <td>
                      <CambiaStatoSelect ordineId={o.id} statoAttualeId={o.statoId} stati={statiOpt} compatto />
                    </td>
                    <td className="cella-muta">{nomeApp(o.assegnatoApp) ?? "—"}</td>
                    <td>
                      {o.etichette.length === 0 ? (
                        <span className="tag-vuoto">—</span>
                      ) : (
                        <span className="etichette">
                          {o.etichette.map((e) => (
                            <span key={e.id} className="tag" style={{ color: e.colore }}>
                              <span className="dot" /><span className="tag-label">{e.nome}</span>
                            </span>
                          ))}
                        </span>
                      )}
                    </td>
                    <td>
                      <a
                        className="btn-fornitore"
                        href={linkRicerca(ricerca.get(o.brand) ?? o.brand, o.numero)}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Cerca il fornitore con l'app Ricerca fornitori"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.4 15.4 20 20" />
                        </svg>
                        Cerca
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="paginazione">
            <span>{totale.toLocaleString("it-IT")} ordini · pagina {pagina} di {totalePagine}</span>
            <nav>
              {pagina > 1 && <Link className="btn btn-secondario small" href={conFiltro({ page: String(pagina - 1) })}>← Precedente</Link>}
              {pagina < totalePagine && <Link className="btn btn-secondario small" href={conFiltro({ page: String(pagina + 1) })}>Successiva →</Link>}
            </nav>
          </div>
        </>
      ))}
    </main>
  );
}

// Lo stato di lavorazione del Customer Service, su ogni ordine dell'elenco.
// `null` (nessuno stato comunicato) non mostra niente. Il prefisso «CS» lo
// distingue dalla pipeline di Orders, che è un'altra cosa.
function PillLavorazioneCs({ codice }: { codice: string | null | undefined }) {
  const cs = etichettaLavorazioneCs(codice);
  if (!cs) return null;
  return (
    <span className="pill-stato" style={{ color: cs.colore }} title={`Customer Service — ${cs.spiega}`}>
      <span className="dot" style={{ background: cs.colore }} />
      CS: {cs.nome}
    </span>
  );
}

// Il margine degli ordini CHIUSI dal Customer Service (`gestito`), in valore e
// in %. Solo per i chiusi: su un ordine ancora aperto il margine è prematuro.
//
// ⚠️ Il conto lo fa `margineOrdine()` (la regola §7.4, un posto solo): margine
// REALE al netto IVA 22%, con la % e il caso della consegna nostra già dentro.
// Qui NON si rifà a mano — è l'errore che il commit «l'API calcolava il margine
// a mano» aveva già pagato. Chiuso ma senza costo ⇒ «n/d», non zero.
function MargineChiuso({
  ordine,
}: {
  ordine: {
    csGestione: string;
    totale: number;
    costoFornitore: number | null;
    costoConsegna: number | null;
    feeConsegna: number | null;
    evasione: string;
    consegnataDa: string;
  };
}) {
  if (ordine.csGestione !== "gestito") return null;
  const m = margineOrdine(ordine);
  if (m.valore == null) {
    return (
      <span className="badge neutro" title="Ordine chiuso ma senza costo del fornitore: il margine non è calcolabile">
        margine n/d
      </span>
    );
  }
  const perdita = m.valore < 0;
  const colore = perdita ? "var(--red)" : "var(--green)";
  return (
    <span
      className="badge"
      style={{ color: colore }}
      title={`Margine reale — ${m.nota}. La percentuale è sull'imponibile (${euro(m.imponibile)}), non sul totale lordo (${euro(ordine.totale)}).`}
    >
      <span className="dot" style={{ background: colore }} />
      margine {euro(m.valore)}{m.pct != null ? ` · ${Math.round(m.pct)}%` : ""}
      {perdita ? " · perdita" : ""}{m.parziale ? " · parziale" : ""}
    </span>
  );
}
