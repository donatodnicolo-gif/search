import { prisma } from "./db";
import { risolviAnagrafica, contattoAmministrativo, type Anagrafica } from "./anagrafiche";

// Copia in locale i dati anagrafici che il registro **Anagrafiche** possiede.
//
// Perché serve, visto che il registro è la fonte di verità e la scheda li mostra
// già leggendoli da lì: perché non tutto passa dalla scheda. La ragione sociale
// è il BENEFICIARIO dei bonifici e delle richieste di pagamento, ed è il nome
// che finisce in banca; l'IBAN è quello su cui esce il denaro; l'email
// dell'amministrazione è dove arrivano solleciti e pro-forma. Quei punti del
// codice leggono il record locale, e con i campi vuoti ripiegano sull'insegna
// («GRUÈ» invece di «GRUE' S.R.L.»): un bonifico intestato all'insegna è un
// bonifico che la banca può rifiutare.
//
// Non è una seconda anagrafica: è una COPIA di servizio. Il registro resta
// l'unico posto dove i dati si modificano; qui si riallineano.

export type EsitoAllineamento = {
  partner: string;
  collegato: boolean;
  campi: string[]; // quali campi sono stati riempiti o corretti
};

/** Riallinea un singolo partner. Torna i campi cambiati (vuoto = era già a posto). */
export async function allineaPartnerDaRegistro(partnerId: string): Promise<EsitoAllineamento | null> {
  const p = await prisma.partner.findUnique({ where: { id: partnerId } });
  if (!p) return null;

  const a: Anagrafica | null = await risolviAnagrafica(p.nome, p.anagraficaId);
  if (!a) return { partner: p.nome, collegato: false, campi: [] };

  const fin = a.datiFinanziari;
  const amm = contattoAmministrativo(a);

  // Solo i campi che il registro conosce davvero: un valore vuoto lassù non
  // deve cancellare quello che qui è stato scritto a mano.
  const nuovi: Record<string, string | null> = {};
  const metti = (campo: string, valore: string | null | undefined, attuale: string | null) => {
    const v = valore?.trim() || null;
    if (v && v !== attuale) nuovi[campo] = v;
  };

  metti("ragioneSociale", a.ragioneSociale, p.ragioneSociale);
  metti("iban", fin?.iban, p.iban);
  metti("email", a.email, p.email);
  metti("telefono", a.telefono, p.telefono);
  metti("ammNome", fin?.amministrazioneNome ?? amm?.nome, p.ammNome);
  metti("ammEmail", fin?.amministrazioneEmail ?? amm?.email, p.ammEmail);
  metti("ammTelefono", fin?.amministrazioneTelefono ?? amm?.telefono, p.ammTelefono);

  // Il collegamento: se manca, lo si salva. È il motivo per cui la scheda a
  // volte trovava il record «per fortuna», cercandolo per nome a ogni apertura.
  const collegaId = !p.anagraficaId && a.id ? a.id : null;
  if (collegaId) nuovi.anagraficaId = collegaId;

  if (Object.keys(nuovi).length === 0) return { partner: p.nome, collegato: true, campi: [] };

  await prisma.partner.update({ where: { id: partnerId }, data: nuovi });
  return { partner: p.nome, collegato: true, campi: Object.keys(nuovi) };
}

/** Riallinea tutti i partner attivi.
 *
 *  A gruppi di 5, non uno alla volta: ogni partner è una chiamata al registro, e
 *  in fila indiana novanta chiamate non stanno nei 60 secondi che una funzione
 *  ha su Vercel — il bottone andrebbe in timeout lasciando il lavoro a metà,
 *  senza dire dove si è fermato. Cinque per volta bastano a stare nei tempi
 *  senza martellare l'altra app. */
const CONTEMPORANEE = 5;

export async function allineaTuttiDaRegistro(): Promise<EsitoAllineamento[]> {
  const partners = await prisma.partner.findMany({
    where: { attivo: true },
    select: { id: true },
    orderBy: { nome: "asc" },
  });
  const esiti: EsitoAllineamento[] = [];
  for (let i = 0; i < partners.length; i += CONTEMPORANEE) {
    const gruppo = partners.slice(i, i + CONTEMPORANEE);
    const risultati = await Promise.all(
      gruppo.map((p) => allineaPartnerDaRegistro(p.id).catch(() => null))
    );
    for (const r of risultati) if (r) esiti.push(r);
  }
  return esiti;
}
