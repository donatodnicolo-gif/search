import { prisma } from "./db";

/**
 * **Chi è rimasto indietro rispetto alla sua regola.**
 *
 * Cambiando i passi di una regola salvata, le collezioni che la usano non
 * vengono rifatte di nascosto: rimescolare vetrine che nessuno stava guardando
 * sarebbe peggio del problema che risolve. Ma allora serve **vedere** quali
 * hanno ancora l'ordine calcolato con la regola vecchia, altrimenti «Riapplica
 * ovunque» si preme alla cieca e non si sa nemmeno se serviva.
 *
 * Il confronto è fra `RegolaOrdine.aggiornataIl` (quando la regola è stata
 * toccata l'ultima volta) e `CollezioneShopify.ordineModificatoIl` (quando
 * l'ordine di quella collezione è stato scritto). Se la regola è più recente,
 * quella collezione sta mostrando una fila decisa da una regola che non esiste
 * più.
 *
 * Una collezione **senza** `ordineModificatoIl` non è «in ritardo»: è una a cui
 * la regola non è mai stata applicata, e dirle «aggiornala» sarebbe un invito a
 * rifare qualcosa che non è mai stato fatto. Conta lo stesso come da applicare,
 * ma il messaggio è diverso.
 */
export async function collezioniInRitardo(regolaOrdineId: string): Promise<string[]> {
  const [regola, colls] = await Promise.all([
    prisma.regolaOrdine.findUnique({ where: { id: regolaOrdineId }, select: { aggiornataIl: true } }),
    prisma.collezioneShopify.findMany({
      where: { regolaOrdineId },
      select: { id: true, ordineModificatoIl: true },
    }),
  ]);
  if (!regola) return [];
  return colls
    .filter((c) => c.ordineModificatoIl == null || c.ordineModificatoIl < regola.aggiornataIl)
    .map((c) => c.id);
}

/**
 * Lo stesso conto per **tutte** le regole in un colpo, per l'elenco: id regola →
 * quante sue collezioni sono indietro. Una query invece di una per riga.
 */
export async function ritardiPerRegola(): Promise<Map<string, number>> {
  const [regole, colls] = await Promise.all([
    prisma.regolaOrdine.findMany({ select: { id: true, aggiornataIl: true } }),
    prisma.collezioneShopify.findMany({
      where: { regolaOrdineId: { not: null } },
      select: { regolaOrdineId: true, ordineModificatoIl: true },
    }),
  ]);
  const quando = new Map(regole.map((r) => [r.id, r.aggiornataIl]));
  const fuori = new Map<string, number>();
  for (const c of colls) {
    const agg = quando.get(c.regolaOrdineId as string);
    if (!agg) continue;
    if (c.ordineModificatoIl == null || c.ordineModificatoIl < agg) {
      fuori.set(c.regolaOrdineId as string, (fuori.get(c.regolaOrdineId as string) ?? 0) + 1);
    }
  }
  return fuori;
}
