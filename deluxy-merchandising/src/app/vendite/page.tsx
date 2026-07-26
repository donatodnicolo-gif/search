import Link from "next/link";
import { Badge } from "@/components/Badge";
import { FormFiltri } from "@/components/FormFiltri";
import { GraficoAndamento, BarraQuota, Sparkline } from "@/components/Grafico";
import { Sidebar } from "@/components/Sidebar";
import { importaDaOrders } from "@/lib/azioni-vendite";
import { brandCorrente } from "@/lib/brand";
import { prisma } from "@/lib/db";
import { CATEGORIE, etichettaCategoria, euro, iso, percentuale } from "@/lib/dominio";
import { ordersBase, ordersConfigurato, ultimoImport } from "@/lib/orders";
import {
  analizzaVendite,
  coloreDelta,
  COLORE_TENDENZA,
  delta,
  ETICHETTA_FINESTRA,
  ETICHETTA_TENDENZA,
  FINESTRE,
  type Tendenza,
} from "@/lib/vendite";

export const dynamic = "force-dynamic";

export default async function VenditePage({
  searchParams,
}: {
  searchParams: Promise<{
    giorni?: string;
    collezione?: string;
    categoria?: string;
    canale?: string;
    tutti?: string;
    esito?: string;
    messaggio?: string;
  }>;
}) {
  const sp = await searchParams;
  const giorni = FINESTRE.includes(Number(sp.giorni) as (typeof FINESTRE)[number])
    ? Number(sp.giorni)
    : 90;

  // Il brand non si sceglie qui: è l'ambito dell'app, in alto a destra, e vale
  // in ogni pagina. Due selettori di brand in due posti diversi sono il modo
  // migliore per non sapere più che cosa si sta guardando.
  const brand = await brandCorrente();

  const [analisi, collezioni, ultimo] = await Promise.all([
    analizzaVendite(giorni, {
      collezioneId: sp.collezione || null,
      categoria: sp.categoria || null,
      canale: brand,
    }),
    prisma.collezione.findMany({ orderBy: { anno: "desc" }, select: { id: true, nome: true } }),
    ultimoImport(),
  ]);

  const { totale, precedente } = analisi;
  // Con il catalogo pieno (migliaia di prodotti venduti) la tabella completa
  // pesa megabyte e la pagina diventa inservibile: si mostrano i primi per
  // ricavo, dicendo quanti restano fuori. Nessun taglio silenzioso.
  const LIMITE_TABELLA = 60;
  const tutti = sp.tutti === "1";
  const prodottiMostrati = tutti ? analisi.prodotti : analisi.prodotti.slice(0, LIMITE_TABELLA);
  const nascosti = analisi.prodotti.length - prodottiMostrati.length;
  const conParam = (chiave: string, valore: string | null) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (v && k !== "esito" && k !== "messaggio") q.set(k, v);
    if (valore == null) q.delete(chiave);
    else q.set(chiave, valore);
    const s = q.toString();
    return s ? `/vendite?${s}` : "/vendite";
  };
  const crescita = analisi.prodotti.filter((p) => p.tendenza === "crescita").slice(0, 5);
  const calo = analisi.prodotti
    .filter((p) => p.tendenza === "calo" || p.tendenza === "fermo")
    .sort((a, b) => b.ricavoPrec - a.ricavoPrec)
    .slice(0, 5);

  return (
    <div className="layout">
      <Sidebar attiva="vendite" />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">
              Andamento &amp; trend{brand ? ` — ${brand}` : ""}
            </h1>
            <p className="page-sub">
              Il venduto reale letto dal registro Deluxy Orders{brand ? ` per ${brand}` : ", su tutti i brand"}:
              cosa tira, cosa si è spento, quanto margine porta davvero ogni prodotto. Il confronto è sempre
              con il periodo precedente della stessa lunghezza.
            </p>
          </div>
          <form action={importaDaOrders}>
            <input type="hidden" name="giorni" value={Math.max(giorni, 90)} />
            <button className="btn" type="submit" disabled={!ordersConfigurato()}>
              Importa da Ordini
            </button>
          </form>
        </div>

        {sp.esito && (
          <div className={sp.esito === "ok" ? "nota-info" : "avviso-errore"}>
            {sp.esito === "ok" && <span className="nota-icona">✓</span>}
            <span>{sp.messaggio || (sp.esito === "ok" ? "Import completato." : "Import non riuscito.")}</span>
          </div>
        )}

        {!ordersConfigurato() && (
          <div className="nota-info">
            <span className="nota-icona">◆</span>
            <span>
              Il collegamento al registro ordini non è configurato: aggiungi <code>ORDERS_API_KEY</code> (e
              se serve <code>ORDERS_URL</code>, oggi <code>{ordersBase()}</code>) alle variabili d&apos;ambiente
              per importare il venduto reale. Le vendite già presenti restano leggibili.
            </span>
          </div>
        )}

        <FormFiltri>
          <select name="giorni" defaultValue={String(giorni)} aria-label="Periodo">
            {FINESTRE.map((g) => (
              <option key={g} value={g}>
                {ETICHETTA_FINESTRA[g]}
              </option>
            ))}
          </select>
          <select name="collezione" defaultValue={sp.collezione ?? ""} aria-label="Collezione">
            <option value="">Tutte le collezioni</option>
            {collezioni.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
          <select name="categoria" defaultValue={sp.categoria ?? ""} aria-label="Categoria">
            <option value="">Tutte le categorie</option>
            {CATEGORIE.map((c) => (
              <option key={c} value={c}>
                {etichettaCategoria(c)}
              </option>
            ))}
          </select>
        </FormFiltri>

        <div className="kpi-riga">
          <Kpi
            valore={euro(totale.ricavo)}
            etichetta="Ricavo del periodo"
            variazione={analisi.delta.ricavo}
            sotto={`prima ${euro(precedente.ricavo)}`}
          />
          <Kpi
            valore={String(totale.pezzi)}
            etichetta="Pezzi venduti"
            variazione={analisi.delta.pezzi}
            sotto={`prima ${precedente.pezzi} pz`}
          />
          {totale.quotaConCosto > 0 ? (
            <Kpi
              valore={euro(totale.margine)}
              etichetta="Margine stimato"
              variazione={analisi.delta.margine}
              sotto={`${percentuale(totale.marginePct)} su ${percentuale(totale.quotaConCosto)} del venduto con costo inserito`}
            />
          ) : (
            <Kpi
              valore="n.d."
              etichetta="Margine stimato"
              sotto="nessun prodotto venduto ha un costo di produzione inserito"
            />
          )}
          <Kpi valore={euro(totale.scontrino)} etichetta="Valore medio per pezzo" />
          <Kpi
            valore={String(analisi.giorniConVendite)}
            etichetta={`Giorni con vendite su ${giorni}`}
            sotto={analisi.ultimaVendita ? `ultima ${iso(analisi.ultimaVendita)}` : "nessuna vendita"}
          />
        </div>

        {analisi.totaleRighe > 0 && totale.quotaConCosto < 0.999 && (
          <div className="nota-info">
            <span className="nota-icona">◆</span>
            <span>
              Il margine è calcolabile solo sul <b>{percentuale(totale.quotaConCosto)}</b> del venduto: sugli
              altri prodotti manca il <b>costo di produzione</b>, e un costo mancante viene escluso, non contato
              come zero (altrimenti risulterebbero tutti al 100% di margine). Si compila da{" "}
              <Link href="/prodotti">Prodotti</Link>, campo «Costo di produzione».
            </span>
          </div>
        )}

        <div className="scheda">
          <div className="scheda-titolo">Andamento del periodo</div>
          <GraficoAndamento serie={analisi.serie} passo={analisi.passo} />
        </div>

        {analisi.totaleRighe === 0 ? (
          <div className="vuoto">
            Nessuna vendita registrata in questo periodo.
            {ordersConfigurato()
              ? " Importa il venduto dal registro ordini con il pulsante in alto."
              : " Configura ORDERS_API_KEY per importare il venduto, oppure carica i dati dimostrativi con «npm run vendite:demo»."}
          </div>
        ) : (
          <>
            <div className="due-colonne">
              <div className="scheda">
                <div className="scheda-titolo">Che cosa sta tirando</div>
                {crescita.length === 0 ? (
                  <div className="vuoto-mini">Nessun prodotto in crescita rispetto al periodo precedente.</div>
                ) : (
                  <ul className="lista-secca">
                    {crescita.map((p) => (
                      <li key={p.prodottoId}>
                        <Link href={`/prodotti/${p.prodottoId}`} className="cella-nome">
                          {p.nome}
                        </Link>
                        <span className="lista-num" style={{ color: coloreDelta(p.deltaPezzi) }}>
                          {delta(p.deltaPezzi)}
                        </span>
                        <span className="lista-sub">
                          {p.pezzi} pz · {euro(p.ricavo)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="scheda">
                <div className="scheda-titolo">Che cosa si è spento</div>
                {calo.length === 0 ? (
                  <div className="vuoto-mini">Nessun prodotto in calo: raro, controlla la qualità del dato.</div>
                ) : (
                  <ul className="lista-secca">
                    {calo.map((p) => (
                      <li key={p.prodottoId}>
                        <Link href={`/prodotti/${p.prodottoId}`} className="cella-nome">
                          {p.nome}
                        </Link>
                        <span className="lista-num" style={{ color: coloreDelta(p.deltaPezzi) }}>
                          {p.tendenza === "fermo" ? "fermo" : delta(p.deltaPezzi)}
                        </span>
                        <span className="lista-sub">
                          {p.pezzi} pz ora · {p.pezziPrec} pz prima
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="tabella-wrap" style={{ marginBottom: 18 }}>
              <table>
                <thead>
                  <tr>
                    <th>Prodotto</th>
                    <th>Collezione</th>
                    <th className="num">Pezzi</th>
                    <th className="num">Δ pezzi</th>
                    <th className="num">Ricavo</th>
                    <th className="num">Margine</th>
                    <th className="num">Ritmo</th>
                    <th>8 settimane</th>
                    <th>Tendenza</th>
                  </tr>
                </thead>
                <tbody>
                  {prodottiMostrati.map((p) => (
                    <tr key={p.prodottoId}>
                      <td>
                        <Link href={`/prodotti/${p.prodottoId}`} className="cella-nome">
                          {p.nome}
                        </Link>
                        <div className="cella-sub">
                          {p.codice} · {etichettaCategoria(p.categoria)}
                        </div>
                      </td>
                      <td className="cella-muta">{p.collezione ?? "—"}</td>
                      <td className="num">{p.pezzi}</td>
                      <td className="num" style={{ color: coloreDelta(p.deltaPezzi) }}>
                        {delta(p.deltaPezzi)}
                      </td>
                      <td className="num">{euro(p.ricavo)}</td>
                      <td className="num" title={p.ricavoConCosto > 0 ? undefined : "Costo di produzione non inserito"}>
                        {p.ricavoConCosto > 0 ? percentuale(p.marginePct) : "—"}
                      </td>
                      <td className="num">{p.ritmo.toFixed(2)} pz/g</td>
                      <td>
                        <Sparkline valori={p.serie} titolo="Pezzi venduti nelle ultime 8 settimane" />
                      </td>
                      <td>
                        <Badge
                          testo={ETICHETTA_TENDENZA[p.tendenza as Tendenza]}
                          colore={COLORE_TENDENZA[p.tendenza as Tendenza]}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {nascosti > 0 && (
              <p className="page-sub" style={{ marginTop: -8, marginBottom: 18 }}>
                Mostrati i primi {prodottiMostrati.length} prodotti per ricavo; altri {nascosti} non sono in
                tabella.{" "}
                <Link href={conParam("tutti", "1")}>Mostrali tutti</Link> (la pagina diventa molto pesante).
              </p>
            )}
            {tutti && (
              <p className="page-sub" style={{ marginTop: -8, marginBottom: 18 }}>
                Elenco completo: {prodottiMostrati.length} prodotti.{" "}
                <Link href={conParam("tutti", null)}>Torna ai primi {LIMITE_TABELLA}</Link>.
              </p>
            )}

            <div className="griglia-gruppi">
              <TabellaGruppo titolo="Collezioni" righe={analisi.collezioni} />
              <TabellaGruppo
                titolo="Categorie"
                righe={analisi.categorie.map((c) => ({ ...c, nome: etichettaCategoria(c.nome) }))}
              />
              <TabellaGruppo titolo="Canali" righe={analisi.canali} />
            </div>

            {analisi.nonAbbinate.length > 0 && (
              <div className="scheda">
                <div className="scheda-titolo">Righe vendute senza prodotto ({euro(analisi.ricavoNonAbbinato)})</div>
                <p className="page-sub" style={{ marginBottom: 12 }}>
                  Questi articoli sono stati venduti ma non corrispondono a nessun prodotto di Merchandising:
                  contano nei totali, non nei trend per prodotto. Per farli entrare, crea il prodotto con lo
                  stesso nome oppure dai alla variante lo SKU qui sotto — l&apos;abbinamento non viene indovinato.
                </p>
                <div className="tabella-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Articolo venduto</th>
                        <th>SKU</th>
                        <th className="num">Pezzi</th>
                        <th className="num">Ricavo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analisi.nonAbbinate.slice(0, 25).map((r, i) => (
                        <tr key={i}>
                          <td>{r.titolo}</td>
                          <td className="cella-muta">{r.sku ?? "—"}</td>
                          <td className="num">{r.pezzi}</td>
                          <td className="num">{euro(r.ricavo)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        <div className="scheda">
          <div className="scheda-titolo">Da dove arrivano questi numeri</div>
          <p className="page-sub">
            Le vendite arrivano dal registro centralizzato <b>Deluxy Orders</b> ({ordersBase()}), che
            sincronizza Shopify. Gli ordini <b>annullati non escono</b> dalle sue API, quindi non sono contati.
            Merchandising non vende e non consegna: legge il venduto e lo interpreta.
          </p>
          <p className="page-sub" style={{ marginTop: 8 }}>
            Qui dentro c&apos;è <b>tutto il venduto</b>, rimborsi e ordini non ancora incassati compresi: è il
            registro di quello che è successo. Dove conta solo la vendita vera — le{" "}
            <Link href="/classifiche">Classifiche</Link> e le{" "}
            <Link href="/riordini">ipotesi di ordinativo</Link> — restano fuori i rimborsati e i non pagati.
          </p>
          {ultimo && (
            <p className="page-sub" style={{ marginTop: 8 }}>
              Ultimo import: {iso(ultimo.iniziatoIl)} — {ultimo.esito === "ok" ? "riuscito" : "fallito"}.{" "}
              {ultimo.messaggio}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}

function Kpi({
  valore,
  etichetta,
  variazione,
  sotto,
}: {
  valore: string;
  etichetta: string;
  variazione?: number | null;
  sotto?: string;
}) {
  return (
    <div className="kpi">
      <div className="kpi-valore">{valore}</div>
      <div className="kpi-etichetta">{etichetta}</div>
      {variazione !== undefined && (
        <div className="kpi-delta" style={{ color: coloreDelta(variazione ?? null) }}>
          {delta(variazione ?? null)} sul periodo precedente
        </div>
      )}
      {sotto && <div className="kpi-sotto">{sotto}</div>}
    </div>
  );
}

function TabellaGruppo({
  titolo,
  righe,
}: {
  titolo: string;
  righe: { chiave: string; nome: string; pezzi: number; ricavo: number; delta: number | null; quota: number }[];
}) {
  return (
    <div className="scheda">
      <div className="scheda-titolo">{titolo}</div>
      {righe.length === 0 ? (
        <div className="vuoto-mini">Nessun dato.</div>
      ) : (
        <table>
          <tbody>
            {righe.map((r) => (
              <tr key={r.chiave}>
                <td>{r.nome}</td>
                <td className="num">{euro(r.ricavo)}</td>
                <td className="num" style={{ color: coloreDelta(r.delta) }}>
                  {delta(r.delta)}
                </td>
                <td style={{ width: 120 }}>
                  <BarraQuota quota={r.quota} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
