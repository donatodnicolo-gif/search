"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { eur, MESI, num } from "@/lib/format";

// Il **budget delle linee di vendita, mese per mese**. Due misure sulla stessa
// griglia — valore in € e nuovi clienti — e si guarda una per volta: dodici
// mesi × due numeri nella stessa riga fanno ventiquattro caselle, e a quel
// punto non si legge più niente. Il selettore in cima cambia la misura, la
// griglia resta la stessa.

type Mese = { month: number; valore: number; clienti: number };
export type LineaBudget = {
  id: string;
  nome: string;
  // `true` quando la linea esiste anche in Scout, che è il master dell'elenco.
  // Una riga a budget senza corrispondenza in Scout non è un errore — può
  // essere una linea chiusa — ma va detto, non lasciato indovinare.
  inScout: boolean;
  attiva: boolean | null;
  mesi: Mese[];
};

type Misura = "valore" | "clienti";

export function LineeEditor({
  year,
  linee,
  primoMeseAperto,
  lineeScoutSenzaBudget,
}: {
  year: number;
  linee: LineaBudget[];
  // Deciso dal server: `new Date()` in un componente client dà un valore sul
  // server e un altro nel browser, e a cavallo del primo del mese i due render
  // non coinciderebbero.
  primoMeseAperto: number;
  // Linee che Scout conosce e che qui non hanno una riga di budget: si aprono
  // da qui, invece di aprire il database.
  lineeScoutSenzaBudget: string[];
}) {
  const router = useRouter();
  const [misura, setMisura] = useState<Misura>("valore");
  const [modifiche, setModifiche] = useState<Record<string, number>>({});
  const [salvo, setSalvo] = useState<string | null>(null);
  const [esito, setEsito] = useState<string | null>(null);
  const [creo, setCreo] = useState<string | null>(null);

  const chiuso = (month: number) => month < primoMeseAperto;
  const key = (lineaId: string, month: number, m: Misura) => `${lineaId}:${month}:${m}`;

  // Lo stato tiene **solo le caselle toccate**: i valori salvati restano la
  // base, così dopo un `router.refresh()` i numeri nuovi entrano da soli invece
  // di restare congelati in uno stato inizializzato una volta sola.
  const originali = useMemo(() => {
    const o: Record<string, number> = {};
    for (const l of linee)
      for (const x of l.mesi) {
        o[key(l.id, x.month, "valore")] = x.valore;
        o[key(l.id, x.month, "clienti")] = x.clienti;
      }
    return o;
  }, [linee]);

  const valore = (k: string) => modifiche[k] ?? originali[k] ?? 0;
  const toccata = (k: string) => k in modifiche && modifiche[k] !== (originali[k] ?? 0);

  const totLinea = (l: LineaBudget, m: Misura) =>
    l.mesi.reduce((s, x) => s + valore(key(l.id, x.month, m)), 0);
  const totLineaSalvato = (l: LineaBudget, m: Misura) =>
    l.mesi.reduce((s, x) => s + (originali[key(l.id, x.month, m)] ?? 0), 0);
  const totMese = (month: number, m: Misura) =>
    linee.reduce((s, l) => s + valore(key(l.id, month, m)), 0);

  const totale = linee.reduce((s, l) => s + totLinea(l, misura), 0);
  const totaleSalvato = linee.reduce((s, l) => s + totLineaSalvato(l, misura), 0);
  const differenza = totale - totaleSalvato;

  const chiaviToccate = Object.keys(modifiche).filter(toccata);
  const toccateDi = (lineaId: string) => chiaviToccate.filter((k) => k.startsWith(`${lineaId}:`));

  const mostra = (v: number) => (misura === "valore" ? eur(v) : num(v));

  async function salva(quali: LineaBudget[]) {
    const ids = new Set(quali.map((l) => l.id));
    // Si manda la **coppia intera** (valore + clienti) del mese: l'upsert scrive
    // tutti e due i campi, e mandarne uno solo azzererebbe l'altro. È il tipo di
    // perdita che non fa rumore, perché la misura cancellata è quella che in
    // quel momento non si sta guardando.
    const mesiToccati = new Map<string, Set<number>>();
    for (const k of chiaviToccate) {
      const [lineaId, month] = k.split(":");
      if (!ids.has(lineaId)) continue;
      if (!mesiToccati.has(lineaId)) mesiToccati.set(lineaId, new Set());
      mesiToccati.get(lineaId)!.add(Number(month));
    }
    const entries: { lineaId: string; month: number; valore: number; clienti: number }[] = [];
    for (const [lineaId, mesi] of mesiToccati)
      for (const month of mesi)
        entries.push({
          lineaId,
          month,
          valore: valore(key(lineaId, month, "valore")),
          clienti: valore(key(lineaId, month, "clienti")),
        });
    if (entries.length === 0) return;

    setSalvo(quali.length === 1 ? quali[0].id : "*");
    setEsito(null);
    const res = await fetch("/api/commerciale", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, entries }),
    });
    const body = await res.json().catch(() => null);
    setSalvo(null);
    if (!res.ok) {
      setEsito(body?.error ?? "Salvataggio non riuscito, riprova.");
      return;
    }
    // Si ripuliscono **solo le caselle salvate**: azzerare tutto farebbe sparire
    // dallo schermo le modifiche delle altre linee senza che nessuno le abbia
    // scritte da nessuna parte.
    setModifiche((p) => Object.fromEntries(Object.entries(p).filter(([k]) => !ids.has(k.split(":")[0]))));
    setEsito(
      `${body.scritti} ${body.scritti === 1 ? "mese salvato" : "mesi salvati"}` +
        (body.rifiutati > 0 ? ` · ${body.rifiutati} scartati (valori non validi)` : "") +
        "."
    );
    router.refresh();
  }

  async function apriLinea(nome: string) {
    setCreo(nome);
    setEsito(null);
    const res = await fetch("/api/commerciale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome }),
    });
    const body = await res.json().catch(() => null);
    setCreo(null);
    if (!res.ok) {
      setEsito(body?.error ?? "Linea non creata, riprova.");
      return;
    }
    setEsito(`«${nome}» ora ha una riga di budget: nasce a zero.`);
    router.refresh();
  }

  return (
    <>
      <div className="page-head" style={{ marginBottom: 12 }}>
        <div>
          <h2 className="section-title" style={{ margin: 0 }}>Budget per linea, mese per mese</h2>
          <p className="page-caption">
            {misura === "valore" ? (
              <>
                Quanto ci si aspetta di <strong>vendere</strong> su ogni linea, mese per mese. Il totale
                dell&apos;anno è <strong>{eur(totale)}</strong>.
              </>
            ) : (
              <>
                Quanti <strong>nuovi clienti</strong> (o attivazioni) porta ogni linea, mese per mese. In
                tutto <strong>{num(totale)}</strong> sull&apos;anno.
              </>
            )}
            {differenza !== 0 && (
              <>
                {" "}
                <strong className={`delta ${differenza > 0 ? "su" : "giu"}`}>
                  {differenza > 0 ? "+" : "−"}
                  {mostra(Math.abs(differenza))}
                </strong>{" "}
                rispetto a quello che è salvato.
              </>
            )}
          </p>
        </div>
        <div className="page-actions">
          <div className="seg">
            <button
              className={misura === "valore" ? "on" : ""}
              onClick={() => setMisura("valore")}
              title="Il valore atteso in euro."
            >
              Valore €
            </button>
            <button
              className={misura === "clienti" ? "on" : ""}
              onClick={() => setMisura("clienti")}
              title="I nuovi clienti o le attivazioni attese."
            >
              Nuovi clienti
            </button>
          </div>
        </div>
      </div>

      <div className="card tight">
        <div className="table-wrap">
          <table className="tab-mesi">
            <thead>
              <tr>
                <th>Linea</th>
                {MESI.map((m, i) => (
                  <th className="num" key={m} title={chiuso(i + 1) ? `${m} è un mese passato.` : undefined}>
                    {m}
                    {chiuso(i + 1) && <div className="muted" style={{ fontSize: 10, fontWeight: 400 }}>chiuso</div>}
                  </th>
                ))}
                <th className="num">Anno</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {linee.map((l) => {
                const toccate = toccateDi(l.id);
                const diff = totLinea(l, misura) - totLineaSalvato(l, misura);
                return (
                  <tr key={l.id}>
                    <td style={{ fontWeight: 500, whiteSpace: "nowrap" }}>
                      {l.nome}
                      {!l.inScout && (
                        <div className="muted" style={{ fontSize: 11, fontWeight: 400 }}>
                          non è fra le linee di Scout
                        </div>
                      )}
                      {l.attiva === false && (
                        <div className="muted" style={{ fontSize: 11, fontWeight: 400 }}>in standby</div>
                      )}
                    </td>
                    {MESI.map((_, i) => {
                      const month = i + 1;
                      const k = key(l.id, month, misura);
                      return (
                        <td className="num" key={month}>
                          <input
                            type="number"
                            min={0}
                            step={misura === "valore" ? 500 : 1}
                            value={valore(k)}
                            className={toccata(k) ? "toccata" : undefined}
                            style={chiuso(month) ? { borderStyle: "dashed" } : undefined}
                            title={
                              chiuso(month)
                                ? `${MESI[i]} è già passato: qui il budget si può ancora scrivere — serve a riempire i mesi rimasti vuoti — ma è un periodo già confrontato col consuntivo.`
                                : undefined
                            }
                            onChange={(e) =>
                              setModifiche((p) => ({
                                ...p,
                                [k]: e.target.value === "" ? 0 : Number(e.target.value),
                              }))
                            }
                          />
                        </td>
                      );
                    })}
                    <td className="num" style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
                      {mostra(totLinea(l, misura))}
                      {diff !== 0 && (
                        <div className={`delta ${diff > 0 ? "su" : "giu"}`} style={{ fontSize: 11 }}>
                          {diff > 0 ? "+" : "−"}
                          {mostra(Math.abs(diff))}
                        </div>
                      )}
                    </td>
                    <td>
                      <button
                        className="btn secondary small"
                        onClick={() => salva([l])}
                        disabled={salvo !== null || toccate.length === 0}
                        title={
                          toccate.length === 0
                            ? "Niente da salvare su questa linea."
                            : `Salva solo ${l.nome}.`
                        }
                      >
                        {salvo === l.id ? "Salvo…" : "Salva"}
                      </button>
                    </td>
                  </tr>
                );
              })}
              <tr className="tot">
                <td>Totale {year}</td>
                {MESI.map((_, i) => (
                  <td className="num" key={i}>{mostra(totMese(i + 1, misura))}</td>
                ))}
                <td className="num">{mostra(totale)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="form-footer">
        <span className="muted">
          {chiaviToccate.length === 0
            ? "Nessuna modifica da salvare."
            : `${chiaviToccate.length} ${chiaviToccate.length === 1 ? "casella modificata" : "caselle modificate"}.`}
          {esito && <> · {esito}</>}
        </span>
        <button
          className="btn primary"
          onClick={() => salva(linee)}
          disabled={salvo !== null || chiaviToccate.length === 0}
        >
          {salvo === "*" ? "Salvataggio…" : "Salva tutte le linee"}
        </button>
      </div>

      {lineeScoutSenzaBudget.length > 0 && (
        <div className="card">
          <h2 className="section-title" style={{ marginTop: 0 }}>Linee di Scout senza budget</h2>
          <p className="page-caption" style={{ marginTop: 0 }}>
            Scout le conosce, qui non hanno una riga: finché non ce l&apos;hanno il loro budget non è zero,
            è <strong>assente</strong>, e non compare in nessun totale. Aprendola nasce a zero e la si
            compila qui sopra.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {lineeScoutSenzaBudget.map((n) => (
              <button
                key={n}
                className="btn secondary small"
                onClick={() => apriLinea(n)}
                disabled={creo !== null}
              >
                {creo === n ? "Apro…" : `+ ${n}`}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
