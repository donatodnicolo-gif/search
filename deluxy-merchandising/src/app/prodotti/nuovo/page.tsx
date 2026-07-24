import { Sidebar } from "@/components/Sidebar";
import { prisma } from "@/lib/db";
import { creaProdotto } from "@/lib/azioni";
import { CATEGORIE, ETICHETTA_CATEGORIA, ETICHETTA_FASE, FASI_PLM } from "@/lib/dominio";

export const dynamic = "force-dynamic";

export default async function NuovoProdottoPage() {
  const collezioni = await prisma.collezione.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true } });

  return (
    <div className="layout">
      <Sidebar attiva="prodotti" />
      <main className="main" style={{ maxWidth: 860 }}>
        <a className="ritorno" href="/prodotti">← Prodotti</a>
        <div className="page-head">
          <h1 className="page-title">Nuovo prodotto</h1>
        </div>

        <form action={creaProdotto}>
          <div className="scheda">
            <div className="scheda-titolo">Anagrafica</div>
            <div className="modulo">
              <div className="campo-modulo largo">
                <label>Nome <span className="obbligatorio">*</span></label>
                <input name="nome" required placeholder="Es. Bouquet Ora Blu" />
              </div>
              <div className="campo-modulo">
                <label>Codice / SKU</label>
                <input name="codice" placeholder="Auto se vuoto (es. FN-26-001)" />
              </div>
              <div className="campo-modulo">
                <label>Collezione</label>
                <select name="collezioneId" defaultValue="">
                  <option value="">— Nessuna —</option>
                  {collezioni.map((c) => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </select>
              </div>
              <div className="campo-modulo">
                <label>Categoria</label>
                <select name="categoria" defaultValue="BOUQUET">
                  {CATEGORIE.map((c) => (
                    <option key={c} value={c}>{ETICHETTA_CATEGORIA[c]}</option>
                  ))}
                </select>
              </div>
              <div className="campo-modulo">
                <label>Fase iniziale</label>
                <select name="fase" defaultValue="concept">
                  {FASI_PLM.map((f) => (
                    <option key={f} value={f}>{ETICHETTA_FASE[f]}</option>
                  ))}
                </select>
              </div>
              <div className="campo-modulo largo">
                <label>Descrizione</label>
                <textarea name="descrizione" rows={2} placeholder="Descrizione commerciale" />
              </div>
            </div>
          </div>

          <div className="scheda">
            <div className="scheda-titolo">Scheda creativa</div>
            <div className="modulo">
              <div className="campo-modulo largo">
                <label>Brief</label>
                <textarea name="brief" rows={2} placeholder="Il concept del prodotto" />
              </div>
              <div className="campo-modulo">
                <label>Materiali / fiori</label>
                <input name="materiali" placeholder="Anemoni, ranuncoli, foglia oro" />
              </div>
              <div className="campo-modulo">
                <label>Palette</label>
                <input name="palette" placeholder="Indaco · avorio · oro" />
              </div>
              <div className="campo-modulo largo">
                <label>Immagine (URL)</label>
                <input name="immagine" placeholder="https://…" />
              </div>
            </div>
          </div>

          <div className="scheda">
            <div className="scheda-titolo">Costi & prezzo</div>
            <div className="modulo">
              <div className="campo-modulo">
                <label>Costo di produzione (€)</label>
                <input name="costoProduzione" type="number" step="0.01" min="0" defaultValue="0" />
              </div>
              <div className="campo-modulo">
                <label>Prezzo di vendita (€)</label>
                <input name="prezzoVendita" type="number" step="0.01" min="0" defaultValue="0" />
              </div>
            </div>
          </div>

          <div className="azioni-modulo">
            <a className="btn btn-secondario" href="/prodotti">Annulla</a>
            <button type="submit" className="btn">Crea prodotto</button>
          </div>
        </form>
      </main>
    </div>
  );
}
