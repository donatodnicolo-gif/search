import { prisma } from "@/lib/db";
import { creaPersona } from "@/lib/azioni";

export const dynamic = "force-dynamic";

export default async function PaginaNuovaPersona({
  searchParams,
}: {
  searchParams: Promise<{ err?: string }>;
}) {
  const sp = await searchParams;
  const [funzioni, persone] = await Promise.all([
    prisma.funzione.findMany({ where: { attiva: true }, orderBy: [{ ordine: "asc" }, { nome: "asc" }] }),
    prisma.persona.findMany({ where: { stato: "attivo" }, orderBy: { nome: "asc" } }),
  ]);

  return (
    <>
      <div className="page-testa">
        <div>
          <h1 className="page-title">Nuova persona</h1>
          <p className="page-sub">
            I dati anagrafici bastano per cominciare: mansioni, inquadramento e retribuzione si
            aggiungono dalla sua scheda.
          </p>
        </div>
        <div className="page-azioni">
          <a className="btn ghost" href="/">
            Torna all&apos;elenco
          </a>
        </div>
      </div>

      {sp.err && <div className="avviso-errore">{sp.err}</div>}

      <form action={creaPersona} className="card">
        <div className="form-griglia">
          <div className="campo">
            <label>Nome e cognome *</label>
            <input type="text" name="nome" required autoFocus placeholder="Es. Giulia Bianchi" />
          </div>
          <div className="campo">
            <label>Ruolo (titolo)</label>
            <input type="text" name="ruolo" placeholder="Es. Responsabile logistica" />
          </div>
          <div className="campo">
            <label>Email (la stessa del Hub, se c&apos;è)</label>
            <input type="email" name="email" placeholder="nome@deluxy.it" />
          </div>
          <div className="campo">
            <label>Telefono</label>
            <input type="tel" name="telefono" placeholder="+39 …" />
          </div>
          <div className="campo">
            <label>Sede</label>
            <input type="text" name="sede" placeholder="Es. Milano" />
          </div>
          <div className="campo">
            <label>Funzione</label>
            <select name="funzioneId" defaultValue="">
              <option value="">— nessuna —</option>
              {funzioni.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label>Riporta a</label>
            <select name="responsabileId" defaultValue="">
              <option value="">— nessuno (vertice) —</option>
              {persone.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label>Data di assunzione</label>
            <input type="date" name="dataAssunzione" />
          </div>
          <div className="campo largo">
            <label>Note</label>
            <textarea name="note" placeholder="Tutto quello che serve ricordare" />
          </div>
        </div>
        <div className="form-azioni">
          <button type="submit" className="btn">
            Crea la persona
          </button>
        </div>
      </form>
    </>
  );
}
