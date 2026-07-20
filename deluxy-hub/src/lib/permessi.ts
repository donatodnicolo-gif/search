import { prisma } from "./db";
import { appPerIds, catalogoApp, type AppDeluxy } from "./apps";
import type { Sessione } from "./session";

// Cosa vede un utente nella home.
// - admin: tutto il catalogo (per definizione ha accesso a ogni app);
// - altri: solo le app il cui id è nella sua lista appAbilitate.
// La lista si legge dal database a ogni caricamento, così una modifica dei
// permessi da /utenti ha effetto subito, senza aspettare un nuovo login.
export async function appVisibili(sessione: Sessione): Promise<AppDeluxy[]> {
  if (sessione.ruolo === "admin") return catalogoApp();

  const utente = await prisma.utente.findUnique({
    where: { id: sessione.uid },
    select: { appAbilitate: true },
  });
  return appPerIds(utente?.appAbilitate ?? []);
}
