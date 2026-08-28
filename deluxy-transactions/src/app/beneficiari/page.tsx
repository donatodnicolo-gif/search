import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { operatoreCorrente } from "@/lib/sessione";
import { formattaIban } from "@/lib/iban";
import { quando } from "@/components/Etichette";
import { verificaBeneficiario } from "@/app/actions";
import { ModuloBeneficiario } from "@/components/ModuloBeneficiario";

// La rubrica degli IBAN. Serve a due cose: sapere a chi si è già pagato e
// accorgersi quando le coordinate di qualcuno cambiano — che è il momento in
// cui bisogna alzare il telefono, non firmare.

export const dynamic = "force-dynamic";

export default async function Beneficiari({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const operatore = await operatoreCorrente();
  if (!operatore) redirect("/login");
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();

  // La ricerca (Libro v1.9 §8-bis): il nome o l'IBAN, i due modi in cui si
  // riconosce una coordinata. Niente scorciatoie di periodo: questa è una
  // rubrica, non un archivio datato.
  const beneficiari = await prisma.beneficiario.findMany({
    where: q
      ? {
          OR: [
            { nome: { contains: q, mode: "insensitive" } },
            { iban: { contains: q.replace(/\s/g, "").toUpperCase() } },
          ],
        }
      : {},
    orderBy: [{ nomeNorm: "asc" }, { creatoIl: "asc" }],
  });

  // Nomi con più di un IBAN: sono le righe da guardare per prime. Il conteggio
  // si fa su TUTTA la rubrica, non sulle righe filtrate: cercando un IBAN si
  // vede una riga sola, ma l'avviso «questo nome ha N IBAN» deve restare vero.
  const gruppi = await prisma.beneficiario.groupBy({ by: ["nomeNorm"], _count: true });
  const conteggi = new Map<string, number>(gruppi.map((g) => [g.nomeNorm, g._count]));

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1 className="page-title">Beneficiari</h1>
          <p className="page-sub">
            {beneficiari.length} coordinate note · {beneficiari.filter((b) => b.verificato).length} verificate
          </p>
        </div>
      </div>

      {operatore.ruolo !== "osservatore" && (
        <div className="scheda">
          <div className="scheda-titolo">Aggiungi coordinate verificate</div>
          <ModuloBeneficiario />
        </div>
      )}

      <form className="filtri" method="get">
        <input type="search" name="q" defaultValue={q} placeholder="Cerca per nome o IBAN…" />
        <button className="btn" type="submit">Cerca</button>
      </form>

      {beneficiari.length === 0 ? (
        <div className="vuoto">
          {q
            ? "Nessun beneficiario per questa ricerca."
            : "La rubrica si riempie da sola: ogni richiesta ci aggiunge il suo beneficiario."}
        </div>
      ) : (
        <div className="tabella-wrap">
          <table>
            <thead>
              <tr>
                <th>Beneficiario</th>
                <th>IBAN</th>
                <th>Verificato</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {beneficiari.map((b) => (
                <tr key={b.id}>
                  <td>
                    <div className="cella-nome">{b.nome}</div>
                    {(conteggi.get(b.nomeNorm) ?? 0) > 1 && (
                      <div className="cella-sub" style={{ color: "var(--orange)" }}>
                        questo nome ha {conteggi.get(b.nomeNorm)} IBAN diversi
                      </div>
                    )}
                  </td>
                  <td className="iban">{formattaIban(b.iban)}</td>
                  <td>
                    {b.verificato ? (
                      <>
                        <span className="badge ok">
                          <span className="dot" />
                          verificato
                        </span>
                        <div className="cella-sub">
                          {b.verificatoDa} · {quando(b.verificatoIl)}
                        </div>
                      </>
                    ) : (
                      <span className="badge neutro">
                        <span className="dot" />
                        da verificare
                      </span>
                    )}
                  </td>
                  <td>
                    {operatore.ruolo !== "osservatore" && (
                      <form action={verificaBeneficiario}>
                        <input type="hidden" name="id" value={b.id} />
                        <button className="btn btn-secondario small" type="submit">
                          {b.verificato ? "Togli la spunta" : "Segna verificato"}
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
    </main>
  );
}
