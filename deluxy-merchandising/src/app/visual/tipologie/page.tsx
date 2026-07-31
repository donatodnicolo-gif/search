import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { SelettoreCriteri } from "@/components/SelettoreCriteri";
import { prisma } from "@/lib/db";
import {
  descriviCriteri,
  filtroCriteri,
  parseCriteri,
  quantiCriteri,
  vociDisponibili,
} from "@/lib/criteri-tipologia";
import { etichettaRegola } from "@/lib/ordinamento-vetrina";
import { creaTipologia } from "@/lib/azioni-tipologie";

export const dynamic = "force-dynamic";

// Le **tipologie**: mondi commerciali decisi da noi (Lusso, Accessibile, Linea
// rose, Originale). Non sono un'etichetta da appiccicare a mano: sono i **criteri**
// che dicono quali prodotti ne fanno parte — fascia, linea, tipo, fornitore, area,
// novità, tag, collezione — mescolabili come serve. Dalla scheda si vede cosa
// hanno preso e si sceglie la priorità con cui ordinarli.
export default async function TipologiePage() {
  const [tipologie, voci] = await Promise.all([
    prisma.tipologiaCollezione.findMany({
      orderBy: { nome: "asc" },
      include: { _count: { select: { collezioni: true } } },
    }),
    vociDisponibili(),
  ]);

  // Quanti prodotti prende ognuna: è la domanda che si fa guardando l'elenco.
  const conteggi = await Promise.all(
    tipologie.map(async (t) => {
      const dove = await filtroCriteri(parseCriteri(t.criteri));
      return dove ? prisma.prodotto.count({ where: dove }) : null;
    })
  );

  return (
    <div className="layout">
      <Sidebar attiva="visual" />
      <main className="main" style={{ maxWidth: 1000 }}>
        <a className="ritorno" href="/visual">← Visual merchandising</a>
        <div className="page-head">
          <div>
            <h1 className="page-title">Tipologie</h1>
            <p className="page-sub">
              I tuoi mondi commerciali — Lusso, Accessibile, Linea rose, Originale — definiti dai <b>criteri</b> che
              dicono quali prodotti ne fanno parte. Si mescolano fascia di prezzo, linea, tipo, fornitore, area,
              novità, tag e collezione. Creata la tipologia, sulla sua scheda vedi cosa ha preso e scegli la priorità
              con cui ordinarla.
            </p>
          </div>
        </div>

        {tipologie.length === 0 ? (
          <div className="vuoto-mini" style={{ marginBottom: 20 }}>
            Nessuna tipologia ancora. Creane una qui sotto.
          </div>
        ) : (
          <div className="scheda" style={{ marginBottom: 22 }}>
            <div className="scheda-titolo">Le tue tipologie</div>
            <div className="tabella-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Tipologia</th>
                    <th>Criteri</th>
                    <th className="num">Prodotti</th>
                    <th>Ordine</th>
                  </tr>
                </thead>
                <tbody>
                  {tipologie.map((t, i) => {
                    const c = parseCriteri(t.criteri);
                    return (
                      <tr key={t.id} className="riga-cliccabile">
                        <td>
                          <Link href={`/visual/tipologie/${t.id}`} className="cella-nome link-riga">
                            {t.nome}
                          </Link>
                          {t.descrizione && <div className="cella-sub">{t.descrizione}</div>}
                        </td>
                        <td>
                          <span className="cella-sub">{descriviCriteri(c, voci)}</span>
                        </td>
                        <td className="num">
                          {conteggi[i] == null ? (
                            <span style={{ color: "var(--orange)" }}>da definire</span>
                          ) : (
                            conteggi[i]
                          )}
                        </td>
                        <td>
                          <span className="cella-sub">{etichettaRegola(t.regolaOrdinamento)}</span>
                          {t._count.collezioni > 0 && (
                            <div className="cella-sub">{t._count.collezioni} collezioni collegate</div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <form action={creaTipologia}>
          <div className="scheda">
            <div className="scheda-titolo">Nuova tipologia</div>
            <div className="modulo" style={{ gridTemplateColumns: "1fr 2fr", marginBottom: 6 }}>
              <div className="campo-modulo">
                <label>
                  Nome <span className="obbligatorio">*</span>
                </label>
                <input name="nome" required placeholder="Lusso" />
              </div>
              <div className="campo-modulo">
                <label>Descrizione</label>
                <input name="descrizione" placeholder="A cosa serve questa tipologia" />
              </div>
            </div>

            <SelettoreCriteri criteri={{}} voci={voci} />

            <div className="azioni-modulo" style={{ marginTop: 14 }}>
              <button type="submit" className="btn">
                Crea e guarda i prodotti
              </button>
              <span className="page-sub" style={{ margin: 0 }}>
                Poi, sulla scheda, scegli la priorità d'ordine.
              </span>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}
