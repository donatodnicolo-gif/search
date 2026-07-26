import Link from "next/link";
import type { Cliente, VersoOrdinamento } from "@/lib/clienti";
import { COLONNE_CLIENTI, codificaChiave } from "@/lib/clienti";
import { coloreBrand } from "@/lib/brand";
import { euro, dataBreve } from "@/lib/ordini";
import {
  coloreAttivita,
  coloreSegmento,
  coloreTipologia,
  consensoLeggibile,
  nomeAttivita,
  nomeSegmento,
  nomeTipologia,
} from "@/lib/segmenti";

// La tabella dei clienti, con i tag della classificazione e lo stato della
// privacy. La usano sia «Clienti» sia il dettaglio di una lista: le colonne
// devono dire le stesse cose nei due posti, altrimenti si finisce a confrontare
// numeri diversi.
//
// **Ogni colonna è ordinabile**, nei due versi: l'intestazione è un link che
// cambia `ordina` e `verso` nella query string. Cliccare la colonna già attiva
// inverte il verso — è il gesto che tutti si aspettano da una tabella.

export function PillSegmento({ segmento }: { segmento: string }) {
  return (
    <span className="tag" style={{ color: coloreSegmento(segmento) }} title={`Segmento di valore: ${nomeSegmento(segmento)}`}>
      <span className="dot" />
      <span className="tag-label">{nomeSegmento(segmento)}</span>
    </span>
  );
}

export function PillAttivita({ attivita, giorni }: { attivita: string; giorni: number }) {
  return (
    <span
      className="tag"
      style={{ color: coloreAttivita(attivita) }}
      title={`Ultimo ordine ${giorniFa(giorni)}`}
    >
      <span className="dot" />
      <span className="tag-label">{nomeAttivita(attivita)}</span>
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

// Lo stato della privacy in una pillola sola: cosa si può fare con questa
// persona. Il titolo spiega da dove viene la risposta, perché «non si può
// scrivere» senza motivo è la cosa che fa perdere più tempo.
export function PillPrivacy({ cliente }: { cliente: Cliente }) {
  const perche = [
    cliente.bloccato ? "bloccato a mano" : null,
    cliente.privacyEmail ? `email: «${cliente.privacyEmail}» a mano` : `email su Shopify: ${consensoLeggibile(cliente.consensoEmail)}`,
    cliente.privacySms ? `WhatsApp/SMS: «${cliente.privacySms}» a mano` : `SMS su Shopify: ${consensoLeggibile(cliente.consensoSms)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  if (cliente.bloccato) {
    return (
      <span className="tag" style={{ color: "var(--red)" }} title={perche}>
        <span className="dot" />
        <span className="tag-label">Non contattare</span>
      </span>
    );
  }
  const canali = [
    cliente.contattabileEmail ? "email" : null,
    cliente.contattabileSms ? "WhatsApp" : null,
  ].filter(Boolean);

  if (canali.length === 0) {
    return (
      <span className="tag tag-vuoto" title={perche}>
        <span className="tag-label">Nessun consenso</span>
      </span>
    );
  }
  return (
    <span className="tag" style={{ color: "var(--green)" }} title={perche}>
      <span className="dot" />
      <span className="tag-label">{canali.join(" + ")}</span>
    </span>
  );
}

// L'intestazione cliccabile di una colonna.
function Intestazione({
  chiave,
  nome,
  ordina,
  verso,
  href,
  numerica,
}: {
  chiave: string;
  nome: string;
  ordina: string;
  verso: VersoOrdinamento;
  href: (colonna: string) => string;
  numerica?: boolean;
}) {
  const attiva = ordina === chiave;
  return (
    <th className={numerica ? "num" : undefined}>
      <Link href={href(chiave)} className={`th-ordina${attiva ? " attiva" : ""}`}>
        {nome}
        <span className="th-freccia" aria-hidden="true">
          {attiva ? (verso === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </Link>
    </th>
  );
}

export function TabellaClienti({
  clienti,
  colori,
  ordina,
  verso,
  href,
}: {
  clienti: Cliente[];
  colori: Map<string, string>;
  ordina: string;
  verso: VersoOrdinamento;
  // Costruisce il link per ordinare per una colonna (inverte il verso se è già quella).
  href: (colonna: string) => string;
}) {
  const numeriche = new Set(["ordini", "speso", "medio"]);
  return (
    <div className="tabella-wrap">
      <table>
        <thead>
          <tr>
            {COLONNE_CLIENTI.map((c) => (
              <Intestazione
                key={c.chiave}
                chiave={c.chiave}
                nome={c.nome}
                ordina={ordina}
                verso={verso}
                href={href}
                numerica={numeriche.has(c.chiave)}
              />
            ))}
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
              <td><PillTipologia cliente={c} /></td>
              <td><PillSegmento segmento={c.segmento} /></td>
              <td><PillAttivita attivita={c.attivita} giorni={c.giorni} /></td>
              <td><PillPrivacy cliente={c} /></td>
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
