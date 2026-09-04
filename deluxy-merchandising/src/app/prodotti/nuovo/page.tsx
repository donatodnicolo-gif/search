import Link from "next/link";
import { FormProdottoNuovo } from "@/components/FormProdottoNuovo";
import { Sidebar } from "@/components/Sidebar";
import { creaProdottoCompleto } from "@/lib/azioni-prodotto-nuovo";
import { datiModuloProdotto } from "@/lib/modulo-prodotto-dati";

export const dynamic = "force-dynamic";

// **Nuovo prodotto** — il modulo unico (04/09/2026). Fa nascere la scheda qui
// e, se la fase è «Pubblico», anche sul negozio Shopify scelto: foto e video,
// collezione, campi del negozio, varianti, traduzioni e finestra di
// pubblicazione compresi. Lo stesso modulo modifica ogni prodotto esistente
// (`/prodotti/[id]/modifica`).
export default async function NuovoProdottoPage({ searchParams }: { searchParams: Promise<{ errore?: string }> }) {
  const sp = await searchParams;
  const dati = await datiModuloProdotto();

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
              La scheda nasce qui; con la fase <b>Pubblico</b> nasce anche sul negozio Shopify scelto, con foto, collezione, campi del negozio e
              traduzioni. Per magazzino e campi liberi c&apos;è <Link href="/prodotti/nuovo-shopify">Nuovo su Shopify</Link>.
            </p>
          </div>
        </div>

        {sp.errore && <div className="avviso-errore">{sp.errore}</div>}
        {dati.negozi.length === 0 && (
          <div className="nota-info">
            <span className="nota-icona">◆</span>
            <span>
              Nessun negozio collegato: senza, non c&apos;è dove mettere le foto né dove pubblicare. Collegane uno da{" "}
              <Link href="/impostazioni">Negozi &amp; permessi</Link>.
            </span>
          </div>
        )}

        <FormProdottoNuovo {...dati} azione={creaProdottoCompleto} />
      </main>
    </div>
  );
}
