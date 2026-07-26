import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { operatoreCorrente } from "@/lib/sessione";
import { euro } from "@/lib/denaro";
import { formattaIban, ibanSepa } from "@/lib/iban";
import { motiviDa } from "@/lib/richieste";
import { sigilloRichiesta } from "@/lib/audit";
import { BadgeRischio, BadgeStato, Firme, quando } from "@/components/Etichette";
import { ModuloFirma } from "@/components/ModuloFirma";

// Dettaglio di una richiesta: tutto quello che serve per decidere, in una
// schermata sola, con i motivi di rischio in evidenza e la storia sotto.

export const dynamic = "force-dynamic";

export default async function Dettaglio({ params }: { params: Promise<{ id: string }> }) {
  const operatore = await operatoreCorrente();
  if (!operatore) redirect("/login");
  const { id } = await params;

  const r = await prisma.richiesta.findUnique({
    where: { id },
    include: {
      approvazioni: { include: { operatore: { select: { nome: true, email: true } } }, orderBy: { creataIl: "asc" } },
      eventi: { orderBy: { seq: "asc" } },
      lotto: true,
    },
  });
  if (!r) notFound();

  const motivi = motiviDa(r.motiviRischio);
  const firme = r.approvazioni.filter((a) => a.esito === "approvata").length;
  const necessarie = r.doppiaFirma ? 2 : 1;
  const giaVotato = r.approvazioni.some((a) => a.operatoreId === operatore.id);
  const decidibile = r.stato === "in_attesa" || r.stato === "sospesa";
  const sigilloOk = sigilloRichiesta(r) === r.sigillo;

  // Altri IBAN già visti per lo stesso beneficiario: è il confronto che fa
  // vedere a occhio un cambio di coordinate.
  const altriIban = await prisma.beneficiario.findMany({
    where: { nomeNorm: r.beneficiarioNorm, iban: { not: r.iban } },
  });

  return (
    <main className="main">
      <a className="ritorno" href="/">
        ← Torna alla coda
      </a>
      <div className="page-head">
        <div>
          <h1 className="page-title">{r.riferimento}</h1>
          <p className="page-sub">
            richiesta da <strong>{r.origine}</strong>
            {r.riferimentoEsterno ? ` · riferimento ${r.riferimentoEsterno}` : ""}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <BadgeStato stato={r.stato} />
          <Firme raccolte={firme} necessarie={necessarie} />
        </div>
      </div>

      {!sigilloOk && (
        <div className="avviso-errore">
          Il sigillo non corrisponde: i dati di questa richiesta sono stati modificati fuori dall&apos;app. Bloccata:
          nessuno può approvarla.
        </div>
      )}

      <div className="scheda">
        <div className="scheda-titolo">Pagamento</div>
        <div className="importo importo-grande">{euro(r.importoCent)}</div>
        <div className="griglia-campi" style={{ marginTop: 18 }}>
          <div className="campo">
            <dt>Beneficiario</dt>
            <dd>{r.beneficiario}</dd>
          </div>
          <div className="campo">
            <dt>IBAN</dt>
            <dd className="iban">{formattaIban(r.iban)}</dd>
          </div>
          <div className="campo">
            <dt>BIC</dt>
            <dd>{r.bic ?? "—"}</dd>
          </div>
          <div className="campo">
            <dt>Area</dt>
            <dd>{ibanSepa(r.iban) ? "SEPA" : "fuori SEPA"}</dd>
          </div>
          <div className="campo campo-largo">
            <dt>Causale</dt>
            <dd>{r.causale}</dd>
          </div>
          {r.note && (
            <div className="campo campo-largo">
              <dt>Note</dt>
              <dd>{r.note}</dd>
            </div>
          )}
          <div className="campo">
            <dt>Scadenza</dt>
            <dd>{r.scadenza ? quando(r.scadenza) : "—"}</dd>
          </div>
          <div className="campo">
            <dt>Categoria</dt>
            <dd>{r.categoria ?? "—"}</dd>
          </div>
          <div className="campo">
            <dt>Distinta</dt>
            <dd>{r.lotto ? <a href={`/distinte/${r.lotto.id}`}>{r.lotto.riferimento}</a> : "—"}</dd>
          </div>
        </div>
      </div>

      <div className="scheda">
        <div className="scheda-titolo">
          Valutazione del rischio <BadgeRischio punteggio={r.rischio} />
        </div>
        {motivi.length === 0 ? (
          <p className="testo-guida">Nessun elemento anomalo rilevato al momento della creazione.</p>
        ) : (
          <ul className="motivi-rischio">
            {motivi.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        )}
        {altriIban.length > 0 && (
          <div className="avviso-attenzione" style={{ marginTop: 14, marginBottom: 0 }}>
            Per <strong>{r.beneficiario}</strong> in rubrica ci sono anche:{" "}
            {altriIban.map((b) => (
              <span key={b.id} className="iban" style={{ marginRight: 10 }}>
                {formattaIban(b.iban)}
                {b.verificato ? " (verificato)" : ""}
              </span>
            ))}
            . Prima di firmare, conferma le coordinate con un canale diverso da quello che le ha mandate.
          </div>
        )}
        {r.doppiaFirma && (
          <p className="firma-nota" style={{ marginTop: 12 }}>
            Questa richiesta ha bisogno di <strong>due firme di operatori diversi</strong>.
          </p>
        )}
      </div>

      {decidibile && sigilloOk && operatore.ruolo !== "osservatore" && !giaVotato && (
        <ModuloFirma id={r.id} richiedeCodice={operatore.totpAttivo} importo={euro(r.importoCent)} />
      )}
      {decidibile && giaVotato && (
        <div className="avviso-ok">
          Hai già espresso la tua decisione su questa richiesta. Serve un altro operatore per completare la doppia firma.
        </div>
      )}

      <div className="scheda">
        <div className="scheda-titolo">Firme</div>
        {r.approvazioni.length === 0 ? (
          <p className="testo-guida">Ancora nessuna decisione.</p>
        ) : (
          <ul className="storia">
            {r.approvazioni.map((a) => (
              <li key={a.id}>
                <span className="storia-data">{quando(a.creataIl)}</span>
                <span>
                  <strong>{a.operatore.nome}</strong> — {a.esito}
                  {a.motivo ? `: ${a.motivo}` : ""}
                </span>
                <span className="storia-autore">{a.ip ?? ""}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="scheda">
        <div className="scheda-titolo">Storia</div>
        <ul className="storia">
          {r.eventi.map((e) => (
            <li key={e.seq}>
              <span className="storia-data">{quando(e.creatoIl)}</span>
              <span>{e.tipo}</span>
              <span className="storia-autore">{e.attore}</span>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
