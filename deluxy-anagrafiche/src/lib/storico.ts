import { prisma } from "./db";

// Valore speciale di da/a per gli eventi di archiviazione e ripristino
export const ARCHIVIATA = "archiviata";

// Registra un passaggio di stato nello storico. Non registra i "non passaggi"
// (da === a). origine: "ui" oppure il nome della chiave API che ha scritto.
export async function registraPassaggio(
  partnerId: string,
  da: string,
  a: string,
  origine: string,
) {
  if (da === a) return;
  await prisma.passaggioStato.create({ data: { partnerId, da, a, origine } });
}
