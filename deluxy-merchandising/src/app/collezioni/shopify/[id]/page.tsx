import Link from "next/link";
import { notFound } from "next/navigation";
import { BarraQuota } from "@/components/Grafico";
import { RiquadroSeo } from "@/components/RiquadroSeo";
import { Sidebar } from "@/components/Sidebar";
import { prisma } from "@/lib/db";
import { linkAdmin, linkSito } from "@/lib/link-shopify";
import { FilaProdotti } from "@/components/FilaProdotti";
import { CampoNegozioModificabile } from "@/components/CampoNegozio";
import { CAMPI_COLLEZIONE } from "@/lib/campi-negozio";
import { euro, iso, percentuale } from "@/lib/dominio";
import { FILTRO_BUON_FINE, finestra } from "@/lib/vendite";
import { Badge } from "@/components/Badge";
import { eliminaCollezioneShopify, salvaProprietaCollezione } from "@/lib/azioni-collezioni-shopify";
import {
  COLORE_STATO_COLLEZIONE_SHOPIFY,
  descriviRegole,
  ETICHETTA_STATO_COLLEZIONE_SHOPIFY,
  ETICHETTA_TIPO_COLLEZIONE,
  etichettaOrdinamentoShopify,
  posizioniDa,
  POSIZIONI,
  regoleInOEd,
} from "@/lib/collezioni";

export const dynamic = "force-dynamic";

// Quanti prodotti si mostrano qui: la cura vera sta in Visual, questa è la fila
// vista dal lato della collezione.
const MAX_FILA = 60;

