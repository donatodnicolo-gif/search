import { notFound } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { prisma } from "@/lib/db";
import { euro } from "@/lib/dominio";
import { REGOLE, etichettaRegola } from "@/lib/ordinamento-vetrina";
import {
  applicaRegolaOrdinamento,
  spostaInCollezione,
  spingiOrdineSuShopify,
} from "@/lib/azioni-vetrina-shopify";

export const dynamic = "force-dynamic";

const MAX_RIGHE = 300;

export default async function CurazioneCollezionePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ esito?: string; messaggio?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const c = await prisma.collezioneShopify.findUnique({
    where: { id },
    include: {
      tipologia: { select: { nome: true, regolaOrdinamento: true } },
      prodotti: {
        orderBy: [{ posizione: "asc" }, { prodotto: { nome: "asc" } }],
        include: {
          prodotto: {
            select: { id: true, nome: true, codice: true, immagine: true, prezzoVendita: true, costoProduzione: true },
          },
        },
      },
    },
  });
  if (!c) notFound();

  // Il push funziona solo se il negozio ha un token con write_products: lo si
  // legge dalla verifica salvata in Impostazioni, senza chiamare Shopify qui.
  const negozio = await prisma.negozioShopify.findFirst({
    where: { nome: c.negozio },
    select: { permessi: true, attivo: true },
  });
  const puoScrivere = !!negozio?.attivo && (negozio?.permessi ?? "").includes("write_products");
  const manuale = c.tipo === "manuale";
  const daSincronizzare =
    c.ordineModificatoIl != null && (c.ordineSpintoIl == null || c.ordineModificatoIl > c.ordineSpintoIl);

  const righe = c.prodotti.slice(0, MAX_RIGHE);
  const restano = c.prodotti.length - righe.length;

  return (
    <div className="layout">
      <Sidebar attiva="visual" />
      <main className="main" style={{ maxWidth: 920 }}>
        <a className="ritorno" href="/visual">← Visual merchandising</a>
        <div className="page-head">
          <div>
            <div className="prodotto-codice">
              {c.negozio} · {c.tipo === "automatica" ? "collezione automatica" : "collezione manuale"}
              {c.pubblicataShopify ? " · pubblicata" : ""}
            </div>
            <h1 className="page-title">{c.titolo}</h1>
            <p className="page-sub">
              {c.prodotti.length} prodotti conosciuti · ordine attuale: <b>{etichettaRegola(c.regolaOrdinamento)}</b>
              {c.tipologia && (
                <>
                  {" "}· tipologia <b>{c.tipologia.nome}</b> (regola standing {etichettaRegola(c.tipologia.regolaOrdinamento)}) ·{" "}
                  <a href="/visual/tipologie">gestisci</a>
                </>
              )}
            </p>
          </div>
        </div>

        {sp.messaggio && (
          <div className={`nota-info${sp.esito === "errore" ? " nota-errore" : ""}`}>
            <span className="nota-icona">{sp.esito === "errore" ? "△" : "◆"}</span>
            <span>{sp.messaggio}</span>
          </div>
        )}

        {/* Regola d'ordine: propone il punto di partenza, poi si ritocca a mano. */}
        <div className="scheda">
          <div className="scheda-titolo">Regola d'ordine</div>
          <form action={applicaRegolaOrdinamento.bind(null, id)} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <select
              name="regola"
              defaultValue={c.regolaOrdinamento ?? "manuale"}
              style={{ font: "inherit", padding: "9px 12px", borderRadius: "var(--radius-m)", background: "var(--fill)", border: "1px solid transparent", minWidth: 260 }}
            >
              {REGOLE.map((r) => (
                <option key={r.chiave} value={r.chiave}>{r.nome}</option>
              ))}
            </select>
            <button type="submit" className="btn">Applica regola</button>
            <span className="page-sub" style={{ margin: 0 }}>
              {REGOLE.find((r) => r.chiave === (c.regolaOrdinamento ?? "manuale"))?.spiega}
            </span>
          </form>
        </div>

        {/* Push su Shopify: guardato per collezione manuale + token con write_products. */}
        <div className="scheda">
          <div className="scheda-titolo">Ordine su Shopify</div>
          <p className="page-sub" style={{ marginTop: 0 }}>
            {daSincronizzare ? (
              <b>C'è un ordine curato non ancora inviato al negozio.</b>
            ) : c.ordineSpintoIl ? (
              "L'ordine curato qui è già stato inviato al negozio."
            ) : (
              "L'ordine non è ancora stato inviato al negozio."
            )}
          </p>
          {!manuale && (
            <p className="page-sub" style={{ marginTop: 0, color: "var(--orange)" }}>
              È una collezione <b>automatica</b>: su Shopify i prodotti li ordina la regola della smart collection, non
              si può imporre un ordine a mano. Qui puoi comunque studiarne l'ordine.
            </p>
          )}
          {manuale && !puoScrivere && (
            <p className="page-sub" style={{ marginTop: 0, color: "var(--orange)" }}>
              Per inviare l'ordine serve un token con <b>write_products</b> collegato al negozio «{c.negozio}»: si
              imposta in <a href="/impostazioni">Negozi &amp; permessi</a>.
            </p>
          )}
          <form action={spingiOrdineSuShopify.bind(null, id)}>
            <button type="submit" className="btn" disabled={!manuale || !puoScrivere}>
              Invia l'ordine a Shopify
            </button>
          </form>
        </div>

        <div className="scheda">
          <div className="scheda-titolo">Sequenza dei prodotti</div>
          {c.prodotti.length === 0 ? (
            <div className="vuoto-mini">Nessun prodotto conosciuto in questa collezione. Rilancia l'import da Collezioni.</div>
          ) : (
            <>
              <div className="vetrina-lista">
                {righe.map((vp, i) => (
                  <div className="vetrina-riga" key={vp.id}>
                    <span className="vetrina-pos">{i + 1}</span>
                    <span className="vetrina-mini">
                      {vp.prodotto.immagine ? <img src={vp.prodotto.immagine} alt="" /> : "❀"}
                    </span>
                    <span className="vetrina-info">
                      <a href={`/prodotti/${vp.prodottoId}`} className="cella-nome">{vp.prodotto.nome}</a>
                      <div className="cella-sub">
                        {vp.prodotto.codice}
                        {vp.prodotto.prezzoVendita > 0 ? ` · ${euro(vp.prodotto.prezzoVendita)}` : ""}
                      </div>
                    </span>
                    <span className="vetrina-azioni">
                      <form action={spostaInCollezione.bind(null, id, vp.prodottoId, "su")}>
                        <button className="icon-btn" title="Sposta su" type="submit" disabled={i === 0}>↑</button>
                      </form>
                      <form action={spostaInCollezione.bind(null, id, vp.prodottoId, "giu")}>
                        <button className="icon-btn" title="Sposta giù" type="submit" disabled={i === righe.length - 1}>↓</button>
                      </form>
                    </span>
                  </div>
                ))}
              </div>
              {restano > 0 && (
                <p className="page-sub" style={{ marginTop: 12 }}>
                  Mostrati i primi {MAX_RIGHE}; altri {restano} prodotti non sono in elenco ma l'ordine inviato a
                  Shopify li comprende tutti.
                </p>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
