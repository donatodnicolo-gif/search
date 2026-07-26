import Link from "next/link";
import { prisma } from "@/lib/db";
import { CATEGORIE, coloreCategoria, nomeCategoria } from "@/lib/categorie";
import { riepilogoCategorie, titoliNonClassificati } from "@/lib/categorie-ai";
import { aiConfigurata, modelloAI } from "@/lib/ai";
import { chiediCategorieAI, confermaCategoriaProdotto, impostaCategoriaProdotto } from "@/app/actions";

export const dynamic = "force-dynamic";

// Categorie dei prodotti: dove l'AI propone e una persona decide.
//
// Il problema è vero e misurabile: i prodotti più venduti si chiamano
// «Botticelli - Nascita di Venere» o «Favolosa», e nessuna regola a parole può
// indovinarli. L'AI guarda nome, negozio e prezzo e propone; qui si vede cosa
// ha proposto, **con il motivo**, e si corregge in un clic.
export default async function Categorie({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;

  const [riepilogo, proposte, daFare] = await Promise.all([
    riepilogoCategorie(),
    prisma.categoriaProdotto.findMany({ orderBy: [{ righe: "desc" }, { titolo: "asc" }], take: 300 }),
    titoliNonClassificati(60),
  ]);

  const copertura = riepilogo.righeTotali
    ? Math.round(((riepilogo.righeTotali - riepilogo.righeNonClassificate) / riepilogo.righeTotali) * 100)
    : 0;

  const opzioni = (
    <>
      <option value="">— nessuna decisione mia —</option>
      {CATEGORIE.map((c) => (
        <option key={c.chiave} value={c.chiave}>{c.nome}</option>
      ))}
    </>
  );

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1 className="page-title">Categorie dei prodotti</h1>
          <p className="page-sub">
            Di cosa è fatto un ordine — e quindi cosa piace a un cliente. Le parole del titolo
            riconoscono la maggior parte dei prodotti; per gli altri <strong>l&apos;AI propone</strong> e
            tu decidi.
          </p>
        </div>
        {aiConfigurata() && daFare.length > 0 && (
          <form action={chiediCategorieAI}>
            <input type="hidden" name="quanti" value="120" />
            <button className="btn" type="submit">Chiedi all&apos;AI ({daFare.length >= 60 ? "120" : daFare.length})</button>
          </form>
        )}
      </div>

      {sp.esito && <div className="avviso-ok">{sp.esito}</div>}
      {sp.errore && <div className="avviso-errore">{sp.errore}</div>}
      {!aiConfigurata() && (
        <div className="avviso-errore">
          L&apos;AI non è configurata: manca <code className="inline">OPENAI_API_KEY</code> (in locale
          nel <code className="inline">.env</code>, in produzione fra le variabili del progetto
          Vercel). Le regole a parole e le decisioni manuali funzionano lo stesso.
        </div>
      )}

      <div className="kpi-riga">
        <div className="kpi">
          <div className="kpi-valore">{copertura}%</div>
          <div className="kpi-etichetta">Righe d&apos;ordine classificate</div>
        </div>
        <div className="kpi">
          <div className="kpi-valore">{riepilogo.titoliNonClassificati.toLocaleString("it-IT")}</div>
          <div className="kpi-etichetta">Prodotti ancora senza categoria</div>
        </div>
        <div className="kpi">
          <div className="kpi-valore">{riepilogo.daAI.toLocaleString("it-IT")}</div>
          <div className="kpi-etichetta">Proposti dall&apos;AI</div>
        </div>
        <div className="kpi">
          <div className="kpi-valore">{riepilogo.daPersona.toLocaleString("it-IT")}</div>
          <div className="kpi-etichetta">Decisi da una persona</div>
        </div>
      </div>

      <div className="consiglio" style={{ ["--lista" as string]: "var(--gold)" }}>
        <span className="consiglio-titolo">Chi decide cosa</span>
        In ordine: <strong>quello che scrivi tu</strong>, poi le <strong>parole del titolo</strong>{" "}
        (deterministiche, si leggono in <code className="inline">src/lib/categorie.ts</code>), poi la{" "}
        <strong>proposta dell&apos;AI</strong> sul singolo prodotto, poi la{" "}
        <strong>specialità del negozio</strong>, e infine «non classificato» — che è una risposta
        onesta. L&apos;AI usa <code className="inline">{modelloAI()}</code>, vede solo nome, negozio e
        prezzo, e <strong>non può inventare categorie</strong>: una risposta fuori elenco viene
        buttata.
      </div>

      {/* ---- Cosa ha proposto l'AI ---- */}
      <div className="scheda">
        <div className="scheda-titolo">Prodotti classificati ({proposte.length})</div>
        {proposte.length === 0 ? (
          <p className="testo-guida">
            Ancora niente. Premi «Chiedi all&apos;AI» qui sopra, oppure classifica a mano i prodotti
            dell&apos;elenco più in basso.
          </p>
        ) : (
          <div className="tabella-wrap">
            <table>
              <thead>
                <tr>
                  <th>Prodotto</th>
                  <th>Categoria</th>
                  <th>Da dove</th>
                  <th>Perché</th>
                  <th className="num">Righe</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {proposte.map((p) => (
                  <tr key={p.id}>
                    <td className="cella-nome">{p.titolo}</td>
                    <td>
                      <span className="tag" style={{ color: coloreCategoria(p.categoria) }}>
                        <span className="dot" />
                        <span className="tag-label">{nomeCategoria(p.categoria)}</span>
                      </span>
                    </td>
                    <td>
                      <span
                        className="badge"
                        style={{ color: p.origine === "manuale" ? "var(--green)" : "var(--blue)" }}
                      >
                        <span className="dot" />
                        {p.origine === "manuale" ? "persona" : "AI"}
                      </span>
                    </td>
                    <td className="cella-muta" style={{ maxWidth: 320 }}>{p.motivo ?? "—"}</td>
                    <td className="cella-num">{p.righe.toLocaleString("it-IT")}</td>
                    <td>
                      <form action={impostaCategoriaProdotto} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <input type="hidden" name="titolo" value={p.titolo} />
                        <select name="categoria" defaultValue={p.categoria} style={{ fontSize: 12 }}>
                          {opzioni}
                        </select>
                        <button className="btn btn-secondario small" type="submit">Correggi</button>
                      </form>
                      {p.origine === "ai" && (
                        <form action={confermaCategoriaProdotto} style={{ marginTop: 4 }}>
                          <input type="hidden" name="titolo" value={p.titolo} />
                          <button className="btn btn-secondario small" type="submit">✓ è giusta</button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ---- Cosa resta da classificare ---- */}
      <div className="scheda">
        <div className="scheda-titolo">
          Ancora da classificare — i {daFare.length} che pesano di più
        </div>
        {daFare.length === 0 ? (
          <p className="testo-guida">Niente da fare: ogni prodotto venduto ha una categoria.</p>
        ) : (
          <div className="tabella-wrap">
            <table>
              <thead>
                <tr>
                  <th>Prodotto</th>
                  <th>Negozio</th>
                  <th className="num">Prezzo medio</th>
                  <th className="num">Righe</th>
                  <th>Decidi tu</th>
                </tr>
              </thead>
              <tbody>
                {daFare.map((t) => (
                  <tr key={t.titolo}>
                    <td className="cella-nome">{t.titolo}</td>
                    <td className="cella-muta">{t.brand}</td>
                    <td className="cella-num">{Math.round(t.prezzoMedio || 0)} €</td>
                    <td className="cella-num">{t.righe.toLocaleString("it-IT")}</td>
                    <td>
                      <form action={impostaCategoriaProdotto} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <input type="hidden" name="titolo" value={t.titolo} />
                        <select name="categoria" defaultValue="" style={{ fontSize: 12 }}>{opzioni}</select>
                        <button className="btn btn-secondario small" type="submit">Salva</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="testo-guida" style={{ marginTop: 10 }}>
          Un prodotto senza categoria non è un errore: è un buco dichiarato. Finché resta lì, quel
          cliente non risulta «amante» di niente per colpa di quel prodotto — e questo è meglio che
          farlo risultare amante della cosa sbagliata. La specialità di ogni negozio si imposta in{" "}
          <Link href="/impostazioni" className="ritorno">Impostazioni</Link>.
        </p>
      </div>
    </main>
  );
}
