import Link from "next/link";
import type { Partner } from "@prisma/client";
import { dataIt, euro } from "@/lib/format";
import { ivato } from "@/lib/calc";
import { risolviAnagrafica, contattoAmministrativo } from "@/lib/anagrafiche";
import { importaContattoAmministrativo } from "@/lib/actions";

type FatturaAperta = {
  id: string;
  numero: string | null;
  imponibile: number;
  aliquotaIva: number;
  pagata: boolean;
  scadenza: Date | null;
  sollecitoInviatoIl: Date | null;
};

// Referente amministrativo del partner: chi riceve solleciti e pro-forma.
// Si compila a mano (scheda partner → Modifica) oppure si importa in un click
// dal registro Anagrafiche, che resta la fonte di verità anagrafica.
// Da qui si sollecitano direttamente le fatture aperte.
export async function ContattoAmministrativo({
  partner,
  fattureAperte,
}: {
  partner: Partner;
  fattureAperte: FatturaAperta[];
}) {
  const anagrafica = await risolviAnagrafica(partner.nome, partner.anagraficaId);
  const dalRegistro = contattoAmministrativo(anagrafica);
  // proponiamo l'importazione solo se aggiunge davvero qualcosa
  const daImportare =
    dalRegistro &&
    (dalRegistro.email ?? "") !== (partner.ammEmail ?? "") &&
    Boolean(dalRegistro.email || dalRegistro.telefono);

  const destinatario = partner.ammEmail ?? partner.email;
  const scadute = fattureAperte.filter((f) => f.scadenza && f.scadenza < new Date());

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h2 className="section-title" style={{ marginTop: 0, marginBottom: 6 }}>Contatto amministrativo</h2>
          {partner.ammNome || partner.ammEmail || partner.ammTelefono ? (
            <>
              <div style={{ fontSize: 15, fontWeight: 600 }}>
                {partner.ammNome ?? "—"}
                {partner.ammRuolo && (
                  <span className="badge neutral" style={{ marginLeft: 8, fontWeight: 500 }}>
                    <span className="dot" />{partner.ammRuolo}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 13.5, color: "var(--text-secondary)", marginTop: 4 }}>
                {partner.ammEmail ?? "email non indicata"}
                {partner.ammTelefono ? ` · ${partner.ammTelefono}` : ""}
              </div>
            </>
          ) : (
            <p style={{ fontSize: 13.5, color: "var(--text-secondary)", maxWidth: 560 }}>
              Nessun referente amministrativo. Serve per indirizzare solleciti e pro-forma a chi
              paga davvero le fatture: compilalo in{" "}
              <Link href={`/partner/${partner.id}/modifica`} style={{ color: "var(--blue)" }}>Modifica partner</Link>
              {daImportare ? " oppure importalo dal registro." : "."}
              {!destinatario && " Al momento non c'è nessuna email a cui scrivere."}
            </p>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {daImportare && (
            <form action={importaContattoAmministrativo.bind(null, partner.id)}>
              <button
                className="btn secondary small"
                type="submit"
                title={`Copia dal registro: ${dalRegistro.nome ?? dalRegistro.ruolo ?? "contatto"}${dalRegistro.email ? ` · ${dalRegistro.email}` : ""}`}
              >
                Importa da Anagrafiche
              </button>
            </form>
          )}
          <Link href={`/partner/${partner.id}/modifica`} className="btn secondary small">Modifica</Link>
        </div>
      </div>

      {daImportare && (
        <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
          Nel registro Anagrafiche risulta{" "}
          <strong>{dalRegistro.nome ?? "un contatto"}</strong>
          {dalRegistro.ruolo ? ` (${dalRegistro.ruolo})` : ""}
          {dalRegistro.email ? ` · ${dalRegistro.email}` : ""}
          {dalRegistro.telefono ? ` · ${dalRegistro.telefono}` : ""}.
        </p>
      )}

      {/* Solleciti direttamente da qui, senza passare dallo scadenzario */}
      <div style={{ marginTop: 16, borderTop: "1px solid var(--hairline)", paddingTop: 14 }}>
        {fattureAperte.length === 0 ? (
          <p style={{ fontSize: 13.5, color: "var(--text-secondary)" }}>
            Nessuna fattura aperta da sollecitare.
          </p>
        ) : (
          <>
            <div style={{ fontSize: 13.5, marginBottom: 10 }}>
              <strong>{fattureAperte.length}</strong> fatture aperte
              {scadute.length > 0 && (
                <span className="badge red" style={{ marginLeft: 8 }}>
                  <span className="dot" />{scadute.length} scadute · {euro(scadute.reduce((a, f) => a + ivato(f), 0))}
                </span>
              )}
              {destinatario ? (
                <span style={{ color: "var(--text-secondary)" }}> · il sollecito parte verso <strong>{destinatario}</strong></span>
              ) : (
                <span style={{ color: "var(--orange)" }}> · nessun destinatario: indica l&apos;email amministrativa</span>
              )}
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>N° fattura</th><th>Scadenza</th>
                    <th className="num">IVA incl.</th><th>Ultimo sollecito</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {fattureAperte.map((f) => (
                    <tr key={f.id}>
                      <td>
                        <Link href={`/fatture/${f.id}`} style={{ color: "var(--blue)" }}>{f.numero ?? "s.n."}</Link>
                      </td>
                      <td>
                        {f.scadenza && f.scadenza < new Date() ? (
                          <span className="badge red"><span className="dot" />{dataIt(f.scadenza)}</span>
                        ) : (
                          <span className="badge blue"><span className="dot" />{dataIt(f.scadenza)}</span>
                        )}
                      </td>
                      <td className="num">{euro(ivato(f))}</td>
                      <td className="muted">{f.sollecitoInviatoIl ? dataIt(f.sollecitoInviatoIl) : "mai"}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <Link className="btn small primary" href={`/solleciti/${f.id}?da=partner`}>
                          {f.sollecitoInviatoIl ? "Sollecita ancora" : "Invia sollecito"}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