// Scheda di una collezione **di Shopify**: chi ci sta dentro fra i prodotti che
// l'app conosce, e come ha venduto negli ultimi 90 giorni. È la vetrina vista
// dal lato del merchandising.
export default async function CollezioneShopifyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ esito?: string; messaggio?: string; seoConferma?: string; modifica?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const collezione = await prisma.collezioneShopify.findUnique({
    where: { id },
    include: {
      prodotti: {
        // Ordinati come sulla vetrina: la fila qui sotto è la stessa che si cura
        // in Visual, non un altro elenco.
        orderBy: [{ posizione: "asc" }, { prodotto: { nome: "asc" } }],
        include: {
          prodotto: {
            select: {
              id: true,
              nome: true,
              codice: true,
              categoria: true,
              prezzoVendita: true,
              costoProduzione: true,
              fase: true,
              immagine: true,
              statoShopify: true,
            },
          },
        },
      },
    },
  });
  if (!collezione) notFound();

  // Il dominio del negozio serve ai due link: si legge dal negozio collegato,
  // non si costruisce a mano.
  const negozio = await prisma.negozioShopify.findFirst({
    where: { nome: collezione.negozio },
    select: { dominio: true, canaleVendite: true, permessi: true, attivo: true },
  });
  const puoScrivere = !!negozio?.attivo && (negozio?.permessi ?? "").includes("write_products");
  const urlAdmin = linkAdmin(negozio?.dominio, collezione.shopifyId, "collezione");
  const urlSito = linkSito(negozio?.dominio, collezione.handle, "collezione");

  const prodotti = collezione.prodotti.map((r) => r.prodotto);
  // In scena solo quello che il cliente vede, come in Visual: gli archiviati e
  // le bozze restano legati alla collezione ma non entrano nella fila.
  const inScena = collezione.prodotti.filter(
    (vp) => vp.prodotto.statoShopify === "ACTIVE" && vp.prodotto.fase !== "archiviato",
  );
  const fuoriScena = collezione.prodotti.length - inScena.length;
  const f = finestra(90);

  // Il negozio qui si chiama "Cake", nel venduto è "cakedesign.me": il nome
  // della scheda e il canale delle vendite non coincidono. Si usa la
  // corrispondenza impostata sul negozio; se non c'è, si contano tutti i canali
  // e lo si dice, invece di mostrare uno zero che sembra un dato.
  const canale = negozio?.canaleVendite?.trim() || null;

  const vendite =
    prodotti.length > 0
      ? await prisma.vendita.groupBy({
          by: ["prodottoId"],
          where: {
            prodottoId: { in: prodotti.map((p) => p.id) },
            data: { gte: f.dal, lte: f.al },
            ...(canale ? { canale } : {}),
            ...FILTRO_BUON_FINE,
          },
          _sum: { quantita: true, ricavo: true },
        })
      : [];
  const perProdotto = new Map(vendite.map((v) => [v.prodottoId as string, v]));

  const righe = prodotti
    .map((p) => {
      const v = perProdotto.get(p.id);
      return { p, pezzi: v?._sum.quantita ?? 0, ricavo: v?._sum.ricavo ?? 0 };
    })
    .sort((a, b) => b.ricavo - a.ricavo);

  const ricavoTotale = righe.reduce((s, r) => s + r.ricavo, 0);
  const pezziTotali = righe.reduce((s, r) => s + r.pezzi, 0);
  const cheHannoVenduto = righe.filter((r) => r.pezzi > 0).length;
  // Chi non sta in NESSUNA delle due classifiche: zero pezzi e zero incasso.
  // Contare col metro di una sola (pezzi>0) faceva tornare i conti a metà.
  const senzaVendite = righe.filter((r) => r.pezzi === 0 && r.ricavo === 0).length;
  const copertura = collezione.prodottiShopify > 0 ? prodotti.length / collezione.prodottiShopify : 0;
  const condizioni = descriviRegole(collezione.regole);

  return (
    <div className="layout">
      <Sidebar attiva="collezioni" />
      <main className="main">
        <Link href="/collezioni" className="ritorno">
          ← Collezioni
        </Link>
        <div className="page-head">
          <div>
            <div className="prodotto-codice">
              {collezione.negozio} · /{collezione.handle}
            </div>
            <h1 className="page-title">{collezione.titolo}</h1>
            <div style={{ margin: "6px 0" }}>
              <Badge
                testo={ETICHETTA_STATO_COLLEZIONE_SHOPIFY[collezione.stato] ?? collezione.stato}
                colore={COLORE_STATO_COLLEZIONE_SHOPIFY[collezione.stato] ?? "var(--text-tertiary)"}
              />
            </div>
          </div>
          {/* I campi che il negozio possiede — titolo, descrizione, immagine,
              handle — **si correggono su Shopify**, non qui: qui verrebbero
              riscritti al primo import. Il bottone porta dritto sulla scheda
              giusta invece di farla cercare fra 343 collezioni. */}
          <div className="riga-azione">
            <Link className="btn btn-secondario" href={`/visual/${collezione.id}`}>Cura l&apos;ordine</Link>
            {urlAdmin && (
              <a className="btn btn-secondario" href={urlAdmin} target="_blank" rel="noreferrer">
                Modifica su Shopify ↗
              </a>
            )}
            {urlSito && (
              <a className="btn btn-secondario" href={urlSito} target="_blank" rel="noreferrer">
                Vedi online ↗
              </a>
            )}
          </div>
        </div>

        {/* L'esito delle azioni (Scrivi con AI, Manda al negozio) arriva nella
            query: senza questo blocco i messaggi — anche gli errori — si
            perdevano e il bottone sembrava rotto (trovato dalla revisione). */}
        {sp.messaggio && (
          <div className={`nota-info${sp.esito === "errore" ? " nota-errore" : ""}`}>
            <span className="nota-icona">{sp.esito === "errore" ? "△" : "◆"}</span>
            <span>{sp.messaggio}</span>
          </div>
        )}

        {/* **Una scheda sola: il negozio a sinistra, noi a destra.** Erano tre
            riquadri sparsi per la pagina (campi con la matita, «come l'ha
            fatta», «come la usiamo») e per capire una collezione si scorreva
            tutto (segnalato dall'utente). La riga di sotto resta vera: a
            sinistra si corregge il negozio — la matita scrive su Shopify — a
            destra proprietà che vivono solo qui. */}
        <div className="scheda">
          <div className="scheda-titolo">La collezione — il negozio, e come la usiamo noi</div>
          <div className="due-colonne" style={{ gap: 24 }}>
            <div>
              {CAMPI_COLLEZIONE.map((campo) => (
                <CampoNegozioModificabile
                  key={campo.chiave}
                  tipo="collezione"
                  id={id}
                  campo={campo}
                  valore={campo.colonna === "titolo" ? collezione.titolo : collezione.descrizione}
                  percorso={`/collezioni/shopify/${id}`}
                  aperto={sp.modifica === campo.chiave}
                  puoScrivere={puoScrivere}
                />
              ))}
              {!puoScrivere && (
                <p className="page-sub" style={{ marginTop: 0 }}>
                  Il negozio «{collezione.negozio}» non ha un token con <b>write_products</b>: da qui si può solo
                  leggere. Si collega in <Link href="/impostazioni">Negozi &amp; permessi</Link>.
                </p>
              )}
              <dl className="griglia-campi" style={{ marginTop: 14 }}>
                <div className="campo">
                  <dt>Tipo</dt>
                  <dd>{ETICHETTA_TIPO_COLLEZIONE[collezione.tipo] ?? collezione.tipo}</dd>
                </div>
                <div className="campo">
                  <dt>Ordinamento dei prodotti</dt>
                  <dd>{etichettaOrdinamentoShopify(collezione.ordinamento)}</dd>
                </div>
                <div className="campo">
                  <dt>Modello del tema</dt>
                  <dd>{collezione.modelloTema ?? "predefinito"}</dd>
                </div>
                <div className="campo">
                  <dt>Aggiornata su Shopify</dt>
                  <dd>{collezione.aggiornataShopifyIl ? iso(collezione.aggiornataShopifyIl) : "—"}</dd>
                </div>
              </dl>
              {condizioni.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div className="cella-sub" style={{ fontWeight: 600, marginBottom: 4 }}>
                    Condizioni — ci entra chi rispetta {regoleInOEd(collezione.regole) ?? "tutte"} le regole. Le applica
                    Shopify: qui si leggono.
                  </div>
                  <ul className="lista-domande">
                    {condizioni.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div>
              <p className="page-sub" style={{ marginTop: 0, marginBottom: 12 }}>
                Queste proprietà vivono <b>solo qui</b> e le leggono le altre app via API: Shopify non sa dove metti
                una collezione né se può finire in una campagna.
              </p>
              <form action={salvaProprietaCollezione.bind(null, collezione.id)}>
                <div className="cella-sub" style={{ fontWeight: 600, marginBottom: 6 }}>Posizioni</div>
                <div className="pill-scelta" style={{ marginBottom: 14 }}>
                  {POSIZIONI.map((p) => (
                    <label className="pill-opt" key={p.chiave} style={{ cursor: "pointer" }} title={p.cosaSignifica}>
                      <input
                        type="checkbox"
                        name="posizioni"
                        value={p.chiave}
                        defaultChecked={posizioniDa(collezione.posizioni).includes(p.chiave)}
                      />
                      {p.nome}
                    </label>
                  ))}
                </div>
                <div className="pill-scelta" style={{ marginBottom: 14 }}>
                  <label className="pill-opt" style={{ cursor: "pointer" }}>
                    <input type="checkbox" name="inCampagne" defaultChecked={collezione.inCampagne} />
                    Si può usare nelle campagne
                  </label>
                </div>
                <div className="modulo">
                  <div className="campo-modulo">
                    <label htmlFor="stato">Stato</label>
                    <select id="stato" name="stato" defaultValue={collezione.stato}>
                      <option value="attiva">Attiva</option>
                      <option value="sospesa">Sospesa</option>
                    </select>
                  </div>
                  <div className="campo-modulo largo">
                    <label htmlFor="note">Note</label>
                    <textarea id="note" name="note" rows={2} defaultValue={collezione.note ?? ""} />
                  </div>
                  <div className="azioni-modulo">
                    <button className="btn" type="submit">Salva</button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>

        {/* **Il SEO subito dopo la scheda, in un posto solo** (chiesto
            dall'utente): quello del negozio, il nostro modificabile, la bozza
            scritta dall'AI e l'invio — tutto qui, non più in fondo alla pagina. */}
        <RiquadroSeo
          tipo="collezione"
          id={id}
          daNegozio={{ titolo: collezione.seoTitoloShopify, descrizione: collezione.seoDescrizioneShopify }}
          nostro={{ titolo: collezione.seoTitolo, descrizione: collezione.seoDescrizione }}
          sincronia={{ modificatoIl: collezione.seoModificatoIl, spintoIl: collezione.seoSpintoIl }}
          percorso={`/collezioni/shopify/${id}`}
          conferma={sp.seoConferma === "1"}
          conAI
        />

        <div className="kpi-riga">
          <div className="kpi">
            <div className="kpi-valore">
              {prodotti.length}
              <span style={{ fontSize: 16, color: "var(--text-tertiary)" }}> / {collezione.prodottiShopify}</span>
            </div>
            <div className="kpi-etichetta">Prodotti riconosciuti qui</div>
            <div className="kpi-sotto">{percentuale(copertura)} della collezione su Shopify</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{euro(ricavoTotale)}</div>
            <div className="kpi-etichetta">
              Venduto in 90 giorni {canale ? `su ${canale}` : "(tutti i canali)"}
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{pezziTotali}</div>
            <div className="kpi-etichetta">Pezzi</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{cheHannoVenduto}</div>
            <div className="kpi-etichetta">Prodotti che hanno venduto</div>
            <div className="kpi-sotto">su {prodotti.length} in collezione</div>
          </div>
        </div>

        {collezione.prodottiShopify > prodotti.length && (
          <div className="nota-info">
            <span className="nota-icona">◆</span>
            <span>
              Su Shopify questa collezione contiene <b>{collezione.prodottiShopify}</b> prodotti, qui ne
              risultano <b>{prodotti.length}</b>: i mancanti non sono stati riconosciuti (SKU diverso o
              prodotto mai importato) e <b>non vengono indovinati</b>. Rilanciando l&apos;import dopo aver
              sistemato gli SKU rientrano da soli.
            </span>
          </div>
        )}

        {/* **La fila, qui e non solo in Visual.** È lo stesso componente e le
            stesse azioni: cambia solo dove si disegna, così le due schermate non
            possono comportarsi in modo diverso. In scena ci va soltanto quello
            che il cliente vede: gli archiviati e le bozze restano legati alla
            collezione ma fuori dalla fila. */}
        <div className="scheda">
          <div className="scheda-titolo">Ordine dei prodotti in vetrina</div>
          <p className="page-sub" style={{ marginTop: -4 }}>
            {inScena.length === 0 ? (
              <>Nessun prodotto in vendita da mettere in fila.</>
            ) : (
              <>
                <b>{inScena.length}</b> prodotti in vendita
                {fuoriScena > 0 && <> · {fuoriScena} archiviati o in bozza, fuori dalla fila</>} · ordine sul negozio:{" "}
                <b>{etichettaOrdinamentoShopify(collezione.ordinamento)}</b>. Le regole d&apos;ordine, l&apos;anteprima
                e l&apos;invio a Shopify stanno in <Link href={`/visual/${id}`}>Cura l&apos;ordine</Link>.
              </>
            )}
          </p>
          {inScena.length > 0 && (
            <>
              <FilaProdotti
                collezioneId={id}
                righe={inScena.slice(0, MAX_FILA)}
                membriAMano={collezione.tipo === "manuale"}
                totale={inScena.length}
              />
              {inScena.length > MAX_FILA && (
                <p className="page-sub" style={{ marginTop: 12 }}>
                  Mostrati i primi {MAX_FILA} di {inScena.length}: il resto si cura in{" "}
                  <Link href={`/visual/${id}`}>Cura l&apos;ordine</Link>.
                </p>
              )}
            </>
          )}
        </div>

        {/* **Due classifiche, dichiarate** (chiesto dall'utente): per valore e
            per pezzi sono due domande diverse — un pezzo da 3.000 € vale come
            trentacinque bouquet — e mostrarne una sola nascondeva l'altra metà
            della storia. Solo chi ha venduto nella finestra: una classifica di
            zeri è rumore. */}
        {righe.length === 0 ? (
          <div className="vuoto">Nessun prodotto di questa collezione è riconosciuto qui.</div>
        ) : (
          <div className="due-colonne due-colonne-pari">
            <Ranking
              titolo="Top per valore — 90 giorni"
              righe={righe.filter((r) => r.ricavo > 0)}
              valore={(r) => euro(r.ricavo)}
              quota={(r) => (ricavoTotale > 0 ? r.ricavo / ricavoTotale : 0)}
            />
            <Ranking
              titolo="Top per pezzi — 90 giorni"
              righe={[...righe].filter((r) => r.pezzi > 0).sort((a, b) => b.pezzi - a.pezzi || b.ricavo - a.ricavo)}
              valore={(r) => `${r.pezzi} pz`}
              quota={(r) => (pezziTotali > 0 ? r.pezzi / pezziTotali : 0)}
            />
          </div>
        )}
        {righe.length > 0 && senzaVendite > 0 && (
          <p className="page-sub" style={{ marginTop: -6 }}>
            {senzaVendite} prodotti della collezione non compaiono in nessuna delle due: niente pezzi né incasso nella
            finestra.
          </p>
        )}

        {/* Cancellare qui e cancellare sul negozio sono due gesti diversi:
            vanno scelti, non confusi in un bottone solo. */}
        {/* Ripiegata: è un gesto raro e distruttivo, e aperta sempre era la
            prima cosa che si vedeva sotto le classifiche. */}
        <details className="scheda" style={{ marginTop: 18 }}>
          <summary className="scheda-titolo">Elimina questa collezione</summary>
          <form action={eliminaCollezioneShopify.bind(null, collezione.id)}>
            <p className="page-sub" style={{ marginBottom: 12 }}>
              Senza spunta la collezione sparisce <b>solo da qui</b>: su {collezione.negozio} resta, e torna al
              prossimo import. Con la spunta viene cancellata <b>anche su Shopify</b> — i clienti smettono di
              vederla, ed è irreversibile. In nessuno dei due casi si toccano i prodotti.
            </p>
            <div className="pill-scelta" style={{ marginBottom: 12 }}>
              <label className="pill-opt" style={{ cursor: "pointer", color: "var(--red)" }}>
                <input type="checkbox" name="ancheSuShopify" />
                Cancella anche sul negozio Shopify
              </label>
            </div>
            <button className="btn btn-secondario" type="submit">
              Elimina
            </button>
          </form>
        </details>

        <p className="page-sub" style={{ marginTop: 14 }}>
          Aggiornata il {iso(collezione.aggiornataIl)}. Il venduto conta solo le vendite andate a buon fine
          {canale ? (
            <>
              {" "}
              fatte <b>su {canale}</b>: lo stesso prodotto su un altro negozio è un&apos;altra storia.
            </>
          ) : (
            <>
              , di <b>tutti i canali</b>: il negozio «{collezione.negozio}» non ha ancora una corrispondenza
              col nome che ha nel venduto (che arriva da Orders, tipo <code>cakedesign.me</code>). Si imposta
              in <Link href="/impostazioni">Negozi &amp; permessi</Link>, campo «nome nel venduto».
            </>
          )}
        </p>

      </main>
    </div>
  );
}
// Quante righe si vedono subito: i primi 30 dicono la storia, il resto sta
// dietro un click. Una classifica da duecento righe non è più una classifica.
const TOP_CLASSIFICA = 30;

/**
 * Una classifica della collezione: posizione, foto, nome, valore e peso.
 * Il **peso è sul totale della collezione** (non del catalogo), quindi le due
 * classifiche sommano al 100% ciascuna sul proprio metro.
 */
function Ranking({
  titolo,
  righe,
  valore,
  quota,
}: {
  titolo: string;
  righe: { p: { id: string; nome: string; codice: string; immagine: string | null }; pezzi: number; ricavo: number }[];
  valore: (r: { pezzi: number; ricavo: number }) => string;
  quota: (r: { pezzi: number; ricavo: number }) => number;
}) {
  const prime = righe.slice(0, TOP_CLASSIFICA);
  const resto = righe.slice(TOP_CLASSIFICA);
  const Riga = ({ r, i }: { r: (typeof righe)[number]; i: number }) => (
    <tr key={r.p.id} className="riga-cliccabile">
      <td className="num" style={{ width: 34, color: "var(--text-tertiary)" }}>{i + 1}</td>
      <td>
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="rank-foto">{r.p.immagine ? <img src={r.p.immagine} alt="" /> : "❀"}</span>
          <span style={{ minWidth: 0 }}>
            <Link href={`/prodotti/${r.p.id}`} className="cella-nome link-riga">{r.p.nome}</Link>
            <div className="cella-sub">{r.p.codice}</div>
          </span>
        </span>
      </td>
      <td className="num">{valore(r)}</td>
      <td style={{ width: 120 }}>
        <BarraQuota quota={quota(r)} />
      </td>
    </tr>
  );
  return (
    <div className="scheda">
      <div className="scheda-titolo">{titolo}</div>
      {righe.length === 0 ? (
        <p className="page-sub" style={{ margin: 0 }}>Nessuna vendita nella finestra.</p>
      ) : (
        <>
          <div className="tabella-wrap" style={{ border: 0, boxShadow: "none" }}>
            <table>
              <tbody>
                {prime.map((r, i) => (
                  <Riga r={r} i={i} key={r.p.id} />
                ))}
              </tbody>
            </table>
          </div>
          {resto.length > 0 && (
            <details className="mostra-tutti">
              <summary className="cella-sub">
                e altri {resto.length} <span className="mt-chiuso">— mostra tutti</span>
                <span className="mt-aperto">— nascondi</span>
              </summary>
              <div className="tabella-wrap" style={{ border: 0, boxShadow: "none" }}>
                <table>
                  <tbody>
                    {resto.map((r, i) => (
                      <Riga r={r} i={TOP_CLASSIFICA + i} key={r.p.id} />
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}
