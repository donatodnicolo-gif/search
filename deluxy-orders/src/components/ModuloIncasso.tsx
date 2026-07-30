"use client";

import { useState, useTransition } from "react";

// «Fatti pagare»: si scrive cosa e quanto, ne esce un link.
//
// Le righe sono libere apposta — «100 rose» non è un prodotto a catalogo, è una
// cosa concordata al telefono. Il totale che conta lo calcola Shopify (tasse e
// arrotondamenti secondo le impostazioni del negozio): qui accanto si mostra la
// somma delle righe, e se i due numeri non coincidono vince Shopify, perché è
// quello che il cliente vedrà davvero.

type Riga = { descrizione: string; quantita: string; prezzo: string };

type Esito =
  | { ok: true; id: string; nome: string; url: string; totale: number; valuta: string }
  | { ok: false; motivo: string };

const RIGA_VUOTA: Riga = { descrizione: "", quantita: "1", prezzo: "" };

const euro = (n: number, valuta = "EUR") =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: valuta }).format(n);

function numero(testo: string): number {
  return Number((testo ?? "").replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, ""));
}

export function ModuloIncasso({
  negozi,
  crea,
}: {
  negozi: { nome: string; pronto: boolean | null }[];
  crea: (dati: {
    brand: string;
    righe: { descrizione: string; quantita: number; prezzo: number }[];
    clienteNome?: string | null;
    clienteEmail?: string | null;
    clienteTelefono?: string | null;
    note?: string | null;
  }) => Promise<Esito>;
}) {
  const [brand, setBrand] = useState(negozi.find((n) => n.pronto)?.nome ?? negozi[0]?.nome ?? "");
  const [righe, setRighe] = useState<Riga[]>([{ ...RIGA_VUOTA }]);
  const [cliente, setCliente] = useState({ nome: "", email: "", telefono: "" });
  const [note, setNote] = useState("");
  const [esito, setEsito] = useState<Esito | null>(null);
  const [copiato, setCopiato] = useState(false);
  const [attesa, avvia] = useTransition();

  const somma = righe.reduce((s, r) => s + (numero(r.quantita) || 0) * (numero(r.prezzo) || 0), 0);

  function cambia(i: number, campo: keyof Riga, valore: string) {
    setRighe((precedenti) => precedenti.map((r, j) => (i === j ? { ...r, [campo]: valore } : r)));
  }

  function invia() {
    setCopiato(false);
    avvia(async () => {
      const risultato = await crea({
        brand,
        righe: righe.map((r) => ({
          descrizione: r.descrizione,
          quantita: Math.round(numero(r.quantita) || 0),
          prezzo: numero(r.prezzo) || 0,
        })),
        clienteNome: cliente.nome || null,
        clienteEmail: cliente.email || null,
        clienteTelefono: cliente.telefono || null,
        note: note || null,
      });
      setEsito(risultato);
      if (risultato.ok) {
        setRighe([{ ...RIGA_VUOTA }]);
        setCliente({ nome: "", email: "", telefono: "" });
        setNote("");
      }
    });
  }

  async function copia(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopiato(true);
    } catch {
      setCopiato(false);
    }
  }

  const negozioScelto = negozi.find((n) => n.nome === brand);

  return (
    <div className="scheda">
      <div className="scheda-titolo">Che cosa devi far pagare</div>

      <div className="riga-incasso testa">
        <span>Descrizione</span>
        <span>Quantità</span>
        <span>Prezzo unitario</span>
        <span />
      </div>
      {righe.map((r, i) => (
        <div className="riga-incasso" key={i}>
          <input
            value={r.descrizione}
            placeholder="es. Rose rosse stelo lungo"
            onChange={(e) => cambia(i, "descrizione", e.target.value)}
          />
          <input value={r.quantita} inputMode="numeric" onChange={(e) => cambia(i, "quantita", e.target.value)} />
          <input value={r.prezzo} inputMode="decimal" placeholder="4,50" onChange={(e) => cambia(i, "prezzo", e.target.value)} />
          <button
            className="btn btn-secondario small"
            type="button"
            onClick={() => setRighe((p) => (p.length === 1 ? [{ ...RIGA_VUOTA }] : p.filter((_, j) => j !== i)))}
            title="Togli questa riga"
          >
            ✕
          </button>
        </div>
      ))}

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
        <button className="btn btn-secondario small" type="button" onClick={() => setRighe((p) => [...p, { ...RIGA_VUOTA }])}>
          + Aggiungi una riga
        </button>
        <span className="testo-guida">
          Somma delle righe: <strong>{euro(somma)}</strong> — il totale vero lo calcola Shopify (tasse e spedizione
          secondo le impostazioni del negozio).
        </span>
      </div>

      <div className="modulo" style={{ marginTop: 14 }}>
        <div className="campo-modulo">
          <label htmlFor="brand">Da quale negozio</label>
          <select id="brand" value={brand} onChange={(e) => setBrand(e.target.value)}>
            {negozi.map((n) => (
              <option key={n.nome} value={n.nome}>
                {n.nome}
                {n.pronto === false ? " — permesso mancante" : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="campo-modulo">
          <label htmlFor="cli-nome">Cliente (facoltativo)</label>
          <input id="cli-nome" value={cliente.nome} onChange={(e) => setCliente({ ...cliente, nome: e.target.value })} />
        </div>
        <div className="campo-modulo">
          <label htmlFor="cli-email">Email</label>
          <input
            id="cli-email"
            type="email"
            value={cliente.email}
            onChange={(e) => setCliente({ ...cliente, email: e.target.value })}
          />
        </div>
        <div className="campo-modulo">
          <label htmlFor="cli-tel">Telefono</label>
          <input id="cli-tel" value={cliente.telefono} onChange={(e) => setCliente({ ...cliente, telefono: e.target.value })} />
        </div>
        <div className="campo-modulo largo">
          <label htmlFor="note">Note interne (restano sull&apos;ordine, non sul link)</label>
          <input id="note" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>

      <div className="azioni-modulo" style={{ marginTop: 10 }}>
        <button className="btn" type="button" onClick={invia} disabled={attesa || !brand}>
          {attesa ? "Preparo il link…" : "Crea il link di pagamento"}
        </button>
        {negozioScelto?.pronto === false && (
          <span className="testo-guida" style={{ marginLeft: 10 }}>
            Su questo negozio manca il permesso <code className="inline">write_draft_orders</code>: il link non si può
            ancora creare.
          </span>
        )}
      </div>

      {esito?.ok === false && (
        <p className="testo-guida" style={{ marginTop: 10, color: "var(--red)" }}>{esito.motivo}</p>
      )}

      {esito?.ok && (
        <div className="avviso-nuovi" style={{ marginTop: 14 }}>
          <span className="cresce">
            <strong>{esito.nome}</strong> — {euro(esito.totale, esito.valuta)} da incassare. Manda questo link: quando
            il cliente paga, diventa un ordine e lo trovi nel registro.
          </span>
          <input className="link-campo" readOnly value={esito.url} onFocus={(e) => e.currentTarget.select()} />
          <button className="btn small" type="button" onClick={() => copia(esito.url)}>
            {copiato ? "Copiato ✓" : "Copia"}
          </button>
          <a className="btn btn-secondario small" href={esito.url} target="_blank" rel="noopener noreferrer">
            Apri
          </a>
        </div>
      )}
    </div>
  );
}
