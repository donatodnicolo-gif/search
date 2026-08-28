import { Prisma } from "@prisma/client";
import { valutazioneD2C } from "./feedback-d2c";
import { CAMPI_FISCALI, INCLUDE_CAPOGRUPPO, leggiFatturazione } from "./fatturazione";

// La fatturazione è tornata SULL'AZIENDA (28/08/2026): i campi fiscali sono
// campi normali del Partner, quindi una scrittura è un semplice create/update.
export type DatiScrittura = Prisma.PartnerUncheckedCreateInput;
import { isLivello, isStato, isStatoFinanziario, isStatoFornitore, normalizzaStatoAnalisi } from "./stati";

// Campi scalari accettati in scrittura dalle API (POST/PATCH).
const CAMPI_TESTO = [
  "nome",
  "ragioneSociale",
  "categoria",
  "tipoProspect",
  // gli stati dell'azienda: commerciale (storico `stato`), livello del
  // contatto, finanziario, analisi, fornitore
  "stato",
  "livello",
  "statoFinanziario",
  "statoAnalisi",
  "statoFornitore",
  "citta",
  "provincia",
  "regione",
  "sede",
  "tipoLuogo",
  "indirizzo",
  "email",
  "telefono",
  "pIva",
  "codiceFiscale",
  "account",
  "note",
  "contattiRaw",
  "platformId",
  "fonte",
  // dati finanziari / fatturazione (condivisi tra le sedi della stessa insegna)
  "pec",
  "codiceSdi",
  "iban",
  "intestatarioConto",
  "banca",
  "metodoPagamento",
  "condizioniPagamento",
  "gruppoPagamento",
  "noteAmministrative",
  "amministrazioneNome",
  "amministrazioneTelefono",
  "amministrazioneEmail",
] as const;

export type ContattoInput = {
  ruolo?: string | null;
  nome?: string | null;
  telefono?: string | null;
  email?: string | null;
};

export type ErroreValidazione = { errore: string };

