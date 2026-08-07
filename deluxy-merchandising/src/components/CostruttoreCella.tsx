"use client";

import { useState } from "react";
import { corrisponde, CAMPI, RISPOSTE, type Campo, type Condizione, type Passo } from "@/lib/regole-ordine";
import { REGOLE } from "@/lib/ordinamento-vetrina";
import type { VociPassi, VoceValore } from "@/lib/voci-passi";
import type { ProdottoAnteprima } from "./AnteprimaCella";

const CAMPI_VALORI: Campo[] = ["tipo", "categoria", "fornitore", "linea", "tag", "risposta"];
const MAX_FOTO = 18;

/**
 * **La griglia delle condizioni di una cella, che si restringe mentre scegli.**
 *
 * Le condizioni di una cella valgono tutte insieme, quindi non sono
 * indipendenti: scelto «Fiori», un fornitore di pasticceria non ha più niente da
 * portare in cima. Prima si potevano spuntare lo stesso, e la cella usciva
 * vuota — te ne accorgevi solo dopo. Ora **a ogni spunta i conti si rifanno** e
 * i valori rimasti a zero si spengono.
 *
 * I numeri accanto ai valori sono **contestuali**: dicono quanti prodotti
 * resterebbero aggiungendo *quel* valore a quello che hai già scelto. Per il suo
 * stesso campo il conto ignora la selezione corrente — dentro un campo i valori
 * valgono in alternativa, quindi aggiungerne uno **allarga**, non restringe, e
 * mostrarli a zero sarebbe falso.
 *
 * Tutto nel browser, come l'anteprima: un giro di rete a ogni casella sarebbe
 * lento, e la stessa `corrisponde()` del server — funzione pura — garantisce che
 * quello che si vede qui è quello che farà la regola.
 */
