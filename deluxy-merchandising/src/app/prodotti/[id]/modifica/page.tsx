import Link from "next/link";
import { notFound } from "next/navigation";
import { FormProdottoNuovo, type ProdottoIniziale } from "@/components/FormProdottoNuovo";
import { Sidebar } from "@/components/Sidebar";
import { aggiornaProdottoCompleto } from "@/lib/azioni-prodotto-nuovo";
import { prisma } from "@/lib/db";
import { isoRoma } from "@/lib/fuso";
import { datiModuloProdotto } from "@/lib/modulo-prodotto-dati";

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
  searchParams: Promise<{ errore?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const [p, dati] = await Promise.all([
    prisma.prodotto.findUnique({
      where: { id },
      include: {
        varianti: { orderBy: { creataIl: "asc" } },
        media: { orderBy: { ordine: "asc" } },
        collezioniShopify: { select: { collezione: { select: { negozio: true } } }, take: 1 },
      },
    }),
    datiModuloProdotto(),
  ]);
  if (!p) notFound();

  // Il negozio: quello dichiarato, altrimenti quello delle sue collezioni, altrimenti il primo.
  const nomeNegozio = p.negozioNome ?? p.collezioniShopify[0]?.collezione.negozio ?? null;
  const negozio = dati.negozi.find((n) => n.nome === nomeNegozio) ?? dati.negozi[0];
  const metafield = (p.metafieldShopify && typeof p.metafieldShopify === "object" && !Array.isArray(p.metafieldShopify)
    ? (p.metafieldShopify as Record<string, string>)
    : {}) as Record<string, string>;

  const iniziale: ProdottoIniziale = {
    id: p.id,
    nome: p.nome,
    negozioId: negozio?.id ?? "",
    fase: p.fase === "archiviato" ? "approvato" : p.fase,
    categoria: p.categoria,
    collezioneShopifyId: p.collezioneShopifyId ?? "",
    codice: p.codice,
    descrizione: p.descrizione ?? "",
    brief: p.brief ?? "",
    materiali: p.materiali ?? "",
    palette: p.palette ?? "",
    costoProduzione: p.costoProduzione,
    prezzoVendita: p.prezzoVendita,
    pubblicatoDal: p.pubblicatoDal ? isoRoma(p.pubblicatoDal) : "",
    pubblicatoFinoAl: p.pubblicatoFinoAl ? isoRoma(p.pubblicatoFinoAl) : "",
    controllaStock: p.varianti.some((v) => v.giacenza > 0),
    giacenza: p.varianti.length === 1 ? p.varianti[0].giacenza : 0,
    nomeOpzione: "Formato",
    varianti: p.varianti.map((v) => ({
      nome: v.nome,
      sku: v.sku,
      prezzo: String(p.prezzoVendita + v.deltaPrezzo),
      costo: v.deltaCosto ? String(p.costoProduzione + v.deltaCosto) : "",
      giacenza: String(v.giacenza),
    })),
    media: p.media
      .filter((x) => x.shopifyFileId)
      .map((x) => ({
        shopifyFileId: x.shopifyFileId as string,
        tipo: x.tipo === "video" ? "video" : "immagine",
        url: x.url,
        anteprima: x.anteprima,
        stato: x.stato === "fallito" ? "fallito" : x.stato === "in-elaborazione" ? "in-elaborazione" : "pronto",
        nome: x.nome ?? "",
        negozio: x.negozio ?? negozio?.nome ?? "",
      })),
    metafield,
    tags: (p.tagShopify ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    shopifyId: p.shopifyId,
  };

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
                ? `Il prodotto è sul negozio ${nomeNegozio ?? ""}: salvando si aggiorna anche là (titolo, descrizione, stato, campi, prezzi delle varianti, foto nuove).`
                : "Il prodotto non è sul negozio: scegliendo la fase Pubblico si pubblica come uno nuovo."}
            </p>
          </div>
        </div>
        {sp.errore && <div className="avviso-errore">{sp.errore}</div>}
        {p.fase === "archiviato" && (
          <div className="nota-info">
            <span className="nota-icona">◆</span>
            <span>Il prodotto è archiviato: salvando torna alla fase scelta qui sotto.</span>
          </div>
        )}
        <FormProdottoNuovo {...dati} iniziale={iniziale} azione={aggiornaProdottoCompleto.bind(null, p.id)} />
      </main>
    </div>
  );
}
