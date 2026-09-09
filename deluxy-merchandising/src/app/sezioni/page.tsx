import { Sidebar } from "@/components/Sidebar";
import { OrdineSezioni } from "@/components/OrdineSezioni";
import { aggiungiSezioneAzione, cambiaAttivaSezioneAzione, cambiaTipoSezioneAzione, salvaOrdineSezioniAzione } from "@/lib/azioni-sezioni";
import { elencoCategorie } from "@/lib/classificazione";
import { prisma } from "@/lib/db";
import { negoziAttivi } from "@/lib/negozi";

export const dynamic = "force-dynamic";

// **Le sezioni della scheda prodotto: quali, come si compilano, in che ordine.**
//
// Richiesta dell'utente (09/09/2026): «rispetta l'ordine delle sezioni di ogni
// categoria per come è impostato: consenti per ogni categoria di decidere
// l'ordine delle sezioni da pubblicare».
//
// La prima metà funzionava già: la composizione ordina per `ordine`. La seconda
// no — `SezioneCategoria` si leggeva e basta, e l'ordine era quello lasciato
// dagli import. Questa pagina è il posto dove si decide.
//
// ⚠️ La regola dei siti è la stessa del modulo e della composizione, scritta in
// `sezioniDelSito`: **se un negozio ha le sue sezioni, le sue vincono; se non ne
// ha, valgono quelle comuni**. Non si sommano — sommandole, su Business Deluxy
// uscivano «Menù» e «Allergeni» due volte, cioè due tab doppie. Qui i due
// gruppi si mostrano separati, con scritto chi vince.
export default async function SezioniPage({
  searchParams,
}: {
  searchParams: Promise<{ esito?: string; messaggio?: string }>;
}) {
  const sp = await searchParams;
  const [sezioni, categorie, negozi, conteggi] = await Promise.all([
    prisma.sezioneCategoria.findMany({ orderBy: [{ categoria: "asc" }, { ordine: "asc" }, { nome: "asc" }] }),
    elencoCategorie(),
    negoziAttivi(),
    prisma.prodotto.groupBy({ by: ["categoria"], _count: true }),
  ]);

  const nomeCategoria = new Map(categorie.map((c) => [c.chiave, c.nome]));
  const quanti = new Map(conteggi.map((c) => [c.categoria, c._count]));

  // I gruppi: una categoria «comune», più una per ogni negozio che ha le sue.
  type Gruppo = { chiave: string; categoria: string; negozio: string | null; righe: typeof sezioni };
  const gruppi: Gruppo[] = [];
  for (const categoria of [...new Set(sezioni.map((s) => s.categoria))].sort()) {
    const sue = sezioni.filter((s) => s.categoria === categoria);
    const comuni = sue.filter((s) => !s.negozio);
    if (comuni.length) gruppi.push({ chiave: `${categoria}|`, categoria, negozio: null, righe: comuni });
    for (const n of [...new Set(sue.map((s) => s.negozio).filter(Boolean))].sort()) {
      gruppi.push({ chiave: `${categoria}|${n}`, categoria, negozio: n as string, righe: sue.filter((s) => s.negozio === n) });
    }
  }

  return (
    <div className="layout">
      <Sidebar attiva="sezioni" />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Sezioni della scheda</h1>
            <p className="page-sub">
              Ogni sezione diventa una <b>tab</b> sulla scheda del prodotto, e l&apos;ordine di questa
              lista è l&apos;ordine delle tab che vede il cliente. Se un negozio ha le sue sezioni
              vincono le sue; se non ne ha, valgono quelle comuni — non si sommano.
            </p>
          </div>
        </div>

        {sp.esito === "no" && <div className="avviso-errore">{sp.messaggio}</div>}
        {sp.esito === "ok" && (
          <div className="nota-info">
            <span className="nota-icona">✓</span>
            <span>{sp.messaggio ?? "Salvato."}</span>
          </div>
        )}

        <div className="scheda">
          <div className="scheda-titolo">Aggiungi una sezione</div>
          <form action={aggiungiSezioneAzione} className="sezioni-aggiungi">
            <select name="categoria" required defaultValue="">
              <option value="" disabled>
                Categoria…
              </option>
              {[...new Set(categorie.map((c) => c.chiave))].sort().map((c) => (
                <option key={c} value={c}>
                  {nomeCategoria.get(c) ?? c}
                </option>
              ))}
            </select>
            <select name="negozio" defaultValue="">
              <option value="">Tutti i siti</option>
              {negozi.map((n) => (
                <option key={n.nome} value={n.nome}>
                  Solo {n.nome}
                </option>
              ))}
            </select>
            <input name="nome" placeholder="Nome della tab: «Ingredienti e Allergeni»" required />
            <select name="tipo" defaultValue="testo">
              <option value="testo">testo — un paragrafo</option>
              <option value="elenco">elenco — una voce per riga</option>
              <option value="coppie">coppie — «Nome: valore», il nome in grassetto</option>
            </select>
            <button type="submit" className="btn">
              Aggiungi
            </button>
          </form>
          <span className="cella-sub">
            Una sezione nuova nasce <b>in fondo</b>: non scavalca le tab che il cliente già vede.
          </span>
        </div>

        {gruppi.map((g) => (
          <div className="scheda" key={g.chiave}>
            <div className="scheda-titolo">
              {nomeCategoria.get(g.categoria) ?? g.categoria}
              {g.negozio ? <> · solo {g.negozio}</> : <> · tutti i siti</>}
            </div>
            <p className="cella-sub">
              {g.negozio ? (
                <>
                  Queste vincono su {g.negozio}: là le sezioni comuni di questa categoria non si scrivono.
                </>
              ) : (
                <>Valgono su ogni sito che non abbia le sue.</>
              )}
              {" "}
              {quanti.get(g.categoria) ? `${quanti.get(g.categoria)} prodotti in questa categoria.` : "Nessun prodotto in questa categoria."}
            </p>

            <OrdineSezioni
              righe={g.righe.map((s) => ({ id: s.id, nome: s.nome, tipo: s.tipo, attiva: s.attiva }))}
              azione={salvaOrdineSezioniAzione}
            />

            <div className="sezioni-azioni">
              {g.righe.map((s) => (
                <div className="sezioni-riga-azioni" key={s.id}>
                  <span className="sezioni-nome">{s.nome}</span>
                  <form action={cambiaTipoSezioneAzione}>
                    <input type="hidden" name="id" value={s.id} />
                    <select name="tipo" defaultValue={s.tipo}>
                      <option value="testo">testo</option>
                      <option value="elenco">elenco</option>
                      <option value="coppie">coppie</option>
                    </select>
                    <button type="submit" className="btn btn-secondario">
                      Cambia
                    </button>
                  </form>
                  <form action={cambiaAttivaSezioneAzione}>
                    <input type="hidden" name="id" value={s.id} />
                    <button type="submit" className="btn btn-secondario">
                      {s.attiva ? "Spegni" : "Riaccendi"}
                    </button>
                  </form>
                </div>
              ))}
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}
