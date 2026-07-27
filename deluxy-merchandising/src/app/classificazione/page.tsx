import Link from "next/link";
import { Badge } from "@/components/Badge";
import { Sidebar } from "@/components/Sidebar";
import {
  eliminaCategoriaAzione,
  eliminaLineaAzione,
  salvaCategoriaAzione,
  salvaCollezioneAzione,
  salvaLineaAzione,
} from "@/lib/azioni-classificazione";
import { elencoCategorie, elencoLinee } from "@/lib/classificazione";
import { prisma } from "@/lib/db";
import { etichettaStagione, STAGIONI } from "@/lib/dominio";

export const dynamic = "force-dynamic";

// Il vocabolario con cui Deluxy classifica i suoi prodotti: categorie, linee e
// collezioni, decise qui e non ereditate dai negozi. Ogni voce ha una
// descrizione, che serve alla persona e all'AI: è il testo con cui il modello
// capisce dove va un prodotto importato, invece di indovinare dal nome.
export default async function ClassificazionePage({
  searchParams,
}: {
  searchParams: Promise<{ esito?: string; messaggio?: string }>;
}) {
  const sp = await searchParams;
  const [categorie, linee, collezioni, senzaCategoria] = await Promise.all([
    elencoCategorie(),
    elencoLinee(),
    prisma.collezione.findMany({
      orderBy: [{ anno: "desc" }, { nome: "asc" }],
      include: { _count: { select: { prodotti: true } } },
    }),
    prisma.prodotto.count({ where: { categoria: "DA_CLASSIFICARE" } }),
  ]);

  return (
    <div className="layout">
      <Sidebar attiva="classificazione" />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Categorie, linee e collezioni</h1>
            <p className="page-sub">
              Il vocabolario con cui Deluxy classifica i suoi prodotti. Ogni voce ha una <b>descrizione</b>: la
              legge chi classifica a mano e la legge l&apos;<b>AI</b>, che con quella capisce dove va un
              prodotto arrivato dai negozi — dove la stessa cosa si chiama «Fiori», «Rose» o «Bouquet».
            </p>
          </div>
        </div>

        {sp.esito === "errore" && <div className="avviso-errore">{sp.messaggio}</div>}
        {sp.esito && sp.esito !== "errore" && (
          <div className="nota-info">
            <span className="nota-icona">✓</span>
            <span>{sp.messaggio ?? "Salvato."}</span>
          </div>
        )}

        {senzaCategoria > 0 && (
          <div className="nota-info">
            <span className="nota-icona">◆</span>
            <span>
              <b>{senzaCategoria} prodotti</b> sono ancora «Da classificare». Più le descrizioni qui sotto sono
              precise, più l&apos;AI potrà proporre dove metterli: scrivi cosa ci va dentro <i>e cosa no</i>.{" "}
              <Link href="/anagrafica?manca=categoria">Vedili in anagrafica</Link>.
            </span>
          </div>
        )}

        {/* ---------- Categorie ---------- */}
        <div className="scheda">
          <div className="scheda-titolo">Categorie di prodotto · {categorie.length}</div>
          <div className="tabella-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 180 }}>Nome</th>
                  <th>Descrizione — cosa ci va dentro</th>
                  <th className="num">Ordine</th>
                  <th className="num">Prodotti</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {categorie.map((c) => (
                  <tr key={c.chiave}>
                    <td colSpan={5} style={{ padding: 0 }}>
                      <form action={salvaCategoriaAzione} className="riga-modifica">
                        <input type="hidden" name="chiave" value={c.chiave} />
                        <div className="rm-nome">
                          <input name="nome" defaultValue={c.nome} aria-label={`Nome di ${c.nome}`} />
                          <div className="cella-sub">{c.chiave}</div>
                        </div>
                        <textarea
                          name="descrizione"
                          rows={2}
                          defaultValue={c.descrizione ?? ""}
                          placeholder="Es. fiori recisi composti a mano; NON le composizioni in vaso."
                          aria-label={`Descrizione di ${c.nome}`}
                        />
                        <input
                          name="ordine"
                          type="number"
                          defaultValue={c.ordine}
                          className="rm-ordine num"
                          aria-label="Ordine"
                        />
                        <span className="rm-conta">{c.prodotti}</span>
                        <label className="rm-attiva">
                          <input type="checkbox" name="attiva" defaultChecked={c.attiva} /> attiva
                        </label>
                        <button className="btn small" type="submit">
                          Salva
                        </button>
                      </form>
                      {c.prodotti === 0 && (
                        <form action={eliminaCategoriaAzione.bind(null, c.chiave)} className="rm-elimina">
                          <button className="btn btn-secondario small" type="submit">
                            Elimina
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <form action={salvaCategoriaAzione} className="modulo" style={{ marginTop: 16 }}>
            <div className="campo-modulo">
              <label htmlFor="cat-nome">Nuova categoria</label>
              <input id="cat-nome" name="nome" placeholder="Es. Piante rare" required />
            </div>
            <div className="campo-modulo">
              <label htmlFor="cat-ordine">Ordine</label>
              <input id="cat-ordine" name="ordine" type="number" defaultValue={categorie.length} />
            </div>
            <div className="campo-modulo largo">
              <label htmlFor="cat-descr">Descrizione per la classificazione</label>
              <textarea id="cat-descr" name="descrizione" rows={2} placeholder="Che cosa ci va dentro e cosa no." />
            </div>
            <div className="azioni-modulo">
              <input type="hidden" name="attiva" value="1" />
              <button className="btn" type="submit">
                Aggiungi categoria
              </button>
            </div>
          </form>
        </div>

        {/* ---------- Linee ---------- */}
        <div className="scheda">
          <div className="scheda-titolo">Linee di prodotto · {linee.length}</div>
          <p className="page-sub" style={{ marginBottom: 12 }}>
            La famiglia commerciale, trasversale alle stagioni: «Ora Blu», «Gifting», «B2B». Nell&apos;app reale
            è il campo <i>Linea</i>.
          </p>
          {linee.length > 0 && (
            <div className="tabella-wrap">
              <table>
                <tbody>
                  {linee.map((l) => (
                    <tr key={l.id}>
                      <td colSpan={5} style={{ padding: 0 }}>
                        <form action={salvaLineaAzione} className="riga-modifica">
                          <input type="hidden" name="id" value={l.id} />
                          <div className="rm-nome">
                            <input name="nome" defaultValue={l.nome} aria-label={`Nome di ${l.nome}`} />
                          </div>
                          <textarea
                            name="descrizione"
                            rows={2}
                            defaultValue={l.descrizione ?? ""}
                            placeholder="A chi parla questa linea, che cosa la distingue."
                            aria-label={`Descrizione di ${l.nome}`}
                          />
                          <input name="ordine" type="number" defaultValue={l.ordine} className="rm-ordine num" aria-label="Ordine" />
                          <span className="rm-conta">{l.prodotti}</span>
                          <label className="rm-attiva">
                            <input type="checkbox" name="attiva" defaultChecked={l.attiva} /> attiva
                          </label>
                          <button className="btn small" type="submit">
                            Salva
                          </button>
                        </form>
                        {l.prodotti === 0 && (
                          <form action={eliminaLineaAzione.bind(null, l.id)} className="rm-elimina">
                            <button className="btn btn-secondario small" type="submit">
                              Elimina
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <form action={salvaLineaAzione} className="modulo" style={{ marginTop: 16 }}>
            <div className="campo-modulo">
              <label htmlFor="lin-nome">Nuova linea</label>
              <input id="lin-nome" name="nome" placeholder="Es. Gifting aziendale" required />
            </div>
            <div className="campo-modulo">
              <label htmlFor="lin-ordine">Ordine</label>
              <input id="lin-ordine" name="ordine" type="number" defaultValue={linee.length} />
            </div>
            <div className="campo-modulo largo">
              <label htmlFor="lin-descr">Descrizione per la classificazione</label>
              <textarea id="lin-descr" name="descrizione" rows={2} placeholder="Che cosa distingue questa linea." />
            </div>
            <div className="azioni-modulo">
              <input type="hidden" name="attiva" value="1" />
              <button className="btn" type="submit">
                Aggiungi linea
              </button>
            </div>
          </form>
        </div>

        {/* ---------- Collezioni della maison ---------- */}
        <div className="scheda">
          <div className="scheda-titolo">Collezioni della maison · {collezioni.length}</div>
          <p className="page-sub" style={{ marginBottom: 12 }}>
            Quelle stagionali, nate qui. Da non confondere con le{" "}
            <Link href="/collezioni">collezioni Shopify</Link>, che sono la vetrina del sito e si importano.
          </p>
          {collezioni.length > 0 && (
            <div className="tabella-wrap">
              <table>
                <tbody>
                  {collezioni.map((c) => (
                    <tr key={c.id}>
                      <td colSpan={5} style={{ padding: 0 }}>
                        <form action={salvaCollezioneAzione} className="riga-modifica">
                          <input type="hidden" name="id" value={c.id} />
                          <div className="rm-nome">
                            <input name="nome" defaultValue={c.nome} aria-label={`Nome di ${c.nome}`} />
                            <div className="cella-sub">{etichettaStagione(c.stagione)}</div>
                          </div>
                          <textarea
                            name="descrizione"
                            rows={2}
                            defaultValue={c.descrizione ?? c.tema ?? ""}
                            placeholder="Il concept della collezione: serve anche all'AI per capire cosa ci sta dentro."
                            aria-label={`Descrizione di ${c.nome}`}
                          />
                          <select name="stagione" defaultValue={c.stagione} className="rm-ordine" aria-label="Stagione">
                            {STAGIONI.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                          <input name="anno" type="number" defaultValue={c.anno} className="rm-ordine num" aria-label="Anno" />
                          <span className="rm-conta">{c._count.prodotti}</span>
                          <button className="btn small" type="submit">
                            Salva
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <form action={salvaCollezioneAzione} className="modulo" style={{ marginTop: 16 }}>
            <div className="campo-modulo">
              <label htmlFor="col-nome">Nuova collezione</label>
              <input id="col-nome" name="nome" placeholder="Es. Fioritura Notturna" required />
            </div>
            <div className="campo-modulo">
              <label htmlFor="col-stagione">Stagione</label>
              <select id="col-stagione" name="stagione" defaultValue="SS26">
                {STAGIONI.map((s) => (
                  <option key={s} value={s}>
                    {etichettaStagione(s)}
                  </option>
                ))}
              </select>
            </div>
            <div className="campo-modulo largo">
              <label htmlFor="col-descr">Descrizione</label>
              <textarea id="col-descr" name="descrizione" rows={2} placeholder="Il concept, il mood, cosa ci sta dentro." />
            </div>
            <div className="azioni-modulo">
              <button className="btn" type="submit">
                Aggiungi collezione
              </button>
            </div>
          </form>
        </div>

        <div className="scheda">
          <div className="scheda-titolo">Perché le descrizioni contano</div>
          <p className="page-sub">
            Sono il vocabolario che diamo all&apos;AI. Quando le chiederemo di riconciliare i prodotti
            importati — 1.382 hanno ancora il tipo del negozio e non la nostra categoria — leggerà queste
            righe, non i nomi delle categorie: «Bouquet» da solo non dice se ci vanno anche le composizioni in
            vaso, la descrizione sì. E resta comunque una <b>proposta</b>: la classificazione la conferma una
            persona. <Badge testo="l'AI propone, non applica" colore="var(--gold-strong)" />
          </p>
        </div>
      </main>
    </div>
  );
}
