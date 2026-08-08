"use client";

import { useEffect, useRef, useState } from "react";
import { corrisponde, type Campo, type Condizione } from "@/lib/regole-ordine";

/** Il minimo che serve per dire se un prodotto corrisponde: niente di più, perché viaggia al browser. */
export type ProdottoAnteprima = {
  id: string;
  nome: string;
  immagine: string | null;
  prezzoVendita: number;
  categoria: string | null;
  tipoShopify: string | null;
  vendorShopify: string | null;
  lineaId: string | null;
  tagShopify: string | null;
  ggDispMin: number | null;
  zoneConsegna?: string | null;
  cittaShopify?: string | null;
  occasioniShopify?: string | null;
  tipologiaShopify?: string | null;
  classificazioneShopify?: string | null;
  dataShopify?: string | null;
  orarioShopify?: string | null;
  bestSellerShopify?: boolean | null;
  /** Servono a ordinare l'anteprima con le metriche calcolabili qui. */
  costoProduzione?: number | null;
  pubblicatoIlShopify?: Date | string | null;
  creatoIlShopify?: Date | string | null;
};

const CAMPI_A_VALORI: Campo[] = ["tipo", "categoria", "fornitore", "linea", "tag", "risposta"];
const MAX_FOTO = 12;

/**
 * **L'anteprima della cella che si sta costruendo**, aggiornata mentre si
 * spunta.
 *
 * Senza, si compila alla cieca e si scopre dopo cosa si è preso: con «Fiori» che
 * sono 379 e «urgenze» che ne sono altre centinaia, la differenza fra una cella
 * utile e una che prende mezzo catalogo non si indovina. Qui il numero cambia a
 * ogni spunta.
 *
 * Il conto si fa **nel browser** e non sul server: un giro di rete a ogni casella
 * spuntata sarebbe lento e ricaricherebbe la pagina. La stessa `corrisponde()`
 * del server — è una funzione pura, quindi gira uguale di qua e di là: con due
 * implementazioni l'anteprima direbbe una cosa e la regola ne farebbe un'altra.
 *
 * Si parte da `closest("form")`, non da `document.querySelector`: il primo form
 * della pagina è il selettore d'ambito in alto. Trappola già pagata.
 */
export function AnteprimaCella({
  prodotti,
  suCosa,
  campione,
}: {
  prodotti: ProdottoAnteprima[];
  /** Su cosa si sta guardando: «i 63 prodotti di questa collezione», «il catalogo». */
  suCosa: string;
  /** Vero quando l'insieme è tagliato: allora il numero è una stima e va detto. */
  campione?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [condizioni, setCondizioni] = useState<Condizione[]>([]);

  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const leggi = () => {
      const c: Condizione[] = [];
      for (const campo of CAMPI_A_VALORI) {
        const valori = [...form.querySelectorAll<HTMLInputElement>(`input[name="valori:${campo}"]:checked`)].map(
          (x) => x.value,
        );
        if (valori.length) c.push({ campo, valori });
      }
      const da = Number.parseFloat((form.querySelector('[name="prezzoDa"]') as HTMLInputElement | null)?.value ?? "");
      const a = Number.parseFloat((form.querySelector('[name="prezzoA"]') as HTMLInputElement | null)?.value ?? "");
      if (Number.isFinite(da) || Number.isFinite(a)) {
        c.push({ campo: "prezzo", da: Number.isFinite(da) ? da : undefined, a: Number.isFinite(a) ? a : undefined });
      }
      setCondizioni(c);
    };
    leggi();
    form.addEventListener("change", leggi);
    form.addEventListener("input", leggi);
    return () => {
      form.removeEventListener("change", leggi);
      form.removeEventListener("input", leggi);
    };
  }, []);

  // **Tutte le condizioni insieme**: è quello che farà la cella una volta
  // aggiunta. Con zero condizioni non si mostra un totale — una cella vuota non
  // è «tutti i prodotti», è una cella da finire.
  const presi =
    condizioni.length === 0
      ? []
      : prodotti.filter((p) => condizioni.every((c) => corrisponde(p, { t: "attr", ...c })));

  return (
    <div ref={ref} className="anteprima-cella">
      {condizioni.length === 0 ? (
        <span className="page-sub" style={{ margin: 0 }}>
          Spunta qualcosa qui sotto: qui compare <b>chi prenderebbe la cella</b>, mentre la costruisci.
        </span>
      ) : (
        <>
          <div className="anteprima-conto">
            <b>{presi.length}</b> {presi.length === 1 ? "prodotto" : "prodotti"}
            <span className="page-sub" style={{ margin: 0 }}>
              {" "}
              su {prodotti.length} {suCosa}
              {campione ? " (campione)" : ""} · {condizioni.length}{" "}
              {condizioni.length === 1 ? "condizione" : "condizioni"} insieme
            </span>
          </div>
          {presi.length === 0 ? (
            <span className="page-sub" style={{ margin: 0 }}>
              <b>Nessuno.</b> Le condizioni di una cella valgono <b>tutte insieme</b>: se ne stai chiedendo troppe, la
              cella non porterà in cima nessuno.
            </span>
          ) : (
            <div className="anteprima-foto">
              {presi.slice(0, MAX_FOTO).map((p) => (
                <span key={p.id} title={p.nome}>
                  {p.immagine ? <img src={p.immagine} alt="" /> : "❀"}
                </span>
              ))}
              {presi.length > MAX_FOTO && <span className="page-sub">+{presi.length - MAX_FOTO}</span>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
