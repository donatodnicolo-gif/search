import { cookies } from "next/headers";
import { leggiSessione, type DatiSessione } from "./sessione";
import { SESSION_COOKIE } from "./auth";

// CHI STA GUARDANDO, in un posto solo.
//
// ⚠️ Nasce da un buco vero (27/08/2026): le pagine delle proposte non leggevano
// **mai** la sessione. Il middleware lasciava passare il profilo `proposte` su
// tutto il prefisso `/proposte`, e da lì si vedevano le proposte di **tutti**,
// il budget pubblicato di ogni maison e i ricavi reali dell'azienda. Il
// permesso c'era; la nozione di «mio» no.
//
// ⭐ Il middleware dice **dove** puoi entrare. Solo la pagina sa **cosa** puoi
// vedere lì dentro: un elenco filtrato è una decisione che il middleware non
// può prendere, perché non conosce le righe.
//
// ⚠️ Sessione assente = si è entrati con la **password di team**, che ha pieni
// poteri per scelta dichiarata: vale admin. Non è una svista, è la via di
// riserva descritta nel README — e va trattata come tale in un posto solo,
// invece che ricordarsene in ogni pagina.
export type ChiGuarda = {
  sessione: DatiSessione | null;
  /** Pieni poteri: admin col proprio account, o password di team. */
  admin: boolean;
  /** Vede e manda solo le proprie proposte. */
  soloLeSue: boolean;
  uid: string | null;
  nome: string | null;
};

export async function chiGuarda(): Promise<ChiGuarda> {
  const jar = await cookies();
  const sessione = await leggiSessione(jar.get(SESSION_COOKIE)?.value);
  const admin = !sessione || sessione.ruolo === "admin";
  return {
    sessione,
    admin,
    soloLeSue: !!sessione && sessione.ruolo === "proposte",
    uid: sessione?.uid ?? null,
    nome: sessione?.nome ?? null,
  };
}

/**
 * Una proposta è **sua** se l'ha mandata lei.
 *
 * ⚠️ Il confronto è sull'**uid** della sessione, non sul nome: il nome si
 * scrive, l'uid no. Le proposte scritte prima che questo campo esistesse hanno
 * `inviataDaUid` nullo e quindi non sono di nessuno: per un non-admin restano
 * invisibili, che è il verso giusto in cui sbagliare.
 */
export function eSua(p: { inviataDaUid: string | null }, chi: ChiGuarda): boolean {
  return !!chi.uid && p.inviataDaUid === chi.uid;
}
