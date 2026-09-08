import Link from "next/link";
import { Miniatura } from "./Miniatura";
import { dataIt } from "@/lib/fuso";
import { Badge } from "./Badge";
import { BarraMargine } from "./BarraMargine";
import {
  calcolaMargine,
  COLORE_FASE,
  COLORE_SHOPIFY,
  ETICHETTA_FASE,
  ETICHETTA_SHOPIFY,
  etichettaCategoria,
  euro,
} from "@/lib/dominio";

export type RigaProdotto = {
  id: string;
  codice: string;
  nome: string;
  categoria: string;
  fase: string;
  prezzoVendita: number;
  costoProduzione: number;
  shopifyStato: string;
  immagine?: string | null;
  creatoIl?: Date | string | null;
  collezione: { nome: string; margineTarget: number | null } | null;
};

/**
 * Ordinamento delle colonne (08/09/2026, regola chiesta dall'utente: «ordina la
 * tabella prodotti per data di creazione, ma come regola UX consenti di
 * ordinare tutte le colonne»).
 *
 * Due scelte che vengono dal Libro UX e dai fatti di quest'app:
 *
 * - **Si ordina nel database, non nella pagina.** La tabella mostra 100
 *   prodotti per volta su migliaia: ordinare le righe già scaricate ordinerebbe
 *   solo la pagina, dando il primo posto a un prodotto che è primo *fra quelli
 *   che si stavano guardando*. L'ordine sta quindi nell'indirizzo (`?ordina=` e
 *   `?verso=`) e torna al server, che riparte anche da pagina 1.
 * - **Cliccabile solo ciò che si può ordinare davvero.** «Margine» è calcolato
 *   riga per riga (prezzo meno costo) e non è una colonna del database: non si
 *   può ordinare senza scaricare tutto il catalogo, quindi resta un'intestazione
 *   normale invece di un pulsante che promette e non mantiene.
 */
export type OrdineTabella = { ordina: string; verso: "asc" | "desc"; link: (chiave: string) => string };

export function TabellaProdotti({
  prodotti,
  mostraCollezione = true,
  ordine,
}: {
  prodotti: RigaProdotto[];
  mostraCollezione?: boolean;
  ordine?: OrdineTabella;
}) {
  if (prodotti.length === 0) {
    return <div className="vuoto">Nessun prodotto.</div>;
  }
  /** Un'intestazione ordinabile: la freccia dice il verso, e ricliccando si gira. */
  const Th = ({ chiave, children, className }: { chiave: string; children: React.ReactNode; className?: string }) => {
    if (!ordine) return <th className={className}>{children}</th>;
    const attiva = ordine.ordina === chiave;
    return (
      <th className={className} aria-sort={attiva ? (ordine.verso === "asc" ? "ascending" : "descending") : "none"}>
        <a href={ordine.link(chiave)} className={attiva ? "ordinata" : undefined} title={attiva ? "Cambia il verso" : "Ordina per questa colonna"}>
          {children}
          {attiva ? (ordine.verso === "asc" ? " ↑" : " ↓") : ""}
        </a>
      </th>
    );
  };
  return (
    <div className="tabella-wrap">
      <table>
        <thead>
          <tr>
            <Th chiave="nome">Prodotto</Th>
            {mostraCollezione && <Th chiave="collezione">Collezione</Th>}
            <Th chiave="categoria">Categoria</Th>
            <Th chiave="fase">Fase</Th>
            <Th chiave="prezzo" className="num">Prezzo</Th>
            <th title="Calcolato riga per riga da prezzo e costo: non è una colonna del database, quindi non si può ordinare senza scaricare tutto il catalogo">Margine</th>
            <Th chiave="shopify">Shopify</Th>
            <Th chiave="creato">Creato</Th>
          </tr>
        </thead>
        <tbody>
          {prodotti.map((p) => {
            const m = calcolaMargine(p.costoProduzione, p.prezzoVendita);
            return (
              <tr key={p.id} className="riga-cliccabile">
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Miniatura url={p.immagine ?? null} />
                    <span>
                      <Link href={`/prodotti/${p.id}`} className="cella-nome link-riga">{p.nome}</Link>
                      <div className="cella-sub">{p.codice}</div>
                    </span>
                  </div>
                </td>
                {mostraCollezione && <td className="cella-muta">{p.collezione?.nome ?? "—"}</td>}
                <td className="cella-muta">{etichettaCategoria(p.categoria)}</td>
                <td><Badge testo={ETICHETTA_FASE[p.fase] ?? p.fase} colore={COLORE_FASE[p.fase] ?? "var(--text-tertiary)"} /></td>
                <td className="num">{euro(p.prezzoVendita)}</td>
                {/* Costo mancante ≠ costo zero: con costo 0 calcolaMargine dice
                    100%, che qui diventava una barra piena e verde su 1.024
                    prodotti senza costo. Regola della casa: il dato che manca
                    si esclude, non si inventa — come in /vendite e /anagrafica. */}
                <td>
                  {p.costoProduzione > 0 ? (
                    <BarraMargine marginePct={m.marginePct} target={p.collezione?.margineTarget} />
                  ) : (
                    <span className="cella-muta" title="Costo di produzione non inserito">n.d.</span>
                  )}
                </td>
                <td><Badge testo={ETICHETTA_SHOPIFY[p.shopifyStato] ?? p.shopifyStato} colore={COLORE_SHOPIFY[p.shopifyStato] ?? "var(--text-tertiary)"} /></td>
                <td className="cella-muta">{p.creatoIl ? dataIt(new Date(p.creatoIl)) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
