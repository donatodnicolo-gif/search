import Link from "next/link";
import { FormProdottoNuovo } from "@/components/FormProdottoNuovo";
import { Sidebar } from "@/components/Sidebar";
import { creaProdottoCompleto } from "@/lib/azioni-prodotto-nuovo";
import { elencoCategorie } from "@/lib/classificazione";
import { prisma } from "@/lib/db";
import { elencoNegozi } from "@/lib/negozi";
import { statoSegreto } from "@/lib/segreti";

export const dynamic = "force-dynamic";

// **Nuovo prodotto** — il modulo unico (04/09/2026). Fa nascere la scheda qui
// e, se la fase è «Pubblico», anche sul negozio Shopify scelto: foto e video,
// collezione, traduzioni e finestra di pubblicazione compresi. L'altro modulo,
// «Nuovo su Shopify», resta per chi vuole varianti, magazzino e campi extra.
export default async function NuovoProdottoPage({ searchParams }: { searchParams: Promise<{ errore?: string }> }) {
  const sp = await searchParams;
  const [negozi, categorie, collezioni, prompt, chiaveAi] = await Promise.all([
    elencoNegozi(),
    elencoCategorie(),
    prisma.collezioneShopify.findMany({
      where: { tipo: "manuale" },
      orderBy: [{ negozio: "asc" }, { titolo: "asc" }],
      select: { id: true, titolo: true, negozio: true },
    }),
    prisma.promptCategoria.findMany({ select: { categoria: true } }),
    statoSegreto("OPENAI_API_KEY"),
  ]);
  const conPrompt = new Set(prompt.map((p) => p.categoria));

  return (
    <div className="layout">
      <Sidebar attiva="prodotti" />
      <main className="main" style={{ maxWidth: 860 }}>
        <Link className="ritorno" href="/prodotti">
          ← Prodotti
        </Link>
        <div className="page-head">
          <div>
            <h1 className="page-title">Nuovo prodotto</h1>
            <p className="page-sub">
              La scheda nasce qui; con la fase <b>Pubblico</b> nasce anche sul negozio Shopify scelto, con foto,
              collezione e traduzioni. Per varianti, magazzino e campi extra c&apos;è{" "}
              <Link href="/prodotti/nuovo-shopify">Nuovo su Shopify</Link>.
            </p>
          </div>
        </div>

        {sp.errore && <div className="avviso-errore">{sp.errore}</div>}
        {negozi.filter((n) => n.attivo).length === 0 && (
          <div className="nota-info">
            <span className="nota-icona">◆</span>
            <span>
              Nessun negozio collegato: senza, non c&apos;è dove mettere le foto né dove pubblicare. Collegane uno da{" "}
              <Link href="/impostazioni">Negozi &amp; permessi</Link>.
            </span>
          </div>
        )}

        <FormProdottoNuovo
          negozi={negozi
            .filter((n) => n.attivo)
            .map((n) => ({ id: n.id, nome: n.nome, dominio: n.dominio, puoScrivere: n.permessi.includes("write_products") }))}
          categorie={categorie
            .filter((c) => c.attiva && c.chiave !== "DA_CLASSIFICARE")
            .map((c) => ({ chiave: c.chiave, nome: c.nome, negozio: c.negozio, conPrompt: conPrompt.has(c.chiave) }))}
          collezioni={collezioni}
          aiPronta={chiaveAi.presente}
          azione={creaProdottoCompleto}
        />
      </main>
    </div>
  );
}