export function CostruttoreCella({
  voci,
  prodotti,
  suCosa,
  campione,
  idsCollezione,
  nomeCollezione,
  passi = [],
}: {
  voci: VociPassi;
  /** I passi **già salvati**: sono l'anteprima di partenza, finché non spunti niente. */
  passi?: Passo[];
  /** **Il catalogo**, non la collezione: e' il vocabolario di quello che si puo' esprimere. */
  prodotti: ProdottoAnteprima[];
  suCosa: string;
  campione?: boolean;
  /** Gli id dei prodotti della collezione da cui si lavora: solo per il secondo numero. */
  idsCollezione?: string[];
  nomeCollezione?: string;
}) {
  const [scelti, setScelti] = useState<Record<string, string[]>>({});
  const [metriche, setMetriche] = useState<string[]>([]);
  const [da, setDa] = useState("");
  const [a, setA] = useState("");

  const opzioni: Record<string, VoceValore[]> = {
    tipo: voci.tipi,
    categoria: voci.categorie,
    fornitore: voci.fornitori,
    linea: voci.linee,
    tag: voci.tag,
    risposta: RISPOSTE.map((x) => ({ v: x.chiave, n: null, etichetta: x.nome })),
  };

  /** Le condizioni scelte, saltandone eventualmente una (per i conti contestuali). */
  const condizioniDi = (salta?: string): Condizione[] => {
    const c: Condizione[] = [];
    for (const campo of CAMPI_VALORI) {
      if (campo === salta) continue;
      const v = scelti[campo] ?? [];
      if (v.length) c.push({ campo, valori: v });
    }
    if (salta !== "prezzo") {
      const nDa = Number.parseFloat(da);
      const nA = Number.parseFloat(a);
      if (Number.isFinite(nDa) || Number.isFinite(nA)) {
        c.push({ campo: "prezzo", da: Number.isFinite(nDa) ? nDa : undefined, a: Number.isFinite(nA) ? nA : undefined });
      }
    }
    return c;
  };

  const filtra = (cs: Condizione[]) =>
    cs.length === 0 ? prodotti : prodotti.filter((p) => cs.every((c) => corrisponde(p, { t: "attr", ...c })));

  const senzaDati = prodotti.length === 0;
  const condizioni = condizioniDi();

  /**
   * **Quello che la regola porta in cima adesso**: i prodotti presi dai passi
   * gia' salvati, nell'ordine dei passi (prima quelli della cella 1, poi i nuovi
   * della 2…). Un prodotto che due celle prendono si conta una volta sola, dove
   * sale per primo.
   */
  const daiPassi = () => {
    const visti = new Set<string>();
    const out: ProdottoAnteprima[] = [];
    for (const p of passi) {
      if (p.t === "metrica") continue; // mette in fila tutti: non seleziona nessuno
      for (const x of prodotti) {
        if (!visti.has(x.id) && corrisponde(x, p)) {
          visti.add(x.id);
          out.push(x);
        }
      }
    }
    return out;
  };

  // **Finche' non spunti niente si guarda quello che hai gia' scelto**, non il
  // catalogo intero: le foto di 900 prodotti non dicono niente di questa regola.
  // Appena si spunta qualcosa l'anteprima passa alla cella che si sta scrivendo —
  // e' quella la domanda del momento.
  const daSalvati = condizioni.length === 0 && passi.some((p) => p.t !== "metrica");
  const presi = daSalvati ? daiPassi() : filtra(condizioni);
  // **Due numeri, due domande diverse.** Il primo dice cosa la cella prende dal
  // catalogo - e' il vocabolario di quello che si puo' esprimere - il secondo
  // quanti di quelli stanno nella vetrina che si sta curando. Contare solo sulla
  // collezione faceva sparire quasi tutti i valori quando la collezione e'
  // piccola: con cinque prodotti dentro si vedevano cinque tag.
  const dentro = idsCollezione ? new Set(idsCollezione) : null;
  const quiDentro = dentro ? presi.filter((p) => dentro.has(p.id)).length : null;

  const cambia = (campo: string, valore: string, spuntato: boolean) =>
    setScelti((s) => {
      const v = new Set(s[campo] ?? []);
      if (spuntato) v.add(valore);
      else v.delete(valore);
      return { ...s, [campo]: [...v] };
    });

  return (
    <>
      {/* **L'anteprima mostra sempre le foto.** Senza condizioni fa vedere i
          prodotti su cui si sta lavorando — la vetrina di partenza — e a ogni
          spunta si restringe: si vede *cosa si sta togliendo*, non solo un
          numero che cala. Con un riquadro vuoto finche' non spunti qualcosa si
          perdeva proprio il momento in cui serve guardare. */}
      <div className="anteprima-cella">
        <div className="anteprima-conto">
          <b>{presi.length}</b> {presi.length === 1 ? "prodotto" : "prodotti"}
          <span className="page-sub" style={{ margin: 0 }}>
            {" "}
            su {prodotti.length} {suCosa}
            {campione ? " (campione)" : ""}
            {condizioni.length > 0 ? (
              <>
                {" "}· {condizioni.length} {condizioni.length === 1 ? "condizione" : "condizioni"} insieme
              </>
            ) : daSalvati ? (
              <>
                {" "}· quello che i {passi.filter((p) => p.t !== "metrica").length} passi già scelti portano in cima ·
                spunta qui sotto per provarne un altro
              </>
            ) : (
              <> · nessuna condizione: spunta qui sotto per restringere</>
            )}
            {quiDentro != null && (
              <>
                {" "}· di cui <b>{quiDentro}</b> in {nomeCollezione ? "«" + nomeCollezione + "»" : "questa collezione"}
              </>
            )}
          </span>
        </div>
        {presi.length === 0 ? (
          <span className="page-sub" style={{ margin: 0 }}>
            {daSalvati ? (
              <>
                <b>Nessuno.</b> I passi già scelti non prendono niente di quello che c&apos;è in vendita: così la regola
                non sposta la vetrina.
              </>
            ) : (
              <>
                <b>Nessuno.</b> Le condizioni di una cella valgono <b>tutte insieme</b>: se ne stai chiedendo troppe, la
                cella non porterà in cima nessuno.
              </>
            )}
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
      </div>

      <div className="griglia-condizioni">
        <div className="gc-testa">Condizione</div>
        <div className="gc-testa">Valori — chi corrisponde va in cima</div>

        {CAMPI_VALORI.map((campo) => {
          const def = CAMPI.find((x) => x.chiave === campo)!;
          const lista = opzioni[campo] ?? [];
          // Il conto di un valore si fa sui prodotti che soddisfano **le altre**
          // condizioni: dentro il proprio campo i valori sono in alternativa.
          const altri = filtra(condizioniDi(campo));
          const conta = (v: string) => altri.filter((p) => corrisponde(p, { t: "attr", campo, valori: [v] })).length;
          const scelte = scelti[campo] ?? [];
          // **Senza prodotti su cui contare non si nasconde niente.** Con una
          // collezione vuota tutti i conti sarebbero zero e la griglia
          // sparirebbe: meglio i numeri di partenza che un elenco vuoto.
          const vive = senzaDati
            ? lista.map((x) => ({ ...x, q: x.n ?? 0 }))
            : lista.map((x) => ({ ...x, q: conta(x.v) })).filter((x) => x.q > 0 || scelte.includes(x.v));

          return (
            <Riga key={campo} etichetta={def.nome} aiuto={def.spiega}>
              {lista.length === 0 ? (
                <span className="page-sub" style={{ margin: 0 }}>
                  Nessun valore nei dati: questa condizione non avrebbe niente da portare in cima.
                </span>
              ) : vive.length === 0 ? (
                <span className="page-sub" style={{ margin: 0 }}>
                  {condizioni.length === 0
                    ? "Nessun valore ha prodotti in vendita."
                    : "Nessun valore sta insieme a quello che hai gia' scelto."}
                </span>
              ) : (
                <div className="griglia-valori" role="group" aria-label={def.nome}>
                  {vive.map((x) => (
                    <label className="chip-valore" key={x.v}>
                      <input
                        type="checkbox"
                        name={`valori:${campo}`}
                        value={x.v}
                        checked={scelte.includes(x.v)}
                        onChange={(e) => cambia(campo, x.v, e.currentTarget.checked)}
                      />
                      <span>{x.etichetta ?? x.v}</span>
                      {x.q > 0 && <b className="chip-conta">{x.q}</b>}
                    </label>
                  ))}
                  {lista.length > vive.length && (
                    <span className="page-sub" style={{ margin: 0, alignSelf: "center" }}>
                      {lista.length - vive.length}{" "}
                      {condizioni.length === 0
                        ? "senza prodotti in vendita: non porterebbero niente in cima"
                        : "nascosti: non stanno insieme a quello che hai scelto"}
                    </span>
                  )}
                </div>
              )}
            </Riga>
          );
        })}

        <Riga etichetta="Poi ordina per" aiuto="Come si mettono in fila i prodotti che la cella porta in cima. Si scelgono in ordine: il 1º decide, gli altri spezzano i pareggi.">
          <div className="griglia-valori" role="group" aria-label="Ordina per">
            {REGOLE.filter((x) => x.chiave !== "manuale").map((x) => {
              const pos = metriche.indexOf(x.chiave);
              return (
                <label className="chip-valore" key={x.chiave} title={x.spiega}>
                  <input
                    type="checkbox"
                    checked={pos >= 0}
                    onChange={(e) => {
                      // **Il valore si legge qui, non dentro l'updater**: React
                      // azzera `currentTarget` appena l'handler finisce, e
                      // l'updater gira dopo — leggerlo lì faceva morire la
                      // pagina («client-side exception», visto in produzione).
                      const acceso = e.currentTarget.checked;
                      // **L'ordine e' quello in cui si clicca**: si accoda in
                      // fondo, non nell'ordine dell'elenco. Riordinare da soli
                      // vorrebbe dire decidere al posto di chi sta scegliendo.
                      setMetriche((m) => (acceso ? [...m, x.chiave] : m.filter((y) => y !== x.chiave)));
                    }}
                  />
                  <span>{x.nome}</span>
                  {pos >= 0 && <b className="chip-conta">{pos + 1}º</b>}
                </label>
              );
            })}
          </div>
          {metriche.map((m) => (
            <input key={m} type="hidden" name="metrica" value={m} />
          ))}
        </Riga>

        <Riga etichetta="Prezzo" aiuto="Il «da» è compreso, il «a» escluso: 200 € non cade in un buco fra due passi.">
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              name="prezzoDa"
              type="number"
              step="0.01"
              placeholder="da €"
              style={{ width: 110 }}
              value={da}
              onChange={(e) => setDa(e.currentTarget.value)}
            />
            <input
              name="prezzoA"
              type="number"
              step="0.01"
              placeholder="a €"
              style={{ width: 110 }}
              value={a}
              onChange={(e) => setA(e.currentTarget.value)}
            />
          </div>
        </Riga>
      </div>
    </>
  );
}

function Riga({ etichetta, aiuto, children }: { etichetta: string; aiuto?: string; children: React.ReactNode }) {
  return (
    <>
      <div className="gc-etichetta">
        {etichetta}
        {aiuto && <div className="cella-sub" style={{ fontWeight: 400 }}>{aiuto}</div>}
      </div>
      <div>{children}</div>
    </>
  );
}
