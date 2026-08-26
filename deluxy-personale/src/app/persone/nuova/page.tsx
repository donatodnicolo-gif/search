import { prisma } from "@/lib/db";
import { creaPersona, ricongiungiPersona } from "@/lib/azioni";
import { MODALITA_LAVORO, nomeTipoContratto, inquadramentoCorrente } from "@/lib/organico";

// La creazione NON duplica in silenzio: se esiste già un'omonima, l'azione
// rimanda qui con i dati compilati e si sceglie — aggiornare/ricongiungere la
// scheda esistente, oppure creare comunque (è un'altra persona con lo stesso
// nome). Niente di ciò che si era scritto va perso: viaggia nella query.

export const dynamic = "force-dynamic";

type Parametri = {
  err?: string;
  doppione?: string;
  nome?: string;
  ruolo?: string;
  email?: string;
  telefono?: string;
  sede?: string;
  modalitaLavoro?: string;
  funzioneId?: string;
  responsabileId?: string;
  dataAssunzione?: string;
  note?: string;
};

export default async function PaginaNuovaPersona({
  searchParams,
}: {
  searchParams: Promise<Parametri>;
}) {
  const sp = await searchParams;
  const [funzioni, persone] = await Promise.all([
    prisma.funzione.findMany({ where: { attiva: true }, orderBy: [{ ordine: "asc" }, { nome: "asc" }] }),
    prisma.persona.findMany({ where: { stato: "attivo" }, orderBy: { nome: "asc" } }),
  ]);

  // La scheda dell'omonima, per far scegliere a colpo sicuro.
  const omonima = sp.doppione
    ? await prisma.persona.findUnique({
        where: { id: sp.doppione },
        include: { funzione: true, inquadramenti: true, _count: { select: { compensi: true } } },
      })
    : null;
  const inquadramentoOmonima = omonima ? inquadramentoCorrente(omonima.inquadramenti) : null;

  // I dati compilati che viaggiano nel giro di decisione.
  const campi: [string, string][] = (
    ["nome", "ruolo", "email", "telefono", "sede", "modalitaLavoro", "funzioneId", "responsabileId", "dataAssunzione", "note"] as const
  )
    .map((c) => [c, sp[c] ?? ""] as [string, string])
    .filter(([, v]) => v);

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

      {omonima && (
        <div className="card" style={{ borderColor: "rgba(184, 150, 62, 0.45)", marginBottom: 16 }}>
          <h2 className="card-titolo">C&apos;è già una scheda per «{omonima.nome}»</h2>
          <p className="card-sub" style={{ marginTop: 4 }}>
            {[
              omonima.ruolo || null,
              omonima.funzione?.nome ?? null,
              inquadramentoOmonima ? nomeTipoContratto(inquadramentoOmonima.tipoContratto) : null,
              omonima._count.compensi > 0 ? "con retribuzione registrata" : null,
              omonima.stato === "cessato" ? "OGGI CESSATA" : null,
            ]
              .filter(Boolean)
              .join(" · ") || "scheda senza dettagli"}{" "}
            ·{" "}
            <a href={`/persone/${omonima.id}`} style={{ textDecoration: "underline" }}>
              apri la scheda
            </a>
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
            <form action={ricongiungiPersona}>
              <input type="hidden" name="id" value={omonima.id} />
              {campi.map(([n, v]) => (
                <input key={n} type="hidden" name={n} value={v} />
              ))}
              <button className="btn" type="submit">
                È la stessa persona: aggiorna quella scheda
              </button>
            </form>
            <form action={creaPersona}>
              <input type="hidden" name="forza" value="1" />
              {campi.map(([n, v]) => (
                <input key={n} type="hidden" name={n} value={v} />
              ))}
              <button className="btn ghost" type="submit">
                È un&apos;altra persona: crea comunque
              </button>
            </form>
          </div>
          <p style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginTop: 10 }}>
            «Aggiorna» porta sulla scheda esistente SOLO i campi compilati qui sotto (niente viene
            cancellato){omonima.stato === "cessato" ? " e la riattiva" : ""}; la sua storia
            (contratti, compensi, mansioni) resta intatta.
          </p>
        </div>
      )}

      <form action={creaPersona} className="card">
        <div className="form-griglia">
          <div className="campo">
            <label>Nome e cognome *</label>
            <input type="text" name="nome" required autoFocus defaultValue={sp.nome ?? ""} placeholder="Es. Giulia Bianchi" />
          </div>
          <div className="campo">
            <label>Ruolo (titolo)</label>
            <input type="text" name="ruolo" defaultValue={sp.ruolo ?? ""} placeholder="Es. Responsabile logistica" />
          </div>
          <div className="campo">
            <label>Email (la stessa del Hub, se c&apos;è)</label>
            <input type="email" name="email" defaultValue={sp.email ?? ""} placeholder="nome@deluxy.it" />
          </div>
          <div className="campo">
            <label>Telefono</label>
            <input type="tel" name="telefono" defaultValue={sp.telefono ?? ""} placeholder="+39 …" />
          </div>
          <div className="campo">
            <label>Sede</label>
            <input type="text" name="sede" defaultValue={sp.sede ?? ""} placeholder="Es. Milano" />
          </div>
          <div className="campo">
            <label>Modalità di lavoro</label>
            <select name="modalitaLavoro" defaultValue={sp.modalitaLavoro ?? ""}>
              <option value="">— non indicata —</option>
              {MODALITA_LAVORO.map((m) => (
                <option key={m.chiave} value={m.chiave}>
                  {m.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label>Funzione</label>
            <select name="funzioneId" defaultValue={sp.funzioneId ?? ""}>
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
            <select name="responsabileId" defaultValue={sp.responsabileId ?? ""}>
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
            <input type="date" name="dataAssunzione" defaultValue={sp.dataAssunzione ?? ""} />
          </div>
          <div className="campo largo">
            <label>Note</label>
            <textarea name="note" defaultValue={sp.note ?? ""} placeholder="Tutto quello che serve ricordare" />
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
