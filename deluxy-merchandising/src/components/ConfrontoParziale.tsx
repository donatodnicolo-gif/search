import { dataIt } from "@/lib/fuso";
import type { ConfrontoParziale as Dati } from "@/lib/vendite";
import type { Finestra } from "@/lib/vendite";

// **L'avviso che disinnesca il «+2295%».**
//
// Ogni confronto di quest'app si misura contro il periodo immediatamente
// precedente. Su «ultimo anno» quel periodo arriva a due anni fa, mentre il
// venduto in archivio comincia dall'estate 2025: il «prima» è quasi vuoto e la
// percentuale che ne esce sembra una crescita da record. È l'errore più caro
// che questa pagina possa far fare, perché il numero è **grande, in cima e
// aritmeticamente giusto** — e quindi nessuno lo mette in dubbio.
//
// Sta **accanto al numero**, in tutte e tre le pagine che lo mostrano (il
// cruscotto, /vendite e la scomposizione): un avviso in fondo alla pagina
// arriva dopo che la cifra è già stata letta e raccontata a qualcuno.
export function AvvisoConfrontoParziale({
  parziale,
  finestra,
}: {
  parziale: Dati | null;
  finestra: Finestra;
}) {
  if (!parziale) return null;
  return (
    <div className="avviso avviso-attenzione">
      <strong>Il confronto è parziale.</strong> Il periodo precedente comincia il{" "}
      {dataIt(finestra.dalPrec)}, ma il venduto in archivio parte dal{" "}
      {dataIt(parziale.primaVendita)}: dei {finestra.giorni} giorni del «prima» ne mancano{" "}
      <strong>{parziale.giorniSenzaDati}</strong>. Le variazioni percentuali restano
      sottrazioni esatte fra i due periodi, ma <strong>non sono una crescita</strong>: in
      buona parte sono archivio che non c'era. Su una finestra più corta il confronto
      torna pieno.
    </div>
  );
}
