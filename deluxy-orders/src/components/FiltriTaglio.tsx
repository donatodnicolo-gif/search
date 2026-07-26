import Link from "next/link";
import type { Brand } from "@/lib/brand";
import { CATEGORIE, nomeCategoria } from "@/lib/categorie";

// I due tagli che si possono dare a qualunque lista: **per brand** e **per
// categoria di prodotto**. Sono qui insieme perché si usano insieme e devono
// comportarsi uguale in tutte e tre le pagine che li mostrano (catalogo,
// dettaglio di una lista, elenco clienti).
//
// La differenza fra i due va detta all'operatore, non lasciata intuire: il
// brand taglia gli ordini (e quindi i numeri), la categoria sceglie le persone
// (e i numeri restano interi). È scritto sotto le pillole.
export function FiltriTaglio({
  brand,
  brandScelto,
  categoriaScelta,
  href,
}: {
  brand: Brand[];
  brandScelto?: string;
  categoriaScelta?: string;
  href: (chiave: "brand" | "categoria", valore: string) => string;
}) {
  return (
    <>
      <div className="filtri">
        <span className="etichetta-ordina">Brand</span>
        <Link className={`stato-pill${!brandScelto ? " attuale" : ""}`} href={href("brand", "")}>
          <span className="stato-label">Tutti</span>
        </Link>
        {brand.map((b) => (
          <Link
            key={b.id}
            className={`stato-pill${brandScelto === b.nome ? " attuale" : ""}`}
            href={href("brand", b.nome)}
          >
            <span className="dot" style={{ background: b.colore }} />
            <span className="stato-label">{b.nome}</span>
          </Link>
        ))}
      </div>

      <div className="filtri">
        <span className="etichetta-ordina">Categoria</span>
        <Link className={`stato-pill${!categoriaScelta ? " attuale" : ""}`} href={href("categoria", "")}>
          <span className="stato-label">Tutte</span>
        </Link>
        {CATEGORIE.filter((c) => !c.servizio).map((c) => (
          <Link
            key={c.chiave}
            className={`stato-pill${categoriaScelta === c.chiave ? " attuale" : ""}`}
            href={href("categoria", c.chiave)}
          >
            <span className="dot" style={{ background: c.colore }} />
            <span className="stato-label">{c.nome}</span>
          </Link>
        ))}
        <Link
          className={`stato-pill${categoriaScelta === "non-classificato" ? " attuale" : ""}`}
          href={href("categoria", "non-classificato")}
        >
          <span className="stato-label">{nomeCategoria("non-classificato")}</span>
        </Link>
      </div>

      {(brandScelto || categoriaScelta) && (
        <p className="esito-ricerca">
          {brandScelto && (
            <>
              Numeri del solo <strong>{brandScelto}</strong>: spesa, segmento e attività sono
              calcolati sugli ordini di quel negozio — lo stesso cliente può essere VIP altrove.{" "}
            </>
          )}
          {categoriaScelta && (
            <>
              Solo chi ha comprato <strong>{nomeCategoria(categoriaScelta).toLowerCase()}</strong>;
              i suoi numeri restano quelli interi, comprese le altre categorie.
            </>
          )}
        </p>
      )}
    </>
  );
}
