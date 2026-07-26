"use client";

// Form "Nuovo prodotto su Shopify", modellato su quello reale di app.deluxy.it
// (sezioni DETTAGLI · INVENTORY · SHOPIFY CONNECTION · VARIANTI · CAMPI EXTRA)
// e tradotto sui campi che Shopify capisce davvero.
//
// Come nell'app reale, le sezioni si aprono col flag: le varianti compaiono
// solo se il prodotto ne ha, la giacenza solo se si controlla lo stock. Lo SKU
// è generato (DXY-NNNNN) ma resta modificabile, come là.

import { useRef, useState } from "react";

export type NegozioScelta = { id: string; nome: string; dominio: string; puoScrivere: boolean };

type Variante = { nome: string; sku: string; prezzo: string; prezzoConfronto: string; giacenza: string };

const varianteVuota = (): Variante => ({ nome: "", sku: "", prezzo: "", prezzoConfronto: "", giacenza: "0" });

function skuGenerato(): string {
  return `DXY-${Math.floor(10000 + Math.random() * 89999)}`;
}

export function FormProdottoShopify({
  negozi,
  azione,
  categorie,
  aiPronta,
}: {
  negozi: NegozioScelta[];
  azione: (fd: FormData) => void;
  categorie: { chiave: string; nome: string; conPrompt: boolean }[];
  aiPronta: boolean;
}) {
  const [haVarianti, setHaVarianti] = useState(false);
  const [varianti, setVarianti] = useState<Variante[]>([varianteVuota()]);
  const [fisico, setFisico] = useState(true);
  const [controllaStock, setControllaStock] = useState(false);
  const [extra, setExtra] = useState<{ chiave: string; valore: string }[]>([]);
  const [sku] = useState(skuGenerato);
  const form = useRef<HTMLFormElement>(null);

  // — Scrittura AI della descrizione (stessa modalità dell'app reale: il prompt
  //   vive sulla categoria, qui si sceglie solo il tono) —
  const [categoria, setCategoria] = useState("");
  const [tono, setTono] = useState("maison");
  const [descrizione, setDescrizione] = useState("");
  const [scrivendo, setScrivendo] = useState(false);
  const [erroreAi, setErroreAi] = useState<string | null>(null);

  async function scriviConAI() {
    setErroreAi(null);
    setScrivendo(true);
    try {
      // Il form si prende dal ref, non con querySelector("form"): in pagina il
      // primo form è il selettore d'ambito nella barra in alto, e leggere lì
      // dava un prodotto senza nome.
      const modulo = form.current;
      const leggi = (n: string) => (modulo?.elements.namedItem(n) as HTMLInputElement | null)?.value ?? "";
      const res = await fetch("/api/ai/descrizione", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: leggi("titolo"),
          categoria,
          tipo: leggi("tipo"),
          materiali: leggi("linea"),
          prezzo: leggi("prezzo"),
          varianti: haVarianti ? varianti.map((v) => v.nome).filter(Boolean) : [],
          tono,
        }),
      });
      const dati = await res.json();
      if (!dati.ok) {
        setErroreAi(dati.errore ?? "La generazione non è riuscita.");
        return;
      }
      const punti = (dati.punti as string[]).map((p) => `• ${p}`).join("\n");
      setDescrizione([dati.claim, "", dati.descrizione, punti ? `\n${punti}` : ""].filter(Boolean).join("\n").trim());
    } catch {
      setErroreAi("Non sono riuscito a contattare il servizio di scrittura.");
    } finally {
      setScrivendo(false);
    }
  }

  const utilizzabili = negozi.filter((n) => n.puoScrivere);

  const aggiornaVariante = (i: number, campo: keyof Variante, valore: string) =>
    setVarianti((v) => v.map((x, j) => (j === i ? { ...x, [campo]: valore } : x)));

  return (
    <form action={azione} ref={form}>
      <input type="hidden" name="variantiJson" value={JSON.stringify(haVarianti ? varianti : [])} />
      <input type="hidden" name="extraJson" value={JSON.stringify(extra.filter((e) => e.chiave.trim()))} />

      {/* ---------- Dettagli ---------- */}
      <div className="scheda">
        <div className="scheda-titolo">Dettagli</div>
        <div className="modulo">
          <div className="campo-modulo largo">
            <label htmlFor="titolo">Nome del prodotto <span className="obbligatorio">*</span></label>
            <input id="titolo" name="titolo" required placeholder="Bouquet Ora Blu" />
          </div>
          <div className="campo-modulo">
            <label htmlFor="tipo">Categoria su Shopify</label>
            <input id="tipo" name="tipo" placeholder="Fiori, Torte, Box regalo…" />
          </div>
          <div className="campo-modulo">
            <label htmlFor="categoria">Categoria Deluxy (guida la scrittura AI)</label>
            <select id="categoria" name="categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              <option value="">— Nessuna —</option>
              {categorie.map((c) => (
                <option key={c.chiave} value={c.chiave}>
                  {c.nome}
                  {c.conPrompt ? " · ha un prompt" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="campo-modulo">
            <label htmlFor="vendor">Partner / vendor</label>
            <input id="vendor" name="vendor" placeholder="Chi produce o fornisce" />
          </div>
          <div className="campo-modulo">
            <label htmlFor="sku">SKU</label>
            <input id="sku" name="sku" defaultValue={sku} />
          </div>
          <div className="campo-modulo">
            <label htmlFor="linea">Linea ed etichette</label>
            <input id="linea" name="linea" placeholder="Ora Blu; SS26; gifting" />
          </div>
          <div className="campo-modulo">
            <label htmlFor="prezzo">Prezzo</label>
            <input id="prezzo" name="prezzo" inputMode="decimal" placeholder="95,00" />
          </div>
          <div className="campo-modulo">
            <label htmlFor="prezzoConfronto">Prezzo pieno (barrato)</label>
            <input id="prezzoConfronto" name="prezzoConfronto" inputMode="decimal" placeholder="120,00" />
          </div>
          <div className="campo-modulo largo">
            <label htmlFor="descrizione">Descrizione</label>
            <div className="riga-ai">
              <select value={tono} onChange={(e) => setTono(e.target.value)} aria-label="Tono della descrizione">
                <option value="maison">Tono maison</option>
                <option value="caldo">Tono caldo</option>
                <option value="essenziale">Tono essenziale</option>
              </select>
              <button
                type="button"
                className="btn btn-secondario small"
                onClick={scriviConAI}
                disabled={scrivendo || !aiPronta}
                title={aiPronta ? "Scrive una proposta partendo dai dati del prodotto" : "Manca la chiave OpenAI"}
              >
                {scrivendo ? "Sto scrivendo…" : "✦ Scrivi con l'AI"}
              </button>
              {descrizione && !scrivendo && (
                <button type="button" className="btn btn-secondario small" onClick={scriviConAI}>
                  Riscrivi
                </button>
              )}
            </div>
            <textarea
              id="descrizione"
              name="descrizione"
              rows={descrizione ? 10 : 4}
              value={descrizione}
              onChange={(e) => setDescrizione(e.target.value)}
              placeholder="Il testo che il cliente legge sulla scheda del sito. Puoi scriverlo tu o farlo proporre all'AI."
            />
            {erroreAi && <div className="avviso-errore" style={{ marginTop: 8 }}>{erroreAi}</div>}
            {!aiPronta && (
              <p className="cella-sub" style={{ marginTop: 6 }}>
                Per accendere la scrittura AI serve la chiave OpenAI, si imposta in Negozi &amp; permessi.
              </p>
            )}
            {aiPronta && (
              <p className="cella-sub" style={{ marginTop: 6 }}>
                L&apos;AI usa solo i dati che hai messo qui — nome, categoria, linea, prezzo, varianti — più il
                prompt della categoria. Quello che non le dici non se lo inventa: rileggi sempre prima di
                salvare.
              </p>
            )}
          </div>
          <div className="campo-modulo largo">
            <label htmlFor="immagini">Immagini (un URL per riga, la prima è la principale)</label>
            <textarea id="immagini" name="immagini" rows={3} placeholder="https://…/still-life.jpg" />
          </div>
        </div>
      </div>

      {/* ---------- Magazzino ---------- */}
      <div className="scheda">
        <div className="scheda-titolo">Magazzino</div>
        <div className="pill-scelta" style={{ marginBottom: 14 }}>
          <label className="pill-opt" style={{ cursor: "pointer" }}>
            <input type="checkbox" name="fisico" checked={fisico} onChange={(e) => setFisico(e.target.checked)} />
            Prodotto fisico (si spedisce e si conta)
          </label>
          {fisico && (
            <label className="pill-opt" style={{ cursor: "pointer" }}>
              <input
                type="checkbox"
                name="controllaStock"
                checked={controllaStock}
                onChange={(e) => setControllaStock(e.target.checked)}
              />
              Controlla la giacenza
            </label>
          )}
        </div>
        {!fisico && (
          <p className="page-sub">
            «Non fisico» è il <i>Not physical</i> dell&apos;app reale: niente spedizione e niente stock, nemmeno su
            Shopify. Serve per servizi e personalizzazioni.
          </p>
        )}
        {fisico && controllaStock && !haVarianti && (
          <div className="modulo">
            <div className="campo-modulo">
              <label htmlFor="giacenza">Giacenza iniziale</label>
              <input id="giacenza" name="giacenza" type="number" min={0} defaultValue={0} />
            </div>
          </div>
        )}
      </div>

      {/* ---------- Varianti ---------- */}
      <div className="scheda">
        <div className="scheda-titolo">Varianti</div>
        <div className="pill-scelta" style={{ marginBottom: 14 }}>
          <label className="pill-opt" style={{ cursor: "pointer" }}>
            <input type="checkbox" checked={haVarianti} onChange={(e) => setHaVarianti(e.target.checked)} />
            Il prodotto ha varianti (formati, misure, colori)
          </label>
        </div>

        {haVarianti && (
          <>
            <div className="modulo">
              <div className="campo-modulo">
                <label htmlFor="nomeOpzione">Nome dell&apos;opzione</label>
                <input id="nomeOpzione" name="nomeOpzione" defaultValue="Formato" />
              </div>
            </div>
            <div className="tabella-wrap" style={{ marginTop: 12 }}>
              <table>
                <thead>
                  <tr>
                    <th>Variante *</th>
                    <th>SKU *</th>
                    <th className="num">Prezzo</th>
                    <th className="num">Prezzo pieno</th>
                    {controllaStock && fisico && <th className="num">Giacenza</th>}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {varianti.map((v, i) => (
                    <tr key={i}>
                      <td>
                        <input
                          value={v.nome}
                          onChange={(e) => aggiornaVariante(i, "nome", e.target.value)}
                          placeholder="Medium"
                          aria-label={`Nome variante ${i + 1}`}
                        />
                      </td>
                      <td>
                        <input
                          value={v.sku}
                          onChange={(e) => aggiornaVariante(i, "sku", e.target.value)}
                          placeholder={`${sku}-${i + 1}`}
                          aria-label={`SKU variante ${i + 1}`}
                        />
                      </td>
                      <td>
                        <input
                          value={v.prezzo}
                          onChange={(e) => aggiornaVariante(i, "prezzo", e.target.value)}
                          inputMode="decimal"
                          className="num"
                          aria-label={`Prezzo variante ${i + 1}`}
                        />
                      </td>
                      <td>
                        <input
                          value={v.prezzoConfronto}
                          onChange={(e) => aggiornaVariante(i, "prezzoConfronto", e.target.value)}
                          inputMode="decimal"
                          className="num"
                          aria-label={`Prezzo pieno variante ${i + 1}`}
                        />
                      </td>
                      {controllaStock && fisico && (
                        <td>
                          <input
                            value={v.giacenza}
                            onChange={(e) => aggiornaVariante(i, "giacenza", e.target.value)}
                            type="number"
                            min={0}
                            className="num"
                            aria-label={`Giacenza variante ${i + 1}`}
                          />
                        </td>
                      )}
                      <td>
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={() => setVarianti((x) => x.filter((_, j) => j !== i))}
                          disabled={varianti.length === 1}
                          title="Togli questa variante"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              className="btn btn-secondario small"
              style={{ marginTop: 12 }}
              onClick={() => setVarianti((v) => [...v, varianteVuota()])}
            >
              Aggiungi variante
            </button>
          </>
        )}
      </div>

      {/* ---------- Campi extra (metafield) ---------- */}
      <div className="scheda">
        <div className="scheda-titolo">Campi extra</div>
        <p className="page-sub" style={{ marginBottom: 12 }}>
          Diventano <b>metafield</b> Shopify nel namespace <code>deluxy</code>: sono i «campi obbligatori» del
          form reale, ma leggibili anche dal tema del sito.
        </p>
        {extra.map((e, i) => (
          <div className="modulo" key={i} style={{ marginBottom: 8 }}>
            <div className="campo-modulo">
              <label>Nome del campo</label>
              <input
                value={e.chiave}
                onChange={(ev) => setExtra((x) => x.map((y, j) => (j === i ? { ...y, chiave: ev.target.value } : y)))}
                placeholder="materiali"
              />
            </div>
            <div className="campo-modulo">
              <label>Valore</label>
              <input
                value={e.valore}
                onChange={(ev) => setExtra((x) => x.map((y, j) => (j === i ? { ...y, valore: ev.target.value } : y)))}
                placeholder="Anemoni, ranuncoli, eucalipto"
              />
            </div>
          </div>
        ))}
        <button
          type="button"
          className="btn btn-secondario small"
          onClick={() => setExtra((x) => [...x, { chiave: "", valore: "" }])}
        >
          Aggiungi campo
        </button>
      </div>

      {/* ---------- Pubblicazione ---------- */}
      <div className="scheda">
        <div className="scheda-titolo">Dove e come pubblicarlo</div>
        <div className="modulo">
          <div className="campo-modulo">
            <label htmlFor="negozioId">Negozio <span className="obbligatorio">*</span></label>
            <select id="negozioId" name="negozioId" required disabled={utilizzabili.length === 0}>
              {utilizzabili.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.nome} — {n.dominio}
                </option>
              ))}
              {utilizzabili.length === 0 && <option value="">Nessun negozio con permesso di scrittura</option>}
            </select>
          </div>
          <div className="campo-modulo">
            <label htmlFor="stato">Stato su Shopify</label>
            <select id="stato" name="stato" defaultValue="DRAFT">
              <option value="DRAFT">Bozza — non visibile sul sito</option>
              <option value="ACTIVE">Attivo — in vendita</option>
            </select>
          </div>
        </div>
        <div className="azioni-modulo" style={{ marginTop: 14 }}>
          <button className="btn" type="submit" disabled={utilizzabili.length === 0}>
            Crea su Shopify
          </button>
        </div>
        <p className="page-sub" style={{ marginTop: 10 }}>
          Il prodotto viene creato <b>anche qui</b> in Merchandising, già collegato a quello Shopify: da lì
          gestisci costi, margini e collezioni. Nasce come <b>bozza</b> se lasci lo stato su bozza — così puoi
          rivederlo sul negozio prima di metterlo in vetrina.
        </p>
      </div>
    </form>
  );
}
