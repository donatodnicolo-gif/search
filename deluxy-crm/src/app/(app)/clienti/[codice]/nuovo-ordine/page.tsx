import { ordiniCliente, schedaCliente } from "@/lib/orders";
import { dentroOppureFuori } from "@/lib/sessione-server";
import { negoziCS, type NegozioCS } from "@/lib/nuovo-ordine";
import FormNuovoOrdine from "@/components/FormNuovoOrdine";
import { TornaIndietro } from "@/components/TornaIndietro";
import { euro, segmento } from "@/lib/etichette";

export const dynamic = "force-dynamic";

// NUOVO ORDINE PER QUESTO CLIENTE — il gesto del telefono: si concorda, si
// crea la bozza su Shopify (via Customer Service) e si manda il link di
// pagamento. Tutto precompilato dalla scheda: contatti dal registro Orders,
// indirizzo dall'ultimo ordine consegnato.
//
// Cliente NUOVO (10/09): se Orders non lo conosce e il codice è un'email, il
// modulo si apre lo stesso, vuoto, con l'email già scritta — come nel Customer
// Service. Il cliente nascerà in Orders col primo ordine.
export default async function NuovoOrdinePerCliente({ params }: { params: Promise<{ codice: string }> }) {
  await dentroOppureFuori(); // revoca: sessione con password vecchia = fuori
  const { codice: codiceRaw } = await params;
  const codice = decodeURIComponent(codiceRaw);

  const [scheda, ordini, negozi] = await Promise.all([
    schedaCliente(codice),
    ordiniCliente(codice, 1, 10),
    negoziCS(),
  ]);

  const nuovo = !scheda.ok && codice.includes("@");
  if (!scheda.ok && !nuovo) {
    return (
      <>
        <div className="intestazione">
          <div>
            <h1 className="page-title">Nuovo ordine</h1>
          </div>
          <TornaIndietro fallback="/clienti" label="Libro clienti" />
        </div>
        <div className="errore-card">{scheda.errore}</div>
      </>
    );
  }
  const c = scheda.ok ? scheda.dati : null;
  const seg = c ? segmento(c.segmento) : null;

  // Nome e cognome: l'ultimo pezzo fa da cognome, il resto da nome. Il form
  // resta modificabile: è un default, non un'anagrafe.
  const pezzi = (c?.nome ?? "").trim().split(/\s+/);
  const cognome = pezzi.length > 1 ? pezzi[pezzi.length - 1] : "";
  const nome = pezzi.length > 1 ? pezzi.slice(0, -1).join(" ") : (pezzi[0] ?? "");

  // L'indirizzo più recente che conosciamo: dal primo ordine che ne ha uno.
  const conIndirizzo = ordini.ok ? ordini.dati.ordini.find((o) => o.spedizione?.indirizzo) : undefined;
  const indirizzo = conIndirizzo?.spedizione
    ? {
        indirizzo: conIndirizzo.spedizione.indirizzo ?? "",
        cap: conIndirizzo.spedizione.cap ?? "",
        citta: conIndirizzo.spedizione.citta ?? "",
        provincia: conIndirizzo.spedizione.provincia ?? "",
        paese: conIndirizzo.spedizione.paese ?? "IT",
      }
    : null;

  // Il negozio suggerito dal brand degli ordini: Flowers prima (il suo nome
  // sta dentro anche a «deluxy»), poi Cake, poi Deluxy. Solo un default.
  const brand = (c?.brand ?? []).join(" ").toLowerCase();
  const trova = (lista: NegozioCS[], pezzo: string) => lista.find((n) => n.nome.toLowerCase().includes(pezzo))?.id;
  const listaNegozi = negozi.ok ? negozi.dati.negozi : [];
  const suggerito =
    (brand.includes("flowers") ? trova(listaNegozi, "flower") : undefined) ??
    (brand.includes("cake") ? trova(listaNegozi, "cake") : undefined) ??
    (brand.includes("deluxy") ? trova(listaNegozi, "deluxy") : undefined) ??
    listaNegozi[0]?.id ??
    "";

  return (
    <>
      <div className="intestazione">
        <div>
          <h1 className="page-title">Nuovo ordine</h1>
          {c && seg ? (
            <p className="page-sub" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span>per</span>
              <a href={`/clienti/${encodeURIComponent(codice)}`} style={{ fontWeight: 550 }}>
                {c.nome ?? c.email}
              </a>
              <span className="badge colorato" style={{ ["--badge-colore" as string]: seg.colore }}>
                <span className="dot" />
                {seg.nome}
              </span>
              <span className="terziario">
                {euro(c.speso)} in {c.ordini} ordini
              </span>
            </p>
          ) : (
            <p className="page-sub">
              Cliente nuovo: <strong>{codice}</strong> non ha ancora ordini nel registro. Compila nome, cognome e
              telefono qui sotto; con il primo ordine pagato nascerà anche la sua scheda.
            </p>
          )}
        </div>
        <TornaIndietro fallback={c ? `/clienti/${encodeURIComponent(codice)}` : "/nuovo-ordine"} label={c ? "Scheda cliente" : "Nuovo ordine"} />
      </div>

      {!negozi.ok ? (
        <div className="errore-card">{negozi.errore}</div>
      ) : listaNegozi.length === 0 ? (
        <div className="errore-card">Il Customer Service non ha negozi Shopify collegati: l&apos;ordine non si può creare da qui.</div>
      ) : (
        <FormNuovoOrdine
          codice={codice}
          cliente={{ nome, cognome, email: c?.email ?? (nuovo ? codice.toLowerCase() : ""), telefono: c?.telefono ?? "" }}
          indirizzo={indirizzo}
          negozi={listaNegozi}
          negozioSuggerito={suggerito}
        />
      )}
    </>
  );
}
