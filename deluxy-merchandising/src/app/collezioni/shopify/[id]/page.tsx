import Link from "next/link";
import { notFound } from "next/navigation";
import { BarraQuota } from "@/components/Grafico";
import { RiquadroSeo } from "@/components/RiquadroSeo";
import { Sidebar } from "@/components/Sidebar";
import { prisma } from "@/lib/db";
import { linkAdmin, linkSito } from "@/lib/link-shopify";
import { etichettaCategoria, euro, iso, percentuale } from "@/lib/dominio";
import { FILTRO_BUON_FINE, finestra } from "@/lib/vendite";
import { Badge } from "@/components/Badge";
import { eliminaCollezioneShopify, salvaProprietaCollezione } from "@/lib/azioni-collezioni-shopify";
import {
  COLORE_STATO_COLLEZIONE_SHOPIFY,
  descriviRegole,
  ETICHETTA_STATO_COLLEZIONE_SHOPIFY,
  ETICHETTA_TIPO_COLLEZIONE,
  posizioniDa,
  POSIZIONI,
  regoleInOEd,
} from "@/lib/collezioni";

export const dynamic = "force-dynamic";

// Scheda di una collezione **di Shopify**: chi ci sta dentro fra i prodotti che
// l'app conosce, e come ha venduto negli ultimi 90 giorni. È la vetrina vista
// dal lato del merchandising.
export default async function CollezioneShopifyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ esito?: string; messaggio?: string; seoConferma?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const collezione = await prisma.collezioneShopify.findUnique({
    where: { id },
    include: {
      prodotti: {
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
    select: { dominio: true, canaleVendite: true },
  });
  const urlAdmin = linkAdmin(negozio?.dominio, collezione.shopifyId, "collezione");
  const urlSito = linkSito(negozio?.dominio, collezione.handle, "collezione");

  const prodotti = collezione.prodotti.map((r) => r.prodotto);
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
  const copertura = collezione.prodottiShopify > 0 ? prodotti.length / collezione.prodottiShopify : 0;
  const condizioni = descriviRegole(collezione.regole);
  const seo = [collezione.seoTitoloShopify, collezione.seoDescrizioneShopify].filter(Boolean).join(" — ");

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
            {collezione.descrizione && <p className="page-sub">{collezione.descrizione}</p>}
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

        {/* Quello che dice Shopify e quello che decidiamo noi, separati:
            confonderli farebbe credere di poter cambiare da qui cose che
            stanno sul negozio. */}
        <div className="due-colonne">
          <div className="scheda">
            <div className="scheda-titolo">Come l&apos;ha fatta il negozio</div>
            <dl className="griglia-campi">
              <div className="campo">
                <dt>Tipo</dt>
                <dd>{ETICHETTA_TIPO_COLLEZIONE[collezione.tipo] ?? collezione.tipo}</dd>
              </div>
              <div className="campo">
                <dt>Ordinamento dei prodotti</dt>
                <dd>{collezione.ordinamento ?? "—"}</dd>
              </div>
              <div className="campo">
                <dt>Modello del tema</dt>
                <dd>{collezione.modelloTema ?? "predefinito"}</dd>
              </div>
              <div className="campo">
                <dt>Aggiornata su Shopify</dt>
                <dd>{collezione.aggiornataShopifyIl ? iso(collezione.aggiornataShopifyIl) : "—"}</dd>
              </div>
              <div className="campo campo-largo">
                <dt>Descrizione</dt>
                <dd>{collezione.descrizione ?? "—"}</dd>
              </div>
              <div className="campo campo-largo">
                <dt>SEO sul negozio</dt>
                {/* Solo quello letto: il nostro si scrive nel riquadro sotto,
                    dove sta accanto al testo di partenza. */}
                <dd>{seo || "—"}</dd>
              </div>
            </dl>
            {condizioni.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div className="scheda-titolo">
                  Condizioni — ci entra chi rispetta {regoleInOEd(collezione.regole) ?? "tutte"} le regole
                </div>
                <ul className="lista-domande">
                  {condizioni.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
                <p className="cella-sub" style={{ marginTop: 8 }}>
                  Le applica Shopify: qui si leggono, non si cambiano.
                </p>
              </div>
            )}
          </div>

          <div className="scheda">
            <div className="scheda-titolo">Come la usiamo noi</div>
            <p className="page-sub" style={{ marginBottom: 12 }}>
              Queste proprietà vivono <b>solo qui</b> e le leggono le altre app via API: Shopify non sa dove
              metti una collezione né se può finire in una campagna.
            </p>
            <form action={salvaProprietaCollezione.bind(null, collezione.id)}>
              <div className="scheda-titolo">Posizioni</div>
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
                  <button className="btn" type="submit">
                    Salva
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>

        {righe.length === 0 ? (
          <div className="vuoto">Nessun prodotto di questa collezione è riconosciuto qui.</div>
        ) : (
          <div className="tabella-wrap">
            <table>
              <thead>
                <tr>
                  <th>Prodotto</th>
                  <th>Categoria</th>
                  <th className="num">Prezzo</th>
                  <th className="num">Pezzi 90gg</th>
                  <th className="num">Venduto</th>
                  <th>Peso in collezione</th>
                </tr>
              </thead>
              <tbody>
                {righe.map(({ p, pezzi, ricavo }) => (
                  <tr key={p.id} className="riga-cliccabile">
                    <td>
                      <Link href={`/prodotti/${p.id}`} className="cella-nome link-riga">
                        {p.nome}
                      </Link>
                      <div className="cella-sub">{p.codice}</div>
                    </td>
                    <td className="cella-muta">{etichettaCategoria(p.categoria)}</td>
                    <td className="num">{euro(p.prezzoVendita)}</td>
                    <td className="num">{pezzi}</td>
                    <td className="num">{euro(ricavo)}</td>
                    <td style={{ width: 130 }}>
                      <BarraQuota quota={ricavoTotale > 0 ? ricavo / ricavoTotale : 0} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Cancellare qui e cancellare sul negozio sono due gesti diversi:
            vanno scelti, non confusi in un bottone solo. */}
        <div className="scheda" style={{ marginTop: 18 }}>
          <div className="scheda-titolo">Elimina questa collezione</div>
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
        </div>

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

        <RiquadroSeo
          tipo="collezione"
          id={id}
          daNegozio={{ titolo: collezione.seoTitoloShopify, descrizione: collezione.seoDescrizioneShopify }}
          nostro={{ titolo: collezione.seoTitolo, descrizione: collezione.seoDescrizione }}
          sincronia={{ modificatoIl: collezione.seoModificatoIl, spintoIl: collezione.seoSpintoIl }}
          percorso={`/collezioni/shopify/${id}`}
          conferma={sp.seoConferma === "1"}
        />
      </main>
    </div>
  );
}