function pulisci(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

// Converte il body JSON in dati Prisma. Con `perCreazione` esige il nome.
export function validaPartner(
  body: Record<string, unknown>,
  perCreazione: boolean,
): { dati: DatiScrittura; contatti?: ContattoInput[] } | ErroreValidazione {
  // Simmetria lettura/scrittura: la risposta annida i campi finanziari sotto
  // `datiFinanziari`; accettiamo la stessa forma in ingresso (oltre a quella
  // piatta) sollevandone i campi al primo livello — così un'app può rispedire
  // esattamente ciò che ha letto.
  if (body.datiFinanziari && typeof body.datiFinanziari === "object") {
    const nidi = body.datiFinanziari as Record<string, unknown>;
    for (const campo of CAMPI_FISCALI) {
      if (campo in nidi && !(campo in body)) body = { ...body, [campo]: nidi[campo] };
    }
  }

  // `stato` è lo stato COMMERCIALE: `statoCommerciale` è il suo sinonimo
  // esplicito, per le app che scrivono le tre dimensioni con nomi simmetrici.
  if ("statoCommerciale" in body && !("stato" in body)) {
    body = { ...body, stato: body.statoCommerciale };
  }

  const dati: Record<string, unknown> = {};

  for (const campo of CAMPI_TESTO) {
    if (campo in body) dati[campo] = pulisci(body[campo]);
  }

  if (perCreazione && !dati.nome) return { errore: "Il campo 'nome' è obbligatorio" };
  if ("nome" in dati && dati.nome === null) return { errore: "Il campo 'nome' non può essere vuoto" };

  if (dati.categoria) dati.categoria = String(dati.categoria).toUpperCase();
  // Normalizzazioni finanziarie (stesse regole della UI)
  if (dati.iban) dati.iban = String(dati.iban).replace(/\s+/g, "").toUpperCase();
  if (dati.codiceSdi) dati.codiceSdi = String(dati.codiceSdi).toUpperCase();
  // ⚠️ COMPATIBILITÀ CON SCOUT (31/07/2026). «in_contatto», «in_attesa» e
  // «da_ricontattare» erano stati commerciali e Scout li manda ancora come
  // `stato`. Rifiutarli con un 400 vorrebbe dire rompere in silenzio l'app
  // commerciale: si accettano e si mettono dove vivono adesso, nel livello.
  //
  // ⚠️⚠️ Solo QUESTI TRE, mai `attivo`: `attivo` esiste in **entrambe** le liste
  // (stato = «è un cliente», livello = «il rapporto è vivo») e Scout manda
  // `stato: "attivo"` per dichiarare un cliente. Spostarlo nel livello
  // vorrebbe dire perdere l'unica scrittura che conta davvero.
  if (dati.stato && dati.stato !== "attivo" && isLivello(String(dati.stato))) {
    dati.livello = dati.stato;
    delete dati.stato;
  }
  if (dati.stato && !isStato(String(dati.stato))) {
    return { errore: `Stato non valido: '${dati.stato}'` };
  }
  if (dati.livello && !isLivello(String(dati.livello))) {
    return { errore: `Livello non valido: '${dati.livello}'` };
  }
  if (dati.statoFinanziario && !isStatoFinanziario(String(dati.statoFinanziario))) {
    return { errore: `Stato finanziario non valido: '${dati.statoFinanziario}'` };
  }
  if (dati.statoFornitore && !isStatoFornitore(String(dati.statoFornitore))) {
    return { errore: `Stato fornitore non valido: '${dati.statoFornitore}'` };
  }
  if (dati.statoAnalisi) {
    // FINANCE manda "P.P." / "Nuovo" / "Dismesso": si normalizza sullo slug
    const normalizzato = normalizzaStatoAnalisi(String(dati.statoAnalisi));
    if (!normalizzato) return { errore: `Stato analisi non valido: '${dati.statoAnalisi}'` };
    dati.statoAnalisi = normalizzato;
  }

  if ("ultimaVisita" in body) {
    const v = pulisci(body.ultimaVisita);
    if (v === null) {
      dati.ultimaVisita = null;
    } else {
      const data = new Date(v);
      if (isNaN(data.getTime())) return { errore: `Data 'ultimaVisita' non valida: '${v}'` };
      dati.ultimaVisita = data;
    }
  }

  if ("datiExtra" in body) {
    dati.datiExtra = body.datiExtra == null ? null : JSON.stringify(body.datiExtra);
  }

  if ("attivo" in body) dati.attivo = Boolean(body.attivo);

  if ("interessi" in body) {
    if (!Array.isArray(body.interessi)) return { errore: "'interessi' deve essere una lista" };
    // Le linee sono i nomi canonici del master Scout: si accettano così come
    // arrivano (Scout manda "Consegne", "Eventi & Catering", …), solo ripuliti
    // e deduplicati. Il catalogo vive in Scout, non qui.
    dati.interessi = [
      ...new Set((body.interessi as unknown[]).map((v) => String(v).trim()).filter(Boolean)),
    ];
  }

  let contatti: ContattoInput[] | undefined;
  if ("contatti" in body) {
    if (!Array.isArray(body.contatti)) return { errore: "'contatti' deve essere una lista" };
    contatti = (body.contatti as Record<string, unknown>[]).map((c) => ({
      ruolo: pulisci(c?.ruolo),
      nome: pulisci(c?.nome),
      telefono: pulisci(c?.telefono),
      email: pulisci(c?.email),
    }));
  }

  return { dati: dati as Prisma.PartnerUncheckedCreateInput, contatti };
}

type PartnerConContatti = Prisma.PartnerGetPayload<{
  include: { contatti: true; capogruppo: true };
}> & {
  riferimenti?: { sistema: string; idEsterno: string }[];
};

// Rappresentazione JSON esposta dalle API
// ⚠️ `vedeDatiFinanziari` PREDEFINITO A FALSO, di proposito: se una rotta nuova
// dimentica di passarlo, il difetto è che l'IBAN non si vede — non che si vede
// a chi non deve. Il guasto va nella direzione sicura.
export function serializzaPartner(
  p: PartnerConContatti,
  opzioni: { vedeDatiFinanziari?: boolean; vedePersone?: boolean } = {},
) {
  const fat = leggiFatturazione(p);
  const vede = opzioni.vedeDatiFinanziari === true;
  const vedePersone = opzioni.vedePersone === true;
  return {
    id: p.id,
    nome: p.nome,
    ragioneSociale: p.ragioneSociale,
    categoria: p.categoria,
    tipoProspect: p.tipoProspect,
    // Le tre dimensioni di stato dell'azienda. `stato` resta il nome storico
    // dello stato commerciale (compatibilità); `statoCommerciale` è l'alias
    // esplicito con cui leggerle simmetricamente.
    stato: p.stato,
    statoCommerciale: p.stato,
    // A che punto è il contatto dentro lo stato: in_contatto | in_attesa |
    // da_ricontattare. Vuoto = non indicato.
    livello: p.livello,
    statoFinanziario: p.statoFinanziario,
    statoAnalisi: p.statoAnalisi,
    // Il rapporto di fornitura: da_provare | abituale | da_evitare.
    // Vuoto = non è un nostro fornitore.
    statoFornitore: p.statoFornitore,
    citta: p.citta,
    provincia: p.provincia,
    regione: p.regione,
    // Nome di QUESTA sede dentro l'insegna (Montenapoleone, Flagship…).
    sede: p.sede,
    // sede | negozio | showroom | magazzino | altro
    tipoLuogo: p.tipoLuogo,
    indirizzo: p.indirizzo,
    email: p.email,
    telefono: p.telefono,
    // ⚠️ P.IVA, codice fiscale e fatturazione sono di CHI FATTURA questa azienda:
    // i suoi campi se «paga da sé», quelli della capogruppo se «paga la
    // capogruppo». La forma della risposta è quella di sempre, così nessuna app
    // cambia. ⚠️⚠️ Vuoto = «non lo sappiamo», non «zero».
    pIva: fat.pIva,
    codiceFiscale: fat.codiceFiscale,
    // Chi paga: da sé o la capogruppo. E il capogruppo a cui appartiene.
    pagaDaSe: fat.pagaDaSe,
    capogruppo: fat.capogruppo,
    // ⚠️ IBAN, intestatario del conto, PEC, SDI e contatto amministrativo escono
    // SOLO alle chiavi con l'ambito «Dati finanziari». Fino al 27/08/2026 li
    // vedeva qualsiasi chiave attiva: col registro usato anche per i FORNITORI
    // — cioè per chi paghiamo — è una superficie da frode, e camminando sulle
    // pagine si raccoglieva l'intero registro.
    //
    // ⚠️⚠️ Quando la chiave non ha l'ambito il blocco è `null`, non un oggetto
    // di campi vuoti: «non ti è permesso vederlo» e «non c'è» sono due risposte
    // diverse, e confonderle manda un'app a creare un dato che esiste già.
    datiFinanziari: !vede ? null : {
      pec: fat.pec,
      codiceSdi: fat.codiceSdi,
      iban: fat.iban,
      intestatarioConto: fat.intestatarioConto,
      banca: fat.banca,
      metodoPagamento: fat.metodoPagamento,
      condizioniPagamento: fat.condizioniPagamento,
      // Se valorizzato: paga la centrale indicata, non la singola sede.
      gruppoPagamento: fat.gruppoPagamento,
      noteAmministrative: fat.noteAmministrative,
      amministrazioneNome: fat.amministrazioneNome,
      amministrazioneTelefono: fat.amministrazioneTelefono,
      amministrazioneEmail: fat.amministrazioneEmail,
      // Chi li ha scritti e quando (asOf), così le app capiscono se il registro
      // ha una versione più fresca della loro.
      aggiornamenti: fat.aggiornamenti,
    },
    account: p.account,
    ultimaVisita: p.ultimaVisita,
    // Valutazione D2C: la media dei giudizi interni sulle consegne (1–5).
    // `voto: null` significa NESSUN feedback ("Da valutare"): non trattatelo
    // come zero. `affidabile: false` = troppo pochi feedback, è un'indicazione.
    // Si scrive solo con POST /api/v1/feedback: qui è di sola lettura.
    valutazioneD2C: valutazioneD2C(p),
    interessi: p.interessi,
    note: p.note,
    contattiRaw: p.contattiRaw,
    datiExtra: p.datiExtra ? JSON.parse(p.datiExtra) : null,
    // ⚠️ I referenti sono PERSONE FISICHE (nome, cellulare, email): escono solo
    // alle chiavi con l'ambito «Persone». Fino al 27/08/2026 li vedeva
    // qualunque chiave — e due app rigiravano la risposta INTERA al browser dei
    // loro utenti, quindi la rubrica arrivava a chiunque usasse quelle app.
    //
    // ⚠️⚠️ Senza l'ambito il campo è `null`, non `[]`: «non ti è permesso» e
    // «non ne ha» sono due risposte diverse, e scambiarle manda un'app a
    // ricreare referenti che esistono già.
    contatti: !vedePersone
      ? null
      : p.contatti.map((c) => ({
          id: c.id,
          ruolo: c.ruolo,
          nome: c.nome,
          telefono: c.telefono,
          email: c.email,
        })),
    // Quanti ne ha, comunque: sapere che una scheda HA dei referenti non è un
    // dato personale, e senza questo un'app crederebbe l'anagrafica vuota.
    numeroContatti: p.contatti.length,
    platformId: p.platformId,
    hubspotId: p.hubspotId,
    // Riferimenti esterni per il join cross-app (sistema → id di quell'app)
    riferimenti: (p.riferimenti ?? []).map((r) => ({ sistema: r.sistema, idEsterno: r.idEsterno })),
    fonte: p.fonte,
    attivo: p.attivo,
    creatoIl: p.creatoIl,
    aggiornatoIl: p.aggiornatoIl,
  };
}
