import Link from "next/link";
import { prisma } from "@/lib/db";
import { dataBreve } from "@/lib/ordini";
import { CANALI, LISTE, lista, nomeCanale } from "@/lib/segmenti";
import { creaAutomazione } from "@/app/actions";
import { RigaLink } from "@/components/RigaLink";
import { ordinamentoDa } from "@/components/ThOrdina";

export const dynamic = "force-dynamic";

// Le automazioni: elenco e creazione. Il concetto sta tutto nella prima riga
// della pagina, perché è quello che evita i guai — qui si PREPARANO i messaggi,
// non si spediscono da soli.
export default async function Automazioni({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  // L'elenco è completo (nessun tetto): l'ordinamento in memoria è esatto.
  const ord = ordinamentoDa(sp, { predefinito: "creato" });
  const automazioni = await prisma.automazione.findMany({
    orderBy: { creatoIl: "desc" },
    include: { _count: { select: { messaggi: true } }, scriptUsato: { select: { id: true, nome: true } } },
  });

  const script = await prisma.script.findMany({ where: { attivo: true }, orderBy: { nome: "asc" } });

  const pronti = await prisma.messaggioAutomazione.groupBy({
    by: ["automazioneId"],
    where: { stato: "pronto" },
    _count: { _all: true },
  });
  const perAutomazione = new Map(pronti.map((p) => [p.automazioneId, p._count._all]));

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1 className="page-title">Automazioni</h1>
          <p className="page-sub">
            Messaggi ai clienti di una lista, scritti da uno script: «torna a ordinare», «è passato
            un anno», «ti aspettiamo per San Valentino». L&apos;app li <strong>prepara</strong> uno
            per uno, già passati al setaccio dei consensi.
          </p>
        </div>
        <Link className="btn btn-secondario" href="/script">Script</Link>
      </div>

      <div className="consiglio" style={{ ["--lista" as string]: "var(--gold)" }}>
        <span className="consiglio-titolo">Come funziona, in una riga</span>
        Un&apos;automazione sceglie una <strong>lista</strong>, applica lo <strong>script</strong> a
        ogni persona e scarta chi non ha dato il consenso, chi non ha il recapito e chi è già stato
        contattato di recente. <strong>Non invia da sola</strong>: i messaggi restano qui, pronti da
        controllare e da mandare — perché un errore su duemila persone non si corregge dopo.
      </div>

      {automazioni.length === 0 ? (
        <div className="vuoto">Nessuna automazione. Creane una qui sotto.</div>
      ) : (
        <div className="tabella-wrap">
          <table>
            <thead>
              <tr>
                {ord.th("nome", "Automazione")}
                {ord.th("lista", "Lista")}
                {ord.th("canale", "Canale")}
                {ord.th("script", "Script")}
                {ord.th("pronti", "Pronti", true)}
                {ord.th("preparati", "Preparati in tutto", true)}
                {ord.th("giro", "Ultimo giro", true)}
                {ord.th("stato", "Stato")}
              </tr>
            </thead>
            <tbody>
              {[...automazioni].sort(ord.confronta((a) => {
                switch (ord.ordina) {
                  case "nome": return a.nome.toLowerCase();
                  case "lista": return (lista(a.lista)?.nome ?? a.lista).toLowerCase();
                  case "canale": return a.canale.toLowerCase();
                  case "script": return (a.scriptUsato?.nome ?? "").toLowerCase();
                  case "pronti": return perAutomazione.get(a.id) ?? 0;
                  case "preparati": return a._count.messaggi;
                  case "giro": return a.ultimoGiro ? a.ultimoGiro.getTime() : 0;
                  case "stato": return a.attiva ? 1 : 0;
                  default: return a.creatoIl.getTime();
                }
              })).map((a) => (
                // «La riga si apre col click» (Libro UX&UI v1.6 §8): tutta la
                // riga apre la scheda; il link sul nome resta per la tastiera.
                <RigaLink href={`/automazioni/${a.id}`} key={a.id} className="riga-link">
                  <td>
                    <Link href={`/automazioni/${a.id}`} className="cella-nome">{a.nome}</Link>
                    {a.descrizione && <div className="cella-sub">{a.descrizione}</div>}
                  </td>
                  <td className="cella-muta">{lista(a.lista)?.nome ?? a.lista}</td>
                  <td className="cella-muta">{nomeCanale(a.canale)}</td>
                  <td className="cella-muta">
                    {a.scriptUsato ? (
                      <Link href={`/script/${a.scriptUsato.id}`}>{a.scriptUsato.nome}</Link>
                    ) : (
                      <span className="cella-sub">testo scritto a mano</span>
                    )}
                  </td>
                  <td className="cella-num">{(perAutomazione.get(a.id) ?? 0).toLocaleString("it-IT")}</td>
                  <td className="cella-num">{a._count.messaggi.toLocaleString("it-IT")}</td>
                  <td className="cella-muta">{a.ultimoGiro ? dataBreve(a.ultimoGiro) : "mai"}</td>
                  <td>
                    <span className="badge" style={{ color: a.attiva ? "var(--green)" : "var(--text-tertiary)" }}>
                      <span className="dot" />
                      {a.attiva ? "attiva" : "in preparazione"}
                    </span>
                  </td>
                </RigaLink>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="scheda" style={{ marginTop: 18 }}>
        <div className="scheda-titolo">Nuova automazione</div>
        <form action={creaAutomazione} className="modulo">
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
          <div className="campo-modulo">
            <label htmlFor="lista">A chi (lista)</label>
            <select id="lista" name="lista" defaultValue="da-riattivare">
              {LISTE.map((l) => (
                <option key={l.chiave} value={l.chiave}>{l.nome}</option>
              ))}
            </select>
          </div>
          <div className="campo-modulo">
            <label htmlFor="descrizione">A cosa serve</label>
            <input id="descrizione" name="descrizione" placeholder="es. recuperare chi non ordina da un anno" />
          </div>
          {/* Lo script si sceglie qui, subito: è il motivo per cui esiste la
              sezione Script. Il testo libero resta sotto per i casi al volo. */}
          <div className="campo-modulo largo">
            <label htmlFor="scriptId">Script da usare</label>
            <select id="scriptId" name="scriptId" defaultValue="">
              <option value="">— nessuno: scrivo il testo qui sotto —</option>
              {script.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                  {s.attivo ? "" : " (sospeso)"}
                </option>
              ))}
            </select>
            {script.length === 0 && (
              <span className="cella-sub">
                Nessuno script ancora: <Link href="/script">scrivine uno</Link> e potrai riusarlo
                in tutte le automazioni.
              </span>
            )}
          </div>
          <div className="campo-modulo largo">
            <label htmlFor="script">Oppure il testo, scritto qui</label>
            <textarea
              id="script"
              name="script"
              rows={4}
              placeholder={"Gentile {{nome}}, è passato un po' dal suo ultimo ordine ({{ultimo_ordine}}).\nSe le fa piacere ripetere l'esperienza, siamo qui."}
            />
          </div>
          <div className="azioni-modulo campo-modulo largo">
            <button className="btn" type="submit">Crea e configura</button>
          </div>
        </form>
      </div>
    </main>
  );
}
