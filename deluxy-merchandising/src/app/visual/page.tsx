import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { prisma } from "@/lib/db";
import { etichettaRegola } from "@/lib/ordinamento-vetrina";

export const dynamic = "force-dynamic";

// Visual merchandising = curare **le collezioni vere del negozio**, non
// allestimenti inventati qui. Si mostrano solo quelle **pubblicate su Shopify**
// (le vedono i clienti): una collezione non pubblicata non è in scena. Per ognuna
// si sceglie una regola d'ordine, si ritocca a mano e si spinge l'ordine al
// negozio.
export default async function VisualPage({
  searchParams,
}: {
  searchParams: Promise<{ esito?: string; messaggio?: string }>;
}) {
  const sp = await searchParams;
  const [collezioni, totali, pubblicate, pianiBozza] = await Promise.all([
    prisma.collezioneShopify.findMany({
      where: { pubblicataShopify: true },
      orderBy: [{ negozio: "asc" }, { titolo: "asc" }],
      include: { _count: { select: { prodotti: true } } },
    }),
    prisma.collezioneShopify.count(),
    prisma.collezioneShopify.count({ where: { pubblicataShopify: true } }),
    prisma.pianoRiordino.count({ where: { stato: "bozza" } }),
  ]);

  const perNegozio = new Map<string, typeof collezioni>();
  for (const c of collezioni) {
    const arr = perNegozio.get(c.negozio) ?? [];
    arr.push(c);
    perNegozio.set(c.negozio, arr);
  }

  const daSincronizzare = (c: (typeof collezioni)[number]) =>
    c.ordineModificatoIl != null && (c.ordineSpintoIl == null || c.ordineModificatoIl > c.ordineSpintoIl);

  return (
    <div className="layout">
      <Sidebar attiva="visual" />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Visual merchandising</h1>
            <p className="page-sub">
              Le collezioni <b>pubblicate sul negozio</b>: per ognuna scegli una regola d'ordine, la ritocchi a mano
              e la mandi a Shopify uguale a come la vedi qui.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Link className="btn btn-secondario" href="/visual/tipologie">Tipologie & regole</Link>
            <Link className="btn btn-secondario" href="/riordini">
              Ipotesi di ordinativo{pianiBozza > 0 ? ` · ${pianiBozza} in bozza` : ""}
            </Link>
          </div>
        </div>

        {sp.messaggio && (
          <div className={`nota-info${sp.esito === "errore" ? " nota-errore" : ""}`}>
            <span className="nota-icona">{sp.esito === "errore" ? "△" : "◆"}</span>
            <span>{sp.messaggio}</span>
          </div>
        )}

        {collezioni.length === 0 ? (
          <div className="vuoto">
            <p>Nessuna collezione <b>pubblicata sul negozio</b> da mettere in scena.</p>
            <p className="page-sub" style={{ marginTop: 8 }}>
              {totali === 0
                ? "Non ci sono collezioni importate: importale da "
                : `Ci sono ${totali} collezioni importate ma nessuna risulta pubblicata sul negozio online. Lo stato di pubblicazione si legge solo rifacendo l'import da `}
              <Link href="/collezioni">Collezioni → Importa da Shopify</Link>. «Attive» qui vuol dire pubblicate sul
              negozio, cioè visibili ai clienti.
            </p>
          </div>
        ) : (
          <>
            <p className="page-sub" style={{ marginBottom: 16 }}>
              {pubblicate} collezioni pubblicate su {totali} importate.
            </p>
            {[...perNegozio.entries()].map(([negozio, lista]) => (
              <div key={negozio} style={{ marginBottom: 28 }}>
                <div className="scheda-titolo" style={{ marginBottom: 12 }}>
                  {negozio} · {lista.length}
                </div>
                <div className="griglia-collezioni">
                  {lista.map((c) => (
                    <Link key={c.id} href={`/visual/${c.id}`} className="card-collezione">
                      <div className="card-cover">
                        {c.immagine ? (
                          <img src={c.immagine} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          <span className="card-cover-stagione">{c.tipo === "automatica" ? "Automatica" : "Manuale"}</span>
                        )}
                      </div>
                      <div className="card-corpo">
                        <span className="card-nome">{c.titolo}</span>
                        <p className="card-tema">
                          Ordine: {etichettaRegola(c.regolaOrdinamento)}
                          {c.tipo === "automatica" ? " · automatica (smart)" : ""}
                        </p>
                        <div className="card-meta">
                          <span className="card-meta-num">
                            <b>{c._count.prodotti}</b> prodotti qui
                          </span>
                          {daSincronizzare(c) && (
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                color: "var(--orange)",
                                background: "color-mix(in srgb, var(--orange) 12%, transparent)",
                                padding: "2px 8px",
                                borderRadius: 999,
                              }}
                            >
                              da sincronizzare
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </main>
    </div>
  );
}
