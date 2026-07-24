import Link from "next/link";
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
  collezione: { nome: string; margineTarget: number | null } | null;
};

export function TabellaProdotti({ prodotti, mostraCollezione = true }: { prodotti: RigaProdotto[]; mostraCollezione?: boolean }) {
  if (prodotti.length === 0) {
    return <div className="vuoto">Nessun prodotto.</div>;
  }
  return (
    <div className="tabella-wrap">
      <table>
        <thead>
          <tr>
            <th>Prodotto</th>
            {mostraCollezione && <th>Collezione</th>}
            <th>Categoria</th>
            <th>Fase</th>
            <th className="num">Prezzo</th>
            <th>Margine</th>
            <th>Shopify</th>
          </tr>
        </thead>
        <tbody>
          {prodotti.map((p) => {
            const m = calcolaMargine(p.costoProduzione, p.prezzoVendita);
            return (
              <tr key={p.id}>
                <td>
                  <Link href={`/prodotti/${p.id}`} className="cella-nome">{p.nome}</Link>
                  <div className="cella-sub">{p.codice}</div>
                </td>
                {mostraCollezione && <td className="cella-muta">{p.collezione?.nome ?? "—"}</td>}
                <td className="cella-muta">{etichettaCategoria(p.categoria)}</td>
                <td><Badge testo={ETICHETTA_FASE[p.fase] ?? p.fase} colore={COLORE_FASE[p.fase] ?? "var(--text-tertiary)"} /></td>
                <td className="num">{euro(p.prezzoVendita)}</td>
                <td><BarraMargine marginePct={m.marginePct} target={p.collezione?.margineTarget} /></td>
                <td><Badge testo={ETICHETTA_SHOPIFY[p.shopifyStato] ?? p.shopifyStato} colore={COLORE_SHOPIFY[p.shopifyStato] ?? "var(--text-tertiary)"} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
