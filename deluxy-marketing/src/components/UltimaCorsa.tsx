import { prisma } from "@/lib/db";
import { ETICHETTA_CANALE, formattaDataOra } from "@/lib/dominio";

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

function daQuanto(d: Date): { testo: string; ore: number } {
  const min = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
  if (min < 60) return { testo: `${min} min fa`, ore: 0 };
  const ore = Math.floor(min / 60);
  if (ore < 24) return { testo: `${ore} ${ore === 1 ? "ora" : "ore"} fa`, ore };
  const giorni = Math.floor(ore / 24);
  return { testo: `${giorni} ${giorni === 1 ? "giorno" : "giorni"} fa`, ore };
}

export async function UltimaCorsa() {
  const [consegne, account] = await Promise.all([
    // Una riga per account: l'ultima consegna, qualunque tipo di dato fosse.
    prisma.ricezioneDati.findMany({
      orderBy: { ricevutoIl: "desc" },
      take: 400,
      select: { account: true, fonte: true, tipo: true, ricevutoIl: true, righe: true },
    }),
    prisma.accountAdv.findMany({
      where: { attivo: true },
      select: { idEsterno: true, nome: true, piattaforma: true },
    }),
  ]);

  const soloCifre = (s: string) => s.replace(/\D/g, "");
  const ultima = new Map<string, { quando: Date; tipo: string; righe: number; fonte: string }>();
  for (const c of consegne) {
    const k = soloCifre(c.account ?? "");
    if (!k || ultima.has(k)) continue;
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
