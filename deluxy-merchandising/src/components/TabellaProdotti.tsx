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
  /** Quando il **negozio** dice che il prodotto è nato: vedi `dataNascita`. */
  creatoIlShopify?: Date | string | null;
  aggiornatoIl?: Date | string | null;
  /** Dove sta, negozio per negozio, con lo stato che ha là. */
  pubblicazioni?: { negozio: string; statoShopify: string | null; handle: string | null; origine: string }[];
  collezione: { nome: string; margineTarget: number | null } | null;
};

/**
 * **La data di nascita vera del prodotto.**
 *
 * ⚠️ Chiesto dall'utente l'08/09/2026 («le date di creazione fanno fede solo
 * per quell'app: per quelli importati trova le date vere di Shopify»), e i
 * numeri gli danno ragione: `creatoIl` è **quando la scheda è nata qui**, cioè
 * quasi sempre il giorno dell'import. Misurato: prodotti che l'app dà come
 * creati il 07/09/2026 sul negozio esistono dal 2024 — fino a **844 giorni di
 * scarto** — e il più vecchio risale al **05/05/2020**. Ordinare o leggere per
 * `creatoIl` vuol dire guardare la storia dell'app, non quella del prodotto.
 *
 * `creatoIlShopify` arriva dall'import (`createdAt` del negozio) ed è presente
 * sul **100% dei prodotti attivi**; per i 1.402 nati solo qui non esiste, e lì
 * l'unica data possibile resta quella dell'app — dichiarata come tale, non
 * spacciata per la data del negozio.
 */
export function dataNascita(p: RigaProdotto): { data: Date | null; dalNegozio: boolean } {
  if (p.creatoIlShopify) return { data: new Date(p.creatoIlShopify), dalNegozio: true };
  if (p.creatoIl) return { data: new Date(p.creatoIl), dalNegozio: false };
  return { data: null, dalNegozio: false };
}

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
            <Th chiave="shopify">Dove sta</Th>
            <Th chiave="creato">Creato</Th>
            <Th chiave="modificato">Modificato</Th>
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
                {/* **Dove sta, negozio per negozio** (chiesto l'08/09/2026).
                    `Prodotto.statoShopify` lo scrive l'ultimo import della
                    notte, quindi per un prodotto su più siti diceva lo stato di
                    uno solo: la riga per negozio è la risposta a quella trappola.
                    Senza le pubblicazioni (altre pagine che usano la tabella)
                    resta il badge unico di prima. */}
                <td>
                  {p.pubblicazioni?.length ? (
                    <div className="siti-prodotto">
                      {p.pubblicazioni.map((s) => (
                        <span
                          key={s.negozio}
                          className="sito-pill"
                          title={`${s.negozio}: ${ETICHETTA_SHOPIFY[s.statoShopify ?? ""] ?? s.statoShopify ?? "sconosciuto"}${s.origine === "tolto" ? " (tolto dalla scelta)" : ""}`}
                        >
                          <i className="dot" style={{ background: COLORE_SHOPIFY[s.statoShopify ?? ""] ?? "var(--text-tertiary)" }} />
                          {s.negozio}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <Badge testo={ETICHETTA_SHOPIFY[p.shopifyStato] ?? p.shopifyStato} colore={COLORE_SHOPIFY[p.shopifyStato] ?? "var(--text-tertiary)"} />
                  )}
                </td>
                <td className="cella-muta">
                  {(() => {
                    const n = dataNascita(p);
                    if (!n.data) return "—";
                    return (
                      <span title={n.dalNegozio ? "Data di creazione sul negozio Shopify" : "Il negozio non dà una data: questa è la data della scheda in quest'app, di norma il giorno dell'import"}>
                        {dataIt(n.data)}
                        {n.dalNegozio ? "" : <i className="data-app"> qui</i>}
                      </span>
                    );
                  })()}
                </td>
                <td className="cella-muta">{p.aggiornatoIl ? dataIt(new Date(p.aggiornatoIl)) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
