import Link from "next/link";
import { FormProdottoShopify } from "@/components/FormProdottoShopify";
import { Sidebar } from "@/components/Sidebar";
import { creaProdottoShopifyAzione } from "@/lib/azioni-negozi";
import { prisma } from "@/lib/db";
import { CATEGORIE, etichettaCategoria } from "@/lib/dominio";
import { elencoNegozi } from "@/lib/negozi";
import { statoSegreto } from "@/lib/segreti";

export const dynamic = "force-dynamic";

export default async function NuovoProdottoShopifyPage({
  searchParams,
}: {
  searchParams: Promise<{ errore?: string }>;
}) {
  const sp = await searchParams;
  const [negozi, prompt, chiaveAi] = await Promise.all([
    elencoNegozi(),
    prisma.promptCategoria.findMany({ select: { categoria: true } }),
    statoSegreto("OPENAI_API_KEY"),
  ]);
  const conPrompt = new Set(prompt.map((p) => p.categoria));
  const categorie = CATEGORIE.map((c) => ({
    chiave: c,
    nome: etichettaCategoria(c),
    conPrompt: conPrompt.has(c),
  }));
  const scelte = negozi
    .filter((n) => n.attivo)
    .map((n) => ({
      id: n.id,
      nome: n.nome,
      dominio: n.dominio,
      // Si può scrivere solo se il token lo dichiara. Meglio un bottone spento
      // con la ragione scritta che una chiamata che fallisce dopo il salvataggio.
      puoScrivere: n.permessi.includes("write_products"),
    }));
  const nessunoScrivibile = scelte.every((s) => !s.puoScrivere);

  return (
    <div className="layout">
      <Sidebar attiva="prodotti" />
      <main className="main">
        <Link href="/prodotti" className="ritorno">
          ← Prodotti
        </Link>
        <div className="page-head">
          <div>
            <h1 className="page-title">Nuovo prodotto su Shopify</h1>
            <p className="page-sub">
              Le stesse sezioni del form di app.deluxy.it — dettagli, magazzino, varianti, campi extra —
              tradotte sui campi che Shopify capisce. Il prodotto nasce sul negozio scelto e, insieme, nel
              catalogo di Merchandising.
            </p>
          </div>
        </div>

        {sp.errore && <div className="avviso-errore">{sp.errore}</div>}

        {scelte.length === 0 && (
          <div className="nota-info">
            <span className="nota-icona">◆</span>
            <span>
              Nessun negozio collegato: il prodotto non saprebbe dove nascere. Collegane uno da{" "}
              <Link href="/impostazioni">Negozi &amp; permessi</Link>.
            </span>
          </div>
        )}
        {scelte.length > 0 && nessunoScrivibile && (
          <div className="nota-info">
            <span className="nota-icona">◆</span>
            <span>
              I negozi collegati sanno leggere ma non scrivere: manca il permesso <code>write_products</code>.
              Aggiungilo all&apos;app Shopify e rifai la verifica da{" "}
              <Link href="/impostazioni">Negozi &amp; permessi</Link>.
            </span>
          </div>
        )}

        <FormProdottoShopify
          negozi={scelte}
          azione={creaProdottoShopifyAzione}
          categorie={categorie}
          aiPronta={chiaveAi.presente}
        />
      </main>
    </div>
  );
}
