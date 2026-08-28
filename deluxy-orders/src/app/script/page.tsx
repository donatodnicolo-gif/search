import Link from "next/link";
import { prisma } from "@/lib/db";
import { dataBreve } from "@/lib/ordini";
import { CANALI, nomeCanale } from "@/lib/segmenti";
import { variabiliScript, variabiliCitate } from "@/lib/automazioni";
import { creaScript } from "@/app/actions";
import { RigaLink } from "@/components/RigaLink";

export const dynamic = "force-dynamic";

// Gli script: i testi che si mandano ai clienti, scritti una volta e riusati
// dalle automazioni. Stanno per conto loro perché un testo che parla ai clienti
// si rilegge, si corregge e lo fa correggere anche a qualcun altro.
export default async function Script({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() || undefined;

  const script = await prisma.script.findMany({
    // La ricerca (Libro v1.9 §8-bis): come si riconosce uno script — il nome,
    // a cosa serve o una frase del testo. Niente scorciatoie di periodo: è un
    // catalogo di copioni, non un registro di fatti datati.
    where: q
      ? {
          OR: [
            { nome: { contains: q, mode: "insensitive" as const } },
            { descrizione: { contains: q, mode: "insensitive" as const } },
            { testo: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : undefined,
    orderBy: { creatoIl: "desc" },
    include: { _count: { select: { automazioni: true } } },
  });

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1 className="page-title">Script</h1>
          <p className="page-sub">
            I testi da mandare ai clienti, scritti una volta e riusati dalle automazioni.
            Dentro si scrivono <strong>variabili</strong>: quelle del cliente le riempie l&apos;app,
            le altre le dichiari tu e ogni automazione sceglie il suo valore.
          </p>
        </div>
        <Link className="btn btn-secondario" href="/automazioni">Automazioni</Link>
      </div>

      {/* La ricerca (Libro v1.9 §8-bis): il nome, l'uso o una frase del testo. */}
      <form className="filtri" method="get">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Cerca per nome, uso o testo…"
        />
        <button className="btn btn-secondario small" type="submit">Cerca</button>
        {q && <Link className="btn btn-secondario small" href="/script">Azzera</Link>}
      </form>

      {script.length === 0 ? (
        <div className="vuoto">{q ? `Nessuno script per «${q}».` : "Nessuno script. Scrivine uno qui sotto."}</div>
      ) : (
        <div className="tabella-wrap">
          <table>
            <thead>
              <tr>
                <th>Script</th>
                <th>Canale</th>
                <th>Variabili</th>
                <th className="num">Usato da</th>
                <th>Creato</th>
                <th>Stato</th>
              </tr>
            </thead>
            <tbody>
              {script.map((s) => {
                const dichiarate = variabiliScript(s.variabili);
                return (
                  // «La riga si apre col click» (Libro UX&UI v1.6 §8): tutta la
                  // riga apre la scheda; il link sul nome resta per la tastiera.
                  <RigaLink href={`/script/${s.id}`} key={s.id} className="riga-link">
                    <td>
                      <Link href={`/script/${s.id}`} className="cella-nome">{s.nome}</Link>
                      {s.descrizione && <div className="cella-sub">{s.descrizione}</div>}
                    </td>
                    <td className="cella-muta">{nomeCanale(s.canale)}</td>
                    <td>
                      <span className="etichette">
                        {dichiarate.length === 0 ? (
                          <span className="tag tag-vuoto"><span className="tag-label">solo quelle del cliente</span></span>
                        ) : (
                          dichiarate.map((v) => (
                            <span key={v.chiave} className="tag" style={{ color: v.obbligatoria ? "var(--orange)" : "var(--blue)" }}>
                              <span className="dot" />
                              <span className="tag-label">{v.chiave}</span>
                            </span>
                          ))
                        )}
                      </span>
                      <div className="cella-sub">{variabiliCitate(s.testo).length} usate nel testo</div>
                    </td>
                    <td className="cella-num">{s._count.automazioni}</td>
                    <td className="cella-muta">{dataBreve(s.creatoIl)}</td>
                    <td>
                      <span className="badge" style={{ color: s.attivo ? "var(--green)" : "var(--text-tertiary)" }}>
                        <span className="dot" />
                        {s.attivo ? "attivo" : "sospeso"}
                      </span>
                    </td>
                  </RigaLink>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="scheda" style={{ marginTop: 18 }}>
        <div className="scheda-titolo">Nuovo script</div>
        <form action={creaScript} className="modulo">
          <div className="campo-modulo">
            <label htmlFor="nome">Nome</label>
            <input id="nome" name="nome" required placeholder="es. Torna a ordinare — dormienti" />
          </div>
          <div className="campo-modulo">
            <label htmlFor="canale">Canale</label>
            <select id="canale" name="canale" defaultValue="whatsapp">
              {CANALI.map((c) => (
                <option key={c.chiave} value={c.chiave}>{c.nome}</option>
              ))}
            </select>
          </div>
          <div className="campo-modulo largo">
            <label htmlFor="descrizione">A cosa serve</label>
            <input id="descrizione" name="descrizione" placeholder="es. recuperare chi non ordina da un anno" />
          </div>
          <div className="campo-modulo largo">
            <label htmlFor="testo">Testo</label>
            <textarea
              id="testo"
              name="testo"
              rows={4}
              placeholder={"Gentile {{nome}}, è passato un po' dal suo ultimo ordine ({{ultimo_ordine}}).\nFino al {{scadenza}} le riserviamo {{sconto}} sulla prossima consegna."}
            />
          </div>
          <div className="azioni-modulo campo-modulo largo">
            <button className="btn" type="submit">Crea e apri</button>
          </div>
        </form>
        <p className="testo-guida" style={{ marginTop: 8 }}>
          Le variabili si scrivono fra doppie graffe. Dopo aver creato lo script si dichiarano
          quelle tue (<code className="inline">{"{{sconto}}"}</code>,{" "}
          <code className="inline">{"{{scadenza}}"}</code>): l&apos;app ti dice subito quali hai
          usato nel testo e quali non riempirà nessuno.
        </p>
      </div>
    </main>
  );
}
