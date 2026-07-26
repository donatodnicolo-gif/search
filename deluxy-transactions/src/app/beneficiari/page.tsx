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

export default async function Beneficiari() {
  const operatore = await operatoreCorrente();
  if (!operatore) redirect("/login");

  const beneficiari = await prisma.beneficiario.findMany({ orderBy: [{ nomeNorm: "asc" }, { creatoIl: "asc" }] });

  // Nomi con più di un IBAN: sono le righe da guardare per prime.
  const conteggi = new Map<string, number>();
  for (const b of beneficiari) conteggi.set(b.nomeNorm, (conteggi.get(b.nomeNorm) ?? 0) + 1);

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

      {beneficiari.length === 0 ? (
        <div className="vuoto">La rubrica si riempie da sola: ogni richiesta ci aggiunge il suo beneficiario.</div>
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
