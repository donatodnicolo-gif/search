"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

// LE CHIAVI API DELLE ALTRE APP, create da qui invece che dalla riga di comando.
//
// Tutta la parte delicata sta in una regola: **la chiave si vede una volta
// sola**. Nel database c'è solo il suo SHA-256, quindi non è una scelta di
// interfaccia — nessuno può più rileggerla, nemmeno chi la crea. Per questo la
// chiave appena nata resta in un riquadro finché non lo si chiude a mano, invece
// di sparire al primo aggiornamento della pagina: chi la perde deve rigenerarla,
// e rigenerare spegne l'app che la stava usando.
//
// Eliminare e rigenerare chiedono conferma sullo stesso bottone: sono azioni che
// interrompono un'altra app all'istante, e un clic per sbaglio non deve poterlo
// fare.

type Chiave = {
  id: string;
  nome: string;
  scrittura: boolean;
  attiva: boolean;
  creata: string;
  ultimoUso: string | null;
};

type Esito =
  | { ok: true; nome: string; chiave: string; rigenerata: boolean }
  | { ok: false; motivo: string };

export function ChiaviApi({
  chiavi,
  crea,
  rigenera,
  elimina,
  sospendi,
}: {
  chiavi: Chiave[];
  crea: (nome: string, scrittura: boolean) => Promise<Esito>;
  rigenera: (id: string) => Promise<Esito>;
  elimina: (id: string) => Promise<{ ok: boolean; motivo?: string }>;
  sospendi: (fd: FormData) => Promise<void>;
}) {
  const [nome, setNome] = useState("");
  const [scrittura, setScrittura] = useState(false);
  const [nata, setNata] = useState<{ nome: string; chiave: string; rigenerata: boolean } | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [copiata, setCopiata] = useState(false);
  const [conferma, setConferma] = useState<string | null>(null); // id in attesa di conferma
  const [attesa, avvia] = useTransition();
  const router = useRouter();

  // L'elenco arriva dal server: quando l'azione parte da un clic (e non da un
  // `form action`), `revalidatePath` da solo non ridisegna la tabella e una
  // chiave appena eliminata resterebbe a schermo — che su una credenziale è il
  // tipo di bugia peggiore: sembra ancora attiva e non lo è più.
  function ridisegna() {
    router.refresh();
  }

  function gestisci(esito: Esito) {
    ridisegna();
    if (esito.ok) {
      setNata({ nome: esito.nome, chiave: esito.chiave, rigenerata: esito.rigenerata });
      setErrore(null);
      setCopiata(false);
      setNome("");
      setScrittura(false);
    } else {
      setErrore(esito.motivo);
      setNata(null);
    }
  }

  async function copia(testo: string) {
    try {
      await navigator.clipboard.writeText(testo);
      setCopiata(true);
    } catch {
      setCopiata(false);
    }
  }

  return (
    <div className="scheda">
      <div className="scheda-titolo">Chiavi API (per le altre app)</div>
      <p className="testo-guida">
        Ogni app che legge gli ordini da qui ha la <strong>sua</strong> chiave: così si vede chi chiama, si sospende una
        sola app quando serve, e si rigenera senza toccare le altre. La chiave si vede{" "}
        <strong>una volta sola</strong>: nel database resta solo la sua impronta.
      </p>

      {/* La chiave appena nata. Resta finché non la si chiude: se sparisse da
          sola, chi non ha fatto in tempo a copiarla dovrebbe rigenerarla. */}
      {nata && (
        <div className="chiave-nata">
          <div>
            <strong>
              {nata.rigenerata ? "Chiave rigenerata" : "Chiave creata"} per «{nata.nome}»
            </strong>
            <div className="testo-guida">
              Copiala adesso e mettila nel <code className="inline">.env</code> di quell&apos;app (di solito{" "}
              <code className="inline">ORDERS_API_KEY</code>). Non sarà più recuperabile.
              {nata.rigenerata && " La chiave di prima ha smesso di funzionare in questo istante."}
            </div>
          </div>
          <input className="link-campo" readOnly value={nata.chiave} onFocus={(e) => e.currentTarget.select()} />
          <button className="btn small" type="button" onClick={() => copia(nata.chiave)}>
            {copiata ? "Copiata ✓" : "Copia"}
          </button>
          <button className="btn btn-secondario small" type="button" onClick={() => setNata(null)}>
            Ho copiato, chiudi
          </button>
        </div>
      )}

      {errore && <p className="testo-guida" style={{ color: "var(--red)" }}>{errore}</p>}

      {chiavi.length > 0 && (
        <div className="tabella-wrap" style={{ margin: "12px 0" }}>
          <table>
            <thead>
              <tr>
                <th>Nome app</th>
                <th>Permesso</th>
                <th>Creata</th>
                <th>Ultimo uso</th>
                <th>Stato</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {chiavi.map((k) => (
                <tr key={k.id}>
                  <td className="cella-nome">{k.nome}</td>
                  <td className="cella-muta">{k.scrittura ? "lettura + scrittura" : "sola lettura"}</td>
                  <td className="cella-muta">{k.creata}</td>
                  <td className="cella-muta">{k.ultimoUso ?? "mai"}</td>
                  <td>
                    <form action={sospendi} style={{ display: "inline" }}>
                      <input type="hidden" name="id" value={k.id} />
                      <button
                        className={`badge${k.attiva ? "" : " neutro"}`}
                        style={{ border: 0, cursor: "pointer", color: k.attiva ? "var(--green)" : "var(--text-tertiary)" }}
                        title={k.attiva ? "Sospendi: l'app smette di leggere, la chiave resta" : "Riattiva"}
                      >
                        <span className="dot" />
                        {k.attiva ? "attiva" : "sospesa"}
                      </button>
                    </form>
                  </td>
                  <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                    <button
                      className="btn btn-secondario small"
                      type="button"
                      disabled={attesa}
                      onClick={() => {
                        if (conferma !== `rig-${k.id}`) {
                          setConferma(`rig-${k.id}`);
                          return;
                        }
                        setConferma(null);
                        avvia(async () => gestisci(await rigenera(k.id)));
                      }}
                      title="Fa una chiave nuova per la stessa app: quella vecchia smette di funzionare subito"
                    >
                      {conferma === `rig-${k.id}` ? "Confermi? Rigenera" : "Rigenera"}
                    </button>{" "}
                    <button
                      className="btn btn-secondario small"
                      type="button"
                      disabled={attesa}
                      onClick={() => {
                        if (conferma !== `del-${k.id}`) {
                          setConferma(`del-${k.id}`);
                          return;
                        }
                        setConferma(null);
                        avvia(async () => {
                          const esito = await elimina(k.id);
                          if (!esito.ok) setErrore(esito.motivo ?? "Non riuscito.");
                          else setErrore(null);
                          ridisegna();
                        });
                      }}
                      title="Toglie la chiave: quell'app smette di leggere all'istante"
                    >
                      {conferma === `del-${k.id}` ? "Confermi? Elimina" : "Elimina"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="modulo" style={{ marginTop: 4 }}>
        <div className="campo-modulo">
          <label htmlFor="nome-chiave">Nome dell&apos;app che userà la chiave</label>
          <input
            id="nome-chiave"
            value={nome}
            placeholder="es. deluxy-marketing"
            onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && nome.trim()) {
                e.preventDefault();
                avvia(async () => gestisci(await crea(nome, scrittura)));
              }
            }}
          />
        </div>
        <div className="campo-modulo">
          <label htmlFor="perm-chiave">Permesso</label>
          <select id="perm-chiave" value={scrittura ? "scrittura" : "lettura"} onChange={(e) => setScrittura(e.target.value === "scrittura")}>
            <option value="lettura">Sola lettura</option>
            <option value="scrittura">Lettura + scrittura (può riclassificare)</option>
          </select>
        </div>
        <div className="azioni-modulo campo-modulo">
          <button
            className="btn"
            type="button"
            disabled={attesa || !nome.trim()}
            onClick={() => avvia(async () => gestisci(await crea(nome, scrittura)))}
          >
            {attesa ? "Creo…" : "Crea la chiave"}
          </button>
        </div>
      </div>

      <p className="testo-guida">
        <strong>Sola lettura</strong> basta a quasi tutti: legge ordini, clienti, liste, ricavi, marketing.{" "}
        <strong>Lettura + scrittura</strong> serve solo a chi deve <em>riclassificare</em> un ordine via{" "}
        <code className="inline">PATCH</code> — oggi nessuno, e una chiave di scrittura in giro è una cosa che qualcuno
        userà. Restano validi anche i comandi:{" "}
        <code className="inline">npm run chiave -- deluxy-search</code>.
      </p>
    </div>
  );
}
