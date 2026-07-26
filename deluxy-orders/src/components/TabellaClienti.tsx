import Link from "next/link";
import type { Cliente } from "@/lib/clienti";
import { codificaChiave } from "@/lib/clienti";
import { coloreBrand } from "@/lib/brand";
import { euro, dataBreve } from "@/lib/ordini";
import { coloreSegmento, coloreTipologia, nomeSegmento, nomeTipologia } from "@/lib/segmenti";

// La tabella dei clienti, con i tag della classificazione. La usano sia
// «Clienti» sia il dettaglio di una lista: le colonne devono dire le stesse
// cose nei due posti, altrimenti si finisce a confrontare numeri diversi.

export function PillSegmento({ segmento }: { segmento: string }) {
  return (
    <span className="tag" style={{ color: coloreSegmento(segmento) }} title={`Segmento di valore: ${nomeSegmento(segmento)}`}>
      <span className="dot" />
      <span className="tag-label">{nomeSegmento(segmento)}</span>
    </span>
  );
}

export function PillTipologia({ cliente }: { cliente: Pick<Cliente, "tipologia" | "tipoManuale"> }) {
  const manuale = cliente.tipoManuale != null;
  return (
    <span
      className="tag"
      style={{ color: coloreTipologia(cliente.tipologia) }}
      title={manuale ? "Tipologia impostata a mano" : "Tipologia dedotta dal nome dell'acquirente"}
    >
      <span className="dot" />
      <span className="tag-label">{nomeTipologia(cliente.tipologia)}</span>
      {manuale && <span className="tag-manuale" aria-label="impostata a mano">✓</span>}
    </span>
  );
}

export function TabellaClienti({
  clienti,
  colori,
}: {
  clienti: Cliente[];
  colori: Map<string, string>;
}) {
  return (
    <div className="tabella-wrap">
      <table>
        <thead>
          <tr>
            <th>Cliente</th>
            <th>Tag</th>
            <th>Contatti</th>
            <th>Brand</th>
            <th className="num">Ordini</th>
            <th className="num">Speso</th>
            <th className="num">Medio</th>
            <th>Ultimo</th>
          </tr>
        </thead>
        <tbody>
          {clienti.map((c) => (
            <tr key={c.chiave}>
              <td>
                <Link href={`/clienti/${codificaChiave(c.chiave)}`} className="cella-nome">
                  {c.nome ?? c.email ?? c.telefono ?? "—"}
                </Link>
                {c.citta && <div className="cella-sub">{c.citta}</div>}
              </td>
              <td>
                <span className="etichette">
                  <PillTipologia cliente={c} />
                  <PillSegmento segmento={c.segmento} />
                </span>
              </td>
              <td className="cella-muta">
                {c.email && <div>{c.email}</div>}
                {c.telefono && <div className="cella-sub">{c.telefono}</div>}
                {!c.email && !c.telefono && "—"}
              </td>
              <td>
                <span className="etichette">
                  {c.brand.map((b) => (
                    <span key={b} className="tag" style={{ color: coloreBrand(colori, b) }}>
                      <span className="dot" />
                      <span className="tag-label">{b}</span>
                    </span>
                  ))}
                </span>
              </td>
              <td className="cella-num">
                {c.ordini.toLocaleString("it-IT")}
                {c.annullati > 0 && (
                  <div className="cella-sub" title="ordini annullati, esclusi dai totali">
                    +{c.annullati} annull.
                  </div>
                )}
              </td>
              <td className="cella-num">{euro(c.speso)}</td>
              <td className="cella-num cella-muta">{euro(c.medio)}</td>
              <td className="cella-muta">
                {dataBreve(c.ultimoOrdine)}
                <div className="cella-sub">{giorniFa(c.giorni)}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function giorniFa(giorni: number): string {
  if (giorni <= 0) return "oggi";
  if (giorni === 1) return "ieri";
  if (giorni < 60) return `${giorni} giorni fa`;
  const mesi = Math.round(giorni / 30);
  if (mesi < 24) return `${mesi} mesi fa`;
  return `${Math.floor(giorni / 365)} anni fa`;
}
