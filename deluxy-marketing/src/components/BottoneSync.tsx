import { avviaSyncDrive } from "@/lib/azioni";
import { prisma } from "@/lib/db";
import { daQuanto, formattaDataOra } from "@/lib/dominio";
import { BottoneSyncAzione } from "./BottoneSyncAzione";

// Bottone "Sincronizza": rilegge la cartella Drive e aggiorna l'indice.
// Sotto al bottone resta scritto QUANDO è stata l'ultima volta e com'è andata.
// Senza la data non si distingue "sincronizzato poco fa" da "fermo da giorni",
// e senza l'esito non si capisce se il click ha fatto qualcosa — soprattutto
// quando la corsa non trova niente di nuovo, che è il caso più frequente e
// quello che somiglia di più a un bottone rotto.
//
// ⚠️⚠️ QUESTA RIGA DICEVA IL FALSO, misurato il 27/08/2026. Leggeva il
// `RegistroEvento` — che scrive **solo** `avviaSyncDrive`, cioè il bottone —
// e in home si leggeva «✓ 23 giorni fa · 04/08/2026» in arancione, mentre la
// sync era arrivata in fondo quella mattina alle 06:10 con 689 documenti. Da
// quando esiste il cron `/api/cron/drive` (25/08) la sync gira quasi sempre
// SENZA che nessuno prema, e l'esito di quel giro viveva solo nel JSON di
// risposta del cron: nessuna schermata lo vedeva.
// La fonte giusta è la riga `SyncDrive`, che è la traccia vera — aperta prima
// di cominciare e chiusa con l'esito, da qualunque strada parta la sync
// (bottone, cron o script). Lo dice già il commento in `avviaSyncDrive`.
export async function BottoneSync({ etichetta = "Sincronizza" }: { etichetta?: string }) {
  const ultima = await prisma.syncDrive
    .findFirst({ orderBy: { iniziataIl: "desc" } })
    .catch(() => null);

  // ⚠️ Lo stato è una COLONNA, non una frase da cui indovinare: prima si
  // cercavano "non raggiungibile" / "INTERROTTA" dentro il testo del registro,
  // e un messaggio scritto in modo diverso passava per una corsa riuscita.
  const fallita = ultima?.stato === "errore";
  const interrotta = ultima?.stato === "interrotta";
  const inCorso = ultima?.stato === "in_corso";

  // Quando non cambia niente il messaggio grezzo ("nuovi 0 · aggiornati 0")
  // sembra un fallimento: va detto che è andata bene ed era già tutto a posto.
  const nulla =
    ultima != null && ultima.nuovi === 0 && ultima.aggiornati === 0 && ultima.rimossi === 0;

  const numeri = ultima
    ? `trovati ${ultima.trovati} · nuovi ${ultima.nuovi} · aggiornati ${ultima.aggiornati} · rimossi ${ultima.rimossi} · analisi importate ${ultima.analisi}`
    : "";

  const messaggio = fallita
    ? `non riuscita — ${ultima?.messaggio ?? "vedi Impostazioni"}`
    : inCorso
      ? "in corso adesso"
      : interrotta
        ? "interrotta a metà, riprende alla prossima"
        : nulla
          ? `già aggiornato, ${ultima?.trovati ?? 0} documenti`
          : numeri;

  // ⚠️ Il momento che conta è quando la corsa è ARRIVATA IN FONDO. Una corsa
  // iniziata e mai finita non è un indice aggiornato: si mostra l'inizio, ma
  // il testo dice che non è finita.
  const quando = ultima?.completataIl ?? ultima?.iniziataIl ?? null;
  const vecchia = quando ? Date.now() - quando.getTime() > 3 * 86_400_000 : false;
  const colore = fallita ? "var(--red)" : vecchia ? "var(--orange)" : undefined;

  // ⚠️ I conteggi escono come VOCI SEPARATE, non come una frase con i «·»
  // dentro. Con la frase, la riga andava a capo dove capitava e il 08/09/2026
  // si leggeva «… rimossi 0 · analisi / importate 3»: spezzata a metà proprio
  // sulla voce che dice quante analisi sono entrate. Il separatore adesso è la
  // distanza fra le voci (CSS `.sync-esito`), e ogni voce è indivisibile.
  // Il `title` resta la frase intera: lì una riga sola ci sta.
  const prosa = fallita || inCorso || interrotta || nulla;
  const voci = prosa ? [messaggio] : numeri.split(" · ").filter(Boolean);

  return (
    <div className="sync-blocco">
      <form action={avviaSyncDrive}>
        <BottoneSyncAzione etichetta={etichetta} />
      </form>
      {/* ⚠️ Il `title` portava i CONTEGGI: quando la sync fallisce il testo a
          schermo diventa «non riuscita — il motivo» ma il tooltip continuava a
          mostrare «trovati 689 · nuovi 4…», cioè proprio nel caso in cui serve
          il motivo, il motivo non era recuperabile in nessun modo. */}
      {ultima && quando ? (
        <div className="sync-esito" style={colore ? { color: colore } : undefined} title={messaggio}>
          <span className="sync-voce">
            {fallita ? "⚠ " : interrotta || inCorso ? "◐ " : "✓ "}
            <b>{daQuanto(quando).testo}</b>
          </span>
          <span className="sync-voce">{formattaDataOra(quando)}</span>
          {voci.map((v, i) => (
            <span
              key={i}
              className={prosa ? "sync-prosa" : "sync-voce"}
              style={{ color: "var(--text-tertiary)" }}
            >
              {v}
            </span>
          ))}
        </div>
      ) : (
        <div className="sync-esito" style={{ color: "var(--text-tertiary)" }}>
          Mai sincronizzato
        </div>
      )}
    </div>
  );
}
