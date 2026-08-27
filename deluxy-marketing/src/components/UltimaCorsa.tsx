import { prisma } from "@/lib/db";
import { daQuanto, ETICHETTA_CANALE, formattaDataOra } from "@/lib/dominio";

// QUANDO SI SONO FATTI VIVI I CONNETTORI, uno per uno.
//
// Gli Script di Google girano dentro Google Ads e nessuno può avviarli da
// fuori: se uno smette di partire, l'app non se ne accorge da sola — continua
// a mostrare gli ultimi numeri arrivati, che sembrano aggiornati. L'unico modo
// di accorgersene è guardare QUANDO ciascun account si è fatto vivo l'ultima
// volta, ed è per questo che sta in cima alla home e non in una pagina di
// servizio.
//
// La soglia non è un'opinione: gli script sono programmati quotidiani, quindi
// oltre 24 ore c'è qualcosa che non va, oltre 48 è fermo.

export async function UltimaCorsa() {
  // ⚠️⚠️ QUI C'ERA UN ALLARME FALSO, misurato il 27/08/2026: la tabella
  // diceva «Cakedesign Google Ads — MAI PARTITO» mentre quell'account aveva
  // consegnato quella notte alle 02:42. Il motivo: si leggevano le ULTIME 400
  // consegne e si raggruppava a mano. Ma le consegne non sono distribuite in
  // parti uguali — Gifts ne manda ~236 al giorno, Flowers ~139, Meta 24 —
  // e nelle sette ore dopo la corsa di Cake le altre ne avevano già scritte
  // 400: l'unica riga che serviva era caduta fuori dalla finestra.
  //
  // È la trappola del «take» che nasconde i risultati veri, e qui costava il
  // doppio: questo riquadro ESISTE per accorgersi di uno script fermo, e
  // gridava al lupo sull'unico account che stava lavorando. Un allarme che
  // mente si impara a ignorarlo, e allora smette di funzionare anche per
  // quelli veri.
  //
  // La domanda giusta è «l'ultima consegna PER ACCOUNT»: si chiede al
  // database (un massimo per gruppo), non a una finestra sperando che basti.
  const [ultimePerAccount, account] = await Promise.all([
    prisma.ricezioneDati.groupBy({
      by: ["account"],
      _max: { ricevutoIl: true },
    }),
    prisma.accountAdv.findMany({
      where: { attivo: true },
      select: { idEsterno: true, nome: true, piattaforma: true },
    }),
  ]);

  // Il dettaglio (che dato era, quante righe) solo per quelle N righe: una
  // coppia account+istante è una riga sola.
  const coppie = ultimePerAccount.filter(
    (g): g is typeof g & { account: string; _max: { ricevutoIl: Date } } =>
      Boolean(g.account) && g._max.ricevutoIl != null
  );
  const dettagli = coppie.length
    ? await prisma.ricezioneDati.findMany({
        where: {
          OR: coppie.map((g) => ({ account: g.account, ricevutoIl: g._max.ricevutoIl })),
        },
        select: { account: true, fonte: true, tipo: true, ricevutoIl: true, righe: true },
      })
    : [];

  const soloCifre = (s: string) => s.replace(/\D/g, "");
  const ultima = new Map<string, { quando: Date; tipo: string; righe: number; fonte: string }>();
  for (const c of dettagli) {
    const k = soloCifre(c.account ?? "");
    if (!k) continue;
    const gia = ultima.get(k);
    // Due account scritti in modo diverso («846-090-5423» e «8460905423»)
    // finiscono nella stessa chiave: vince la consegna più recente.
    if (gia && gia.quando >= c.ricevutoIl) continue;
    ultima.set(k, { quando: c.ricevutoIl, tipo: c.tipo, righe: c.righe, fonte: c.fonte });
  }

  // Chi DEVE mandare dati: le piattaforme pubblicitarie. Shopify e GA4 sono
  // censiti come account ma non alimentano l'app (gli ordini arrivano dal
  // registro Orders), quindi contarli fra i "fermi" sarebbe gridare al lupo —
  // e un allarme che grida al lupo si impara a ignorarlo.
  const CONNETTORI = ["google_ads", "meta_ads", "tiktok"];
  const tutte = account
    .map((a) => ({ ...a, u: ultima.get(soloCifre(a.idEsterno)) ?? null }))
    .sort((x, y) => (y.u?.quando.getTime() ?? 0) - (x.u?.quando.getTime() ?? 0));

  const righe = tutte.filter((r) => CONNETTORI.includes(r.piattaforma));
  const altri = tutte.filter((r) => !CONNETTORI.includes(r.piattaforma));

  if (righe.length === 0) return null;

  // Fermo = ha consegnato in passato e adesso tace. Chi non ha MAI consegnato
  // non è fermo: non è mai partito, ed è un problema diverso.
  const fermi = righe.filter((r) => r.u && daQuanto(r.u.quando).ore >= 24).length;
  const maiPartiti = righe.filter((r) => !r.u).length;

  return (
    <section className="scheda">
      <div className="scheda-titolo">
        Ultima corsa dei connettori
        {fermi > 0 && (
          <span style={{ color: "var(--red)", fontWeight: 400 }}>
            {" "}
            · {fermi} {fermi === 1 ? "fermo da oltre un giorno" : "fermi da oltre un giorno"}
          </span>
        )}
        {maiPartiti > 0 && (
          <span style={{ color: "var(--orange)", fontWeight: 400 }}>
            {" "}
            · {maiPartiti} {maiPartiti === 1 ? "non ha mai consegnato" : "non hanno mai consegnato"}
          </span>
        )}
      </div>

      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Account</th>
              <th>Canale</th>
              <th>Ultima consegna</th>
              <th>Cosa ha mandato</th>
              <th className="num">Righe</th>
            </tr>
          </thead>
          <tbody>
            {righe.map((r) => {
              const q = r.u ? daQuanto(r.u.quando) : null;
              const colore = !q ? "var(--red)" : q.ore >= 48 ? "var(--red)" : q.ore >= 24 ? "var(--orange)" : "var(--green)";
              return (
                <tr key={r.idEsterno}>
                  <td className="cella-nome">{r.nome}</td>
                  <td className="cella-muta">{ETICHETTA_CANALE[r.piattaforma] ?? r.piattaforma}</td>
                  <td style={{ color: colore, fontWeight: q && q.ore < 24 ? 400 : 600 }}>
                    {r.u ? (
                      <>
                        {q!.testo}
                        <div className="cella-sub" style={{ color: "var(--text-tertiary)" }}>
                          {formattaDataOra(r.u.quando)}
                        </div>
                      </>
                    ) : (
                      "mai partito"
                    )}
                  </td>
                  <td className="cella-muta">{r.u?.tipo ?? "—"}</td>
                  <td className="num cella-muta">{r.u ? r.u.righe : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {altri.length > 0 && (
        <p className="cella-sub" style={{ marginTop: 12, whiteSpace: "normal" }}>
          Non in elenco perché non alimentano l&apos;app:{" "}
          {altri.map((a) => a.nome).join(", ")}. Sono censiti per sapere su quali account si
          lavora, ma i loro dati arrivano da altre strade (gli ordini dal registro Orders).
        </p>
      )}

      <p className="cella-sub" style={{ marginTop: 12, whiteSpace: "normal" }}>
        Gli script di Google girano <b>dentro</b> Google Ads e non si avviano da fuori: se uno
        smette di partire, l&apos;app non se ne accorge da sola — continua a mostrare gli ultimi
        numeri arrivati, che sembrano aggiornati. Sono programmati quotidiani, quindi{" "}
        <b>oltre 24 ore c&apos;è qualcosa da guardare</b> (colonna Frequenza in Google Ads) e oltre
        48 è fermo. Meta e TikTok invece li chiama l&apos;app: lì il ritardo è dell&apos;app, non
        della piattaforma. Il dettaglio di ogni consegna è in{" "}
        <a href="/ricezione">Dati in arrivo</a>.
      </p>
    </section>
  );
}
