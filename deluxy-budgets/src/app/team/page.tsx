import Link from "next/link";
import {
  ANNO_CORRENTE,
  caricaAnno,
  costoPersonaAnno,
  costoPersonaMese,
  personeDelTeam,
} from "@/lib/calc";
import { primoMeseAperto } from "@/lib/periodo";
import { eur, MESI } from "@/lib/format";
import { TeamEditor } from "@/components/TeamEditor";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const dati = await caricaAnno(ANNO_CORRENTE);

  // I mesi già chiusi: quelli in cui il costo del personale è **sostenuto**,
  // non previsto. Il mese in corso resta fuori — è a metà, e accanto a mesi
  // interi farebbe sembrare che si spenda meno.
  const aperto = primoMeseAperto(dati.year);
  const mesiChiusi = Array.from({ length: Math.max(0, Math.min(aperto - 1, 12)) }, (_, i) => i + 1);
  const etichettaChiusi = mesiChiusi.length
    ? `${MESI[mesiChiusi[0] - 1]}–${MESI[mesiChiusi[mesiChiusi.length - 1] - 1]}`
    : "nessun mese chiuso";

  const sostenuto = (p: Parameters<typeof costoPersonaAnno>[0]) =>
    mesiChiusi.reduce((s, m) => s + costoPersonaMese(p, m), 0);

  // Ogni team con il suo organico e il costo del lavoro dell'anno.
  const team = dati.team.map((t) => {
    const persone = personeDelTeam(dati, t.id);
    return {
      ...t,
      persone: persone.map((p) => ({
        id: p.id,
        nome: p.nome,
        ruolo: p.ruolo,
        tipo: p.tipo,
        costo: costoPersonaAnno(p),
      })),
      costo: persone.reduce((s, p) => s + costoPersonaAnno(p), 0),
      sostenuto: persone.reduce((s, p) => s + sostenuto(p), 0),
      teste: persone.length,
    };
  });

  const persSenzaTeam = personeDelTeam(dati, null);
  const senzaTeam = persSenzaTeam.map((p) => ({
    id: p.id,
    nome: p.nome,
    ruolo: p.ruolo,
    tipo: p.tipo,
    costo: costoPersonaAnno(p),
  }));

  const righe = [
    ...team.map((t) => ({ nome: t.nome, teste: t.teste, sostenuto: t.sostenuto, anno: t.costo })),
    ...(persSenzaTeam.length
      ? [
          {
            nome: "Senza team",
            teste: persSenzaTeam.length,
            sostenuto: persSenzaTeam.reduce((s, p) => s + sostenuto(p), 0),
            anno: persSenzaTeam.reduce((s, p) => s + costoPersonaAnno(p), 0),
          },
        ]
      : []),
  ].sort((a, b) => b.anno - a.anno);

  const totSostenuto = righe.reduce((s, r) => s + r.sostenuto, 0);
  const totAnno = righe.reduce((s, r) => s + r.anno, 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Team</h1>
          <p className="page-caption">
            Le squadre aziendali con il loro responsabile e il costo del lavoro {dati.year}.
            Le persone si assegnano a un team dalla scheda in Dipendenti.
          </p>
        </div>
      </div>

      {/* ⭐ 27/08/2026, richiesta dell'utente: «devi farmi vedere i costi
          consuntivati e la proiezione a tutto il 2026». Qui c'erano solo i
          totali dell'anno: non si poteva sapere quanto era già uscito. */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-head">
          <h2 className="card-title">Quanto è già costato, e quanto costerà</h2>
          <p className="card-sub">
            Il <strong>sostenuto</strong> sono i mesi chiusi ({etichettaChiusi}); l&apos;<strong>anno</strong> è
            il costo di tutti e dodici i mesi.
          </p>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Team</th>
                <th className="num">Persone</th>
                <th className="num">Sostenuto {etichettaChiusi}</th>
                <th className="num">Ancora da sostenere</th>
                <th className="num">Anno {dati.year}</th>
              </tr>
            </thead>
            <tbody>
              {righe.map((r) => (
                <tr key={r.nome}>
                  <td>{r.nome}</td>
                  <td className="num muted">{r.teste}</td>
                  <td className="num" style={{ fontWeight: 600 }}>{eur(r.sostenuto)}</td>
                  <td className="num muted">{eur(r.anno - r.sostenuto)}</td>
                  <td className="num">{eur(r.anno)}</td>
                </tr>
              ))}
              <tr className="tot">
                <td style={{ fontWeight: 600 }}>Totale</td>
                <td className="num">{righe.reduce((s, r) => s + r.teste, 0)}</td>
                <td className="num" style={{ fontWeight: 600 }}>{eur(totSostenuto)}</td>
                <td className="num">{eur(totAnno - totSostenuto)}</td>
                <td className="num" style={{ fontWeight: 600 }}>{eur(totAnno)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          ⚠️ <strong>L&apos;anno non è la media dei mesi chiusi moltiplicata per dodici</strong>, ed è la
          differenza che conta: il roster sa in quali mesi ciascuno è a carico — chi è entrato a
          settembre, chi ha smesso a maggio, il TFR che cade nel mese in cui il rapporto finisce.
          Proiettare una media qui direbbe che un assunto di settembre è costato anche a gennaio.
          Per lo stesso motivo il <strong>mese in corso resta fuori</strong> dal sostenuto: è a metà.
          Il costo è quello a budget dall&apos;anagrafica{" "}
          <Link href="/dipendenti" style={{ color: "var(--blue)" }}>Dipendenti</Link> (lordo +
          contributi + TFR), non quello che è uscito dalla banca: i due numeri si confrontano in{" "}
          <Link href="/consuntivo/personale" style={{ color: "var(--blue)" }}>Consuntivo → personale</Link>.
        </p>
      </div>

      <TeamEditor team={team} senzaTeam={senzaTeam} />
    </>
  );
}
