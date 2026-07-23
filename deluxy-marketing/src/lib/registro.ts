import { prisma } from "./db";

// Storico globale: ogni scrittura dell'app lascia una voce in RegistroEvento
// (pagina /storico). Non deve mai bloccare l'operazione principale.
export function registra(voce: {
  autore: string;
  tipo: "creazione" | "modifica" | "stato" | "feedback" | "import" | "sync";
  entita: string;
  entitaId?: string | null;
  titolo: string;
  dettaglio?: string | null;
}) {
  return prisma.registroEvento
    .create({
      data: {
        autore: voce.autore,
        tipo: voce.tipo,
        entita: voce.entita,
        entitaId: voce.entitaId ?? null,
        titolo: voce.titolo,
        dettaglio: voce.dettaglio ?? null,
      },
    })
    .catch(() => {});
}
