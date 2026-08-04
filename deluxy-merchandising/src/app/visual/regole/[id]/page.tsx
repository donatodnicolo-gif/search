import { notFound } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { prisma } from "@/lib/db";
import { elencoCategorie } from "@/lib/classificazione";
import { REGOLE } from "@/lib/ordinamento-vetrina";
import { CAMPI, etichettaPasso, parsePassi, RISPOSTE, type Passo } from "@/lib/regole-ordine";
import {
  aggiungiPasso,
  eliminaRegolaOrdine,
  muoviPasso,
  riapplicaRegolaOvunque,
  rinominaRegolaOrdine,
} from "@/lib/azioni-regole-ordine";

export const dynamic = "force-dynamic";

const NOMI_METRICHE = Object.fromEntries(REGOLE.map((r) => [r.chiave, r.nome]));
const MAX_VALORI = 400;

// La scheda di una regola: qui si scrive la sequenza di passi. Ogni passo dice
// **cosa conta**, e l'ordine dei passi **è** la priorità: il primo decide, gli
// altri spezzano i pareggi.
export default async function RegolaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await prisma.regolaOrdine.findUnique({
    where: { id },
    include: {
      collezioni: { select: { id: true, titolo: true, negozio: true }, orderBy: { titolo: "asc" }, take: 40 },
      _count: { select: { collezioni: true, tipologie: true } },
    },
  });
  if (!r) notFound();
  const passi = parsePassi(r.passi);

  // I vocabolari: **solo valori che esistono davvero** nei dati, con quanti
  // prodotti li portano. Un menu che propone una categoria vuota fa scrivere
  // regole che non spostano niente.
  const [categorie, linee, tipi, fornitori, tagGrezzi] = await Promise.all([
    elencoCategorie(),
    prisma.lineaProdotto.findMany({ where: { attiva: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.prodotto.groupBy({ by: ["tipoShopify"], where: { tipoShopify: { not: null } }, _count: true }),
    prisma.prodotto.groupBy({ by: ["vendorShopify"], where: { vendorShopify: { not: null } }, _count: true }),
    prisma.prodotto.findMany({ where: { tagShopify: { not: null } }, select: { tagShopify: true } }),
  ]);

  // I tag arrivano da Shopify in una stringa sola: qui si contano uno per uno,
  // perché è lì che vivono occasione e destinatario (compleanno, matrimonio…).
  const contaTag = new Map<string, number>();
  for (const p of tagGrezzi) {
    for (const t of (p.tagShopify ?? "").split(",")) {
      const k = t.trim();
      if (k) contaTag.set(k, (contaTag.get(k) ?? 0) + 1);
    }
  }
  const tag = [...contaTag.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_VALORI);

  // I valori più diffusi in cima: si scrive una regola su quello che c'è.
  const perConta = <T extends { _count: number }>(righe: T[]) => [...righe].sort((a, b) => b._count - a._count);

  return (
    <div className="layout">
      <Sidebar attiva="visual" />
      <main className="main" style={{ maxWidth: 980 }}>
        <a className="ritorno" href="/visual/regole">← Regole d&apos;ordine</a>
        <div className="page-head">
          <div>
            <h1 className="page-title">{r.nome}</h1>
            <p className="page-sub">
              {passi.length === 0 ? (
                <>Nessun passo: questa regola non ordina ancora niente.</>
              ) : (
                <>
                  <b>{passi.length}</b> passi in priorità · usata da <b>{r._count.collezioni}</b> collezioni e{" "}
                  <b>{r._count.tipologie}</b> tipologie
                </>
              )}
            </p>
          </div>
          {r._count.collezioni > 0 && (
            <form action={riapplicaRegolaOvunque.bind(null, r.id)}>
              <button type="submit" className="btn btn-primario">
                Riapplica alle {r._count.collezioni} collezioni
              </button>
            </form>
          )}
        </div>

        {/* — I passi, in priorità — */}
        <div className="scheda">
          <div className="scheda-titolo">Come ordina</div>
          {passi.length === 0 ? (
            <div className="vuoto-mini">
              Aggiungi il primo passo qui sotto. Finché non ce n&apos;è nessuno la regola si può assegnare, ma
              l&apos;ordine resta quello curato a mano: <b>una regola vuota non è «tutti i prodotti»</b>, è una regola
              da finire.
            </div>
          ) : (
            <div className="vetrina-lista">
              {passi.map((p, i) => (
                <div className="vetrina-riga" key={i}>
                  <span className="vetrina-pos">{i + 1}</span>
                  <span className="vetrina-info">
                    <span className="cella-nome">{etichettaPasso(p, NOMI_METRICHE)}</span>
                    <div className="cella-sub">
                      {p.t === "metrica"
                        ? REGOLE.find((x) => x.chiave === p.m)?.spiega
                        : i === 0
                          ? "Decide l'ordine: chi corrisponde va in cima."
                          : "Spezza i pareggi rimasti dai passi sopra."}
                    </div>
                  </span>
                  <span className="vetrina-azioni">
                    <form action={muoviPasso.bind(null, r.id, i, "su")}>
                      <button className="icon-btn" title="Più importante" type="submit" disabled={i === 0}>↑</button>
                    </form>
                    <form action={muoviPasso.bind(null, r.id, i, "giu")}>
                      <button className="icon-btn" title="Meno importante" type="submit" disabled={i === passi.length - 1}>↓</button>
                    </form>
                    <form action={muoviPasso.bind(null, r.id, i, "via")}>
                      <button className="icon-btn" title="Togli il passo" type="submit">×</button>
                    </form>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* — Aggiungere un passo — */}
        <div className="scheda">
          <div className="scheda-titolo">Aggiungi un passo</div>
          <div style={{ display: "grid", gap: 18 }}>
            <form action={aggiungiPasso.bind(null, r.id)} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <input type="hidden" name="tipo" value="metrica" />
              <b style={{ minWidth: 90 }}>Metrica</b>
              <select name="metrica" aria-label="Metrica">
                {REGOLE.filter((x) => x.chiave !== "manuale").map((x) => (
                  <option key={x.chiave} value={x.chiave}>{x.nome}</option>
                ))}
              </select>
              <button type="submit" className="btn btn-secondario">Aggiungi</button>
              <span className="page-sub" style={{ margin: 0 }}>Mette in fila tutti i prodotti.</span>
            </form>

            <PassoAttributo
              id={r.id}
              campo="tipo"
              valori={perConta(tipi).map((t) => ({ v: t.tipoShopify as string, n: t._count }))}
            />
            <PassoAttributo
              id={r.id}
              campo="categoria"
              valori={categorie.map((c) => ({ v: c.chiave, n: null, etichetta: c.nome }))}
            />
            <PassoAttributo
              id={r.id}
              campo="fornitore"
              valori={perConta(fornitori).map((f) => ({ v: f.vendorShopify as string, n: f._count }))}
            />
            <PassoAttributo
              id={r.id}
              campo="linea"
              valori={linee.map((l) => ({ v: l.id, n: null, etichetta: l.nome }))}
            />
            <PassoAttributo id={r.id} campo="tag" valori={tag.map(([v, n]) => ({ v, n }))} />
            <PassoAttributo
              id={r.id}
              campo="risposta"
              valori={RISPOSTE.map((x) => ({ v: x.chiave, n: null, etichetta: x.nome }))}
            />

            <form action={aggiungiPasso.bind(null, r.id)} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <input type="hidden" name="tipo" value="attr" />
              <input type="hidden" name="campo" value="prezzo" />
              <b style={{ minWidth: 90 }}>Prezzo</b>
              <input name="da" type="number" step="0.01" placeholder="da €" style={{ width: 110 }} />
              <input name="a" type="number" step="0.01" placeholder="a €" style={{ width: 110 }} />
              <button type="submit" className="btn btn-secondario">Aggiungi</button>
              <span className="page-sub" style={{ margin: 0 }}>
                Il <b>da</b> è compreso, il <b>a</b> escluso: così 200 € non cade in un buco fra due passi.
              </span>
            </form>
          </div>
        </div>

        {/* — Dove è in uso — */}
        {r.collezioni.length > 0 && (
          <div className="scheda">
            <div className="scheda-titolo">Collezioni che la usano ({r._count.collezioni})</div>
            <div className="tabella-wrap">
              <table>
                <tbody>
                  {r.collezioni.map((c) => (
                    <tr key={c.id} className="riga-cliccabile">
                      <td>
                        <a href={`/visual/${c.id}`} className="cella-nome link-riga">{c.titolo}</a>
                        <div className="cella-sub">{c.negozio}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {r._count.collezioni > r.collezioni.length && (
              <p className="page-sub" style={{ marginTop: 12 }}>
                Mostrate le prime {r.collezioni.length} di {r._count.collezioni}.
              </p>
            )}
          </div>
        )}

        {/* — Nome, descrizione, eliminazione — */}
        <div className="scheda">
          <div className="scheda-titolo">Nome e descrizione</div>
          <form action={rinominaRegolaOrdine.bind(null, r.id)} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input name="nome" defaultValue={r.nome} required style={{ minWidth: 260 }} />
            <input name="descrizione" defaultValue={r.descrizione ?? ""} placeholder="A cosa serve" style={{ minWidth: 280 }} />
            <button type="submit" className="btn btn-secondario">Salva</button>
          </form>
          <form action={eliminaRegolaOrdine.bind(null, r.id)} style={{ marginTop: 14 }}>
            <button type="submit" className="btn btn-secondario">Elimina la regola</button>
            <span className="page-sub" style={{ marginLeft: 10 }}>
              Le collezioni che la usano tornano «solo a mano»: <b>l&apos;ordine già scritto non si tocca</b>.
            </span>
          </form>
        </div>
      </main>
    </div>
  );
}

/**
 * Un passo su un attributo. I valori si scelgono da un `<select multiple>` e
 * valgono **in alternativa** dentro lo stesso passo (categoria Fiori *o* Torte)
 * — stessa convenzione dei criteri delle tipologie, non una nuova.
 * Accanto a ogni valore c'è **quanti prodotti lo portano**: una regola su un
 * valore che nessuno ha non sposta niente, ed è meglio vederlo prima.
 */
function PassoAttributo({
  id,
  campo,
  valori,
}: {
  id: string;
  campo: string;
  valori: { v: string; n: number | null; etichetta?: string }[];
}) {
  const def = CAMPI.find((c) => c.chiave === campo);
  return (
    <form action={aggiungiPasso.bind(null, id)} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
      <input type="hidden" name="tipo" value="attr" />
      <input type="hidden" name="campo" value={campo} />
      <b style={{ minWidth: 90, paddingTop: 6 }}>{def?.nome ?? campo}</b>
      {valori.length === 0 ? (
        <span className="page-sub" style={{ margin: 0, paddingTop: 6 }}>
          Nessun valore nei dati: questo passo non avrebbe niente da portare in cima.
        </span>
      ) : (
        <>
          <select name="valori" multiple size={Math.min(6, valori.length)} style={{ minWidth: 300 }} aria-label={def?.nome}>
            {valori.map((x) => (
              <option key={x.v} value={x.v}>
                {x.etichetta ?? x.v}
                {x.n != null ? ` (${x.n})` : ""}
              </option>
            ))}
          </select>
          <button type="submit" className="btn btn-secondario" style={{ marginTop: 2 }}>Aggiungi</button>
          <span className="page-sub" style={{ margin: 0, paddingTop: 6, maxWidth: 320 }}>{def?.spiega}</span>
        </>
      )}
    </form>
  );
}
