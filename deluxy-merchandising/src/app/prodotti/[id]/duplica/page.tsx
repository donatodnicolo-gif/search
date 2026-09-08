import Link from "next/link";
import { notFound } from "next/navigation";
import { FormProdottoNuovo } from "@/components/FormProdottoNuovo";
import { Sidebar } from "@/components/Sidebar";
import { duplicaProdottoCompleto } from "@/lib/azioni-prodotto-nuovo";
import { prisma } from "@/lib/db";
import { datiModuloProdotto } from "@/lib/modulo-prodotto-dati";
import { PRODOTTO_PER_IL_MODULO, prodottoPerIlModulo } from "@/lib/prodotto-per-il-modulo";

export const dynamic = "force-dynamic";

// **Duplica un prodotto** (chiesto dall'utente il 07/09/2026: «ogni prodotto in
// modifica o dopo che è stato creato si possa duplicare; la duplicazione genera
// nuove sku casuali anche per le varianti; aggiorna poi il titolo del prodotto
// con (Duplica) all'inizio»).
//
// ⚠️ Questa pagina MANCAVA: l'azione `duplicaProdottoCompleto` era scritta e
// compilava, il modulo accettava già `duplica`, ma senza la pagina la
// duplicazione non era raggiungibile da nessun bottone — una funzione che nel
// codice c'era e per chi usa l'app non esisteva. Aggiunta l'08/09/2026.
//
// È lo stesso modulo di «Nuovo prodotto», precompilato coi dati dell'originale.
// Due sole differenze, ed entrambe volute:
//   · il **codice è vuoto**, così ne nasce uno nuovo e le varianti prendono da
//     lui «-1», «-2»… (è la condizione su cui conta `duplicaProdottoCompleto`);
//   · il **nome porta «(Duplica)» davanti**, come chiesto — perché due schede
//     con lo stesso titolo, in un elenco di 1.700 prodotti, non si distinguono.
export default async function DuplicaProdottoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ errore?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const [p, dati] = await Promise.all([
    prisma.prodotto.findUnique({ where: { id }, include: PRODOTTO_PER_IL_MODULO }),
    datiModuloProdotto(),
  ]);
  if (!p) notFound();

  const { iniziale, nomeNegozio } = prodottoPerIlModulo(p, dati);
  // «(Duplica)» una volta sola: duplicando una copia non si accumula.
  const nome = iniziale.nome.startsWith("(Duplica) ") ? iniziale.nome : `(Duplica) ${iniziale.nome}`;

  return (
    <div className="layout">
      <Sidebar attiva="prodotti" />
      <main className="main" style={{ maxWidth: 860 }}>
        <Link className="ritorno" href={`/prodotti/${p.id}`}>
          ← {p.nome}
        </Link>
        <div className="page-head">
          <div>
            <h1 className="page-title">Duplica «{p.nome}»</h1>
            <p className="page-sub">
              Stessi dati di {nomeNegozio ? `${p.nome} su ${nomeNegozio}` : p.nome}, ma è un <b>prodotto nuovo</b>: SKU rigenerato, varianti
              rinumerate, foto, campi del negozio, tag e collezioni ricopiati. L&apos;originale non cambia. Nasce come <b>Concept</b>: per
              mandarlo sul negozio scegli la fase Pubblico.
            </p>
          </div>
        </div>
        {sp.errore && <div className="avviso-errore">{sp.errore}</div>}
        <FormProdottoNuovo
          {...dati}
          iniziale={{ ...iniziale, nome, codice: "", shopifyId: null }}
          duplica
          azione={duplicaProdottoCompleto.bind(null, p.id)}
        />
      </main>
    </div>
  );
}
