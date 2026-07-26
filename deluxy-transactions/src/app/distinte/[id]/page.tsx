import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { operatoreCorrente } from "@/lib/sessione";
import { euro } from "@/lib/denaro";
import { formattaIban } from "@/lib/iban";
import { quando } from "@/components/Etichette";
import { segnaLottoPagato } from "@/app/actions";
import { ModuloSblocco } from "@/components/ModuloSblocco";
import { eIlPagatore, emailPagatore, sbloccoAttivo } from "@/lib/sblocco";

export const dynamic = "force-dynamic";

export default async function Distinta({ params }: { params: Promise<{ id: string }> }) {
  const operatore = await operatoreCorrente();
  if (!operatore) redirect("/login");
  const { id } = await params;

  const l = await prisma.lotto.findUnique({
    where: { id },
    include: { richieste: { orderBy: { riferimento: "asc" } } },
  });
  if (!l) notFound();

  const totale = l.richieste.reduce((s, r) => s + r.importoCent, 0);

  // Chi può far uscire il denaro, e se in questo momento è sbloccato.
  const pagatore = await eIlPagatore(operatore.email);
  const sbloccata = sbloccoAttivo(l);
  const codiceInCorso =
    (await prisma.sbloccoPagamento.count({
      where: { lottoId: l.id, usatoIl: null, annullatoIl: null, scadeIl: { gt: new Date() } },
    })) > 0;
  const pinImpostato = Boolean((await prisma.operatore.findUnique({ where: { id: operatore.id } }))?.pinHash);

  return (
    <main className="main">
      <a className="ritorno" href="/distinte">
        ← Torna alle distinte
      </a>
      <div className="page-head">
        <div>
          <h1 className="page-title">{l.riferimento}</h1>
          <p className="page-sub">
            {l.richieste.length} pagamenti · <span className="importo">{euro(totale)}</span> · stato {l.stato}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {sbloccata ? (
            <a className="btn" href={`/distinte/${l.id}/xml`}>
              Scarica XML SEPA
            </a>
          ) : (
            <span className="btn btn-secondario" aria-disabled="true" style={{ opacity: 0.55, cursor: "not-allowed" }}>
              XML SEPA bloccato
            </span>
          )}
          {l.stato !== "pagato" && operatore.ruolo !== "osservatore" && (
            <form action={segnaLottoPagato}>
              <input type="hidden" name="id" value={l.id} />
              <button className="btn btn-secondario" type="submit">
                Segna come pagata
              </button>
            </form>
          )}
        </div>
      </div>

      {pagatore ? (
        <ModuloSblocco
          id={l.id}
          totale={euro(totale)}
          sbloccoFinoA={
            sbloccata && l.sbloccoScadeIl
              ? l.sbloccoScadeIl.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })
              : null
          }
          codiceInCorso={codiceInCorso}
          pinImpostato={pinImpostato}
        />
      ) : (
        <div className="scheda">
          <div className="scheda-titolo">Sblocco del pagamento</div>
          <p className="firma-nota">
            Il file SEPA lo genera solo <strong>{await emailPagatore()}</strong>, con un codice che riceve per email e
            un PIN. Tu puoi preparare la distinta e controllarla: non puoi farla uscire.
          </p>
        </div>
      )}

      <div className="scheda">
        <div className="scheda-titolo">Tracciabilità</div>
        <div className="griglia-campi">
          <div className="campo">
            <dt>Creata da</dt>
            <dd>{l.creatoDa}</dd>
          </div>
          <div className="campo">
            <dt>Creata il</dt>
            <dd>{quando(l.creatoIl)}</dd>
          </div>
          <div className="campo">
            <dt>Esportata il</dt>
            <dd>{quando(l.esportatoIl)}</dd>
          </div>
          <div className="campo">
            <dt>Pagata il</dt>
            <dd>{quando(l.pagatoIl)}</dd>
          </div>
          <div className="campo">
            <dt>Sbloccata da</dt>
            <dd>{l.sbloccatoDa ?? "— (mai sbloccata)"}</dd>
          </div>
          <div className="campo">
            <dt>Sbloccata il</dt>
            <dd>{quando(l.sbloccatoIl)}</dd>
          </div>
          <div className="campo campo-largo">
            <dt>Impronta SHA-256 dell&apos;ultimo file generato</dt>
            <dd className="impronta">{l.improntaXml ?? "— (nessun file ancora generato)"}</dd>
          </div>
        </div>
        <p className="firma-nota">
          L&apos;impronta serve a dimostrare quale file è stato consegnato alla banca: ricalcolandola sul file salvato deve
          venire la stessa stringa.
        </p>
      </div>

      <div className="tabella-wrap">
        <table>
          <thead>
            <tr>
              <th>Riferimento</th>
              <th>Beneficiario</th>
              <th>Causale</th>
              <th className="num">Importo</th>
            </tr>
          </thead>
          <tbody>
            {l.richieste.map((r) => (
              <tr key={r.id}>
                <td>
                  <a href={`/richieste/${r.id}`} className="cella-nome">
                    {r.riferimento}
                  </a>
                </td>
                <td>
                  <div>{r.beneficiario}</div>
                  <div className="cella-sub iban">{formattaIban(r.iban)}</div>
                </td>
                <td className="cella-muta">{r.causale}</td>
                <td className="cella-num importo">{euro(r.importoCent)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
