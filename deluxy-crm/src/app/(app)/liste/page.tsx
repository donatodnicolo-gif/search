import { prisma } from "@/lib/db";
import { dentroOppureFuori } from "@/lib/sessione-server";
import { creaListaAI } from "@/lib/actions";
import { dataIt } from "@/lib/etichette";
import { RigaLink } from "@/components/RigaLink";

export const dynamic = "force-dynamic";
// La generazione legge il brief con l'AI e poi scarica i clienti da Orders a
// pagine di 500: su liste grandi serve più respiro del minuto standard.
export const maxDuration = 300;

type Query = { errore?: string };

// LISTE — i pubblici del CRM, costruiti dall'AI a partire da un brief scritto
// in italiano. L'AI non inventa nomi: traduce il brief in criteri sui dati
// veri di Orders (liste, segmenti, spesa, gusti), il CRM li esegue e mostra
// COME ha ragionato. «Non contattare» è sempre escluso.
export default async function Liste({ searchParams }: { searchParams: Promise<Query> }) {
  await dentroOppureFuori(); // revoca: sessione con password vecchia = fuori
  const sp = await searchParams;
  const liste = await prisma.listaClienti.findMany({
    orderBy: { creatoIl: "desc" },
    include: { _count: { select: { membri: true } } },
  });

  return (
    <>
      <div className="intestazione">
        <div>
          <h1 className="page-title">Liste</h1>
          <p className="page-sub">
            I pubblici a cui scrivere: si descrivono a parole, l&apos;AI li traduce in criteri sui dati veri di Orders e
            spiega come ha ragionato. Da ogni lista si mandano mail o WhatsApp, uno a uno ma personalizzati.
          </p>
        </div>
      </div>

      {sp.errore ? <div className="errore-card">{sp.errore}</div> : null}

      <div className="griglia" style={{ gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)", alignItems: "start" }}>
        <div>
          {liste.length === 0 ? (
            <div className="card vuoto">
              <div className="quadratino">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                  <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
                </svg>
              </div>
              <h3>Nessuna lista, per ora</h3>
              <p>La prima si scrive qui accanto: racconta chi vuoi raggiungere e perché, al resto pensa l&apos;AI.</p>
            </div>
          ) : (
            <div className="card tabella-card">
              <div className="tabella-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Lista</th>
                      <th className="num">Clienti</th>
                      <th>Generata</th>
                    </tr>
                  </thead>
                  <tbody>
                    {liste.map((l) => (
                      // La riga è la lista: tutta la riga la apre (Libro §8).
                      <RigaLink key={l.id} href={`/liste/${l.id}`}>
                        <td>
                          <a href={`/liste/${l.id}`}>
                            <div className="cella-principale">{l.nome}</div>
                            <div className="cella-sotto">{l.brief.length > 90 ? `${l.brief.slice(0, 90)}…` : l.brief}</div>
                          </a>
                        </td>
                        <td className="num">{l._count.membri}</td>
                        <td className="secondario piccolo">{dataIt(l.generataIl, true)}</td>
                      </RigaLink>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-titolo">Nuova lista con l&apos;AI</div>
          <div className="card-sub">
            Scrivi il brief come lo diresti a una persona: chi, dove, che rapporto hanno con noi, per farne cosa.
          </div>
          <form action={creaListaAI}>
            <div className="campo">
              <textarea
                name="brief"
                rows={6}
                required
                placeholder={
                  "es. I clienti migliori di Milano che hanno comprato per San Valentino, per invitarli alla cena del 14 febbraio.\n\nes. Chi ama le peonie e non ordina da più di sei mesi: voglio mandargli un pensiero via WhatsApp."
                }
              />
            </div>
            <div className="form-piede">
              <button className="btn" type="submit">Costruisci la lista</button>
            </div>
            <p className="terziario piccolo" style={{ marginTop: 8 }}>
              Chi ha chiesto di non essere contattato resta fuori, sempre. La generazione può richiedere fino a un minuto.
            </p>
          </form>
        </div>
      </div>
    </>
  );
}
