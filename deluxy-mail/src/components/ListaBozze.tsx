"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { eliminaBozzeMassa } from "@/lib/actions";
import { EliminaBozza } from "./EliminaBozza";

export type RigaBozzaDati = {
  id: string;
  origine: string;
  modo: string;
  oggetto: string;
  anteprima: string;
  destinatario: string;
  /** Dove si riapre la bozza (calcolato sul server: dipende da origine e modo). */
  dove: string;
  /** Già formattata: la riga disegna, non calcola. */
  data: string;
  modificata: boolean;
  allegati: number;
};

/**
 * L'elenco delle bozze, con la SELEZIONE MULTIPLA.
 *
 * ⚠️ Una spunta sola per tutte e due le sezioni («Iniziate da te» e «Proposte
 * dall'AI»): sono due titoli, non due elenchi diversi, e chi fa pulizia le
 * vuole prendere insieme. Prima si poteva buttare via una bozza per volta, con
 * due clic ciascuna: con quaranta proposte dell'AI da smaltire erano ottanta
 * clic (segnalato il 27/08/2026).
 */
export function ListaBozze({ righe }: { righe: RigaBozzaDati[] }) {
  const [selezione, setSelezione] = useState<Set<string>>(new Set());
  const [conferma, setConferma] = useState<number | null>(null);
  const [esito, setEsito] = useState<string | null>(null);
  const [inCorso, start] = useTransition();
  const router = useRouter();
  const spuntaTutte = useRef<HTMLInputElement>(null);

  const mie = righe.filter((r) => r.origine === "utente");
  const daAI = righe.filter((r) => r.origine === "ai");

  const toggle = (id: string, valore: boolean) =>
    setSelezione((s) => {
      const n = new Set(s);
      if (valore) n.add(id);
      else n.delete(id);
      return n;
    });

  const tutte = righe.length > 0 && righe.every((r) => selezione.has(r.id));
  const alcune = selezione.size > 0 && !tutte;
  useEffect(() => {
    if (spuntaTutte.current) spuntaTutte.current.indeterminate = alcune;
  }, [alcune]);

  const selezionaTutte = () =>
    setSelezione((s) =>
      righe.every((r) => s.has(r.id))
        ? new Set()
        : new Set(righe.map((r) => r.id)),
    );

  const soloAI = () => setSelezione(new Set(daAI.map((r) => r.id)));

  /**
   * ⚠️⚠️ Qui si chiede SEMPRE, non sopra una soglia come nella posta in arrivo.
   * Là «Cestina» sposta nel cestino, e dal cestino si torna indietro; una bozza
   * cancellata invece non va da nessuna parte — sparisce, con i suoi allegati.
   * Un'azione senza ritorno merita una domanda anche per due righe.
   */
  const elimina = () => {
    if (selezione.size === 0) return;
    if (conferma === null) {
      setConferma(selezione.size);
      return;
    }
    const ids = righe.filter((r) => selezione.has(r.id)).map((r) => r.id);
    setConferma(null);
    setEsito(null);
    start(async () => {
      const r = await eliminaBozzeMassa(ids);
      setSelezione(new Set());
      setEsito(r.messaggio);
      router.refresh();
    });
  };

  const riga = (b: RigaBozzaDati) => (
    <div
      className={selezione.has(b.id) ? "mail-row selezionato" : "mail-row"}
      key={b.id}
    >
      <div className="mail-row-head">
        <label
          className="mail-check"
          title="Seleziona"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={selezione.has(b.id)}
            onChange={(e) => toggle(b.id, e.target.checked)}
            aria-label={`Seleziona la bozza «${b.oggetto || "senza oggetto"}»`}
          />
        </label>

        <Link href={b.dove} className="mail-row-link">
          <div className="mail-top">
            {/* Il distanziatore al posto del pallino non letto: senza, le bozze si
                allineerebbero diversamente da tutte le altre liste. */}
            <span className="dot-spacer" />
            <span className="mail-mittente">a {b.destinatario}</span>
          </div>
          <div className="mail-oggetto" style={{ paddingLeft: 17 }}>
            {b.oggetto || "(senza oggetto)"}
          </div>
          <div className="mail-riassunto" style={{ paddingLeft: 17 }}>
            <span className="muted">{b.anteprima || "(vuota)"}</span>
          </div>
          <div className="mail-tags" style={{ paddingLeft: 17 }}>
            {b.allegati > 0 && (
              <span
                className="badge neutral"
                title="Allegati conservati con la bozza"
              >
                📎 {b.allegati}
              </span>
            )}
            {b.modo === "nuova" && (
              <span className="badge neutral">nuova mail</span>
            )}
            {b.modo === "inoltra" && (
              <span className="badge neutral">inoltro</span>
            )}
            {b.modo === "tutti" && (
              <span className="badge neutral">a tutti</span>
            )}
            {b.origine === "ai" && b.modificata && (
              <span className="badge neutral">modificata da te</span>
            )}
          </div>
        </Link>

        <div className="mail-row-side">
          <span className="mail-data">{b.data}</span>
        </div>
      </div>

      <div className="riga-azioni" style={{ paddingLeft: 17 }}>
        <Link href={b.dove} className="azione-riga">
          Riprendi
        </Link>
        <EliminaBozza id={b.id} />
      </div>
    </div>
  );

  return (
    <>
      {/* La barra sta DENTRO una card come in tutti gli altri elenchi: da sola
          sullo sfondo della pagina sarebbe una striscia bianca con gli angoli
          vivi, perche il suo stile e scritto per stare dentro una cornice. */}
      <div className="card tight" style={{ marginBottom: 12 }}>
        <div className="mail-select-bar">
          <label className="mail-select-all">
            <input
              ref={spuntaTutte}
              type="checkbox"
              checked={tutte}
              onChange={selezionaTutte}
              aria-label="Seleziona tutte le bozze"
            />
            <span>
              {selezione.size > 0
                ? `${selezione.size} selezionate`
                : `Seleziona tutte (${righe.length})`}
            </span>
          </label>

          {/* La pulizia che si fa davvero: le proposte dell'AI che non servono. */}
          {daAI.length > 0 && selezione.size === 0 && (
            <button
              type="button"
              className="azione-riga"
              onClick={soloAI}
              title="Spunta solo le bozze proposte dall’AI"
            >
              Solo quelle dell’AI ({daAI.length})
            </button>
          )}

          {/* La domanda porta il numero VERO: «tante» non è un numero. */}
          {conferma !== null && (
            <div className="mail-select-conferma">
              <span>
                Elimino <strong>{conferma}</strong>{" "}
                {conferma === 1 ? "bozza" : "bozze"}? Non finiscono nel cestino:
                spariscono.
              </span>
              <button
                type="button"
                className="btn danger small"
                disabled={inCorso}
                onClick={elimina}
              >
                Sì, elimina
              </button>
              <button
                type="button"
                className="btn secondary small"
                onClick={() => setConferma(null)}
              >
                Annulla
              </button>
            </div>
          )}

          {selezione.size > 0 && conferma === null && (
            <div className="mail-select-azioni">
              <button
                type="button"
                className="btn secondary small"
                disabled={inCorso}
                onClick={elimina}
              >
                Elimina ({selezione.size})
              </button>
              <button
                type="button"
                className="btn secondary small"
                onClick={() => setSelezione(new Set())}
              >
                Annulla selezione
              </button>
            </div>
          )}
        </div>
      </div>

      {esito && (
        <p className="page-caption" style={{ margin: "0 0 12px" }}>
          {esito}
        </p>
      )}

      {mie.length > 0 && (
        <>
          <h2 className="section-title" style={{ marginTop: 0 }}>
            Iniziate da te
          </h2>
          <div className="card tight">
            <div className="mail-list">{mie.map(riga)}</div>
          </div>
        </>
      )}

      {daAI.length > 0 && (
        <>
          <h2 className="section-title">Proposte dall’AI</h2>
          <div className="card tight">
            <div className="mail-list">{daAI.map(riga)}</div>
          </div>
        </>
      )}
    </>
  );
}
