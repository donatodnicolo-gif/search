import Link from "next/link";
import { notFound } from "next/navigation";
import { FormProdottoNuovo } from "@/components/FormProdottoNuovo";
import { Sidebar } from "@/components/Sidebar";
import { aggiornaProdottoCompleto } from "@/lib/azioni-prodotto-nuovo";
import { prisma } from "@/lib/db";
import { datiModuloProdotto } from "@/lib/modulo-prodotto-dati";
import { PRODOTTO_PER_IL_MODULO, prodottoPerIlModulo } from "@/lib/prodotto-per-il-modulo";

export const dynamic = "force-dynamic";

// **Modifica col modulo** (chiesto dall'utente il 04/09/2026: «ogni prodotto
// nell'app poi potrà essere modificato con lo stesso form»). Stesso componente
// di «Nuovo prodotto», precompilato; il salvataggio aggiorna qui e, se il
// prodotto è sul negozio, anche là.
export default async function ModificaProdottoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ errore?: string; fase?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const [p, dati] = await Promise.all([
    prisma.prodotto.findUnique({
      where: { id },
      include: PRODOTTO_PER_IL_MODULO,
    }),
    datiModuloProdotto(),
  ]);
  if (!p) notFound();

  const { iniziale, nomeNegozio, negozio } = prodottoPerIlModulo(p, dati);

  const altriNomi = p.pubblicazioni.filter((r) => r.negozio !== negozio?.nome && r.shopifyId && r.origine !== "tolto").map((r) => r.negozio);

  return (
    <div className="layout">
      <Sidebar attiva="prodotti" />
      <main className="main" style={{ maxWidth: 860 }}>
        <Link className="ritorno" href={`/prodotti/${p.id}`}>
          ← {p.nome}
        </Link>
        <div className="page-head">
          <div>
            <h1 className="page-title">Modifica «{p.nome}»</h1>
            <p className="page-sub">
              {p.shopifyId
                ? `Il prodotto è sul negozio ${nomeNegozio ?? ""}${altriNomi.length ? ` e su ${altriNomi.join(", ")}` : ""}: salvando si aggiorna anche là (titolo, descrizione, stato, campi, prezzi delle varianti, foto nuove).`
                : "Il prodotto non è sul negozio: scegliendo la fase Pubblico si pubblica come uno nuovo, anche sugli altri negozi spuntati."}
            </p>
          </div>
        </div>
        {sp.errore && <div className="avviso-errore">{sp.errore}</div>}
        {/* ⭐ 11/09/2026: arrivati qui dal tasto «Approvato»/«Pubblico» di un prodotto non ancora sul negozio. */}
        {sp.fase && !p.shopifyId && (
          <div className="avviso-info">
            Fase scelta: <b>{sp.fase === "in_vendita" ? "Pubblico" : "Approvato"}</b>. Controlla negozio, prezzi, foto e campi, poi salva: il prodotto va su Shopify
            {sp.fase === "in_vendita" ? " visibile al pubblico." : " in bozza."}
          </div>
        )}
        {p.fase === "archiviato" && (
          <div className="nota-info">
            <span className="nota-icona">◆</span>
            <span>Il prodotto è archiviato: salvando torna alla fase scelta qui sotto.</span>
          </div>
        )}
        <FormProdottoNuovo {...dati} iniziale={sp.fase && !p.shopifyId ? { ...iniziale, fase: sp.fase } : iniziale} azione={aggiornaProdottoCompleto.bind(null, p.id)} />
      </main>
    </div>
  );
}
