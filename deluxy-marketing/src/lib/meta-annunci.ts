// Gli ANNUNCI di una campagna Meta, letti VIVI dalla Graph API — creatività
// comprese. Nessuna copia nel database (Standard §7): è una lente, non un
// archivio; si guarda quando si apre la scheda campagna.
//
// ⚠️ Le «bozze» di Ads Manager (le modifiche non ancora pubblicate) NON
// viaggiano nell'API: qui si vedono gli annunci REALI in ogni stato —
// compresi quelli IN PAUSA, che è come nascono i nostri. Un annuncio che in
// Ads Manager sta in "Bozza" (mai pubblicato) semplicemente non esiste
// ancora per l'API, e la pagina lo dice.

const VERSIONE = process.env.META_API_VERSION ?? "v21.0";
const BASE = `https://graph.facebook.com/${VERSIONE}`;

function token(): string | null {
  const t = process.env.META_ACCESS_TOKEN;
  return t && t.trim().length > 20 ? t.trim() : null;
}

export type AnnuncioMeta = {
  id: string;
  nome: string;
  stato: string;
  effettivo: string;
  gruppo: string | null;
  /** Miniatura della creatività (URL firmato Meta, scade: non salvarlo). */
  miniatura: string | null;
  formato: "immagine" | "video" | "carosello" | "catalogo" | "altro";
  testo: string | null;
  titolo: string | null;
  descrizione: string | null;
  /** Per il carosello: quante schede. */
  schede: number | null;
};

type CreativaGrezza = {
  id?: string;
  thumbnail_url?: string;
  product_set_id?: string;
  object_story_spec?: {
    link_data?: {
      message?: string; name?: string; description?: string;
      child_attachments?: unknown[];
    };
    video_data?: { message?: string; title?: string; link_description?: string };
    template_data?: { message?: string; name?: string };
  };
};

export async function annunciMeta(
  idCampagnaEsterno: string
): Promise<{ ok: true; annunci: AnnuncioMeta[] } | { ok: false; errore: string }> {
  const t = token();
  if (!t) return { ok: false, errore: "META_ACCESS_TOKEN non impostato" };
  const campi =
    "id,name,status,effective_status,adset{name}," +
    "creative{id,thumbnail_url,product_set_id,object_story_spec}";
  try {
    const r = await fetch(
      `${BASE}/${idCampagnaEsterno}/ads?fields=${encodeURIComponent(campi)}&thumbnail_width=320&thumbnail_height=320&limit=25&access_token=${encodeURIComponent(t)}`,
      { cache: "no-store", signal: AbortSignal.timeout(12_000) }
    );
    const dati = (await r.json()) as {
      data?: { id: string; name?: string; status?: string; effective_status?: string; adset?: { name?: string }; creative?: CreativaGrezza }[];
      error?: { message?: string };
    };
    if (dati.error) return { ok: false, errore: dati.error.message ?? "errore Meta" };
    const annunci: AnnuncioMeta[] = (dati.data ?? []).map((a) => {
      const oss = a.creative?.object_story_spec;
      const link = oss?.link_data;
      const video = oss?.video_data;
      const catalogo = a.creative?.product_set_id || oss?.template_data;
      const formato: AnnuncioMeta["formato"] = catalogo
        ? "catalogo"
        : link?.child_attachments && link.child_attachments.length > 0
          ? "carosello"
          : video
            ? "video"
            : link
              ? "immagine"
              : "altro";
      return {
        id: a.id,
        nome: a.name ?? a.id,
        stato: a.status ?? "?",
        effettivo: a.effective_status ?? "?",
        gruppo: a.adset?.name ?? null,
        miniatura: a.creative?.thumbnail_url ?? null,
        formato,
        testo: link?.message ?? video?.message ?? oss?.template_data?.message ?? null,
        titolo: link?.name ?? video?.title ?? oss?.template_data?.name ?? null,
        descrizione: link?.description ?? video?.link_description ?? null,
        schede: link?.child_attachments?.length ?? null,
      };
    });
    return { ok: true, annunci };
  } catch (e) {
    return { ok: false, errore: `lettura annunci fallita: ${String(e).slice(0, 160)}` };
  }
}

// ——— Gli INSIEMI DI PRODOTTI (product set) del catalogo del business ———
// Servono al formato «raccolta/catalogo»: l'annuncio pesca le immagini e i
// link dei prodotti da lì. Lettura viva, come sopra.

export type InsiemeProdotti = { id: string; nome: string; catalogo: string; prodotti: number | null };

export async function insiemiProdottoMeta(
  idAccount: string
): Promise<{ ok: true; insiemi: InsiemeProdotti[] } | { ok: false; errore: string }> {
  const t = token();
  if (!t) return { ok: false, errore: "META_ACCESS_TOKEN non impostato" };
  const conto = `act_${idAccount.replace(/^act_/, "")}`;
  try {
    const rConto = await fetch(`${BASE}/${conto}?fields=business&access_token=${encodeURIComponent(t)}`, {
      cache: "no-store", signal: AbortSignal.timeout(10_000),
    });
    const conto2 = (await rConto.json()) as { business?: { id: string }; error?: { message?: string } };
    if (conto2.error) return { ok: false, errore: conto2.error.message ?? "errore Meta sul conto" };
    if (!conto2.business?.id) return { ok: false, errore: "l'account non dichiara un Business (serve per i cataloghi)" };

    const rCataloghi = await fetch(
      `${BASE}/${conto2.business.id}/owned_product_catalogs?fields=id,name&limit=10&access_token=${encodeURIComponent(t)}`,
      { cache: "no-store", signal: AbortSignal.timeout(10_000) }
    );
    const cataloghi = (await rCataloghi.json()) as { data?: { id: string; name?: string }[]; error?: { message?: string } };
    if (cataloghi.error) return { ok: false, errore: cataloghi.error.message ?? "errore Meta sui cataloghi" };

    const insiemi: InsiemeProdotti[] = [];
    for (const cat of cataloghi.data ?? []) {
      const rSet = await fetch(
        `${BASE}/${cat.id}/product_sets?fields=id,name,product_count&limit=25&access_token=${encodeURIComponent(t)}`,
        { cache: "no-store", signal: AbortSignal.timeout(10_000) }
      );
      const set = (await rSet.json()) as { data?: { id: string; name?: string; product_count?: number }[]; error?: unknown };
      for (const s of set.data ?? []) {
        insiemi.push({ id: s.id, nome: s.name ?? s.id, catalogo: cat.name ?? cat.id, prodotti: s.product_count ?? null });
      }
    }
    return { ok: true, insiemi };
  } catch (e) {
    return { ok: false, errore: `lettura cataloghi fallita: ${String(e).slice(0, 160)}` };
  }
}
