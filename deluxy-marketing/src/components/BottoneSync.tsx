import { avviaSyncDrive } from "@/lib/azioni";
import { prisma } from "@/lib/db";
import { formattaDataOra } from "@/lib/dominio";

// Bottone "Sincronizza": rilegge la cartella Drive e aggiorna l'indice.
// Sotto al bottone resta scritto com'è andata l'ultima volta: senza esito
// visibile non si capisce se il click ha fatto qualcosa.
export async function BottoneSync({ etichetta = "Sincronizza" }: { etichetta?: string }) {
  const ultima = await prisma.registroEvento
    .findFirst({ where: { entita: "drive", tipo: "sync" }, orderBy: { creatoIl: "desc" } })
    .catch(() => null);
  const fallita = ultima?.dettaglio?.toLowerCase().includes("non raggiungibile");

  return (
    <div className="sync-blocco">
      <form action={avviaSyncDrive}>
        <button
          className="btn btn-secondario"
          type="submit"
          title="Rilegge la cartella Drive ADV DELUXY SRL e aggiorna l'indice dei documenti"
        >
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 11.5A8 8 0 0 0 6.3 6.3L4 8.5" />
            <path d="M4 4v4.5h4.5" />
            <path d="M4 12.5a8 8 0 0 0 13.7 5.2L20 15.5" />
            <path d="M20 20v-4.5h-4.5" />
          </svg>
          {etichetta}
        </button>
      </form>
      {ultima && (
        <div className="sync-esito" style={fallita ? { color: "var(--red)" } : undefined}>
          {fallita ? "⚠ " : "✓ "}
          {ultima.dettaglio ?? "eseguita"}
          <br />
          <span style={{ color: "var(--text-tertiary)" }}>{formattaDataOra(ultima.creatoIl)}</span>
        </div>
      )}
    </div>
  );
}
