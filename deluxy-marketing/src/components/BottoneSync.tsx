import { avviaSyncDrive } from "@/lib/azioni";
import { prisma } from "@/lib/db";
import { formattaDataOra } from "@/lib/dominio";
import { BottoneSyncAzione } from "./BottoneSyncAzione";

// Bottone "Sincronizza": rilegge la cartella Drive e aggiorna l'indice.
// Sotto al bottone resta scritto QUANDO è stata l'ultima volta e com'è andata.
// Senza la data non si distingue "sincronizzato poco fa" da "fermo da giorni",
// e senza l'esito non si capisce se il click ha fatto qualcosa — soprattutto
// quando la corsa non trova niente di nuovo, che è il caso più frequente e
// quello che somiglia di più a un bottone rotto.
function quando(d: Date): string {
  const min = Math.round((Date.now() - d.getTime()) / 60_000);
  if (min < 1) return "adesso";
  if (min < 60) return `${min} min fa`;
  const ore = Math.round(min / 60);
  if (ore < 24) return `${ore} ${ore === 1 ? "ora" : "ore"} fa`;
  const gg = Math.round(ore / 24);
  return `${gg} ${gg === 1 ? "giorno" : "giorni"} fa`;
}

export async function BottoneSync({ etichetta = "Sincronizza" }: { etichetta?: string }) {
  const ultima = await prisma.registroEvento
    .findFirst({ where: { entita: "drive", tipo: "sync" }, orderBy: { creatoIl: "desc" } })
    .catch(() => null);

  const dettaglio = ultima?.dettaglio ?? "";
  const fallita =
    dettaglio.toLowerCase().includes("non raggiungibile") ||
    dettaglio.toLowerCase().includes("manca la chiave") ||
    dettaglio.toLowerCase().includes("drive api");
  const interrotta = dettaglio.includes("INTERROTTA");

  // Quando non cambia niente il messaggio grezzo ("nuovi 0 · aggiornati 0")
  // sembra un fallimento: va detto che è andata bene ed era già tutto a posto.
  const nulla = /nuovi 0 · aggiornati 0 · rimossi 0/.test(dettaglio);
  const trovati = dettaglio.match(/trovati (\d+)/)?.[1];

  const messaggio = fallita
    ? "non riuscita — vedi Impostazioni"
    : interrotta
      ? "interrotta a metà, riprende alla prossima"
      : nulla
        ? `già aggiornato${trovati ? `, ${trovati} documenti` : ""}`
        : dettaglio || "eseguita";

  const vecchia = ultima ? Date.now() - ultima.creatoIl.getTime() > 3 * 86_400_000 : false;
  const colore = fallita ? "var(--red)" : vecchia ? "var(--orange)" : undefined;

  return (
    <div className="sync-blocco">
      <form action={avviaSyncDrive}>
        <BottoneSyncAzione etichetta={etichetta} />
      </form>
      {ultima ? (
        <div className="sync-esito" style={colore ? { color: colore } : undefined} title={dettaglio}>
          {fallita ? "⚠ " : interrotta ? "◐ " : "✓ "}
          <b>{quando(ultima.creatoIl)}</b>
          {" · "}
          {formattaDataOra(ultima.creatoIl)}
          {" · "}
          <span style={{ color: "var(--text-tertiary)" }}>{messaggio}</span>
        </div>
      ) : (
        <div className="sync-esito" style={{ color: "var(--text-tertiary)" }}>
          Mai sincronizzato
        </div>
      )}
    </div>
  );
}
