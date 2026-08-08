"use client";

import { useState } from "react";
import { corrisponde, CAMPI, RISPOSTE, type Campo, type Condizione } from "@/lib/regole-ordine";
import { REGOLE } from "@/lib/ordinamento-vetrina";
import type { VociPassi, VoceValore } from "@/lib/voci-passi";
import type { ProdottoAnteprima } from "./AnteprimaCella";

const nomeMetrica = (m: string) => REGOLE.find((x) => x.chiave === m)?.nome ?? m;

const CAMPI_VALORI: Campo[] = ["tipo", "categoria", "fornitore", "linea", "tag", "risposta", "zona", "citta", "occasione", "classificazione", "tipologiaMeta", "dataConsegna", "orario", "bestseller"];
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
  iniziali,
}: {
  voci: VociPassi;
  /** **Il catalogo**, non la collezione: e' il vocabolario di quello che si puo' esprimere. */
  prodotti: ProdottoAnteprima[];
  suCosa: string;
  campione?: boolean;
  /** Con cosa parte la griglia, quando si sta **modificando** un passo già salvato. */
  iniziali?: { scelti?: Record<string, string[]>; da?: string; a?: string; metriche?: string[] };
  /** Gli id dei prodotti della collezione da cui si lavora: solo per il secondo numero. */
  idsCollezione?: string[];
  nomeCollezione?: string;
}) {
  // Modificando un passo la griglia parte **da com'era**: ricominciare da vuoto
  // vorrebbe dire riscrivere a memoria quello che si sta correggendo.
  const [scelti, setScelti] = useState<Record<string, string[]>>(iniziali?.scelti ?? {});
  const [metriche, setMetriche] = useState<string[]>(iniziali?.metriche ?? []);
  const [da, setDa] = useState(iniziali?.da ?? "");
  const [a, setA] = useState(iniziali?.a ?? "");

  const opzioni: Record<string, VoceValore[]> = {
    tipo: voci.tipi,
    categoria: voci.categorie,
    fornitore: voci.fornitori,
    linea: voci.linee,
    tag: voci.tag,
    zona: voci.zone,
    citta: voci.citta,
    occasione: voci.occasioni,
    classificazione: voci.classificazioni,
    tipologiaMeta: voci.tipologieMeta,
    dataConsegna: voci.date,
    orario: voci.orari,
    bestseller: voci.bestseller,
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

  // **Qui si guarda solo la cella che stai scrivendo.** Quello che i passi
  // gia' salvati portano in cima sta nel riquadro sopra, con l'ordine vero:
  // due domande diverse, due riquadri — mescolarle voleva dire non sapere mai
  // quale delle due si stesse guardando.
  /**
   * **L'anteprima si mette in fila con le metriche scelte.**
   *
   * Mostrare *chi* la cella prende senza *in che ordine* non basta: scegliendo
   * «Prezzo basso in cima» ci si aspetta di vedere i piu' economici davanti
   * (segnalato dall'utente). Qui si ordina con quello che il browser puo'
   * calcolare da solo — prezzo, novita', margine; **venduto e fatturato no**,
   * quelli stanno nel database e li applica il server quando la regola gira. Se
   * la prima metrica e' una di quelle, l'ordine resta quello di partenza e in
   * pagina c'e' scritto perche': una fila che finge di essere ordinata sarebbe
   * peggio di una dichiaratamente non ordinata.
   */
  const DA_SERVER: string[] = ["best_seller", "ricavo"];
  const quando = (v: Date | string | null | undefined) => (v ? new Date(v).getTime() : Number.NEGATIVE_INFINITY);
  const valore = (p: ProdottoAnteprima, m: string): number | null => {
    const prezzo = p.prezzoVendita || 0;
    const costo = p.costoProduzione || 0;
    switch (m) {
      case "prezzo_desc":
        return prezzo;
      case "prezzo_asc":
        return -prezzo;
      case "novita":
        return quando(p.pubblicatoIlShopify) === Number.NEGATIVE_INFINITY ? quando(p.creatoIlShopify) : quando(p.pubblicatoIlShopify);
      case "margine":
        return prezzo > 0 && costo > 0 ? (prezzo - costo) / prezzo : Number.NEGATIVE_INFINITY;
      default:
        return null; // venduto e fatturato: non si sanno qui
    }
  };
  const qui = metriche.filter((m) => !DA_SERVER.includes(m));
  const soloServer = metriche.length > 0 && qui.length === 0;
  const presi =
    condizioni.length === 0
      ? []
      : qui.length === 0
        ? filtra(condizioni)
        : [...filtra(condizioni)].sort((a, b) => {
            for (const m of qui) {
              const d = (valore(b, m) ?? 0) - (valore(a, m) ?? 0);
              if (d !== 0) return d;
            }
            return a.nome.localeCompare(b.nome);
          });
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
            {condizioni.length === 0 ? (
              <>Spunta qui sotto: qui vedi <b>chi prenderebbe</b> la cella che stai scrivendo, mentre la scrivi.</>
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
        {metriche.length > 0 && presi.length > 0 && (
          <div className="page-sub" style={{ marginTop: 6, marginBottom: 0 }}>
            {soloServer ? (
              <>
                In fila per <b>{metriche.map((m) => nomeMetrica(m)).join(" → ")}</b>: il venduto sta nel database, qui
                vedi <b>chi</b> prende la cella, non in che ordine.
              </>
            ) : (
              <>
                In fila per <b>{qui.map((m) => nomeMetrica(m)).join(" → ")}</b>
                {qui.length < metriche.length && (
                  <>
                    {" "}
                    · {metriche.filter((m) => DA_SERVER.includes(m)).map((m) => nomeMetrica(m)).join(" e ")} si {metriche.filter((m) => DA_SERVER.includes(m)).length === 1 ? "applica" : "applicano"} quando la regola gira
                  </>
                )}
                .
              </>
            )}
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
