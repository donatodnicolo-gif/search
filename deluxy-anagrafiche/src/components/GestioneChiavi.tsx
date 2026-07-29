"use client";

import { useState } from "react";
import {
  AMBITI,
  type Ambito,
  TIPOLOGIE,
  ambitiDi,
  permessiDa,
  tipologiaDi,
} from "@/lib/chiavi";
import {
  aggiornaChiave,
  creaChiave,
  eliminaChiave,
  impostaAttivaChiave,
  rigeneraChiave,
  type EsitoChiave,
} from "@/lib/azioni-chiavi";

export type ChiaveInElenco = {
  id: string;
  nome: string;
  prefisso: string | null;
  note: string | null;
  attiva: boolean;
  scrittura: boolean;
  scritturaPartner: boolean;
  scritturaReferenti: boolean;
  scritturaFeedback: boolean;
  creata: string;
  ultimoUso: string | null;
};

// Pagina /chiavi: chi chiama le API del registro, con che permessi, da quando.
// La chiave in chiaro esiste per un istante — appena creata o rigenerata — e
// poi non è più recuperabile: il riquadro giallo è l'unico momento per copiarla.
export function GestioneChiavi({ chiavi }: { chiavi: ChiaveInElenco[] }) {
  const [nuova, setNuova] = useState(false);
  const [chiaveInChiaro, setChiaveInChiaro] = useState<{ nome: string; valore: string } | null>(null);
  const [messaggio, setMessaggio] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [inModifica, setInModifica] = useState<string | null>(null);

  // Il nome mostrato è quello **normalizzato** che torna dal server ("Prova
  // Chiavi UI" → "prova-chiavi-ui"): è quello che va nell'header e nella
  // provenienza, non quello digitato.
  function gestisci(esito: EsitoChiave) {
    if (!esito.ok) {
      setErrore(esito.errore);
      setMessaggio(null);
      return false;
    }
    setErrore(null);
    setMessaggio(esito.messaggio ?? null);
    if (esito.chiave) setChiaveInChiaro({ nome: esito.nome, valore: esito.chiave });
    return true;
  }

  return (
    <>
      {errore && <div className="avviso-errore">{errore}</div>}
      {messaggio && !chiaveInChiaro && <div className="avviso-ok">{messaggio}</div>}

      {chiaveInChiaro && (
        <ChiaveAppenaCreata
          nome={chiaveInChiaro.nome}
          valore={chiaveInChiaro.valore}
          onChiudi={() => setChiaveInChiaro(null)}
        />
      )}

      <div className="page-head" style={{ marginTop: 8 }}>
        <div>
          <h2 className="sezione-titolo" style={{ margin: 0 }}>
            <span>Chiavi ({chiavi.length})</span>
          </h2>
        </div>
        {!nuova && (
          <button type="button" className="btn" onClick={() => setNuova(true)}>
            ＋ Nuova chiave
          </button>
        )}
      </div>

      {nuova && (
        <form
          className="scheda scheda-chiave"
          action={async (fd) => {
            if (gestisci(await creaChiave(fd))) setNuova(false);
          }}
        >
          <div className="modulo">
            <div className="campo-modulo">
              <label htmlFor="nome-chiave">
                Nome dell&apos;app <span className="obbligatorio">*</span>
              </label>
              <input
                id="nome-chiave"
                name="nome"
                required
                placeholder="deluxy-messaging-feedback"
                autoComplete="off"
              />
              <p className="testo-guida">
                È anche la <strong>sorgente</strong> con cui il dato viene firmato nella provenienza: minuscolo, con i
                trattini. Non si può cambiare dopo.
              </p>
            </div>
            <div className="campo-modulo">
              <label htmlFor="note-chiave">A cosa serve</label>
              <input id="note-chiave" name="note" placeholder="Customer Service — reclami chiusi con colpa al partner" />
              <p className="testo-guida">Promemoria per chi la gestisce. Non scriverci mai la chiave.</p>
            </div>
          </div>

          <SceltaPermessi />

          <div className="azioni-modulo">
            <button type="button" className="btn btn-secondario" onClick={() => setNuova(false)}>
              Annulla
            </button>
            <button className="btn" type="submit">
              Crea e mostra la chiave
            </button>
          </div>
        </form>
      )}

      {chiavi.length === 0 && !nuova && (
        <p className="testo-guida">Nessuna chiave: nessuna app può ancora chiamare le API del registro.</p>
      )}

      <div className="elenco-chiavi">
        {chiavi.map((c) => {
          const tipologia = tipologiaDi(c);
          const ambiti = ambitiDi(c);
          const modifica = inModifica === c.id;
          return (
            <div key={c.id} className={`scheda scheda-chiave${c.attiva ? "" : " sospesa"}`}>
              <div className="chiave-testa">
                <div className="chiave-identita">
                  <span className="chiave-nome">{c.nome}</span>
                  <span className="badge" style={{ color: coloreTipologia(ambiti) }}>
                    <span className="dot" />
                    {tipologia.nome}
                  </span>
                  {!c.attiva && (
                    <span className="badge" style={{ color: "var(--red)" }}>
                      <span className="dot" />
                      Sospesa
                    </span>
                  )}
                </div>
                <div className="chiave-azioni">
                  <button
                    type="button"
                    className="btn btn-secondario btn-compatto"
                    onClick={() => setInModifica(modifica ? null : c.id)}
                  >
                    {modifica ? "Chiudi" : "Permessi"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondario btn-compatto"
                    onClick={async () => {
                      if (!confirm(`Rigenerare la chiave "${c.nome}"?\n\nLa chiave attuale smette di funzionare subito: va sostituita nel .env dell'app (e su Vercel).`))
                        return;
                      gestisci(await rigeneraChiave(c.id));
                    }}
                  >
                    Rigenera
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondario btn-compatto"
                    onClick={async () => gestisci(await impostaAttivaChiave(c.id, !c.attiva))}
                  >
                    {c.attiva ? "Sospendi" : "Riattiva"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondario btn-compatto btn-pericolo"
                    onClick={async () => {
                      if (!confirm(`Eliminare definitivamente la chiave "${c.nome}"?\n\nSe un'app la sta ancora usando riceverà 401. Per fermarla in modo reversibile usa "Sospendi".`))
                        return;
                      gestisci(await eliminaChiave(c.id));
                    }}
                  >
                    Elimina
                  </button>
                </div>
              </div>

              <div className="chiave-meta">
                <span title="Primi caratteri della chiave: serve a riconoscerla, non a usarla">
                  {c.prefisso ?? "prefisso ignoto (chiave creata da terminale)"}
                </span>
                <span>Creata il {c.creata}</span>
                <span>{c.ultimoUso ? `Ultimo uso ${c.ultimoUso}` : "Mai usata"}</span>
              </div>
              {c.note && <p className="chiave-note">{c.note}</p>}

              {modifica ? (
                <form
                  className="chiave-modifica"
                  action={async (fd) => {
                    if (gestisci(await aggiornaChiave(c.id, fd))) setInModifica(null);
                  }}
                >
                  <SceltaPermessi iniziali={ambiti} />
                  <div className="campo-modulo" style={{ marginTop: 12 }}>
                    <label htmlFor={`note-${c.id}`}>A cosa serve</label>
                    <input id={`note-${c.id}`} name="note" defaultValue={c.note ?? ""} />
                  </div>
                  <div className="azioni-modulo">
                    <button type="button" className="btn btn-secondario" onClick={() => setInModifica(null)}>
                      Annulla
                    </button>
                    <button className="btn" type="submit">
                      Salva permessi
                    </button>
                  </div>
                </form>
              ) : (
                <div className="chiave-permessi">
                  <span className="chiave-permesso letto">Lettura</span>
                  {AMBITI.filter((a) => c[a.campo]).map((a) => (
                    <span key={a.id} className="chiave-permesso" style={{ color: a.colore }} title={a.endpoint}>
                      {a.nome}
                    </span>
                  ))}
                  {ambiti.length === 0 && <span className="testo-guida">— nessuna scrittura</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

// Le tipologie sono scorciatoie: spuntano i permessi giusti in un colpo. Sotto
// restano i singoli permessi, perché è lì che si decide davvero cosa può fare
// una chiave — la tipologia è solo il nome della combinazione.
function SceltaPermessi({ iniziali = [] }: { iniziali?: Ambito[] }) {
  const [ambiti, setAmbiti] = useState<Ambito[]>(iniziali);
  const tipologia = tipologiaDi(permessiDa(ambiti));

  return (
    <div className="scelta-permessi">
      <div className="campo-modulo">
        <label>Tipologia</label>
        <div className="tipologie-pillole">
          {TIPOLOGIE.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`stato-pill${tipologia.id === t.id ? " attuale" : ""}`}
              title={t.descrizione}
              onClick={() => setAmbiti(t.ambiti)}
            >
              <span className="stato-label">{t.nome}</span>
            </button>
          ))}
        </div>
        <p className="testo-guida">{tipologia.descrizione}</p>
      </div>

      <div className="campo-modulo">
        <label>Permessi</label>
        <div className="griglia-ambiti">
          <div className="ambito ambito-fisso">
            <div className="ambito-nome">Lettura</div>
            <p className="testo-guida">
              Sempre attiva su ogni chiave: <code>GET /api/v1/partners</code>, <code>/match</code>,{" "}
              <code>/feedback</code>.
            </p>
          </div>
          {AMBITI.map((a) => {
            const attivo = ambiti.includes(a.id);
            return (
              <label key={a.id} className={`ambito${attivo ? " attivo" : ""}`}>
                <div className="ambito-nome">
                  <input
                    type="checkbox"
                    name="ambiti"
                    value={a.id}
                    checked={attivo}
                    onChange={(e) =>
                      setAmbiti((prec) =>
                        e.target.checked ? [...prec, a.id] : prec.filter((x) => x !== a.id),
                      )
                    }
                  />
                  <span style={{ color: attivo ? a.colore : undefined }}>{a.nome}</span>
                </div>
                <p className="testo-guida">{a.descrizione}</p>
                <code className="ambito-endpoint">{a.endpoint}</code>
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ChiaveAppenaCreata({
  nome,
  valore,
  onChiudi,
}: {
  nome: string;
  valore: string;
  onChiudi: () => void;
}) {
  const [copiata, setCopiata] = useState(false);
  return (
    <div className="chiave-in-chiaro">
      <div className="chiave-in-chiaro-testa">
        <strong>Chiave di «{nome}» — copiala adesso</strong>
        <button type="button" className="btn btn-secondario btn-compatto" onClick={onChiudi}>
          Ho copiato
        </button>
      </div>
      <code className="chiave-valore">{valore}</code>
      <div className="chiave-in-chiaro-piede">
        <button
          type="button"
          className="btn btn-compatto"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(valore);
              setCopiata(true);
            } catch {
              setCopiata(false);
            }
          }}
        >
          {copiata ? "Copiata ✓" : "Copia"}
        </button>
        <span className="testo-guida">
          Nel database resta solo lo SHA-256: chiudendo questo riquadro la chiave non è più recuperabile. Va incollata
          in <code>ANAGRAFICHE_API_KEY</code> nel <code>.env</code> dell&apos;app (e su Vercel), mai in un file
          committato.
        </span>
      </div>
    </div>
  );
}

function coloreTipologia(ambiti: Ambito[]): string {
  if (ambiti.length === 0) return "var(--text-secondary)";
  if (ambiti.length > 1) return "var(--orange)";
  return AMBITI.find((a) => a.id === ambiti[0])?.colore ?? "var(--text-secondary)";
}
