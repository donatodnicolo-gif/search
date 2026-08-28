import { Badge } from "@/components/Badge";
import { RigaLink } from "@/components/RigaLink";
import { formattaEuro, formattaNumero } from "@/lib/dominio";
import {
  ETICHETTA_TIPO_GRUPPO,
  letturaRoas,
  presentazioneStatoGruppo,
  quotaSpesa,
  type GruppoConNumeri,
} from "@/lib/gruppi";

// La tabella dei gruppi di annunci, uguale ovunque compaia: pagina Gruppi,
// scheda campagna, Copy & annunci. Ordinata per spesa, perché la prima domanda
// è sempre "dove stanno finendo i soldi".
export function TabellaGruppi({
  righe,
  mostraCampagna = true,
  mostraQuota = false,
}: {
  righe: GruppoConNumeri[];
  mostraCampagna?: boolean;
  mostraQuota?: boolean;
}) {
  if (righe.length === 0) {
    return (
      <div className="vuoto-mini">
        Nessun gruppo: li manda lo script di Google Ads con <code>AZIONE = &quot;gruppi&quot;</code>.
      </div>
    );
  }
  const quote = mostraQuota ? quotaSpesa(righe) : null;

  return (
    <div style={{ overflowX: "auto" }}>
      <table>
        <thead>
          <tr>
            <th>Gruppo</th>
            <th>Stato</th>
            <th className="num">Spesa</th>
            {mostraQuota && <th className="num">Quota</th>}
            <th className="num" title="Quante volte gli annunci del gruppo sono comparsi">Comparse</th>
            <th className="num">Click</th>
            <th className="num" title="Click ÷ comparse">CTR</th>
            <th className="num" title="Costo per click">CPC</th>
            <th className="num">Conv.</th>
            <th className="num">CPA</th>
            <th className="num">Ricavi</th>
            <th className="num">ROAS</th>
          </tr>
        </thead>
        <tbody>
          {righe.map((g) => {
            const lettura = letturaRoas(g.roas, g.spesa, g.brand);
            const quota = quote?.get(g.id) ?? null;
            const statoGruppo = presentazioneStatoGruppo(g.stato, g.statoPiattaforma);
            return (
              // «La riga si apre col click» (Libro v1.6 §8): tutta la riga
              // porta al gruppo; il link alla campagna dentro la riga resta
              // suo (la guardia del click lo lascia passare).
              <RigaLink key={g.id} href={`/gruppi/${g.id}`} className="riga-link">
                <td style={{ maxWidth: 320 }}>
                  <a className="cella-nome" href={`/gruppi/${g.id}`}>{g.nome}</a>
                  <div className="cella-sub">
                    {/* Se il nome è stato cambiato qui, quello di Google resta
                        leggibile: è l'unico modo di ritrovare il gruppo
                        nell'interfaccia di Google Ads. */}
                    {g.nomeGoogle !== g.nome && (
                      <span title="Il nome che ha su Google Ads">su Google: {g.nomeGoogle} · </span>
                    )}
                    {mostraCampagna && (
                      <a href={`/campagne/${g.campagnaId}`} style={{ color: "inherit" }}>{g.campagna}</a>
                    )}
                    {g.tipo && (
                      <span>
                        {mostraCampagna ? " · " : ""}
                        {ETICHETTA_TIPO_GRUPPO[g.tipo] ?? g.tipo}
                      </span>
                    )}
                  </div>
                </td>
                <td>
                  {/* Prima il fatto (gira o non gira su Google), poi il nostro
                      giudizio: vedi presentazioneStatoGruppo. */}
                  <Badge testo={statoGruppo.testo} colore={statoGruppo.colore} />
                  {/* Lo stato di Google si vede sempre, anche quando gira: se
                      comparisse solo nei guai, la sua assenza si leggerebbe
                      come "il dato manca" invece che come "è attivo". */}
                  <div className="cella-sub" title={statoGruppo.codice ?? "nessuno stato ricevuto dalla piattaforma"}>
                    {statoGruppo.sotto}
                  </div>
                </td>
                <td className="num">{formattaEuro(g.spesa)}</td>
                {mostraQuota && (
                  <td className="num cella-muta">{quota != null ? `${Math.round(quota * 100)}%` : "—"}</td>
                )}
                <td className="num cella-muta">{formattaNumero(g.impression)}</td>
                <td className="num cella-muta">{formattaNumero(g.click)}</td>
                <td className="num cella-muta">
                  {g.impression > 0 ? `${((g.click / g.impression) * 100).toFixed(1)}%` : "—"}
                </td>
                <td className="num cella-muta">{g.click > 0 ? formattaEuro(g.spesa / g.click) : "—"}</td>
                <td className="num cella-muta">{formattaNumero(Math.round(g.conversioni * 10) / 10)}</td>
                <td className="num cella-muta">{g.cpa != null ? formattaEuro(g.cpa) : "—"}</td>
                <td className="num">{formattaEuro(g.ricavi)}</td>
                <td className="num" style={{ color: lettura.colore, fontWeight: 600 }} title={lettura.spiega}>
                  {lettura.testo}
                </td>
              </RigaLink>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
