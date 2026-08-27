import Link from "next/link";
import { prisma } from "@/lib/db";
import { ANNO_CORRENTE } from "@/lib/calc";
import { eur } from "@/lib/format";
import { chiGuarda } from "@/lib/chi-guarda";

export const dynamic = "force-dynamic";

const BADGE: Record<string, string> = {
  BOZZA: "neutral",
  INVIATA: "blue",
  APPROVATA: "green",
  RESPINTA: "red",
};

export default async function Proposte() {
  // ⚠️⚠️ **UN NON-ADMIN VEDE SOLO LE SUE** (buco chiuso il 27/08/2026).
  //
  // Questa query non filtrava per autore e la pagina non leggeva **mai** la
  // sessione: il profilo `proposte` — che dal Hub prende **qualsiasi** utente
  // non-admin — vedeva le proposte di tutti, con autore, ambito, totale in euro
  // e note. `src/lib/ruoli.ts` promette il contrario: «manda il proprio budget
  // e rivede i **propri** invii».
  //
  // ⭐ Il middleware dice **dove** puoi entrare; solo la pagina sa **cosa**
  // puoi vedere lì dentro, perché è l'unica che conosce le righe.
  const chi = await chiGuarda();
  const proposte = await prisma.propostaBudget.findMany({
    where: {
      year: ANNO_CORRENTE,
      // Le proposte vecchie hanno `inviataDaUid` nullo: per un non-admin
      // restano invisibili, che è il verso giusto in cui sbagliare.
      ...(chi.admin ? {} : { inviataDaUid: chi.uid ?? "—nessuno—" }),
    },
    orderBy: { createdAt: "desc" },
  });
  const [maisons, linee] = await Promise.all([
    prisma.maison.findMany(),
    prisma.lineaCommerciale.findMany(),
  ]);

  const inAttesa = proposte.filter((x) => x.stato === "INVIATA").length;

  const nomeAmbito = (p: (typeof proposte)[number]) => {
    if (p.ambitoTipo === "GLOBALE") return "Tutta l'azienda";
    if (p.ambitoTipo === "MAISON") return maisons.find((m) => m.slug === p.ambitoSlug)?.nome ?? p.ambitoSlug;
    return linee.find((l) => l.slug === p.ambitoSlug)?.nome ?? p.ambitoSlug;
  };
  const totale = (p: (typeof proposte)[number]) => {
    try {
      const v = JSON.parse(p.valori) as { valore: number }[];
      return v.reduce((s, x) => s + (x.valore || 0), 0);
    } catch {
      return 0;
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Proposte budget</h1>
          <p className="page-caption">
            Ogni Responsabile invia qui la propria proposta di budget {ANNO_CORRENTE}.{" "}
            <strong>Si approva aprendo la proposta</strong> — il bottone in fondo alla riga: lì dentro ci sono
            «Approva», «Respingi» (con nota obbligatoria) e, in un <strong>secondo gesto separato</strong>,
            «Consolida nel budget». Finché non è consolidata, il budget pubblicato non cambia di un euro.
          </p>
        </div>
        <div className="page-actions">
          {inAttesa > 0 && (
            <span className="badge blue"><span className="dot" />{inAttesa} da leggere</span>
          )}
          <Link className="btn primary" href="/proposte/nuova">Nuova proposta</Link>
        </div>
      </div>

      {proposte.length === 0 ? (
        <div className="card empty">
          <div className="empty-icon">✍︎</div>
          <div className="empty-title">Nessuna proposta ancora</div>
          <div className="empty-text">
            Le proposte dei Responsabili compariranno qui.{" "}
            <Link href="/proposte/nuova" style={{ color: "var(--blue)" }}>Invia la prima proposta</Link>.
          </div>
        </div>
      ) : (
        <div className="card tight">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Autore</th>
                  <th>Ruolo</th>
                  <th>Ambito</th>
                  <th className="num">Totale proposto</th>
                  <th>Stato</th>
                  <th>Data</th>
                  <th>Note</th>
                  {/* La decisione si prende nella scheda della proposta, e
                      finché l'unico link era il nome dell'autore nessuno la
                      trovava: un bottone che dice cosa succede vale più di una
                      riga cliccabile che non lo dice. */}
                  <th />
                </tr>
              </thead>
              <tbody>
                {proposte.map((p) => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 500 }}>
                      <Link href={`/proposte/${p.id}`} style={{ color: "var(--blue)" }}>{p.autore}</Link>
                    </td>
                    <td className="muted">{p.ruolo}</td>
                    <td>{nomeAmbito(p)}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{eur(totale(p))}</td>
                    <td>
                      <span className={`badge ${BADGE[p.stato] ?? "neutral"}`}>
                        <span className="dot" />
                        {p.stato.charAt(0) + p.stato.slice(1).toLowerCase()}
                      </span>
                    </td>
                    <td className="muted">{p.createdAt.toLocaleDateString("it-IT")}</td>
                    <td className="muted" style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.note ?? "—"}
                    </td>
                    <td className="num" style={{ whiteSpace: "nowrap" }}>
                      <Link
                        className={`btn small ${p.stato === "INVIATA" ? "primary" : "secondary"}`}
                        href={`/proposte/${p.id}`}
                      >
                        {p.stato === "INVIATA"
                          ? "Leggi e decidi"
                          : p.stato === "APPROVATA" && !p.consolidataSu
                            ? "Consolida"
                            : "Apri"}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
