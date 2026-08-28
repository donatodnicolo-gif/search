import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { eliminaLista, rigeneraLista, rimuoviMembro } from "@/lib/actions";
import { dataIt, euro, segmento } from "@/lib/etichette";
import { TornaIndietro } from "@/components/TornaIndietro";
import { RigaLink } from "@/components/RigaLink";

export const dynamic = "force-dynamic";
// La rigenerazione riscarica i clienti da Orders: stesso respiro della creazione.
export const maxDuration = 300;

type Query = { esito?: string; errore?: string; dettaglio?: string };

// DETTAGLIO LISTA — chi c'è dentro e perché. Il brief e la spiegazione
// dell'AI restano attaccati alla lista: una selezione che non sa dire come è
// nata non si può difendere né rigenerare.
export default async function DettaglioLista({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Query>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const lista = await prisma.listaClienti.findUnique({
    where: { id },
    include: { membri: { orderBy: { speso: "desc" } } },
  });
  if (!lista) notFound();

  const conEmail = lista.membri.filter((m) => m.email).length;
  const conTelefono = lista.membri.filter((m) => m.telefono).length;

  return (
    <>
      <div className="intestazione">
        <div>
          <h1 className="page-title">{lista.nome}</h1>
          <p className="page-sub">
            {lista.membri.length} clienti · {conEmail} con email · {conTelefono} con telefono · generata{" "}
            {dataIt(lista.generataIl, true)}
          </p>
        </div>
        <div className="azioni">
          <TornaIndietro fallback="/liste" label="Liste" />
          <a className="btn ghost" href={`/liste/${id}/whatsapp`}>WhatsApp alla lista</a>
          <a className="btn" href={`/liste/${id}/mail`}>Mail alla lista</a>
        </div>
      </div>

      {sp.esito === "ok" ? <div className="ok-card">{sp.dettaglio ?? "Fatto."}</div> : null}
      {sp.errore ? <div className="errore-card">{sp.errore}</div> : null}

      <div className="griglia" style={{ gridTemplateColumns: "minmax(0, 1.7fr) minmax(0, 1fr)", alignItems: "start" }}>
        <div className="card tabella-card">
          <div className="tabella-scroll">
            <table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Città</th>
                  <th>Segmento</th>
                  <th className="num">Ordini</th>
                  <th className="num">Speso</th>
                  <th>Ultimo</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lista.membri.map((m) => {
                  const seg = segmento(m.segmento);
                  return (
                    // La riga è il cliente: tutta la riga apre la sua scheda (Libro §8).
                    <RigaLink key={m.id} href={`/clienti/${encodeURIComponent(m.chiaveCliente)}`}>
                      <td>
                        <a href={`/clienti/${encodeURIComponent(m.chiaveCliente)}`}>
                          <div className="cella-principale">{m.nome || m.email || m.telefono || "—"}</div>
                          <div className="cella-sotto">{m.email || m.telefono || ""}</div>
                        </a>
                      </td>
                      <td>{m.citta || "—"}</td>
                      <td>
                        <span className="badge colorato" style={{ ["--badge-colore" as string]: seg.colore }}>
                          <span className="dot" />
                          {seg.nome}
                        </span>
                      </td>
                      <td className="num">{m.ordini}</td>
                      <td className="num">{euro(m.speso)}</td>
                      <td className="secondario piccolo">{dataIt(m.ultimoOrdine)}</td>
                      <td>
                        <form action={rimuoviMembro}>
                          <input type="hidden" name="id" value={m.id} />
                          <input type="hidden" name="torna" value={`/liste/${id}`} />
                          <button className="btn rosso mini" type="submit">Togli</button>
                        </form>
                      </td>
                    </RigaLink>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card">
            <div className="card-titolo" style={{ fontSize: 16 }}>Il brief</div>
            <p style={{ fontSize: 14, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{lista.brief}</p>
          </div>
          <div className="card">
            <div className="card-titolo" style={{ fontSize: 16 }}>Come ha ragionato l&apos;AI</div>
            <p style={{ fontSize: 14, lineHeight: 1.55 }}>{lista.spiegazione || "—"}</p>
            {lista.note ? (
              <p className="secondario" style={{ fontSize: 12.5, lineHeight: 1.6, marginTop: 10, whiteSpace: "pre-wrap" }}>
                {lista.note}
              </p>
            ) : null}
            <p className="terziario piccolo" style={{ marginTop: 8 }}>Modello: {lista.modello || "—"}</p>
          </div>
          <div className="card">
            <div className="card-titolo" style={{ fontSize: 16 }}>Manutenzione</div>
            <div className="card-sub">Rigenerare riesegue gli stessi criteri sui dati di oggi (i membri si sostituiscono).</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <form action={rigeneraLista}>
                <input type="hidden" name="id" value={id} />
                <button className="btn ghost" type="submit">Rigenera dai dati di oggi</button>
              </form>
              <form action={eliminaLista}>
                <input type="hidden" name="id" value={id} />
                <button className="btn rosso" type="submit">Elimina la lista</button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
