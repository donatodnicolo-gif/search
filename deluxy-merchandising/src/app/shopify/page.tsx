import { Sidebar } from "@/components/Sidebar";
import { Badge } from "@/components/Badge";
import { prisma } from "@/lib/db";
import { segnaShopify } from "@/lib/azioni";
import { shopifyConfigurato } from "@/lib/shopify";
import { COLORE_SHOPIFY, ETICHETTA_SHOPIFY, euro, iso } from "@/lib/dominio";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ShopifyPage() {
  const prodotti = await prisma.prodotto.findMany({
    where: { fase: { not: "archiviato" } },
    orderBy: [{ shopifyStato: "asc" }, { priorita: "desc" }],
    include: { collezione: { select: { nome: true } } },
  });

  const conta = (s: string) => prodotti.filter((p) => p.shopifyStato === s).length;
  const configurato = shopifyConfigurato();

  // Azioni disponibili per stato corrente
  const azioni: Record<string, [string, string][]> = {
    non_pubblicato: [["bozza", "Prepara bozza"], ["pubblicato", "Pubblica"]],
    bozza: [["pubblicato", "Pubblica"], ["non_pubblicato", "Ritira"]],
    pubblicato: [["non_pubblicato", "Ritira"]],
  };

  return (
    <div className="layout">
      <Sidebar attiva="shopify" />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Shopify</h1>
            <p className="page-sub">Il ponte verso il canale di vendita. L'app resta la fonte di verità: da qui si porta il prodotto in vetrina online.</p>
          </div>
        </div>

        <div className="nota-info">
          <span className="nota-icona">◆</span>
          <span>
            {configurato
              ? "Negozio Shopify collegato: le azioni sotto sincronizzano davvero i prodotti."
              : "Nessun negozio Shopify collegato (SHOPIFY_STORE_DOMAIN / SHOPIFY_ADMIN_TOKEN non impostati). Le azioni segnano lo stato e preparano la pipeline; la scrittura reale sul negozio si attiva collegando le credenziali. Apri un prodotto → tab Shopify per vedere il payload."}
          </span>
        </div>

        <div className="kpi-riga">
          <div className="kpi"><div className="kpi-valore" style={{ color: "var(--green)" }}>{conta("pubblicato")}</div><div className="kpi-etichetta">Pubblicati</div></div>
          <div className="kpi"><div className="kpi-valore" style={{ color: "var(--orange)" }}>{conta("bozza")}</div><div className="kpi-etichetta">In bozza</div></div>
          <div className="kpi"><div className="kpi-valore">{conta("non_pubblicato")}</div><div className="kpi-etichetta">Non pubblicati</div></div>
        </div>

        <div className="tabella-wrap">
          <table>
            <thead>
              <tr><th>Prodotto</th><th>Collezione</th><th className="num">Prezzo</th><th>Stato</th><th>Ultima sync</th><th>Azioni</th></tr>
            </thead>
            <tbody>
              {prodotti.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link href={`/prodotti/${p.id}?tab=shopify`} className="cella-nome">{p.nome}</Link>
                    <div className="cella-sub">{p.codice}</div>
                  </td>
                  <td className="cella-muta">{p.collezione?.nome ?? "—"}</td>
                  <td className="num">{euro(p.prezzoVendita)}</td>
                  <td><Badge testo={ETICHETTA_SHOPIFY[p.shopifyStato]} colore={COLORE_SHOPIFY[p.shopifyStato]} /></td>
                  <td className="cella-muta">{p.shopifySyncIl ? iso(p.shopifySyncIl) : "—"}</td>
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      {(azioni[p.shopifyStato] ?? []).map(([stato, label]) => (
                        <form action={segnaShopify.bind(null, p.id, stato)} key={stato}>
                          <button type="submit" className="btn small btn-secondario">{label}</button>
                        </form>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
